// 生成全套 Android 图标（满月 0.5）：mipmap 传统 + 自适应前景/背景层 + 圆形 + 启动图
// 依赖：icon-render.html 由 3099 服务，Edge headless CDP 9222
import { writeFileSync } from 'node:fs';
const CDP = 'http://127.0.0.1:9222';
const RES = 'e:/Web/nox/android/app/src/main/res';
let targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(r => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');

// 渲染并取回图像（透明背景通过 toDataURL 天然保留；jpg=1 输出 JPEG 0.85，启动图用）
async function render({ w, h, moon, phase = 0.5, stars = 1, glow = 1, bg = 1, sd, round, up, jpg }) {
  const p = new URLSearchParams({ w, h, moon, phase, stars, glow, bg });
  if (sd) p.set('sd', sd);
  if (round) p.set('round', 1);
  if (up) p.set('up', up);
  const url = `http://localhost:3099/icon-render.html?${p}`;
  await send('Page.navigate', { url });
  // 等月面渲染完成（轮询 ready 标记，最长 6s）
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    const r = await send('Runtime.evaluate', { expression: `!!window.__iconReady`, returnByValue: true });
    if (r.result?.result?.value) break;
  }
  const mime = jpg ? 'image/jpeg' : 'image/png';
  const r = await send('Runtime.evaluate', { expression: `document.getElementById('c').toDataURL('${mime}'${jpg ? ', 0.85' : ''})`, returnByValue: true });
  const v = r.result?.result?.value;
  if (typeof v !== 'string' || !v.startsWith('data:image/jpeg') && !v.startsWith('data:image/png')) throw new Error('toDataURL failed for ' + url);
  return Buffer.from(v.split(',')[1], 'base64');
}
function save(rel, buf) {
  writeFileSync(`${RES}/${rel}`, buf);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  console.log(`OK ${rel} ${w}x${h} ${(buf.length / 1024).toFixed(1)}KB`);
}

const PHASE = 0.5; // 满月（用户选定）

// 1) 传统 mipmap 图标（含背景+星空+月面，全幅）+ 圆形版
for (const [d, S] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  const buf = await render({ w: S, h: S, moon: Math.round(S * 0.72), phase: PHASE });
  save(`mipmap-${d}/ic_launcher.png`, buf);
  save(`mipmap-${d}/ic_launcher_round.png`, await render({ w: S, h: S, moon: Math.round(S * 0.72), phase: PHASE, round: 1 }));
}

// 2) 自适应图标：背景层（渐变+星空，无月面）+ 前景层（透明底+月面，安全区 66/108）
for (const [d, S] of [['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432]]) {
  save(`mipmap-${d}/ic_launcher_background.png`, await render({ w: S, h: S, moon: 0, stars: 1, glow: 0, sd: 1200 }));
  save(`mipmap-${d}/ic_launcher_foreground.png`, await render({ w: S, h: S, moon: Math.round(S * 0.58), phase: PHASE, stars: 0, bg: 0 }));
}

// 3) 启动图：渐变+星空+居中满月（port/land 全密度 + 基础 480x320）
// JPEG 0.85（暗色渐变+星点无可见伪影，体积仅为 PNG 1/10）；仅 Android 8-11 冷启动展示 <1s
save(`drawable/splash.jpg`, await render({ w: 480, h: 320, moon: 166, phase: PHASE, jpg: 1 }));
const port = [['mdpi', 320, 480], ['hdpi', 480, 800], ['xhdpi', 720, 1280], ['xxhdpi', 960, 1600], ['xxxhdpi', 1280, 1920]];
for (const [d, w, h] of port) {
  save(`drawable-port-${d}/splash.jpg`, await render({ w, h, moon: Math.round(Math.min(w, h) * 0.52), phase: PHASE, jpg: 1 }));
  save(`drawable-land-${d}/splash.jpg`, await render({ w: h, h: w, moon: Math.round(Math.min(w, h) * 0.52), phase: PHASE, jpg: 1 }));
}

ws.close();
process.exit(0);
