/**
 * Gera os ícones da versão dev a partir dos de produção, com uma faixa laranja
 * escrita "DEV" no rodapé. Uso: node dev/tools/make-icons-dev.mjs
 *
 * Com as duas extensões instaladas lado a lado, o ícone é a única coisa que as
 * separa na barra de ferramentas — por isso a faixa ocupa a largura toda e usa
 * uma cor que não existe na marca. A 16px não cabe texto legível: fica só a
 * faixa, que já basta para distinguir.
 *
 * Rode de novo depois de tools/make-icons.mjs, se a arte mudar.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodificar, codificar } from '../../tools/png.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGEM = join(RAIZ, 'icons');
const SAIDA = join(RAIZ, 'dev', 'icons');

const LARANJA = [0xff, 0x7a, 0x00];
const BRANCO = [0xff, 0xff, 0xff];

/** Fonte de 5×7 só com as três letras de que precisamos. */
const GLIFOS = {
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100']
};

/** Altura da faixa e escala do texto (0 = sem texto) em cada tamanho. */
const FAIXAS = {
  16: { altura: 5, escala: 0 },
  32: { altura: 11, escala: 1 },
  48: { altura: 17, escala: 2 },
  128: { altura: 40, escala: 4 }
};

function pintar(rgba, lado, x, y, [r, g, b]) {
  const i = (y * lado + x) * 4;
  rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
}

function escreverDev(rgba, lado, { altura, escala }) {
  const topo = lado - altura;
  for (let y = topo; y < lado; y++) for (let x = 0; x < lado; x++) pintar(rgba, lado, x, y, LARANJA);
  if (!escala) return;

  const texto = 'DEV';
  const largura = (texto.length * 5 + (texto.length - 1)) * escala;
  const x0 = Math.floor((lado - largura) / 2);
  const y0 = topo + Math.floor((altura - 7 * escala) / 2);
  [...texto].forEach((letra, n) => {
    GLIFOS[letra].forEach((linha, gy) => {
      [...linha].forEach((bit, gx) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < escala; dy++) {
          for (let dx = 0; dx < escala; dx++) {
            pintar(rgba, lado, x0 + (n * 6 + gx) * escala + dx, y0 + gy * escala + dy, BRANCO);
          }
        }
      });
    });
  });
}

mkdirSync(SAIDA, { recursive: true });
for (const [lado, faixa] of Object.entries(FAIXAS).map(([l, f]) => [Number(l), f])) {
  const { w, h, rgba } = decodificar(readFileSync(join(ORIGEM, `icon${lado}.png`)));
  if (w !== lado || h !== lado) throw new Error(`icon${lado}.png tem ${w}×${h}`);
  escreverDev(rgba, lado, faixa);
  const png = codificar(lado, lado, rgba);
  writeFileSync(join(SAIDA, `icon${lado}.png`), png);
  console.log(`  dev/icons/icon${lado}.png`.padEnd(28) + `${(png.length / 1024).toFixed(1)} KB`);
}
