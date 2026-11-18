// ====== Day-Day 星空渲染引擎 ======
// 真实恒星目录(HYG v41) + 星座连线(Stellarium modern) → 地平坐标 → 天顶立体投影 canvas
// 数据：public/data/stars.json / constellations.json（构建期生成）

const D2R = Math.PI / 180;

// 银道坐标 → J2000 赤道坐标旋转矩阵（ICRS→Galactic，HIPPARCOS 标准）
const GAL_ROT = [
  [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  [ 0.4941094278755837, -0.4448296299600112,  0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015,  0.4559837761750669],
];

// B-V 色指数 → 恒星颜色（黑体近似插值表）
const BV_TABLE = [
  [-0.4, [165, 185, 255]],
  [-0.2, [190, 201, 255]],
  [ 0.0, [255, 252, 255]],
  [ 0.2, [255, 248, 230]],
  [ 0.4, [255, 240, 205]],
  [ 0.6, [255, 226, 180]],
  [ 0.8, [255, 210, 155]],
  [ 1.0, [255, 196, 135]],
  [ 1.4, [255, 178, 120]],
  [ 1.8, [255, 160, 110]],
];

const FONT = '"LXGW WenKai Lite","Noto Serif SC",serif';

let catalog = null;

function toJulian(date) {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() + date.getUTCHours() / 24 + date.getUTCMinutes() / 1440 + date.getUTCSeconds() / 86400;
  if (m <= 2) { y--; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

// 格林尼治恒星时（度），Meeus 简化式
function gmstDeg(date) {
  const jd = toJulian(date);
  const T = (jd - 2451545.0) / 36525;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((g % 360) + 360) % 360;
}

// 赤道坐标(度) → 地平坐标：alt 高度角(度)、az 方位角(度，自北向东)
function eqToHoriz(raDeg, decDeg, lstDeg, latDeg) {
  let H = ((lstDeg - raDeg) * D2R) % (Math.PI * 2);
  if (H > Math.PI) H -= Math.PI * 2;
  if (H < -Math.PI) H += Math.PI * 2;
  const sinDec = Math.sin(decDeg * D2R), cosDec = Math.cos(decDeg * D2R);
  const sinLat = Math.sin(latDeg * D2R), cosLat = Math.cos(latDeg * D2R);
  const sinAlt = sinLat * sinDec + cosLat * cosDec * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / D2R;
  const az = (Math.atan2(-cosDec * Math.sin(H), sinDec * cosLat - cosDec * sinLat * Math.cos(H)) / D2R + 360) % 360;
  return { alt, az };
}

// 银道坐标(l,b 度) → J2000 赤道坐标(度)
function galToEq(lDeg, bDeg) {
  const l = lDeg * D2R, b = bDeg * D2R;
  const gx = Math.cos(b) * Math.cos(l), gy = Math.cos(b) * Math.sin(l), gz = Math.sin(b);
  const x = GAL_ROT[0][0] * gx + GAL_ROT[1][0] * gy + GAL_ROT[2][0] * gz;
  const y = GAL_ROT[0][1] * gx + GAL_ROT[1][1] * gy + GAL_ROT[2][1] * gz;
  const z = GAL_ROT[0][2] * gx + GAL_ROT[1][2] * gy + GAL_ROT[2][2] * gz;
  return { ra: (Math.atan2(y, x) / D2R + 360) % 360, dec: Math.asin(Math.max(-1, Math.min(1, z))) / D2R };
}

// 地平坐标 → 天顶立体投影（北朝上、东朝右；地平圈映射到半径 R 的圆）
function altazToXY(altDeg, azDeg, R) {
  const z = Math.max(0, 90 - altDeg); // 天顶距
  const r = R * Math.tan(z * D2R / 2);
  const a = azDeg * D2R;
  return { x: r * Math.sin(a), y: -r * Math.cos(a), r };
}

function bvToRgb(ci) {
  if (ci === null || ci === undefined) return [255, 250, 245];
  const t = Math.max(-0.4, Math.min(1.8, ci));
  for (let i = 1; i < BV_TABLE.length; i++) {
    if (t <= BV_TABLE[i][0]) {
      const [b0, c0] = BV_TABLE[i - 1], [b1, c1] = BV_TABLE[i];
      const f = (t - b0) / (b1 - b0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
    }
  }
  return BV_TABLE[BV_TABLE.length - 1][1];
}

function magToStyle(mag) {
  const r = Math.max(0.3, (4.7 - mag) * 0.62 + 0.35);
  const a = Math.max(0.2, Math.min(1, 1.08 - (mag + 1.2) / 5.4));
  return { r, a };
}

async function ensureCatalog() {
  if (catalog) return catalog;
  const [stars, cons] = await Promise.all([
    fetch('data/stars.json').then(r => r.json()),
    fetch('data/constellations.json').then(r => r.json()),
  ]);
  const hipMap = new Map();
  stars.forEach((s, i) => { hipMap.set(s.hip, i); });
  const byHip = [];
  for (const c of cons) {
    const idxs = [];
    for (const seg of c.segments) {
      let a = hipMap.get(seg[0]), b = hipMap.get(seg[1]);
      if (a === undefined || b === undefined) continue;
      idxs.push([a, b]);
    }
    byHip.push({ ...c, segIdx: idxs });
  }
  catalog = { stars, byHip };
  return catalog;
}

// opts: { lat, lon, date, cx, cy, radius, w, h, showLabels=true, showMilkyWay=true, showCompass=true, showStarLabels=false, dim=1 }
// 返回 { starsDrawn, linesDrawn, labelsDrawn } 供测试断言
async function render(ctx, opts) {
  const { lat, lon, date, cx, cy, radius } = opts;
  const R = radius;
  const dim = opts.dim ?? 1;
  const { stars, byHip } = await ensureCatalog();

  const lst = (gmstDeg(date) + lon + 360) % 360;
  let starsDrawn = 0, linesDrawn = 0, labelsDrawn = 0;

  // 0. 整幅底色（矩形画布边角融入夜色）
  if (opts.w && opts.h) {
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, opts.w, opts.h);
  }

  // 1. 夜空底色（天顶微亮 → 地平深沉）
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, '#0b1026');
  bg.addColorStop(0.75, '#080c1d');
  bg.addColorStop(1, '#060814');
  ctx.fillStyle = bg;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // 2. 银河带（银道面 b=0 采样，宽笔柔光）
  if (opts.showMilkyWay !== false) {
    const mwPts = [];
    for (let l = 0; l <= 360; l += 4) {
      const eq = galToEq(l, 0);
      const h = eqToHoriz(eq.ra, eq.dec, lst, lat);
      if (h.alt < 0) { mwPts.push(null); continue; }
      const p = altazToXY(h.alt, h.az, R);
      mwPts.push({ x: cx + p.x, y: cy + p.y });
    }
    ctx.lineCap = 'round';
    const passes = [[34, 0.045], [20, 0.055], [11, 0.07]];
    for (const [w, a] of passes) {
      ctx.strokeStyle = `rgba(178,190,222,${a * dim})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      let pen = false;
      for (const pt of mwPts) {
        if (!pt) { pen = false; continue; }
        if (pen) ctx.lineTo(pt.x, pt.y); else { ctx.moveTo(pt.x, pt.y); pen = true; }
      }
      ctx.stroke();
    }
  }

  // 3. 地平线以下压暗 + 地平圈 + 方位刻度
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - R - 40, cy - R - 40, R * 2 + 80, R * 2 + 80);
  ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(3,5,12,0.6)';
  ctx.fill('evenodd');
  ctx.restore();
  if (opts.showCompass !== false) {
    ctx.strokeStyle = `rgba(220,228,245,${0.22 * dim})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(220,228,245,${0.4 * dim})`;
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dirs = [['北', 0], ['东', 90], ['南', 180], ['西', 270]];
    for (const [t, az] of dirs) {
      const p = altazToXY(0, az, R + 13);
      ctx.fillText(t, cx + p.x, cy + p.y);
    }
    for (let az = 30; az < 360; az += 30) {
      if (az % 90 === 0) continue;
      const p1 = altazToXY(0, az, R);
      const p2 = altazToXY(0, az, R - 5);
      ctx.strokeStyle = `rgba(220,228,245,${0.12 * dim})`;
      ctx.beginPath();
      ctx.moveTo(cx + p1.x, cy + p1.y);
      ctx.lineTo(cx + p2.x, cy + p2.y);
      ctx.stroke();
    }
  }

  // 4. 恒星 → 地平坐标预计算
  const view = [];
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const h = eqToHoriz(s.ra * 15, s.dec, lst, lat);
    if (h.alt < 0) continue;
    const p = altazToXY(h.alt, h.az, R);
    if (p.r > R * 0.995) continue;
    const [r2, g2, b2] = bvToRgb(s.ci);
    const st = magToStyle(s.mag);
    view.push({ x: cx + p.x, y: cy + p.y, r: st.r, a: st.a * dim, c: `rgb(${r2},${g2},${b2})`, mag: s.mag, name: s.zh || (s.n || '') });
  }

  // 5. 星座连线
  ctx.lineWidth = 0.8;
  for (const c of byHip) {
    const pts = new Map();
    let any = false;
    for (const [ai, bi] of c.segIdx) {
      let A = pts.get(ai);
      if (A === undefined) {
        const h = eqToHoriz(stars[ai].ra * 15, stars[ai].dec, lst, lat);
        if (h.alt <= 0) continue;
        const p = altazToXY(h.alt, h.az, R);
        A = { x: cx + p.x, y: cy + p.y };
        pts.set(ai, A);
      }
      let B = pts.get(bi);
      if (B === undefined) {
        const h = eqToHoriz(stars[bi].ra * 15, stars[bi].dec, lst, lat);
        if (h.alt <= 0) continue;
        const p = altazToXY(h.alt, h.az, R);
        B = { x: cx + p.x, y: cy + p.y };
        pts.set(bi, B);
      }
      ctx.strokeStyle = `rgba(140,165,210,${0.26 * dim})`;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      linesDrawn++;
      any = true;
    }
    // 6. 星座中文标签（可见连线星质心）
    if (any && opts.showLabels !== false && c.zh) {
      let sx = 0, sy = 0;
      pts.forEach(p => { sx += p.x; sy += p.y; });
      sx /= pts.size; sy /= pts.size;
      if (Math.hypot(sx - cx, sy - cy) < R * 0.94) {
        ctx.fillStyle = `rgba(198,210,232,${0.5 * dim})`;
        ctx.font = `10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.zh, sx, sy);
        labelsDrawn++;
      }
    }
  }

  // 7. 恒星（亮星先画：光晕 + 十字芒）
  view.sort((a, b) => b.mag - a.mag);
  for (const s of view) {
    if (s.mag <= 1.7) {
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 7);
      glow.addColorStop(0, `rgba(255,250,240,${0.28 * dim})`);
      glow.addColorStop(1, 'rgba(255,250,240,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(s.x - s.r * 7, s.y - s.r * 7, s.r * 14, s.r * 14);
      ctx.strokeStyle = `rgba(245,243,252,${0.5 * s.a})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      const L = s.r * 3.2;
      ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y);
      ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = s.c;
    ctx.globalAlpha = s.a;
    ctx.fill();
    ctx.globalAlpha = 1;
    starsDrawn++;
    if (opts.showStarLabels && s.mag <= 1.5 && s.name) {
      ctx.fillStyle = `rgba(226,232,248,${0.55 * dim})`;
      ctx.font = `9px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.name, s.x + s.r + 3, s.y);
    }
  }

  return { starsDrawn, linesDrawn, labelsDrawn };
}

export default { ensureCatalog, render, gmstDeg, eqToHoriz, galToEq, altazToXY };
