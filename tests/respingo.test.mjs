/**
 * Testes do recorte da tinta na troca de tema.
 * Uso: node tests/respingo.test.mjs
 */
import assert from 'node:assert/strict';
import { quadrosDoRespingo } from '../ui/respingo.js';

/** Sorteio repetível, para o teste não depender da sorte. */
function semente(n) {
  return () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
}

/** Pontos [x, y] de um `polygon(...)` em pixels. */
function pontos(clipPath) {
  return clipPath
    .slice('polygon('.length, -1)
    .split(', ')
    .map((p) => p.split(' ').map((v) => parseFloat(v)));
}

// --- Cenário 1: todos os quadros têm o mesmo número de pontos ----------------
// Se um quadro tiver um ponto a mais, o navegador não interpola entre eles e a
// tinta pula de uma forma para a outra em vez de crescer.
{
  for (let s = 1; s <= 20; s++) {
    const quadros = quadrosDoRespingo(280, 30, 600, semente(s));
    const contagens = quadros.map((q) => pontos(q.clipPath).length);
    assert.ok(contagens.every((c) => c === contagens[0]), `semente ${s}: ${contagens}`);
    assert.ok(contagens[0] >= 32, 'contorno com pontos de sobra para as gotas');
  }
  console.log('✔ quadros com o mesmo número de pontos');
}

// --- Cenário 2: a tinta nasce como um pingo no botão --------------------------
{
  const [primeiro] = quadrosDoRespingo(280, 30, 600, semente(7));
  for (const [x, y] of pontos(primeiro.clipPath)) {
    assert.ok(Math.hypot(x - 280, y - 30) < 3, `ponto inicial longe da origem: ${x}, ${y}`);
  }
  console.log('✔ começa num pingo sobre o botão');
}

// --- Cenário 3: no último quadro, a tinta cobre a janela inteira -------------
// O canto mais longe fica a `alcance` da origem. Para o polígono conter os
// cantos, até o recorte mais fundo do contorno precisa passar dessa distância
// (com a folga da corda entre dois pontos vizinhos). Se faltar, a página antiga
// apareceria num canto no fim da animação e sumiria de repente.
{
  const alcance = 640;
  for (let s = 1; s <= 200; s++) {
    const quadros = quadrosDoRespingo(0, 0, alcance, semente(s));
    const ultimo = pontos(quadros.at(-1).clipPath);
    const corda = Math.cos(Math.PI / ultimo.length);
    const menor = Math.min(...ultimo.map(([x, y]) => Math.hypot(x, y)));
    assert.ok(menor * corda > alcance, `semente ${s}: recorte de ${menor.toFixed(0)}px`);
  }
  console.log('✔ termina cobrindo até o canto mais longe');
}

// --- Cenário 4: os tempos dos quadros vão de 0 a 1, em ordem ------------------
{
  const offsets = quadrosDoRespingo(10, 10, 100, semente(3)).map((q) => q.offset);
  assert.equal(offsets[0], 0);
  assert.equal(offsets.at(-1), 1);
  assert.deepEqual([...offsets].sort((a, b) => a - b), offsets);
  console.log('✔ tempos em ordem');
}

console.log('\nTRANSIÇÃO DE TEMA — tudo certo');
