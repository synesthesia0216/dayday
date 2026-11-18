// ====== Day-Day 记账模块 ======
// 纯离线 IndexedDB(ledger store),金额以整数分存储

const CATS = {
  expense: [
    { e: '🍜', n: '餐饮' }, { e: '🚌', n: '交通' }, { e: '🛒', n: '购物' }, { e: '🎬', n: '娱乐' },
    { e: '🏠', n: '居住' }, { e: '📚', n: '学习' }, { e: '❤️', n: '医疗' }, { e: '✨', n: '其他' },
  ],
  income: [
    { e: '💼', n: '工资' }, { e: '🎁', n: '红包' }, { e: '✨', n: '其他' },
  ],
};

let db = null, toast = () => {};

const state = {
  month: null, // 'YYYY-MM'
  expanded: false,
  sheet: null, // { entryId, mode, cat, amountStr, note, date }
};

// ====== 工具 ======
const pad2 = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const currentMonth = () => todayStr().slice(0, 7);
const shiftMonth = (ym, delta) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${y}年${m}月`; };

function fenToYuan(fen) {
  return (fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function strToFen(s) {
  if (!s) return 0;
  const v = parseFloat(s);
  if (isNaN(v) || v <= 0) return 0;
  return Math.round(v * 100);
}
function catOf(mode, name) {
  return (CATS[mode] || []).find(c => c.n === name) || null;
}

function dayLabel(ds) {
  const today = todayStr();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yest = `${y.getFullYear()}-${pad2(y.getMonth() + 1)}-${pad2(y.getDate())}`;
  const d = new Date(ds + 'T00:00:00');
  const week = '日一二三四五六'[d.getDay()];
  const prefix = ds === today ? '今天' : ds === yest ? '昨天' : '';
  return `${prefix} · ${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
}

// ====== 统计(纯函数,整数分运算) ======
function computeStats(entries, month) {
  const inMonth = entries.filter(e => e.date && e.date.startsWith(month));
  const expense = inMonth.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const income = inMonth.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const prev = shiftMonth(month, -1);
  const prevExpense = entries.filter(e => e.date && e.date.startsWith(prev) && e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  let delta = '—';
  if (prevExpense > 0) {
    const pct = ((expense - prevExpense) / prevExpense) * 100;
    delta = `${pct <= 0 ? '↓' : '↑'} ${Math.abs(pct).toFixed(1)}%`;
  }
  const [y, m] = month.split('-').map(Number);
  const days = month === currentMonth() ? new Date().getDate() : new Date(y, m, 0).getDate();
  const daily = expense > 0 ? Math.round(expense / days) : 0;

  const byCat = {};
  for (const c of CATS.expense) byCat[c.n] = 0;
  for (const e of inMonth) if (e.type === 'expense') byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  const cats = CATS.expense.map(c => ({ ...c, amount: byCat[c.n] })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);

  return { expense, income, balance: income - expense, delta, daily, cats };
}

// ====== 渲染 ======
function $(id) { return document.getElementById(id); }

function renderSummary(s) {
  $('ledgerExpense').textContent = '¥' + fenToYuan(s.expense);
  $('ledgerIncome').textContent = '¥' + fenToYuan(s.income);
  $('ledgerBalance').textContent = '¥' + fenToYuan(s.balance);
  $('ledgerDelta').textContent = s.delta;
  $('ledgerDaily').textContent = '¥' + fenToYuan(s.daily);
}

function renderChart(s) {
  const box = $('ledgerChart');
  if (!s.cats.length) {
    box.innerHTML = '<div class="ledger-empty">本月暂无支出记录</div>';
    return;
  }
  const max = s.cats[0].amount;
  box.innerHTML = s.cats.map(c => `
    <div class="lb-line">
      <span class="lb-ico">${c.e}</span>
      <span class="lb-name">${c.n}</span>
      <div class="lb-track"><div class="lb-fill" style="width:${Math.max(6, Math.round(c.amount / max * 100))}%"></div></div>
      <span class="lb-val">¥${fenToYuan(c.amount)}</span>
    </div>`).join('');
}

function renderList(entries, month) {
  const box = $('ledgerList');
  const inMonth = entries.filter(e => e.date && e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (!inMonth.length) {
    box.innerHTML = '<div class="ledger-empty">这个月还没有账单</div>';
    $('ledgerExpand').style.display = 'none';
    return;
  }
  const show = state.expanded ? inMonth : inMonth.slice(0, 8);
  const groups = [];
  let cur = null;
  for (const e of show) {
    if (!cur || cur.date !== e.date) { cur = { date: e.date, items: [] }; groups.push(cur); }
    cur.items.push(e);
  }
  box.innerHTML = groups.map(g => `
    <div class="lb-day">${dayLabel(g.date)}</div>
    ${g.items.map(e => {
      const c = catOf(e.type, e.category);
      const amt = e.type === 'expense' ? `-${fenToYuan(e.amount)}` : `+${fenToYuan(e.amount)}`;
      return `<div class="lb-item" data-id="${e.id}">
        <span class="lb-item-ico">${c ? c.e : '✨'}</span>
        <span class="lb-item-name">${c ? c.n : e.category}${e.note ? ' · ' + e.note : ''}</span>
        <span class="lb-item-amt ${e.type}">${amt}</span>
      </div>`;
    }).join('')}`).join('');
  $('ledgerExpand').style.display = inMonth.length > 8 ? '' : 'none';
  $('ledgerExpand').textContent = state.expanded ? '收起' : `展开全部(${inMonth.length} 条)`;
}

async function refresh() {
  if (!db) return;
  state.month = state.month || currentMonth();
  $('ledgerMonthLabel').textContent = monthLabel(state.month);
  const entries = await db.ledger.list();
  const s = computeStats(entries, state.month);
  renderSummary(s);
  renderChart(s);
  renderList(entries, state.month);
}

// ====== 快速记账弹层 ======
function openSheet(entry) {
  state.sheet = entry ? {
    entryId: entry.id, mode: entry.type, cat: entry.category,
    amountStr: (entry.amount / 100).toString(), note: entry.note || '', date: entry.date,
  } : { entryId: null, mode: 'expense', cat: null, amountStr: '', note: '', date: todayStr() };
  renderSheet();
  $('ledgerSheet').classList.add('open');
  $('ledgerSheetTitle').textContent = entry ? '编辑账单' : '记一笔';
}
function closeSheet() {
  $('ledgerSheet').classList.remove('open');
  state.sheet = null;
}

function sheetCat() { return (CATS[state.sheet.mode] || []).find(c => c.n === state.sheet.cat) || null; }
function sheetFen() { return strToFen(state.sheet.amountStr); }

function renderSheet() {
  const s = state.sheet;
  document.querySelectorAll('#ledgerSheetTabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === s.mode));
  $('ledgerAmount').textContent = '¥ ' + (s.amountStr || '0.00');
  $('ledgerCatGrid').innerHTML = CATS[s.mode].map(c =>
    `<button type="button" class="lb-cat${s.cat === c.n ? ' on' : ''}" data-cat="${c.n}"><span>${c.e}</span><em>${c.n}</em></button>`).join('');
  $('ledgerNote').value = s.note;
  $('ledgerDate').value = s.date;
  updateSave();
}

function updateSave() {
  const ok = sheetFen() > 0 && !!state.sheet.cat;
  $('ledgerSave').disabled = !ok;
}

function pressKey(k) {
  const s = state.sheet;
  if (k === '⌫') { s.amountStr = s.amountStr.slice(0, -1); }
  else if (k === '.') { if (!s.amountStr.includes('.')) s.amountStr = (s.amountStr || '0') + '.'; }
  else {
    if (s.amountStr.includes('.')) {
      const dec = s.amountStr.split('.')[1];
      if (dec.length >= 2) return;
    } else if (s.amountStr.replace(/^0+/, '').length >= 8) return;
    if (s.amountStr === '0') s.amountStr = k;
    else s.amountStr += k;
  }
  renderSheet();
}

async function saveSheet() {
  const s = state.sheet;
  const data = {
    type: s.mode, amount: sheetFen(), category: s.cat,
    note: $('ledgerNote').value.trim(), date: $('ledgerDate').value || todayStr(),
  };
  if (s.entryId) await db.ledger.update(s.entryId, data);
  else await db.ledger.create(data);
  closeSheet();
  toast(s.entryId ? '已更新' : '已记账 ✓');
  refresh();
}

// ====== 条目操作(编辑/删除) ======
function openAction(id) {
  state.actionId = id;
  $('ledgerAction').classList.add('open');
}
function closeAction() { $('ledgerAction').classList.remove('open'); }

async function editEntry() {
  const entry = await db.ledger.get(state.actionId);
  closeAction();
  if (entry) openSheet(entry);
}
async function deleteEntry() {
  if (!confirm('将这条账单化作星尘？')) return;
  await db.ledger.delete(state.actionId);
  closeAction();
  toast('已删除');
  refresh();
}

// ====== 初始化 ======
function bindEvents() {
  $('drawerLedger').addEventListener('click', () => {
    $('drawer').classList.add('collapsed');
    $('drawerExpand').classList.add('visible');
    $('drawerOverlay').classList.remove('show');
    window.goPanel('ledger');
  });
  $('ledgerBack').addEventListener('click', () => window.goPanel('stargaze'));
  $('ledgerMonthPrev').addEventListener('click', () => { state.month = shiftMonth(state.month, -1); state.expanded = false; refresh(); });
  $('ledgerMonthNext').addEventListener('click', () => { state.month = shiftMonth(state.month, 1); state.expanded = false; refresh(); });
  $('ledgerExpand').addEventListener('click', () => { state.expanded = !state.expanded; refresh(); });
  $('ledgerFab').addEventListener('click', () => openSheet(null));
  $('ledgerSheetClose').addEventListener('click', closeSheet);
  $('ledgerSheetTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.sheet.mode = b.dataset.mode; state.sheet.cat = null;
    renderSheet();
  });
  $('ledgerCatGrid').addEventListener('click', e => {
    const b = e.target.closest('.lb-cat'); if (!b) return;
    state.sheet.cat = b.dataset.cat;
    renderSheet();
  });
  $('ledgerKeypad').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    pressKey(b.dataset.k);
  });
  $('ledgerNote').addEventListener('input', () => { state.sheet.note = $('ledgerNote').value; });
  $('ledgerDate').addEventListener('change', () => { state.sheet.date = $('ledgerDate').value; });
  $('ledgerSave').addEventListener('click', saveSheet);
  $('ledgerList').addEventListener('click', e => {
    const item = e.target.closest('.lb-item'); if (!item) return;
    openAction(item.dataset.id);
  });
  $('ledgerActionEdit').addEventListener('click', editEntry);
  $('ledgerActionDelete').addEventListener('click', deleteEntry);
  $('ledgerActionCancel').addEventListener('click', closeAction);
}

function init(deps) {
  db = deps.db;
  toast = deps.toast || toast;
  state.month = currentMonth();
  bindEvents();
}

const ledger = { init, refresh, openSheet, closeSheet, CATS };
export default ledger;
