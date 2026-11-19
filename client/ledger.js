// ====== Day-Day 记账模块 ======
// 纯离线 IndexedDB(ledger store),金额以整数分存储
// 收支分类由用户自建（localStorage），不预设；旧版预设分类按名称映射颜色

const LS_CATS = 'dayday_ledger_cats';

// 旧版预设分类名 → 颜色（仅用于历史数据着色）
const LEGACY_COLORS = {
  '餐饮': '#c98a5e', '交通': '#7a9cc0', '购物': '#b08090', '娱乐': '#c9a96e',
  '居住': '#7ba38a', '学习': '#8aa3b8', '医疗': '#c07a6e', '其他': '#8b93a7',
  '工资': '#6fae8f', '红包': '#c9705e',
};
const PALETTE = ['#c9a96e', '#7a9cc0', '#7ba38a', '#c98a5e', '#b08090', '#8aa3b8', '#c07a6e', '#8b93a7'];

let db = null, toast = () => {}, onSave = null;

const state = {
  month: null, // 'YYYY-MM'
  expanded: false,
  sheet: null, // { entryId, mode, cat, amountStr, note, date }
  cats: { expense: [], income: [] },
  catsSeeded: false,
  managing: false, // 分类管理（删除）模式
  newCatOpen: false,
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
  return (state.cats[mode] || []).find(c => c.n === name) || null;
}
function catColor(mode, name) {
  const c = catOf(mode, name);
  return c ? c.c : (LEGACY_COLORS[name] || '#8b93a7');
}

// ====== 分类持久化 ======
function loadCats() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_CATS));
    if (v && Array.isArray(v.expense) && Array.isArray(v.income)) {
      state.cats = { expense: v.expense, income: v.income };
      state.catsSeeded = true;
      return;
    }
  } catch (e) {}
  state.cats = { expense: [], income: [] };
}
function saveCats() { localStorage.setItem(LS_CATS, JSON.stringify(state.cats)); }
// 老用户迁移：已有账单但尚无自建分类时，把历史用到的分类名纳入列表
async function seedCatsFromHistory() {
  if (state.catsSeeded) return;
  state.catsSeeded = true;
  if (state.cats.expense.length || state.cats.income.length) { saveCats(); return; }
  try {
    const entries = await db.ledger.list();
    ['expense', 'income'].forEach(mode => {
      const names = [...new Set(entries.filter(e => e.type === mode).map(e => e.category).filter(Boolean))];
      if (names.length) {
        state.cats[mode] = names.map((n, i) => ({ n, c: LEGACY_COLORS[n] || PALETTE[i % PALETTE.length] }));
      }
    });
    saveCats();
  } catch (e) {}
}
function addCat(mode, name) {
  const pool = state.cats[mode];
  if (pool.some(c => c.n === name)) return false;
  pool.push({ n: name, c: PALETTE[pool.length % PALETTE.length] });
  saveCats();
  return true;
}
function removeCat(mode, name) {
  state.cats[mode] = state.cats[mode].filter(c => c.n !== name);
  saveCats();
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

  // 按实际出现过的分类聚合（含历史/已删除分类，保证统计不丢）
  const byCat = {};
  for (const e of inMonth) if (e.type === 'expense') byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  const cats = Object.entries(byCat)
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([n, amt]) => ({ n, amount: amt, c: catColor('expense', n) }));

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
    box.innerHTML = '<div class="ledger-empty">本月还没有支出。点右下角「＋」，写下第一笔吧。</div>';
    return;
  }
  const max = s.cats[0].amount;
  box.innerHTML = s.cats.map(c => `
    <div class="lb-line">
      <span class="lb-ico"><i class="lb-dot" style="background:${c.c}"></i></span>
      <span class="lb-name">${c.n}</span>
      <div class="lb-track"><div class="lb-fill" style="width:${Math.max(6, Math.round(c.amount / max * 100))}%"></div></div>
      <span class="lb-val">¥${fenToYuan(c.amount)}</span>
    </div>`).join('');
}

function renderList(entries, month) {
  const box = $('ledgerList');
  const inMonth = entries.filter(e => e.date && e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  if (!inMonth.length) {
    box.innerHTML = '<div class="ledger-empty">这个月还没有账单。点右下角「＋」记一笔，星光会替你收好。</div>';
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
      const amt = e.type === 'expense' ? `-${fenToYuan(e.amount)}` : `+${fenToYuan(e.amount)}`;
      return `<div class="lb-item" data-id="${e.id}">
        <span class="lb-item-ico"><i class="lb-dot" style="background:${catColor(e.type, e.category)}"></i></span>
        <span class="lb-item-name">${e.category}${e.note ? ' · ' + e.note : ''}</span>
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
  state.managing = false;
  state.newCatOpen = false;
  renderSheet();
  $('ledgerSheet').classList.add('open');
  $('ledgerSheetTitle').textContent = entry ? '编辑账单' : '记一笔';
}
function closeSheet() {
  $('ledgerSheet').classList.remove('open');
  state.sheet = null;
}

function sheetFen() { return strToFen(state.sheet.amountStr); }

function renderSheet() {
  const s = state.sheet;
  document.querySelectorAll('#ledgerSheetTabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === s.mode));
  $('ledgerAmount').textContent = '¥ ' + (s.amountStr || '0.00');

  const pool = state.cats[s.mode] || [];
  const manageBtn = `<button type="button" class="lb-cat-manage" id="lbCatManage">${state.managing ? '完成' : '管理'}</button>`;
  let grid = '';
  if (!pool.length) {
    grid = `<div class="ledger-empty">还没有分类。点「新建」，写下第一个板块，比如「餐饮」或「工资」。</div>`;
  } else {
    grid = pool.map(c => {
      const cls = s.cat === c.n ? ' on' : '';
      return `<button type="button" class="lb-cat${cls}" data-cat="${c.n}">
        ${state.managing ? `<i class="lb-dot lb-dot-x" data-del="${c.n}" style="background:transparent;border:1px solid var(--bad);">×</i>` : `<i class="lb-dot" style="background:${c.c}"></i>`}
        <em>${c.n}</em>
      </button>`;
    }).join('');
  }
  grid += `<button type="button" class="lb-cat lb-cat-new${state.newCatOpen ? ' on' : ''}" id="lbCatNew"><span class="lb-cat-plus">＋</span><em>新建</em></button>`;
  $('ledgerCatHead').innerHTML = `<span class="lb-cat-head-label">${s.mode === 'expense' ? '支出板块' : '收入板块'}</span>${pool.length ? manageBtn : ''}`;
  $('ledgerCatGrid').innerHTML = grid;
  $('ledgerCatForm').style.display = state.newCatOpen ? 'flex' : 'none';
  if (state.newCatOpen) $('ledgerNewCatName').value = '';
  $('ledgerNote').value = s.note;
  $('ledgerDate').value = s.date;
  updateSave();
}

function toggleNewCat() {
  state.newCatOpen = !state.newCatOpen;
  state.managing = false;
  renderSheet();
}
function confirmNewCat() {
  const name = $('ledgerNewCatName').value.trim();
  if (!name) { toast('先给板块起个名字'); return; }
  addCat(state.sheet.mode, name); // 已存在时跳过添加，直接选中
  state.sheet.cat = name;
  state.newCatOpen = false;
  renderSheet();
}
function toggleManage() {
  state.managing = !state.managing;
  state.newCatOpen = false;
  renderSheet();
}
function handleCatClick(target) {
  const del = target.dataset.del;
  if (del) {
    removeCat(state.sheet.mode, del);
    if (state.sheet.cat === del) state.sheet.cat = null;
    renderSheet();
    return;
  }
  const btn = target.closest('.lb-cat'); if (!btn) return;
  if (btn.id === 'lbCatNew') { toggleNewCat(); return; }
  if (state.managing) return;
  state.sheet.cat = btn.dataset.cat;
  renderSheet();
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
  const isNew = !s.entryId;
  if (s.entryId) await db.ledger.update(s.entryId, data);
  else await db.ledger.create(data);
  closeSheet();
  toast(s.entryId ? '已更新' : '已记账');
  refresh();
  if (isNew && onSave) onSave();
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
  if (!confirm('删除这条账单？删除后无法恢复。')) return;
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
    state.managing = false; state.newCatOpen = false;
    renderSheet();
  });
  $('ledgerCatHead').addEventListener('click', e => {
    const b = e.target.closest('#lbCatManage'); if (b) toggleManage();
  });
  $('ledgerCatGrid').addEventListener('click', e => {
    handleCatClick(e.target);
  });
  $('ledgerCatForm').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'ledgerNewCatOk') confirmNewCat();
    else if (b.id === 'ledgerNewCatCancel') { state.newCatOpen = false; renderSheet(); }
  });
  $('ledgerNewCatName').addEventListener('keydown', e => { if (e.key === 'Enter') confirmNewCat(); });
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
  onSave = deps.onSave || null;
  state.month = currentMonth();
  loadCats();
  bindEvents();
  seedCatsFromHistory();
}

const ledger = { init, refresh, openSheet, closeSheet };
export default ledger;
