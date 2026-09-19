/**
 * Prepara as logos das plataformas para uso na extensão.
 * Uso: node tools/preparar-logos.mjs
 *
 * Lê `logos/` e escreve `icons/plataformas/*.png` — quadrados, aparados,
 * reduzidos e com transparência real.
 *
 * Existe porque três dos cinco arquivos originais são capturas de um preview de
 * transparência: o xadrez está GRAVADO NOS PIXELS, não é canal alfa. Medido na
 * entrada: `googlemaps-logo.png` e `amazon-logo.png` têm 0% de transparência e
 * alternam 255 e ~230 no fundo. Colocados numa página, apareceriam com o
 * quadriculado cinza atrás.
 *
 * Sem dependências, como o resto do tooling do projeto.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = join(RAIZ, 'logos');
const DESTINO = join(RAIZ, 'icons', 'plataformas');

/** 96px cobre um ladrilho de 32px em telas 3×, e mantém os arquivos pequenos. */
const LADO = 96;
/** Respiro proporcional dentro do quadrado, para as logos não encostarem na borda. */
const MARGEM = 0.06;

// --- decodificação ---------------------------------------------------------

/** PNG: tipos 0/2/3/4/6, profundidades 1/2/4/8, com tRNS. Sem entrelaçamento. */
function decodificar(buf) {
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

// --- limpeza ---------------------------------------------------------------

/** Valor mais frequente de uma lista. */
function moda(valores) {
  const cont = new Map();
  for (const v of valores) cont.set(v, (cont.get(v) || 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Índice da célula. O período é FRACIONÁRIO de propósito: imagens
 * redimensionadas têm células que não caem em múltiplos inteiros — medido na
 * logo da Amazon, as transições ficam em 2, 22, 42, 62, 79, 99, com um passo de
 * 17 no meio de vários de 20. Arredondar para 20 fazia o padrão previsto
 * inverter na metade oposta da imagem: 86% de acerto no topo e 14% na base.
 * O +1000 mantém o índice positivo sem alterar a paridade.
 */
function celula(v, origem, c) {
  return Math.floor((v - origem) / c) + 1000;
}

/**
 * Descobre o xadrez de transparência gravado na imagem: tamanho da célula, a
 * fase em x e y, e qual tom cai em cada paridade.
 *
 * O padrão importa, e um limiar de cor não basta. "Todo pixel claro é fundo"
 * funciona com logos coloridas, mas destruiria a do Wikipédia, que é um globo
 * BRANCO sobre xadrez branco-e-cinza-claro. O que distingue o fundo não é ser
 * claro: é ALTERNAR em células regulares. A superfície do globo é uniforme e
 * falha no teste, mesmo tendo exatamente a cor de uma das células.
 *
 * Período e fase são lidos dos comprimentos de corrida da primeira linha e da
 * primeira coluna, em vez de testados por força bruta: medido nas entradas, o
 * Maps usa células de 15px começando em 0, e a Amazon células de 20px
 * deslocadas em 2px. Supor fase zero fazia o encaixe da Amazon cair a 51%.
 *
 * @returns {{c: number, ox: number, oy: number, tons: number[][]}|null}
 */
function detectarXadrez(w, h, rgba) {
  const borda = [];
  for (let x = 0; x < w; x++) borda.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) borda.push([0, y], [w - 1, y]);

  // Borda transparente significa alfa de verdade: não há xadrez a remover.
  const opacos = borda.filter(([x, y]) => rgba[(y * w + x) * 4 + 3] > 200);
  if (opacos.length < borda.length * 0.9) return null;

  const cont = new Map();
  for (const [x, y] of opacos) {
    const i = (y * w + x) * 4;
    const k = `${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`;
    cont.set(k, (cont.get(k) || 0) + 1);
  }
  const top = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (top.length < 2) return null;

  const tons = top.map(([k]) => k.split(',').map(Number));
  // Ambos claros e dessaturados: é a assinatura do xadrez de transparência.
  for (const [r, g, b] of tons) {
    if (Math.min(r, g, b) < 200 || Math.max(r, g, b) - Math.min(r, g, b) > 16) return null;
  }

  // Metade da borda basta: a logo pode encostar na margem, e exigir 90% fazia
  // o Maps ser rejeitado por causa do verde que sangra até o canto (78%).
  const quais = (x, y) => {
    const i = (y * w + x) * 4;
    for (let t = 0; t < 2; t++) {
      if (
        Math.abs(rgba[i] - tons[t][0]) <= 6 &&
        Math.abs(rgba[i + 1] - tons[t][1]) <= 6 &&
        Math.abs(rgba[i + 2] - tons[t][2]) <= 6
      ) return t;
    }
    return -1;
  };
  const doFundo = opacos.filter(([x, y]) => quais(x, y) >= 0);
  if (doFundo.length < opacos.length * 0.5) return null;

  /**
   * Período e fase a partir das trocas de tom ao longo de uma faixa.
   *
   * O período sai da distância entre a PRIMEIRA e a ÚLTIMA troca dividida pelo
   * número de intervalos, e não da moda dos passos: assim o erro de
   * arredondamento de cada célula não se acumula ao longo da imagem.
   */
  const estrutura = (n, amostra) => {
    const t = Array.from({ length: n }, (_, k) => amostra(k));
    const trocas = [];
    for (let k = 1; k < n; k++) {
      if (t[k] >= 0 && t[k - 1] >= 0 && t[k] !== t[k - 1]) trocas.push(k);
    }
    if (trocas.length < 4) return null;

    const passoTipico = moda(trocas.slice(1).map((v, k) => v - trocas[k]));
    if (!passoTipico || passoTipico < 3) return null;

    // Quantos períodos cabem entre a primeira e a última troca. Trocas engolidas
    // pela logo deixariam saltos múltiplos, então a conta usa a distância total.
    const vao = trocas.at(-1) - trocas[0];
    const intervalos = Math.round(vao / passoTipico);
    if (intervalos < 3) return null;

    return { c: vao / intervalos, origem: trocas[0] };
  };

  const linha = estrutura(w, (x) => quais(x, 0));
  const coluna = estrutura(h, (y) => quais(0, y));
  if (!linha || !coluna) return null;
  // Células de xadrez são quadradas; períodos muito diferentes em x e y indicam
  // que o que foi detectado não é xadrez.
  if (Math.abs(linha.c - coluna.c) / linha.c > 0.05) return null;

  // Cada eixo guarda o SEU período. Medido na Amazon: 19,925 em x contra 20,079
  // em y — usar a média dos dois derrubava o encaixe de 94,8% para 65,8%,
  // porque o erro se acumula ao longo dos 800 px.
  const cx = linha.c;
  const cy = coluna.c;
  const ox = linha.origem;
  const oy = coluna.origem;

  // Qual tom fica na paridade par? Decidido pela evidência, não por convenção.
  let melhor = null;
  for (const ordem of [tons, [tons[1], tons[0]]]) {
    let acertos = 0;
    for (const [x, y] of doFundo) {
      const par = (celula(x, ox, cx) + celula(y, oy, cy)) % 2;
      if (ordem[par] === tons[quais(x, y)]) acertos++;
    }
    const nota = acertos / doFundo.length;
    if (!melhor || nota > melhor.nota) melhor = { ordem, nota };
  }

  // 0,90 e não 0,97: os pixels da costura entre células são interpolados e não
  // casam com tom nenhum. As outras portas — dois tons claros e dessaturados,
  // metade da borda coberta, períodos iguais nos dois eixos — já tornam o falso
  // positivo improvável.
  if (melhor.nota < 0.9) return null;
  return { cx, cy, ox, oy, tons: melhor.ordem };
}

/**
 * Apaga o xadrez, por preenchimento a partir das bordas.
 *
 * Preenchimento, e não varredura global: mesmo com o teste de padrão, um trecho
 * interno da logo pode coincidir com a célula esperada. Exigir conexão com a
 * borda garante que só o fundo de fato saia.
 */
function removerXadrez(w, h, rgba, xadrez) {
  if (!xadrez) return 0;
  const { cx, cy, ox, oy, tons } = xadrez;

  /** Distância, em pixels, até a borda de célula mais próxima nesse eixo. */
  const daCostura = (v, o, c) => {
    const f = (v - o) / c - Math.floor((v - o) / c);
    return Math.min(f, 1 - f) * c;
  };

  const combina = (i, tom) =>
    Math.abs(rgba[i] - tom[0]) <= 8 &&
    Math.abs(rgba[i + 1] - tom[1]) <= 8 &&
    Math.abs(rgba[i + 2] - tom[2]) <= 8;

  const ehFundo = (x, y) => {
    const i = (y * w + x) * 4;
    const tom = tons[(celula(x, ox, cx) + celula(y, oy, cy)) % 2];
    if (combina(i, tom)) return true;

    // Na costura entre duas células o pixel é interpolado e pode carregar o tom
    // vizinho. Aceitar qualquer um dos dois ali evita deixar uma grade de
    // pontinhos opacos — que, na borda da imagem, ainda arruinaria o recorte.
    if (daCostura(x, ox, cx) <= 1.5 || daCostura(y, oy, cy) <= 1.5) {
      return combina(i, tons[0]) || combina(i, tons[1]);
    }
    return false;
  };

  const visitado = new Uint8Array(w * h);
  const fila = [];

  const considerar = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (visitado[i]) return;
    if (rgba[i * 4 + 3] === 0) { visitado[i] = 1; fila.push(i); return; }
    if (!ehFundo(x, y)) return;
    visitado[i] = 1;
    fila.push(i);
  };

  for (let x = 0; x < w; x++) { considerar(x, 0); considerar(x, h - 1); }
  for (let y = 0; y < h; y++) { considerar(0, y); considerar(w - 1, y); }

  let removidos = 0;
  while (fila.length > 0) {
    const i = fila.pop();
    if (rgba[i * 4 + 3] !== 0) { rgba[i * 4 + 3] = 0; removidos++; }
    const x = i % w;
    const y = (i / w) | 0;
    considerar(x - 1, y); considerar(x + 1, y);
    considerar(x, y - 1); considerar(x, y + 1);
  }
  return removidos;
}

/** Menor retângulo que contém tudo o que não é transparente. */
function limites(w, h, rgba, limiar = 8) {
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
 * Recorta o conteúdo, centraliza num quadrado e reduz para LADO×LADO.
 *
 * A média é feita com alfa PRÉ-MULTIPLICADO: sem isso, a cor de pixels
 * transparentes entra na conta e a logo ganha um halo claro na borda.
 */
function normalizar(w, h, rgba) {
  const { x0, y0, x1, y1 } = limites(w, h, rgba);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;

  const conteudo = Math.round(LADO * (1 - 2 * MARGEM));
  const escala = conteudo / Math.max(cw, ch);
  const destW = Math.max(1, Math.round(cw * escala));
  const destH = Math.max(1, Math.round(ch * escala));
  const offX = Math.round((LADO - destW) / 2);
  const offY = Math.round((LADO - destH) / 2);

  const saida = Buffer.alloc(LADO * LADO * 4);

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
      const j = ((offY + dy) * LADO + offX + dx) * 4;
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

function codificar(lado, rgba) {
  const linha = lado * 4;
  const raw = Buffer.alloc((linha + 1) * lado);
  for (let y = 0; y < lado; y++) {
    raw[y * (linha + 1)] = 0; // filtro None
    rgba.copy(raw, y * (linha + 1) + 1, y * linha, (y + 1) * linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(raw, { level: 9 })),
    bloco('IEND', Buffer.alloc(0))
  ]);
}

// --- execução --------------------------------------------------------------

const ARQUIVOS = [
  { id: 'google', arquivo: 'google-logo.png' },
  { id: 'youtube', arquivo: 'youtube_logo.png' },
  { id: 'maps', arquivo: 'googlemaps-logo.png' },
  { id: 'amazon', arquivo: 'amazon-logo.png' },
  // Basta trocar por um PNG com transparência real e rodar de novo: o
  // seletor passa a usar a imagem sozinho. Enquanto for JPEG, fica o SVG.
  { id: 'wikipedia', arquivo: 'wikipedia-logo.png', opcional: true }
];

mkdirSync(DESTINO, { recursive: true });

for (const { id, arquivo, opcional } of ARQUIVOS) {
  let origem;
  try {
    origem = readFileSync(join(ORIGEM, arquivo));
  } catch {
    if (opcional) { console.log(`${id.padEnd(9)} ignorado — ${arquivo} não encontrado`); continue; }
    throw new Error(`faltando: logos/${arquivo}`);
  }

  // JPEG não tem canal alfa, então um fundo "transparente" veio gravado como
  // pixels — e decodificá-lo exigiria um decodificador JPEG inteiro, que não
  // cabe num utilitário sem dependências.
  if (origem[0] === 0xff && origem[1] === 0xd8) {
    console.log(
      `${id.padEnd(9)} PULADO — ${arquivo} é JPEG, sem canal alfa.\n` +
      '          Reexporte como PNG com transparência real e rode este script de novo.'
    );
    continue;
  }

  const { w, h, rgba } = decodificar(origem);

  const antes = contarTransparentes(w, h, rgba);
  const xadrez = detectarXadrez(w, h, rgba);
  const removidos = removerXadrez(w, h, rgba, xadrez);
  const saida = normalizar(w, h, rgba);
  const png = codificar(LADO, saida);

  const destino = join(DESTINO, `${id}.png`);
  writeFileSync(destino, png);

  const kbAntes = (origem.length / 1024).toFixed(0);
  const kbDepois = (png.length / 1024).toFixed(1);
  const nota = xadrez
    ? `xadrez ${xadrez.cx.toFixed(1)}px removido (${((removidos / (w * h)) * 100).toFixed(0)}%)`
    : 'alfa já era real';
  console.log(
    `${id.padEnd(9)} ${String(w).padStart(4)}×${String(h).padEnd(4)} → ${LADO}×${LADO}` +
    `  ${kbAntes.padStart(3)} KB → ${kbDepois.padStart(5)} KB  ${nota}` +
    (antes === 0 ? '' : ` · alfa de entrada ${((antes / (w * h)) * 100).toFixed(0)}%`)
  );
}

function contarTransparentes(w, h, rgba) {
  let n = 0;
  for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3] < 16) n++;
  return n;
}

console.log(`\n${ARQUIVOS.length} logos em ${DESTINO}`);
