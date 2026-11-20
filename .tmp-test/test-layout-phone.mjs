// 手机视图系统审计：多宽度 × 全面板
// 断言：A 无横向溢出 B 无越界元素 C 核心内容渲染 D 引导点不压文字 E 无 JS 异常
// 先注入真实感数据（60 天打卡 emoji、长文本日记、长标题笔记）以触发内容型溢出
const CDP = 'http://127.0.0.1:9222';
const APP = 'http://localhost:3099';
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
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
const results = [];
function log(ok, msg) { results.push(ok === true); console.log(`${ok === true ? 'PASS' : 'FAIL'} ${msg}`); }
const failCount = () => results.filter(r => !r).length;

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nox_token','unlocked');` });

async function boot(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, screenWidth: width, screenHeight: height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: APP + '/?probe=' + Date.now() });
  await sleep(1600);
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) { try { if (await ev(`!!window.goPanel`)) break; } catch (e) {} await sleep(300); }
  await ev(`(() => { const o = document.getElementById('onboardOverlay'); if (o && o.classList.contains('open')) o.classList.remove('open'); const t = document.getElementById('tourOverlay'); if (t) t.style.display = 'none'; return true; })()`);
}

// ---- 注入真实感数据 ----
await boot(390, 844);
const injected = await ev(`(async () => {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('dayday'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const db = await open();
  const put = (store, item) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(item); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); });
  const moods = ['🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔'];
  const t = new Date();
  let n = 0;
  for (let i = 1; i <= 60; i++) {
    if (i % 3) { const d = new Date(t); d.setDate(d.getDate() - i); n++; await put('checkins', { id: 'inj-c-'+i, date: d.toISOString().slice(0,10), mood: moods[i % 8], note: '今晚的月亮特别亮，风也安静，在楼顶看了很久很久的星空。'.slice(0, i % 40 + 8), _scope: 'full' }); }
  }
  for (let i = 1; i <= 4; i++) {
    await put('diary', { id: 'inj-d-'+i, date: '2026-11-' + String(10 + i), title: '观测手记：与猎户座的重逢——一个关于冬夜星空的漫长记录', content: '入冬以后空气清澈。'.repeat(30), mood: '🌗', _scope: 'full' });
    await put('notes', { id: 'inj-n-'+i, title: '备忘：双子座流星雨极大值观测计划与设备清单以及天气预案与备份地点', content: '记录内容。'.repeat(20), _scope: 'full' });
    n += 2;
  }
  return n;
})()`);
console.log('注入数据条数:', injected);

// ---- 多宽度审计 ----
const WIDTHS = [[320, 700], [360, 800], [390, 844], [412, 915]];
for (const [W, H] of WIDTHS) {
  await boot(W, H);
  const panels = await ev(`[...document.querySelectorAll('.nav-link')].map(n => n.dataset.panel).filter(Boolean)`);
  for (const p of panels) {
    await ev(`goPanel('${p}')`);
    await sleep(1400);
    // A 无横向溢出（活跃面板及其滚动容器）
    const a = await ev(`(() => {
      const panel = document.getElementById('panel-${p}');
      if (!panel || !panel.classList.contains('active')) return 'not-active';
      const scs = [panel, panel.querySelector('.panel-scroll')].filter(Boolean);
      const bad = scs.filter(s => s.scrollWidth > s.clientWidth + 2).map(s => s.id || s.className);
      return bad.length ? '溢出:' + bad.join(',') : true;
    })()`);
    log(a === true, `[${W}px] ${p} 无横向溢出${a === true ? '' : ' → ' + a}`);
    // B 无越界元素（跳过被 overflow:hidden 裁剪的容器内部，如星系画布层）
    const b = await ev(`(() => {
      const panel = document.getElementById('panel-${p}');
      const out = [];
      const clipped = el => { let n = el; while (n && n !== document.body) { const o = getComputedStyle(n).overflow; if (o === 'hidden' || o === 'clip') return true; n = n.parentElement; } return false; };
      const walk = (el, depth) => {
        if (depth > 3 || !el || el.nodeType !== 1) return;
        if (el.getBoundingClientRect().width > 8 && !clipped(el)) {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed' && (r.left < -2 || r.right > innerWidth + 2)) {
            out.push((el.id || el.className.toString().slice(0, 24)) + ' L' + Math.round(r.left) + ' R' + Math.round(r.right));
          }
        }
        for (const c of el.children) walk(c, depth + 1);
      };
      walk(panel, 0);
      return out.length ? out.slice(0, 4).join(' | ') : true;
    })()`);
    log(b === true, `[${W}px] ${p} 无越界元素${b === true ? '' : ' → ' + b}`);
    // C 核心内容
    const c = await ev(`(() => {
      const checks = {
        stargaze: () => { const c = document.getElementById('moonHeroCanvas'); const s = document.getElementById('skyCardCanvas'); return c && c.width > 100 && s && s.width > 100 && document.querySelectorAll('#planetList .planet-row').length >= 1; },
        records: () => !!document.querySelector('#weeklyCard .w-row') && document.getElementById('calendar').children.length > 0 && document.getElementById('moodDist').children.length > 0 && !!document.getElementById('wordTrend'),
        ephemeris: () => document.getElementById('ephYearStats') && document.getElementById('ephYearStats').children.length === 4,
        galaxy: () => document.getElementById('galaxyView') && document.getElementById('galaxyView').children.length > 0,
        myth: () => !!document.getElementById('storyCollectionGrid') && !!document.getElementById('storyTabs'),
      };
      const fn = checks['${p}'];
      return fn ? (fn() ? true : '内容未渲染') : '无检查项';
    })()`);
    log(c === true || c === '无检查项', `[${W}px] ${p} 核心内容${c === true || c === '无检查项' ? '' : ' → ' + c}`);
  }
}

// ---- D 引导弹层：点不压文字/按钮 ----
await boot(390, 844);
const tour = await ev(`(() => {
  try { startTour(); } catch (e) { return 'no-tour-fn'; }
  const ov = document.getElementById('tourOverlay');
  if (!ov || ov.style.display === 'none') return 'overlay-hidden';
  const dots = document.getElementById('tourDots').getBoundingClientRect();
  const texts = [document.getElementById('tourTipTitle'), document.getElementById('tourTipDesc'), document.getElementById('tourNext'), document.getElementById('tourSkip')]
    .map(el => el.getBoundingClientRect());
  const overlap = texts.some(r => !(dots.right <= r.left || dots.left >= r.right || dots.bottom <= r.top || dots.top >= r.bottom));
  return overlap ? '点与文字重叠' : true;
})()`);
log(tour === true, `引导弹层点与文字不重叠${tour === true ? '' : ' → ' + tour}`);
await ev(`(() => { const t = document.getElementById('tourOverlay'); if (t) t.style.display = 'none'; return true; })()`);

// ---- E 无 JS 异常 ----
log(consoleErrors.length === 0, `无 JS 异常${consoleErrors.length ? ' → ' + consoleErrors.slice(0, 3).join(' | ') : ''}`);

const fails = failCount();
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
if (consoleErrors.length) console.log('console errors:', consoleErrors.join(' | '));
process.exit(fails ? 1 : 0);
