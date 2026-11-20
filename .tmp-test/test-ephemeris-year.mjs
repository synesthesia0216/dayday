// 月度星历：统计卡渲染 + 星卡分享图
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
async function assert(desc, expression, timeout = 6000) {
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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nox_token','unlocked');` });
await send('Page.navigate', { url: APP + '/?probe=' + Date.now() });
await sleep(1600);
{
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try { if (await ev(`!!buildMonthAlmanac && !!planets`)) break; } catch (e) {}
    await sleep(300);
  }
}
await ev(`(() => { const o = document.getElementById('onboardOverlay'); if (o && o.classList.contains('open')) o.classList.remove('open'); const t = document.getElementById('tourOverlay'); if (t) t.style.display = 'none'; return true; })()`);

// 1. 数据层：月度统计合理
const data = await ev(`(() => {
  const now = new Date();
  const a = buildMonthAlmanac();
  const b = buildMonthAlmanac();
  return {
    year: a.year, month: a.month,
    moons: a.moons.length, showers: a.showers.length,
    eclipses: a.eclipses.length, conj: a.conj.length,
    cached: a === b,
    expected: now.getFullYear() * 12 + now.getMonth(),
    moonDates: a.moons.map(d => d.toISOString().slice(0, 10)),
  };
})()`);
log(data.year === new Date().getFullYear(), `年份正确 → ${data.year}`);
log(data.month >= 1 && data.month <= 12, `月份正确 → ${data.month} 月`);
log(data.cached && data.expected === data.year * 12 + data.month - 1, '月度数据按「年×12+月」缓存');
log(data.moons >= 0 && data.moons <= 2, `本月满月 0-2 场 → ${data.moons}`);
log(data.showers >= 0 && data.showers <= 2, `本月流星雨峰值 0-2 场 → ${data.showers}`);
log(data.eclipses >= 0 && data.eclipses <= 2, `本月日月食 0-2 场 → ${data.eclipses}`);
log(data.conj >= 0 && data.conj <= 15, `本月行星合相 0-15 场 → ${data.conj}`);
console.log('  本月满月日期：' + data.moonDates.join(', '));

// 2. UI 渲染
await ev(`goPanel('ephemeris')`);
await sleep(2000);
await assert('月度星历卡可见', `document.getElementById('ephYear') && document.getElementById('ephYear').style.display !== 'none'`);
await assert('统计块 4 个', `document.querySelectorAll('#ephYearStats .ey-stat').length === 4`);
const statNums = await ev(`[...document.querySelectorAll('#ephYearStats .ey-num')].map(x => x.textContent)`);
log(statNums.length === 4 && statNums.every(n => /^\d+$/.test(n)), `统计数字齐全 → ${statNums.join('/')}`);
const subOk = await ev(`document.getElementById('ephYearSub').textContent.includes('本月天象')`);
log(subOk, '副标题含「本月天象」');
await assert('亮点行 ≥1（含平静兜底）', `document.querySelectorAll('#ephYearHigh .ey-high-row').length >= 1`);
const hasNextFull = await ev(`document.getElementById('ephYearHigh').textContent.includes('下次满月')`);
log(hasNextFull, '亮点含下次满月');
const noCut = await ev(`[...document.querySelectorAll('#ephYearStats .ey-stat')].every(s => s.scrollWidth <= s.clientWidth + 1 && [...s.querySelectorAll('.ey-sub')].every(t => t.scrollWidth <= t.clientWidth + 1))`);
log(noCut, '统计卡文字无溢出截断');
const noEmoji = await ev(`!/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}]/u.test(document.getElementById('ephYear').textContent)`);
log(noEmoji, '月度卡无 emoji');
await shot('ephemeris-month.png');

// 3. 星卡分享图
await ev(`document.getElementById('btnEphYearShare').click()`);
await sleep(2500);
await assert('分享弹层打开', `document.getElementById('shareCardOverlay').classList.contains('open')`);
const titleOk = await ev(`document.getElementById('shareCardTitle').textContent === '月度星历'`);
log(titleOk, '弹层标题为月度星历');
const imgOk = await ev(`(() => { const i = document.getElementById('shareCardImg'); return !!i.src && (i.src.startsWith('blob:') || i.src.startsWith('data:image/png')); })()`);
log(imgOk, '星卡预览已生成');
const goldPx = await ev(`(() => {
  const c = window.state.shareCardCanvas;
  if (!c) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let gold = 0;
  for (let k = 0; k < d.length; k += 4) {
    const r = d[k], g = d[k + 1], b = d[k + 2];
    if (r > 110 && g > 85 && b < 160 && r - b > 50) gold++;
  }
  return gold;
})()`);
log(goldPx > 200, `星卡含金色文字像素 → ${goldPx}`);
await shot('almanac-month-card.png');
await ev(`document.getElementById('shareCardClose').click()`);
await sleep(300);
await assert('弹层可关闭', `!document.getElementById('shareCardOverlay').classList.contains('open')`);

// 4. 无 JS 异常
log(consoleErrors.length === 0, `无 JS 异常${consoleErrors.length ? ' → ' + consoleErrors.slice(0, 3).join(' | ') : ''}`);

const fails = results.filter(r => !r).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
process.exit(fails ? 1 : 0);
