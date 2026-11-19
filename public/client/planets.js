// 低精度行星/月球历表（全离线）：JPL 近似开普勒根数 + 截断 ELP2000 月球理论
// 精度：行星 ~1′，月球 ~0.01°，数十年内足够肉眼观测与天象预报
const D2R = Math.PI / 180;
const OBL = 23.43929111; // J2000 黄赤交角

// JPL Keplerian Elements for Approximate Positions of the Major Planets（J2000，每世纪变化率）
// a(AU) e I(°) L(°) ϖ(°) Ω(°) 及对应速率；H = 绝对星等 V(1,0)
const ELEM = {
  mercury: { a:0.38709927, ad:0.00000037,   e:0.20563593, ed:0.00001906,  I:7.00497902,  Id:-0.00594749, L:252.25032350, Ld:149472.67411175, w:77.45779628,  wd:0.16047689,  O:48.33076593,  Od:-0.12534081, H:-0.613 },
  venus:   { a:0.72333566, ad:0.00000390,   e:0.00677672, ed:-0.00004107, I:3.39467605,  Id:-0.00078890, L:181.97909950, Ld:58517.81538729,  w:131.60246718, wd:0.00268329,  O:76.67984255,  Od:-0.27769418, H:-4.384 },
  earth:   { a:1.00000261, ad:0.00000562,   e:0.01671123, ed:-0.00004392, I:-0.00001531, Id:-0.01294668, L:100.46457166, Ld:35999.37244981,  w:102.93768193, wd:0.32327364,  O:0.0,          Od:0.0,         H:0 },
  mars:    { a:1.52371034, ad:0.00001847,   e:0.09339410, ed:0.00007882,  I:1.84969142,  Id:-0.00813131, L:-4.55343205,  Ld:19140.30268499,  w:-23.94362959, wd:0.44441088,  O:49.55953891,  Od:-0.29257343, H:-1.601 },
  jupiter: { a:5.20288700, ad:-0.00011607,  e:0.04838624, ed:-0.00013253, I:1.30439695,  Id:-0.00183714, L:34.39644051,  Ld:3034.74612775,   w:14.72847983,  wd:0.21252668,  O:100.47390909, Od:0.20469106,  H:-9.395 },
  saturn:  { a:9.53667594, ad:-0.00125060,  e:0.05386179, ed:-0.00050991, I:2.48599187,  Id:0.00193609,  L:49.95424423,  Ld:1222.49362201,   w:92.59887831,  wd:-0.41897216, O:113.66242448, Od:-0.28867794, H:-8.914 },
};

export const PLANET_INFO = {
  mercury: { name: '水星', en: 'Mercury', color: '#b9bccb', blurb: '离太阳最近的世界。没有大气层，昼夜温差近 600°C。它以信使之神命名——轨道上跑得最快的那一个。' },
  venus:   { name: '金星', en: 'Venus',   color: '#ffe3b0', blurb: '地球的孪生姐妹，却走向另一个极端：92 倍大气压、460°C 的硫酸云。以爱与美之神命名，是夜空里最亮的行星。' },
  mars:    { name: '火星', en: 'Mars',    color: '#ff8f66', blurb: '红色来自遍布地表的氧化铁。四代火星车已经在那里行驶，下一批踏上它的将是人类。' },
  jupiter: { name: '木星', en: 'Jupiter', color: '#edd3a7', blurb: '太阳系最大的行星，质量超过其余行星总和的 2.5 倍。大红斑是一场刮了三百多年的风暴，能装下整个地球。' },
  saturn:  { name: '土星', en: 'Saturn',  color: '#f2ddb0', blurb: '光环由数十亿块冰与岩石组成，最薄处仅约十米。1610 年，伽利略把它画成了「有耳朵的行星」。' },
  moon:    { name: '月球', en: 'Moon',    color: '#f4f1e8', blurb: '距离 38 万公里，人类唯一踏足过的地外世界。阿波罗计划带回的 382 公斤月岩，至今仍在实验室里被研究。' },
};

function toJulian(date) {
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() + date.getUTCHours() / 24 + date.getUTCMinutes() / 1440 + date.getUTCSeconds() / 86400;
  if (m <= 2) { y--; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
function fromJulian(jd) {
  const Z = Math.floor(jd + 0.5);
  const F = jd + 0.5 - Z;
  let A = Z;
  if (Z >= 2299161) { const a = Math.floor((Z - 1867216.25) / 36524.25); A = Z + 1 + a - Math.floor(a / 4); }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + F;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  return new Date(Date.UTC(year, month - 1, Math.floor(day), Math.floor((day % 1) * 24), Math.floor(((day * 24) % 1) * 60), Math.floor((((day * 1440) % 1) * 60) + 0.5)));
}

export function gmstDeg(date) {
  const jd = toJulian(date);
  const T = (jd - 2451545.0) / 36525;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((g % 360) + 360) % 360;
}

// 相位角修正（Meeus ch.41）：内行星相位效应显著，简单 H+5log(rΔ) 在内合附近偏差可达 3 等
const PHASE_CORR = {
  mercury: (a) => 0.0380 * a - 0.000273 * a * a + 0.000002 * a * a * a,
  venus: (a) => 0.0009 * a + 0.000239 * a * a - 0.00000065 * a * a * a,
  mars: (a) => 0.016 * a,
  jupiter: (a) => 0.005 * a,
  saturn: (a) => 0.044 * a,
};

// 日心黄道直角坐标（AU）
function helioEcl(id, T) {
  const p = ELEM[id];
  const a = p.a + p.ad * T, e = p.e + p.ed * T;
  const I = (p.I + p.Id * T) * D2R;
  const L = (p.L + p.Ld * T) * D2R;
  const w = (p.w + p.wd * T) * D2R;
  const O = (p.O + p.Od * T) * D2R;
  const M = L - w;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 4; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const om = w - O;
  const cw = Math.cos(om), sw = Math.sin(om), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp,
  };
}

// 太阳地心黄经（度）
export function sunLon(date) {
  const T = (toJulian(date) - 2451545.0) / 36525;
  const ea = helioEcl('earth', T);
  return (Math.atan2(ea.y, ea.x) / D2R + 180 + 360) % 360;
}

// 行星地心赤道坐标：ra/dec(度)、dist(AU)、r(AU 日心距)、mag(近似视星等)
export function planetPos(date, id) {
  const jd = toJulian(date);
  const T = (jd - 2451545.0) / 36525;
  const pl = helioEcl(id, T), ea = helioEcl('earth', T);
  const x = pl.x - ea.x, y = pl.y - ea.y, z = pl.z - ea.z;
  const cO = Math.cos(OBL * D2R), sO = Math.sin(OBL * D2R);
  const yeq = y * cO - z * sO, zeq = y * sO + z * cO;
  const dist = Math.hypot(x, y, z);
  const r = Math.hypot(pl.x, pl.y, pl.z);
  const re = Math.hypot(ea.x, ea.y, ea.z);
  const cosA = Math.max(-1, Math.min(1, (r * r + dist * dist - re * re) / (2 * r * dist)));
  const alpha = Math.acos(cosA) / D2R;
  return {
    ra: ((Math.atan2(yeq, x) / D2R) + 360) % 360,
    dec: Math.asin(Math.max(-1, Math.min(1, zeq / dist))) / D2R,
    dist, r,
    mag: ELEM[id].H + 5 * Math.log10(r * dist) + PHASE_CORR[id](alpha),
  };
}

// 月球地心赤道坐标（截断 ELP2000，Meeus ch.47 主项）
export function moonPos(date) {
  const T = (toJulian(date) - 2451545.0) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
  const D  = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
  const M  = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
  const F  = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T;
  const s = (x) => Math.sin(x * D2R);
  const l = Lp
    + 6.288774 * s(Mp) + 1.274027 * s(2 * D - Mp) + 0.658314 * s(2 * D) + 0.213618 * s(2 * Mp)
    - 0.185116 * s(M) - 0.114332 * s(2 * F) + 0.058793 * s(2 * D - 2 * Mp) + 0.057066 * s(2 * D - M - Mp)
    + 0.053322 * s(2 * D + Mp) + 0.045758 * s(2 * D - M) + 0.040923 * s(M - Mp) - 0.034720 * s(D)
    - 0.030383 * s(M + Mp) + 0.015327 * s(2 * D - 2 * F);
  const b = 5.128122 * s(F) + 0.280602 * s(Mp + F) + 0.277693 * s(M - F) + 0.173237 * s(2 * D - F)
    + 0.055413 * s(2 * D + F - Mp) + 0.046272 * s(2 * D - F - Mp) + 0.032573 * s(2 * D + F)
    + 0.017198 * s(2 * Mp + F) + 0.009267 * s(2 * D + Mp - F);
  const distKm = 385000.56 + 20905.355 * Math.cos(Mp * D2R) + 3699.111 * Math.cos((2 * D - Mp) * D2R)
    + 2955.968 * Math.cos(2 * D * D2R) + 569.925 * Math.cos(2 * Mp * D2R) + 48.888 * Math.cos(M * D2R);
  const cO = Math.cos(OBL * D2R), sO = Math.sin(OBL * D2R);
  const lb = l * D2R, bb = b * D2R;
  const xe = Math.cos(bb) * Math.cos(lb);
  const ye = Math.cos(bb) * Math.sin(lb) * cO - Math.sin(bb) * sO;
  const ze = Math.cos(bb) * Math.sin(lb) * sO + Math.sin(bb) * cO;
  const age = (l - sunLon(date) + 360) % 360;
  return {
    ra: ((Math.atan2(ye, xe) / D2R) + 360) % 360,
    dec: Math.asin(Math.max(-1, Math.min(1, ze))) / D2R,
    distKm, age,
    illum: (1 - Math.cos(age * D2R)) / 2,
  };
}

// 升/中天/落（迭代 3 次收敛）：返回 Date；h0 默认 -0.5667°（折射+视半径），月球用 +0.125°
export function riseSet(dateRef, getPos, lat, lon, h0 = -0.5667) {
  const jd0 = toJulian(dateRef);
  const lst0 = gmstDeg(dateRef) + lon;
  const sidereal = 360.98564736629; // 恒星日角速度 °/天
  let pos = getPos(dateRef);
  const cosH0 = () => {
    const p = pos;
    return (Math.sin(h0 * D2R) - Math.sin(lat * D2R) * Math.sin(p.dec * D2R)) / (Math.cos(lat * D2R) * Math.cos(p.dec * D2R));
  };
  let cH0 = cosH0();
  if (cH0 > 1) return { up: false, alwaysDown: true, transit: null, rise: null, set: null };
  if (cH0 < -1) return { up: true, circumpolar: true, transit: null, rise: null, set: null };
  let transit = jd0 + (((pos.ra - lst0 + 360) % 360) / sidereal);
  let H0 = Math.acos(cH0) / D2R;
  let rise = transit - H0 / sidereal, set = transit + H0 / sidereal;
  for (let i = 0; i < 3; i++) {
    pos = getPos(fromJulian(transit));
    transit = jd0 + (((pos.ra - lst0 + 360) % 360) / sidereal);
    pos = getPos(fromJulian(rise));
    H0 = Math.acos(cosH0()) / D2R;
    rise = transit - H0 / sidereal;
    pos = getPos(fromJulian(set));
    H0 = Math.acos(cosH0()) / D2R;
    set = transit + H0 / sidereal;
  }
  return { up: true, transit: fromJulian(transit), rise: fromJulian(rise), set: fromJulian(set) };
}

// 今夜可见行星（观测地当晚 21:00 前后）：按亮度排序
export function visiblePlanets(date, lat, lon) {
  const list = [];
  for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn']) {
    const p = planetPos(date, id);
    const rs = riseSet(date, (d) => planetPos(d, id), lat, lon);
    if (!rs.up) continue;
    // 在 21:00 当地时是否在地平线上（粗略：用当日中天时刻附近判断）
    const dusk = new Date(date); dusk.setHours(21, 0, 0, 0);
    const at = planetPos(dusk, id);
    const lst = gmstDeg(dusk) + lon;
    const H = (((lst - at.ra) % 360) + 540) % 360 - 180;
    const alt = Math.asin(Math.sin(lat * D2R) * Math.sin(at.dec * D2R) + Math.cos(lat * D2R) * Math.cos(at.dec * D2R) * Math.cos(H * D2R)) / D2R;
    if (alt < -4) continue; // 21 点已在地平线下 → 今夜不可见
    list.push({ id, ...PLANET_INFO[id], mag: +p.mag.toFixed(1), alt: +alt.toFixed(0), rise: rs.rise, set: rs.set, dist: +p.dist.toFixed(2) });
  }
  return list.sort((a, b) => a.mag - b.mag);
}

// 角距离（度）
export function angularSep(ra1, dec1, ra2, dec2) {
  const d = (ra2 - ra1) * D2R;
  const s1 = Math.sin(dec1 * D2R), c1 = Math.cos(dec1 * D2R);
  const s2 = Math.sin(dec2 * D2R), c2 = Math.cos(dec2 * D2R);
  const A = s1 * s2 + c1 * c2 * Math.cos(d);
  const B = c1 * c2 * Math.sin(d);
  const C = c1 * s2 - s1 * c2 * Math.cos(d);
  return Math.atan2(Math.hypot(B, C), A) / D2R;
}

// 未来 days 天内的合相事件：行星-行星 <3°，月-行星 <4°（每 6 小时采样）
export function conjunctions(date0, days) {
  const jd0 = toJulian(date0);
  const evs = [];
  const pairs = [];
  const ids = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j], 3]);
  for (const id of ids) pairs.push(['moon', id, 4]);
  for (let k = 0; k <= days * 4; k++) {
    const t = fromJulian(jd0 + k * 0.25);
    for (const [a, b, lim] of pairs) {
      const pa = a === 'moon' ? moonPos(t) : planetPos(t, a);
      const pb = planetPos(t, b);
      const sep = angularSep(pa.ra, pa.dec, pb.ra, pb.dec);
      if (sep < lim) {
        const key = a + '-' + b;
        const prev = evs.find(e => e.key === key);
        if (!prev || sep < prev.sep) {
          const item = { key, a, b, sep: +sep.toFixed(2), date: new Date(t), lim };
          if (!prev) evs.push(item); else Object.assign(prev, item);
        }
      }
    }
  }
  return evs.sort((x, y) => x.date - y.date);
}

// 月相角（月-日黄经差，0°=新月 180°=满月）
export function phaseAngle(date) {
  const m = moonPos(date);
  return m.age;
}

// 下一次满月/新月（bisect 收敛到 0.01 天）：月龄单调递增，跨 360° 时按回跳检测包裹
export function nextFullNewMoon(date0, target, maxDays = 42) {
  const f = (t) => phaseAngle(t);
  const t0 = toJulian(date0);
  let prev = f(fromJulian(t0));
  let found = null;
  for (let k = 1; k <= maxDays * 4; k++) {
    const cur = f(fromJulian(t0 + k * 0.25));
    if ((prev < target && cur >= target) || cur < prev - 180) { found = [t0 + (k - 1) * 0.25, t0 + k * 0.25]; break; }
    prev = cur;
  }
  if (!found) return null;
  let lo = found[0], hi = found[1];
  const raw = (t) => f(fromJulian(t));
  const tgt = raw(lo) > raw(hi) ? target + 360 : target; // 区间内发生 360° 包裹
  let flo = raw(lo) - tgt, fhi = raw(hi) - tgt;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2, fm = raw(mid) - tgt;
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return { type: target === 0 ? 'new' : 'full', date: fromJulian((lo + hi) / 2) };
}

export default {
  PLANET_INFO, planetPos, moonPos, sunLon, riseSet, visiblePlanets,
  angularSep, conjunctions, phaseAngle, nextFullNewMoon, gmstDeg,
};
