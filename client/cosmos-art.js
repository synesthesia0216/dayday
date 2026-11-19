// ====== 程序化天体插画 ======
// NASA 实拍图未就绪（离线/无网/额度）时的确定性封面：同一天体每次渲染一致
const TAU = Math.PI * 2;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 类型 → 基础色相（多个候选，按种子挑选）
const TYPE_HUES = {
  '螺旋星系': [[215, 45], [200, 40]],
  '星暴星系': [[350, 25], [215, 45]],
  '发射星云': [[350, 330], [20, 340]],
  '反射星云': [[205, 190], [220, 200]],
  '暗星云': [[220, 350], [210, 330]],
  '行星状星云': [[165, 185], [150, 175]],
  '超新星遗迹': [[185, 350], [170, 20]],
  '疏散星团': [[215, 45], [200, 50]],
  '球状星团': [[45, 215], [40, 200]],
  '发射/反射星云': [[340, 200], [20, 210]],
};
function hueFor(type, rnd) {
  const cand = TYPE_HUES[type] || [[210, 45]];
  return cand[Math.floor(rnd() * cand.length)];
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hsla = (h, s, l, a) => `hsla(${h},${s}%,${l}%,${a})`;

function bgSpace(ctx, w, h, rnd, hue) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05070f');
  g.addColorStop(0.55, '#0a0e1f');
  g.addColorStop(1, '#070b18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 遥远星场
  for (let i = 0; i < w * h / 220; i++) {
    const x = rnd() * w, y = rnd() * h;
    const r = 0.3 + rnd() * 0.8;
    const a = 0.15 + rnd() * 0.5;
    ctx.fillStyle = `rgba(235,240,255,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // 极淡星云雾霭
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const x = w * (0.2 + rnd() * 0.6), y = h * (0.2 + rnd() * 0.6);
    const r = w * (0.3 + rnd() * 0.35);
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, hsla(hue[0] + rnd() * 40 - 20, 55, 45, 0.10));
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
}

function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}

function starDot(ctx, x, y, r, alpha, hue) {
  ctx.fillStyle = hsla(hue, 30, 92, alpha);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (r > 1) glow(ctx, x, y, r * 5, hsla(hue, 60, 80, 0.9), alpha * 0.55);
}

// —— 螺旋星系 / 星暴星系 ——
function drawSpiral(ctx, w, h, rnd, hue, starburst) {
  bgSpace(ctx, w, h, rnd, hue);
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.42;
  const arms = starburst ? 2 : 2 + Math.floor(rnd() * 2);
  const tilt = rnd() * TAU;
  const squash = 0.55 + rnd() * 0.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.scale(1, squash);
  // 旋臂辉光
  for (let a = 0; a < arms; a++) {
    const off = (a / arms) * TAU + rnd() * 0.6;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i <= 1; i += 0.02) {
        const th = off + i * 4.4;
        const rr = 4 + Math.pow(i, 1.9) * R;
        const jx = (rnd() - 0.5) * (2 + i * 8);
        const jy = (rnd() - 0.5) * (2 + i * 8);
        const x = Math.cos(th) * rr + jx, y = Math.sin(th) * rr + jy;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hsla(hue[0] + (pass ? 12 : 0), 65, pass ? 62 : 52, pass ? 0.42 : 0.22);
      ctx.lineWidth = pass ? 2 : 9;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // 旋臂星点
    for (let i = 0; i < 60; i++) {
      const t = Math.pow(rnd(), 0.7);
      const th = off + t * 4.2;
      const rr = 4 + Math.pow(t, 1.85) * R;
      const x = Math.cos(th) * rr + (rnd() - 0.5) * 10;
      const y = Math.sin(th) * rr + (rnd() - 0.5) * 10;
      const warm = rnd() < 0.4;
      starDot(ctx, x, y, 0.5 + rnd() * 1.1, 0.4 + rnd() * 0.6, warm ? hue[1] : hue[0]);
    }
  }
  // 核心
  glow(ctx, 0, 0, R * 0.42, hsla(hue[1], 70, 88, 0.95), 0.85);
  glow(ctx, 0, 0, R * 0.2, 'rgba(255,250,235,0.95)', 0.95);
  if (starburst) glow(ctx, 0, 0, R * 0.7, hsla(350, 70, 55, 0.7), 0.4);
  ctx.restore();
  // 前景星
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = rnd() * h;
    starDot(ctx, x, y, 0.4 + rnd() * 1.0, 0.5 + rnd() * 0.5, 215);
  }
}

// —— 星云（发射 / 反射 / 复合）——
function drawNebula(ctx, w, h, rnd, hue) {
  bgSpace(ctx, w, h, rnd, hue);
  const min = Math.min(w, h);
  const blobs = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = rnd() * TAU, d = Math.pow(rnd(), 1.6) * min * 0.34;
    const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
    const r = min * (0.22 + rnd() * 0.3);
    glow(ctx, x, y, r, hsla(hue[0] + rnd() * 36 - 18, 62, 52, 0.55), 0.45 + rnd() * 0.3);
  }
  // 亮核与恒星
  const core = { x: w / 2 + (rnd() - 0.5) * min * 0.2, y: h / 2 + (rnd() - 0.5) * min * 0.2 };
  glow(ctx, core.x, core.y, min * 0.16, hsla(hue[1], 70, 85, 0.95), 0.9);
  glow(ctx, core.x, core.y, min * 0.06, 'rgba(255,252,240,0.98)', 0.98);
  for (let i = 0; i < 10; i++) {
    const a = rnd() * TAU, d = Math.pow(rnd(), 0.6) * min * 0.3;
    starDot(ctx, core.x + Math.cos(a) * d, core.y + Math.sin(a) * d, 0.5 + rnd() * 1.2, 0.5 + rnd() * 0.5, hue[1]);
  }
  // 暗尘带
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rnd() * TAU);
    ctx.beginPath();
    const y0 = (rnd() - 0.5) * min * 0.3;
    for (let t = -1; t <= 1; t += 0.05) {
      const x = t * min * 0.55, y = y0 + Math.sin(t * 7 + i) * min * 0.05 + (rnd() - 0.5) * 3;
      t === -1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(2,4,10,${0.35 + rnd() * 0.2})`;
    ctx.lineWidth = min * (0.05 + rnd() * 0.09);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

// —— 暗星云（剪影）——
function drawDark(ctx, w, h, rnd, hue) {
  drawNebula(ctx, w, h, rnd, [hue[1], hue[0]]);
  const min = Math.min(w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rnd() * TAU);
  ctx.beginPath();
  ctx.moveTo(-min * 0.3, min * 0.2);
  ctx.quadraticCurveTo(-min * 0.05, -min * 0.26, min * 0.18, -min * 0.22);
  ctx.quadraticCurveTo(min * 0.3, -min * 0.1, min * 0.28, min * 0.05);
  ctx.quadraticCurveTo(min * 0.12, min * 0.28, -min * 0.22, min * 0.3);
  ctx.quadraticCurveTo(-min * 0.34, min * 0.24, -min * 0.3, min * 0.2);
  ctx.closePath();
  const g = ctx.createRadialGradient(0, 0, min * 0.02, 0, 0, min * 0.34);
  g.addColorStop(0, 'rgba(1,2,7,0.96)');
  g.addColorStop(0.8, 'rgba(1,2,7,0.88)');
  g.addColorStop(1, 'rgba(1,2,7,0)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  // 边缘亮星
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU;
    starDot(ctx, w / 2 + Math.cos(a) * min * 0.34, h / 2 + Math.sin(a) * min * 0.26, 0.6 + rnd() * 1.0, 0.7, 215);
  }
}

// —— 行星状星云 ——
function drawPlanetary(ctx, w, h, rnd, hue) {
  bgSpace(ctx, w, h, rnd, hue);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rnd() * TAU);
  ctx.scale(1, 0.72 + rnd() * 0.15);
  // 外层气体晕
  glow(ctx, 0, 0, R * 1.5, hsla(hue[0], 55, 45, 0.5), 0.4);
  // 环
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    ctx.ellipse(0, 0, R * (pass ? 0.62 : 1), R * (pass ? 0.62 : 1), 0, 0, TAU);
    ctx.strokeStyle = hsla(hue[0] + pass * 12, 65, pass ? 62 : 55, pass ? 0.55 : 0.75);
    ctx.lineWidth = R * (pass ? 0.22 : 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, R * (pass ? 0.62 : 1), R * (pass ? 0.62 : 1), 0, 0, TAU);
    ctx.strokeStyle = hsla(hue[0] + pass * 12, 80, 80, 0.5);
    ctx.lineWidth = R * 0.05;
    ctx.stroke();
  }
  ctx.restore();
  // 中央白矮星
  glow(ctx, cx, cy, Math.min(w, h) * 0.09, 'rgba(255,252,240,0.98)', 1);
}

// —— 超新星遗迹 ——
function drawRemnant(ctx, w, h, rnd, hue) {
  bgSpace(ctx, w, h, rnd, hue);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
  glow(ctx, cx, cy, R * 1.2, hsla(hue[0], 50, 40, 0.4), 0.35);
  const arcs = 9 + Math.floor(rnd() * 5);
  for (let i = 0; i < arcs; i++) {
    const a0 = rnd() * TAU;
    const span = 0.35 + rnd() * 1.1;
    const rr = R * (0.62 + rnd() * 0.4);
    const wob = rr * (0.08 + rnd() * 0.15);
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.05) {
      const a = a0 + t * span;
      const r = rr + Math.sin(t * 6 + i * 2.1) * wob;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    const hh = hue[0] + (rnd() < 0.3 ? 170 : 0);
    ctx.strokeStyle = hsla(hh, 70, 72, 0.5 + rnd() * 0.35);
    ctx.lineWidth = 1.0 + rnd() * 1.8;
    ctx.stroke();
    // 丝缕结点
    const ta = a0 + span * rnd();
    glow(ctx, cx + Math.cos(ta) * rr, cy + Math.sin(ta) * rr, 2 + rnd() * 3, hsla(hh, 75, 80, 0.9), 0.5);
  }
  glow(ctx, cx, cy, R * 0.1, 'rgba(255,248,235,0.95)', 0.9);
}

// —— 疏散星团 ——
function drawOpenCluster(ctx, w, h, rnd, hue) {
  bgSpace(ctx, w, h, rnd, hue);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
  for (let i = 0; i < 70; i++) {
    const a = rnd() * TAU;
    const d = Math.pow(rnd(), 0.8) * R * (0.5 + rnd() * 0.5);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const bright = rnd() < 0.12;
    starDot(ctx, x, y, bright ? 1.1 + rnd() * 0.9 : 0.4 + rnd() * 0.7, bright ? 0.9 : 0.4 + rnd() * 0.5, hue[0] + (rnd() < 0.25 ? hue[1] - hue[0] : 0));
  }
  glow(ctx, cx, cy, R * 0.16, hsla(hue[0], 50, 82, 0.8), 0.5);
}

// —— 球状星团 ——
function drawGlobular(ctx, w, h, rnd, hue) {
  bgSpace(ctx, w, h, rnd, hue);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
  glow(ctx, cx, cy, R * 1.35, hsla(hue[0], 45, 70, 0.5), 0.5);
  for (let i = 0; i < 460; i++) {
    const a = rnd() * TAU;
    const d = Math.pow(rnd(), 2.4) * R * 1.5;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const t = 1 - clamp(d / (R * 1.5), 0, 1);
    starDot(ctx, x, y, 0.4 + rnd() * 0.7 * (0.4 + t), 0.35 + t * 0.55, hue[0]);
  }
  glow(ctx, cx, cy, R * 0.2, hsla(hue[1], 60, 88, 0.95), 0.9);
}

export function drawObjectArt(canvas, obj) {
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return;
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(hashStr(obj.id || obj.name || 'obj'));
  const hue = hueFor(obj.type, rnd);
  const t = obj.type || '';
  if (t.includes('行星状')) drawPlanetary(ctx, w, h, rnd, hue);
  else if (t.includes('超新星')) drawRemnant(ctx, w, h, rnd, hue);
  else if (t.includes('暗星云')) drawDark(ctx, w, h, rnd, hue);
  else if (t.includes('球状')) drawGlobular(ctx, w, h, rnd, hue);
  else if (t.includes('疏散')) drawOpenCluster(ctx, w, h, rnd, hue);
  else if (t.includes('星云')) drawNebula(ctx, w, h, rnd, hue);
  else if (t.includes('星系')) drawSpiral(ctx, w, h, rnd, hue, t.includes('星暴'));
  else drawSpiral(ctx, w, h, rnd, hue, false);
}

export default { drawObjectArt };
