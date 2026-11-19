// Day-Day 记账板块 CDP 自动化测试(Node 24,原生 WebSocket)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CDP = 'http://127.0.0.1:9222';
const APP = 'http://localhost:3099';
const OUT = fileURLToPath(new URL('./', import.meta.url));
mkdirSync(OUT, { recursive: true });

// ---- 获取页面 target ----
let targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page');
if (!page) {
  page = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
}

// ---- WebSocket + CDP ----
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
const events = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
function send(method, params = {}) {
  return new Promise(resolve => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 页面内求值 ----
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('PAGE ERROR: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
}

// ---- 断言助手(轮询) ----
async function assert(desc, expression, timeout = 4000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await ev(expression); if (last === true) { log('PASS', desc); return true; } }
    catch (e) { last = 'ERR:' + e.message; }
    await sleep(120);
  }
  log('FAIL', `${desc}  →  ${JSON.stringify(last)}`);
  return false;
}
const results = [];
function log(ok, msg) { results.push(`${ok === 'PASS' ? '✅' : '❌'} ${msg}`); console.log(`${ok} ${msg}`); }

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log(`SHOT ${name}`);
}

const consoleErrors = [];
events.length = 0;

// ====== 主流程 ======
await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nox_token','unlocked');` });
await send('Page.navigate', { url: APP });
await sleep(1500);

async function waitReady() {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    try {
      if (await ev(`!!window.goPanel && !!document.getElementById('panel-ledger')`)) return;
    } catch (e) {}
    await sleep(300);
  }
}
await waitReady();

// 清库,确保干净起点
await ev(`new Promise(r => { const q = indexedDB.deleteDatabase('dayday'); q.onsuccess = q.onerror = q.onblocked = () => r(); })`);
await ev(`localStorage.removeItem('dayday_ledger_cats')`);
await ev(`location.reload()`);
await sleep(1800);
await waitReady();

const click = sel => ev(`document.querySelector('${sel}').click()`);
const text = sel => ev(`document.querySelector('${sel}').textContent`);
// 新建自定义分类：点「新建」→ 输入名字 → 保存（自动选中）
async function newCat(name) {
  await click('#lbCatNew');
  await ev(`(() => { const i = document.getElementById('ledgerNewCatName'); i.value = '${name}'; })()`);
  await click('#ledgerNewCatOk');
}

// ---- T1 面板切换 ----
await ev(`goPanel('ledger')`);
await assert('T1 面板激活', `document.getElementById('panel-ledger').classList.contains('active')`);
await assert('T1 月份标签', `document.getElementById('ledgerMonthLabel').textContent.includes('年')`);

// ---- T2 空状态 ----
await assert('T2 支出默认 0', `document.getElementById('ledgerExpense').textContent === '¥0.00'`);
await assert('T2 图表空态', `document.getElementById('ledgerChart').textContent.includes('还没有支出')`);
await assert('T2 列表空态', `document.getElementById('ledgerList').textContent.includes('还没有账单')`);
await shot('t2-empty');

// ---- T3 打开弹层 ----
await click('#ledgerFab');
await assert('T3 弹层打开', `document.getElementById('ledgerSheet').classList.contains('open')`);
await assert('T3 保存初始置灰', `document.getElementById('ledgerSave').disabled === true`);
await assert('T3 无预设分类(自建引导可见)', `document.getElementById('ledgerCatGrid').textContent.includes('新建')`);

// ---- T4 只输金额仍置灰 ----
await click('#ledgerKeypad [data-k="1"]');
await click('#ledgerKeypad [data-k="2"]');
await assert('T4 金额显示', `document.getElementById('ledgerAmount').textContent === '¥ 12'`);
await assert('T4 无分类仍置灰', `document.getElementById('ledgerSave').disabled === true`);

// ---- T5 新建分类「餐饮」→ 自动选中可保存 ----
await newCat('餐饮');
await assert('T5 新建分类后自动选中', `document.querySelector('#ledgerCatGrid .lb-cat.on em')?.textContent === '餐饮'`);
await assert('T5 选分类后可保存', `document.getElementById('ledgerSave').disabled === false`);
await shot('t5-sheet-open');

// ---- T6 小数金额保存 ----
await click('#ledgerKeypad [data-k="."]');
await click('#ledgerKeypad [data-k="5"]');
await assert('T6 金额 12.5', `document.getElementById('ledgerAmount').textContent === '¥ 12.5'`);
await click('#ledgerSave');
await assert('T6 弹层关闭', `!document.getElementById('ledgerSheet').classList.contains('open')`);
await assert('T6 列表出现餐饮', `document.getElementById('ledgerList').textContent.includes('餐饮')`);
await assert('T6 支出 ¥12.50', `document.getElementById('ledgerExpense').textContent === '¥12.50'`);

// ---- T7 收入 ----
await click('#ledgerFab');
await click('#ledgerSheetTabs [data-mode="income"]');
await newCat('工资');
for (const k of ['8','0','0','0']) await click(`#ledgerKeypad [data-k="${k}"]`);
await click('#ledgerSave');
await assert('T7 收入 ¥8,000.00', `document.getElementById('ledgerIncome').textContent === '¥8,000.00'`);
await assert('T7 结余 ¥7,987.50', `document.getElementById('ledgerBalance').textContent === '¥7,987.50'`);
await assert('T7 列表收入金色条目', `document.querySelector('#ledgerList .lb-item-amt.income') !== null`);

// ---- T8 上月账单(备注+改日期) ----
await click('#ledgerFab');
await newCat('交通');
await click('#ledgerKeypad [data-k="4"]');
await ev(`(() => { const i = document.getElementById('ledgerNote'); i.value = '地铁'; i.dispatchEvent(new Event('input')); })()`);
await ev(`(() => { const i = document.getElementById('ledgerDate'); i.value = '${prevMonthDate()}'; i.dispatchEvent(new Event('change')); })()`);
await click('#ledgerSave');
await assert('T8 本月支出不变', `document.getElementById('ledgerExpense').textContent === '¥12.50'`);

// ---- T9 月份切换 ----
await click('#ledgerMonthPrev');
await assert('T9 上月支出 ¥4.00', `document.getElementById('ledgerExpense').textContent === '¥4.00'`);
await assert('T9 列表显示备注', `document.getElementById('ledgerList').textContent.includes('地铁')`);
await shot('t9-prev-month');
await click('#ledgerMonthNext');
await assert('T9 回到本月', `document.getElementById('ledgerExpense').textContent === '¥12.50'`);

// ---- T10 编辑 ----
await ev(`[...document.querySelectorAll('#ledgerList .lb-item')].find(i => i.textContent.includes('餐饮')).click()`);
await assert('T10 操作弹层打开', `document.getElementById('ledgerAction').classList.contains('open')`);
await click('#ledgerActionEdit');
await assert('T10 编辑预填金额', `document.getElementById('ledgerAmount').textContent === '¥ 12.5'`);
await click('#ledgerKeypad [data-k="⌫"]');
await click('#ledgerKeypad [data-k="⌫"]');
await click('#ledgerKeypad [data-k="5"]');
await click('#ledgerKeypad [data-k="0"]');
await click('#ledgerSave');
await assert('T10 编辑后 ¥1,250.00', `document.getElementById('ledgerExpense').textContent === '¥1,250.00'`);

// ---- T11 图表(多分类排序) ----
await ev(`import('../client/db.js').then(m => Promise.all([
  m.default.ledger.create({ type:'expense', amount:10000, category:'娱乐', date:'2026-11-01', note:'' }),
  m.default.ledger.create({ type:'expense', amount:5000, category:'购物', date:'2026-11-02', note:'' }),
]))`);
await ev(`goPanel('stargaze'); goPanel('ledger')`);
await assert('T11 图表首行餐饮', `document.querySelector('#ledgerChart .lb-line .lb-name')?.textContent === '餐饮'`);
await assert('T11 图表三行', `document.querySelectorAll('#ledgerChart .lb-line').length === 3`);
await assert('T11 环比显示', `document.getElementById('ledgerDelta').textContent !== '—'`);
await shot('t11-chart');

// ---- T12 展开全部 ----
await ev(`import('../client/db.js').then(m => { const ps = []; for (let i = 0; i < 10; i++) ps.push(m.default.ledger.create({ type:'expense', amount:100, category:'其他', date:'2026-11-10', note:'批量'+i })); return Promise.all(ps); })`);
await ev(`goPanel('stargaze'); goPanel('ledger')`);
await assert('T12 展开按钮出现', `document.getElementById('ledgerExpand').style.display !== 'none'`);
await click('#ledgerExpand');
await assert('T12 展开后全部显示', `document.querySelectorAll('#ledgerList .lb-item').length === 14`);
await assert('T12 按钮变收起', `document.getElementById('ledgerExpand').textContent === '收起'`);
await click('#ledgerExpand');
await assert('T12 收起后 8 条', `document.querySelectorAll('#ledgerList .lb-item').length === 8`);

// ---- T13 删除 ----
await ev(`window.confirm = () => true`);
await ev(`[...document.querySelectorAll('#ledgerList .lb-item')].find(i => i.textContent.includes('餐饮')).click()`);
await click('#ledgerActionDelete');
await assert('T13 删除后支出减少', `document.getElementById('ledgerExpense').textContent === '¥160.00'`);

// ---- T14 lite 隔离 ----
// 注:模拟 showLogin 的 setScope 行为(tryAutoLogin 自动登录路径存在预先存在的 scope 未设置问题,见 findings)
await ev(`localStorage.setItem('nox_token','lite-unlocked'); location.reload();`);
await sleep(1800);
await waitReady();
await ev(`import('../client/db.js').then(m => m.default.setScope('lite'))`);
await ev(`goPanel('ledger')`);
await assert('T14 lite 模式看不到 full 数据', `document.getElementById('ledgerExpense').textContent === '¥0.00'`);
await ev(`import('../client/db.js').then(m => m.default.ledger.create({ type:'expense', amount:88800, category:'其他', date:'2026-11-18', note:'lite' }))`);
await ev(`goPanel('stargaze'); goPanel('ledger')`);
await assert('T14 lite 记账可见', `document.getElementById('ledgerExpense').textContent === '¥888.00'`);
await ev(`localStorage.setItem('nox_token','unlocked'); location.reload();`);
await sleep(1800);
await waitReady();
await ev(`import('../client/db.js').then(m => m.default.setScope('full'))`);
await ev(`goPanel('ledger')`);
// app 既有语义:full 看全部(含 lite 记录),lite 只看 lite —— 与 notes/diary 一致
await assert('T14 full 模式看到全部数据', `document.getElementById('ledgerList').textContent.includes('批量') && document.getElementById('ledgerList').textContent.includes('lite')`);

// ---- 控制台错误检查 ----
const errs = events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error'));
log(errs.length ? 'FAIL' : 'PASS', `控制台错误: ${errs.length} 个` + (errs.length ? ' ' + JSON.stringify(errs.slice(0,3).map(e => e.params?.exceptionDetails?.text || e.params?.args?.map(a => a.value).join(' '))) : ''));

const passed = results.filter(r => r.startsWith('✅')).length;
const failed = results.filter(r => r.startsWith('❌')).length;
writeFileSync(`${OUT}report.txt`, results.join('\n') + `\n\n共 ${results.length} 项,通过 ${passed},失败 ${failed}\n`);
console.log(`\n===== 共 ${results.length} 项,通过 ${passed},失败 ${failed} =====`);
process.exit(failed ? 1 : 0);

function prevMonthDate() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); d.setDate(15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}
