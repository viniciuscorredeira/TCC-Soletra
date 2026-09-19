/**
 * Gera os PNGs de ícone da extensão a partir da arte do Soletra.
 * Uso: node tools/make-icons.mjs
 *
 * A arte em `icons/soletra-logo.png` é um lockup: a marca (as mãos com a lupa)
 * sobre a palavra "Soletra". Só a marca vai para o ícone — a 16px o texto vira
 * um borrão ilegível, e o ícone da barra de ferramentas é lido a 16px na maior
 * parte do tempo.
 *
 * O corte entre marca e palavra é encontrado pela linha de menor densidade
 * entre 60% e 85% da altura, em vez de ficar cravado num número: assim a arte
 * pode ser reexportada com outro enquadramento sem quebrar o gerador.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodificar, codificar, limites, paraQuadrado } from './png.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTE = join(RAIZ, 'icons', 'soletra-logo.png');
const SAIDA = join(RAIZ, 'icons');

const TAMANHOS = [16, 32, 48, 128];

/** Densidade de pixels opacos em cada linha da imagem. */
function densidadePorLinha(w, h, rgba) {
  const d = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > 128) n++;
    d[y] = n / w;
  }
  return d;
}

/** Linha de menor densidade na faixa onde o lockup costuma separar. */
function encontrarCorte(w, h, rgba) {
  const d = densidadePorLinha(w, h, rgba);
  let corte = Math.floor(h * 0.75);
  let min = Infinity;
  for (let y = Math.floor(h * 0.6); y < Math.floor(h * 0.85); y++) {
    if (d[y] < min) { min = d[y]; corte = y; }
  }
  return { corte, densidade: min };
}

const arte = decodificar(readFileSync(ARTE));
const { corte, densidade } = encontrarCorte(arte.w, arte.h, arte.rgba);

// Limites da marca, já descontando a palavra abaixo do corte.
const marca = limites(arte.w, corte, arte.rgba);

console.log(`arte ${arte.w}×${arte.h}`);
console.log(`corte em y=${corte} (${Math.round((corte / arte.h) * 100)}% da altura, densidade ${(densidade * 100).toFixed(1)}%)`);
console.log(`marca ${marca.x1 - marca.x0 + 1}×${marca.y1 - marca.y0 + 1} px\n`);

for (const lado of TAMANHOS) {
  // Margem menor nos tamanhos pequenos: a 16px cada pixel de respiro custa
  // caro, e o ícone já é recortado com folga pela própria arte.
  const margem = lado <= 32 ? 0.02 : 0.05;
  const rgba = paraQuadrado(arte, { lado, margem, recorte: marca });
  const arquivo = join(SAIDA, `icon${lado}.png`);
  const png = codificar(lado, lado, rgba);
  writeFileSync(arquivo, png);
  console.log(`  icon${lado}.png`.padEnd(18) + `${(png.length / 1024).toFixed(1)} KB`);
}
