// 程序化插画程序化验收：色彩方差、确定性、10 类型无异常
const CDP = 'http://127.0.0.1:9222';
const targets = await (await fetch(CDP + '/json/list')).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('PAGE ERROR: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };

const r = await ev(`(async () => {
  const art = (await import('../client/cosmos-art.js?v=' + Date.now())).default;
  const types = ['螺旋星系','星暴星系','发射星云','反射星云','发射/反射星云','暗星云','行星状星云','超新星遗迹','疏散星团','球状星团'];
  const report = [];
  for (const t of types) {
    const c1 = document.createElement('canvas'), c2 = document.createElement('canvas');
    c1.width = c2.width = 168; c1.height = c2.height = 100;
    art.drawObjectArt(c1, { id: 't1', type: t });
    art.drawObjectArt(c2, { id: 't1', type: t });   // 同 id → 必须一致
    const d1 = c1.getContext('2d').getImageData(0, 0, 168, 100).data;
    const d2 = c2.getContext('2d').getImageData(0, 0, 168, 100).data;
    let same = true, colored = 0, bright = 0;
    for (let i = 0; i < d1.length; i += 4) {
      if (d1[i] !== d2[i] || d1[i+1] !== d2[i+1] || d1[i+2] !== d2[i+2]) { same = false; break; }
      const mx = Math.max(d1[i], d1[i+1], d1[i+2]), mn = Math.min(d1[i], d1[i+1], d1[i+2]);
      if (mx - mn > 40) colored++;
      if (mx > 120) bright++;
    }
    report.push({ type: t, deterministic: same, coloredPct: +(colored / (d1.length / 4) * 100).toFixed(1), brightPct: +(bright / (d1.length / 4) * 100).toFixed(1) });
  }
  // 同类型不同 id → 必须不同
  const cA = document.createElement('canvas'), cB = document.createElement('canvas');
  cA.width = cB.width = 168; cA.height = cB.height = 100;
  art.drawObjectArt(cA, { id: 'm31', type: '螺旋星系' });
  art.drawObjectArt(cB, { id: 'm51', type: '螺旋星系' });
  const dA = cA.getContext('2d').getImageData(0, 0, 168, 100).data;
  const dB = cB.getContext('2d').getImageData(0, 0, 168, 100).data;
  let diff = 0;
  for (let i = 0; i < dA.length; i += 4) if (Math.abs(dA[i] - dB[i]) > 20) diff++;
  return { report, distinctIds: diff > 1000, diffPx: diff };
})()`);
console.log(JSON.stringify(r, null, 1));
process.exit(0);
