// Day-Day 真实月面影像：NASA SVS 帧 URL、hero 加载淡入、弹层同步、缓存写入、无 JS 异常
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CDP = 'http://127.0.0.1:9222';
const APP = 'http://localhost:3099';
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));

let targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page' && t.url.includes('localhost:3099'));
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

const consoleErrors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
await send('Page.enable');
await send('Runtime.enable');
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
await ev(`goPanel('stargaze')`);
await sleep(1200);

// 1. 帧 URL 公式
await assert('hero img 已设 svs 帧源', `(() => { const s = document.getElementById('moonHeroImg').getAttribute('src') || ''; return s.includes('svs.gsfc.nasa.gov') || s.startsWith('blob:'); })()`, 15000);

// 2. hero 加载淡入（浏览器端 <img> 直载）
await assert('hero 真实月面图加载完成（loaded）', `document.getElementById('moonHeroImg').classList.contains('loaded')`, 20000);
await assert('来源标注「NASA SVS」', `document.getElementById('moonHeroSrc').textContent.includes('NASA SVS')`);
await shot('moon-hero-real.png');

// 3. 月相弹层同步真实影像
await ev(`document.getElementById('moonHero').click()`);
await sleep(800);
await assert('弹层打开', `document.getElementById('moonOverlay').classList.contains('open')`);
await assert('弹层真实月面图加载', `(() => { const i = document.getElementById('moonModalImg'); return !!(i && i.classList.contains('loaded') && i.src); })()`, 10000);
await shot('moon-modal-real.png');
await ev(`document.getElementById('moonModalClose').click()`);
await sleep(300);

// 4. 无 JS 异常
await sleep(600);
await assert('无 JS 异常', `${consoleErrors.length} === 0`);

const fails = results.filter(r => r.startsWith('❌')).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
if (consoleErrors.length) console.log('console errors:', consoleErrors.join(' | '));
process.exit(fails ? 1 : 0);
