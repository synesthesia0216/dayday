// 手机布局诊断：各面板滚动能力/溢出、星空卡 canvas 尺寸、年度星历网格、月面 hero 辉光
const CDP = 'http://127.0.0.1:9222';
let targets = await (await fetch(`${CDP}/json/list`)).json();
let page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) { return new Promise(r => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: 'http://localhost:3099/?diag=1' });
await sleep(1500);
await evalJs(`localStorage.setItem('nox_token','unlocked')`);
await send('Page.navigate', { url: 'http://localhost:3099/?diag=2' });
await sleep(4000);

console.log('viewport:', await evalJs(`innerWidth+'x'+innerHeight+' dpr:'+devicePixelRatio`));
console.log('app scroll:', await evalJs(`(() => {
  const a = document.getElementById('app');
  return JSON.stringify({ clientH: a.clientHeight, scrollH: a.scrollHeight, overflow: getComputedStyle(a).overflow });
})()`));

// 1) 各面板滚动能力
console.log('panels:', await evalJs(`(() => {
  const out = {};
  for (const el of document.querySelectorAll('.panel')) {
    const cs = getComputedStyle(el);
    out[el.id] = { clientH: el.clientHeight, scrollH: el.scrollHeight, overflowY: cs.overflowY };
    // 找内部 .panel-scroll
    const sc = el.querySelector('.panel-scroll') || el;
    const scs = getComputedStyle(sc);
    out[el.id].inner = { clientH: sc.clientHeight, scrollH: sc.scrollHeight, overflowY: scs.overflowY };
  }
  return JSON.stringify(out);
})()`));

// 2) 星空弹层 canvas 属性尺寸 vs CSS 尺寸
console.log('skyFsCanvas:', await evalJs(`(() => {
  document.getElementById('skyCard').click();
  return new Promise(r => setTimeout(() => {
    const cv = document.getElementById('skyFsCanvas');
    const rect = cv.getBoundingClientRect();
    r(JSON.stringify({ attrW: cv.width, attrH: cv.height, cssW: Math.round(rect.width), cssH: Math.round(rect.height) }));
  }, 2500));
})()`));

// 3) 年度星历统计网格
console.log('ephYearStats:', await evalJs(`(() => {
  const el = document.getElementById('ephYearStats');
  const items = [...el.children].map(c => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), text: c.textContent.slice(0, 12) }; });
  return JSON.stringify({ containerW: Math.round(el.getBoundingClientRect().width), items });
})()`));

// 4) 月面 hero：辉光与尺寸
console.log('moonHero:', await evalJs(`(() => {
  const halo = document.querySelector('.moon-hero-halo');
  const cv = document.getElementById('moonHeroCanvas');
  const cs = getComputedStyle(halo);
  const r = halo.getBoundingClientRect();
  const cr = cv.getBoundingClientRect();
  return JSON.stringify({
    haloCss: Math.round(r.width) + 'x' + Math.round(r.height),
    haloShadow: cs.boxShadow,
    canvasAttr: cv.width + 'x' + cv.height,
    canvasCss: Math.round(cr.width) + 'x' + Math.round(cr.height),
    glowVar: getComputedStyle(document.documentElement).getPropertyValue('--glow').trim() || '(undefined)'
  });
})()`));

// 5) 星空弹层图例与位置文本
console.log('skyFsInfo:', await evalJs(`JSON.stringify({ legend: document.getElementById('skyFsLegend').textContent, loc: document.getElementById('skyFsLoc').textContent })`));

ws.close();
process.exit(0);
