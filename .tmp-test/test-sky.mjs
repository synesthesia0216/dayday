// Day-Day 今夜星空：真实星图渲染断言（星点数量、连线、首页小卡+全屏弹层+滑杆、分享卡、无 console 错误）
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
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(r => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description));
  return r.result?.result?.value;
}
const results = [];
function log(ok, msg) { results.push(`${ok === 'PASS' ? '✅' : '❌'} ${msg}`); console.log(`${ok} ${msg}`); }
async function assert(desc, expression, timeout = 4000) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) {
    try { last = await ev(expression); if (last === true) { log('PASS', desc); return; } } catch (e) { last = 'ERR:' + e.message; }
    await sleep(120);
  }
  log('FAIL', `${desc}  →  ${JSON.stringify(last)}`);
}
async function shot(name) {
  mkdirSync(OUT, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}${name}`, Buffer.from(r.result.data, 'base64'));
  console.log(`SHOT ${name}`);
}

const consoleErrors = [];
await send('Page.enable');
await send('Runtime.enable');
await send('Runtime.consoleAPICalled'); // noop guard
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nox_token','unlocked');` });
await send('Page.navigate', { url: APP });
await sleep(1500);
{
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try { if (await ev(`!!window.goPanel`)) break; } catch (e) {}
    await sleep(300);
  }
}
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
await send('Log.enable');

// 1. 首页今夜星空卡渲染（观星台默认页）
await sleep(3000);
await assert('首页星空卡 canvas 已渲染且有尺寸', `(() => { const c = document.getElementById('skyCardCanvas'); return c.width > 100 && c.height > 100; })()`);
await assert('可见恒星 > 300 颗', `window.state && state.skyStats && state.skyStats.starsDrawn > 300`, 10000);
await assert('星座连线 > 100 条', `window.state && state.skyStats && state.skyStats.linesDrawn > 100`);
await assert('卡片副标题含城市与时刻', `/北京 · \\d{2}:00/.test(document.getElementById('skyCardSub').textContent)`);
await shot('sky-card-home.png');

// 2. 点卡片 → 全屏星空弹层 + 时间滑杆
await ev(`document.getElementById('skyCard').click()`);
await sleep(2500);
await assert('全屏星空弹层打开', `document.getElementById('skyFsOverlay').classList.contains('open')`);
await assert('弹层 canvas 已渲染且有尺寸', `(() => { const c = document.getElementById('skyFsCanvas'); return c.width > 100 && c.height > 100; })()`);
await assert('弹层星数 > 300', `window.state && state.skyFsStats && state.skyFsStats.starsDrawn > 300`);
await assert('弹层图例文本就绪', `document.getElementById('skyFsLegend').textContent.includes('恒星')`);
await assert('弹层位置含城市', `document.getElementById('skyFsLoc').textContent.includes('北京')`);
await shot('sky-fs.png');

await ev(`(() => { const s = document.getElementById('skyFsTime'); s.value = 9; s.dispatchEvent(new Event('input')); })()`);
await sleep(1500);
await assert('滑杆到 05:00 后时间标签更新', `document.getElementById('skyFsTimeLabel').textContent === '05:00'`);
await assert('滑杆后重渲染成功（星数>300）', `window.state.skyFsStats && window.state.skyFsStats.starsDrawn > 300`);
await ev(`(() => { const s = document.getElementById('skyFsTime'); s.value = 3; s.dispatchEvent(new Event('input')); })()`);
await sleep(1200);
await shot('sky-fs-2300.png');
await ev(`document.getElementById('skyFsClose').click()`);
await sleep(400);

// 3. 分享卡片（真实星图替换随机星点）
await ev(`document.getElementById('btnShareCard').click()`);
await assert('分享卡弹层打开', `document.getElementById('shareCardOverlay').classList.contains('open')`, 12000);
await assert('分享卡图片已生成', `(() => { const i = document.getElementById('shareCardImg'); return i.src.startsWith('data:image/png') && i.naturalWidth === 880; })()`, 12000);
await shot('share-card-real.png');
await ev(`document.getElementById('shareCardClose').click()`);

// 4. 无 JS 异常
await sleep(600);
await assert('无 JS 异常', `${consoleErrors.length} === 0`);

const fails = results.filter(r => r.startsWith('❌')).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
if (consoleErrors.length) console.log('console errors:', consoleErrors.join(' | '));
process.exit(fails ? 1 : 0);
