// ====== Day-Day · 观星台 ======
// Serverless — IndexedDB + 本地月相计算 + 客户端认证
const $ = id => document.getElementById(id);

// Invite codes: lemonking=full, moonlight=lite
const FULL_KEY = 'lemonking';
const LITE_KEY = 'moonlight';
let isLite = false;

let db, auth, moonCalc, birthday, ledger, sky, moon3d;
let mythologyLocal = [];

const MOON_PHASES = [
  { id:'full',         e:'🌕', n:'满月',   mood:'epic' },
  { id:'waning_cresc', e:'🌘', n:'残月',   mood:'reflective' },
  { id:'new_moon',     e:'🌑', n:'朔月',   mood:'mystery' },
  { id:'last_q',       e:'🌗', n:'下弦月', mood:'contemplative' },
  { id:'wax_gibb',     e:'🌔', n:'盈凸月', mood:'motivational' },
  { id:'wan_gibb',     e:'🌖', n:'亏凸月', mood:'gratitude' },
  { id:'wax_cresc',    e:'🌒', n:'蛾眉月', mood:'hope' },
  { id:'first_q',      e:'🌓', n:'上弦月', mood:'calm' },
];

// 等级曲线：几何级数 ×~2.1，与真实观测里程碑挂钩（参考 Astrophy / TA.Starquest 的等级设计）
const LEVELS = [
  { lv:1, name:'肉眼观测者',   xp:0 },
  { lv:2, name:'寻星学徒',     xp:80 },
  { lv:3, name:'双筒镜手',     xp:180 },
  { lv:4, name:'星座绘师',     xp:400 },
  { lv:5, name:'梅西耶猎手',   xp:800 },
  { lv:6, name:'深空探索者',   xp:1600 },
  { lv:7, name:'织光者',       xp:3200 },
];

// Hidden reward stories unlocked at each level
const LEVEL_REWARDS = {
  2: { title:'寻星学徒的第一课', content:'寻星从北极星开始。把北斗七星斗口的两颗星——天枢与天璇——连成一线，向斗口方向延伸约五倍，落点便是勾陈一，北极星。它距北天极不足一度，千年来为夜航者指明方向。《淮南子》有言："斗柄东指，天下皆春。"北斗的勺柄四季轮转，是最古老的钟表，也是最古老的历书。今夜起，天空对你不再陌生：每一颗星都有名字，而你已学会叫出它们。', source:'星门秘藏 · Lv.2解锁' },
  3: { title:'双筒镜下的月海', content:'当你第一次将双筒望远镜对准月球，那些曾经只是阴影的斑块突然显现为广阔的玄武岩平原。月海（Mare）并非真正的水域，而是数十亿年前小行星撞击形成的熔岩盆地。伽利略在1610年首次记录下这些地貌时，称之为"斑驳的明暗"。每一处月海都有名字：静海、雨海、风暴洋——它们是大洪水神话在月球表面的回响。观测者啊，从今天起，月亮对你而言不再是一个圆盘，而是一片等待探索的大陆。', source:'星门秘藏 · Lv.3解锁' },
  4: { title:'星图的秘密几何', content:'古人将恒星连成图案，编织出88个星座。但星座之间的空间并非虚空——它由看不见的暗物质纤维连接，形成宇宙网。就像绘星阁中你收集的每一张星图，它们看似独立，实则通过同一个观测者的生命串联成独特的星轨。托勒密的48星座、中国三垣二十八宿、阿拉伯星表——每一套星图都是一套不同的世界叙事。而你，正在绘制属于自己的那一套。', source:'星门秘藏 · Lv.4解锁' },
  5: { title:'深空天体的低语', content:'在肉眼可见的最暗夜空之外，隐藏着数以千计的星云、星团和星系。M31仙女座星系的光走了254万年才抵达你的眼睛——你看到的，是它254万年前的样子。恒星在星云中诞生，又在超新星爆发中归还元素。我们的身体由星尘构成：血液中的铁来自远古超新星，骨骼中的钙诞生于白矮星的熔炉。观测深空，不过是在回望自己的起源。探索者，你已拥有看见这些的眼睛。', source:'星门秘藏 · Lv.5解锁' },
  6: { title:'暗物质猎人的手记', content:'我们能看到的物质——恒星、行星、星云——只占宇宙总质量的5%。剩下95%是暗物质和暗能量，它们不与光相互作用，却用引力塑造了星系的结构。就像记忆中那些不曾记录却深刻影响人生的瞬间：它们不发光，但牵引着一切。兹威基在1933年发现后发座星系团运动异常，首次预言了暗物质的存在。看不见的，往往是最强大的。猎手，去追踪那些不可见的力量吧。', source:'星门秘藏 · Lv.6解锁' },
  7: { title:'织光者的最终观测', content:'你已走过了从肉眼到暗物质的全部旅程。现在回头望去，每一次打卡记录、每一篇摘录、每一段星轨，都像是宇宙大爆炸后散布的光子——它们各自独立飞行，却共同讲述着一个故事。卡尔·萨根说："我们是由星尘组成的。"但更准确地说，我们是宇宙认识自己的一种方式。你记录的不是数据，而是一个星系中短暂而灿烂的意识火花。织光者，继续观测吧——因为观看本身，就是在编织光。', source:'星门秘藏 · Lv.7解锁' },
};

function checkLevelRewards(currentLv) {
  const unlocked = getUnlockedRewards();
  const prevLv = parseInt(localStorage.getItem('dayday_prev_level') || '1');
  let changed = false;
  for (let lv = 2; lv <= currentLv; lv++) {
    if (!unlocked.includes(lv) && LEVEL_REWARDS[lv]) {
      unlocked.push(lv);
      changed = true;
      // Only toast if this is a genuine level-up (not first load)
      if (lv > prevLv) {
        toast('达到 Lv.' + lv + '，解锁秘藏故事：' + LEVEL_REWARDS[lv].title);
      }
    }
  }
  if (changed) {
    localStorage.setItem('dayday_unlocked_rewards', JSON.stringify(unlocked));
  }
  if (currentLv > prevLv) {
    localStorage.setItem('dayday_prev_level', currentLv.toString());
  }
}
function getUnlockedRewards() {
  try { return JSON.parse(localStorage.getItem('dayday_unlocked_rewards') || '[]'); } catch(e) { return []; }
}
function getUnlockedStories() {
  const rewards = getUnlockedRewards();
  return rewards.map(lv => ({ id: 'reward_lv' + lv, ...LEVEL_REWARDS[lv] })).filter(Boolean);
}

// ====== 星尘勋章（成就系统，真实观测行为驱动） ======
const ACHIEVEMENTS = [
  { id:'first_moon',  name:'初见月面', desc:'凝视 NASA 实拍月面' },
  { id:'first_sky',   name:'初识星空', desc:'打开今夜星空' },
  { id:'first_const', name:'点亮首座', desc:'点亮第一个星座' },
  { id:'const_10',    name:'星座绘师', desc:'点亮 10 个星座' },
  { id:'phase_round', name:'月相轮回', desc:'铭刻全部 8 种月相' },
  { id:'messier_5',   name:'深空初探', desc:'观测 5 个梅西耶天体' },
  { id:'streak_7',    name:'七日连观', desc:'连续观测 7 天' },
  { id:'level_5',     name:'猎手之名', desc:'达到 Lv.5 梅西耶猎手' },
];
let unlockedAch = [];
async function refreshAchievements() {
  const g = await db.growth.get();
  unlockedAch = g.achievements || [];
  return unlockedAch;
}
async function unlockAchievement(id) {
  if (unlockedAch.includes(id)) return false;
  unlockedAch.push(id);
  await db.growth.setMeta({ achievements: unlockedAch });
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (def) toast('成就解锁 · ' + def.name);
  renderAchievements();
  return true;
}
function renderAchievements() {
  const el = $('achievementsGrid');
  if (!el) return;
  el.innerHTML = ACHIEVEMENTS.map(a => {
    const on = unlockedAch.includes(a.id);
    return `<div class="ach-badge${on ? ' on' : ''}" title="${esc(a.desc)}"><span class="ach-star">✦</span><span class="ach-name">${esc(a.name)}</span></div>`;
  }).join('');
}
async function xpOnce(key, amount, source) {
  const today = new Date().toISOString().slice(0, 10);
  let store = {};
  try { store = JSON.parse(localStorage.getItem('dayday_xp_once') || '{}'); } catch (e) {}
  if (store[key] === today) return false;
  store[key] = today;
  localStorage.setItem('dayday_xp_once', JSON.stringify(store));
  await db.growth.addXP(amount, source);
  return true;
}
async function discover(kind, id) {
  const g = await db.growth.get();
  const d = g.discoveries || { constellations: [], messier: [], phases: [] };
  const list = d[kind] || [];
  if (list.includes(id)) return false;
  d[kind] = list.concat(id);
  await db.growth.setMeta({ discoveries: d });
  return true;
}
async function getDiscoveries() {
  const g = await db.growth.get();
  return g.discoveries || { constellations: [], messier: [], phases: [] };
}
async function checkAchievements() {
  const d = await getDiscoveries();
  const li = levelInfo((await db.growth.get()).xp || 0);
  const checks = [
    ['phase_round', (d.phases || []).length >= 8],
    ['const_10', (d.constellations || []).length >= 10],
    ['messier_5', (d.messier || []).length >= 5],
    ['streak_7', (state.streak || 0) >= 7],
    ['level_5', li.lv >= 5],
  ];
  for (const [id, ok] of checks) if (ok) await unlockAchievement(id);
}
async function afterCheckin() {
  state.streak = await db.checkins.getStreak();
  if (state.streak >= 2) await xpOnce('streak_xp', Math.min(state.streak, 7), '连续观测 ' + state.streak + ' 天');
  await checkAchievements();
}

// Celestial name pools
const CELESTIAL_POOLS = {
  epic:          ['英仙','猎户','天狼','大角','参宿','心宿','北落','天船'],
  reflective:    ['织女','河鼓','南鱼','北落','天市','太微','紫微','华盖'],
  mystery:       ['暗物质','黑洞','脉冲','类星','星云','虚空','隐带','幽光'],
  contemplative: ['北斗','南极','拱极','天枢','瑶光','开阳','玉衡','天璇'],
  motivational:  ['天鹰','天鹅','天箭','牧夫','御夫','武仙','飞马','麒麟'],
  gratitude:     ['天鸽','凤凰','仙后','天琴','孔雀','仙王','天鹤','宝瓶'],
  hope:          ['启明','长庚','南极老人','文昌','贯索','阁道','天棓','梗河'],
  calm:          ['太阴','嫦娥','玉兔','蟾宫','广寒','望舒','桂魄','冰轮'],
};
const CELESTIAL_SUFFIXES = ['星使','旅者','守望者','信使','行者','引航者','绘师','观者','游侠','织梦人'];

let token = localStorage.getItem('nox_token') || '';
let state = {
  panel: 'stargaze', notes: [], diary: [], reminders: [], checkins: [],
  todayCheckin: null, streak: 0, noteType: 'all',
  skyFsCons: [], skyLitCons: [],
  calYear: 0, calMonth: 0, selectedMoon: null,
  editing: null, sTimer: null,
  storyTab: 'collection', profile: null,
  moonData: null, birthdayInfo: null,
  obs: null, skyTimer: null,
  excerptContext: null,
  notesPage: 0, notesHasMore: true, notesTotal: 0, PAGE_SIZE: 30,
};
window.state = state; // 供测试/调试断言

// ====== Module bootstrap ======
async function loadModules() {
  db = (await import('../client/db.js')).default;
  auth = (await import('../client/auth.js')).default;
  moonCalc = (await import('../client/moon-calc.js')).default;
  birthday = (await import('../client/birthday.js')).default;
  ledger = (await import('../client/ledger.js')).default;
  ledger.init({ db, toast, onSave: () => xpOnce('ledger_xp', 1, '记账') });
  sky = (await import('../client/star-chart.js')).default;
  moon3d = (await import('../client/moon-3d.js')).default;
  moon3d.preloadMoonTexture(); // 预热月面纹理（渲染时秒出）
  // Load local mythology
  try {
    const r = await fetch('data/mythology.json');
    if (r.ok) mythologyLocal = await r.json();
  } catch(e) { mythologyLocal = []; }
  if (isLite) mythologyLocal = mythologyLocal.slice(0, 8); // limit stories in lite
  // 启动完整性检查：数据库损坏时尝试从最近备份恢复
  try {
    await db.stats();
  } catch (e) {
    console.error('DB health check failed:', e);
    await recoverCorruptedDb();
  }
}

// ====== Auth ======
let isSetupMode = false; // false=解锁, true=设置密钥
if (token) tryAutoLogin(); else showLogin();

async function tryAutoLogin() {
  try {
    isLite = (token === 'lite-unlocked');
    await loadModules();
    if (db) db.setScope(isLite ? 'lite' : 'full');
    const user = await auth.getMe(token);
    if (user) { await showApp(); return; }
  } catch(e) {}
  localStorage.removeItem('nox_token');
  token = '';
  showLogin();
}

async function showLogin() {
  if (!db) await loadModules();
  $('loginScreen').style.display = 'flex';
  $('app').style.display = 'none';
  $('loginKey').value = '';
  $('loginHint').textContent = '';
  $('loginHint').className = 'login-hint';
  try {
    const isSetup = await auth.isSetup();
    isSetupMode = !isSetup;
    setKeyMode(isSetupMode);
  } catch(e) {
    isSetupMode = true;
    setKeyMode(true);
  }
}

async function showApp() {
  $('loginScreen').style.display = 'none';
  $('app').style.display = 'flex';

  if (token === 'lite-unlocked') isLite = true;
  else isLite = false;

  // Set db scope for data isolation: lite data visible in full, full data hidden in lite
  if (db) db.setScope(isLite ? 'lite' : 'full');

  if (isLite) {
    $('demoBadge').style.display = 'block';
    $('demoBadge').textContent = 'moonlight';
    mythologyLocal = mythologyLocal.slice(0, 8);
  } else {
    $('demoBadge').style.display = 'none';
    // Reload full mythology (may have been sliced by a previous lite session)
    try {
      const r = await fetch('data/mythology.json');
      if (r.ok) mythologyLocal = await r.json();
    } catch(e) {}
  }

  await initApp();
  // Check if onboarding needed
  const onboardDone = await db.settings.get('onboard_done');
  if (!onboardDone) showOnboard();
  // 自动备份（每日首次启动，空库跳过）
  setTimeout(() => autoBackup(), 2500);
}

// ====== Onboarding (首次设置名字和头像) ======
function showOnboard() {
  $('onboardName').value = state.profile?.displayName || '';
  $('onboardOverlay').classList.add('open');
  $('btnOnboardDone').focus();
}

$('onboardFileInput').addEventListener('change', () => {
  const file = $('onboardFileInput').files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      $('onboardAvatar').innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      state._onboardAvatar = e.target.result;
    };
    reader.readAsDataURL(file);
  }
});

$('btnOnboardDone').addEventListener('click', async () => {
  const name = $('onboardName').value.trim() || '观测者';
  try {
    await db.profile.update({
      displayName: name,
      avatar: state._onboardAvatar || null,
    });
    state.profile = await db.profile.get();
    renderProfile();
  } catch(e) { console.error('Profile update failed:', e); }
  $('onboardOverlay').classList.remove('open');
  await db.settings.set('onboard_done', '1');
  // Start nav tutorial
  startTour();
});

// Also allow Enter to confirm
$('onboardName').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnOnboardDone').click(); });

// ====== 导航引导 Tour ======
const TOUR_STEPS = [
  { icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><polyline points="12 2 12 6"/><polyline points="12 18 12 22"/><polyline points="2 12 6 12"/><polyline points="18 12 22 12"/></svg>', title:'观星台', desc:'每日月相打卡\n查看实时月相和日历', panel:'stargaze' },
  { icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', title:'绘星阁', desc:'记录灵感、随笔、摘录\n你的私人星图笔记', panel:'starchart' },
  { icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', title:'时光星轨', desc:'写日记，回顾每一天\n星轨即是你的时间线', panel:'startrail' },
  { icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>', title:'神话书库', desc:'根据月相推送星辰故事\n收藏你喜欢的篇章', panel:'myth' },
  { icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>', title:'星系图鉴', desc:'查看成长等级和星尘积累\n你的个人星系演化', panel:'galaxy' },
  { icon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12"/><circle cx="12" cy="12" r="2"/></svg>', title:'坐标日志', desc:'设定目标和提醒\n记录人生航向', panel:'navigate' },
];

let tourStep = 0;
function startTour() {
  tourStep = 0;
  $('tourOverlay').style.display = 'block';
  showTourStep(0);
}

function showTourStep(i) {
  const s = TOUR_STEPS[i];
  $('tourTipIcon').innerHTML = s.icon;
  $('tourTipTitle').textContent = s.title;
  $('tourTipDesc').textContent = s.desc;
  $('tourDots').innerHTML = TOUR_STEPS.map((_, j) => `<span class="${j === i ? 'active' : ''}"></span>`).join('');
  $('tourNext').textContent = i === TOUR_STEPS.length - 1 ? '开启星程' : '下一步';
  $('tourSkip').style.display = i === TOUR_STEPS.length - 1 ? 'none' : '';
  // Navigate to that panel
  if (state.panel !== s.panel) {
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    const link = document.querySelector(`.nav-link[data-panel="${s.panel}"]`);
    if (link) link.classList.add('active');
    state.panel = s.panel;
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${s.panel}`);
    if (panel) panel.classList.add('active');
  }
}

$('tourNext').addEventListener('click', () => {
  if (tourStep < TOUR_STEPS.length - 1) {
    tourStep++;
    showTourStep(tourStep);
  } else {
    endTour();
  }
});
$('tourSkip').addEventListener('click', endTour);
function endTour() {
  $('tourOverlay').style.display = 'none';
  // Return to stargaze
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  const link = document.querySelector('.nav-link[data-panel="stargaze"]');
  if (link) link.classList.add('active');
  state.panel = 'stargaze';
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  $('panel-stargaze').classList.add('active');
  if (window.innerWidth <= 768) {
    $('drawer').classList.add('collapsed');
    $('drawerExpand').classList.add('visible');
  }
  toast('星图已展开，开始观测吧');
}

function setKeyMode(isSetup) {
  isSetupMode = isSetup;
  $('loginTitle').textContent = isSetup ? '设定星门密钥' : '叩启星门';
  $('loginSubtitle').textContent = isSetup ? '设定一个只有你知道的密钥，守护你的星河' : '每颗星辰都是一段神话，每次观测都是一次重逢';
  $('btnUnlock').textContent = isSetup ? '铺设星轨' : '叩启星门';
  $('loginHint').textContent = '';
  $('loginHint').className = 'login-hint';
  $('resetLink').style.display = isSetup ? 'none' : '';
}

$('pwToggle').addEventListener('click', () => {
  const input = $('loginKey');
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  $('eyeOff').style.display = isPass ? 'none' : '';
  $('eyeOn').style.display = isPass ? '' : 'none';
});

async function doAuth() {
  if (!db) await loadModules();
  const key = $('loginKey').value;
  if (!key || key.length < 4) { $('loginHint').textContent = '密钥至少4位'; $('loginHint').className = 'login-hint error'; return; }

  // Invite codes bypass normal auth
  if (key === FULL_KEY) {
    isLite = false;
    db.setScope('full');
    token = 'full-unlocked';
    localStorage.setItem('nox_token', token);
    await showApp();
    return;
  }
  if (key === LITE_KEY) {
    isLite = true;
    db.setScope('lite');
    token = 'lite-unlocked';
    localStorage.setItem('nox_token', token);
    await showApp();
    return;
  }

  $('loginHint').textContent = '叩启星门中...';
  $('loginHint').className = 'login-hint';

  try {
    // Self-diagnose: check if key has been set up, instead of relying on stale isSetupMode
    const alreadySetup = await auth.isSetup();
    if (!alreadySetup) {
      await auth.setupKey(key);
      $('loginHint').textContent = '星轨已铺设，叩启星门...';
      $('loginHint').className = 'login-hint success';
      await new Promise(r => setTimeout(r, 600));
    }
    const result = await auth.unlock(key);
    token = result.token;
    localStorage.setItem('nox_token', token);
    isLite = false;
    if (db) db.setScope('full');
    await showApp();
  } catch(e) {
    console.error('Auth error:', e);
    $('loginHint').textContent = e.message || '星门震荡，再试一次';
    $('loginHint').className = 'login-hint error';
  }
}

$('btnUnlock').addEventListener('click', doAuth);
$('loginKey').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
// Logout
$('btnLogout').addEventListener('click', () => { localStorage.removeItem('nox_token'); token = ''; state.profile = null; showLogin(); });
// Reset
$('resetLink').addEventListener('click', async () => {
  if (!confirm('确定重置？所有记录将清空，不可恢复。')) return;
  if (!db) await loadModules();
  await auth.reset();
  token = '';
  localStorage.removeItem('nox_token');
  $('loginKey').value = '';
  showLogin();
  toast('已重置');
});

// ====== Profile ======
async function loadProfile() {
  try {
    state.profile = await db.profile.get();
    renderProfile();
  } catch(e) {}
}

function renderProfile() {
  const p = state.profile || {};
  $('profileName').textContent = p.displayName || '观测者';
  if (p.celestialName) {
    $('profileCelestial').textContent = '· ' + p.celestialName;
    $('profileCelestial').style.display = '';
  } else {
    $('profileCelestial').style.display = 'none';
  }
  const av = $('profileAvatar');
  if (p.avatar) {
    av.innerHTML = `<img src="${esc(p.avatar)}" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    av.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="10"/></svg>';
  }
}

window.editProfile = function() {
  if (!state.profile) return;
  const pav = $('profileAvatarEdit');
  if (state.profile.avatar) {
    pav.innerHTML = `<img src="${esc(state.profile.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    pav.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="10"/></svg>';
  }
  $('profileDisplayName').value = state.profile.displayName || '';
  // Birthday fields
  const bd = state.profile.birthDate || '';
  $('profileBirthDate').value = bd;
  $('profileCalendarType').value = state.profile.calendarType || 'solar';
  updateLunarPreview();
  // Observation location
  getObsLocation().then(loc => {
    $('profileCity').value = loc.city || '';
    $('profileLat').value = loc.lat;
    $('profileLon').value = loc.lon;
  });
  // Astronomy API keys
  Promise.all([db.settings.get('nasa_key'), db.settings.get('astro_api_id'), db.settings.get('astro_api_secret')]).then(([nk, aid, asec]) => {
    $('profileNasaKey').value = nk || '';
    $('profileAstronomyId').value = aid || '';
    $('profileAstronomySecret').value = asec || '';
  }).catch(() => {});
  $('profileOverlay').classList.add('open');
};

function updateLunarPreview() {
  const bd = $('profileBirthDate').value;
  const ct = $('profileCalendarType').value;
  const el = $('birthdayLunarPreview');
  if (!bd) { el.style.display = 'none'; return; }
  try {
    if (ct === 'lunar') {
      const preview = birthday.getBirthdayPreview(bd, 'lunar');
      el.textContent = preview.label + (preview.note ? ' · ' + preview.note : '');
      el.style.display = '';
    } else {
      const preview = birthday.getBirthdayPreview(bd, 'solar');
      el.textContent = preview.note;
      el.style.display = '';
    }
  } catch(e) { el.style.display = 'none'; }
}

$('profileBirthDate').addEventListener('change', updateLunarPreview);
$('profileCalendarType').addEventListener('change', updateLunarPreview);

$('profileClose').addEventListener('click', () => $('profileOverlay').classList.remove('open'));
$('profileOverlay').addEventListener('click', e => { if (e.target === $('profileOverlay')) $('profileOverlay').classList.remove('open'); });

$('btnSaveProfile').addEventListener('click', async () => {
  const name = $('profileDisplayName').value.trim();
  const birthDate = $('profileBirthDate').value;
  const calendarType = $('profileCalendarType').value;
  const avatar = $('profileFileInput').files[0];
  let avatarUrl = state.profile?.avatar || null;

  if (avatar) {
    avatarUrl = await readFileAsDataURL(avatar);
  }

  await db.profile.update({
    displayName: name || null,
    avatar: avatarUrl,
    birthDate: birthDate || null,
    calendarType: calendarType || 'solar',
  });
  state.profile = await db.profile.get();
  // Observation location
  const lat = parseFloat($('profileLat').value);
  const lon = parseFloat($('profileLon').value);
  const city = $('profileCity').value.trim();
  if (isFinite(lat) && Math.abs(lat) <= 90) await db.settings.set('obs_lat', String(lat));
  if (isFinite(lon) && Math.abs(lon) <= 180) await db.settings.set('obs_lon', String(lon));
  if (city) await db.settings.set('obs_city', city);
  // Astronomy API keys（空值清除）
  await db.settings.set('nasa_key', $('profileNasaKey').value.trim() || null);
  await db.settings.set('astro_api_id', $('profileAstronomyId').value.trim() || null);
  await db.settings.set('astro_api_secret', $('profileAstronomySecret').value.trim() || null);
  state.obs = null; // 让下次读取重新加载
  renderSkyCard();
  renderProfile();
  $('profileOverlay').classList.remove('open');
  toast('星轨档案已更新');
});

$('btnLocate').addEventListener('click', async () => {
  toast('正在获取位置…');
  // 1) 原生 Capacitor Geolocation（Android 13+ 由插件弹运行时权限）
  const geo = window.capacitorGeolocation?.Geolocation;
  if (geo && window.Capacitor?.isNativePlatform?.()) {
    try {
      let perm = await geo.checkPermissions();
      if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
        perm = await geo.requestPermissions();
      }
      if (perm.location !== 'granted') { toast('定位权限未开启，可手动填写坐标'); return; }
      const pos = await geo.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 });
      fillLatLon(pos.coords.latitude, pos.coords.longitude);
      return;
    } catch (e) { console.warn('native locate failed:', e); }
  }
  // 2) 浏览器降级 navigator.geolocation
  if (!navigator.geolocation) { toast('当前设备不支持定位'); return; }
  navigator.geolocation.getCurrentPosition(
    pos => fillLatLon(pos.coords.latitude, pos.coords.longitude),
    () => toast('定位失败，可手动填写坐标'),
    { timeout: 8000 }
  );
});

function fillLatLon(lat, lon) {
  $('profileLat').value = lat.toFixed(4);
  $('profileLon').value = lon.toFixed(4);
  toast('已获取坐标，可补充城市名');
}

$('profileFileInput').addEventListener('change', () => {
  const file = $('profileFileInput').files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      $('profileAvatarEdit').innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    };
    reader.readAsDataURL(file);
  }
});

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

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
  // Free heavy memory from panels we're leaving
  if (state.panel !== 'starchart') { state.notes = []; }
  if (state.panel !== 'startrail') { state.diary = []; }
  if (state.panel !== 'navigate') { state.reminders = []; }
  if (state.panel !== 'myth') { state.storyCollection = null; }
  const fn = { stargaze: loadStargaze, starchart: loadNotes, startrail: loadDiary, myth: loadMyth, galaxy: loadGalaxy, navigate: loadReminders, ledger: () => ledger && ledger.refresh() };
  (fn[state.panel] || (() => {}))();
  updateStats();
}

window.goPanel = function(name) {
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
  const link = document.querySelector(`[data-panel="${name}"]`);
  if (link) link.classList.add('active');
  state.panel = name;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${name}`);
  if (panel) panel.classList.add('active');
  refreshPanel();
};

// ====== Toast ======
function toast(m) {
  const c = $('toastContainer'), t = document.createElement('div');
  t.className = 'toast'; t.textContent = m; c.appendChild(t);
  setTimeout(() => t.remove(), 2200);
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
    const moon = moodMap[ds] || '';
    html += `<div class="calendar-cell${isToday ? ' today' : ''}${moon ? ' has-mood' : ''}" data-date="${ds}"><span>${d}</span>${moon ? `<span class="cell-mood">${moon}</span>` : ''}</div>`;
  }
  html += '</div>';
  $('calendar').innerHTML = html;

  $('calPrev').addEventListener('click', () => { state.calMonth--; if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; } renderCalendar(); });
  $('calNext').addEventListener('click', () => { state.calMonth++; if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; } renderCalendar(); });

  $('calendar').querySelectorAll('.calendar-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const ds = cell.dataset.date;
      const moon = moodMap[ds];
      if (ds === todayStr) {
        showMoonPicker(ds, moon);
      } else if (moon) {
        const phase = MOON_PHASES.find(p => p.e === moon);
        toast(`${ds} · ${moon} ${phase ? phase.n : ''}`);
      }
    });
  });
}

function showMoonPicker(ds, currentMoon) {
  const moonInfo = state.moonData || { emoji: '🌕', name: '满月', enName: 'Full Moon', illumination: 100, age: 15, nextFullMoon: '—', nextNewMoon: '—' };
  const phaseIdx = MOON_PHASES.findIndex(m => m.e === currentMoon);
  state.selectedMoon = phaseIdx >= 0 ? phaseIdx : null;

  $('moonModal').innerHTML = `
    <div class="moon-modal-head">
      <span class="moon-modal-title">${ds} · 今日月相</span>
      <button class="moon-modal-close" id="moonModalClose">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="moon-modal-body">
      <div class="moon-modal-live">
        <div class="moon-modal-live-wrap">
          <canvas class="moon-modal-live-canvas" id="moonModalCanvas" width="72" height="72"></canvas>
          <img class="moon-modal-live-real" id="moonModalImg" alt="">
        </div>
        <div>
          <div class="moon-modal-live-name">${moonInfo.name} · ${moonInfo.enName}</div>
          <div class="moon-modal-live-info">光照 ${moonInfo.illumination}% · 月龄 ${moonInfo.age}天</div>
          <div class="moon-modal-live-next">下次满月 ${moonInfo.nextFullMoon} · 下次新月 ${moonInfo.nextNewMoon}</div>
        </div>
      </div>
      <div class="moon-modal-grid">
        ${MOON_PHASES.map((m, i) => `<div class="moon-modal-cell${i === state.selectedMoon ? ' selected' : ''}" data-idx="${i}"><span class="moon-modal-emoji">${m.e}</span><span class="moon-modal-name">${m.n}</span></div>`).join('')}
      </div>
    </div>
    <div class="moon-modal-foot">
      <span class="moon-modal-hint" id="moonHint"></span>
      <button class="btn-save-moon" id="moonSave">铭刻月相</button>
    </div>`;

  $('moonOverlay').classList.add('open');

  // Render realistic moon on the modal canvas
  setTimeout(() => renderMoonPhase($('moonModalCanvas'), moonInfo), 50);
  // 同步真实月面影像（若 hero 已加载）
  setTimeout(() => {
    const mi = $('moonModalImg');
    if (mi && state.moonImgUrl) { mi.src = state.moonImgUrl; mi.classList.add('loaded'); }
  }, 80);

  // Close button
  $('moonModalClose').onclick = () => { $('moonOverlay').classList.remove('open'); state.selectedMoon = null; };

  // Grid cell selection
  document.querySelectorAll('.moon-modal-cell').forEach(cell => {
    cell.onclick = () => {
      document.querySelectorAll('.moon-modal-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      state.selectedMoon = parseInt(cell.dataset.idx);
    };
    cell.onmouseenter = () => {
      const idx = parseInt(cell.dataset.idx);
      const h = $('moonHint'); if (h) h.textContent = '「' + MOON_PHASES[idx].n + '」· ' + MOON_PHASES[idx].mood;
    };
    cell.onmouseleave = () => {
      const h = $('moonHint'); if (h) h.textContent = '';
    };
  });

  // Save button
  const saveBtn = $('moonSave');
  if (saveBtn) saveBtn.onclick = async () => {
    if (state.selectedMoon === null || state.selectedMoon === undefined) { toast('请先选择今日月相'); return; }
    const moodEmoji = MOON_PHASES[state.selectedMoon].e;
    await db.checkins.create({ mood: moodEmoji });
    // Sync to shared state
    state.todayMood = moodEmoji;
    state.todayCheckin = await db.checkins.getToday();
    // Also sync today's diary entries
    const today = new Date().toISOString().slice(0, 10);
    const allDiary = await db.diary.list();
    const todayDiaries = allDiary.filter(d => d.date === today);
    for (const diary of todayDiaries) {
      await db.diary.update(diary.id, { mood: moodEmoji });
    }
    $('moonOverlay').classList.remove('open');
    toast('月相已铭刻于今夜');
    // Check for matching story
    const phase = MOON_PHASES[state.selectedMoon];
    const match = mythologyLocal.find(s => s.mood === (phase ? phase.mood : ''));
    if (match) { setTimeout(() => toast('「' + match.title + '」被你的月相吸引而来'), 800); }
    // Add XP
    await db.growth.addXP(5, '铭刻月相');
    await discover('phases', moodEmoji);
    await afterCheckin();
    await loadStargazeData(); renderCalendar(); updateStats();
    state.selectedMoon = null;
  };
}

// Moon overlay close on background click
$('moonOverlay').addEventListener('click', e => { if (e.target === $('moonOverlay')) { $('moonOverlay').classList.remove('open'); state.selectedMoon = null; } });

// ====== Stargaze (观星台) ======
function levelInfo(xp) {
  let lv = 1, name = LEVELS[0].name;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) { lv = LEVELS[i].lv; name = LEVELS[i].name; break; }
  }
  const cur = LEVELS.find(l => l.lv === lv)?.xp || 0;
  const next = LEVELS.find(l => l.lv === lv + 1);
  const pct = next ? Math.round((xp - cur) / (next.xp - cur) * 100) : 100;
  return { lv, name, pct, nextName: next ? next.name : '' };
}

async function loadStargazeData() {
  state.checkins = await db.checkins.list();
  state.todayCheckin = await db.checkins.getToday();
  state.streak = await db.checkins.getStreak();

  // Compute weekly stats
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = weekAgo.toISOString().slice(0, 10);
  const weekCheckins = state.checkins.filter(c => c.date >= weekStr);
  const allNotes = await db.notes.list();
  const allDiary = await db.diary.list();
  const weekNotes = allNotes.filter(n => n.createdAt >= weekStr || n.updatedAt >= weekStr);
  const weekDiary = allDiary.filter(d => d.date >= weekStr);

  // Top mood
  const moodCount = {};
  weekCheckins.forEach(c => { moodCount[c.mood] = (moodCount[c.mood] || 0) + 1; });
  let topMood = null, topCount = 0;
  for (const [m, c] of Object.entries(moodCount)) { if (c > topCount) { topMood = m; topCount = c; } }
  const topPhase = MOON_PHASES.find(p => p.e === topMood);

  // Word count
  let totalWords = 0;
  allNotes.forEach(n => { totalWords += (n.content || '').length; });
  allDiary.forEach(d => { totalWords += (d.content || '').length; });

  // Hero 三列数据卡：连击 / 星阶 / 星图
  const g = await db.growth.get();
  const li = levelInfo(g.xp || 0);
  $('heroStatStreak').textContent = state.streak + ' 天';
  $('heroStatLevel').textContent = 'Lv.' + li.lv;
  $('heroStatLevelName').textContent = li.name;
  $('heroXpFill').style.width = li.pct + '%';
  $('heroStatNotes').textContent = allNotes.length;

  $('weeklyCard').innerHTML = `
    <h3>本周星象</h3>
    <div class="w-row"><span>观测</span><span class="w-val">${weekCheckins.length}/7</span></div>
    <div class="w-row"><span>星轨</span><span class="w-val">${weekDiary.length}</span></div>
    <div class="w-row"><span>星图</span><span class="w-val">${weekNotes.length}</span></div>
    <div class="w-row"><span>主导月相</span><span class="w-val">${topPhase ? topPhase.e + ' ' + topPhase.n : '—'}</span></div>
    <div class="w-row"><span>字迹</span><span class="w-val">${totalWords}</span></div>
  `;

  renderStats(allNotes, allDiary);
}

// ====== 观测统计（热力图 / 月相分布 / 字迹星轨） ======
function renderStats(allNotes, allDiary) {
  renderHeatmap();
  renderMoodDist();
  renderWordTrend(allNotes, allDiary);
}

function renderHeatmap() {
  const map = {};
  state.checkins.forEach(c => { map[c.date] = c.mood; });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const WEEKS = 20;
  // 从本周一开始，往前 20 周
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (WEEKS - 1) * 7);

  const weeks = [];
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      col.push(dt);
    }
    weeks.push(col);
  }

  // 月份标签：某周内出现 1 号则标在该列
  let monthHtml = '<span></span>';
  weeks.forEach(col => {
    const first = col.find(dt => dt.getDate() === 1);
    monthHtml += `<span class="heatmap-month">${first ? (first.getMonth() + 1) + '月' : ''}</span>`;
  });

  const weekNames = ['一', '二', '三', '四', '五', '六', '日'];
  let cellsHtml = '';
  for (let d = 0; d < 7; d++) {
    cellsHtml += `<span class="heatmap-dow">${weekNames[d]}</span>`;
    for (let w = 0; w < WEEKS; w++) {
      const dt = weeks[w][d];
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const mood = map[ds];
      const isToday = dt.getTime() === today.getTime();
      const isFuture = dt > today;
      const phase = mood ? MOON_PHASES.find(p => p.e === mood) : null;
      cellsHtml += `<span class="heatmap-cell${mood ? ' on' : ''}${isToday ? ' today' : ''}${isFuture ? ' future' : ''}" title="${ds}${mood ? ' · ' + (phase ? phase.n : '') : ''}">${mood || ''}</span>`;
    }
  }

  $('checkinHeatmap').innerHTML =
    `<div class="heatmap-months">${monthHtml}</div>` +
    `<div class="heatmap-grid">${cellsHtml}</div>`;

  const endStr = `${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
  const startStr = `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()}`;
  $('heatmapRange').textContent = `${startStr} ~ ${endStr}`;
}

function renderMoodDist() {
  const counts = {};
  state.checkins.forEach(c => { counts[c.mood] = (counts[c.mood] || 0) + 1; });
  const total = state.checkins.length;
  const entries = MOON_PHASES.map(p => ({ p, n: counts[p.e] || 0 })).filter(e => e.n > 0).sort((a, b) => b.n - a.n);
  $('moodDistTotal').textContent = total ? `共 ${total} 次观测` : '';
  $('moodDist').innerHTML = entries.length ? entries.map(e => `
    <div class="mood-dist-row">
      <span class="mood-dist-emoji">${e.p.e}</span>
      <span class="mood-dist-name">${e.p.n}</span>
      <div class="mood-dist-bar"><div class="mood-dist-fill" style="width:${Math.max(3, Math.round(e.n / total * 100))}%"></div></div>
      <span class="mood-dist-count">${e.n}</span>
    </div>`).join('') : '<div class="mood-dist-empty">尚未铭刻月相<br>观测分布等待你的第一夜</div>';
}

function renderWordTrend(notes, diary) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(today.getDate() - i * 7 - 6);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    weeks.push({ s: start.toISOString().slice(0, 10), e: end.toISOString().slice(0, 10), label: (start.getMonth() + 1) + '/' + start.getDate(), count: 0 });
  }
  const entries = [];
  notes.forEach(n => entries.push({ d: (n.createdAt || '').slice(0, 10), len: (n.content || '').length }));
  diary.forEach(d => entries.push({ d: (d.date || '').slice(0, 10), len: (d.content || '').length }));
  weeks.forEach(w => {
    w.count = entries.filter(x => x.d >= w.s && x.d <= w.e).reduce((a, x) => a + x.len, 0);
  });
  const max = Math.max(...weeks.map(w => w.count), 1);
  const totalWords = weeks.reduce((a, w) => a + w.count, 0);
  $('wordTrend').innerHTML = `
    <div class="word-trend-bars">${weeks.map(w => `
      <div class="word-trend-col" title="${w.label} 起一周 · ${w.count} 字">
        <div class="word-trend-bar-wrap"><div class="word-trend-bar${w.count ? '' : ' zero'}" style="height:${Math.max(5, Math.round(w.count / max * 100))}%"></div></div>
        <span class="word-trend-label">${w.label}</span>
      </div>`).join('')}</div>
    <div class="word-trend-sum">近 8 周共书写 <span class="word-trend-sum-n">${totalWords}</span> 字</div>`;
}

async function loadStargaze() {
  // Update moon phase data
  state.moonData = await moonCalc.getMoonPhase();
  await loadStargazeData();
  renderCalendar();
  renderMoodGrid();
  // 今夜星空卡（仅可见时刷新，防后台耗电）
  await renderSkyCard();
  if (!state.skyTimer) {
    state.skyTimer = setInterval(() => {
      const active = $('panel-stargaze').classList.contains('active') && document.visibilityState === 'visible';
      if (active) renderSkyCard();
    }, 60000);
  }
  // Moon hero
  if (state.moonData) {
    const m = state.moonData;
    await renderMoonPhase($('moonHeroCanvas'), m, 200);
    $('moonHeroCanvas').style.width = $('moonHeroCanvas').style.height = 'min(40vw, 200px)';
    $('moonHeroHalo').style.setProperty('--glow', (0.2 + m.illumination / 100 * 0.5).toFixed(2));
    $('moonHeroName').textContent = m.name;
    $('moonHeroEn').textContent = m.enName;
    $('moonHeroMeta').textContent = '光照 ' + m.illumination + '% · 月龄 ' + m.age + ' 天';
    $('moonHeroNext').textContent = '下次满月 ' + m.nextFullMoon + ' · 下次新月 ' + m.nextNewMoon;
  }
  // 真实月面影像（NASA SVS · 每日帧，缓存 IndexedDB，失败静默回退 canvas 渲染）
  if (!isLite) loadMoonImage();
  $('moonHero').onclick = () => showMoonPicker(new Date().toISOString().slice(0, 10), state.todayMood || '');
  state.selectedMoon = null;
  // Sync today's mood for diary
  state.todayMood = state.todayCheckin ? state.todayCheckin.mood : '';

  // Birthday check (skip in demo)
  if (!isLite) {
  state.birthdayInfo = await birthday.checkBirthday();
  if (state.birthdayInfo) {
    const bi = state.birthdayInfo;
    $('birthdayBanner').style.display = '';
    $('birthdayMsg').textContent = `星河为你点亮第 ${bi.age} 圈光轮 · 生辰快乐`;
    // Trigger birthday story
    const stories = mythologyLocal.filter(s => s.mood === 'gratitude' || s.mood === 'hope');
    if (stories.length) {
      const s = stories[Math.floor(Math.random() * stories.length)];
      $('birthdayStory').innerHTML = `星辰赠礼：「<span class="birthday-story-link" onclick="openBirthdayStory('${esc(s.title)}')">${esc(s.title)}</span>」`;
      state.birthdayStory = s;
    }
  } else {
    $('birthdayBanner').style.display = 'none';
  }
  } // end !isLite

  // 入场动画：仅启动/首次进入播放，切 tab 不重播
  if (!state.stargazeEntered) {
    state.stargazeEntered = true;
    $('panel-stargaze').querySelectorAll('.stg-item').forEach((el, i) => {
      el.style.animationDelay = (i * 45) + 'ms';
      el.classList.add('stg-enter');
    });
  }
}

// ====== 真实月面影像（NASA SVS Dial-A-Moon） ======
// 帧公式本地计算（无需 API）；设备端 CapacitorHttp 原生 fetch 可绕过 CORS 缓存 blob；
// 浏览器端 <img> 直载不受 CORS 限制（仅显示，不读取像素）。失败静默回退 canvas 渲染。
async function awardMoonSight() {
  await refreshAchievements();
  if (unlockedAch.includes('first_moon')) return;
  await db.growth.addXP(5, '初见真实月面');
  await unlockAchievement('first_moon');
}

async function loadMoonImage() {
  const img = $('moonHeroImg');
  const src = $('moonHeroSrc');
  if (!img || !src) return;
  const frameInfo = moonCalc.getSvsFrame(new Date());
  const dateKey = frameInfo.dateKey;
  const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  const apply = url => {
    img.onload = () => {
      img.classList.add('loaded');
      src.textContent = 'NASA SVS · 每日实拍';
      state.moonImgUrl = url;
      awardMoonSight();
    };
    img.onerror = () => { img.classList.remove('loaded'); src.textContent = ''; state.moonImgUrl = null; };
    img.src = url;
  };
  try {
    // 1) 缓存命中（IndexedDB blob）
    const cached = await db.moonFrames.get(dateKey);
    if (cached && cached.blob) {
      apply(URL.createObjectURL(cached.blob));
      src.textContent = 'NASA SVS · 缓存帧';
      state.moonImgUrl = img.src;
      return;
    }
    if (!navigator.onLine) return;
    // 2) 设备端：原生 fetch 拉取并缓存（CapacitorHttp 绕过 CORS）
    if (isNative) {
      const r = await fetch(frameInfo.url);
      if (r.ok) {
        const blob = await r.blob();
        await db.moonFrames.put(dateKey, blob, { source: 'svs', frame: frameInfo.frame });
        apply(URL.createObjectURL(blob));
        return;
      }
    }
    // 3) 浏览器端：<img> 直载（显示级，无 CORS 阻断）
    apply(frameInfo.url);
  } catch (e) {
    console.warn('moon image fallback to canvas:', e);
  }
}

// ====== 今夜星空（真实星图） ======
const OBS_DEFAULT = { lat: 39.9042, lon: 116.4074, city: '北京' };

async function getObsLocation() {
  if (state.obs) return state.obs;
  let loc = { ...OBS_DEFAULT };
  if (db) {
    const lat = parseFloat(await db.settings.get('obs_lat'));
    const lon = parseFloat(await db.settings.get('obs_lon'));
    const city = await db.settings.get('obs_city');
    if (isFinite(lat) && Math.abs(lat) <= 90) loc.lat = lat;
    if (isFinite(lon) && Math.abs(lon) <= 180) loc.lon = lon;
    if (city) loc.city = city;
  }
  state.obs = loc;
  return loc;
}

function pickSkyHour() {
  const h = new Date().getHours();
  if (h >= 20 || h < 6) return h; // 夜里用当前时刻
  return 21; // 白天默认展示今晚 21 点
}

function skyDateAt(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function renderSkyCard() {
  if (!sky || !state.obs && !(await getObsLocation())) return;
  const cv = $('skyCardCanvas');
  const w = cv.clientWidth || 340, h = 190;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const date = skyDateAt(pickSkyHour());
  const R = Math.min(w / 2 - 16, h / 2 - 12);
  try {
    state.skyStats = await sky.render(ctx, { lat: state.obs.lat, lon: state.obs.lon, date, cx: w / 2, cy: h / 2 + 2, radius: R, w, h });
    const hh = String(date.getHours()).padStart(2, '0');
    $('skyCardSub').textContent = `${state.obs.city} · ${hh}:00 · 星等≤4.5`;
  } catch (e) {
    $('skyCardSub').textContent = '星图数据未就绪';
    // 数据文件首次拉取偶发失败（慢设备/冷启动），稍后重试一次
    setTimeout(() => { if ($('panel-stargaze').classList.contains('active')) renderSkyCard(); }, 1500);
  }
}

function skyFsHour() { return (20 + parseInt($('skyFsTime').value)) % 24; }

async function renderSkyFs() {
  if (!sky) return;
  const cv = $('skyFsCanvas');
  const wrap = $('skyFsOverlay').querySelector('.sky-fs-body');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const R = Math.min(w / 2 - 20, h / 2 - 16);
  const date = skyDateAt(skyFsHour());
  const loc = await getObsLocation();
  const r = await sky.render(ctx, {
    lat: loc.lat, lon: loc.lon, date,
    cx: w / 2, cy: h / 2, radius: R, w, h,
    showStarLabels: true,
    highlight: state.skyLitCons || [],
  });
  state.skyFsStats = r;
  state.skyFsCons = r.constellations || [];
  $('skyFsTimeLabel').textContent = String(date.getHours()).padStart(2, '0') + ':00';
  $('skyFsLoc').textContent = `${loc.city} ${loc.lat.toFixed(1)}°N ${loc.lon.toFixed(1)}°E`;
  $('skyFsLegend').textContent = `可见恒星 ${r.starsDrawn} 颗 · 星座连线 ${r.linesDrawn} 条 · 方位圈中心为天顶`;
  ctx.fillStyle = 'rgba(226,232,248,0.30)';
  ctx.font = `9px "LXGW WenKai Lite","Noto Serif SC",serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('星空底图 ESO/S. Brunier', w / 2 + R - 6, h / 2 + R - 9);
}

async function openSkyOverlay() {
  const h = pickSkyHour();
  const v = h >= 20 ? h - 20 : h + 4; // 20→0, 0→4, 5→9
  $('skyFsTime').value = Math.max(0, Math.min(9, v));
  $('skyFsOverlay').classList.add('open');
  const d = await getDiscoveries();
  state.skyLitCons = d.constellations || [];
  await renderSkyFs();
  // 填写 AstronomyAPI key 后显示「高清星图」入口
  Promise.all([db.settings.get('astro_api_id'), db.settings.get('astro_api_secret')]).then(([id, sec]) => {
    $('skyFsHd').style.display = (id && sec) ? '' : 'none';
  }).catch(() => {});
  xpOnce('sky_view', 2, '仰望今夜星空');
  await refreshAchievements();
  unlockAchievement('first_sky');
}

function closeSkyOverlay() { $('skyFsOverlay').classList.remove('open'); }

$('skyCard').addEventListener('click', openSkyOverlay);
$('skyFsClose').addEventListener('click', closeSkyOverlay);
$('skyFsOverlay').addEventListener('click', e => { if (e.target === $('skyFsOverlay')) closeSkyOverlay(); });
$('skyFsTime').addEventListener('input', renderSkyFs);
$('skyFsCanvas').addEventListener('click', async e => {
  const cons = state.skyFsCons || [];
  if (!cons.length) return;
  const rect = $('skyFsCanvas').getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  let hit = null;
  for (const c of cons) {
    if (Math.hypot(c.x - x, c.y - y) <= 24) { hit = c; break; }
  }
  if (!hit) return;
  const isNew = await discover('constellations', hit.zh);
  if (isNew) {
    state.skyLitCons.push(hit.zh);
    await db.growth.addXP(8, '点亮星座 · ' + hit.zh);
    toast('「' + hit.zh + '」已点亮 · +8 XP');
    await unlockAchievement('first_const');
    await checkAchievements();
    renderSkyFs();
  } else {
    toast(hit.zh + ' · 已点亮');
  }
});

// ====== 今夜打卡（心情九宫格，选中即打卡） ======
function renderMoodGrid() {
  const today = state.todayCheckin;
  const m = state.moonData;
  const order = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
  let html = order.map(e => {
    const p = MOON_PHASES.find(x => x.e === e);
    const on = today && today.mood === e;
    return `<button class="mood-cell${on ? ' checked' : ''}" data-mood="${e}" title="${p ? p.n + ' · ' + p.mood : ''}">${e}</button>`;
  }).join('');
  const realE = m ? m.emoji : '🌕';
  const realOn = today && today.mood === realE;
  html += `<button class="mood-cell mood-cell-real${realOn ? ' checked' : ''}" data-mood="${realE}" title="今夜实况月相">${realE}<i>今夜</i></button>`;
  $('moodGrid').innerHTML = html;
  $('checkinState').textContent = today ? `已铭刻 ${today.mood} · 再点可更换` : '以月相铭刻此刻';

  $('moodGrid').querySelectorAll('.mood-cell').forEach(cell => {
    cell.onclick = async () => {
      const moodEmoji = cell.dataset.mood;
      await db.checkins.create({ mood: moodEmoji });
      state.todayMood = moodEmoji;
      state.todayCheckin = await db.checkins.getToday();
      // Sync today's diary entries
      const todayStr = new Date().toISOString().slice(0, 10);
      const allDiary = await db.diary.list();
      for (const d of allDiary.filter(x => x.date === todayStr)) {
        await db.diary.update(d.id, { mood: moodEmoji });
      }
      // 打卡成功脉冲
      cell.classList.remove('pulse'); void cell.offsetWidth; cell.classList.add('pulse');
      toast('月相已铭刻于今夜');
      // Check for matching story
      const phase = MOON_PHASES.find(p => p.e === moodEmoji);
      const match = mythologyLocal.find(s => s.mood === (phase ? phase.mood : ''));
      if (match) { setTimeout(() => toast('「' + match.title + '」被你的月相吸引而来'), 800); }
      // Add XP
      await db.growth.addXP(5, '铭刻月相');
      await discover('phases', moodEmoji);
      await afterCheckin();
      renderMoodGrid();
      await loadStargazeData(); renderCalendar(); updateStats();
    };
  });
}

window.openBirthdayStory = function(title) {
  const s = state.birthdayStory || mythologyLocal.find(x => x.title === title);
  if (s) {
    $('storyBody').innerHTML = `<h2>${esc(s.title)}</h2><p>${esc(s.content)}</p><div style="margin-top:24px;font-size:11px;color:var(--text3);">${esc(s.source)}</div>`;
    $('storyFoot').innerHTML = '';
    setExcerptContext(s.title, s.source || '神话书库');
    $('storyOverlay').classList.add('open');
  }
};

// ====== 真实月面渲染（LRO 纹理逐像素光照，见 client/moon-3d.js） ======
async function renderMoonPhase(canvas, moonData, sizePx) {
  const size = sizePx || 64;
  // 真实月面：LRO 纹理 + 球面逐像素光照（相位明暗界线/临边昏暗/地照）
  await moon3d.renderMoon(canvas, moonData, size);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = size / 2, cy = size / 2, r = size / 2 - 1;

  // 1) 边缘柔光
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const rim = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  rim.addColorStop(0, 'rgba(255,250,235,0.10)');
  rim.addColorStop(0.5, 'rgba(255,250,235,0.02)');
  rim.addColorStop(1, 'rgba(255,250,235,0.14)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // 2) 金环
  ctx.beginPath();
  ctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(201,169,110,0.14)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// ====== 分享卡片（今日星图） ======
const SHARE_CARD_W = 440, SHARE_CARD_H = 660;

async function generateShareCard() {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_CARD_W * scale;
  canvas.height = SHARE_CARD_H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const W = SHARE_CARD_W, H = SHARE_CARD_H;

  const today = new Date().toISOString().slice(0, 10);
  const FONT = '"LXGW WenKai Lite","Noto Serif SC",serif';

  // 背景：深邃夜空渐变
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1026');
  bg.addColorStop(0.55, '#080a1c');
  bg.addColorStop(1, '#05060f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 真实星空（观测位置 · 今日此时）——替换随机星点
  if (sky) {
    try {
      const loc = await getObsLocation();
      await sky.render(ctx, {
        lat: loc.lat, lon: loc.lon, date: skyDateAt(pickSkyHour()),
        cx: W / 2, cy: 200, radius: 178, w: W, h: H,
        showLabels: false, dim: 0.42,
      });
    } catch (e) { /* 星图未就绪则保持纯夜色背景 */ }
  }

  // 顶部：应用名 + 日期
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(201,169,110,0.9)';
  ctx.font = `12px ${FONT}`;
  ctx.fillText('D A Y - D A Y  ·  观 星 台', W / 2, 42);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `12px ${FONT}`;
  const dateStr = `${today.slice(0, 4)} 年 ${parseInt(today.slice(5, 7))} 月 ${parseInt(today.slice(8, 10))} 日`;
  ctx.fillText(dateStr, W / 2, 64);
  if (state.obs) {
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = `10px ${FONT}`;
    ctx.fillText(`${state.obs.city} · 真实星空 · ${String(skyDateAt(pickSkyHour()).getHours()).padStart(2, '0')}:00`, W / 2, 82);
  }

  const m = state.moonData;
  const moonSize = 260, moonY = 98;

  // 月亮光晕
  const halo = ctx.createRadialGradient(W / 2, moonY + moonSize / 2, moonSize * 0.35, W / 2, moonY + moonSize / 2, moonSize * 1.15);
  halo.addColorStop(0, 'rgba(206,182,150,0.16)');
  halo.addColorStop(1, 'rgba(206,182,150,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(W / 2 - moonSize * 1.15, moonY + moonSize / 2 - moonSize * 1.15, moonSize * 2.3, moonSize * 2.3);

  // 大月亮
  if (m) {
    const moonCanvas = document.createElement('canvas');
    await renderMoonPhase(moonCanvas, m, moonSize);
    ctx.drawImage(moonCanvas, (W - moonSize) / 2, moonY);

    // 月相名 + 数据
    ctx.fillStyle = '#f2ead8';
    ctx.font = `26px ${FONT}`;
    ctx.fillText(m.name, W / 2, moonY + moonSize + 44);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(m.enName, W / 2, moonY + moonSize + 68);
    ctx.fillStyle = 'rgba(201,169,110,0.95)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`光照 ${m.illumination}%  ·  月龄 ${m.age} 天`, W / 2, moonY + moonSize + 94);
  }

  // 分隔线
  ctx.strokeStyle = 'rgba(201,169,110,0.25)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(W * 0.18, 484); ctx.lineTo(W * 0.82, 484);
  ctx.stroke();

  // 连击天数
  const moodEmoji = state.todayCheckin?.mood || state.todayMood || '';
  ctx.fillStyle = '#f2ead8';
  ctx.font = `17px ${FONT}`;
  ctx.fillText(`${moodEmoji ? moodEmoji + ' ' : ''}连续观测 ${state.streak} 天`, W / 2, 516);

  // 今日日记摘录
  const diary = state.diaryToday;
  if (diary && diary.content) {
    const flat = diary.content.replace(/\s+/g, ' ').trim();
    let excerpt = flat.slice(0, 42);
    if (flat.length > 42) excerpt += '…';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('「' + excerpt + '」', W / 2, 548);
  }

  // 底部署名
  const p = state.profile || {};
  ctx.fillStyle = 'rgba(201,169,110,0.85)';
  ctx.font = `13px ${FONT}`;
  ctx.fillText((p.displayName || '观测者') + (p.celestialName ? ' · ' + p.celestialName : ''), W / 2, H - 50);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = `10px ${FONT}`;
  ctx.fillText('Day-Day 观星台', W / 2, H - 26);

  return canvas;
}

$('btnShareCard').addEventListener('click', async () => {
  if (!state.moonData) return;
  const today = new Date().toISOString().slice(0, 10);
  const diaries = await db.diary.list();
  state.diaryToday = diaries.find(d => d.date === today) || null;
  const canvas = await generateShareCard();
  state.shareCardCanvas = canvas;
  $('shareCardImg').src = canvas.toDataURL('image/png');
  $('shareCardOverlay').classList.add('open');
});

$('shareCardClose').addEventListener('click', () => $('shareCardOverlay').classList.remove('open'));
$('shareCardOverlay').addEventListener('click', e => { if (e.target === $('shareCardOverlay')) $('shareCardOverlay').classList.remove('open'); });
$('btnSaveShareCard').addEventListener('click', () => {
  if (!state.shareCardCanvas) return;
  saveCanvasToDevice(state.shareCardCanvas, 'dayday-share-' + new Date().toISOString().slice(0, 10) + '.png');
});

// ====== Notes (绘星阁) ======
async function loadNotes(reset) {
  if (reset) { state.notesPage = 0; state.notes = []; state.notesHasMore = true; }
  if (!state.notesHasMore) return;

  const s = ($('searchInput')?.value || '').toLowerCase();
  const filterType = state.noteType !== 'all';

  // Use light list (no images) for grid view — prevents OOM from base64 blobs
  if (!s && !filterType) {
    const batch = await db.notes.listLight(state.PAGE_SIZE, state.notesPage * state.PAGE_SIZE);
    if (reset) state.notes = batch; else state.notes = state.notes.concat(batch);
    state.notesHasMore = batch.length >= state.PAGE_SIZE;
    state.notesPage++;
    state.notesTotal = await db.notes.count();
  } else {
    // When searching/filtering, load all but strip images
    const all = await db.notes.list();
    const light = all.map(n => ({ ...n, images: undefined, imageCount: (n.images || []).length }));
    const filtered = light.filter(n => {
      if (filterType && n.type !== state.noteType) return false;
      if (s && !(n.title || '').toLowerCase().includes(s) && !(n.content || '').toLowerCase().includes(s)) return false;
      return true;
    });
    state.notes = filtered;
    state.notesHasMore = false;
    state.notesTotal = filtered.length;
  }
  renderNotes();
}

function renderNotes() {
  const grid = $('notesGrid'), empty = $('notesEmpty');
  if (!state.notes.length) { grid.innerHTML = ''; empty.style.display = 'block'; $('notesLoadMore').style.display = 'none'; return; }
  empty.style.display = 'none';

  const html = state.notes.map(n => `
    <div class="card ${n.pinned ? 'pinned' : ''}" onclick="openNote('${n.id}')">
      ${n.pinned ? '<span class="card-pin">·</span>' : ''}
      <div class="card-title">${esc(n.title)}</div>
      <div class="card-preview">${esc((n.content || '').slice(0, 120))}</div>
      ${(n.imageCount || 0) ? `<div class="card-img-count">${n.imageCount} 张图片</div>` : ''}
      <div class="card-meta">
        <span class="card-type">${esc(n.type)}</span><span>${fmtDate(n.updatedAt || n.createdAt)}</span>
        <span class="card-act" onclick="event.stopPropagation()">
          <button onclick="window.togglePin('${n.id}')">·</button>
          <button class="danger" onclick="window.deleteNote('${n.id}')">×</button>
        </span>
      </div>
    </div>`).join('');

  // On first page, replace; on subsequent pages, append
  if (state.notesPage <= 1) grid.innerHTML = html;
  else grid.insertAdjacentHTML('beforeend', html);

  // Show/hide load more button
  const btn = $('notesLoadMore');
  if (btn) btn.style.display = state.notesHasMore ? '' : 'none';
}

window.openNote = async function(id) {
  // Load full note data from DB (includes images) — grid view strips images
  const full = await db.notes.get(id);
  if (!full) return;
  state.editing = { type: 'note', data: full };
  $('modalTitle').value = full.title || '';
  $('modalContent').value = full.content || '';
  buildMeta('note'); buildFoot('note'); $('modalOverlay').classList.add('open');
};

$('btnNewNote').addEventListener('click', () => {
  state.editing = { type: 'note', data: { id: '', title: '', content: '', type: state.noteType === 'all' ? '灵感' : state.noteType, tags: [], images: [], pinned: false } };
  $('modalTitle').value = ''; $('modalContent').value = '';
  buildMeta('note'); buildFoot('note'); $('modalOverlay').classList.add('open');
});

window.togglePin = async function(id) {
  const n = state.notes.find(x => x.id === id); if (!n) return;
  await db.notes.update(id, { pinned: !n.pinned });
  loadNotes();
};

window.deleteNote = async function(id) {
  if (!confirm('删除？')) return;
  await db.notes.delete(id);
  loadNotes(); updateStats(); toast('已删除');
};

function renderTypeChips() {
  const ts = [{ k:'all', n:'全部' }, { k:'灵感', n:'灵感' }, { k:'随笔', n:'随笔' }, { k:'草稿', n:'暗星' }, { k:'摘录', n:'摘录' }, { k:'其他', n:'其他' }];
  $('typeChips').innerHTML = ts.map(t => `<button class="chip ${state.noteType === t.k ? 'active' : ''}" data-t="${t.k}">${t.n}</button>`).join('');
  document.querySelectorAll('#typeChips .chip').forEach(c => {
    c.addEventListener('click', () => { state.noteType = c.dataset.t; loadNotes(); renderTypeChips(); });
  });
}
$('searchInput').addEventListener('input', () => { clearTimeout(state.sTimer); state.sTimer = setTimeout(loadNotes, 250); });

// ====== Image handling (base64, no server) ======
function bindImageUpload() {
  const fi = $('modalFileInput');
  fi.addEventListener('change', async () => {
    if (!fi.files.length) return;
    for (const f of fi.files) {
      const url = await readFileAsDataURL(f);
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
  let html = imgs.map((url, i) => `<div class="img-wrap"><img src="${esc(url)}"><button onclick="window.removeModalImage(${i})">×</button></div>`).join('');
  html += '<div class="img-add" onclick="$(\'modalFileInput\').click()">+</div>';
  $('modalImages').innerHTML = html;
}

window.removeModalImage = function(i) {
  if (state.editing?.data?.images) {
    state.editing.data.images.splice(i, 1);
    renderModalImages();
  }
};

async function compressImages(dataUrls) {
  const MAX_W = 600;
  const results = [];
  for (const url of dataUrls) {
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w <= MAX_W) { results.push(url); continue; }
      const ratio = MAX_W / w;
      const cvs = document.createElement('canvas');
      cvs.width = MAX_W; cvs.height = Math.round(h * ratio);
      const ctx = cvs.getContext('2d');
      ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
      const isPng = url.startsWith('data:image/png');
      results.push(cvs.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.7));
    } catch(e) { results.push(url); }
  }
  return results;
}

// ====== Diary (时光星轨) ======
async function loadDiary() { state.diary = await db.diary.list(); renderDiary(); }
function renderDiary() {
  const l = $('diaryList'), e = $('diaryEmpty');
  if (!state.diary.length) { l.innerHTML = ''; e.style.display = 'block'; return; }
  e.style.display = 'none';
  const today = new Date().toISOString().slice(0, 10);
  const todayMood = state.todayCheckin?.mood || state.todayMood || '';
  const sorted = [...state.diary].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  l.innerHTML = sorted.map(d => {
    const isToday = d.date === today;
    const displayMood = d.mood || (isToday ? todayMood : '') || '—';
    return `
    <div class="diary-item" onclick="openDiary('${d.id}')">
      <div class="diary-emoji">${displayMood}</div>
      <div class="diary-info"><div class="diary-date">${fmtDate(d.date)}</div><div class="diary-title">${esc(d.title)}</div><div class="diary-preview">${esc((d.content || '').slice(0, 100))}</div></div>
    </div>`;
  }).join('');
}

window.openDiary = function(id) {
  const d = state.diary.find(x => x.id === id); if (!d) return;
  state.editing = { type: 'diary', data: d };
  $('modalTitle').value = d.title || ''; $('modalContent').value = d.content || '';
  buildMeta('diary'); buildFoot('diary'); $('modalOverlay').classList.add('open');
};

$('btnNewDiary').addEventListener('click', () => {
  const syncedMood = state.todayCheckin ? state.todayCheckin.mood : (state.todayMood || '');
  state.editing = { type: 'diary', data: { id: '', date: new Date().toISOString().slice(0, 10), title: '', content: '', mood: syncedMood, images: [] } };
  $('modalTitle').value = ''; $('modalContent').value = '';
  buildMeta('diary'); buildFoot('diary'); $('modalOverlay').classList.add('open');
});

window.deleteDiary = async function(id) {
  if (!confirm('删除？')) return;
  await db.diary.delete(id);
  loadDiary(); updateStats(); toast('已删除');
};

// ====== Myth (神话书库) ======
async function loadMyth() {
  if (state.storyTab === 'explore') { $('storyCollectionGrid').innerHTML = ''; $('storyCollectionEmpty').style.display = 'none'; $('storySearchResults').style.display = 'none'; $('storySearchEmpty').style.display = 'none'; return; }
  loadStoryCollection();
}

async function loadStoryCollection() {
  const coll = await db.storyCollection.list();
  const rewards = getUnlockedStories();
  const all = [...rewards, ...coll];
  const grid = $('storyCollectionGrid'), empty = $('storyCollectionEmpty');
  $('storySearchResults').style.display = 'none';
  $('storySearchEmpty').style.display = 'none';
  if (!all.length) { grid.innerHTML = ''; empty.style.display = 'block'; }
  else {
    empty.style.display = 'none';
    grid.innerHTML = all.map(s => {
      const isReward = s.id && s.id.startsWith('reward_lv');
      const lockedClass = isReward ? ' story-card-reward' : '';
      const sourceText = isReward ? (s.source || '星门秘藏') : (esc(s.source || '') + ' · ' + fmtDate(s.fetchedAt || s.createdAt));
      return `<div class="story-card${lockedClass}" onclick="${isReward ? `openRewardStory('${s.id}')` : `openMythReader('${s.id}')`}">
        <div class="story-card-title">${esc(s.title)}</div>
        <div class="story-card-preview">${esc((s.content || '').slice(0, 150))}</div>
        ${s.mood ? `<div class="story-card-mood">${s.mood}</div>` : ''}
        <div class="story-card-source">${sourceText}</div>
      </div>`;
    }).join('');
  }
}

window.openRewardStory = function(id) {
  const lvMatch = id.match(/reward_lv(\d+)/);
  if (!lvMatch) return;
  const lv = parseInt(lvMatch[1]);
  const s = LEVEL_REWARDS[lv];
  if (!s) return;
  $('storyBody').innerHTML = `<h2>${esc(s.title)}</h2><p>${esc(s.content)}</p><div style="margin-top:24px;font-size:11px;color:var(--gold-dim);">${esc(s.source)}</div>`;
  $('storyFoot').innerHTML = '';
  setExcerptContext(s.title, s.source || '星门秘藏');
  $('storyOverlay').classList.add('open');
};

// Story tabs
document.querySelectorAll('#storyTabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#storyTabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.storyTab = tab.dataset.tab;
    if (state.storyTab === 'collection') loadStoryCollection();
    else { $('storyCollectionGrid').innerHTML = ''; $('storyCollectionEmpty').style.display = 'none'; }
  });
});

window.openMythReader = async function(id) {
  const s = await db.storyCollection.get(id);
  if (!s) { toast('没有找到'); return; }
  // 联网书库收纳的整本公版书用预排版保留分段
  const isBook = id && id.startsWith('gutenberg_');
  $('storyBody').innerHTML = isBook
    ? `<h2>${esc(s.title)}</h2><div class="story-book-text">${esc(s.content)}</div><div style="margin-top:24px;font-size:11px;color:var(--text3);">${esc(s.source || '')}</div>`
    : `<h2>${esc(s.title)}</h2><p>${esc(s.content)}</p><div style="margin-top:24px;font-size:11px;color:var(--text3);">${esc(s.source || '')}</div>`;
  $('storyFoot').innerHTML = '';
  setExcerptContext(s.title, s.source || '神话书库');
  $('storyOverlay').classList.add('open');
};

// Story search (星际探索)
$('storySearchInput').addEventListener('input', () => {
  clearTimeout(state.sTimer);
  state.sTimer = setTimeout(() => {
    const q = $('storySearchInput').value.trim().toLowerCase();
    if (!q) {
      // Go back to collection if search is cleared and we're in explore
      if (state.storyTab === 'explore') {
        state.storyTab = 'collection';
        document.querySelectorAll('#storyTabs .tab').forEach(t => t.classList.remove('active'));
        document.querySelector('#storyTabs [data-tab="collection"]').classList.add('active');
        loadStoryCollection();
      }
      return;
    }
    if (state.storyTab !== 'explore') {
      state.storyTab = 'explore';
      document.querySelectorAll('#storyTabs .tab').forEach(t => t.classList.remove('active'));
      document.querySelector('#storyTabs [data-tab="explore"]').classList.add('active');
    }
    $('storyCollectionGrid').innerHTML = '';
    $('storyCollectionEmpty').style.display = 'none';

    // 同时搜索本地神话与银河档案收藏（联网书库收纳的书也在其中）
    (async () => {
      const local = mythologyLocal.filter(s =>
        s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q)
      );
      const coll = (await db.storyCollection.list()).filter(s =>
        (s.title || '').toLowerCase().includes(q) || (s.content || '').toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q)
      ).map(s => ({ ...s, _coll: true }));
      const results = [...local, ...coll];
      const res = $('storySearchResults'), emp = $('storySearchEmpty');
      res.style.display = '';
      if (!results.length) { res.innerHTML = ''; emp.style.display = 'block'; return; }
      emp.style.display = 'none';
      res.innerHTML = results.map(s => {
        const click = s._coll ? `openMythReader('${esc(s.id)}')` : `openSearchResult('${esc(s.title.replace(/'/g, "\\'"))}')`;
        return `<div class="story-card" onclick="${click}">
        <div class="story-card-title">${esc(s.title)}</div>
        <div class="story-card-preview">${esc((s.content || '').slice(0, 120))}</div>
        <div class="story-card-source">${esc(s.source || '')}</div>
      </div>`;
      }).join('');
    })();
  }, 300);
});

// Random story
$('btnRandomStory').addEventListener('click', async () => {
  $('btnRandomStory').textContent = '...';
  try {
    const sh = await db.storyHistory.list();
    const seenHashes = new Set(sh.map(x => x.id));
    const unseen = mythologyLocal.filter(s => !seenHashes.has(hashContent(s.title + s.content.slice(0, 50))));
    let pool = unseen;
    if (state.todayCheckin) {
      const phase = MOON_PHASES.find(p => p.e === state.todayCheckin.mood);
      if (phase) {
        const matched = unseen.filter(s => s.mood === phase.mood);
        if (matched.length > 0) pool = matched;
      }
    }
    if (!pool.length) pool = mythologyLocal;
    const s = pool[Math.floor(Math.random() * pool.length)];
    $('storyBody').innerHTML = `<h2>${esc(s.title)}</h2><p>${esc(s.content)}</p><div style="margin-top:24px;font-size:11px;color:var(--text3);">${esc(s.source)}</div>`;
    $('storyFoot').innerHTML = `<button class="btn-save-story" id="btnSaveStory">收纳入银河档案</button>`;
    setExcerptContext(s.title, s.source || '星际探索');
    $('storyOverlay').classList.add('open');
    await db.storyHistory.add(hashContent(s.title + s.content.slice(0, 50)));
    setTimeout(() => {
      const b = $('btnSaveStory');
      if (b) b.addEventListener('click', async () => {
        await db.storyCollection.create({ ...s, fetchedAt: new Date().toISOString() });
        toast('已收纳入银河档案'); b.remove();
      });
    }, 100);
  } catch(e) { toast('星际讯号微弱...再试一次'); }
  $('btnRandomStory').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>';
});

window.openSearchResult = function(title) {
  const s = mythologyLocal.find(x => x.title === title);
  if (!s) return;
  $('storyBody').innerHTML = `<h2>${esc(s.title)}</h2><p>${esc(s.content)}</p><div style="margin-top:24px;font-size:11px;color:var(--text3);">${esc(s.source)}</div>`;
  $('storyFoot').innerHTML = `<button class="btn-save-story" id="btnSaveStory">收纳入银河档案</button>`;
  setExcerptContext(s.title, s.source || '星际探索');
  $('storyOverlay').classList.add('open');
  setTimeout(() => {
    const b = $('btnSaveStory');
    if (b) b.addEventListener('click', async () => {
      await db.storyCollection.create({ ...s, fetchedAt: new Date().toISOString() });
      toast('已收纳入银河档案'); b.remove();
    });
  }, 100);
};

// ====== 联网书库（古腾堡计划公版书；被墙/无网时优雅降级） ======
const GUTENDEX_API = 'https://gutendex.com/books';
const GUTENBERG_MAX_CHARS = 1500000;
let gutenbergResults = [];

function fetchWithTimeout(url, opts = {}, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

$('btnGutenberg').addEventListener('click', () => {
  $('gutenbergOverlay').classList.add('open');
  loadGutenbergBooks('mythology');
});
$('gutenbergClose').addEventListener('click', () => $('gutenbergOverlay').classList.remove('open'));
$('gutenbergOverlay').addEventListener('click', e => { if (e.target === $('gutenbergOverlay')) $('gutenbergOverlay').classList.remove('open'); });
$('gutenbergSearchBtn').addEventListener('click', () => {
  const q = $('gutenbergQuery').value.trim();
  if (q) loadGutenbergBooks(null, q);
});
$('gutenbergQuery').addEventListener('keydown', e => { if (e.key === 'Enter') $('gutenbergSearchBtn').click(); });

async function loadGutenbergBooks(topic, search) {
  const body = $('gutenbergBody'), empty = $('gutenbergEmpty');
  body.querySelectorAll('.gutenberg-book').forEach(x => x.remove());
  empty.style.display = 'block';
  empty.textContent = '正在连接书库…';
  try {
    let url = `${GUTENDEX_API}?languages=en,zh&` + (search ? `search=${encodeURIComponent(search)}` : `topic=${encodeURIComponent(topic)}`);
    const r = await fetchWithTimeout(url, {}, 12000);
    if (!r.ok) throw new Error('status ' + r.status);
    const books = ((await r.json()).results || []).slice(0, 30);
    gutenbergResults = books;
    if (!books.length) { empty.textContent = '书库中没有相关书目'; return; }
    empty.style.display = 'none';
    body.insertAdjacentHTML('beforeend', books.map(b => `
      <div class="gutenberg-book">
        <div class="gutenberg-book-title">${esc(b.title)}</div>
        <div class="gutenberg-book-meta">${esc((b.authors || []).map(a => a.name).join('、') || '佚名')} · ${esc((b.languages || []).join('/').toUpperCase())} · 下载 ${b.download_count || 0} 次</div>
        <button class="gutenberg-book-save" data-id="${b.id}">收纳入银河档案</button>
      </div>`).join(''));
    body.querySelectorAll('.gutenberg-book-save').forEach(btn => {
      btn.onclick = () => saveGutenbergBook(parseInt(btn.dataset.id), btn);
    });
  } catch (e) {
    console.warn('Gutendex failed:', e);
    empty.textContent = '书库连接失败（需联网，部分地区需 VPN）\n本地 163 篇神话不受影响';
  }
}

async function saveGutenbergBook(id, btn) {
  const b = gutenbergResults.find(x => x.id === id);
  if (!b) return;
  const url = b.formats?.['text/plain; charset=utf-8'] || b.formats?.['text/plain'] || b.formats?.['text/html; charset=utf-8'] || b.formats?.['text/html'];
  if (!url) { toast('该书无纯文本格式，暂无法收纳'); return; }
  btn.disabled = true; btn.textContent = '收纳中…';
  try {
    const r = await fetchWithTimeout(url, {}, 30000);
    if (!r.ok) throw new Error('status ' + r.status);
    let text = await r.text();
    if (text.length > GUTENBERG_MAX_CHARS) text = text.slice(0, GUTENBERG_MAX_CHARS) + '\n\n……（全文过长，已截取前 150 万字符）';
    const recId = 'gutenberg_' + b.id;
    if (await db.storyCollection.get(recId)) { toast('已在银河档案中'); btn.textContent = '已收纳'; btn.classList.add('saved'); return; }
    await db.storyCollection.create({
      id: recId,
      title: b.title,
      content: text,
      source: '古腾堡计划 · ' + ((b.authors || []).map(a => a.name).join('、') || '佚名') + ' · 公版书',
      category: '联网书库',
      fetchedAt: new Date().toISOString(),
    });
    toast('《' + b.title + '》已收纳入银河档案');
    btn.textContent = '已收纳'; btn.classList.add('saved');
    updateStats();
  } catch (e) {
    console.warn('save book failed:', e);
    btn.disabled = false; btn.textContent = '重试';
    toast('收纳失败，请检查网络');
  }
}

// Excerpt functions — text selection based
window.setExcerptContext = function(title, source) {
  state.excerptContext = { title, source };
};

let pendingExcerptText = '';

window.doExcerpt = async function() {
  const text = pendingExcerptText || window.getSelection().toString().trim();
  if (!text || !state.excerptContext) return;
  const ctx = state.excerptContext;
  const excerptContent = `「${esc(ctx.title)}」\n\n${text}`;
  await db.notes.create({
    title: ctx.title,
    content: excerptContent + '\n\n—— 来源: ' + esc(ctx.source) + ' · 摘录于 ' + new Date().toISOString().slice(0, 10),
    type: '摘录',
    tags: ['摘录'],
    images: [],
    pinned: false,
  });
  await db.growth.addXP(3, '摘录星辰故事');
  updateStats();
  toast('已摘录至绘星阁');
  hideExcerptFloat();
  pendingExcerptText = '';
  window.getSelection().removeAllRanges();
};

function showExcerptFloat(x, y, text) {
  const el = $('excerptFloat');
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.display = 'block';
  pendingExcerptText = text;
}

function hideExcerptFloat() {
  $('excerptFloat').style.display = 'none';
}

function initTextSelectionExcerpt() {
  let selDebounce = null;
  let lastTap = 0;
  let lastTapX = 0, lastTapY = 0;

  // Select paragraph at point
  const selectParagraphAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    // Find the closest text-containing ancestor
    let target = el;
    while (target && target.textContent.trim().length < 2) target = target.parentElement;
    if (!target) target = el;
    // Select the paragraph or the nearest meaningful text block
    const p = target.closest('p') || target.closest('h2') || target.closest('div');
    if (!p) return;
    const range = document.createRange();
    range.selectNodeContents(p);
    sel.addRange(range);
  };

  const showFloatForSelection = () => {
    clearTimeout(selDebounce);
    selDebounce = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !state.excerptContext) { hideExcerptFloat(); return; }
      const text = sel.toString().trim();
      if (!text) { hideExcerptFloat(); return; }
      // Verify selection is in allowed area
      let node = sel.anchorNode;
      let ok = false;
      while (node) {
        if (node === $('storyBody') || node === $('galaxyInfoBarDesc') || node === $('galaxyFsPopupDesc')) { ok = true; break; }
        node = node.parentNode;
      }
      if (!ok) { hideExcerptFloat(); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      showExcerptFloat(rect.left + rect.width / 2, rect.top, text);
      if (!localStorage.getItem('dayday_excerpt_hint')) {
        localStorage.setItem('dayday_excerpt_hint', '1');
        toast('双击文字可选择摘录');
      }
    }, 80);
  };

  // Desktop: dblclick
  document.addEventListener('dblclick', (e) => {
    const tgt = e.target;
    if (!tgt.closest('#storyBody') && !tgt.closest('#galaxyInfoBarDesc') && !tgt.closest('#galaxyFsPopupDesc')) return;
    if (!state.excerptContext) return;
    e.preventDefault();
    selectParagraphAt(e.clientX, e.clientY);
    showFloatForSelection();
  });

  // Mobile: double-tap via touchstart timing
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const tgt = document.elementFromPoint(t.clientX, t.clientY);
    if (!tgt) return;
    if (!tgt.closest('#storyBody') && !tgt.closest('#galaxyInfoBarDesc') && !tgt.closest('#galaxyFsPopupDesc')) {
      // Click outside — hide float
      if (!tgt.closest('#excerptFloat')) {
        clearTimeout(selDebounce);
        selDebounce = setTimeout(() => hideExcerptFloat(), 200);
      }
      lastTap = 0; return;
    }
    if (!state.excerptContext) return;

    const now = Date.now();
    const dist = Math.abs(t.clientX - lastTapX) + Math.abs(t.clientY - lastTapY);
    if (now - lastTap < 450 && dist < 30) {
      // Double-tap!
      e.preventDefault();
      selectParagraphAt(t.clientX, t.clientY);
      showFloatForSelection();
      lastTap = 0;
    } else {
      lastTap = now;
      lastTapX = t.clientX;
      lastTapY = t.clientY;
    }
  }, { passive: false });

  // Track selection adjustments
  document.addEventListener('selectionchange', showFloatForSelection);

  $('excerptFloatBtn').addEventListener('click', window.doExcerpt);
  $('storyClose').addEventListener('click', () => { state.excerptContext = null; hideExcerptFloat(); });
  $('storyOverlay').addEventListener('click', (e) => {
    if (e.target === $('storyOverlay')) { state.excerptContext = null; hideExcerptFloat(); }
  });
  $('galaxyInfoBarClose').addEventListener('click', () => { state.excerptContext = null; hideExcerptFloat(); });
}

function hashContent(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

// ====== Astronomical objects (35 deep-sky objects) ======
const ASTRONOMICAL_OBJECTS = [
  // Messier catalog highlights
  { id:'m31', name:'仙女座星系', en:'Andromeda Galaxy (M31)', type:'螺旋星系', dist:'254万光年', mag:'3.4', constel:'仙女座',
    desc:'距我们最近的巨型星系，直径约22万光年，包含约1万亿颗恒星。正以每秒110公里的速度靠近银河系，约40亿年后两大星系将碰撞合并为一个巨大的椭圆星系。这是在无光害条件下肉眼可见的最远天体，中国古代称其为"奎宿增廿一"。', x:0.72, y:0.18 },
  { id:'m42', name:'猎户座大星云', en:'Orion Nebula (M42)', type:'发射星云', dist:'1344光年', mag:'4.0', constel:'猎户座',
    desc:'银河系最近的恒星形成区之一，位于猎户座佩剑中央。跨度约24光年，质量约为太阳的2000倍。哈勃望远镜拍摄的"原行星盘"图像彻底改变了我们对行星系统形成的理解。星云深处孕育着数千颗新生恒星，其中包括著名的猎户座四边形星团。', x:0.55, y:0.32 },
  { id:'m45', name:'昴星团', en:'Pleiades (M45)', type:'疏散星团', dist:'444光年', mag:'1.6', constel:'金牛座',
    desc:'七姐妹星团，最著名的疏散星团之一。中国古代称"昴宿"，是二十八宿之一，也是《诗经》中"嘒彼小星，三五在东"所描绘的星群。星团年龄约1亿年，蓝色反射星云是星际尘埃反射昴星团亮星光芒形成的。实际包含超过1000颗恒星。', x:0.48, y:0.22 },
  { id:'m1', name:'蟹状星云', en:'Crab Nebula (M1)', type:'超新星遗迹', dist:'6500光年', mag:'8.4', constel:'金牛座',
    desc:'1054年7月4日超新星爆发遗迹，中国宋代天文学家详细记录了这颗"客星"连续23天白昼可见。星云中心是一颗脉冲星（中子星），每秒自转30.2次，发出从射电到伽马射线的全波段辐射。星云至今仍以每秒1500公里的速度向外膨胀。', x:0.50, y:0.28 },
  { id:'m51', name:'涡状星系', en:'Whirlpool Galaxy (M51)', type:'螺旋星系', dist:'2300万光年', mag:'8.4', constel:'猎犬座',
    desc:'经典的大设计螺旋星系，与较小伴星系NGC 5195形成壮观的引力相互作用对。其旋臂结构由引力潮汐力触发，密集的粉红色恒星形成区点缀在旋臂上。是业余天文学家最热衷拍摄的星系之一，清晰展现了螺旋星系的美丽对称结构。', x:0.82, y:0.45 },
  { id:'m57', name:'环状星云', en:'Ring Nebula (M57)', type:'行星状星云', dist:'2300光年', mag:'8.8', constel:'天琴座',
    desc:'类太阳恒星死亡后留下的壮丽遗迹，中心是一颗正在冷却的白矮星。外层气体被抛射形成完美的环状结构，实际上更像一个桶形的气体壳层。星云中央的白矮星表面温度超过10万摄氏度，强烈的紫外辐射激发了周围气体的发光。', x:0.65, y:0.52 },
  { id:'m104', name:'草帽星系', en:'Sombrero Galaxy (M104)', type:'螺旋星系', dist:'2800万光年', mag:'8.0', constel:'室女座',
    desc:'以其明亮的核球和暗色环状尘埃带形似墨西哥草帽而得名。星系中心存在一个约10亿倍太阳质量的超大质量黑洞。尘埃带是星系盘中恒星形成和星际消光的区域，从侧面看去形成了一道壮观的剪影。', x:0.38, y:0.58 },
  { id:'m27', name:'哑铃星云', en:'Dumbbell Nebula (M27)', type:'行星状星云', dist:'1200光年', mag:'7.5', constel:'狐狸座',
    desc:'1764年梅西耶发现的第一个行星状星云，形似哑铃或苹果核。由一颗垂死恒星在约1万年前抛出的气体壳层组成。其膨胀速度约为每秒31公里，星云年龄约9800年。这是北天夏季最受业余天文爱好者欢迎的星云之一。', x:0.58, y:0.62 },
  { id:'m13', name:'武仙座球状星团', en:'Hercules Cluster (M13)', type:'球状星团', dist:'25000光年', mag:'5.8', constel:'武仙座',
    desc:'北天最壮观的球状星团，直径约145光年，包含约30万颗恒星。这些恒星紧密地聚集在一起，核心区域的恒星密度是太阳邻域的上千倍。1974年阿雷西博射电望远镜向M13发射了人类第一条星际无线电信息——"阿雷西博信息"。', x:0.62, y:0.15 },
  { id:'m8', name:'礁湖星云', en:'Lagoon Nebula (M8)', type:'发射星云', dist:'4100光年', mag:'6.0', constel:'人马座',
    desc:'巨大的星际气体云，跨度约110光年。星云中纵横交错的暗色尘埃带如同潟湖，其中嵌着年轻的疏散星团NGC 6530。星云中心最明亮的区域——"沙漏星云"——由一颗炽热的O型恒星电离周围氢气形成。', x:0.42, y:0.70 },
  { id:'m16', name:'鹰状星云', en:'Eagle Nebula (M16)', type:'发射星云', dist:'7000光年', mag:'6.0', constel:'巨蛇座',
    desc:'哈勃望远镜1995年拍摄的"创生之柱"使之成为历史上最具标志性的天文图像。三根巨大的气体尘埃柱内正在形成新的恒星。这些柱子高达数光年，但正在被中心年轻大质量恒星的强烈辐射慢慢侵蚀。', x:0.48, y:0.75 },
  { id:'m20', name:'三裂星云', en:'Trifid Nebula (M20)', type:'发射/反射星云', dist:'5200光年', mag:'6.3', constel:'人马座',
    desc:'罕见的三种星云复合体——红色发射星云（氢气受激发光）、蓝色反射星云（星光被尘埃散射）和暗星云（致密尘埃遮挡光线）。三条暗尘带将星云分为三瓣，因此得名"三裂"。中心恒星是一颗炽热的O7型星。', x:0.40, y:0.72 },
  // More NGC and IC objects
  { id:'ngc7000', name:'北美洲星云', en:'North America Nebula (NGC 7000)', type:'发射星云', dist:'2200光年', mag:'4.0', constel:'天鹅座',
    desc:'形似北美洲大陆的巨大发射星云，跨度约120光年。与邻近的鹈鹕星云（IC 5070）形成一对壮观的星云组合。在光害极低的夏季夜晚，肉眼可见其模糊轮廓。星云中的电离氢因受到暗星云遮挡而呈现出北美大陆般的形状。', x:0.68, y:0.38 },
  { id:'ic434', name:'马头星云', en:'Horsehead Nebula (IC 434/B33)', type:'暗星云', dist:'1500光年', mag:'—', constel:'猎户座',
    desc:'最著名的暗星云，形似从棋盘格中跃出的马头。由致密的不透明尘埃遮挡后方IC 434发射星云的红色辉光而形成剪影。其跨度约3.5光年，是猎户座分子云复合体的一部分。虽然肉眼无法看见，但它是天文摄影中最热门的深空目标。', x:0.54, y:0.35 },
  { id:'ngc2392', name:'爱斯基摩星云', en:'Eskimo Nebula (NGC 2392)', type:'行星状星云', dist:'3000光年', mag:'9.1', constel:'双子座',
    desc:'形似戴着毛皮兜帽的人脸，由外层高速气体（每秒115公里）与内层较慢气体相互作用形成双重壳层结构。中央恒星正以惊人的速度向白矮星演化。1787年由威廉·赫歇尔发现，是天空中最奇特的行星状星云之一。', x:0.44, y:0.08 },
  { id:'m101', name:'风车星系', en:'Pinwheel Galaxy (M101)', type:'螺旋星系', dist:'2100万光年', mag:'7.9', constel:'大熊座',
    desc:'几乎正对我们的巨大螺旋星系，直径约17万光年，几乎是银河系的两倍。旋臂上点缀着大量粉红色HII区（恒星形成区），其中NGC 5461等巨型HII区比整个猎户座星云还要亮数千倍。星系外围可见多颗超新星的遗迹。', x:0.75, y:0.08 },
  { id:'m33', name:'三角座星系', en:'Triangulum Galaxy (M33)', type:'螺旋星系', dist:'273万光年', mag:'5.7', constel:'三角座',
    desc:'本星系群第三大星系，仅次于仙女座大星系和银河系。在没有光害的极暗夜空，肉眼可以直接看到这个距离我们273万光年的星系——这是人类肉眼无需借助望远镜可见的最远天体之一。', x:0.78, y:0.28 },
  { id:'m81', name:'波德星系', en:"Bode's Galaxy (M81)", type:'螺旋星系', dist:'1200万光年', mag:'6.9', constel:'大熊座',
    desc:'北天最美丽的螺旋星系之一，与不规则星系M82形成一对著名的引力相互作用星系对。其旋臂结构规整优美，拥有明亮的中心核球。通过双筒望远镜即可观测到这个"大熊座的明珠"。', x:0.85, y:0.15 },
  { id:'m82', name:'雪茄星系', en:'Cigar Galaxy (M82)', type:'星暴星系', dist:'1200万光年', mag:'8.4', constel:'大熊座',
    desc:'与M81引力相互作用导致其中心区域爆发疯狂的恒星形成的星暴星系。中心1万光年范围内的恒星诞生速率是银河系的10倍以上。从星系核心喷出的电离氢气形成了壮观的超级星系风，延伸数万光年。', x:0.87, y:0.12 },
  { id:'m64', name:'黑眼星系', en:'Black Eye Galaxy (M64)', type:'螺旋星系', dist:'1700万光年', mag:'8.5', constel:'后发座',
    desc:'因核心前方一条显著的暗色尘埃吸收带而得名。更奇特的是，其外层气体与内部恒星的旋转方向相反——这揭示了这个星系在过去曾吞并了一个较小的伴星系，留下了这个反向旋转的气体盘。', x:0.52, y:0.48 },
  { id:'m97', name:'猫头鹰星云', en:'Owl Nebula (M97)', type:'行星状星云', dist:'2600光年', mag:'9.9', constel:'大熊座',
    desc:'形似猫头鹰面部的行星状星云。两个对称的暗色区域如同猫头鹰深邃的眼睛，实际上是星云膨胀壳层中物质密度较低的区域。1781年由皮埃尔·梅香发现，是小望远镜中最受欢迎的天体之一。', x:0.80, y:0.08 },
  // Additional significant objects
  { id:'m17', name:'欧米伽星云', en:'Omega Nebula (M17)', type:'发射星云', dist:'5500光年', mag:'6.0', constel:'人马座',
    desc:'又名天鹅星云或马蹄星云，是银河系最亮的HII区之一。由炽热的年轻恒星的强烈紫外辐射激发周围氢气发光。星云跨度约15光年，总质量约800倍太阳质量。其弯曲的发光气体条纹形似希腊字母Ω。', x:0.44, y:0.74 },
  { id:'m63', name:'向日葵星系', en:'Sunflower Galaxy (M63)', type:'螺旋星系', dist:'2700万光年', mag:'8.6', constel:'猎犬座',
    desc:'以其密集缠绕的旋臂形似向日葵花瓣而得名。旋臂上散布着大量粉红色恒星形成区和蓝色年轻星团。其外围有一条暗淡的星流，是从一个被潮汐力瓦解的矮星系中剥离出来的恒星遗迹。', x:0.70, y:0.42 },
  { id:'ngc4565', name:'针星系', en:'Needle Galaxy (NGC 4565)', type:'螺旋星系', dist:'4000万光年', mag:'9.6', constel:'后发座',
    desc:'最著名的侧向螺旋星系之一，从地球上正好看到它的侧面。其细长如针的轮廓中央被一条窄窄的暗色尘埃带分割。星系直径约10万光年，与银河系大小相当，是研究星系盘和暗物质晕结构的理想目标。', x:0.46, y:0.40 },
  { id:'m3', name:'猎犬座球状星团', en:'Canes Venatici Cluster (M3)', type:'球状星团', dist:'33900光年', mag:'6.2', constel:'猎犬座',
    desc:'北天最美丽的球状星团之一，包含超过50万颗恒星，其中变星数量高达274颗——是所有球状星团中已知变星最多的。其年龄约80亿年，比太阳年老得多，是银河系早期形成的化石遗迹。', x:0.66, y:0.12 },
  { id:'m78', name:'奥特曼星云', en:'Reflection Nebula (M78)', type:'反射星云', dist:'1600光年', mag:'8.3', constel:'猎户座',
    desc:'猎户座分子云复合体中最亮的反射星云。两颗炽热的B型恒星发出的蓝光被周围的星际尘埃散射，形成了梦幻般的蓝色光辉。通过望远镜看去仿佛一团蓝色的烟雾。星云中嵌着约45颗年轻恒星。', x:0.56, y:0.30 },
  { id:'ngc884', name:'英仙座双星团', en:'Double Cluster (NGC 869/884)', type:'疏散星团', dist:'7500光年', mag:'4.3', constel:'英仙座',
    desc:'北天最壮观的疏散星团对，肉眼即可见其朦胧光辉。两个星团相距仅数百光年，年龄分别约为13百万年和5.6百万年。通过双筒望远镜观测时，两个星团在同一视场中闪耀着数百颗蓝白色年轻恒星。', x:0.56, y:0.08 },
  { id:'m5', name:'巨蛇座球状星团', en:'Serpens Cluster (M5)', type:'球状星团', dist:'24500光年', mag:'5.7', constel:'巨蛇座',
    desc:'最古老的球状星团之一，年龄约130亿年，几乎是宇宙本身的年龄。直径约165光年，包含约50万颗恒星。星团中已知拥有超过100颗变星，是研究恒星演化的天然实验室。', x:0.50, y:0.56 },
  { id:'ngc7023', name:'鸢尾花星云', en:'Iris Nebula (NGC 7023)', type:'反射星云', dist:'1300光年', mag:'6.8', constel:'仙王座',
    desc:'仙王座中美丽的反射星云，形似一朵盛开的鸢尾花。一颗炽热的B型恒星照亮了周围的尘埃云，散射出柔和的蓝色光芒。星云中央区域还含有红色的光致发光辐射，由微小尘埃颗粒在紫外光照射下发出。', x:0.64, y:0.08 },
  { id:'m71', name:'天箭座球状星团', en:'Sagitta Cluster (M71)', type:'球状星团', dist:'13000光年', mag:'8.2', constel:'天箭座',
    desc:'一个不同寻常的球状星团，密度相对松散，更像一个富集的疏散星团。包含约2万颗恒星，其中最亮的恒星已经演化成为红巨星。1746年由让-菲利普·德·歇索发现。', x:0.58, y:0.18 },
  { id:'ngc4631', name:'鲸鱼星系', en:'Whale Galaxy (NGC 4631)', type:'螺旋星系', dist:'3000万光年', mag:'9.3', constel:'猎犬座',
    desc:'一个显著扭曲的侧向螺旋星系，形似一头巨鲸。与邻近的小椭圆星系NGC 4627的引力相互作用使其盘面翘曲变形。星系中央的星暴活动非常活跃，产生了大量的热气体喷流和X射线辐射。', x:0.76, y:0.38 },
  { id:'m106', name:'梅西耶106', en:'Messier 106 (M106)', type:'螺旋星系', dist:'2400万光年', mag:'8.4', constel:'猎犬座',
    desc:'一个不同寻常的赛弗特星系，中心超大质量黑洞正在活跃地吸积物质。其最显著的特征是拥有四条旋臂而非通常的两条——额外两条"反常旋臂"是由中心黑洞的喷流驱动的冲击波形成的，只在X射线波段可见。', x:0.74, y:0.40 },
  { id:'ngc6543', name:'猫眼星云', en:"Cat's Eye Nebula (NGC 6543)", type:'行星状星云', dist:'3300光年', mag:'8.1', constel:'天龙座',
    desc:'结构最复杂的行星状星云之一，哈勃图像揭示了至少11层同心气体壳层。中心恒星可能是一个双星系统，伴星的引力导致了独特的多层结构。星云外围还有一个巨大的暗淡光晕，是更早期的物质抛射遗迹。', x:0.60, y:0.08 },
  { id:'m92', name:'武仙座M92', en:'Hercules M92', type:'球状星团', dist:'26700光年', mag:'6.4', constel:'武仙座',
    desc:'常被M13的光芒所掩盖但同样壮观的球状星团。年龄约142亿年，几乎是宇宙年龄。其恒星密度极高，中心区域的恒星间距只有太阳邻域的百分之一。如果地球位于M92的核心，夜空中将有数千颗恒星比满月还亮。', x:0.60, y:0.14 },
  { id:'ngc6960', name:'帷幕星云', en:'Veil Nebula (NGC 6960/95)', type:'超新星遗迹', dist:'2400光年', mag:'7.0', constel:'天鹅座',
    desc:'约2万年前一颗大质量恒星爆炸后形成的壮观遗迹，跨度约110光年。纤细的气体纤维形如飘浮的面纱，在OIII和Hα波段发出青绿和红色的光芒。整个帷幕星云正在以每秒170公里的速度向外膨胀，是天体摄影师最热门的夏季目标。', x:0.66, y:0.36 },
];

// Galaxy view state
let galaxyState = { scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0, lastPinchDist: 0, spaceW: 2800, spaceH: 1800, lvMarkerPos: null };
let galaxyGrowth = null;

// Saved astronomical objects (persisted in localStorage)
function getSavedAstro() {
  try { return JSON.parse(localStorage.getItem('dayday_astro_saved') || '[]'); } catch(e) { return []; }
}
function saveAstroId(id) {
  const saved = getSavedAstro();
  if (!saved.includes(id)) { saved.push(id); localStorage.setItem('dayday_astro_saved', JSON.stringify(saved)); updateSavedCount(); placeAstroMarkers(); }
}
function unsaveAstroId(id) {
  const saved = getSavedAstro().filter(x => x !== id);
  localStorage.setItem('dayday_astro_saved', JSON.stringify(saved)); updateSavedCount(); placeAstroMarkers();
}
function isAstroSaved(id) { return getSavedAstro().includes(id); }

// ====== NASA 实拍影像（images-api.nasa.gov 免 key；IndexedDB 缓存；离线回退符号封面） ======
const NASA_IMG_API = 'https://images-api.nasa.gov';
const OBJ_SEARCH_OVERRIDES = {
  'ngc7000': 'north america nebula', 'ic434': 'horsehead nebula', 'ngc2392': 'eskimo nebula',
  'ngc4565': 'needle galaxy', 'ngc7023': 'iris nebula', 'ngc4631': 'whale galaxy',
  'ngc6960': 'veil nebula', 'ngc6543': 'cats eye nebula', 'ngc884': 'double cluster perseus',
  'm78': 'messier 78', 'm92': 'messier 92', 'm71': 'messier 71', 'm106': 'messier 106',
  'm3': 'messier 3', 'm5': 'messier 5', 'm17': 'omega nebula', 'm63': 'sunflower galaxy',
  'm97': 'owl nebula', 'm64': 'black eye galaxy', 'm82': 'cigar galaxy', 'm81': 'bodes galaxy',
  'm104': 'sombrero galaxy', 'm57': 'ring nebula', 'm27': 'dumbbell nebula', 'm8': 'lagoon nebula',
  'm16': 'eagle nebula', 'm20': 'trifid nebula', 'm13': 'hercules cluster', 'm1': 'crab nebula',
  'm42': 'orion nebula', 'm45': 'pleiades', 'm51': 'whirlpool galaxy', 'm31': 'andromeda galaxy',
  'm33': 'triangulum galaxy', 'm101': 'pinwheel galaxy',
};
function objFallbackEmoji(obj) {
  const t = obj.type;
  if (t.includes('星系')) return '🌌';
  if (t.includes('星云')) return '🌫️';
  if (t.includes('星团')) return '✨';
  return '🔭';
}
function nasaPickUrl(links) {
  if (!links?.length) return null;
  const l = links.find(x => x.href?.includes('~medium.jpg')) || links.find(x => x.href?.includes('~large.jpg')) || links[0];
  return l?.href || null;
}
async function fetchNasaObjectImage(obj) {
  const key = 'gal_' + obj.id;
  try {
    const hit = await db.mediaCache.get(key);
    if (hit?.blob) return { blob: hit.blob, title: hit.meta?.title, credit: hit.meta?.credit };
  } catch (e) {}
  const term = OBJ_SEARCH_OVERRIDES[obj.id] || (obj.en.split(' (')[0] + ' ' + obj.id.toUpperCase());
  const r = await fetch(`${NASA_IMG_API}/search?q=${encodeURIComponent(term)}&media_type=image&page_size=20`);
  if (!r.ok) throw new Error('search ' + r.status);
  const items = (await r.json())?.collection?.items || [];
  // 相关度排序：标题/描述命中天体英文名分词越多越靠前（NASA 搜索会混入无关结果）
  const tokens = obj.en.toLowerCase().split(/[\s·,()'"]/)
    .map(t => t.trim())
    .filter(t => t.length > 2 && !['the','and','for','with','nebula','cluster','galaxy','messier','hercules'].includes(t));
  const scored = items
    .map(it => {
      const text = ((it.data?.[0]?.title || '') + ' ' + (it.data?.[0]?.description || '') + ' ' + (it.data?.[0]?.nasa_id || '')).toLowerCase();
      return { url: nasaPickUrl(it.links), score: tokens.filter(t => text.includes(t)).length, it };
    })
    .filter(x => x.url)
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) throw new Error('no results');
  const src = best.url;
  const meta = { title: best.it.data?.[0]?.title || obj.name, credit: 'NASA Image Library', src };
  try {
    const br = await fetch(src, { mode: 'cors' });
    if (br.ok) {
      const blob = await br.blob();
      if (blob.size > 0) {
        db.mediaCache.put(key, blob, meta).catch(() => {});
        return { blob, ...meta };
      }
    }
  } catch (e) {}
  return { src, ...meta }; // 无 CORS 时直连展示，仅本次有效
}
async function applyObjectImage(obj, imgId, creditId, fallbackId) {
  const img = $(imgId), credit = $(creditId), fb = $(fallbackId);
  fb.textContent = objFallbackEmoji(obj);
  try {
    const r = await fetchNasaObjectImage(obj);
    if (r.blob) {
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      img.dataset.url = URL.createObjectURL(r.blob);
      img.src = img.dataset.url;
    } else if (r.src) {
      img.src = r.src;
    } else throw new Error('no image');
    img.style.display = 'block';
    fb.style.display = 'none';
    credit.textContent = r.credit || 'NASA Image Library';
    credit.style.display = 'block';
  } catch (e) {
    img.style.display = 'none';
    fb.style.display = 'flex';
    credit.style.display = 'none';
  }
}

// ====== 每日天文图 APOD（需 NASA key，默认 DEMO_KEY 公共额度） ======
let apodLoaded = false;
async function loadApod() {
  if (apodLoaded) return;
  apodLoaded = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const key = (await db.settings.get('nasa_key')) || 'DEMO_KEY';
    const cacheKey = 'apod_' + today;
    let apod = null;
    const hit = await db.mediaCache.get(cacheKey);
    if (hit?.blob) { apod = { blob: hit.blob, meta: hit.meta }; }
    else {
      let r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}&thumbs=true&date=${today}`);
      if (!r.ok) r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}&thumbs=true`);
      if (!r.ok) return; // 无网或额度超限：静默不显示
      const j = await r.json();
      const url = j.media_type === 'image' ? j.url : (j.thumbnail_url || j.url);
      const meta = { title: j.title, desc: j.explanation, credit: j.copyright ? '© ' + j.copyright + ' · NASA APOD' : 'NASA APOD' };
      try {
        const br = await fetch(url, { mode: 'cors' });
        if (br.ok) {
          const blob = await br.blob();
          if (blob.size > 0) { apod = { blob, meta }; db.mediaCache.put(cacheKey, blob, meta).catch(() => {}); }
        }
      } catch (e) {}
      if (!apod) apod = { src: url, meta };
    }
    if (apod.blob) {
      $('apodImg').src = URL.createObjectURL(apod.blob);
    } else if (apod.src) {
      $('apodImg').src = apod.src;
    } else return;
    $('apodTitle').textContent = apod.meta.title || '';
    $('apodDesc').textContent = (apod.meta.desc || '').slice(0, 140) + '…';
    $('apodCredit').textContent = apod.meta.credit || 'NASA APOD';
    $('apodCard').style.display = '';
  } catch (e) { console.warn('APOD failed:', e); }
}

// ====== AstronomyAPI 高清星图（设置面板填 key 后解锁） ======
async function requestHdStarChart() {
  const appId = (await db.settings.get('astro_api_id')) || '';
  const secret = (await db.settings.get('astro_api_secret')) || '';
  if (!appId || !secret) { toast('先在「观测者档案」填写 AstronomyAPI 的 ID 与 Secret'); return; }
  toast('正在请求高清星图…');
  try {
    const loc = await getObsLocation();
    const d = skyDateAt(skyFsHour());
    const { gmstDeg } = await import('../client/star-chart.js');
    const lst = (gmstDeg(d) + loc.lon + 360) % 360;
    const body = {
      style: 'default',
      observer: { latitude: loc.lat, longitude: loc.lon, date: d.toISOString() },
      view: { type: 'area', parameters: { position: { equatorial: { rightAscension: lst / 15, declination: loc.lat } }, zoom: 4 } },
    };
    const auth = btoa(appId + ':' + secret);
    const url = 'https://api.astronomyapi.com/api/v2/studio/star-chart';
    let data = null;
    const cap = window.capacitorHttp?.CapacitorHttp;
    if (cap?.post) {
      const resp = await cap.post({ url, headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' }, data: body });
      if (resp.status >= 200 && resp.status < 300) data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
    } else {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) data = await r.json();
    }
    const imgUrl = data?.data?.imageUrl;
    if (!imgUrl) { toast('高清星图请求失败（检查 key 与额度）'); return; }
    $('astroHdImg').src = imgUrl;
    $('astroHdTitle').textContent = '高清星图 · ' + String(d.getHours()).padStart(2, '0') + ':00 ' + loc.city;
    $('astroHdOverlay').classList.add('open');
  } catch (e) {
    console.warn('HD star chart failed:', e);
    toast('高清星图请求失败，请检查 key 与网络');
  }
}
$('skyFsHd').addEventListener('click', requestHdStarChart);
$('astroHdClose').addEventListener('click', () => $('astroHdOverlay').classList.remove('open'));
$('astroHdOverlay').addEventListener('click', e => { if (e.target === $('astroHdOverlay')) $('astroHdOverlay').classList.remove('open'); });

// ====== Galaxy Map (星系图鉴) ======
async function loadGalaxy() {
  const g = await db.growth.get();
  const stats = await db.stats();
  if (state.profile) g.userId = state.profile.userId;
  g.stats = stats;

  const xp = g.xp || 0;
  let lv = 1, levelName = LEVELS[0].name, nextXp = LEVELS[1] ? LEVELS[1].xp - xp : 0, nextLevelName = LEVELS[1] ? LEVELS[1].name : '';
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) { lv = LEVELS[i].lv; levelName = LEVELS[i].name; nextXp = LEVELS[i + 1] ? LEVELS[i + 1].xp - xp : 0; nextLevelName = LEVELS[i + 1] ? LEVELS[i + 1].name : ''; break; }
  }

  $('galaxyLevel').textContent = 'Lv.' + lv + ' ' + levelName;
  // XP progress bar: show % to next level
  if (nextXp > 0) {
    // nextXp is the gap to reach next level, need to compute pct between current and next
    const curLvXp = LEVELS.find(l => l.lv === lv)?.xp || 0;
    const nextLvXp = LEVELS.find(l => l.lv === lv + 1)?.xp || curLvXp + 100;
    const progressInLevel = xp - curLvXp;
    const levelRange = nextLvXp - curLvXp;
    const pct = Math.round(progressInLevel / levelRange * 100);
    $('galaxyXpFill').style.width = pct + '%';
    $('galaxyXp').textContent = xp + ' XP · 距「' + nextLevelName + '」' + nextXp + ' XP';
  } else {
    $('galaxyXpFill').style.width = '100%';
    $('galaxyXp').textContent = xp + ' XP · 已达巅峰';
  }

  galaxyGrowth = { ...g, level: lv, xp, levelName, nextXp, nextLevelName };

  // Level-up rewards: unlock hidden stories (skip in demo)
  if (!isLite) {
    checkLevelRewards(lv);
    refreshAchievements().then(renderAchievements);
    checkAchievements();
  }

  initGalaxyView(lv);
  renderGalaxy();
  updateSavedCount();
  loadApod();

  const savedCount = getSavedAstro().length;
  $('growthMetrics').innerHTML = `
    <div class="gmetric">
      <div class="gmetric-icon gmetric-icon-star"></div>
      <div class="gmetric-val">${stats.totalNotes}</div>
      <div class="gmetric-lbl">星图</div>
    </div>
    <div class="gmetric">
      <div class="gmetric-icon gmetric-icon-orbit"></div>
      <div class="gmetric-val">${stats.totalDiary}</div>
      <div class="gmetric-lbl">星轨</div>
    </div>
    <div class="gmetric">
      <div class="gmetric-icon gmetric-icon-moon"></div>
      <div class="gmetric-val">${stats.totalCheckins}</div>
      <div class="gmetric-lbl">观测日</div>
    </div>
    <div class="gmetric gmetric-clickable" onclick="showSavedObjects()">
      <div class="gmetric-icon gmetric-icon-planet"></div>
      <div class="gmetric-val">${savedCount}</div>
      <div class="gmetric-lbl">已收藏</div>
    </div>`;

  const log = (g.xpHistory || []).length
    ? [...g.xpHistory].reverse().slice(0, 12).map(e => `<div class="xp-entry"><span>${fmtDate(e.date)} ${esc(e.source)}</span><span class="xp-amt">+${e.amount}</span></div>`).join('')
    : '<div style="color:var(--text3);font-size:12px;">尚无星尘积累</div>';
  $('xpLogContainer').innerHTML = `<h3 style="margin-bottom:12px;font-size:12px;color:var(--text3);letter-spacing:0.06em;">星尘轨迹</h3><div class="xp-log">${log}</div>`;
}

function initGalaxyView(level) {
  const space = $('galaxySpace');
  const view = $('galaxyView');
  const vw = view.clientWidth, vh = view.clientHeight;

  galaxyState.spaceW = vw * 5;
  galaxyState.spaceH = vh * 5;
  space.style.width = galaxyState.spaceW + 'px';
  space.style.height = galaxyState.spaceH + 'px';

  generateGalaxyStars();
  generateGalaxyNebulae(level || 1);
  placeAstroMarkers();

  galaxyState.scale = 1;
  galaxyState.tx = -(galaxyState.spaceW - vw) / 2;
  galaxyState.ty = -(galaxyState.spaceH - vh) / 2;
  applyGalaxyTransform();

  // Fullscreen button — reset every load, use addEventListener for reliability
  var fsBtn = $('gzFullscreen');
  if (fsBtn) {
    if (isLite) {
      fsBtn.style.display = 'none';
      fsBtn.onclick = null;
    } else {
      fsBtn.style.display = '';
      // Replace node to strip old listeners, then bind fresh
      var newBtn = fsBtn.cloneNode(true);
      fsBtn.parentNode.replaceChild(newBtn, fsBtn);
      newBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        openGalaxyFullscreen();
      });
    }
  }

  // Fallback: event delegation on galaxy view catches clicks even if button gets replaced
  (function() {
    var gv = $('galaxyView');
    if (gv && !gv._fsDelegateBound) {
      gv._fsDelegateBound = true;
      gv.addEventListener('click', function(e) {
        var btn = e.target.closest('#gzFullscreen');
        if (btn && !isLite) {
          e.stopPropagation();
          e.preventDefault();
          openGalaxyFullscreen();
        }
      });
    }
  })();

  initGalaxyInteraction();
}

function generateGalaxyStars() {
  const seed = hash32((state.profile?.userId || 'default') + 's');
  const rng = mulberry32(seed);
  const cxPct = 48, cyPct = 50;

  function density(distPct) { return 1 - Math.pow(distPct / 60, 1.3); }

  // Background stars — batch into fewer gradient layers for performance
  let bgGrads = [];
  for (let i = 0; i < 300; i++) {
    const sx = rng() * 100, sy = rng() * 100;
    const dx = sx - cxPct, dy = sy - cyPct;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (rng() > density(dist)) continue;
    const sr = (rng() * 1.2 + 0.3).toFixed(1);
    const alpha = (rng() * 0.5 + 0.3).toFixed(2);
    bgGrads.push(`radial-gradient(${sr}px ${sr}px at ${sx.toFixed(1)}% ${sy.toFixed(1)}%, rgba(210,215,235,${alpha}), transparent)`);
  }
  $('galaxyStars').style.background = bgGrads.join(',');

  // Bright stars
  let fgGrads = [];
  for (let i = 0; i < 60; i++) {
    const sx = rng() * 100, sy = rng() * 100;
    const dx = sx - cxPct, dy = sy - cyPct;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (rng() * 1.3 > density(dist)) continue;
    const sr = (rng() * 3 + 1.5).toFixed(1);
    const alpha = (rng() * 0.35 + 0.45).toFixed(2);
    const tint = rng();
    const rgb = tint > 0.65 ? '200,215,255' : (tint > 0.25 ? '255,240,210' : '201,169,110');
    fgGrads.push(`radial-gradient(${sr}px ${sr}px at ${sx.toFixed(1)}% ${sy.toFixed(1)}%, rgba(${rgb},${alpha}), rgba(${rgb},0) 60%)`);
  }
  $('galaxyStarsBright').style.background = fgGrads.join(',');
}

function generateGalaxyNebulae(level) {
  const seed = hash32((state.profile?.userId || 'def') + 'neb3');
  const rng = mulberry32(seed);
  const palette = [
    'rgba(140,35,70,0.07)', 'rgba(40,45,120,0.07)',
    'rgba(100,20,55,0.07)', 'rgba(55,20,90,0.07)',
    'rgba(30,55,110,0.06)', 'rgba(120,22,60,0.07)',
    'rgba(80,25,65,0.06)', 'rgba(45,30,100,0.07)',
    'rgba(25,50,105,0.06)', 'rgba(110,18,55,0.07)',
    'rgba(60,28,85,0.06)', 'rgba(130,30,75,0.06)',
  ];
  // Unlock nebulae progressively: 4 + 2 per level, max 18
  const count = Math.min(18, 4 + (level - 1) * 2);
  let nebulae = [];
  for (let i = 0; i < count; i++) {
    const nx = (rng() * 70 + 15).toFixed(0);
    const ny = (rng() * 70 + 15).toFixed(0);
    const nw = (rng() * 400 + 200).toFixed(0);
    const nh = (rng() * 350 + 150).toFixed(0);
    nebulae.push(`radial-gradient(ellipse ${nw}px ${nh}px at ${nx}% ${ny}%, ${palette[i % palette.length]}, transparent 70%)`);
  }
  $('galaxyNebulae').style.background = nebulae.join(',');
}

function placeAstroMarkers() {
  const container = $('galaxyMarkers');
  const W = galaxyState.spaceW, H = galaxyState.spaceH;
  const savedIds = new Set(getSavedAstro());
  let html = '';

  ASTRONOMICAL_OBJECTS.forEach(obj => {
    const px = (obj.x * W).toFixed(0);
    const py = (obj.y * H).toFixed(0);
    const labelRight = obj.x > 0.65;
    const isSaved = savedIds.has(obj.id);
    html += `
      <div class="galaxy-marker${isSaved ? ' saved' : ''}" data-obj="${obj.id}" style="left:${px}px;top:${py}px;">
        <div class="galaxy-marker-dot"></div>
        <span class="galaxy-marker-label${labelRight ? ' galaxy-marker-label-right' : ''}">${obj.name}</span>
      </div>`;
  });

  // Level planet markers — centered near galaxy core
  const levels = LEVELS;
  const curLv = galaxyGrowth?.level || 1;
  const lcx = W * 0.48, lcy = H * 0.50;
  const spreadR = Math.min(W, H) * 0.18;
  const spiralAngle = 0.65;

  levels.forEach((lv, i) => {
    const angle = -Math.PI / 2 + i * spiralAngle;
    const dist = spreadR * (0.25 + i * 0.12);
    const px = (lcx + Math.cos(angle) * dist).toFixed(0);
    const py = (lcy + Math.sin(angle) * dist).toFixed(0);
    const isUnlocked = lv.lv <= curLv;
    const isCurrent = lv.lv === curLv;
    const cls = isCurrent ? ' active' : (isUnlocked ? '' : ' locked');
    // Store current LV marker world position for lock feature
    if (isCurrent) galaxyState.lvMarkerPos = { x: +px, y: +py, lv: lv.lv, name: lv.name };
    html += `
      <div class="galaxy-marker level-marker${cls}" data-level="${lv.lv}" style="left:${px}px;top:${py}px;">
        <div class="galaxy-marker-dot"></div>
        <span class="galaxy-marker-label">${lv.name} · Lv.${lv.lv}</span>
      </div>`;
  });

  // Level connector lines (SVG path that connects the level markers in a growing spiral)
  let linePath = '';
  const lvPositions = [];
  LEVELS.forEach((lv, i) => {
    const angle = -Math.PI / 2 + i * spiralAngle;
    const dist = spreadR * (0.25 + i * 0.12);
    const px = lcx + Math.cos(angle) * dist;
    const py = lcy + Math.sin(angle) * dist;
    lvPositions.push({ x: px, y: py, unlocked: lv.lv <= curLv });
  });
  // Draw lines between each consecutive pair
  let pathD = '';
  for (let i = 0; i < lvPositions.length; i++) {
    if (i > 0) {
      const prev = lvPositions[i - 1];
      const curr = lvPositions[i];
      if (curr.unlocked || prev.unlocked) {
        // Dashed for future, solid for past
        pathD += `M${prev.x.toFixed(0)},${prev.y.toFixed(0)} L${curr.x.toFixed(0)},${curr.y.toFixed(0)} `;
      }
    }
  }
  html += `<svg class="galaxy-level-lines" style="position:absolute;top:0;left:0;width:${W}px;height:${H}px;pointer-events:none;z-index:2;"><path d="${pathD}" fill="none" stroke="rgba(201,169,110,0.15)" stroke-width="0.8" stroke-dasharray="3,5"/></svg>`;

  container.innerHTML = html;

  // Bind marker clicks
  container.querySelectorAll('.galaxy-marker[data-obj]').forEach(m => {
    m.addEventListener('click', e => { e.stopPropagation(); showGalaxyPopup(m.dataset.obj); });
  });
  container.querySelectorAll('.galaxy-marker[data-level]').forEach(m => {
    m.addEventListener('click', e => {
      e.stopPropagation();
      const lv = parseInt(m.dataset.level);
      const lvData = LEVELS.find(l => l.lv === lv);
      const curLv = galaxyGrowth?.level || 1;
      if (lv <= curLv) {
        const nextLv = LEVELS.find(l => l.lv === lv + 1);
        const need = nextLv ? ' · 距下一级 ' + (nextLv.xp - (galaxyGrowth?.xp || 0)) + ' XP' : '';
        toast((lvData?.name || '') + ' · Lv.' + lv + ' · ' + (lvData?.xp || 0) + ' XP' + need);
      } else {
        toast('「' + (lvData?.name || '') + '」尚未解锁 · 需要 ' + (lvData?.xp || 0) + ' XP');
      }
    });
  });
}

function renderGalaxy() { applyGalaxyTransform(); }

function applyGalaxyTransform() {
  const space = $('galaxySpace');
  space.style.transform = `translate(${galaxyState.tx}px, ${galaxyState.ty}px) scale(${galaxyState.scale})`;
}

let galaxyInteractionBound = false;

function initGalaxyInteraction() {
  if (galaxyInteractionBound) return;
  galaxyInteractionBound = true;

  const gv = $('galaxyView');

  gv.addEventListener('pointerdown', e => {
    if (e.target.closest('.galaxy-marker') || e.target.closest('.galaxy-zoom-controls')) return;
    galaxyState.dragging = true;
    galaxyState.lastX = e.clientX;
    galaxyState.lastY = e.clientY;
    gv.style.cursor = 'grabbing';
    gv.setPointerCapture(e.pointerId);
  });

  window.addEventListener('pointermove', e => {
    if (!galaxyState.dragging) return;
    galaxyState.tx += e.clientX - galaxyState.lastX;
    galaxyState.ty += e.clientY - galaxyState.lastY;
    galaxyState.lastX = e.clientX;
    galaxyState.lastY = e.clientY;
    applyGalaxyTransform();
  });

  window.addEventListener('pointerup', () => {
    if (galaxyState.dragging) { galaxyState.dragging = false; $('galaxyView').style.cursor = 'grab'; }
  });

  gv.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      galaxyState.lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: false });

  gv.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      zoomTo(galaxyState.scale * dist / galaxyState.lastPinchDist, e.touches[0].clientX, e.touches[0].clientY);
      galaxyState.lastPinchDist = dist;
    }
  }, { passive: false });

  gv.addEventListener('wheel', e => {
    e.preventDefault();
    zoomTo(galaxyState.scale - e.deltaY * 0.005 * galaxyState.scale, e.clientX, e.clientY);
  }, { passive: false });

  $('gzIn').addEventListener('click', e => { e.stopPropagation(); zoomTo(galaxyState.scale * 1.5); });
  $('gzOut').addEventListener('click', e => { e.stopPropagation(); zoomTo(galaxyState.scale / 1.5); });
  $('gzReset').addEventListener('click', e => {
    e.stopPropagation();
    const vw = gv.clientWidth, vh = gv.clientHeight;
    galaxyState.scale = 1;
    galaxyState.tx = -(galaxyState.spaceW - vw) / 2;
    galaxyState.ty = -(galaxyState.spaceH - vh) / 2;
    applyGalaxyTransform();
    hideGalaxyPopup();
  });
  $('gzLock').addEventListener('click', e => { e.stopPropagation(); jumpToCurrentLevel(); });

  gv.addEventListener('click', e => {
    if (!e.target.closest('.galaxy-marker')) hideGalaxyPopup();
  });
}

function zoomTo(newScale, anchorX, anchorY) {
  const view = $('galaxyView');
  const rect = view.getBoundingClientRect();
  const vw = rect.width, vh = rect.height;
  const oldScale = galaxyState.scale;

  newScale = Math.max(0.3, Math.min(6, newScale));
  if (newScale === oldScale) return;

  if (anchorX !== undefined) {
    const ax = anchorX - rect.left, ay = anchorY - rect.top;
    const worldX = (ax - galaxyState.tx) / oldScale;
    const worldY = (ay - galaxyState.ty) / oldScale;
    galaxyState.tx = ax - worldX * newScale;
    galaxyState.ty = ay - worldY * newScale;
  }

  galaxyState.scale = newScale;
  const maxTx = 0, minTx = vw - galaxyState.spaceW * newScale;
  const maxTy = 0, minTy = vh - galaxyState.spaceH * newScale;
  galaxyState.tx = Math.max(minTx, Math.min(maxTx, galaxyState.tx));
  galaxyState.ty = Math.max(minTy, Math.min(maxTy, galaxyState.ty));

  applyGalaxyTransform();
}

function showGalaxyPopup(objId) {
  const obj = ASTRONOMICAL_OBJECTS.find(o => o.id === objId);
  if (!obj) return;
  $('galaxyInfoBarTitle').textContent = obj.name + ' · ' + obj.en;
  $('galaxyInfoBarType').textContent = obj.type + ' · ' + obj.constel + ' · 视星等 ' + obj.mag;
  $('galaxyInfoBarDist').textContent = '距离: ' + obj.dist;
  $('galaxyInfoBarDesc').textContent = obj.desc;

  const saveBtn = $('galaxyInfoBarSave');
  const saved = isAstroSaved(objId);
  saveBtn.textContent = saved ? '已收藏' : '收纳入银河档案';
  saveBtn.className = 'galaxy-info-bar-save' + (saved ? ' saved' : '');
  saveBtn.onclick = async () => {
    if (isAstroSaved(objId)) {
      unsaveAstroId(objId);
      saveBtn.textContent = '收纳入银河档案';
      saveBtn.className = 'galaxy-info-bar-save';
      toast(obj.name + ' 已从银河档案中移除');
    } else {
      saveAstroId(objId);
      saveBtn.textContent = '已收藏';
      saveBtn.className = 'galaxy-info-bar-save saved';
      toast(obj.name + ' 已收纳入银河档案');
      await db.growth.addXP(3, '收藏天体故事');
    }
  };

  // Set excerpt context for text selection
  setExcerptContext(obj.name, '星系图鉴 · ' + obj.en);

  applyObjectImage(obj, 'galaxyInfoBarImg', 'galaxyInfoBarCredit', 'galaxyInfoBarFallback');

  $('galaxyInfoBar').style.display = 'flex';

  (async () => {
    const isNew = await discover('messier', objId);
    if (isNew) {
      await db.growth.addXP(5, '观测天体 · ' + obj.name);
      await checkAchievements();
    }
  })();
}

function hideGalaxyPopup() { $('galaxyInfoBar').style.display = 'none'; }

$('galaxyInfoBarClose').addEventListener('click', () => hideGalaxyPopup());

// ====== Galaxy: Jump to current LV marker ======
function jumpToCurrentLevel() {
  const mp = galaxyState.lvMarkerPos;
  if (!mp) { toast('星图尚未就绪'); return; }
  const vw = $('galaxyView').clientWidth, vh = $('galaxyView').clientHeight;
  galaxyState.scale = 2.5;
  galaxyState.tx = vw / 2 - mp.x * galaxyState.scale;
  galaxyState.ty = vh / 2 - mp.y * galaxyState.scale;
  applyGalaxyTransform();
  toast('已跳转到 LV.' + mp.lv + ' · ' + mp.name);
}

// ====== Galaxy Fullscreen ======
function openGalaxyFullscreen() {
  try {
    $('galaxyFsOverlay').classList.add('open');
    initGalaxyFs();
  } catch(e) {
    console.error('openGalaxyFullscreen error:', e);
    toast('全屏模式启动失败: ' + (e.message || '未知错误'));
  }
}

function closeGalaxyFullscreen() {
  $('galaxyFsOverlay').classList.remove('open');
  $('galaxyFsPopup').style.display = 'none';
  galaxyFsState = null;
  galaxyFsInteractionBound = false;
  state.excerptContext = null;
  hideExcerptFloat();
}

let galaxyFsState = null;

function initGalaxyFs() {
  try {
  const view = $('galaxyFsView');
  if (!view) throw new Error('galaxyFsView not found');
  const vw = view.clientWidth, vh = view.clientHeight;
  const spaceW = vw * 5, spaceH = vh * 5;
  const space = $('galaxyFsSpace');
  space.style.width = spaceW + 'px';
  space.style.height = spaceH + 'px';

  galaxyFsState = { scale: 1, tx: -(spaceW - vw) / 2, ty: -(spaceH - vh) / 2, dragging: false, lastX: 0, lastY: 0, lastPinchDist: 0, spaceW, spaceH };

  // Generate stars and nebulae
  const seed = hash32((state.profile?.userId || 'default') + 'fs');
  const rng = mulberry32(seed);
  const cxPct = 50, cyPct = 48;
  function density(distPct) { return 1 - Math.pow(distPct / 70, 1.4); }

  let bgGrads = [];
  for (let i = 0; i < 1000; i++) {
    const sx = rng() * 100, sy = rng() * 100;
    const dx = sx - cxPct, dy = sy - cyPct;
    if (rng() > density(Math.sqrt(dx*dx+dy*dy))) continue;
    const sr = (rng()*1.4+0.3).toFixed(1);
    const alpha = (rng()*0.55+0.25).toFixed(2);
    const color = rng() > 0.92 ? `rgba(201,169,110,${alpha})` : (rng() > 0.7 ? `rgba(190,200,230,${alpha})` : `rgba(220,225,240,${alpha})`);
    bgGrads.push(`radial-gradient(${sr}px ${sr}px at ${sx.toFixed(1)}% ${sy.toFixed(1)}%, ${color}, transparent)`);
  }
  $('galaxyFsStars').style.background = bgGrads.join(',');

  let fgGrads = [];
  for (let i = 0; i < 180; i++) {
    const sx = rng() * 100, sy = rng() * 100;
    const dx = sx - cxPct, dy = sy - cyPct;
    if (rng()*1.5 > density(Math.sqrt(dx*dx+dy*dy))) continue;
    const sr = (rng()*3.5+1.8).toFixed(1);
    const alpha = (rng()*0.4+0.4).toFixed(2);
    const tint = rng();
    const rgb = tint > 0.7 ? '200,215,255' : (tint > 0.4 ? '255,240,210' : (tint > 0.15 ? '255,255,255' : '201,169,110'));
    fgGrads.push(`radial-gradient(${sr}px ${sr}px at ${sx.toFixed(1)}% ${sy.toFixed(1)}%, rgba(${rgb},${alpha}), rgba(${rgb},0) 65%)`);
  }
  $('galaxyFsStarsBright').style.background = fgGrads.join(',');

  // Nebulae — level-gated (6 + 2 per level, max 24)
  const fsLv = galaxyGrowth?.level || 1;
  const fsNebCount = Math.min(24, 6 + (fsLv - 1) * 2);
  const palette = ['rgba(160,40,80,0.07)','rgba(80,30,70,0.08)','rgba(40,50,130,0.06)','rgba(120,20,50,0.07)','rgba(60,20,100,0.06)','rgba(180,30,60,0.05)','rgba(30,60,120,0.06)','rgba(100,15,50,0.07)','rgba(50,40,100,0.05)','rgba(140,25,70,0.06)','rgba(70,20,90,0.06)','rgba(20,50,110,0.05)'];
  let nebulae = [];
  for (let i = 0; i < fsNebCount; i++) {
    const nx = (rng()*80+10).toFixed(0), ny = (rng()*80+10).toFixed(0);
    const nw = (rng()*500+250).toFixed(0), nh = (rng()*400+200).toFixed(0);
    nebulae.push(`radial-gradient(ellipse ${nw}px ${nh}px at ${nx}% ${ny}%, ${palette[i%palette.length]}, transparent ${65+Math.round(rng()*15)}%)`);
  }
  $('galaxyFsNebulae').style.background = nebulae.join(',');

  // Place markers
  const savedIds = new Set(getSavedAstro());
  let html = '';
  ASTRONOMICAL_OBJECTS.forEach(obj => {
    const px = (obj.x * spaceW).toFixed(0), py = (obj.y * spaceH).toFixed(0);
    const labelRight = obj.x > 0.65;
    const isSaved = savedIds.has(obj.id);
    html += `<div class="galaxy-marker${isSaved ? ' saved' : ''}" data-obj="${obj.id}" style="left:${px}px;top:${py}px;"><div class="galaxy-marker-dot"></div><span class="galaxy-marker-label${labelRight ? ' galaxy-marker-label-right' : ''}">${obj.name}</span></div>`;
  });
  // Level markers
  const curLv = galaxyGrowth?.level || 1;
  const lcx = spaceW * 0.48, lcy = spaceH * 0.50;
  const spreadR = Math.min(spaceW, spaceH) * 0.18;
  const spiralAngle = 0.65;
  const lvPositions = [];
  LEVELS.forEach((lv, i) => {
    const angle = -Math.PI/2 + i*spiralAngle;
    const dist = spreadR*(0.25 + i*0.12);
    const px = (lcx + Math.cos(angle)*dist).toFixed(0), py = (lcy + Math.sin(angle)*dist).toFixed(0);
    lvPositions.push({ x: parseFloat(px), y: parseFloat(py), unlocked: lv.lv <= curLv });
    const isUnlocked = lv.lv <= curLv, isCurrent = lv.lv === curLv;
    const cls = isCurrent ? ' active' : (isUnlocked ? '' : ' locked');
    html += `<div class="galaxy-marker level-marker${cls}" data-level="${lv.lv}" style="left:${px}px;top:${py}px;"><div class="galaxy-marker-dot"></div><span class="galaxy-marker-label">${lv.name} · Lv.${lv.lv}</span></div>`;
  });
  // Level connector lines
  let pathD = '';
  for (let i = 1; i < lvPositions.length; i++) {
    const prev = lvPositions[i-1], curr = lvPositions[i];
    if (curr.unlocked || prev.unlocked) {
      pathD += `M${prev.x.toFixed(0)},${prev.y.toFixed(0)} L${curr.x.toFixed(0)},${curr.y.toFixed(0)} `;
    }
  }
  html += `<svg class="galaxy-level-lines" style="position:absolute;top:0;left:0;width:${spaceW}px;height:${spaceH}px;pointer-events:none;z-index:2;"><path d="${pathD}" fill="none" stroke="rgba(201,169,110,0.15)" stroke-width="0.8" stroke-dasharray="3,5"/></svg>`;
  $('galaxyFsMarkers').innerHTML = html;

  // Bind marker clicks
  $('galaxyFsMarkers').querySelectorAll('.galaxy-marker[data-obj]').forEach(m => {
    m.addEventListener('click', e => { e.stopPropagation(); showGalaxyFsPopup(m.dataset.obj); });
  });
  $('galaxyFsMarkers').querySelectorAll('.galaxy-marker[data-level]').forEach(m => {
    m.addEventListener('click', e => {
      e.stopPropagation();
      const lv = parseInt(m.dataset.level);
      const lvData = LEVELS.find(l => l.lv === lv);
      const curLv = galaxyGrowth?.level || 1;
      if (lv <= curLv) {
        const nextLv = LEVELS.find(l => l.lv === lv+1);
        toast((lvData?.name||'')+' · Lv.'+lv+' · '+(lvData?.xp||0)+' XP'+(nextLv ? ' · 距下一级 '+(nextLv.xp-(galaxyGrowth?.xp||0))+' XP' : ''));
      } else {
        toast('「'+(lvData?.name||'')+'」尚未解锁 · 需要 '+(lvData?.xp||0)+' XP');
      }
    });
  });

  applyGalaxyFsTransform();
  initGalaxyFsInteraction();
  } catch(e) {
    console.error('initGalaxyFs error:', e);
    toast('星系绘制失败: ' + (e.message || '未知错误'));
  }
}

function applyGalaxyFsTransform() {
  if (!galaxyFsState) return;
  const space = $('galaxyFsSpace');
  space.style.transform = `translate(${galaxyFsState.tx}px, ${galaxyFsState.ty}px) scale(${galaxyFsState.scale})`;
}

let galaxyFsInteractionBound = false;
function initGalaxyFsInteraction() {
  if (galaxyFsInteractionBound) return;
  galaxyFsInteractionBound = true;

  const gv = $('galaxyFsView');

  gv.addEventListener('pointerdown', e => {
    if (e.target.closest('.galaxy-marker') || e.target.closest('.galaxy-info-popup')) return;
    galaxyFsState.dragging = true;
    galaxyFsState.lastX = e.clientX;
    galaxyFsState.lastY = e.clientY;
    gv.style.cursor = 'grabbing';
    gv.setPointerCapture(e.pointerId);
  });

  window.addEventListener('pointermove', e => {
    if (!galaxyFsState || !galaxyFsState.dragging) return;
    galaxyFsState.tx += e.clientX - galaxyFsState.lastX;
    galaxyFsState.ty += e.clientY - galaxyFsState.lastY;
    galaxyFsState.lastX = e.clientX;
    galaxyFsState.lastY = e.clientY;
    applyGalaxyFsTransform();
  });

  window.addEventListener('pointerup', () => {
    if (galaxyFsState && galaxyFsState.dragging) { galaxyFsState.dragging = false; gv.style.cursor = 'grab'; }
  });

  gv.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      galaxyFsState.lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: false });

  gv.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && galaxyFsState) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const newScale = galaxyFsState.scale * dist / galaxyFsState.lastPinchDist;
      const view = $('galaxyFsView');
      const rect = view.getBoundingClientRect();
      const oldS = galaxyFsState.scale;
      const ax = e.touches[0].clientX - rect.left, ay = e.touches[0].clientY - rect.top;
      const worldX = (ax - galaxyFsState.tx) / oldS, worldY = (ay - galaxyFsState.ty) / oldS;
      galaxyFsState.scale = Math.max(0.3, Math.min(6, newScale));
      galaxyFsState.tx = ax - worldX * galaxyFsState.scale;
      galaxyFsState.ty = ay - worldY * galaxyFsState.scale;
      galaxyFsState.lastPinchDist = dist;
      applyGalaxyFsTransform();
    }
  }, { passive: false });

  gv.addEventListener('wheel', e => {
    e.preventDefault();
    if (!galaxyFsState) return;
    const view = $('galaxyFsView');
    const rect = view.getBoundingClientRect();
    const oldS = galaxyFsState.scale;
    const newScale = Math.max(0.3, Math.min(6, galaxyFsState.scale - e.deltaY * 0.005 * galaxyFsState.scale));
    const ax = e.clientX - rect.left, ay = e.clientY - rect.top;
    const worldX = (ax - galaxyFsState.tx) / oldS, worldY = (ay - galaxyFsState.ty) / oldS;
    galaxyFsState.scale = newScale;
    galaxyFsState.tx = ax - worldX * newScale;
    galaxyFsState.ty = ay - worldY * newScale;
    applyGalaxyFsTransform();
  }, { passive: false });

  $('gzFsIn').addEventListener('click', e => { e.stopPropagation(); if (!galaxyFsState) return; galaxyFsState.scale = Math.min(6, galaxyFsState.scale*1.5); applyGalaxyFsTransform(); });
  $('gzFsOut').addEventListener('click', e => { e.stopPropagation(); if (!galaxyFsState) return; galaxyFsState.scale = Math.max(0.3, galaxyFsState.scale/1.5); applyGalaxyFsTransform(); });
  $('gzFsReset').addEventListener('click', e => {
    e.stopPropagation();
    if (!galaxyFsState) return;
    const vw = gv.clientWidth, vh = gv.clientHeight;
    galaxyFsState.scale = 1;
    galaxyFsState.tx = -(galaxyFsState.spaceW - vw) / 2;
    galaxyFsState.ty = -(galaxyFsState.spaceH - vh) / 2;
    applyGalaxyFsTransform();
    $('galaxyFsPopup').style.display = 'none';
  });

  gv.addEventListener('click', e => {
    if (!e.target.closest('.galaxy-marker') && !e.target.closest('.galaxy-info-popup')) {
      $('galaxyFsPopup').style.display = 'none';
    }
  });

  $('galaxyFsClose').addEventListener('click', closeGalaxyFullscreen);
  $('galaxyFsPopupClose').addEventListener('click', e => { e.stopPropagation(); $('galaxyFsPopup').style.display = 'none'; });
}

function showGalaxyFsPopup(objId) {
  const obj = ASTRONOMICAL_OBJECTS.find(o => o.id === objId);
  if (!obj) return;
  $('galaxyFsPopupTitle').textContent = obj.name + ' · ' + obj.en;
  $('galaxyFsPopupType').textContent = obj.type + ' · ' + obj.constel + ' · 视星等 ' + obj.mag;
  $('galaxyFsPopupDist').textContent = '距离: ' + obj.dist;
  $('galaxyFsPopupDesc').textContent = obj.desc;
  const saveBtn = $('galaxyFsPopupSave');
  const saved = isAstroSaved(objId);
  saveBtn.textContent = saved ? '已收藏' : '收纳入银河档案';
  saveBtn.className = 'galaxy-popup-save' + (saved ? ' saved' : '');
  saveBtn.onclick = () => {
    if (isAstroSaved(objId)) {
      unsaveAstroId(objId);
      saveBtn.textContent = '收纳入银河档案';
      saveBtn.className = 'galaxy-popup-save';
      toast(obj.name + ' 已从银河档案中移除');
    } else {
      saveAstroId(objId);
      saveBtn.textContent = '已收藏';
      saveBtn.className = 'galaxy-popup-save saved';
      toast(obj.name + ' 已收纳入银河档案');
    }
    const marker = document.querySelector(`.galaxy-fs-markers .galaxy-marker[data-obj="${objId}"]`);
    if (marker) {
      if (isAstroSaved(objId)) marker.classList.add('saved');
      else marker.classList.remove('saved');
    }
    updateSavedCount();
  };
  // Set excerpt context for text selection
  setExcerptContext(obj.name, '星系图鉴 · ' + obj.en);
  applyObjectImage(obj, 'galaxyFsPopupImg', 'galaxyFsPopupCredit', 'galaxyFsPopupFallback');
  $('galaxyFsPopup').style.display = 'block';
}

// ====== Saved Objects ======
function showSavedObjects() {
  const saved = getSavedAstro();
  const body = $('savedObjectsBody'), empty = $('savedObjectsEmpty');
  if (!saved.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    body.innerHTML = saved.map(id => {
      const obj = ASTRONOMICAL_OBJECTS.find(o => o.id === id);
      if (!obj) return '';
      return `<div class="saved-obj-item" data-obj="${obj.id}">
        <div class="saved-obj-dot"></div>
        <div class="saved-obj-info">
          <div class="saved-obj-name">${obj.name} · ${obj.en}</div>
          <div class="saved-obj-meta">${obj.type} · ${obj.constel} · ${obj.dist}</div>
        </div>
        <button class="saved-obj-del" data-obj="${obj.id}">×</button>
      </div>`;
    }).join('');
    // Bind clicks
    body.querySelectorAll('.saved-obj-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.saved-obj-del')) return;
        const id = item.dataset.obj;
        $('savedObjectsOverlay').classList.remove('open');
        // Navigate to galaxy and show popup
        document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
        const link = document.querySelector('.nav-link[data-panel="galaxy"]');
        if (link) link.classList.add('active');
        state.panel = 'galaxy';
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        $('panel-galaxy').classList.add('active');
        if (window.innerWidth <= 768) {
          $('drawer').classList.add('collapsed');
          $('drawerExpand').classList.add('visible');
          $('drawerOverlay').classList.remove('show');
        }
        loadGalaxy();
        setTimeout(() => {
          const obj = ASTRONOMICAL_OBJECTS.find(o => o.id === id);
          if (obj) {
            const vw = $('galaxyView').clientWidth, vh = $('galaxyView').clientHeight;
            galaxyState.scale = 3;
            const px = obj.x * galaxyState.spaceW;
            const py = obj.y * galaxyState.spaceH;
            galaxyState.tx = vw / 2 - px * 3;
            galaxyState.ty = vh / 2 - py * 3;
            applyGalaxyTransform();
            showGalaxyPopup(id);
          }
        }, 200);
      });
    });
    // Delete buttons
    body.querySelectorAll('.saved-obj-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.obj;
        unsaveAstroId(id);
        const obj = ASTRONOMICAL_OBJECTS.find(o => o.id === id);
        toast((obj?.name || '天体') + ' 已从银河档案中移除');
        updateSavedCount();
        showSavedObjects(); // re-render
        // Also refresh galaxy if visible
        if (state.panel === 'galaxy') {
          placeAstroMarkers();
        }
      });
    });
  }
  $('savedObjectsOverlay').classList.add('open');
}

$('savedObjectsClose').addEventListener('click', () => $('savedObjectsOverlay').classList.remove('open'));
$('savedObjectsOverlay').addEventListener('click', e => { if (e.target === $('savedObjectsOverlay')) $('savedObjectsOverlay').classList.remove('open'); });

function updateSavedCount() {
  const cnt = getSavedAstro().length;
  const metricVal = document.querySelector('#growthMetrics .gmetric-clickable .gmetric-val');
  if (metricVal) metricVal.textContent = cnt;
}

function hash32(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return Math.abs(h); }
function mulberry32(a) { return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ====== Coordinates (坐标日志) ======
async function loadReminders() { state.reminders = await db.reminders.list(); renderReminders(); }

function renderReminders() {
  const l = $('remindersList'), e = $('remindersEmpty');
  if (!state.reminders.length) { l.innerHTML = ''; e.style.display = 'block'; return; }
  e.style.display = 'none';
  const today = new Date().toISOString().slice(0, 10);
  l.innerHTML = [...state.reminders].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)).map(r => {
    const checkins = r.checkins || [];
    const progress = Math.min(5, checkins.length);
    const progressPct = Math.round(progress / 5 * 100);
    const isOverdue = !r.done && r.datetime && r.datetime.slice(0, 10) < today;
    let dotsHtml = '';
    for (let i = 0; i < 5; i++) {
      const cls = i < progress ? 'filled' : (i === progress ? 'current' : '');
      dotsHtml += `<span class="coord-progress-dot ${cls}"></span>`;
    }
    return `
    <div class="coord-item ${r.done ? 'done' : ''}" id="coord-${r.id}">
      <div class="coord-item-header" onclick="window.toggleCoordExpand('${r.id}')">
        <div class="coord-check" onclick="event.stopPropagation();window.toggleReminder('${r.id}')"></div>
        <div class="coord-info">
          <div class="coord-title">${esc(r.title)}</div>
          ${r.description ? `<div class="coord-desc">${esc(r.description.slice(0, 80))}${r.description.length > 80 ? '...' : ''}</div>` : ''}
          <div class="coord-meta">
            ${r.datetime ? `<span class="coord-deadline${isOverdue ? ' overdue' : ''}">${isOverdue ? '⚠ ' : ''}${fmtDate(r.datetime, false)}</span>` : '<span class="coord-deadline">无期限</span>'}
            <div class="coord-progress">${dotsHtml}<span class="coord-progress-label">${progress}/5</span></div>
            ${!r.done ? `<button class="coord-checkin-btn" onclick="event.stopPropagation();window.coordCheckin('${r.id}')">+ 打卡</button>` : ''}
          </div>
        </div>
      </div>
      <div class="coord-detail">
        ${r.description ? `<div class="coord-detail-plan-label">航行计划</div><div class="coord-detail-plan">${esc(r.description)}</div>` : ''}
        ${checkins.length ? `<div class="coord-detail-plan-label">打卡记录</div><div class="coord-checkin-history">${checkins.map(c => `<div class="coord-checkin-entry"><span class="coord-checkin-entry-dot"></span><span class="coord-checkin-entry-date">${fmtDate(c.date, false)}</span><span>${esc(c.note || '坐标签到')}</span></div>`).join('')}</div>` : '<div style="font-size:10px;color:var(--text3);">尚无打卡记录，点击"+ 打卡"记录进展</div>'}
        <div class="coord-detail-actions">
          <button class="coord-detail-btn" onclick="window.editCoord('${r.id}')">编辑航向</button>
          <button class="coord-detail-btn danger" onclick="window.deleteReminder('${r.id}')">删除坐标</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.toggleCoordExpand = function(id) {
  const el = document.getElementById('coord-' + id);
  if (!el) return;
  el.classList.toggle('expanded');
};

window.coordCheckin = async function(id) {
  const r = state.reminders.find(x => x.id === id);
  if (!r) return;
  const checkins = r.checkins || [];
  if (checkins.length >= 5) {
    // Auto-complete
    await db.reminders.update(id, { done: true });
    await db.growth.addXP(20, '达成坐标');
    toast('航向达成！坐标已点亮');
  } else {
    const note = prompt('打卡备注（可选）:', '');
    if (note === null) return; // cancelled
    checkins.push({ date: new Date().toISOString().slice(0, 10), note: note || '坐标签到' });
    const isDone = checkins.length >= 5;
    await db.reminders.update(id, { checkins, done: isDone });
    if (isDone) {
      await db.growth.addXP(20, '达成坐标');
      toast('全部打卡完成，坐标已点亮！');
    } else {
      await db.growth.addXP(5, '坐标打卡');
      toast(`已打卡 ${checkins.length}/5 · 还剩 ${5 - checkins.length} 次`);
    }
  }
  loadReminders(); updateStats();
};

window.editCoord = function(id) {
  const r = state.reminders.find(x => x.id === id);
  if (!r) return;
  state.editing = { type: 'reminder', data: r };
  $('modalTitle').value = r.title || '';
  $('modalContent').value = r.description || '';
  buildMeta('reminder'); buildFoot('reminder'); $('modalOverlay').classList.add('open');
};

// ====== 本地通知调度（原生 APK 环境生效，浏览器静默跳过） ======
const notifications = {
  plugin() {
    try {
      if (!window.Capacitor?.isNativePlatform?.()) return null;
      return window.capacitorLocalNotifications?.LocalNotifications || null;
    } catch (e) { return null; }
  },
  nid: s => (hash32(s) & 0x7fffffff) || 1,
  async init() {
    const p = this.plugin(); if (!p) return;
    try {
      await p.createChannel({ id: 'dayday-reminders', name: '坐标提醒', description: '目标与纪念日到点提醒', importance: 3, visibility: 1, sound: 'default' });
    } catch (e) { console.warn('channel failed:', e); }
    try { await p.addListener('localNotificationActionPerformed', () => goPanel('navigate')); } catch (e) {}
    await this.resyncAll();
  },
  async requestPermissionIfNeeded() {
    const p = this.plugin(); if (!p) return true;
    try {
      let st = await p.checkPermissions();
      if (st.display === 'prompt' || st.display === 'prompt_with_rationale') {
        st = await p.requestPermissions();
      }
      if (st.display === 'granted') return true;
      toast('通知权限未开启，提醒将仅在应用内显示');
      return false;
    } catch (e) { return true; }
  },
  async scheduleReminder(r) {
    const p = this.plugin(); if (!p) return;
    const due = new Date(r.datetime);
    if (isNaN(due.getTime())) return;
    const list = [];
    if (due.getTime() > Date.now()) {
      list.push({ id: this.nid('due-' + r.id), title: '⏰ ' + r.title, body: '该观测了', schedule: { at: due, allowWhileIdle: true } });
    }
    const adv = new Date(due.getTime() - 86400000);
    adv.setHours(20, 0, 0, 0);
    if (adv.getTime() > Date.now()) {
      const hh = String(due.getHours()).padStart(2, '0'), mm = String(due.getMinutes()).padStart(2, '0');
      list.push({ id: this.nid('adv-' + r.id), title: r.title, body: '明天 ' + hh + ':' + mm + ' 到点', schedule: { at: adv, allowWhileIdle: true } });
    }
    if (!list.length) return;
    try { await p.schedule({ notifications: list }); } catch (e) { console.warn('schedule failed:', e); }
  },
  async cancelReminder(id) {
    const p = this.plugin(); if (!p) return;
    try { await p.cancel({ notifications: [{ id: this.nid('due-' + id) }, { id: this.nid('adv-' + id) }] }); } catch (e) {}
  },
  async resyncAll() {
    const p = this.plugin(); if (!p) return;
    try {
      const pend = await p.getPending();
      if (pend?.notifications?.length) {
        await p.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
      }
      const reminders = await db.reminders.list();
      for (const r of reminders) { if (!r.done) await this.scheduleReminder(r); }
    } catch (e) { console.warn('resync failed:', e); }
  },
};

window.toggleReminder = async function(id) {
  const r = state.reminders.find(x => x.id === id); if (!r) return;
  const newDone = !r.done;
  await db.reminders.update(id, { done: newDone });
  if (newDone) {
    await db.growth.addXP(20, '达成坐标');
    notifications.cancelReminder(id);
  } else {
    notifications.scheduleReminder({ ...r, done: false });
  }
  loadReminders(); updateStats();
};

window.deleteReminder = async function(id) {
  if (!confirm('删除此提醒？')) return;
  await db.reminders.delete(id);
  notifications.cancelReminder(id);
  loadReminders(); updateStats(); toast('已删除');
};

$('btnNewReminder').addEventListener('click', () => {
  state.editing = { type: 'reminder', data: { id: '', title: '', description: '', datetime: '', checkins: [], done: false } };
  $('modalTitle').value = ''; $('modalContent').value = '';
  buildMeta('reminder'); buildFoot('reminder'); $('modalOverlay').classList.add('open');
});

// ====== Modal ======
function buildMeta(type) {
  const d = state.editing?.data || {};
  $('modalContent').style.display = '';
  $('modalContent').setAttribute('placeholder', type === 'reminder' ? '航行计划（可选）...' : '写点什么...');
  $('modalImages').style.display = 'none';
  if (type === 'note') {
    $('modalMeta').innerHTML = `<select id="mType">${['灵感','随笔','草稿','摘录','其他'].map(t => `<option value="${t}" ${d.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select><input type="text" id="mTags" value="${(d.tags || []).join(',')}" placeholder="标签" style="flex:1;">`;
    $('modalImages').style.display = 'flex'; renderModalImages();
  } else if (type === 'diary') {
    $('modalMeta').innerHTML = `<input type="date" id="mDate" value="${d.date || new Date().toISOString().slice(0, 10)}"><select id="mMood"><option value="">无</option>${MOON_PHASES.map(m => `<option value="${m.e}" ${d.mood === m.e ? 'selected' : ''}>${m.e} ${m.n}</option>`).join('')}</select>`;
    $('modalImages').style.display = 'flex'; renderModalImages();
  } else if (type === 'reminder') {
    $('modalMeta').innerHTML = `<input type="datetime-local" id="mDt" value="${d.datetime || ''}" style="flex:1;">`;
  }
}

function buildFoot(type) {
  let extraBtn = '';
  if (type === 'diary' && !isLite) extraBtn = '<button class="btn-draw-toggle" id="btnDrawToggle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="vertical-align:middle;margin-right:3px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>绘制</button>';
  $('modalFooter').innerHTML = `${state.editing?.data?.id ? '<button class="btn-del" id="mDel">删除</button>' : '<span></span>'}${extraBtn}<button class="btn-save" id="mSave">保存</button>`;
  $('mSave').addEventListener('click', () => saveModal(type));
  if (state.editing?.data?.id) $('mDel').addEventListener('click', () => {
    if (type === 'note') window.deleteNote(state.editing.data.id);
    else if (type === 'diary') window.deleteDiary(state.editing.data.id);
    else if (type === 'reminder') window.deleteReminder(state.editing.data.id);
    closeModal();
  });
  if (type === 'diary') {
    $('btnDrawToggle').addEventListener('click', toggleDrawPanel);
  }
  // Hide draw panel by default
  $('drawWrap').style.display = 'none';
}

async function saveModal(type) {
  const t = $('modalTitle').value.trim(), c = $('modalContent').value;

  // Compress images before saving (max 600px, JPEG for photos)
  const rawImages = state.editing.data.images || [];
  const compressedImages = rawImages.length ? await compressImages(rawImages) : [];

  if (type === 'note') {
    const d = { title: t || '未命名星图', content: c, type: $('mType')?.value || '灵感', tags: ($('mTags')?.value || '').split(',').map(s => s.trim()).filter(Boolean), images: compressedImages };
    if (state.editing.data.id) {
      await db.notes.update(state.editing.data.id, d);
    } else {
      await db.notes.create(d);
      await db.growth.addXP(10, '绘制星图');
    }
    closeModal(); loadNotes(true); updateStats(); toast('已收纳入你的银河档案');
  } else if (type === 'diary') {
    const diaryDate = $('mDate')?.value || new Date().toISOString().slice(0, 10);
    const diaryMood = $('mMood')?.value || '';
    const d = { title: t || '星轨', content: c, date: diaryDate, mood: diaryMood, images: compressedImages };
    if (state.editing.data.id) {
      await db.diary.update(state.editing.data.id, d);
    } else {
      await db.diary.create(d);
      await db.growth.addXP(15, '记录星轨');
    }
    // Sync mood back to today's checkin if this diary is for today
    const today = new Date().toISOString().slice(0, 10);
    if (diaryDate === today && diaryMood) {
      const todayCheckin = await db.checkins.getToday();
      if (todayCheckin) {
        await db.checkins.create({ mood: diaryMood });
      }
      state.todayMood = diaryMood;
      state.todayCheckin = await db.checkins.getToday();
    }
    closeModal(); loadDiary(); updateStats(); if (diaryDate === today) { renderCalendar(); } toast('星轨已铭刻');
  } else if (type === 'reminder') {
    const d = { title: t || '坐标', description: c || '', datetime: $('mDt')?.value || null };
    if (state.editing.data.id) {
      await db.reminders.update(state.editing.data.id, d);
      await notifications.cancelReminder(state.editing.data.id);
      await notifications.scheduleReminder({ ...d, id: state.editing.data.id, done: false });
    } else {
      d.checkins = [];
      d.done = false;
      const saved = await db.reminders.create(d);
      await db.growth.addXP(5, '设定航向');
      await notifications.requestPermissionIfNeeded();
      await notifications.scheduleReminder(saved);
    }
    closeModal(); loadReminders(); updateStats(); toast('航向已设定');
  }
}

// ====== 绘制引擎 ======
let drawEngine = {
  canvas:null, ctx:null, drawing:false, brush:'pen',
  undoStack:[], brushColor:'#c9a96e', brushSize:3, brushOpacity:1,
  fsCanvas:null, fsCtx:null, fsDrawing:false, fsUndoStack:[],
  layers:[], activeLayer:0,
};

function toggleDrawPanel() {
  const wrap = $('drawWrap');
  const isVisible = wrap.style.display !== 'none';
  if (isVisible) {
    wrap.style.display = 'none';
    $('btnDrawToggle').classList.remove('active');
  } else {
    wrap.style.display = 'block';
    $('btnDrawToggle').classList.add('active');
    initDrawCanvas();
  }
}

function initDrawCanvas() {
  const canvas = $('drawCanvas');
  if (drawEngine.canvas === canvas) return;
  drawEngine.canvas = canvas;

  const dpr = window.devicePixelRatio || 1;
  const parentW = canvas.parentElement.clientWidth - 2;
  canvas.width = parentW * dpr;
  canvas.height = 300 * dpr;
  canvas.style.width = parentW + 'px';
  canvas.style.height = '300px';
  drawEngine.ctx = canvas.getContext('2d');
  drawEngine.ctx.scale(dpr, dpr);
  drawEngine.ctx.lineCap = 'round';
  drawEngine.ctx.lineJoin = 'round';
  drawEngine.ctx.globalCompositeOperation = 'source-over';
  drawEngine.undoStack = [];
  drawEngine.brush = 'pen';

  // Init layers (transparent background)
  drawEngine.layers = [];
  drawEngine.activeLayer = 0;
  addLayer('图层 1');
  renderLayerList();

  // Pointer events
  canvas.onpointerdown = e => {
    const layer = drawEngine.layers[drawEngine.activeLayer];
    if (!layer) return;
    const pos = getCanvasPos(e, canvas);
    if (drawEngine.brush === 'fill') {
      floodFillAt(pos);
      saveUndoState();
      compositeLayers();
      return;
    }
    drawEngine.drawing = true;
    if (drawEngine.brush === 'spray') {
      sprayAt(pos);
    } else {
      layer.ctx.beginPath();
      layer.ctx.moveTo(pos.x, pos.y);
    }
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (!drawEngine.drawing) return;
    const layer = drawEngine.layers[drawEngine.activeLayer];
    if (!layer) return;
    const pos = getCanvasPos(e, canvas);
    if (drawEngine.brush === 'spray') {
      sprayAt(pos);
    } else {
      layer.ctx.lineTo(pos.x, pos.y);
      applyBrushStyle(layer.ctx);
      layer.ctx.stroke();
    }
    compositeLayers();
  };
  canvas.onpointerup = () => {
    if (!drawEngine.drawing) return;
    drawEngine.drawing = false;
    const layer = drawEngine.layers[drawEngine.activeLayer];
    if (layer && drawEngine.brush !== 'spray') layer.ctx.closePath();
    saveUndoState();
  };
  canvas.onpointerleave = () => {
    if (drawEngine.drawing) { drawEngine.drawing = false; saveUndoState(); }
  };

  // Draw the circular color wheel
  renderColorWheel();

  // Brush type buttons
  document.querySelectorAll('#brushTypes .brush-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#brushTypes .brush-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawEngine.brush = btn.dataset.brush;
    };
  });

  // Color wheel click → open full picker
  $('drawColorWheel').onclick = e => {
    e.stopPropagation();
    openColorWheel('brush');
  };

  // Size slider
  $('drawSize').oninput = e => { drawEngine.brushSize = parseInt(e.target.value); $('drawSizeVal').textContent = e.target.value; };
  // Opacity slider
  $('drawOpacity').oninput = e => { drawEngine.brushOpacity = parseInt(e.target.value) / 100; $('drawOpacityVal').textContent = e.target.value; };
  // Undo
  $('drawUndo').onclick = undoDraw;
  // Clear
  $('drawClear').onclick = () => {
    if (confirm('清空当前图层？')) {
      const layer = drawEngine.layers[drawEngine.activeLayer];
      if (layer) { layer.ctx.clearRect(0, 0, canvas.width/dpr, canvas.height/dpr); layer._undo = []; }
      if (drawEngine.layers.length <= 1) addLayer('图层 1');
      compositeLayers();
      saveUndoState();
      renderLayerList();
    }
  };
  // Fullscreen
  $('drawFullscreen').onclick = openDrawFullscreen;
  // Save / download
  $('drawSaveToDiary').onclick = saveDrawToDiary;
  $('drawDownloadBtn').onclick = downloadDraw;
}

// ====== Layer management ======
function addLayer(name) {
  const canvas = drawEngine.canvas;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const off = document.createElement('canvas');
  off.width = canvas.width;
  off.height = canvas.height;
  const ctx = off.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const layer = { name: name || ('图层 ' + (drawEngine.layers.length + 1)), canvas: off, ctx, visible: true, opacity: 1, _undo: [] };
  drawEngine.layers.push(layer);
  drawEngine.activeLayer = drawEngine.layers.length - 1;
  return layer;
}

function removeLayer(i) {
  if (drawEngine.layers.length <= 1) return;
  drawEngine.layers.splice(i, 1);
  if (drawEngine.activeLayer >= drawEngine.layers.length) drawEngine.activeLayer = drawEngine.layers.length - 1;
}

function duplicateLayer(i) {
  const src = drawEngine.layers[i];
  if (!src) return;
  const dpr = window.devicePixelRatio || 1;
  const w = drawEngine.canvas.width / dpr;
  const h = drawEngine.canvas.height / dpr;
  const off = document.createElement('canvas');
  off.width = drawEngine.canvas.width;
  off.height = drawEngine.canvas.height;
  const ctx = off.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.drawImage(src.canvas, 0, 0);
  const layer = { name: src.name + ' 副本', canvas: off, ctx, visible: true, opacity: 1, _undo: [] };
  drawEngine.layers.splice(i + 1, 0, layer);
  drawEngine.activeLayer = i + 1;
}

function mergeDown(i) {
  if (i >= drawEngine.layers.length - 1) return;
  const upper = drawEngine.layers[i];
  const lower = drawEngine.layers[i + 1];
  lower.ctx.drawImage(upper.canvas, 0, 0);
  drawEngine.layers.splice(i, 1);
  drawEngine.activeLayer = Math.min(i, drawEngine.layers.length - 1);
}

function compositeLayers() {
  const canvas = drawEngine.canvas;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  drawEngine.ctx.clearRect(0, 0, w, h);
  for (const layer of drawEngine.layers) {
    if (!layer.visible) continue;
    drawEngine.ctx.globalAlpha = layer.opacity;
    drawEngine.ctx.drawImage(layer.canvas, 0, 0, w, h);
  }
  drawEngine.ctx.globalAlpha = 1;
}

function renderLayerList() {
  const container = document.getElementById('layerList');
  if (!container) return;
  container.innerHTML = '';
  drawEngine.layers.forEach((layer, i) => {
    const el = document.createElement('div');
    el.className = 'layer-item' + (i === drawEngine.activeLayer ? ' active' : '');
    el.innerHTML = `
      <button class="layer-vis" title="${layer.visible ? '隐藏' : '显示'}" data-action="toggle" data-idx="${i}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${layer.visible
            ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
            : '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}
        </svg>
      </button>
      <span class="layer-name" data-action="select" data-idx="${i}">${layer.name}</span>
      <span class="layer-thumb" data-action="select" data-idx="${i}">${i + 1}</span>
      <button class="layer-btn" data-action="dup" data-idx="${i}" title="复制">+</button>
      <button class="layer-btn" data-action="del" data-idx="${i}" title="删除"${drawEngine.layers.length <= 1 ? ' disabled' : ''}>×</button>
      <button class="layer-btn" data-action="merge" data-idx="${i}" title="向下合并"${i >= drawEngine.layers.length - 1 ? ' disabled' : ''}>↓</button>
    `;
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const idx = parseInt(btn.dataset.idx);
      switch (action) {
        case 'select':
          drawEngine.activeLayer = idx;
          renderLayerList();
          break;
        case 'toggle':
          layer.visible = !layer.visible;
          compositeLayers();
          renderLayerList();
          break;
        case 'dup':
          duplicateLayer(idx);
          compositeLayers();
          renderLayerList();
          break;
        case 'del':
          if (drawEngine.layers.length > 1) { removeLayer(idx); compositeLayers(); renderLayerList(); }
          break;
        case 'merge':
          mergeDown(idx);
          compositeLayers();
          renderLayerList();
          break;
      }
    });
    container.appendChild(el);
  });
  // Add layer button
  const addBtn = document.createElement('button');
  addBtn.className = 'layer-add-btn';
  addBtn.title = '添加图层';
  addBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  addBtn.onclick = () => {
    if (drawEngine.layers.length >= 8) { toast('最多8个图层'); return; }
    addLayer();
    compositeLayers();
    renderLayerList();
  };
  container.appendChild(addBtn);
}

// ====== Color wheel ======
function renderColorWheel() {
  const cw = $('drawColorWheel');
  const size = 36 * (window.devicePixelRatio || 1);
  cw.width = size;
  cw.height = size;
  cw.style.width = '36px';
  cw.style.height = '36px';
  const ctx = cw.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  for (let angle = 0; angle < 360; angle += 1) {
    const rad = angle * Math.PI / 180;
    const grad = ctx.createLinearGradient(
      cx + Math.cos(rad) * r * 0.5, cy + Math.sin(rad) * r * 0.5,
      cx + Math.cos(rad) * r, cy + Math.sin(rad) * r
    );
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.3, hslToHex(angle, 80, 50));
    grad.addColorStop(1, hslToHex(angle, 100, 30));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, rad - 0.01, rad + 0.02);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = 'var(--border)';
  ctx.stroke();
  cw.style.boxShadow = `0 0 0 2px ${drawEngine.brushColor}`;
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function sprayAt(pos) {
  const layer = drawEngine.layers[drawEngine.activeLayer];
  if (!layer) return;
  const ctx = layer.ctx;
  const size = drawEngine.brushSize * 3;
  const dots = drawEngine.brushSize * 5;
  ctx.save();
  ctx.globalAlpha = drawEngine.brushOpacity * 0.3;
  ctx.fillStyle = drawEngine.brushColor;
  for (let i = 0; i < dots; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * size;
    const dx = pos.x + Math.cos(angle) * dist;
    const dy = pos.y + Math.sin(angle) * dist;
    ctx.beginPath();
    ctx.arc(dx, dy, Math.random() * 1.5 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function floodFillAt(pos) {
  const layer = drawEngine.layers[drawEngine.activeLayer];
  if (!layer) return;
  const dpr = window.devicePixelRatio || 1;
  const canvas = drawEngine.canvas;
  const w = canvas.width, h = canvas.height;
  const ctx = layer.ctx;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const px = Math.round(pos.x * dpr), py = Math.round(pos.y * dpr);
  if (px < 0 || py < 0 || px >= w || py >= h) return;

  const fillColor = hexToRgba(drawEngine.brushColor, drawEngine.brushOpacity);
  const idx = (py * w + px) * 4;
  const targetR = data[idx], targetG = data[idx + 1], targetB = data[idx + 2], targetA = data[idx + 3];

  // Skip if fill color matches target
  if (Math.abs(fillColor.r - targetR) < 2 && Math.abs(fillColor.g - targetG) < 2 &&
      Math.abs(fillColor.b - targetB) < 2 && Math.abs(fillColor.a - targetA) < 2) return;

  const tol = 32; // color tolerance
  function matches(i) {
    return Math.abs(data[i] - targetR) <= tol && Math.abs(data[i + 1] - targetG) <= tol &&
           Math.abs(data[i + 2] - targetB) <= tol && Math.abs(data[i + 3] - targetA) <= tol;
  }

  const queue = [px + py * w];
  const visited = new Uint8Array(w * h);
  visited[px + py * w] = 1;

  while (queue.length > 0) {
    const pos = queue.shift();
    const i = pos * 4;
    data[i] = fillColor.r; data[i + 1] = fillColor.g; data[i + 2] = fillColor.b; data[i + 3] = fillColor.a;

    const x = pos % w, y = Math.floor(pos / w);
    // 4-directional fill
    const neighbors = [
      x > 0 ? pos - 1 : -1,
      x < w - 1 ? pos + 1 : -1,
      y > 0 ? pos - w : -1,
      y < h - 1 ? pos + w : -1
    ];
    for (const n of neighbors) {
      if (n >= 0 && !visited[n] && matches(n * 4)) {
        visited[n] = 1;
        queue.push(n);
      }
    }
    // Safety limit
    if (queue.length > w * h) break;
  }

  ctx.putImageData(imgData, 0, 0);
}

function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: Math.round(opacity * 255) };
}

function getCanvasPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const scaleX = (canvas.width / dpr) / rect.width;
  const scaleY = (canvas.height / dpr) / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function applyBrushStyle(ctx) {
  ctx.globalAlpha = drawEngine.brushOpacity;
  switch (drawEngine.brush) {
    case 'pen':
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = drawEngine.brushColor;
      ctx.lineWidth = drawEngine.brushSize;
      break;
    case 'pencil':
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = drawEngine.brushColor;
      ctx.lineWidth = Math.max(1, drawEngine.brushSize * 0.6);
      ctx.globalAlpha = drawEngine.brushOpacity * 0.7;
      break;
    case 'marker':
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = drawEngine.brushColor;
      ctx.lineWidth = drawEngine.brushSize * 2.5;
      ctx.globalAlpha = drawEngine.brushOpacity * 0.45;
      break;
    case 'spray':
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'eraser':
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = drawEngine.brushSize * 2;
      ctx.globalAlpha = 1;
      break;
    default:
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = drawEngine.brushColor;
      ctx.lineWidth = drawEngine.brushSize;
  }
}

function saveUndoState() {
  const layer = drawEngine.layers[drawEngine.activeLayer];
  if (!layer) return;
  const canvas = drawEngine.canvas;
  if (!canvas) return;
  const data = layer.ctx.getImageData(0, 0, canvas.width, canvas.height);
  layer._undo = layer._undo || [];
  layer._undo.push(data);
  if (layer._undo.length > 30) layer._undo.shift();
  // Keep legacy stack for compatibility
  drawEngine.undoStack = layer._undo;
}

function undoDraw() {
  const layer = drawEngine.layers[drawEngine.activeLayer];
  if (!layer) return;
  layer._undo = layer._undo || [];
  if (layer._undo.length <= 0) return;
  layer._undo.pop();
  if (layer._undo.length > 0) {
    layer.ctx.putImageData(layer._undo[layer._undo.length - 1], 0, 0);
  } else {
    const dpr = window.devicePixelRatio || 1;
    layer.ctx.clearRect(0, 0, drawEngine.canvas.width / dpr, drawEngine.canvas.height / dpr);
  }
  compositeLayers();
  drawEngine.undoStack = layer._undo;
}

// Fullscreen draw (single canvas, no layers)
function openDrawFullscreen() {
  const overlay = $('drawFsOverlay');
  const fsCanvas = $('drawFsCanvas');
  overlay.classList.add('open');
  drawEngine.fsCanvas = fsCanvas;

  const dpr = window.devicePixelRatio || 1;
  const wrap = fsCanvas.parentElement;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  fsCanvas.width = W * dpr;
  fsCanvas.height = H * dpr;
  fsCanvas.style.width = W + 'px';
  fsCanvas.style.height = H + 'px';
  drawEngine.fsCtx = fsCanvas.getContext('2d');
  drawEngine.fsCtx.scale(dpr, dpr);
  drawEngine.fsCtx.lineCap = 'round';
  drawEngine.fsCtx.lineJoin = 'round';

  // Copy current canvas composite to fullscreen
  const srcCanvas = drawEngine.canvas;
  if (srcCanvas) {
    compositeLayers(); // ensure main canvas is up to date
    const sw = srcCanvas.width / dpr, sh = srcCanvas.height / dpr;
    const dw = W, dh = H;
    const scale = Math.min(dw / sw, dh / sh);
    const dx = (dw - sw * scale) / 2, dy = (dh - sh * scale) / 2;
    drawEngine.fsCtx.drawImage(srcCanvas, dx, dy, sw * scale, sh * scale);
  }

  // Copy tools to fullscreen
  const tools = $('drawFsTools');
  tools.innerHTML = `
    <div class="brush-types">${$('brushTypes').innerHTML}</div>
    <div class="draw-sep"></div>
    <div class="draw-color-wrap"><canvas class="draw-color-wheel" id="fsColorWheel" width="36" height="36"></canvas></div>
    <div class="draw-slider-group"><label class="draw-label">大小</label><input type="range" id="fsDrawSize" min="1" max="40" value="${drawEngine.brushSize}" class="draw-slider"><span class="draw-val" id="fsSizeVal">${drawEngine.brushSize}</span></div>
    <div class="draw-slider-group"><label class="draw-label">透明</label><input type="range" id="fsDrawOpacity" min="10" max="100" value="${Math.round(drawEngine.brushOpacity * 100)}" class="draw-slider"><span class="draw-val" id="fsOpacityVal">${Math.round(drawEngine.brushOpacity * 100)}</span></div>
    <div class="draw-sep"></div>
    <button class="draw-tool-btn" id="fsDrawUndo" title="撤回"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></button>
    <button class="draw-tool-btn" id="fsDrawClear" title="清空"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
    <button class="draw-save-btn" id="fsDrawSave">保存到星轨</button>
    <button class="draw-save-btn draw-dl-btn" id="fsDrawDl">下载</button>
    <button class="draw-fs-close" id="fsDrawClose">退出全屏</button>`;

  // Render FS color wheel
  setTimeout(() => {
    const fsCw = document.getElementById('fsColorWheel');
    if (fsCw) {
      const size = 36 * dpr;
      fsCw.width = size; fsCw.height = size;
      fsCw.style.width = '36px'; fsCw.style.height = '36px';
      const ctx = fsCw.getContext('2d');
      const cx = size/2, cy = size/2, r = size/2 - 2;
      for (let a = 0; a < 360; a += 1) {
        const rad = a * Math.PI / 180;
        const grad = ctx.createLinearGradient(cx + Math.cos(rad)*r*0.5, cy + Math.sin(rad)*r*0.5, cx + Math.cos(rad)*r, cy + Math.sin(rad)*r);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, hslToHex(a, 80, 50));
        grad.addColorStop(1, hslToHex(a, 100, 30));
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, rad - 0.01, rad + 0.02); ctx.fillStyle = grad; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill();
      fsCw.style.boxShadow = `0 0 0 2px ${drawEngine.brushColor}`;
    }
  }, 50);

  // FS pointer events
  drawEngine.fsUndoStack = [];
  saveFsUndoState();

  fsCanvas.onpointerdown = e => {
    const pos = getCanvasPos(e, fsCanvas);
    if (drawEngine.brush === 'fill') {
      fsFloodFillAt(pos);
      saveFsUndoState();
      return;
    }
    drawEngine.fsDrawing = true;
    if (drawEngine.brush === 'spray') {
      fsSprayAt(pos);
    } else {
      drawEngine.fsCtx.beginPath();
      drawEngine.fsCtx.moveTo(pos.x, pos.y);
    }
    fsCanvas.setPointerCapture(e.pointerId);
  };
  fsCanvas.onpointermove = e => {
    if (!drawEngine.fsDrawing) return;
    const pos = getCanvasPos(e, fsCanvas);
    if (drawEngine.brush === 'spray') {
      fsSprayAt(pos);
    } else {
      drawEngine.fsCtx.lineTo(pos.x, pos.y);
      applyBrushStyle(drawEngine.fsCtx);
      drawEngine.fsCtx.stroke();
    }
  };
  fsCanvas.onpointerup = () => {
    if (!drawEngine.fsDrawing) return;
    drawEngine.fsDrawing = false;
    if (drawEngine.brush !== 'spray') drawEngine.fsCtx.closePath();
    saveFsUndoState();
  };
  fsCanvas.onpointerleave = () => {
    if (drawEngine.fsDrawing) { drawEngine.fsDrawing = false; saveFsUndoState(); }
  };

  // FS tool bindings
  document.querySelectorAll('#drawFsTools .brush-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#drawFsTools .brush-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawEngine.brush = btn.dataset.brush;
    };
  });
  const fsCwEl = document.getElementById('fsColorWheel');
  if (fsCwEl) fsCwEl.onclick = e => {
    e.stopPropagation();
    openColorWheel('brush');
  };
  const fsSize = document.getElementById('fsDrawSize');
  if (fsSize) fsSize.oninput = e => { drawEngine.brushSize = parseInt(e.target.value); $('drawSize').value = e.target.value; $('drawSizeVal').textContent = e.target.value; $('fsSizeVal').textContent = e.target.value; };
  const fsOp = document.getElementById('fsDrawOpacity');
  if (fsOp) fsOp.oninput = e => { drawEngine.brushOpacity = parseInt(e.target.value)/100; $('drawOpacity').value = e.target.value; $('drawOpacityVal').textContent = e.target.value; $('fsOpacityVal').textContent = e.target.value; };
  const fsUndo = document.getElementById('fsDrawUndo');
  if (fsUndo) fsUndo.onclick = undoFsDraw;
  const fsClear = document.getElementById('fsDrawClear');
  if (fsClear) fsClear.onclick = () => {
    if (confirm('清空画布？')) { drawEngine.fsCtx.clearRect(0, 0, W, H); drawEngine.fsUndoStack = []; saveFsUndoState(); }
  };
  const fsSave = document.getElementById('fsDrawSave');
  if (fsSave) fsSave.onclick = () => { saveDrawToDiary(); closeDrawFullscreen(); };
  const fsDl = document.getElementById('fsDrawDl');
  if (fsDl) fsDl.onclick = downloadDrawFs;
  const fsClose = document.getElementById('fsDrawClose');
  if (fsClose) fsClose.onclick = closeDrawFullscreen;
}

function fsSprayAt(pos) {
  const ctx = drawEngine.fsCtx;
  const size = drawEngine.brushSize * 3;
  const dots = drawEngine.brushSize * 5;
  ctx.save();
  ctx.globalAlpha = drawEngine.brushOpacity * 0.3;
  ctx.fillStyle = drawEngine.brushColor;
  for (let i = 0; i < dots; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * size;
    ctx.beginPath();
    ctx.arc(pos.x + Math.cos(angle)*dist, pos.y + Math.sin(angle)*dist, Math.random()*1.5+0.3, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function fsFloodFillAt(pos) {
  if (!drawEngine.fsCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const canvas = drawEngine.fsCanvas;
  const w = canvas.width, h = canvas.height;
  const ctx = drawEngine.fsCtx;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const px = Math.round(pos.x * dpr), py = Math.round(pos.y * dpr);
  if (px < 0 || py < 0 || px >= w || py >= h) return;

  const fillColor = hexToRgba(drawEngine.brushColor, drawEngine.brushOpacity);
  const idx = (py * w + px) * 4;
  const targetR = data[idx], targetG = data[idx + 1], targetB = data[idx + 2], targetA = data[idx + 3];

  if (Math.abs(fillColor.r - targetR) < 2 && Math.abs(fillColor.g - targetG) < 2 &&
      Math.abs(fillColor.b - targetB) < 2 && Math.abs(fillColor.a - targetA) < 2) return;

  const tol = 32;
  function matches(i) {
    return Math.abs(data[i] - targetR) <= tol && Math.abs(data[i + 1] - targetG) <= tol &&
           Math.abs(data[i + 2] - targetB) <= tol && Math.abs(data[i + 3] - targetA) <= tol;
  }

  const queue = [px + py * w];
  const visited = new Uint8Array(w * h);
  visited[px + py * w] = 1;

  while (queue.length > 0) {
    const pos = queue.shift();
    const i = pos * 4;
    data[i] = fillColor.r; data[i + 1] = fillColor.g; data[i + 2] = fillColor.b; data[i + 3] = fillColor.a;

    const x = pos % w, y = Math.floor(pos / w);
    const neighbors = [
      x > 0 ? pos - 1 : -1,
      x < w - 1 ? pos + 1 : -1,
      y > 0 ? pos - w : -1,
      y < h - 1 ? pos + w : -1
    ];
    for (const n of neighbors) {
      if (n >= 0 && !visited[n] && matches(n * 4)) {
        visited[n] = 1;
        queue.push(n);
      }
    }
    if (queue.length > w * h) break;
  }

  ctx.putImageData(imgData, 0, 0);
}

function saveFsUndoState() {
  if (!drawEngine.fsCanvas) return;
  const data = drawEngine.fsCtx.getImageData(0, 0, drawEngine.fsCanvas.width, drawEngine.fsCanvas.height);
  drawEngine.fsUndoStack.push(data);
  if (drawEngine.fsUndoStack.length > 30) drawEngine.fsUndoStack.shift();
}

function undoFsDraw() {
  if (drawEngine.fsUndoStack.length <= 1) return;
  drawEngine.fsUndoStack.pop();
  drawEngine.fsCtx.putImageData(drawEngine.fsUndoStack[drawEngine.fsUndoStack.length - 1], 0, 0);
}

function closeDrawFullscreen() {
  // Copy FS canvas back to active layer
  if (drawEngine.fsCanvas && drawEngine.canvas) {
    const dpr = window.devicePixelRatio || 1;
    const srcW = drawEngine.canvas.width / dpr, srcH = drawEngine.canvas.height / dpr;
    const layer = drawEngine.layers[drawEngine.activeLayer];
    if (layer) {
      layer.ctx.clearRect(0, 0, srcW, srcH);
      layer.ctx.drawImage(drawEngine.fsCanvas, 0, 0, drawEngine.fsCanvas.width, drawEngine.fsCanvas.height, 0, 0, srcW, srcH);
      layer._undo = [];
    }
    compositeLayers();
    saveUndoState();
  }
  $('drawFsOverlay').classList.remove('open');
  drawEngine.fsCanvas = null;
  drawEngine.fsCtx = null;
  drawEngine.fsUndoStack = [];
}

function downloadDrawFs() {
  const canvas = drawEngine.fsCanvas;
  if (!canvas) return;
  saveCanvasToDevice(canvas);
}

function saveDrawToDiary() {
  const src = drawEngine.fsCanvas || drawEngine.canvas;
  if (!src) return;
  const dataUrl = src.toDataURL('image/png');
  if (!state.editing?.data) return;
  if (!state.editing.data.images) state.editing.data.images = [];
  state.editing.data.images.push(dataUrl);
  renderModalImages();
  toast('绘制已保存到星轨');
}

function downloadDraw() {
  const canvas = drawEngine.canvas;
  if (!canvas) return;
  // Ensure composite is up-to-date on the main canvas
  compositeLayers();
  saveCanvasToDevice(canvas);
}

async function saveCanvasToDevice(canvas, fileName) {
  fileName = fileName || ('dayday-draw-' + new Date().toISOString().slice(0, 10) + '.png');
  const base64 = canvas.toDataURL('image/png').split(',')[1];

  // 1) Native Android ImageSaver (MediaStore → gallery)
  if (window.ImageSaver && window.ImageSaver.saveImage) {
    window.ImageSaver.saveImage(base64, fileName);
    return;
  }

  // 2) Capacitor Filesystem plugin
  try {
    const fs = window.capacitorFilesystem;
    if (fs && fs.Filesystem && window.Capacitor?.isNativePlatform?.()) {
      await fs.Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: fs.Directory.Documents,
        recursive: true,
      });
      toast('星图已保存');
      return;
    }
  } catch (e) { console.warn('Filesystem failed:', e); }

  // 3) Web Share API
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'image/png' })] })) {
      await navigator.share({ files: [new File([blob], fileName, { type: 'image/png' })], title: '保存星图' });
      toast('已分享');
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.warn('Share failed:', e);
  }

  // 4) Browser download link
  const link = document.createElement('a');
  link.download = fileName;
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('绘制已下载');
}

function closeModal() {
  $('modalOverlay').classList.remove('open');
  state.editing = null;
  $('modalTitle').value = ''; $('modalContent').value = '';
  $('modalImages').style.display = 'none';
  $('drawWrap').style.display = 'none';
  const btn = $('btnDrawToggle'); if (btn) btn.classList.remove('active');
  drawEngine.canvas = null;
  // Also close FS draw if open
  $('drawFsOverlay').classList.remove('open');
  drawEngine.fsCanvas = null;
  drawEngine.fsCtx = null;
}
$('modalClose').addEventListener('click', closeModal);
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });

// Story overlay
$('storyClose').addEventListener('click', () => $('storyOverlay').classList.remove('open'));
$('storyOverlay').addEventListener('click', e => { if (e.target === $('storyOverlay')) $('storyOverlay').classList.remove('open'); });

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('storyOverlay').classList.remove('open'); $('profileOverlay').classList.remove('open'); } });

// ====== Stats ======
async function updateStats() {
  try {
    const s = await db.stats();
    $('badgeNotes').textContent = s.totalNotes;
    $('badgeDiary').textContent = s.totalDiary;
    $('badgeReminders').textContent = s.pendingReminders;
    const coll = await db.storyCollection.list();
    $('badgeStory').textContent = coll.length;
    $('drawerStats').innerHTML = `${s.streak}天连续 · ${s.xp}XP<br>${s.totalNotes}星图 · ${s.totalDiary}星轨`;
  } catch(e) {}
}

// ====== Utils ======
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(iso, st) {
  if (!iso) return '';
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  const dt = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return st ? `${dt} ${p(d.getHours())}:${p(d.getMinutes())}` : dt;
}

// Celestial name generator (client-side)
async function generateCelestialName() {
  if (!state.profile || state.profile.celestialNameGeneratedAt) return;
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekMoods = state.checkins.filter(c => c.date >= weekAgo.toISOString().slice(0, 10)).map(c => c.mood);
  if (!weekMoods.length) return;

  const moodCount = {};
  weekMoods.forEach(m => { moodCount[m] = (moodCount[m] || 0) + 1; });
  let dom = null, max = 0;
  for (const [m, c] of Object.entries(moodCount)) { if (c > max) { dom = m; max = c; } }
  const phase = MOON_PHASES.find(p => p.e === dom);
  const mood = phase ? phase.mood : 'calm';
  const pool = CELESTIAL_POOLS[mood] || CELESTIAL_POOLS.calm;
  const prefix = pool[Math.floor(Math.random() * pool.length)];
  const suffix = CELESTIAL_SUFFIXES[Math.floor(Math.random() * CELESTIAL_SUFFIXES.length)];
  const name = prefix + suffix;

  await db.profile.update({ celestialName: name, celestialNameGeneratedAt: new Date().toISOString() });
  state.profile = await db.profile.get();
  renderProfile();
}

// ====== Theme ======
function initTheme() {
  const saved = localStorage.getItem('dayday_theme') || 'starry';
  if (saved === 'custom') {
    const customColor = localStorage.getItem('dayday_custom_color');
    if (customColor) applyCustomTheme(customColor);
    else applyTheme('starry');
  } else {
    applyTheme(saved);
  }

  // Drawer theme toggle (hidden in lite mode)
  if (isLite) {
    $('drawerTheme').style.display = 'none';
  } else {
    $('drawerTheme').style.display = '';
    $('drawerThemeLabel').onclick = () => {
      $('drawerTheme').classList.toggle('open');
    };
  }

  // Preset dot clicks
  document.querySelectorAll('.theme-dot[data-theme]:not([data-theme="custom"])').forEach(dot => {
    dot.addEventListener('click', () => {
      const theme = dot.dataset.theme;
      applyTheme(theme);
      localStorage.setItem('dayday_theme', theme);
      localStorage.removeItem('dayday_custom_color');
    });
  });

  // Custom "+" dot opens color wheel for theme
  const customDot = document.querySelector('.theme-dot.custom');
  if (customDot) customDot.addEventListener('click', (e) => {
    e.stopPropagation();
    openColorWheel('theme');
  });
}
// ====== In-page Color Wheel (shared: theme + brush) ======
let cwState = { hue: 0, sat: 100, light: 50, active: false, mode: 'theme' };
let cwReady = false;

function initColorWheel() {
  const canvas = $('colorwheelCanvas');
  if (!canvas) return;
  const bar = $('colorwheelBar');
  const cross = $('colorwheelCrosshair');
  const preview = $('colorwheelPreview');

  // Fast gradient-based wheel
  function drawWheel() {
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2, cy = canvas.height / 2, R = cx - 4;
    // Draw hue+saturation disc using many thin wedges
    const steps = 360;
    for (let i = 0; i < steps; i++) {
      const hue = i;
      const a0 = (i - 0.6) * Math.PI / 180;
      const a1 = (i + 0.6) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.35, `hsl(${hue},70%,70%)`);
      grad.addColorStop(0.7, `hsl(${hue},90%,50%)`);
      grad.addColorStop(1, `hsl(${hue},100%,35%)`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    // Center white dot
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    cwReady = true;
  }

  function updateCrossPos() {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const cr = cx - 4;
    const rad = cwState.hue * Math.PI / 180;
    const dist = (cwState.sat / 100) * cr;
    cross.style.left = (cx + Math.cos(rad) * dist) + 'px';
    cross.style.top = (cy + Math.sin(rad) * dist) + 'px';
    cross.style.display = 'block';
  }

  function updatePreview() {
    const [r, g, b] = hslToRgb(cwState.hue, cwState.sat, cwState.light);
    preview.style.background = `rgb(${r},${g},${b})`;
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - rect.left - cx;
    const dy = clientY - rect.top - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const cr = cx - 4;
    const angle = Math.atan2(dy, dx);
    cwState.hue = Math.round(((angle * 180 / Math.PI) + 360) % 360);
    cwState.sat = Math.min(100, Math.round((dist / cr) * 100));
    updateCrossPos();
    updatePreview();
  }

  function onStart(e) { cwState.active = true; getPos(e); e.preventDefault(); }
  function onMove(e) { if (!cwState.active) return; getPos(e); e.preventDefault(); }
  function onEnd() { cwState.active = false; }

  canvas.addEventListener('mousedown', onStart);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onEnd);
  canvas.addEventListener('mouseleave', onEnd);
  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd);

  bar.addEventListener('input', () => {
    cwState.light = parseInt(bar.value);
    updatePreview();
  });

  $('colorwheelCancel').addEventListener('click', closeColorWheel);
  $('colorwheelApply').addEventListener('click', () => {
    const [r, g, b] = hslToRgb(cwState.hue, cwState.sat, cwState.light);
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    if (cwState.mode === 'brush') {
      drawEngine.brushColor = hex;
      const dcw = $('drawColorWheel');
      if (dcw) dcw.style.boxShadow = `0 0 0 2px ${hex}`;
      const fscw = document.getElementById('fsColorWheel');
      if (fscw) fscw.style.boxShadow = `0 0 0 2px ${hex}`;
    } else {
      applyCustomTheme(hex);
      localStorage.setItem('dayday_theme', 'custom');
      localStorage.setItem('dayday_custom_color', hex);
    }
    closeColorWheel();
  });
  $('colorwheelOverlay').addEventListener('click', (e) => {
    if (e.target === $('colorwheelOverlay')) closeColorWheel();
  });

  // Defer heavy drawing so UI is responsive
  setTimeout(() => { drawWheel(); updateCrossPos(); updatePreview(); }, 100);
}

function openColorWheel(mode) {
  cwState.mode = mode || 'theme';
  const title = $('colorwheelTitle');
  if (title) title.textContent = mode === 'brush' ? '画笔取色' : '取色圆盘';
  if (mode === 'brush' && drawEngine && drawEngine.brushColor) {
    const hex = drawEngine.brushColor;
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    const hsl = rgbToHsl(r, g, b);
    cwState.hue = hsl.h; cwState.sat = hsl.s; cwState.light = hsl.l;
  }
  const overlay = $('colorwheelOverlay');
  overlay.classList.add('open');
  overlay.style.display = 'flex'; // force show
  const bar = $('colorwheelBar');
  if (bar) bar.value = cwState.light;
  updateColorWheelCross();
  const [rr, gg, bb] = hslToRgb(cwState.hue, cwState.sat, cwState.light);
  const preview = $('colorwheelPreview');
  if (preview) preview.style.background = `rgb(${rr},${gg},${bb})`;
}
function closeColorWheel() {
  const overlay = $('colorwheelOverlay');
  overlay.classList.remove('open');
  overlay.style.display = 'none';
}
function updateColorWheelCross() {
  const canvas = $('colorwheelCanvas');
  const cross = $('colorwheelCrosshair');
  if (!canvas || !cross) return;
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const cr = cx - 4;
  const rad = cwState.hue * Math.PI / 180;
  const dist = (cwState.sat / 100) * cr;
  cross.style.left = (cx + Math.cos(rad) * dist) + 'px';
  cross.style.top = (cy + Math.sin(rad) * dist) + 'px';
  cross.style.display = 'block';
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
function rgbToHsl(rr, gg, bb) {
  const r = rr / 255, g = gg / 255, b = bb / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function applyTheme(name) {
  document.documentElement.removeAttribute('style');
  document.documentElement.setAttribute('data-theme', name);
  document.querySelectorAll('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme === name));
}
function applyCustomTheme(hex) {
  document.documentElement.setAttribute('data-theme', 'custom');
  document.querySelectorAll('.theme-dot').forEach(d => d.classList.toggle('active', d.dataset.theme === 'custom'));
  const hsl = hexToHSL(hex);
  const isDark = hsl.l < 50;
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);
  if (isDark) {
    set('--bg',      hslStr(hsl.h, 12, 4));
    set('--surface', hslStr(hsl.h, 10, 7));
    set('--card',    hslStr(hsl.h, 10, 10));
    set('--hover',   hslStr(hsl.h, 8, 14));
    set('--border',  hslStr(hsl.h, 8, 16));
    set('--ring',    hslStr(hsl.h, 6, 22));
    set('--text',    hslStr(hsl.h, 8, 78));
    set('--text2',   hslStr(hsl.h, 6, 52));
    set('--text3',   hslStr(hsl.h, 4, 36));
  } else {
    set('--bg',      hslStr(hsl.h, 20, 96));
    set('--surface', hslStr(hsl.h, 25, 99));
    set('--card',    hslStr(hsl.h, 15, 100));
    set('--hover',   hslStr(hsl.h, 18, 92));
    set('--border',  hslStr(hsl.h, 14, 85));
    set('--ring',    hslStr(hsl.h, 10, 76));
    set('--text',    hslStr(hsl.h, 12, 22));
    set('--text2',   hslStr(hsl.h, 8, 46));
    set('--text3',   hslStr(hsl.h, 6, 68));
  }
  set('--ok',        isDark ? '#5a8a6a' : '#4a7a5a');
  set('--bad',       isDark ? '#b55a5a' : '#c46a6a');
  set('--gold',       hex);
  set('--gold-dim',   hslStr(hsl.h, hsl.s * 0.7, isDark ? 28 : 38));
  set('--gold-pale',  hslStr(hsl.h, hsl.s * 0.4, isDark ? 10 : 94));
  set('--gold-glow',  `rgba(${hexToRGB(hex).join(',')},0.15)`);
  set('--theme-dot',  hslStr(hsl.h, 8, isDark ? 16 : 85));
}
function hexToHSL(hex) {
  let [r,g,b] = hexToRGB(hex);
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h=0, s=0, l=(max+min)/2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hexToRGB(hex) {
  const v = parseInt(hex.replace('#',''), 16);
  return [(v>>16)&255, (v>>8)&255, v&255];
}
function hslStr(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }

// ====== 数据备份 / 恢复 ======
const BACKUP_LATEST = 'dayday-backup-latest.json';
// 每日首次启动自动备份（XP/成就等成长数据也一并保护）
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LS_BACKUP_KEYS = ['nox_token','dayday_prev_level','dayday_unlocked_rewards','dayday_excerpt_hint','dayday_astro_saved','dayday_theme','dayday_custom_color','dayday_xp_once','dayday_ledger_cats','dayday_music'];

function utf8ToB64(s) { return btoa(unescape(encodeURIComponent(s))); }
function b64ToUtf8(b) { return decodeURIComponent(escape(atob(b))); }

async function buildBackupJson() {
  const stores = await db.exportAll();
  const ls = {};
  LS_BACKUP_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) ls[k] = v; });
  return JSON.stringify({ app: 'dayday', version: 1, exportedAt: new Date().toISOString(), stores, localStorage: ls });
}

async function writeBackupFile(b64, fileName) {
  // 1) 原生 BackupSaver → 系统「下载」目录（卸载不丢）
  if (window.BackupSaver && window.BackupSaver.saveBackup) {
    try {
      const err = window.BackupSaver.saveBackup(b64, fileName);
      if (!err) return true;
      console.warn('BackupSaver failed:', err);
    } catch (e) { console.warn('BackupSaver failed:', e); }
  }
  // 2) Capacitor Filesystem → Documents
  try {
    const fs = window.capacitorFilesystem;
    if (fs && fs.Filesystem && window.Capacitor?.isNativePlatform?.()) {
      await fs.Filesystem.writeFile({ path: fileName, data: b64, directory: fs.Directory.Documents, recursive: true });
      return true;
    }
  } catch (e) { console.warn('Filesystem write failed:', e); }
  // 3) 浏览器下载
  try {
    const a = document.createElement('a');
    a.download = fileName;
    a.href = 'data:application/json;base64,' + b64;
    a.click();
    return true;
  } catch (e) { return false; }
}

async function backupData(silent) {
  try {
    const b64 = utf8ToB64(await buildBackupJson());
    const dateStr = new Date().toISOString().slice(0, 10);
    const ok1 = await writeBackupFile(b64, BACKUP_LATEST);
    const ok2 = await writeBackupFile(b64, 'dayday-backup-' + dateStr + '.json');
    if (!ok1 && !ok2) throw new Error('所有写入方式均失败');
    localStorage.setItem('dayday_last_backup', Date.now().toString());
    if (!silent) toast('星河备份已保存到下载目录');
    return true;
  } catch (e) {
    console.error('Backup failed:', e);
    if (!silent) toast('备份失败，请重试');
    return false;
  }
}

async function autoBackup() {
  try {
    const last = parseInt(localStorage.getItem('dayday_last_backup') || '0');
    if (Date.now() - last < BACKUP_INTERVAL_MS) return;
    const stats = await db.stats();
    // 空库不自动备份，防止新装后用空数据覆盖已有备份
    if (stats.totalNotes + stats.totalDiary + stats.totalCheckins === 0) return;
    await backupData(true);
  } catch (e) { console.error('Auto backup failed:', e); }
}

function pickBackupFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(f);
    };
    input.click();
  });
}

async function readBackupData() {
  // 1) 原生读取「下载」目录
  if (window.BackupSaver && window.BackupSaver.readBackup) {
    try {
      const b64 = window.BackupSaver.readBackup(BACKUP_LATEST);
      if (b64) return { b64 };
    } catch (e) { console.warn('BackupSaver read failed:', e); }
  }
  // 2) Capacitor Filesystem 读取 Documents
  try {
    const fs = window.capacitorFilesystem;
    if (fs && fs.Filesystem && window.Capacitor?.isNativePlatform?.()) {
      const r = await fs.Filesystem.readFile({ path: BACKUP_LATEST, directory: fs.Directory.Documents });
      if (r && typeof r.data === 'string' && r.data) return { b64: r.data };
    }
  } catch (e) {}
  // 3) 手动选择备份文件
  const text = await pickBackupFile();
  if (text) return { text };
  return null;
}

// 备份 JSON → 覆盖写入数据库（resetDb=损坏恢复时先删除整库重建）
async function applyBackupData(data, opts = {}) {
  if (!data || typeof data !== 'object' || !data.stores) throw new Error('invalid backup');
  if (opts.resetDb) await db.deleteDatabase();
  await db.importAll(data.stores);
  if (data.localStorage && typeof data.localStorage === 'object') {
    Object.entries(data.localStorage).forEach(([k, v]) => localStorage.setItem(k, v));
  }
}
window.applyBackupData = applyBackupData; // 供测试

// 启动完整性检查失败时的自动恢复（每次会话只尝试一次，防循环）
async function recoverCorruptedDb() {
  if (sessionStorage.getItem('dayday_recovered')) return;
  sessionStorage.setItem('dayday_recovered', '1');
  if (!confirm('本地数据库损坏，是否从最近备份恢复？\n取消后可稍后在「星河备份」中手动恢复。')) {
    toast('已跳过恢复，可稍后在「星河备份」中手动恢复');
    return;
  }
  toast('正在读取备份...');
  const found = await readBackupData();
  if (!found) { toast('未找到备份文件'); return; }
  try {
    let json = found.text;
    if (found.b64) json = b64ToUtf8(found.b64);
    const data = JSON.parse(json);
    await applyBackupData(data, { resetDb: true });
    toast('数据已从备份恢复');
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    console.error('Recovery failed:', e);
    toast('恢复失败：' + (e.message && e.message.includes('删除超时') ? '数据库被其他页面占用，请关闭其他页面后重试' : '备份文件无效'));
  }
}

async function restoreData() {
  if (!confirm('从备份恢复数据？\n当前所有数据将被备份内容替换。')) return;
  toast('正在读取备份...');
  const found = await readBackupData();
  if (!found) { toast('未找到备份文件，请先备份或手动选择备份文件'); return; }
  try {
    let json = found.text;
    if (found.b64) json = b64ToUtf8(found.b64);
    const data = JSON.parse(json);
    await applyBackupData(data);
    toast('星河数据已恢复');
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    console.error('Restore failed:', e);
    toast('恢复失败：备份文件无效');
  }
}

// 打包 zip → 系统分享面板（微信/邮件/网盘），浏览器环境回退为直接下载
async function shareBackup() {
  const fs = window.capacitorFilesystem;
  if (!(window.Capacitor?.isNativePlatform?.()) || !fs?.Filesystem) {
    toast('分享需在手机上使用，已改为直接下载');
    await backupData(false);
    return;
  }
  toast('正在打包备份…');
  try {
    const b64 = utf8ToB64(await buildBackupJson());
    const zip = new JSZip();
    zip.file('dayday-backup.json', b64, { base64: true });
    const zipB64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
    const fileName = 'dayday-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
    await fs.Filesystem.writeFile({ path: fileName, data: zipB64, directory: fs.Directory.Cache, recursive: true });
    const uri = await fs.Filesystem.getUri({ path: fileName, directory: fs.Directory.Cache });
    const share = window.capacitorShare?.Share;
    if (!share) { toast('分享组件未就绪'); return; }
    await share.share({ title: 'Day-Day 星河备份', url: uri.uri, dialogTitle: '分享星河备份' });
  } catch (e) {
    console.error('Share backup failed:', e);
    toast('分享失败，请改用「导出备份」');
  }
}

$('btnBackupData').addEventListener('click', () => backupData(false));
$('btnShareBackup').addEventListener('click', shareBackup);
$('btnRestoreData').addEventListener('click', restoreData);

// ====== Init ======
async function initApp() {
  if (!db) await loadModules();
  await loadProfile();
  initTheme();
  initColorWheel();
  initDrawer();
  initNav();
  initTextSelectionExcerpt();
  bindImageUpload();
  renderTypeChips();
  updateClock();
  await loadStargaze();
  updateStats();
  generateCelestialName();
  notifications.init().catch(() => {});
  if (window.innerWidth <= 768) {
    setTimeout(() => {
      $('drawer').classList.add('collapsed');
      $('drawerExpand').classList.add('visible');
    }, 300);
  }
}
