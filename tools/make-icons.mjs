/**
 * Gera os PNGs de ícone da extensão sem dependências externas.
 * Uso: node tools/make-icons.mjs
 *
 * O desenho é definido em coordenadas normalizadas e amostrado com
 * supersampling 4x4, o que mantém as bordas legíveis já em 16px.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SIZES = [16, 32, 48, 128];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const WHITE = [255, 255, 255];
const DEEP = [26, 30, 84];

function insideRoundRect(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

function circle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) <= r;
}

/** Cor em [0,1]² — fundo indigo com uma lente e o indicador de gravação. */
function sample(x, y) {
  if (!insideRoundRect(x, y, 0.22)) return [0, 0, 0, 0];

  const t = (x + y) / 2;
  const bg = [
    Math.round(91 + (122 - 91) * t),
    Math.round(108 + (61 - 108) * t),
    Math.round(255 + (255 - 255) * t)
  ];

  if (circle(x, y, 0.76, 0.24, 0.075)) return [...WHITE, 255];
  if (circle(x, y, 0.5, 0.53, 0.135)) return [...DEEP, 255];
  if (circle(x, y, 0.5, 0.53, 0.27)) return [...WHITE, 255];
  return [...bg, 255];
}

function render(size) {
  const ss = 4;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const [cr, cg, cb, ca] = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          const w = ca / 255;
          r += cr * w; g += cg * w; b += cb * w; a += ca;
        }
      }
      const n = ss * ss;
      const alpha = a / n;
      const wsum = a / 255 || 1;
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r / wsum);
      rgba[i + 1] = Math.round(g / wsum);
      rgba[i + 2] = Math.round(b / wsum);
      rgba[i + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, rgba);
}

for (const size of SIZES) {
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, render(size));
  console.log('gerado', file);
}
