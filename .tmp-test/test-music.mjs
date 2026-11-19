// Day-Day 背景音乐：侧边栏入口、曲目选择、播放/暂停、音量、悬浮钮、持久化
const CDP = 'http://127.0.0.1:9222';
const APP = 'http://localhost:3099';
let targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page');
if (!page) page = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map(); const events = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
function send(method, params = {}) { return new Promise(r => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('PAGE ERROR: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
}
const results = [];
function log(ok, msg) { results.push(`${ok === 'PASS' ? '✅' : '❌'} ${msg}`); console.log(`${ok} ${msg}`); }
async function assert(desc, expression, timeout = 5000) {
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < timeout) {
    try { last = await ev(expression); if (last === true) { log('PASS', desc); return true; } } catch (e) { last = 'ERR:' + e.message; }
    await sleep(120);
  }
  log('FAIL', `${desc}  →  ${JSON.stringify(last)}`);
  return false;
}
// 真实点击（受信手势，满足自动播放策略）
async function realClick(sel) {
  const box = await ev(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: false });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('nox_token','unlocked'); localStorage.removeItem('dayday_music');` });
await send('Page.navigate', { url: APP });
await sleep(1500);
{
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) { try { if (await ev(`!!window.goPanel`)) break; } catch (e) {} await sleep(300); }
}
// 真实用户会先完成引导；引导/巡游遮罩（z 400/600）会挡住真实点击（点「完成」还会触发巡游 startTour，故直接摘 class）
await ev(`(() => { const o = document.getElementById('onboardOverlay'); if (o && o.classList.contains('open')) o.classList.remove('open'); const t = document.getElementById('tourOverlay'); if (t) t.style.display = 'none'; return true; })()`);
events.length = 0;

const MUSIC = `(await import('../client/music.js')).default`;

// 1. 侧边栏入口 → 音乐弹层
await ev(`(() => { const d = document.getElementById('drawer'); if (!d.classList.contains('collapsed')) document.getElementById('drawerToggle').click(); })()`);
await ev(`document.getElementById('drawerMusic').click()`);
await assert('1. 侧边栏「背景音乐」入口存在', `!!document.getElementById('drawerMusic')`);
await assert('1. 音乐弹层打开', `document.getElementById('musicSheet').classList.contains('open')`);
await assert('1. 曲目列表 4 首', `document.querySelectorAll('#musicTracks .music-track').length === 4`);
await assert('1. 默认选中第一首', `document.querySelector('#musicTracks .music-track.on')?.dataset.id === 'lightless-dawn'`);
await assert('1. 播放按钮初始为「播放」', `document.getElementById('musicToggle').textContent === '播放'`);
await assert('1. 悬浮钮初始隐藏', `document.getElementById('musicFab').style.display === 'none'`);

// 2. 选曲「迷离星河」→ 持久化
await ev(`document.querySelector('#musicTracks [data-id="mesmerizing-galaxy"]').click()`);
await assert('2. 选中曲目切换', `document.querySelector('#musicTracks .music-track.on')?.dataset.id === 'mesmerizing-galaxy'`);
await assert('2. 选择持久化到 localStorage', `JSON.parse(localStorage.getItem('dayday_music')).trackId === 'mesmerizing-galaxy'`);

// 3. 真实点击播放 → 音频在播
await realClick('#musicToggle');
await assert('3. 点击后音频播放', `(async () => { const m = ${MUSIC}; await new Promise(r=>setTimeout(r,400)); return m.isPlaying(); })()`);
await assert('3. 按钮变「暂停」', `document.getElementById('musicToggle').textContent === '暂停'`);
await assert('3. 悬浮钮出现且带播放态', `document.getElementById('musicFab').style.display !== 'none' && document.getElementById('musicFab').classList.contains('playing')`);

// 4. 关弹层后点悬浮钮 → 暂停（悬浮钮在弹层下方时点不到，真实场景弹层关闭才用）
await ev(`document.getElementById('musicSheetClose').click()`);
await sleep(500);
await assert('4. 悬浮钮可点（未被遮挡）', `(() => { const r = document.getElementById('musicFab').getBoundingClientRect(); return !!document.elementFromPoint(r.x + r.width/2, r.y + r.height/2)?.closest('#musicFab'); })()`);
await realClick('#musicFab');
await assert('4. 点击悬浮钮后暂停', `(async () => { const m = ${MUSIC}; return !m.isPlaying(); })()`);
await assert('4. 悬浮钮保持可见（可再续播）', `document.getElementById('musicFab').style.display !== 'none'`);
await assert('4. 按钮变回「播放」', `document.getElementById('musicToggle').textContent === '播放'`);

// 5. 音量
await ev(`(() => { const i = document.getElementById('musicVolume'); i.value = 30; i.dispatchEvent(new Event('input')); })()`);
await assert('5. 音量滑块写入并派发事件无异常', `document.getElementById('musicVolume').value === '30'`);

// 6. 关弹层不报错，音乐状态仍在
await ev(`document.getElementById('musicSheetClose').click()`);
await assert('6. 弹层关闭', `!document.getElementById('musicSheet').classList.contains('open')`);

// 7. 无 JS 异常
await sleep(400);
const errs = events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error'));
log(errs.length ? 'FAIL' : 'PASS', `7. 控制台错误: ${errs.length} 个` + (errs.length ? ' ' + JSON.stringify(errs.slice(0, 3).map(e => e.params?.exceptionDetails?.text || e.params?.args?.map(a => a.value).join(' '))) : ''));

const passed = results.filter(r => r.startsWith('✅')).length;
const failed = results.filter(r => r.startsWith('❌')).length;
console.log(`\n===== 共 ${results.length} 项,通过 ${passed},失败 ${failed} =====`);
process.exit(failed ? 1 : 0);
