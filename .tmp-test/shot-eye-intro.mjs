// 开屏动画关键帧截图：眼睛环视 → 化月 → DAY-DAY 文字 → 登录屏
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const CDP = 'http://127.0.0.1:9222';
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));
let targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(r => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://localhost:3099/?setup=shot' });
await sleep(1500);
await send('Runtime.evaluate', { expression: `localStorage.removeItem('nox_token')` });
await send('Page.navigate', { url: 'http://localhost:3099/?shot=1' });
await sleep(600); // 页面加载 + 脚本执行

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}${name}`, Buffer.from(r.result.data, 'base64'));
  console.log('SHOT ' + name);
}
// 加载后即开始计时：动画 0s 起
await sleep(350);  await shot('eye-1-orbit.png');   // 眼睛环视中
await sleep(700);  await shot('eye-2-orbit.png');   // 第二圈环视
await sleep(1350); await shot('eye-3-morph.png');   // t≈2.4s 化月瞬间
await sleep(800);  await shot('eye-4-moon.png');    // t≈3.2s 月面+DAY-DAY 文字
await sleep(1300); await shot('eye-5-login.png');   // t≈4.5s 淡出后登录屏
ws.close();
process.exit(0);
