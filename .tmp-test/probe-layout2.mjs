// 首页拆分验证：观星台滚动与间距、观测日志页渲染、年度星历 2×2、截图存档
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const CDP = 'http://127.0.0.1:9222';
const OUT = fileURLToPath(new URL('./screens/', import.meta.url));
let targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(r => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}
async function shot(name) {
  mkdirSync(OUT, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(`${OUT}${name}`, Buffer.from(r.result.data, 'base64'));
  console.log('SHOT ' + name);
}

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://localhost:3099/?diag=3' });
await sleep(1500);
await evalJs(`localStorage.setItem('nox_token','unlocked')`);
await send('Page.navigate', { url: 'http://localhost:3099/?diag=4' });
await sleep(3800);

// 1) 观星台：滚动 + 各块间距 + 块清单
console.log('stargaze:', await evalJs(`(() => {
  const p = document.getElementById('panel-stargaze');
  const kids = [...p.children].map(c => ({ id: c.id, cls: c.className.slice(0, 30) }));
  const gap = getComputedStyle(p).gap;
  return JSON.stringify({ clientH: p.clientHeight, scrollH: p.scrollHeight, gap, kids });
})()`));
await shot('stargaze-top.png');

// 滚动到底部看打卡卡
await evalJs(`document.getElementById('panel-stargaze').scrollTop = 9999`);
await sleep(400);
await shot('stargaze-bottom.png');
await evalJs(`document.getElementById('panel-stargaze').scrollTop = 0`);

// 2) 观测日志页
await evalJs(`goPanel('records')`);
await sleep(1500);
console.log('records:', await evalJs(`(() => {
  const p = document.getElementById('panel-records');
  const sc = p.querySelector('.panel-scroll');
  const wk = document.getElementById('weeklyCard');
  const cal = document.getElementById('calendar');
  const sg = document.getElementById('statsGrid');
  const heat = document.getElementById('checkinHeatmap');
  return JSON.stringify({
    active: p.classList.contains('active'),
    scClientH: sc.clientHeight, scScrollH: sc.scrollHeight,
    weeklyRows: wk ? wk.querySelectorAll('.w-row').length : -1,
    calCells: cal ? cal.querySelectorAll('.calendar-cell').length : -1,
    heatCells: heat ? heat.querySelectorAll('.heatmap-cell').length : -1,
    moodDistBars: document.getElementById('moodDist') ? document.getElementById('moodDist').children.length : -1,
    wordCols: document.getElementById('wordTrend') ? document.getElementById('wordTrend').querySelectorAll('.word-trend-col').length : -1,
    shareBtn: !!document.getElementById('btnShareCard')
  });
})()`));
await shot('records.png');

// 3) 星历面板：年度统计 2×2 验证
await evalJs(`goPanel('ephemeris')`);
await sleep(1500);
console.log('ephYear:', await evalJs(`(() => {
  const el = document.getElementById('ephYearStats');
  const cols = getComputedStyle(el).gridTemplateColumns.split(' ').length;
  const items = [...el.children].map(c => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), sub: c.textContent.slice(0, 16) }; });
  return JSON.stringify({ cols, containerW: Math.round(el.getBoundingClientRect().width), items });
})()`));
await shot('ephemeris.png');

// 4) 返回观星台，确认月相详情弹层仍有 NASA 实拍
await evalJs(`goPanel('stargaze')`);
await sleep(1500);
await evalJs(`document.getElementById('moonHero').click()`);
await sleep(1200);
console.log('moonModal:', await evalJs(`(() => {
  const i = document.getElementById('moonModalImg');
  const s = document.getElementById('moonModalSrc');
  return JSON.stringify({ imgLoaded: !!(i && i.classList.contains('loaded') && i.src), srcLabel: s ? s.textContent : null });
})()`));
await shot('moon-modal.png');
await evalJs(`document.getElementById('moonModalClose').click()`);

ws.close();
process.exit(0);
