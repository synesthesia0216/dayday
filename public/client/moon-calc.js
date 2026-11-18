// ====== Day-Day 月相计算 ======
// Meeus 天文算法本地计算 + api.farmsense.net 增强

const SYNODIC_MONTH = 29.53058867; // 平均朔望月（天）
const REF_NEW_MOON = 2451550.09765; // 参考新月 J2000: 2000-01-06 14:20:44 UT

const PHASE_NAMES = [
  { min: 0, max: 0.0625, e: '🌑', n: '朔月', en: 'New Moon' },
  { min: 0.0625, max: 0.1875, e: '🌒', n: '蛾眉月', en: 'Waxing Crescent' },
  { min: 0.1875, max: 0.3125, e: '🌓', n: '上弦月', en: 'First Quarter' },
  { min: 0.3125, max: 0.4375, e: '🌔', n: '盈凸月', en: 'Waxing Gibbous' },
  { min: 0.4375, max: 0.5625, e: '🌕', n: '满月', en: 'Full Moon' },
  { min: 0.5625, max: 0.6875, e: '🌖', n: '亏凸月', en: 'Waning Gibbous' },
  { min: 0.6875, max: 0.8125, e: '🌗', n: '下弦月', en: 'Last Quarter' },
  { min: 0.8125, max: 0.9375, e: '🌘', n: '残月', en: 'Waning Crescent' },
  { min: 0.9375, max: 1.0, e: '🌑', n: '朔月', en: 'New Moon' },
];

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
  if (Z >= 2299161) {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + F;
  let month = E - 1;
  if (month > 12) { month -= 12; }
  let year = C - 4716;
  if (month <= 2) { year++; }
  return new Date(Date.UTC(year, month - 1, Math.floor(day), (day % 1) * 24, ((day % 1) * 24 % 1) * 60));
}

function getPhase(date) {
  const jd = toJulian(date || new Date());
  const daysSinceNew = jd - REF_NEW_MOON;
  const phaseFraction = (daysSinceNew % SYNODIC_MONTH + SYNODIC_MONTH) % SYNODIC_MONTH;
  const age = phaseFraction; // moon age in days
  const illumination = ((1 - Math.cos(2 * Math.PI * phaseFraction / SYNODIC_MONTH)) / 2);
  const normalizedPhase = phaseFraction / SYNODIC_MONTH;

  let phase = PHASE_NAMES[0];
  for (const p of PHASE_NAMES) {
    if (normalizedPhase >= p.min && normalizedPhase < p.max) { phase = p; break; }
  }

  // Next full moon
  const daysToFull = (0.5 * SYNODIC_MONTH - phaseFraction + SYNODIC_MONTH) % SYNODIC_MONTH;
  const nextFullMoon = new Date(date.getTime() + daysToFull * 86400000);

  // Next new moon
  const daysToNew = (SYNODIC_MONTH - phaseFraction) % SYNODIC_MONTH;
  const nextNewMoon = new Date(date.getTime() + (daysToNew < 0.01 ? SYNODIC_MONTH : daysToNew) * 86400000);

  return {
    phase: normalizedPhase,
    grade: Math.floor(normalizedPhase * 28) % 28, // 28档细分（0=朔，14=满）
    age: Math.round(age * 100) / 100,
    illumination: Math.round(illumination * 1000) / 10,
    emoji: phase.e,
    name: phase.n,
    enName: phase.en,
    nextFullMoon: nextFullMoon.toISOString().slice(0, 10),
    nextNewMoon: nextNewMoon.toISOString().slice(0, 10),
    daysToFull: Math.round(daysToFull),
    daysToNew: Math.round(daysToNew < 0.01 ? SYNODIC_MONTH : daysToNew),
  };
}

// Try external API, fallback to local
async function getMoonPhase(cachedOnly = false) {
  // Try local first (always works)
  const local = getPhase(new Date());

  // Try farmsense API for richer data
  if (!cachedOnly && navigator.onLine) {
    try {
      const ts = Math.floor(Date.now() / 1000);
      const r = await fetch(`https://api.farmsense.net/v1/moonphases/?d=${ts}`);
      if (r.ok) {
        const data = await r.json();
        if (data && data.length && data[0].Phase !== undefined) {
          const api = data[0];
          return {
            ...local,
            illumination: Math.round(api.Illumination * 1000) / 10,
            age: api.Age,
            distance: api.Distance,
            apiName: api.MoonName || api.Phase,
          };
        }
      }
    } catch (e) {
      // Fallback to local silently
    }
  }
  return local;
}

// Export
const moonCalc = { getPhase, getMoonPhase, PHASE_NAMES };
export default moonCalc;
