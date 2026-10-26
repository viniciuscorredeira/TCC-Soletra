/**
 * Testes da instalação do modelo pronto — o que o service worker faz numa
 * instalação nova e o painel faz ao restaurar o padrão.
 * Uso: node tests/modelo-pronto.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { instalarModeloPronto } from '../src/modelo-pronto.js';
import {
  SignModelStore, VERSAO_CALIBRACAO, AMOSTRAS_PADRAO, PREFIXO_PADRAO
} from '../src/sign-model-store.js';
import { DIMENSOES } from '../src/sign-features.js';

const PADRAO = JSON.parse(readFileSync(new URL('../modelos/padrao.json', import.meta.url), 'utf8'));

/** storage.local em memória. */
function areaFalsa() {
  const mapa = new Map();
  return {
    async get(chaves) {
      const lista = Array.isArray(chaves) ? chaves : [chaves];
      const saida = {};
      for (const c of lista) if (mapa.has(c)) saida[c] = mapa.get(c);
      return saida;
    },
    async set(objeto) {
      for (const [c, v] of Object.entries(objeto)) mapa.set(c, v);
    },
    async remove(chaves) {
      for (const c of Array.isArray(chaves) ? chaves : [chaves]) mapa.delete(c);
    }
  };
}

// --- Cenário 1: numa instalação nova, o modelo já sai pronto para reconhecer --
// Sem τ_abs calibrado, o classificador aceitaria qualquer gesto como alguma
// letra: instalar as amostras sem calibrar deixaria o reconhecimento "pronto"
// e errado ao mesmo tempo.
{
  const store = new SignModelStore(areaFalsa());
  const r = await instalarModeloPronto(store, PADRAO);

  const { indice, classes, origem } = await store.carregar();
  assert.equal(r.classes, Object.keys(PADRAO.classes).length);
  assert.equal(Object.keys(classes).length, r.classes);
  assert.ok(Object.values(origem).every((o) => o.padrao === AMOSTRAS_PADRAO && o.pessoal === 0));
  assert.ok(Number.isFinite(indice.tauAbs) && indice.tauAbs > 0, `τ_abs calibrado: ${indice.tauAbs}`);
  assert.equal(indice.versaoCalibracao, VERSAO_CALIBRACAO);
  console.log('OK  cenário 1 — instala as classes do modelo pronto já calibrado');
}

// --- Cenário 2: o treino pessoal continua lá e entra na calibração ------------
{
  const store = new SignModelStore(areaFalsa());
  const vetor = Array.from({ length: DIMENSOES }, (_, i) => 0.3 + i * 0.002);
  await store.adicionarAmostra('A', vetor);
  await store.adicionarAmostra('A', vetor.map((v) => v + 0.01));

  await instalarModeloPronto(store, PADRAO);
  const { origem, indice } = await store.carregar();
  assert.equal(origem.A.pessoal, 2, 'amostras pessoais preservadas');
  assert.equal(origem.A.padrao, AMOSTRAS_PADRAO);
  assert.ok(Number.isFinite(indice.tauAbs));
  console.log('OK  cenário 2 — preserva o treino pessoal e recalibra sobre o conjunto final');
}

// --- Cenário 3: "treinar do zero" tira só o modelo pronto ---------------------
// Na instalação nova o padrão já está lá; escolher treinar do zero não pode
// levar junto o que a pessoa gravou antes de escolher.
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  await instalarModeloPronto(store, PADRAO);
  const vetor = Array.from({ length: DIMENSOES }, (_, i) => 0.5 + i * 0.002);
  await store.adicionarAmostra('B', vetor);

  await store.removerPadrao();
  const { classes, origem } = await store.carregar();
  assert.deepEqual(Object.keys(classes), ['B'], 'só a classe com treino pessoal');
  assert.deepEqual(origem.B, { padrao: 0, pessoal: 1 });
  const sobras = await area.get(Object.keys(PADRAO.classes).map((c) => PREFIXO_PADRAO + c));
  assert.deepEqual(Object.keys(sobras), [], 'nenhuma chave do padrão sobra no storage');
  console.log('OK  cenário 3 — treinar do zero tira o padrão e preserva o treino pessoal');
}

console.log('\ntodos os cenários passaram');
