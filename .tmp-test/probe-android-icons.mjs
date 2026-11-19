// 校验生成的 Android 图标 PNG：满月居中、前景透明、圆角透明、背景层无月
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const RES = 'e:/Web/nox/android/app/src/main/res';

// 极简 PNG 解码（RGBA8，非隔行；本脚本 PNG 均为 canvas 产物）
function decodePng(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not png: ' + path);
  let off = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') { w = b.readUInt32BE(off + 8); h = b.readUInt32BE(off + 12); bitDepth = b[off + 16]; colorType = b[off + 17]; }
    else if (type === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error(`unsupported ${path}: depth=${bitDepth} color=${colorType}`);
  const z = inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : 3;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = z[y * (stride + 1)];
    const row = z.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const raw = row[i];
      const a = i >= ch ? prev[i - ch] : 0, b2 = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let p;
      switch (f) {
        case 0: p = raw; break;
        case 1: p = raw + a; break;
        case 2: p = raw + b2; break;
        case 3: p = raw + ((a + b2) >> 1); break;
        case 4: { const q = a + b2 - c; const pa = Math.abs(q - a), pb = Math.abs(q - b2), pc = Math.abs(q - c); p = raw + (pa <= pb && pa <= pc ? a : pb <= pc ? b2 : c); break; }
        default: throw new Error('bad filter ' + f);
      }
      prev[i] = p & 255;
      out[y * stride + i] = prev[i];
    }
  }
  return { w, h, data: out };
}

function probe(rel, checks) {
  const { w, h, data } = decodePng(`${RES}/${rel}`);
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const lum = (x, y) => { const [r, g, b] = px(x, y); return 0.299 * r + 0.587 * g + 0.114 * b; };
  console.log(rel, JSON.stringify(checks({ w, h, px, lum })));
}

// 1) 传统图标：满月 → 中心亮、四角有背景（暗色但非透明）
probe('mipmap-xxxhdpi/ic_launcher.png', ({ w, h, px, lum }) => {
  const c = lum(w >> 1, h >> 1);
  const corner = px(2, 2);
  let bright = 0;
  for (let i = 0; i < w * h; i++) { if (lum(i % w, (i / w) | 0) > 100) bright++; }
  return { centerLum: Math.round(c), brightPx: bright, cornerRGBA: corner };
});

// 2) 圆形图标：角落应透明
probe('mipmap-xxxhdpi/ic_launcher_round.png', ({ w, h, px }) => {
  return { cornerAlpha: px(2, 2)[3], edgeMidAlpha: px(w >> 1, 2)[3] };
});

// 3) 自适应前景：中心亮（月面）、四角透明
probe('mipmap-xxxhdpi/ic_launcher_foreground.png', ({ w, h, px, lum }) => {
  return { centerLum: Math.round(lum(w >> 1, h >> 1)), cornerAlpha: px(3, 3)[3] };
});

// 4) 自适应背景：无月 → 中心应是暗背景亮度、四角不透明、有星点
probe('mipmap-xxxhdpi/ic_launcher_background.png', ({ w, h, px, lum }) => {
  let bright = 0;
  for (let i = 0; i < w * h; i++) { if (lum(i % w, (i / w) | 0) > 90) bright++; }
  return { centerLum: Math.round(lum(w >> 1, h >> 1)), cornerAlpha: px(3, 3)[3], brightPx: bright };
});

// 5) 小尺寸传统图标：48px 也应是亮月
probe('mipmap-mdpi/ic_launcher.png', ({ w, h, lum }) => {
  return { centerLum: Math.round(lum(w >> 1, h >> 1)), size: w + 'x' + h };
});
