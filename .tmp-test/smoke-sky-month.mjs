// 冒烟：独立今夜星空页渲染（JS 确定性尺寸）+ 月度星历（文字不截断）
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
function log(ok, msg) { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); }
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
// 模拟真机：390x844 + dpr 2
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 2, mobile: true });
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

// 1. 今夜星空独立页：canvas 有实际尺寸且画出星点（非空白）
await ev(`goPanel('sky')`);
await sleep(3000);
await assert('星空页 canvas 有高度', `(() => { const c = document.getElementById('skyPageCanvas'); return c.clientHeight > 200 && c.clientWidth > 250; })()`);
await assert('canvas 物理像素已设置', `(() => { const c = document.getElementById('skyPageCanvas'); return c.width >= 500 && c.height >= 400; })()`);
const stars = await ev(`(() => {
  const c = document.getElementById('skyPageCanvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 300) lit++;
  return lit;
})()`);
log(stars > 800, `星空页画布有星点亮像素 → ${stars}`);
await assert('图例含恒星计数', `document.getElementById('skyPageLegend').textContent.includes('恒星')`);
await shot('smoke-sky-page.png');

// 2. 月度星历：标题/文字完整不截断
await ev(`goPanel('ephemeris')`);
await sleep(2000);
const eph = await ev(`(() => {
  const sub = document.getElementById('ephYearSub');
  const stats = [...document.querySelectorAll('.ey-stat')];
  const overflow = stats.some(s => s.scrollWidth > s.clientWidth + 1);
  const cut = stats.some(s => { const t = s.querySelector('.ey-sub'); return t && t.scrollWidth > t.clientWidth + 1; });
  return { title: document.querySelector('.eph-year-title').textContent, sub: sub.textContent, statCount: stats.length, overflow, cut };
})()`);
log(eph.title.includes('月度') && eph.title.includes('星历'), `标题为月度星历 → ${eph.title}`);
log(eph.sub.includes('本月'), `副标题本月 → ${eph.sub}`);
log(eph.statCount === 4, `统计 4 格 → ${eph.statCount}`);
log(!eph.overflow && !eph.cut, `文字无溢出截断 → ${JSON.stringify(eph)}`);
await shot('smoke-eph-month.png');

// 3. 月度星卡生成
const card = await ev(`(async () => { try { const c = await generateMonthShareCard(); return { w: c.width, h: c.height }; } catch (e) { return { err: String(e) }; } })()`);
log(card.w === 880 && card.h === 1320, `月度星卡 880x1320 → ${JSON.stringify(card)}`);

// 4. 无 JS 异常
log(consoleErrors.length === 0, `无 JS 异常${consoleErrors.length ? ' → ' + consoleErrors.slice(0, 3).join(' | ') : ''}`);

const fails = results.filter(r => !r).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
process.exit(fails ? 1 : 0);
