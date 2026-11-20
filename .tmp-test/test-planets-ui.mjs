// 行星 UI 集成：今日行星卡（首页） + 全屏星空弹层叠加 + 分享卡行星行
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
async function assert(desc, expression, timeout = 5000) {
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
await send('Page.navigate', { url: APP + '/?probe=' + Date.now() });
await sleep(1600);
{
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try { if (await ev(`!!window.goPanel && !!window.planets`)) break; } catch (e) {}
    await sleep(300);
  }
}
await ev(`(() => { const o = document.getElementById('onboardOverlay'); if (o && o.classList.contains('open')) o.classList.remove('open'); const t = document.getElementById('tourOverlay'); if (t) t.style.display = 'none'; return true; })()`);

// 1. 今日行星卡（今夜星空独立页）
await sleep(2500);
await ev(`goPanel('sky')`);
await sleep(2500);
await assert('今日行星卡存在', `!!document.getElementById('planetCard')`);
await assert('行星列表渲染 ≥2 行（含月球）', `document.querySelectorAll('#planetList .planet-row').length >= 2`);
await assert('行星卡副标题含实时历表', `document.getElementById('planetCardSub').textContent.includes('实时历表')`);
const rows = await ev(`[...document.querySelectorAll('#planetList .planet-row')].map(r => r.textContent.trim()).join(' | ')`);
console.log('  行内容：' + rows);
await assert('无 emoji（行内不含月相符）', `![...document.querySelectorAll('#planetList .planet-row')].some(r => /[\\u{1F300}-\\u{1FAFF}]/u.test(r.textContent))`);
await shot('planets-card.png');

// 2. 星空页画布：行星叠加（canvas 像素级：非零行星色像素）
const skyPixels = await ev(`(() => {
  const cv = document.getElementById('skyPageCanvas');
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let colored = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    if (r > 150 && g > 120 && b > 60 && b < 160 && r > b) colored++;
  }
  return colored;
})()`);
log(skyPixels > 50, `星空页画布含行星色亮像素 → ${skyPixels}`);
await shot('planets-sky-page.png');

// 3. 星空页图例：行星标签 + 图例计数
await assert('星空页图例含行星计数', `document.getElementById('skyPageLegend').textContent.includes('行星')`);
await assert('星空页画布有行星标签像素（金）', `(() => {
  const cv = document.getElementById('skyPageCanvas');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let gold = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i+1], b = d[i+2]; if (r > 120 && g > 95 && b < 150 && r > b) gold++; }
  return gold > 200;
})()`);
await shot('planets-sky-page-labels.png');

// 4. 分享卡含行星行（canvas 无异常 + 尺寸正确）
const shareOk = await ev(`(async () => {
  try {
    const c = await generateShareCard();
    return { w: c.width, h: c.height, len: c.toDataURL('image/png').length };
  } catch (e) { return { err: String(e) }; }
})()`);
log(shareOk && shareOk.w === 880 && shareOk.h === 1320, `分享卡生成成功 880x1320 → ${JSON.stringify(shareOk)}`);

// 5. 无 JS 异常
log(consoleErrors.length === 0 ? true : false, `无 JS 异常${consoleErrors.length ? ' → ' + consoleErrors.slice(0, 3).join(' | ') : ''}`);

const fails = results.filter(r => !r).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
process.exit(fails ? 1 : 0);
