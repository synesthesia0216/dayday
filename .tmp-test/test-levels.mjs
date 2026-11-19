// 等级体系扩充：20 级天文段位 + 螺旋布局 + 秘藏故事 + 巅峰显示 + 成就
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
    await sleep(120);
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
await ev(`(() => { const o = document.getElementById('onboardOverlay'); if (o && o.classList.contains('open')) o.classList.remove('open'); const t = document.getElementById('tourOverlay'); if (t) t.style.display = 'none'; return true; })()`);

// 1. 数据层：20 级、XP 单调、段位名、秘藏故事 8-20 共 13 篇
const data = await ev(`(() => {
  const monotonic = LEVELS.every((l, i) => i === 0 || l.xp > LEVELS[i-1].xp);
  const rewards = Object.keys(LEVEL_REWARDS).map(Number).filter(lv => lv >= 8 && lv <= 20).length;
  return {
    count: LEVELS.length, monotonic,
    names: LEVELS.map(l => l.name), maxXp: LEVELS[LEVELS.length-1]?.xp,
    rewards8to20: rewards
  };
})()`);
log(data.count === 20 ? 'PASS' : 'FAIL', `LEVELS 共 20 级 → ${data.count}`);
log(data.monotonic ? 'PASS' : 'FAIL', 'XP 曲线严格单调递增');
log(data.names[7] === '变星观测者' ? 'PASS' : 'FAIL', `Lv.8 = 变星观测者 → ${data.names[7]}`);
log(data.names[11] === '标准烛光' ? 'PASS' : 'FAIL', `Lv.12 = 标准烛光 → ${data.names[11]}`);
log(data.names[14] === '引力透镜' ? 'PASS' : 'FAIL', `Lv.15 = 引力透镜 → ${data.names[14]}`);
log(data.names[19] === '第一缕光' ? 'PASS' : 'FAIL', `Lv.20 = 第一缕光 → ${data.names[19]}`);
log(data.rewards8to20 === 13 ? 'PASS' : 'FAIL', `秘藏故事 8-20 共 13 篇 → ${data.rewards8to20}`);
log(new Set(data.names).size === 20 ? 'PASS' : 'FAIL', '20 个段位名无重复');
// 原版段位保持不变
log(data.names[6] === '织光者' ? 'PASS' : 'FAIL', `Lv.7 = 织光者（原版保留）→ ${data.names[6]}`);

// 2. 图鉴螺旋布局：20 个等级标记 + 全部在空间内 + 连线
await ev(`goPanel('galaxy')`);
await sleep(1500);
await assert('图鉴渲染 20 个等级标记', `document.querySelectorAll('#galaxySpace .level-marker').length === 20`);
await assert('含 Lv.20 第一缕光标记', `[...document.querySelectorAll('#galaxySpace .level-marker')].some(m => m.textContent.includes('第一缕光'))`);
await assert('螺旋连线 SVG 存在', `!!document.querySelector('#galaxySpace .galaxy-level-lines path')`);
const bounds = await ev(`(() => {
  const ms = [...document.querySelectorAll('#galaxySpace .level-marker')];
  const sp = document.getElementById('galaxySpace');
  const W = sp.scrollWidth || sp.offsetWidth, H = sp.scrollHeight || sp.offsetHeight;
  let out = true;
  for (const m of ms) { const x = parseFloat(m.style.left), y = parseFloat(m.style.top); if (x < 0 || y < 0 || x > W || y > H) { out = false; break; } }
  return { out, W, H };
})()`);
log(bounds.out ? 'PASS' : 'FAIL', `20 个标记均在空间内 (${bounds.W}x${bounds.H})`);
await shot('levels-galaxy-20.png');

// 3. 全屏视图同样 20 标记
await ev(`(() => { const fsb = document.getElementById('gzFullscreen'); if (fsb) fsb.click(); return !!fsb; })()`);
await sleep(1200);
await assert('全屏视图渲染 20 个等级标记', `document.querySelectorAll('#galaxyFsMarkers .level-marker').length === 20`);
await shot('levels-fullscreen-20.png');
await ev(`(() => { const c = document.getElementById('galaxyFsClose'); if (c) c.click(); return !!c; })()`);
await sleep(400);

// 4. 巅峰：注入 XP 至 Lv.20 → 已达巅峰 + level_20 成就（结束前恢复原值，避免污染其他套件）
const G = `import('../client/db.js').then(m => m.default.growth)`;
const xpSnap = await ev(`(${G}.then(async g => { const x = await g.get(); return { xp: x.xp || 0, xpHistory: x.xpHistory || [], achievements: x.achievements || [] }; }))`);
await ev(`(${G}.then(async g => { const x = await g.get(); if ((x.xp||0) < 110000) await g.addXP(110000 - (x.xp||0), '测试注入'); return true; }))`);
await ev(`goPanel('galaxy')`);
await sleep(1500);
await assert('等级显示 Lv.20 第一缕光', `document.getElementById('galaxyLevel').textContent.includes('第一缕光')`);
await assert('进度条显示已达巅峰', `document.getElementById('galaxyXp').textContent.includes('已达巅峰')`);
await assert('宇宙初光成就解锁', `(${G}.then(async g => (await g.get()).achievements?.includes('level_20') ?? false))`);
await shot('levels-lv20-peak.png');

// 5. 点击 Lv.20 标记 → 提示巅峰信息（无「距下一级」）
const t20 = await ev(`(() => { const m = [...document.querySelectorAll('#galaxySpace .level-marker')].find(x => x.textContent.includes('Lv.20')); if (m) { m.click(); return true; } return false; })()`);
await sleep(500);
log(t20 ? 'PASS' : 'FAIL', 'Lv.20 标记可点击');
await assert('巅峰提示不含「距下一级」', `document.querySelector('.toast') && !document.querySelector('.toast').textContent.includes('距下一级')`);

// 恢复原 XP，避免污染其他测试套件
await ev(`(${G}.then(async g => { await g.setMeta({ xp: ${xpSnap.xp}, xpHistory: ${JSON.stringify(xpSnap.xpHistory)}, achievements: ${JSON.stringify(xpSnap.achievements)} }); return true; }))`);

// 6. 无 JS 异常
log(consoleErrors.length === 0 ? 'PASS' : 'FAIL', `无 JS 异常${consoleErrors.length ? ' → ' + consoleErrors.slice(0,3).join(' | ') : ''}`);

const fails = results.filter(r => r.startsWith('❌')).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
process.exit(fails ? 1 : 0);
