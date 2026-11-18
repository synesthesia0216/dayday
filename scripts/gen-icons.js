// Generate minimal app icons (gold circle on dark bg)
const fs = require('fs');

function createPNG(size) {
  // Minimal PNG: dark bg with a gold circle (simple 1-bit style)
  const buf = Buffer.alloc(size * size * 4 + 1000);
  let pos = 0;

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  sig.copy(buf, pos); pos += 8;

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    len.copy(buf, pos); pos += 4;
    const typeB = Buffer.from(type, 'ascii');
    typeB.copy(buf, pos); pos += 4;
    data.copy(buf, pos); pos += data.length;
    const crc = crc32(Buffer.concat([typeB, data]));
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc, 0);
    crcB.copy(buf, pos); pos += 4;
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunk('IHDR', ihdr);

  // IDAT - raw pixel data (filtered, uncompressed)
  const rawData = [];
  const cx = size / 2, cy = size / 2, r = size * 0.38, r2 = size * 0.14;
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dist2 = Math.sqrt((x - cx + r * 0.3) * (x - cx + r * 0.3) + (y - cy + r * 0.2) * (y - cy + r * 0.2));
      if (dist < r) {
        if (dist2 < r2) {
          // Darker inner (crescent shadow)
          rawData.push(26, 24, 18, 255);
        } else {
          // Gold
          rawData.push(201, 169, 110, 255);
        }
      } else if (dist < r + 2) {
        // Anti-alias edge
        const alpha = Math.round(255 * (1 - (dist - r) / 2));
        rawData.push(201, 169, 110, alpha);
      } else {
        // Dark background
        rawData.push(8, 9, 11, 255);
      }
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  chunk('IDAT', compressed);

  // IEND
  chunk('IEND', Buffer.alloc(0));

  return buf.slice(0, pos);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const outDir = __dirname + '/../public/icons';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(outDir + '/icon-192.png', createPNG(192));
fs.writeFileSync(outDir + '/icon-512.png', createPNG(512));
console.log('Icons generated at', outDir);
