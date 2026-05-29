// ====== Day-Day ======
const API = '/api';
const isDev = location.search.includes('dev');
const $ = id => document.getElementById(id);

const MOODS = [
  { e:'😊', n:'开心' },{ e:'😢', n:'难过' },{ e:'😡', n:'生气' },
  { e:'😴', n:'疲惫' },{ e:'🤩', n:'兴奋' },{ e:'🥰', n:'幸福' },
  { e:'😰', n:'焦虑' },{ e:'😌', n:'平静' },
];

const LEVELS = [
  { lv:1, name:'观察者', xp:0 },{ lv:2, name:'记录者', xp:50 },
  { lv:3, name:'探索者', xp:120 },{ lv:4, name:'编织者', xp:250 },
  { lv:5, name:'创造者', xp:500 },{ lv:6, name:'守夜人', xp:1000 },
  { lv:7, name:'破晓者', xp:2000 },
];

const ACHS = [
  { id:'first_checkin', icon:'🌱', name:'初来乍到' },
  { id:'streak_7', icon:'🔥', name:'七日之火' },
  { id:'notes_10', icon:'✍️', name:'笔耕不辍' },
  { id:'diary_7', icon:'📖', name:'日笺成册' },
  { id:'story_ch3', icon:'🌙', name:'守夜人' },
  { id:'streak_30', icon:'⭐', name:'满月' },
];

let token = localStorage.getItem('nox_token') || '';
let state = {
  panel: 'today', notes: [], diary: [], reminders: [], checkins: [],
  todayCheckin: null, streak: 0, noteType: 'all',
  calYear: 0, calMonth: 0, selectedMood: null,
  editing: null, sTimer: null, uQueue: [],
};

const headers = () => ({ 'Content-Type': 'application/json', 'X-Auth-Token': token });

// ====== Auth ======
if (token) tryAutoLogin(); else showLogin();

async function tryAutoLogin() {
  try {
    const r = await fetch(`${API}/auth/me`, { headers: headers() });
    if (r.ok) { showApp(); return; }
  } catch(e) {}
  localStorage.removeItem('nox_token');
  token = '';
  showLogin();
}

function showLogin() {
  $('loginScreen').style.display = 'flex';
  $('app').style.display = 'none';
  $('loginStep1').style.display = 'block';
  $('loginStep2').style.display = 'none';
  $('loginEmail').value = '';
  $('loginCode').value = '';
  $('loginHint').textContent = '';
  $('loginHint2').textContent = '';
}

function showApp() {
  $('loginScreen').style.display = 'none';
  $('app').style.display = 'flex';
  initApp();
}

$('btnSendCode').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  if (!email || !email.includes('@')) { $('loginHint').textContent = '请输入有效邮箱'; return; }
  $('loginHint').textContent = '发送中...';
  try {
    const r = await fetch(`${API}/auth/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const d = await r.json();
    if (d.ok) {
      $('loginHint').textContent = '验证码已发送';
      $('loginStep1').style.display = 'none';
      $('loginStep2').style.display = 'block';
      $('loginEmailLabel').textContent = email;
      $('loginCode').focus();
    } else {
      $('loginHint').textContent = d.error || '发送失败';
    }
  } catch(e) {
    $('loginHint').textContent = '网络错误，请检查服务是否启动';
  }
});

$('btnVerify').addEventListener('click', async () => {
  const email = $('loginEmailLabel').textContent;
  const code = $('loginCode').value.trim();
  if (code.length !== 4) { $('loginHint2').textContent = '请输入4位验证码'; return; }
  $('loginHint2').textContent = '验证中...';
  try {
    const r = await fetch(`${API}/auth/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) });
    const d = await r.json();
    if (d.token) {
      token = d.token;
      localStorage.setItem('nox_token', token);
      showApp();
    } else {
      $('loginHint2').textContent = d.error || '验证失败';
    }
  } catch(e) {
    $('loginHint2').textContent = '网络错误';
  }
});

$('btnBack').addEventListener('click', showLogin);
$('loginCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnVerify').click(); });
$('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnSendCode').click(); });
$('btnLogout').addEventListener('click', () => { localStorage.removeItem('nox_token'); token = ''; showLogin(); });

// ====== Drawer ======
function initDrawer() {
  const drawer = $('drawer'), overlay = $('drawerOverlay');
  $('drawerToggle').addEventListener('click', () => {
    drawer.classList.add('collapsed');
    $('drawerExpand').classList.add('visible');
    overlay.classList.remove('show');
  });
  $('drawerExpand').addEventListener('click', () => {
    drawer.classList.remove('collapsed');
    $('drawerExpand').classList.remove('visible');
  });
  overlay.addEventListener('click', () => {
    drawer.classList.add('collapsed');
    $('drawerExpand').classList.add('visible');
    overlay.classList.remove('show');
  });
}

// ====== Nav ======
function initNav() {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      state.panel = el.dataset.panel;
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      $(`panel-${state.panel}`).classList.add('active');
      if (window.innerWidth <= 768) {
        $('drawer').classList.add('collapsed');
        $('drawerExpand').classList.add('visible');
        $('drawerOverlay').classList.remove('show');
      }
      refreshPanel();
    });
  });
}

function refreshPanel() {
  const fn = { today: loadToday, notes: loadNotes, diary: loadDiary, story: loadStory, growth: loadGrowth, reminders: loadReminders };
  (fn[state.panel] || (() => {}))();
  updateStats();
}

// ====== Toast ======
function toast(m) {
  const c = $('toastContainer'), t = document.createElement('div');
  t.className = 'toast'; t.textContent = m; c.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ====== Clock ======
function updateClock() {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  $('clockTime').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const week = ['日','一','二','三','四','五','六'];
  $('clockDate').textContent = `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} 周${week[now.getDay()]}`;
  let ph;
  if (h >= 5 && h < 7) ph = '拂晓';
  else if (h >= 7 && h < 18) ph = '白昼';
  else if (h >= 18 && h < 20) ph = '黄昏';
  else ph = '深夜';
  $('clockPhase').textContent = ph;
}
setInterval(updateClock, 15000);
updateClock();

// ====== Calendar ======
function renderCalendar() {
  if (!state.calYear) { const n = new Date(); state.calYear = n.getFullYear(); state.calMonth = n.getMonth() + 1; }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const firstDay = new Date(state.calYear, state.calMonth - 1, 1);
  const lastDay = new Date(state.calYear, state.calMonth, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const moodMap = {};
  state.checkins.forEach(c => { moodMap[c.date] = c.mood; });

  const dayNames = ['日','一','二','三','四','五','六'];
  let html = `<div class="calendar-head"><span class="calendar-month">${state.calYear}.${String(state.calMonth).padStart(2,'0')}</span><div class="calendar-nav"><button id="calPrev"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button><button id="calNext"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button></div></div>`;
  html += '<div class="calendar-grid">';
  dayNames.forEach(d => { html += `<div class="calendar-day-name">${d}</div>`; });
  for (let i = 0; i < startDow; i++) html += '<div class="calendar-cell"></div>';
  for (let d = 1; d <= totalDays; d++) {
    const ds = `${state.calYear}-${String(state.calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = ds === todayStr;
    const mood = moodMap[ds] || '';
    html += `<div class="calendar-cell${isToday ? ' today' : ''}${mood ? ' has-mood' : ''}" data-date="${ds}"><span>${d}</span>${mood ? `<span class="cell-mood">${mood}</span>` : ''}</div>`;
  }
  html += '</div>';
  $('calendar').innerHTML = html;

  $('calPrev').addEventListener('click', () => { state.calMonth--; if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; } renderCalendar(); });
  $('calNext').addEventListener('click', () => { state.calMonth++; if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; } renderCalendar(); });

  // Bind clicks on ALL calendar cells (not just ones with mood)
  $('calendar').querySelectorAll('.calendar-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const ds = cell.dataset.date;
      const mood = moodMap[ds];
      if (ds === todayStr) {
        // Today: always allow mood input
        showMoodPicker(ds, mood);
      } else if (mood) {
        // Past day with mood: show detail
        const moodObj = MOODS.find(m => m.e === mood);
        $('moodPanel').style.display = 'block';
        $('moodPanel').innerHTML = `<div class="mood-panel-title">${ds}</div><div style="display:flex;align-items:center;gap:8px;"><span style="font-size:32px;">${mood}</span><span style="color:var(--text2);">${moodObj ? moodObj.n : ''}</span></div>`;
      }
      // Past day without mood: do nothing
    });
  });
}

function showMoodPicker(ds, currentMood) {
  $('moodPanel').style.display = 'block';
  $('moodPanel').innerHTML = `
    <div class="mood-panel-title">${ds} · 记录心情</div>
    <div class="mood-options">
      ${MOODS.map((m, i) => `<div class="mood-opt${currentMood === m.e ? ' selected' : ''}" data-idx="${i}">${m.e} ${m.n}</div>`).join('')}
    </div>
    <button class="btn" id="moodSave" style="margin-top:10px;">确认</button>
  `;
  document.querySelectorAll('.mood-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.mood-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      state.selectedMood = parseInt(opt.dataset.idx);
    });
  });
  if (currentMood) {
    const idx = MOODS.findIndex(m => m.e === currentMood);
    if (idx >= 0) state.selectedMood = idx;
  }
  $('moodSave').addEventListener('click', async () => {
    if (state.selectedMood === null) { toast('请选择心情'); return; }
    await fetch(`${API}/checkins`, { method: 'POST', headers: headers(), body: JSON.stringify({ mood: MOODS[state.selectedMood].e }) });
    state.selectedMood = null; toast('已记录');
    await loadTodayData(); renderCalendar(); updateStats();
  });
}

// ====== Today ======
async function loadTodayData() {
  const [ciRes, strRes, wsRes, statsRes, allRes] = await Promise.all([
    fetch(`${API}/checkins/today`, { headers: headers() }),
    fetch(`${API}/checkins/streak`, { headers: headers() }),
    fetch(`${API}/diary/weekly`, { headers: headers() }),
    fetch(`${API}/stats`, { headers: headers() }),
    fetch(`${API}/checkins`, { headers: headers() }),
  ]);
  state.todayCheckin = await ciRes.json();
  state.streak = (await strRes.json()).streak;
  state.checkins = await allRes.json();
  const ws = await wsRes.json();
  const stats = await statsRes.json();

  $('todayStreak').innerHTML = `连续记录 <span class="streak-n">${state.streak}</span> 天`;

  const topMood = MOODS.find(m => m.e === ws.topMood);
  $('weeklyCard').innerHTML = `
    <h3>本周</h3>
    <div class="w-row"><span>记录</span><span class="w-val">${ws.checkinCount}/7</span></div>
    <div class="w-row"><span>日记</span><span class="w-val">${ws.diaryCount}</span></div>
    <div class="w-row"><span>笔记</span><span class="w-val">${ws.notesCount}</span></div>
    <div class="w-row"><span>心情</span><span class="w-val">${topMood ? topMood.e : '—'}</span></div>
    <div class="w-row"><span>字数</span><span class="w-val">${ws.totalWords}</span></div>
  `;
}

async function loadToday() {
  await loadTodayData();
  renderCalendar();
  $('moodPanel').style.display = 'none';
  state.selectedMood = null;
}

// ====== Notes ======
async function loadNotes() {
  const s = $('searchInput')?.value || '';
  const p = new URLSearchParams({ type: state.noteType });
  if (s) p.set('search', s);
  const r = await fetch(`${API}/notes?${p}`, { headers: headers() });
  state.notes = await r.json();
  renderNotes();
}

function renderNotes() {
  const grid = $('notesGrid'), empty = $('notesEmpty');
  if (!state.notes.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  const sorted = [...state.notes].sort((a, b) => { if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; return new Date(b.updatedAt) - new Date(a.updatedAt); });
  grid.innerHTML = sorted.map(n => `
    <div class="card ${n.pinned ? 'pinned' : ''}" onclick="openNote('${n.id}')">
      ${n.pinned ? '<span class="card-pin">·</span>' : ''}
      <div class="card-title">${esc(n.title)}</div>
      <div class="card-preview">${esc((n.content || '').slice(0, 150))}</div>
      ${(n.images || []).length ? `<div class="card-images">${n.images.slice(0,3).map(img => `<img src="${esc(img)}" loading="lazy">`).join('')}</div>` : ''}
      <div class="card-meta">
        <span class="card-type">${esc(n.type)}</span><span>${fmtDate(n.updatedAt)}</span>
        <span class="card-act" onclick="event.stopPropagation()">
          <button onclick="togglePin('${n.id}')">·</button>
          <button class="danger" onclick="deleteNote('${n.id}')">×</button>
        </span>
      </div>
    </div>`).join('');
}

function openNote(id) {
  const n = state.notes.find(x => x.id === id); if (!n) return;
  state.editing = { type: 'note', data: n };
  $('modalTitle').value = n.title;
  $('modalContent').value = n.content;
  buildMeta('note'); buildFoot('note'); $('modalOverlay').classList.add('open');
}

$('btnNewNote').addEventListener('click', () => {
  state.editing = { type: 'note', data: { id: '', title: '', content: '', type: state.noteType === 'all' ? '灵感' : state.noteType, tags: [], images: [], pinned: false } };
  $('modalTitle').value = ''; $('modalContent').value = '';
  buildMeta('note'); buildFoot('note'); $('modalOverlay').classList.add('open');
});

async function togglePin(id) {
  const n = state.notes.find(x => x.id === id); if (!n) return;
  await fetch(`${API}/notes/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ pinned: !n.pinned }) });
  loadNotes();
}
async function deleteNote(id) {
  if (!confirm('删除？')) return;
  await fetch(`${API}/notes/${id}`, { method: 'DELETE', headers: headers() });
  loadNotes(); updateStats(); toast('已删除');
}

function renderTypeChips() {
  const ts = [{ k: 'all', n: '全部' }, { k: '灵感', n: '灵感' }, { k: '日记', n: '随笔' }, { k: '草稿', n: '草稿' }, { k: '摘录', n: '摘录' }, { k: '其他', n: '其他' }];
  $('typeChips').innerHTML = ts.map(t => `<button class="chip ${state.noteType === t.k ? 'active' : ''}" data-t="${t.k}">${t.n}</button>`).join('');
  document.querySelectorAll('#typeChips .chip').forEach(c => {
    c.addEventListener('click', () => { state.noteType = c.dataset.t; loadNotes(); renderTypeChips(); });
  });
}
$('searchInput').addEventListener('input', () => { clearTimeout(state.sTimer); state.sTimer = setTimeout(loadNotes, 250); });

// ====== Image Upload ======
async function uploadImage(file) {
  const fd = new FormData(); fd.append('file', file);
  const r = await fetch(`${API}/upload`, { method: 'POST', headers: { 'X-Auth-Token': token }, body: fd });
  const d = await r.json();
  return d.url;
}

function bindImageUpload() {
  const fi = $('modalFileInput');
  fi.addEventListener('change', async () => {
    if (!fi.files.length) return;
    for (const f of fi.files) {
      const url = await uploadImage(f);
      if (state.editing?.data) {
        if (!state.editing.data.images) state.editing.data.images = [];
        state.editing.data.images.push(url);
      }
    }
    fi.value = '';
    renderModalImages();
  });
}

function renderModalImages() {
  const imgs = state.editing?.data?.images || [];
  let html = imgs.map((url, i) => `
    <div class="img-wrap">
      <img src="${esc(url)}">
      <button onclick="removeModalImage(${i})">×</button>
    </div>`).join('');
  html += '<div class="img-add" onclick="$(\'modalFileInput\').click()">+</div>';
  $('modalImages').innerHTML = html;
}

function removeModalImage(i) {
  if (state.editing?.data?.images) {
    state.editing.data.images.splice(i, 1);
    renderModalImages();
  }
}

// ====== Diary ======
async function loadDiary() { const r = await fetch(`${API}/diary`, { headers: headers() }); state.diary = await r.json(); renderDiary(); }
function renderDiary() {
  const l = $('diaryList'), e = $('diaryEmpty');
  if (!state.diary.length) { l.innerHTML = ''; e.style.display = 'block'; return; }
  e.style.display = 'none';
  l.innerHTML = state.diary.map(d => `
    <div class="diary-item" onclick="openDiary('${d.id}')">
      <div class="diary-emoji">${d.mood || '📝'}</div>
      <div class="diary-info"><div class="diary-date">${fmtDate(d.date)}</div><div class="diary-title">${esc(d.title)}</div><div class="diary-preview">${esc((d.content || '').slice(0, 100))}</div></div>
    </div>`).join('');
}
function openDiary(id) {
  const d = state.diary.find(x => x.id === id); if (!d) return;
  state.editing = { type: 'diary', data: d };
  $('modalTitle').value = d.title; $('modalContent').value = d.content;
  buildMeta('diary'); buildFoot('diary'); $('modalOverlay').classList.add('open');
}
$('btnNewDiary').addEventListener('click', () => {
  state.editing = { type: 'diary', data: { id: '', date: new Date().toISOString().slice(0, 10), title: '', content: '', mood: state.todayCheckin ? state.todayCheckin.mood : '', images: [] } };
  $('modalTitle').value = ''; $('modalContent').value = '';
  buildMeta('diary'); buildFoot('diary'); $('modalOverlay').classList.add('open');
});
async function deleteDiary(id) {
  if (!confirm('删除？')) return;
  await fetch(`${API}/diary/${id}`, { method: 'DELETE', headers: headers() });
  loadDiary(); updateStats(); toast('已删除');
}

// ====== Story ======
async function loadStory() {
  const r = await fetch(`${API}/story?dev=${isDev}`, { headers: headers() }); const d = await r.json();
  $('storyTitle').textContent = isDev ? '故事 · 创作者' : '故事';
  $('storyDevBtns').style.display = isDev ? 'flex' : 'none';
  const l = $('storyList'), e = $('storyEmpty');
  if (!d.chapters.length) { l.innerHTML = ''; e.style.display = 'block'; return; }
  e.style.display = 'none';
  l.innerHTML = d.chapters.map(c => {
    const ct = c.unlockCondition.type === 'always' ? '—' : c.unlockCondition.type === 'checkin_streak' ? `连续${c.unlockCondition.threshold}天` : c.unlockCondition.type === 'total_notes' ? `${c.unlockCondition.threshold}条笔记` : c.unlockCondition.type === 'total_diary' ? `${c.unlockCondition.threshold}篇日记` : c.unlockCondition.type === 'xp_reached' ? `${c.unlockCondition.threshold} XP` : '—';
    if (c.unlocked || isDev) return `<div class="story-chapter" onclick="openStory('${c.id}')"><div class="ch-order">${c.order}${c.read ? ' · 已读' : ''}</div><div class="ch-title">${esc(c.title)}</div><div class="ch-cond">${ct}</div>${isDev ? `<div class="ch-act" onclick="event.stopPropagation()"><button onclick="editStoryChapter('${c.id}')">编辑</button><button onclick="deleteStoryChapter('${c.id}')">删除</button></div>` : ''}</div>`;
    return `<div class="story-chapter locked"><div class="ch-order">${c.order}</div><div class="ch-title">···</div><div class="ch-cond">${ct}</div></div>`;
  }).join('');
}
async function openStory(id) {
  const r = await fetch(`${API}/story/${id}?dev=${isDev}`, { headers: headers() });
  if (r.status === 403) { toast('尚未解锁'); return; }
  const s = await r.json();
  $('storyBody').innerHTML = `<h2>${esc(s.title)}</h2>${s.content}`;
  $('storyOverlay').classList.add('open');
}
$('storyClose').addEventListener('click', () => $('storyOverlay').classList.remove('open'));
$('storyOverlay').addEventListener('click', e => { if (e.target === $('storyOverlay')) $('storyOverlay').classList.remove('open'); });
$('btnNewStory').addEventListener('click', () => {
  state.editing = { type: 'story', data: { id: '', title: '', content: '', order: 0, unlockCondition: { type: 'always', threshold: 0 } } };
  $('modalTitle').value = ''; $('modalContent').value = '';
  buildMeta('story'); buildFoot('story'); $('modalOverlay').classList.add('open');
});
function editStoryChapter(id) {
  fetch(`${API}/story?dev=true`, { headers: headers() }).then(r => r.json()).then(d => {
    const c = d.chapters.find(x => x.id === id); if (!c) return;
    state.editing = { type: 'story', data: { id: c.id, title: c.title, content: c.content, order: c.order, unlockCondition: c.unlockCondition } };
    $('modalTitle').value = c.title; $('modalContent').value = c.content;
    buildMeta('story'); buildFoot('story'); $('modalOverlay').classList.add('open');
  });
}
async function deleteStoryChapter(id) {
  if (!confirm('删除？')) return;
  await fetch(`${API}/story/${id}`, { method: 'DELETE', headers: headers() });
  loadStory(); toast('已删除');
}

// ====== Growth ======
async function loadGrowth() {
  const r = await fetch(`${API}/growth`, { headers: headers() }); const g = await r.json();
  let cur = LEVELS[0];
  for (const l of LEVELS) { if (g.xp >= l.xp) cur = l; }
  const nxt = LEVELS.find(l => l.xp > g.xp);
  const prog = nxt ? Math.round((g.xp - cur.xp) / (nxt.xp - cur.xp) * 100) : 100;
  $('growthStage').innerHTML = `
    <div class="stage-icon">${cur.lv}</div>
    <div class="stage-info">
      <div class="stage-name">${cur.name}</div>
      <div class="stage-sub">${nxt ? `距「${nxt.name}」还需 ${nxt.xp - g.xp} XP` : '已达顶峰'}</div>
      <div class="stage-track"><div class="stage-fill" style="width:${prog}%"></div></div>
      <div class="stage-xp">${g.xp} / ${nxt ? nxt.xp : g.xp} XP</div>
    </div>`;

  const ach = ACHS.map(a => {
    const earned = g.achievements.find(e => e.id === a.id);
    return `<div class="ach-item ${earned ? 'earned' : 'locked'}"><span class="ach-icon">${a.icon}</span><span>${earned ? a.name : '???'}</span></div>`;
  }).join('');

  const met = `<div class="metric"><div class="m-val">${g.stats.totalNotes}</div><div class="m-lbl">笔记</div></div><div class="metric"><div class="m-val">${g.stats.totalDiary}</div><div class="m-lbl">日记</div></div><div class="metric"><div class="m-val">${g.stats.totalCheckins}</div><div class="m-lbl">记录天</div></div><div class="metric"><div class="m-val">${g.stats.streak}</div><div class="m-lbl">连续</div></div>`;

  const log = g.xpHistory.length
    ? g.xpHistory.slice(0, 12).map(e => `<div class="xp-entry"><span>${fmtDate(e.date)} ${esc(e.source)}</span><span class="xp-amt">+${e.amount}</span></div>`).join('')
    : '<div style="color:var(--text3);font-size:12px;">尚无记录</div>';

  $('growthDetail').innerHTML = `<div><h3>徽章</h3><div class="ach-grid">${ach}</div></div><div><h3>统计</h3><div class="metrics">${met}</div></div><div><h3>经验</h3><div class="xp-log">${log}</div></div>`;
}

// ====== Reminders ======
async function loadReminders() { const r = await fetch(`${API}/reminders`, { headers: headers() }); state.reminders = await r.json(); renderReminders(); }
function renderReminders() {
  const l = $('remindersList'), e = $('remindersEmpty');
  if (!state.reminders.length) { l.innerHTML = ''; e.style.display = 'block'; return; }
  e.style.display = 'none';
  l.innerHTML = [...state.reminders].sort((a, b) => a.done - b.done).map(r => `
    <div class="todo-item ${r.done ? 'done' : ''}">
      <div class="todo-check" onclick="toggleReminder('${r.id}')"></div>
      <div class="todo-info"><div class="todo-title">${esc(r.title)}</div><div class="todo-date">${r.datetime ? fmtDate(r.datetime, true) : ''}</div></div>
      <button class="todo-del" onclick="deleteReminder('${r.id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`).join('');
}
async function toggleReminder(id) {
  const r = state.reminders.find(x => x.id === id); if (!r) return;
  await fetch(`${API}/reminders/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ done: !r.done }) });
  loadReminders(); updateStats();
}
async function deleteReminder(id) {
  await fetch(`${API}/reminders/${id}`, { method: 'DELETE', headers: headers() });
  loadReminders(); updateStats(); toast('已删除');
}
$('btnNewReminder').addEventListener('click', () => {
  state.editing = { type: 'reminder', data: { id: '', title: '', datetime: '' } };
  $('modalTitle').value = ''; $('modalContent').value = '';
  buildMeta('reminder'); buildFoot('reminder'); $('modalOverlay').classList.add('open');
});

// ====== Modal ======
function buildMeta(type) {
  const d = state.editing?.data || {};
  $('modalContent').style.display = '';
  $('modalImages').style.display = 'none';
  if (type === 'note') {
    $('modalMeta').innerHTML = `<select id="mType">${['灵感','日记','草稿','摘录','其他'].map(t => `<option value="${t}" ${d.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select><input type="text" id="mTags" value="${(d.tags || []).join(',')}" placeholder="标签" style="flex:1;">`;
    $('modalImages').style.display = 'flex'; renderModalImages();
  } else if (type === 'diary') {
    $('modalMeta').innerHTML = `<input type="date" id="mDate" value="${d.date || new Date().toISOString().slice(0, 10)}"><select id="mMood"><option value="">无</option>${MOODS.map(m => `<option value="${m.e}" ${d.mood === m.e ? 'selected' : ''}>${m.e} ${m.n}</option>`).join('')}</select>`;
    $('modalImages').style.display = 'flex'; renderModalImages();
  } else if (type === 'reminder') {
    $('modalMeta').innerHTML = `<input type="datetime-local" id="mDt" value="${d.datetime || ''}">`;
  } else if (type === 'story') {
    const c = d.unlockCondition || { type: 'always', threshold: 0 };
    $('modalMeta').innerHTML = `<input type="number" id="mOrder" value="${d.order || ''}" placeholder="序号" style="width:48px;"><select id="mCond"><option value="always" ${c.type === 'always' ? 'selected' : ''}>无条件</option><option value="checkin_streak" ${c.type === 'checkin_streak' ? 'selected' : ''}>连续打卡</option><option value="total_notes" ${c.type === 'total_notes' ? 'selected' : ''}>累计笔记</option><option value="total_diary" ${c.type === 'total_diary' ? 'selected' : ''}>累计日记</option><option value="xp_reached" ${c.type === 'xp_reached' ? 'selected' : ''}>XP</option></select><input type="number" id="mCondV" value="${c.threshold}" placeholder="阈值" style="width:64px;" min="0">`;
  }
}
function buildFoot(type) {
  $('modalFooter').innerHTML = `${state.editing?.data?.id ? '<button class="btn-del" id="mDel">删除</button>' : '<span></span>'}<button class="btn-save" id="mSave">保存</button>`;
  $('mSave').addEventListener('click', () => saveModal(type));
  if (state.editing?.data?.id) $('mDel').addEventListener('click', () => {
    if (type === 'note') deleteNote(state.editing.data.id);
    else if (type === 'diary') deleteDiary(state.editing.data.id);
    else if (type === 'reminder') deleteReminder(state.editing.data.id);
    else if (type === 'story') deleteStoryChapter(state.editing.data.id);
    closeModal();
  });
}
async function saveModal(type) {
  const t = $('modalTitle').value.trim(), c = $('modalContent').value;
  if (type === 'note') {
    const d = { title: t || '无标题', content: c, type: $('mType')?.value || '灵感', tags: ($('mTags')?.value || '').split(',').map(s => s.trim()).filter(Boolean), images: state.editing.data.images || [] };
    const method = state.editing.data.id ? 'PUT' : 'POST';
    const url = state.editing.data.id ? `${API}/notes/${state.editing.data.id}` : `${API}/notes`;
    await fetch(url, { method, headers: headers(), body: JSON.stringify(d) });
    closeModal(); loadNotes(); updateStats(); toast('已保存');
  } else if (type === 'diary') {
    const d = { title: t || '日记', content: c, date: $('mDate')?.value || new Date().toISOString().slice(0, 10), mood: $('mMood')?.value || '', images: state.editing.data.images || [] };
    const method = state.editing.data.id ? 'PUT' : 'POST';
    const url = state.editing.data.id ? `${API}/diary/${state.editing.data.id}` : `${API}/diary`;
    await fetch(url, { method, headers: headers(), body: JSON.stringify(d) });
    closeModal(); loadDiary(); updateStats(); toast('已保存');
  } else if (type === 'reminder') {
    const d = { title: t || '提醒', datetime: $('mDt')?.value || null };
    const method = state.editing.data.id ? 'PUT' : 'POST';
    const url = state.editing.data.id ? `${API}/reminders/${state.editing.data.id}` : `${API}/reminders`;
    await fetch(url, { method, headers: headers(), body: JSON.stringify(d) });
    closeModal(); loadReminders(); updateStats(); toast('已保存');
  } else if (type === 'story') {
    const ct = $('mCond').value;
    const d = { title: t || '新章节', content: c, order: parseInt($('mOrder')?.value) || 0, unlockCondition: { type: ct, threshold: ct === 'always' ? 0 : (parseInt($('mCondV')?.value) || 0) } };
    const method = state.editing.data.id ? 'PUT' : 'POST';
    const url = state.editing.data.id ? `${API}/story/${state.editing.data.id}` : `${API}/story`;
    await fetch(url, { method, headers: headers(), body: JSON.stringify(d) });
    closeModal(); loadStory(); toast('已保存');
  }
}
function closeModal() {
  $('modalOverlay').classList.remove('open');
  state.editing = null;
  $('modalTitle').value = ''; $('modalContent').value = '';
  $('modalImages').style.display = 'none';
}
$('modalClose').addEventListener('click', closeModal);
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('storyOverlay').classList.remove('open'); } });

// ====== Stats ======
async function updateStats() {
  const r = await fetch(`${API}/stats`, { headers: headers() }); const s = await r.json();
  $('badgeNotes').textContent = s.totalNotes;
  $('badgeDiary').textContent = s.totalDiary;
  $('badgeReminders').textContent = s.pendingReminders;
  try {
    const sr = await fetch(`${API}/story`, { headers: headers() }); const sd = await sr.json();
    $('badgeStory').textContent = sd.chapters.filter(c => c.unlocked).length;
  } catch (e) {}
  $('drawerStats').innerHTML = `${s.streak}天 · ${s.xp}XP<br>${s.totalNotes}笔记 · ${s.totalDiary}日记`;
}

// ====== Utils ======
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(iso, st) {
  if (!iso) return '';
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  const dt = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return st ? `${dt} ${p(d.getHours())}:${p(d.getMinutes())}` : dt;
}

// ====== Init ======
async function initApp() {
  initDrawer();
  initNav();
  bindImageUpload();
  renderTypeChips();
  await loadToday();
  updateStats();
  if (window.innerWidth <= 768) {
    setTimeout(() => {
      $('drawer').classList.add('collapsed');
      $('drawerExpand').classList.add('visible');
    }, 300);
  }
}
