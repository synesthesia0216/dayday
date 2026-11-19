// 验证开屏动画时间轴：无 token → 眼睛出现→化月→淡出→登录屏；有 token → 不播动画
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
  if (r.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');

// ---- 场景 1：无 token（锁定态）----
await send('Page.navigate', { url: 'http://localhost:3099/?t=1' });
await sleep(1800);
await evalJs(`localStorage.removeItem('nox_token')`);
await send('Page.navigate', { url: 'http://localhost:3099/?t=2' });
await sleep(1200); // t≈1.2s：眼睛环视中
console.log('t=1.2s eye stage:', await evalJs(`(() => {
  const el = document.getElementById('eyeIntro');
  return JSON.stringify({
    shown: el && el.style.display !== 'none',
    eyeOpen: el && el.classList.contains('eye-open'),
    p2: el && el.classList.contains('p2'),
    loginVisible: !!document.getElementById('loginScreen') && getComputedStyle(document.getElementById('loginScreen')).display !== 'none'
  });
})()`));
await sleep(2500); // t≈3.7s：瞳孔淡去、虹膜现月
console.log('t=3.7s morph stage:', await evalJs(`(() => {
  const el = document.getElementById('eyeIntro');
  return JSON.stringify({
    p2: el && el.classList.contains('p2'),
    miniOpaque: (() => { const m = document.getElementById('eiMoonMini'); return m && getComputedStyle(m).opacity; })(),
    pupilGone: (() => { const p = document.querySelector('.ei-pupil'); return p && getComputedStyle(p).opacity; })()
  });
})()`));
await sleep(1200); // t≈4.9s：放大为满月图标
console.log('t=4.9s moon stage:', await evalJs(`(() => {
  const el = document.getElementById('eyeIntro');
  return JSON.stringify({
    p3: el && el.classList.contains('p3'),
    moonOpaque: (() => { const m = document.getElementById('eiMoon'); return m && getComputedStyle(m).opacity; })()
  });
})()`));
await sleep(2400); // t≈7.3s：动画结束
console.log('t=7.3s after anim:', await evalJs(`(() => {
  const el = document.getElementById('eyeIntro');
  return JSON.stringify({
    hidden: !el || el.style.display === 'none' || el.classList.contains('gone'),
    loginVisible: !!document.getElementById('loginScreen') && getComputedStyle(document.getElementById('loginScreen')).display !== 'none'
  });
})()`));

// ---- 场景 2：有 token → 不播动画，直接进应用 ----
await evalJs(`localStorage.setItem('nox_token', 'unlocked')`);
await send('Page.navigate', { url: 'http://localhost:3099/?t=3' });
await sleep(2600);
console.log('with token:', await evalJs(`(() => {
  const el = document.getElementById('eyeIntro');
  const app = document.getElementById('app');
  return JSON.stringify({
    eyeHidden: !el || el.style.display === 'none',
    appVisible: !!app && getComputedStyle(app).display !== 'none'
  });
})()`));

ws.close();
process.exit(0);
