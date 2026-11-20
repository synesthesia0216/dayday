// Day-Day 成长体系：新等级曲线 + 星尘勋章 + 星座点亮 + 真实观测 XP 来源
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

const TODAY = `new Date().toISOString().slice(0,10)`; // app 端以 UTC 日期记账
const G = `import('../client/db.js').then(m => m.default.growth)`;

// 启动页即观星台：真实月面加载 → 初见月面成就
await sleep(3500);
await assert('初见月面成就解锁', `(${G}.then(async g => (await g.get()).achievements?.includes('first_moon') ?? false))`, 15000);

// 1. 星系图鉴：勋章墙渲染
await ev(`goPanel('galaxy')`);
await sleep(1500);
await assert('勋章墙标题存在', `document.querySelector('.achievements-title') && document.querySelector('.achievements-title').textContent.includes('星尘勋章')`);
await assert('勋章墙渲染 10 枚', `document.getElementById('achievementsGrid').children.length === 10`);
await assert('已有勋章点亮(≥1)', `document.querySelectorAll('.ach-badge.on').length >= 1`);
await shot('growth-badges.png');

// 2. 今夜星空弹层：打开 +2 XP + 初识星空成就
// 跨测试残留：test-ledger 会整库清空但 localStorage 上限键残留 → 清键并取基线，断言相对基线 +1
await ev(`localStorage.removeItem('dayday_xp_once')`);
const SKY_BASE = await ev(`(${G}.then(async g => { const h = (await g.get()).xpHistory || []; return h.filter(e => e.source === '仰望今夜星空' && e.date.slice(0,10) === ${TODAY}).length; }))`);
await ev(`goPanel('sky')`);
await sleep(2500);
await assert('星座标签点位已计算(>10)', `window.state && state.skyCons && state.skyCons.length > 10`, 12000);
await assert('今日仰望星空 +2 XP 仅一次', `(${G}.then(async g => { const h = (await g.get()).xpHistory || []; return h.filter(e => e.source === '仰望今夜星空' && e.date.slice(0,10) === ${TODAY}).length === ${SKY_BASE} + 1; }))`);
await assert('初识星空成就解锁', `(${G}.then(async g => (await g.get()).achievements?.includes('first_sky') ?? false))`);

// 3. 点击星座标签 → 点亮 +8 XP + 成就
const clickFirstConst = `(() => {
  const c = window.state.skyCons[0];
  const cv = document.getElementById('skyPageCanvas');
  const r = cv.getBoundingClientRect();
  cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + c.x, clientY: r.top + c.y, bubbles: true }));
  return c.zh;
})()`;
await ev(clickFirstConst);
await sleep(1500);
await assert('点亮星座 +8 XP 记录一次', `(${G}.then(async g => { const h = (await g.get()).xpHistory || []; return h.filter(e => e.source.startsWith('点亮星座')).length === 1; }))`);
await assert('点亮首座成就解锁', `(${G}.then(async g => (await g.get()).achievements?.includes('first_const') ?? false))`);
await assert('星座记入 discoveries', `(${G}.then(async g => ((await g.get()).discoveries?.constellations?.length ?? 0) >= 1))`);
// 重复点击不重复计分
await ev(clickFirstConst);
await sleep(800);
await assert('重复点击不重复计分', `(${G}.then(async g => { const h = (await g.get()).xpHistory || []; return h.filter(e => e.source.startsWith('点亮星座')).length === 1; }))`);

// 4. 重开星空页：每日 XP 上限
await ev(`goPanel('stargaze')`);
await sleep(500);
await ev(`goPanel('sky')`);
await sleep(1800);
await assert('重开星空页不重复计分(每日一次)', `(${G}.then(async g => { const h = (await g.get()).xpHistory || []; return h.filter(e => e.source === '仰望今夜星空' && e.date.slice(0,10) === ${TODAY}).length === ${SKY_BASE} + 1; }))`);
await shot('growth-sky-lit.png');

// 5. 新等级曲线：注入 XP 至 3200 → Lv.7 织光者 + 猎手之名成就（若被其他套件污染高于 3200 先钳回，保证套件顺序无关）
await ev(`(${G}.then(async g => { const x = await g.get(); if ((x.xp||0) < 3200) await g.addXP(3200 - (x.xp||0), '测试注入'); else if ((x.xp||0) > 3200) await g.setMeta({ xp: 3200 }); return true; }))`);
await ev(`goPanel('galaxy')`);
await sleep(1800);
await assert('等级显示 Lv.7 织光者', `document.getElementById('galaxyLevel').textContent.includes('织光者')`);
await assert('猎手之名成就解锁', `(${G}.then(async g => (await g.get()).achievements?.includes('level_5') ?? false))`);
await assert('勋章墙点亮数增加(≥4)', `document.querySelectorAll('.ach-badge.on').length >= 4`);
await shot('growth-level7.png');

// 6. 月相打卡 → phases 发现记录
await ev(`goPanel('stargaze')`);
await sleep(1200);
await ev(`(() => { const c = document.querySelector('.mood-cell'); c && c.click(); })()`);
await sleep(1500);
await assert('月相记入 phases 发现', `(${G}.then(async g => ((await g.get()).discoveries?.phases?.length ?? 0) >= 1))`);

// 7. 并发 addXP 不丢数据（曾出现月面+5 与星空+2 并发互吞）
await ev(`import('../client/db.js').then(async m => {
  const db = m.default;
  const tag = '并发' + Date.now();
  const before = (await db.growth.get()).xp || 0;
  await Promise.all([1,2,3,4,5].map(i => db.growth.addXP(1, tag + '-' + i)));
  const after = (await db.growth.get());
  window._race = { delta: (after.xp || 0) - before, n: (after.xpHistory || []).filter(e => e.source.startsWith(tag)).length };
  return true;
})`);
await sleep(1000);
await assert('并发 5 次 addXP 全部保留', `window._race && window._race.delta === 5 && window._race.n === 5`);

// 8. 无 JS 异常
await sleep(600);
await assert('无 JS 异常', `${consoleErrors.length} === 0`);

const fails = results.filter(r => r.startsWith('❌')).length;
console.log(`\n共 ${results.length} 项，通过 ${results.length - fails}，失败 ${fails}`);
if (consoleErrors.length) console.log('console errors:', consoleErrors.join(' | '));
process.exit(fails ? 1 : 0);
