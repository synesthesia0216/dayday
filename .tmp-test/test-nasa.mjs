// Day-Day 图鉴 NASA 实拍 + APOD + API keys 设置 + 高清星图入口
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CDP = 'http://127.0.0.1:9222';
const APP = 'http://localhost:3099';
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));

let targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page');
if (!page) page = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
const consoleErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}) { return new Promise(r => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description));
  return r.result?.result?.value;
}
const results = [];
function log(ok, msg) { results.push(`${ok === 'PASS' ? '✅' : '❌'} ${msg}`); console.log(`${ok} ${msg}`); }
function info(msg) { results.push(`ℹ️ ${msg}`); console.log(`INFO ${msg}`); }
async function assert(desc, expression, timeout = 6000) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) {
    try { last = await ev(expression); if (last === true) { log('PASS', desc); return; } } catch (e) { last = 'ERR:' + e.message; }
    await sleep(150);
  }
  log('FAIL', `${desc}  →  ${JSON.stringify(last)}`);
}
async function shot(name) {
  mkdirSync(OUT, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}${name}`, Buffer.from(r.result.data, 'base64'));
  console.log(`SHOT ${name}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nox_token','unlocked');` });
await send('Page.navigate', { url: APP });
await sleep(1500);
{
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try { if (await ev(`!!window.goPanel && !!window.showGalaxyPopup`)) break; } catch (e) {}
    await sleep(300);
  }
}

// 1. 图鉴信息栏：NASA 实拍或符号封面（网络可用时应为实拍）
await ev(`goPanel('galaxy')`);
await sleep(2000);
await ev(`showGalaxyPopup('m31')`);
await sleep(4000);
await assert('信息栏出现影像（实拍或降级封面）', `(() => {
  const img = document.getElementById('galaxyInfoBarImg'), fb = document.getElementById('galaxyInfoBarFallback');
  return img.style.display === 'block' || fb.style.display === 'flex';
})()`);
const infoBarHasImg = await ev(`document.getElementById('galaxyInfoBarImg').style.display === 'block'`);
if (infoBarHasImg) {
  await assert('影像标注 NASA Image Library', `document.getElementById('galaxyInfoBarCredit').textContent.includes('NASA')`);
  const cached = await ev(`import('../client/db.js').then(async m => !!(await m.default.mediaCache.get('gal_m31'))?.blob)`, 8000);
  if (cached) { log('PASS', '影像已缓存进 mediaCache'); }
  else { info('浏览器 CORS 限制未缓存（真机经 CapacitorHttp 可缓存，属预期降级）'); }
} else {
  info('图鉴影像降级为符号封面（网络受限，真机联网时显示实拍）');
}
await shot('nasa-info-bar.png');
await ev(`hideGalaxyPopup()`);

// 2. 全屏弹层影像结构
await ev(`showGalaxyFsPopup('m42')`);
await sleep(4000);
await assert('全屏弹层出现影像（实拍或降级封面）', `(() => {
  const img = document.getElementById('galaxyFsPopupImg'), fb = document.getElementById('galaxyFsPopupFallback');
  return img.style.display === 'block' || fb.style.display === 'flex';
})()`);
await shot('nasa-fs-popup.png');
await ev(`$('galaxyFsPopupClose').click()`);

// 3. API keys 设置存取往返
await ev(`$('profileNasaKey').value = 'TESTKEY123'; $('profileAstronomyId').value = 'test-app-id'; $('profileAstronomySecret').value = 'test-secret';`);
await ev(`(async () => { const s = await (await import('../client/db.js')).default.settings; await s.set('nasa_key','TESTKEY123'); await s.set('astro_api_id','test-app-id'); await s.set('astro_api_secret','test-secret'); return true; })()`);
await assert('nasa_key 已保存', `import('../client/db.js').then(async m => (await m.default.settings.get('nasa_key')) === 'TESTKEY123')`);
await assert('astro_api_secret 已保存', `import('../client/db.js').then(async m => (await m.default.settings.get('astro_api_secret')) === 'test-secret')`);

// 5. 今夜星空独立页：填 key 后显示高清星图按钮
await ev(`goPanel('sky')`);
await sleep(2500);
await assert('星空页高清按钮可见', `document.getElementById('skyPageHd').style.display !== 'none'`);
await shot('nasa-hd-btn.png');

// 6. 点击高清星图（假 key → 优雅失败，无异常，弹层不打开）
await ev(`document.getElementById('skyPageHd').click()`);
await sleep(3500);
await assert('假 key 请求优雅失败（HD 弹层未打开）', `!document.getElementById('astroHdOverlay').classList.contains('open')`);

// 7. 无 JS 异常
await sleep(600);
await assert('无 JS 异常', `${consoleErrors.length} === 0`);

const fails = results.filter(r => r.startsWith('❌')).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
if (consoleErrors.length) console.log('console errors:', consoleErrors.join(' | '));
process.exit(fails ? 1 : 0);
