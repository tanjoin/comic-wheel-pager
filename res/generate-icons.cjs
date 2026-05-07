const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })());
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function setPixel(buf, size, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function fillRect(buf, size, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(buf, size, xx, yy, ...color);
  }
}

function strokeRect(buf, size, x, y, w, h, t, color) {
  fillRect(buf, size, x, y, w, t, color);
  fillRect(buf, size, x, y + h - t, w, t, color);
  fillRect(buf, size, x, y, t, h, color);
  fillRect(buf, size, x + w - t, y, t, h, color);
}

function fillCircle(buf, size, cx, cy, rad, color) {
  const r2 = rad * rad;
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, size, x, y, ...color);
    }
  }
}

function strokeCircle(buf, size, cx, cy, rad, t, color) {
  const r2 = rad * rad;
  const ir2 = (rad - t) * (rad - t);
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2 && d2 >= ir2) setPixel(buf, size, x, y, ...color);
    }
  }
}

function drawLine(buf, size, x0, y0, x1, y1, color, t = 1) {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    for (let oy = -Math.floor(t / 2); oy <= Math.floor(t / 2); oy++) {
      for (let ox = -Math.floor(t / 2); ox <= Math.floor(t / 2); ox++) setPixel(buf, size, x0 + ox, y0 + oy, ...color);
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function drawArrow(buf, size, x, y, dir, s, color) {
  const barH = Math.max(1, Math.floor(s * 0.28));
  if (dir === 'right') {
    fillRect(buf, size, x, y + Math.floor(s * 0.36), Math.floor(s * 0.58), barH, color);
    drawLine(buf, size, x + Math.floor(s * 0.52), y, x + s, y + Math.floor(s * 0.5), color, Math.max(1, Math.floor(s * 0.2)));
    drawLine(buf, size, x + Math.floor(s * 0.52), y + s, x + s, y + Math.floor(s * 0.5), color, Math.max(1, Math.floor(s * 0.2)));
  } else {
    fillRect(buf, size, x + Math.floor(s * 0.42), y + Math.floor(s * 0.36), Math.floor(s * 0.58), barH, color);
    drawLine(buf, size, x + Math.floor(s * 0.48), y, x, y + Math.floor(s * 0.5), color, Math.max(1, Math.floor(s * 0.2)));
    drawLine(buf, size, x + Math.floor(s * 0.48), y + s, x, y + Math.floor(s * 0.5), color, Math.max(1, Math.floor(s * 0.2)));
  }
}

function makeIcon(size) {
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = y / (size - 1 || 1);
      const r = Math.round(20 + 18 * t);
      const g = Math.round(95 + 65 * t);
      const b = Math.round(165 + 60 * t);
      setPixel(buf, size, x, y, r, g, b, 255);
    }
  }

  const u = size / 128;
  const pageX = Math.round(22 * u);
  const pageY = Math.round(14 * u);
  const pageW = Math.round(84 * u);
  const pageH = Math.round(76 * u);
  const border = Math.max(1, Math.round(4 * u));

  fillRect(buf, size, pageX, pageY, pageW, pageH, [246, 250, 255, 255]);
  strokeRect(buf, size, pageX, pageY, pageW, pageH, border, [18, 35, 62, 255]);

  const fold = Math.max(2, Math.round(18 * u));
  for (let i = 0; i < fold; i++) {
    for (let j = 0; j <= i; j++) setPixel(buf, size, pageX + pageW - 1 - i + j, pageY + j, 208, 221, 242, 255);
  }

  const lineT = Math.max(1, Math.round(3 * u));
  drawLine(buf, size, Math.round(34 * u), Math.round(33 * u), Math.round(92 * u), Math.round(33 * u), [52, 72, 104, 255], lineT);
  drawLine(buf, size, Math.round(34 * u), Math.round(46 * u), Math.round(88 * u), Math.round(46 * u), [52, 72, 104, 255], lineT);
  drawLine(buf, size, Math.round(34 * u), Math.round(59 * u), Math.round(82 * u), Math.round(59 * u), [52, 72, 104, 255], lineT);

  const wheelCx = Math.round(64 * u);
  const wheelCy = Math.round(97 * u);
  const wheelR = Math.max(2, Math.round(16 * u));
  fillCircle(buf, size, wheelCx, wheelCy, wheelR, [20, 40, 74, 255]);
  strokeCircle(buf, size, wheelCx, wheelCy, wheelR, Math.max(1, Math.round(3 * u)), [255, 255, 255, 255]);
  drawLine(buf, size, wheelCx, wheelCy - wheelR + Math.max(1, Math.round(3 * u)), wheelCx, wheelCy + wheelR - Math.max(1, Math.round(3 * u)), [255, 255, 255, 255], Math.max(1, Math.round(3 * u)));

  const arrowSize = Math.max(4, Math.round(14 * u));
  drawArrow(buf, size, Math.round(23 * u), Math.round(88 * u), 'left', arrowSize, [255, 230, 84, 255]);
  drawArrow(buf, size, Math.round(91 * u), Math.round(88 * u), 'right', arrowSize, [255, 230, 84, 255]);

  return buf;
}

function generate() {
  const root = process.cwd();
  const outputs = [
    path.join(root, 'public', 'img'),
    path.join(root, 'app', 'img'),
  ];

  for (const dir of outputs) fs.mkdirSync(dir, { recursive: true });

  for (const size of [16, 48, 128]) {
    const pixels = makeIcon(size);
    for (const dir of outputs) writePng(path.join(dir, `${size}.png`), size, size, pixels);
  }

  for (const dir of outputs) fs.copyFileSync(path.join(dir, '48.png'), path.join(dir, 'icon.png'));

  console.log('Generated icon files in public/img and app/img');
}

generate();
