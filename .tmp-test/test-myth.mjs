// Day-Day 神话联网书库（古腾堡）+ 搜索修复（同时搜银河档案）
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
    try { if (await ev(`!!window.goPanel`)) break; } catch (e) {}
    await sleep(300);
  }
}

// 1. 联网书库打开：书列表或优雅降级提示
await ev(`goPanel('myth')`);
await sleep(1000);
await ev(`document.getElementById('btnGutenberg').click()`);
await sleep(1500);
await assert('联网书库弹层打开', `document.getElementById('gutenbergOverlay').classList.contains('open')`);
await assert('书库加载中提示出现', `document.getElementById('gutenbergEmpty').style.display !== 'none'`);
// 等待结果（可达→书目；被墙→12s 超时降级提示）
const booksShown = await ev(`(() => { const t0 = Date.now(); return new Promise(r => { const i = setInterval(() => { const books = document.querySelectorAll('.gutenberg-book').length; const msg = document.getElementById('gutenbergEmpty').textContent; if (books > 0) { clearInterval(i); r(true); } else if (msg.includes('失败') || msg.includes('没有相关')) { clearInterval(i); r(false); } else if (Date.now() - t0 > 16000) { clearInterval(i); r('timeout'); } }, 500); }); })()`, 20000);
if (booksShown === true) {
  log('PASS', '书库返回书目列表');
  await assert('书目含标题', `document.querySelector('.gutenberg-book-title') && document.querySelector('.gutenberg-book-title').textContent.length > 0`);
  await shot('gutenberg-books.png');
} else if (booksShown === false) {
  log('PASS', '网络不可达时优雅降级提示');
  info('Gutendex 当前网络不可达（GFW），真机开 VPN 可用');
} else {
  log('FAIL', `书库既无书目也无降级提示  →  ${booksShown}`);
}
await shot('gutenberg.png');
await ev(`document.getElementById('gutenbergClose').click()`);

// 2. 搜索修复：收藏中的书也能被搜到
const SEED_TITLE = '测试神书·搜索联通' + Date.now().toString(36);
await ev(`import('../client/db.js').then(async m => { await m.default.storyCollection.create({ id: 'seed_' + Date.now(), title: ${JSON.stringify(SEED_TITLE)}, content: '这是收藏里的测试书籍内容，用于验证搜索同时覆盖银河档案。', source: '测试来源', category: '测试', fetchedAt: new Date().toISOString() }); return true; })`);
await ev(`(async () => {
  const input = document.getElementById('storySearchInput');
  input.value = ${JSON.stringify(SEED_TITLE.slice(0, 8))};
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(1200);
await assert('搜索结果包含收藏书目', `(() => {
  const titles = [...document.querySelectorAll('#storySearchResults .story-card-title')].map(x => x.textContent);
  return titles.some(t => t.includes(${JSON.stringify(SEED_TITLE.slice(0, 8))}));
})()`);
await assert('收藏书目点击走 openMythReader 路径', `(() => {
  const cards = [...document.querySelectorAll('#storySearchResults .story-card')];
  const c = cards.find(x => x.textContent.includes(${JSON.stringify(SEED_TITLE.slice(0, 8))}));
  return c && c.getAttribute('onclick').includes('openMythReader');
})()`);
// 点击打开阅读器
await ev(`(() => {
  const cards = [...document.querySelectorAll('#storySearchResults .story-card')];
  const c = cards.find(x => x.textContent.includes(${JSON.stringify(SEED_TITLE.slice(0, 8))}));
  c.click(); return true;
})()`);
await sleep(800);
await assert('阅读器打开且内容正确', `document.getElementById('storyOverlay').classList.contains('open') && document.getElementById('storyBody').textContent.includes(${JSON.stringify(SEED_TITLE.slice(0, 8))})`);
await shot('myth-search-collection.png');
await ev(`document.getElementById('storyOverlay').classList.remove('open')`);

// 3. 本地神话仍可搜索
await ev(`(async () => { const input = document.getElementById('storySearchInput'); input.value = '嫦娥'; input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await sleep(1200);
await assert('本地神话搜索正常（嫦娥）', `(() => { const titles = [...document.querySelectorAll('#storySearchResults .story-card-title')].map(x => x.textContent); return titles.some(t => t.includes('嫦娥')); })()`);

// 4. 无 JS 异常
await sleep(600);
await assert('无 JS 异常', `${consoleErrors.length} === 0`);

const fails = results.filter(r => r.startsWith('❌')).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
if (consoleErrors.length) console.log('console errors:', consoleErrors.join(' | '));
process.exit(fails ? 1 : 0);
