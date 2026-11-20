// Day-Day 今夜星空独立页：真实星图渲染断言（星点数量、连线、滑杆、分享卡、无 console 错误）
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
function log(ok, msg) { results.push(ok === true); console.log(`${ok === true ? 'PASS' : 'FAIL'} ${msg}`); }
async function assert(desc, expression, timeout = 8000) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) {
    try { last = await ev(expression); if (last === true) { log(true, desc); return; } } catch (e) { last = 'ERR:' + e.message; }
    await sleep(150);
  }
  log(false, `${desc}  →  ${JSON.stringify(last)}`);
}
async function shot(name) {
  mkdirSync(OUT, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}${name}`, Buffer.from(r.result.data, 'base64'));
  console.log(`SHOT ${name}`);
}

await send('Page.enable');
await send('Runtime.enable');
// 模拟真机 dpr=2：分享卡月亮回归的关键环境
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 2, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nox_token','unlocked');` });
await send('Page.navigate', { url: APP + '/?probe=' + Date.now() });
await sleep(1600);
{
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try { if (await ev(`!!window.goPanel`)) break; } catch (e) {}
    await sleep(300);
  }
}
await ev(`(() => { const o = document.getElementById('onboardOverlay'); if (o && o.classList.contains('open')) o.classList.remove('open'); const t = document.getElementById('tourOverlay'); if (t) t.style.display = 'none'; return true; })()`);

// 1. 今夜星空独立页渲染
await ev(`goPanel('sky')`);
await sleep(3000);
await assert('星空页 canvas 已渲染且有尺寸', `(() => { const c = document.getElementById('skyPageCanvas'); return c.width > 400 && c.height > 400; })()`);
await assert('星空图已转成 <img> 显示（真机 canvas 直显空白根因）', `(() => { const i = document.getElementById('skyPageImg'); return i && i.src.startsWith('data:image/png') && i.naturalWidth > 400; })()`, 15000);
await assert('可见恒星 > 300 颗', `window.state && state.skyStats && state.skyStats.starsDrawn > 300`, 15000);
await assert('星座连线 > 100 条', `window.state && state.skyStats && state.skyStats.linesDrawn > 100`);
await assert('图例含恒星计数', `document.getElementById('skyPageLegend').textContent.includes('恒星')`);
await assert('位置含城市', `document.getElementById('skyPageLoc').textContent.includes('北京')`);
await shot('sky-page-home.png');

// 2. 时间滑杆重渲染
await ev(`(() => { const s = document.getElementById('skyPageTime'); s.value = 9; s.dispatchEvent(new Event('input')); })()`);
await sleep(1800);
await assert('滑杆到 05:00 后时间标签更新', `document.getElementById('skyPageTimeLabel').textContent === '05:00'`);
await assert('滑杆后重渲染成功（星数>300）', `window.state.skyStats && window.state.skyStats.starsDrawn > 300`);
await shot('sky-page-0500.png');
await ev(`(() => { const s = document.getElementById('skyPageTime'); s.value = 3; s.dispatchEvent(new Event('input')); })()`);
await sleep(1500);

// 3. 分享卡片（真实星图 + 月亮居中回归：dpr=2 下不放大裁切）
await ev(`document.getElementById('btnShareCard').click()`);
await assert('分享卡弹层打开', `document.getElementById('shareCardOverlay').classList.contains('open')`, 15000);
await assert('分享卡预览已生成（blob 或 data URL）', `(() => { const i = document.getElementById('shareCardImg'); return !!i.src && (i.src.startsWith('blob:') || i.src.startsWith('data:image/png')); })()`, 15000);
const sharePx = await ev(`(async () => {
  const c = window.state.shareCardCanvas;
  if (!c) return { err: 'no-canvas' };
  const W = c.width;
  const x = c.getContext('2d');
  const d = x.getImageData(0, 0, W, c.height).data;
  const moon = (px0, px1, py0, py1) => {
    let n = 0;
    for (let py = py0; py < py1; py += 4)
      for (let px = px0; px < px1; px += 4) {
        const k = (py * W + px) * 4;
        const r = d[k], g = d[k+1], b = d[k+2];
        if (r > 120 && Math.abs(r - g) < 18 && Math.abs(g - b) < 18) n++;
      }
    return n;
  };
  // 月亮绘制框为逻辑 (90,98,260,260) × scale2 → 物理 x180..700 y196..716
  const inBox = moon(180, 700, 196, 716);
  // dpr 回归判别：旧 bug 下月亮按 520 逻辑尺寸绘制，溢出左右边界
  const rightOver = moon(720, 960, 196, 716);
  const leftOver = moon(0, 176, 196, 716);
  return { inBox, rightOver, leftOver };
})()`);
log(!sharePx.err && sharePx.inBox > 1500, `分享卡月亮在绘制框内（dpr=2 回归） → ${JSON.stringify(sharePx)}`);
log(!sharePx.err && sharePx.rightOver < 50 && sharePx.leftOver < 50, `月亮未溢出框界（旧 bug 会左右溢出） → ${JSON.stringify(sharePx)}`);
await shot('share-card-real.png');
await ev(`document.getElementById('shareCardClose').click()`);

// 4. 无 JS 异常
await sleep(600);
log(consoleErrors.length === 0, `无 JS 异常${consoleErrors.length ? ' → ' + consoleErrors.slice(0, 3).join(' | ') : ''}`);

const fails = results.filter(r => !r).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
if (consoleErrors.length) console.log('console errors:', consoleErrors.join(' | '));
process.exit(fails ? 1 : 0);
