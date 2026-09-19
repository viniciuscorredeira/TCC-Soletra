/**
 * Soletra — leitura, escrita e redimensionamento de PNG, sem dependências.
 *
 * Extraído de tools/preparar-logos.mjs quando o gerador de ícones passou a
 * precisar do mesmo decodificador: duas cópias de um decodificador PNG é uma
 * a mais do que este projeto aguenta manter em dia.
 */
import { deflateSync, inflateSync } from 'node:zlib';

// --- decodificação ---------------------------------------------------------

/** PNG: tipos 0/2/3/4/6, profundidades 1/2/4/8, com tRNS. Sem entrelaçamento. */
export function decodificar(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('não é PNG');
  let p = 8, w = 0, h = 0, tipo = 0, prof = 0;
  const idat = [];
  let paleta = null, trns = null;

  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const nome = buf.toString('latin1', p + 4, p + 8);
    const dados = buf.subarray(p + 8, p + 8 + len);
    if (nome === 'IHDR') {
      w = dados.readUInt32BE(0); h = dados.readUInt32BE(4);
      prof = dados[8]; tipo = dados[9];
      if (dados[12] !== 0) throw new Error('PNG entrelaçado não suportado');
    } else if (nome === 'PLTE') paleta = Buffer.from(dados);
    else if (nome === 'tRNS') trns = Buffer.from(dados);
    else if (nome === 'IDAT') idat.push(Buffer.from(dados));
    else if (nome === 'IEND') break;
    p += 12 + len;
  }

  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipo];
  if (prof !== 8 && !(prof < 8 && canais === 1)) {
    throw new Error(`profundidade ${prof} com ${canais} canais não suportada`);
  }

  // A filtragem do PNG opera em bytes: o desfiltro roda sobre a linha
  // empacotada, e só depois as amostras sub-byte são extraídas.
  const bits = prof * canais;
  const bpp = Math.max(1, bits >> 3);
  const bruto = inflateSync(Buffer.concat(idat));
  const linha = Math.ceil((w * bits) / 8);
  const px = Buffer.alloc(h * linha);

  for (let y = 0; y < h; y++) {
    const filtro = bruto[y * (linha + 1)];
    const org = y * (linha + 1) + 1;
    const dst = y * linha;
    for (let i = 0; i < linha; i++) {
      const a = i >= bpp ? px[dst + i - bpp] : 0;
      const b = y > 0 ? px[dst - linha + i] : 0;
      const c = i >= bpp && y > 0 ? px[dst - linha + i - bpp] : 0;
      const x = bruto[org + i];
      let v;
      switch (filtro) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: throw new Error(`filtro ${filtro} desconhecido`);
      }
      px[dst + i] = v & 0xff;
    }
  }

  let s = px;
  if (prof < 8) {
    s = Buffer.alloc(w * h);
    const porByte = 8 / prof;
    const mascara = (1 << prof) - 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const byte = px[y * linha + Math.floor(x / porByte)];
        s[y * w + x] = (byte >> (8 - prof * ((x % porByte) + 1))) & mascara;
      }
    }
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (tipo === 0) { r = g = b = s[i]; }
    else if (tipo === 2) { r = s[i * 3]; g = s[i * 3 + 1]; b = s[i * 3 + 2]; }
    else if (tipo === 3) {
      const k = s[i];
      r = paleta[k * 3]; g = paleta[k * 3 + 1]; b = paleta[k * 3 + 2];
      a = trns && k < trns.length ? trns[k] : 255;
    } else if (tipo === 4) { r = g = b = s[i * 2]; a = s[i * 2 + 1]; }
    else { r = s[i * 4]; g = s[i * 4 + 1]; b = s[i * 4 + 2]; a = s[i * 4 + 3]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}
// --- medidas ---------------------------------------------------------------

/** Menor retângulo que contém tudo o que não é transparente. */
export function limites(w, h, rgba, limiar = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > limiar) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('imagem ficou totalmente transparente');
  return { x0, y0, x1, y1 };
}
/**
 * Recorta uma região, centraliza num quadrado e reduz para `lado`×`lado`.
 *
 * A média é feita com alfa PRÉ-MULTIPLICADO: sem isso, a cor de pixels
 * transparentes entra na conta e a imagem ganha um halo claro na borda.
 *
 * @param {{w:number,h:number,rgba:Buffer}} origem
 * @param {{lado:number, margem?:number, recorte?:{x0:number,y0:number,x1:number,y1:number}}} opcoes
 */
export function paraQuadrado({ w, h, rgba }, { lado, margem = 0.06, recorte }) {
  const { x0, y0, x1, y1 } = recorte ?? limites(w, h, rgba);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;

  const conteudo = Math.round(lado * (1 - 2 * margem));
  const escala = conteudo / Math.max(cw, ch);
  const destW = Math.max(1, Math.round(cw * escala));
  const destH = Math.max(1, Math.round(ch * escala));
  const offX = Math.round((lado - destW) / 2);
  const offY = Math.round((lado - destH) / 2);

  const saida = Buffer.alloc(lado * lado * 4);

  for (let dy = 0; dy < destH; dy++) {
    for (let dx = 0; dx < destW; dx++) {
      const sx0 = x0 + Math.floor((dx * cw) / destW);
      const sx1 = x0 + Math.max(Math.floor(((dx + 1) * cw) / destW), Math.floor((dx * cw) / destW) + 1);
      const sy0 = y0 + Math.floor((dy * ch) / destH);
      const sy1 = y0 + Math.max(Math.floor(((dy + 1) * ch) / destH), Math.floor((dy * ch) / destH) + 1);

      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let sy = sy0; sy < sy1 && sy <= y1; sy++) {
        for (let sx = sx0; sx < sx1 && sx <= x1; sx++) {
          const i = (sy * w + sx) * 4;
          const a = rgba[i + 3] / 255;
          sr += rgba[i] * a; sg += rgba[i + 1] * a; sb += rgba[i + 2] * a;
          sa += a; n++;
        }
      }
      if (n === 0) continue;

      const alfa = sa / n;
      const j = ((offY + dy) * lado + offX + dx) * 4;
      saida[j + 3] = Math.round(alfa * 255);
      if (alfa > 0) {
        saida[j] = Math.min(255, Math.round(sr / n / alfa));
        saida[j + 1] = Math.min(255, Math.round(sg / n / alfa));
        saida[j + 2] = Math.min(255, Math.round(sb / n / alfa));
      }
    }
  }
  return saida;
}

// --- codificação -----------------------------------------------------------

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}

export function codificar(largura, altura, rgba) {
  const linha = largura * 4;
  const raw = Buffer.alloc((linha + 1) * altura);
  for (let y = 0; y < altura; y++) {
    raw[y * (linha + 1)] = 0; // filtro None
    rgba.copy(raw, y * (linha + 1) + 1, y * linha, (y + 1) * linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(raw, { level: 9 })),
    bloco('IEND', Buffer.alloc(0))
  ]);
}