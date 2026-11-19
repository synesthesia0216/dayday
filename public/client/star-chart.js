// ====== Day-Day 星空渲染引擎 ======
// 真实恒星目录(HYG v41) + 星座连线(Stellarium modern) → 地平坐标 → 天顶立体投影 canvas
// 底图：ESO/S. Brunier 全天天文摄影全景（milkyway_eso.jpg，银道坐标等距圆柱投影）
// 数据：public/data/stars.json / constellations.json / milkyway_eso.jpg

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

// J2000 赤道坐标(度) → 银道坐标(l,b 度)：gal = GAL_ROT · eq
function eqToGal(raDeg, decDeg) {
  const ra = raDeg * D2R, dec = decDeg * D2R;
  const ex = Math.cos(dec) * Math.cos(ra), ey = Math.cos(dec) * Math.sin(ra), ez = Math.sin(dec);
  const gx = GAL_ROT[0][0] * ex + GAL_ROT[0][1] * ey + GAL_ROT[0][2] * ez;
  const gy = GAL_ROT[1][0] * ex + GAL_ROT[1][1] * ey + GAL_ROT[1][2] * ez;
  const gz = GAL_ROT[2][0] * ex + GAL_ROT[2][1] * ey + GAL_ROT[2][2] * ez;
  const l = (Math.atan2(gy, gx) / D2R + 360) % 360;
  const b = Math.asin(Math.max(-1, Math.min(1, gz))) / D2R;
  return { l, b };
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

// ====== 照片级星空底图（ESO/S. Brunier 全天全景） ======
// 全景为银道坐标等距圆柱投影：x=(0.5+l/360)·W，y=(0.5−b/180)·H，l 自左向右、北朝上
// （投影方向经亮星点源实测校准：Arcturus/Antares/Fomalhaut 预测点与照片星点重合）
let texPromise = null;
function ensureTexture() {
  if (texPromise) return texPromise;
  texPromise = new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const TW = 2048, TH = 1024;
        const c = document.createElement('canvas');
        c.width = TW; c.height = TH;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, TW, TH);
        resolve({ data: cx.getImageData(0, 0, TW, TH).data, w: TW, h: TH });
      } catch (e) { console.warn('星空底图解码失败', e); resolve(null); }
    };
    img.onerror = () => { console.warn('星空底图加载失败'); resolve(null); };
    img.src = 'data/milkyway_eso.jpg';
  });
  return texPromise;
}

// 赤道坐标 → 底图像素（双线性采样，供外部对齐校验）
function sampleTexture(tex, raDeg, decDeg) {
  const g = eqToGal(raDeg, decDeg);
  const tx = ((0.5 + g.l / 360) * tex.w) % tex.w;
  const ty = (0.5 - g.b / 180) * tex.h;
  const x0 = Math.floor(tx), y0 = Math.min(tex.h - 1, Math.floor(ty));
  const fx = tx - x0, fy = ty - y0;
  const x1 = (x0 + 1) % tex.w;
  const y1 = Math.min(tex.h - 1, y0 + 1);
  const d = tex.data;
  const i00 = (y0 * tex.w + x0) * 4, i10 = (y0 * tex.w + x1) * 4, i01 = (y1 * tex.w + x0) * 4, i11 = (y1 * tex.w + x1) * 4;
  const out = [];
  for (let c = 0; c < 3; c++) {
    const v = (d[i00 + c] * (1 - fx) + d[i10 + c] * fx) * (1 - fy) + (d[i01 + c] * (1 - fx) + d[i11 + c] * fx) * fy;
    out.push(v);
  }
  return out;
}

// 把全景按当前观测位置+时间重投影到天顶立体圆内（低分辨率逐像素重投影，放大贴回）
async function drawSkyTexture(ctx, opts, lst) {
  const tex = await ensureTexture();
  if (!tex) return false;
  const { lat, cx, cy } = opts;
  const R = opts.radius;
  const M = Math.max(96, Math.round(R));
  const map = document.createElement('canvas');
  map.width = M; map.height = M;
  const mctx = map.getContext('2d', { willReadFrequently: true });
  const img = mctx.createImageData(M, M);
  const d = img.data;
  const sinLat = Math.sin(lat * D2R), cosLat = Math.cos(lat * D2R);
  const scale = 0.62 * (opts.dim ?? 1);
  const tw = tex.w, th = tex.h, td = tex.data;
  for (let j = 0; j < M; j++) {
    const dy = j + 0.5 - M / 2;
    for (let i = 0; i < M; i++) {
      const dx = i + 0.5 - M / 2;
      const r = Math.hypot(dx, dy);
      const k = (j * M + i) * 4;
      if (r > R - 2) continue;
      const z = 2 * Math.atan2(r, R);
      const alt = 90 - z / D2R;
      if (alt <= 0.5) continue;
      const az = Math.atan2(dx, -dy);
      const sinAlt = Math.sin(alt * D2R), cosAlt = Math.cos(alt * D2R);
      const sinDec = sinLat * sinAlt + cosLat * cosAlt * Math.cos(az);
      const dec = Math.asin(Math.max(-1, Math.min(1, sinDec))) / D2R;
      const H = Math.atan2(-cosAlt * Math.sin(az), sinAlt * cosLat - cosAlt * sinLat * Math.cos(az));
      const ra = ((lst - H / D2R) % 360 + 360) % 360;
      const g = eqToGal(ra, dec);
      const tx = ((0.5 + g.l / 360) * tw) % tw;
      const ty = (0.5 - g.b / 180) * th;
      const x0 = Math.floor(tx), y0 = Math.min(th - 1, Math.floor(ty));
      const fx = tx - x0, fy = ty - y0;
      const x1 = (x0 + 1) % tw;
      const y1 = Math.min(th - 1, y0 + 1);
      const i00 = (y0 * tw + x0) * 4, i10 = (y0 * tw + x1) * 4, i01 = (y1 * tw + x0) * 4, i11 = (y1 * tw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const v = (td[i00 + c] * (1 - fx) + td[i10 + c] * fx) * (1 - fy) + (td[i01 + c] * (1 - fx) + td[i11 + c] * fx) * fy;
        d[k + c] = Math.min(255, v * scale);
      }
      d[k + 3] = 255;
    }
  }
  mctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.95;
  ctx.drawImage(map, cx - R, cy - R, R * 2, R * 2);
  ctx.globalAlpha = 1;
  return true;
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
  const consDrawn = [];
  const highlight = opts.highlight || [];

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

  // 2. 照片级星空底图（ESO 全景重投影）；不可用时回退程序化银河带
  let texDrawn = false;
  if (opts.showTexture !== false) {
    try { texDrawn = await drawSkyTexture(ctx, opts, lst); } catch (e) { texDrawn = false; }
  }
  if (!texDrawn && opts.showMilkyWay !== false) {
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
        consDrawn.push({ zh: c.zh, en: c.en || '', x: sx, y: sy });
        const lit = highlight.includes(c.zh) || highlight.includes(c.en);
        ctx.fillStyle = lit ? `rgba(214,180,122,${0.85 * dim})` : `rgba(198,210,232,${0.5 * dim})`;
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

  return { starsDrawn, linesDrawn, labelsDrawn, constellations: consDrawn };
}

export default {
  ensureCatalog, render, gmstDeg, eqToHoriz, galToEq, eqToGal, altazToXY,
  // 测试/对齐校验：赤道坐标(度) → 底图 RGB（底图未就绪返回 null）
  sampleSky: async (raDeg, decDeg) => { const tex = await ensureTexture(); return tex ? sampleTexture(tex, raDeg, decDeg) : null; },
};
