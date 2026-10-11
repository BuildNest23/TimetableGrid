import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createPng(width, height, drawFn) {
  // buffer of RGBA
  const rowLength = width * 4 + 1; // 1 filter byte per row
  const rawData = Buffer.alloc(height * rowLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter type None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // CRC32 implementation
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = data.length;
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(len, 0);

    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);

    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function drawIcon(x, y, w, h, isMaskable = false) {
  // Normalized 0 to 1
  const nx = x / w;
  const ny = y / h;

  // Background gradient: Emerald pine (#1B4D3E to #2D7A58)
  const grad = nx * 0.4 + ny * 0.6;
  const bgR = Math.round(27 + grad * 18);
  const bgG = Math.round(77 + grad * 45);
  const bgB = Math.round(62 + grad * 26);

  // If not maskable, round corners
  if (!isMaskable) {
    const rx = Math.min(nx, 1 - nx) * w;
    const ry = Math.min(ny, 1 - ny) * h;
    const radius = w * 0.22;
    if (rx < radius && ry < radius) {
      const dist = Math.hypot(radius - rx, radius - ry);
      if (dist > radius) {
        return [0, 0, 0, 0]; // Transparent outside squircle
      }
    }
  }

  // Draw inner grid icon (centered)
  const safeMargin = isMaskable ? 0.22 : 0.16;
  if (nx >= safeMargin && nx <= 1 - safeMargin && ny >= safeMargin && ny <= 1 - safeMargin) {
    const gx = (nx - safeMargin) / (1 - safeMargin * 2);
    const gy = (ny - safeMargin) / (1 - safeMargin * 2);

    // Header bar
    if (gy <= 0.22) {
      return [255, 255, 255, 245];
    }

    // Grid slots
    const col = Math.floor(gx * 3);
    const row = Math.floor((gy - 0.26) / 0.24);
    const inColMargin = (gx * 3) % 1 > 0.12 && (gx * 3) % 1 < 0.88;
    const inRowMargin = ((gy - 0.26) / 0.24) % 1 > 0.12 && ((gy - 0.26) / 0.24) % 1 < 0.88;

    if (row >= 0 && row < 3 && inColMargin && inRowMargin) {
      if (col === 1 && row === 1) {
        // Accent slot
        return [251, 240, 217, 245];
      }
      if (col === 2 && row === 0) {
        // Light blue slot
        return [232, 240, 247, 245];
      }
      return [255, 255, 255, 235];
    }
  }

  return [bgR, bgG, bgB, 255];
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 192x192
const p192 = createPng(192, 192, (x, y, w, h) => drawIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), p192);

// 512x512
const p512 = createPng(512, 512, (x, y, w, h) => drawIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), p512);

// Maskable 512x512
const pMask = createPng(512, 512, (x, y, w, h) => drawIcon(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pMask);

// Apple touch icon 180x180
const pApple = createPng(180, 180, (x, y, w, h) => drawIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pApple);

// Favicon 64x64
const pFavicon = createPng(64, 64, (x, y, w, h) => drawIcon(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), pFavicon);

console.log('Icons generated successfully.');
