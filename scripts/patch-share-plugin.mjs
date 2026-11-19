// Android 14+ 兼容补丁：@capacitor/share 5.0.8 的 SharePlugin.load() 里
// registerReceiver 未带导出标志，targetSdk 34 + Android 14/15 启动即抛
// SecurityException 闪退（Capacitor 6 才官方修复）。npm install 会还原
// node_modules，因此 cap:build 前必须重打此补丁（幂等）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const p = fileURLToPath(new URL('../node_modules/@capacitor/share/android/src/main/java/com/capacitorjs/plugins/share/SharePlugin.java', import.meta.url));
let src = readFileSync(p, 'utf8');

if (src.includes('ContextCompat.RECEIVER_EXPORTED')) {
  console.log('[patch-share] already patched');
  process.exit(0);
}

if (!src.includes('import androidx.core.content.ContextCompat;')) {
  src = src.replace(
    'import androidx.core.content.FileProvider;',
    'import androidx.core.content.ContextCompat;\nimport androidx.core.content.FileProvider;'
  );
}

const old = 'getActivity().registerReceiver(broadcastReceiver, new IntentFilter(Intent.EXTRA_CHOSEN_COMPONENT));';
const neu = `ContextCompat.registerReceiver(
            getActivity(),
            broadcastReceiver,
            new IntentFilter(Intent.EXTRA_CHOSEN_COMPONENT),
            ContextCompat.RECEIVER_EXPORTED
        );`;
if (!src.includes(old)) {
  console.error('[patch-share] target line not found (plugin version changed?), manual review needed');
  process.exit(1);
}
src = src.replace(old, neu);
writeFileSync(p, src);
console.log('[patch-share] patched');
