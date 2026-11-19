// ====== Day-Day 真实月面渲染 ======
// NASA LRO LROC WAC 全月面纹理（lroc_color_2k.jpg）逐像素球面光照：
// 真实相位明暗界线（太阳方向由相位角决定）、界线柔化、临边昏暗、地照
// 纹理：NASA/GSFC LRO，公有领域

let texPromise = null;
function ensureTexture() {
  if (texPromise) return texPromise;
  texPromise = new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const TW = 1024, TH = 512;
        const c = document.createElement('canvas');
        c.width = TW; c.height = TH;
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, TW, TH);
        resolve({ data: cx.getImageData(0, 0, TW, TH).data, w: TW, h: TH });
      } catch (e) { console.warn('月面纹理解码失败', e); resolve(null); }
    };
    img.onerror = () => { console.warn('月面纹理加载失败'); resolve(null); };
    img.src = 'data/lroc_color_2k.jpg';
  });
  return texPromise;
}

function preloadMoonTexture() { ensureTexture().catch(() => {}); }

// moonData: { phase: 0-1 (0=朔 0.5=满), illumination: 0-100 }
async function renderMoon(canvas, moonData, sizePx) {
  const size = sizePx || 64;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  const tex = await ensureTexture();

  const r = size / 2 - 1;
  // 相位角：满月=0，朔=π；sin>0 时亮面朝东（屏幕右，盈）
  const theta = Math.PI * (1 - 2 * (moonData.phase ?? 0.5));
  const sx = Math.cos(theta), sy = Math.sin(theta);
  const k = Math.max(0, Math.min(1, moonData.illumination !== undefined ? moonData.illumination / 100 : (1 + Math.cos(theta)) / 2));
  const es = 0.085 * (1 - k) * (1 - k); // 地照（残月时暗面微光）

  ctx.clearRect(0, 0, size, size);
  const M = Math.round(size * dpr);
  const img = ctx.createImageData(M, M);
  const d = img.data;
  const tw = tex ? tex.w : 0, th = tex ? tex.h : 0, td = tex ? tex.data : null;
  const rd = r * dpr, half = M / 2;
  for (let j = 0; j < M; j++) {
    const dy = j + 0.5 - half;
    const row = j * M * 4;
    for (let i = 0; i < M; i++) {
      const dx = i + 0.5 - half;
      const dist = Math.hypot(dx, dy);
      if (dist > rd) continue;
      const rho = dist / rd;
      const nx = Math.sqrt(1 - rho * rho); // 朝向观察者
      const ny = dx / rd, nz = dy / rd;
      const cosL = nx * sx + ny * sy;
      const lit = Math.min(1, Math.max(0, (cosL + 0.10) / 0.20)); // 明暗界线柔化（地形粗糙）
      const limb = Math.pow(nx, 0.30); // 临边昏暗
      const dark = es * (0.55 + 0.45 * nx) * (1 - lit);
      let r8 = 205, g8 = 198, b8 = 186;
      if (td) {
        const lam = Math.atan2(ny, nx); // 月面经度（0=正面中心）
        const phi = Math.asin(Math.max(-1, Math.min(1, nz)));
        const tx = ((0.5 + lam / (2 * Math.PI)) * tw + tw) % tw;
        const ty = Math.max(0, Math.min(th - 1.001, (0.5 - phi / Math.PI) * th));
        const x0 = Math.floor(tx), y0 = Math.floor(ty);
        const fx = tx - x0, fy = ty - y0;
        const x1 = (x0 + 1) % tw;
        const y1 = Math.min(th - 1, y0 + 1);
        const i00 = (y0 * tw + x0) * 4, i10 = (y0 * tw + x1) * 4, i01 = (y1 * tw + x0) * 4, i11 = (y1 * tw + x1) * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        r8 = td[i00] * w00 + td[i10] * w10 + td[i01] * w01 + td[i11] * w11;
        g8 = td[i00 + 1] * w00 + td[i10 + 1] * w10 + td[i01 + 1] * w01 + td[i11 + 1] * w11;
        b8 = td[i00 + 2] * w00 + td[i10 + 2] * w10 + td[i01 + 2] * w01 + td[i11 + 2] * w11;
      }
      // 亮面随光照角增亮，暗面仅地照；界线处平滑过渡
      const t = limb * (0.35 * lit + 0.75 * lit * lit) + dark * (1 - lit);
      const k4 = row + i * 4;
      d[k4] = Math.min(255, r8 * t);
      d[k4 + 1] = Math.min(255, g8 * t);
      d[k4 + 2] = Math.min(255, b8 * t);
      d[k4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export default { renderMoon, preloadMoonTexture };
