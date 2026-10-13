/**
 * Testes da montagem do modelo padrão a partir de exports de várias pessoas.
 * Uso: node tests/montar-modelo-padrao.test.mjs
 */
import assert from 'node:assert/strict';
import { montarModeloPadrao } from '../tools/montar-modelo-padrao.mjs';
import { SignModelStore } from '../src/sign-model-store.js';
import { VERSAO_FEATURES, DIMENSOES } from '../src/sign-features.js';

/** Vetor marcado com a pessoa e o índice da amostra, para rastrear a origem. */
const vetor = (pessoa, i) => Array.from({ length: DIMENSOES }, (_, d) => (d === 0 ? pessoa : d === 1 ? i : 0));

const exportDe = (pessoa, classes) => ({
  formato: 'soletra-modelo',
  esquema: 1,
  versaoFeatures: VERSAO_FEATURES,
  mao: pessoa % 2 ? 'esquerda' : 'direita',
  classes: Object.fromEntries(
    Object.entries(classes).map(([c, n]) => [c, Array.from({ length: n }, (_, i) => vetor(pessoa, i))])
  )
});

// --- Cenário 1: nenhuma pessoa domina a classe ----------------------------
{
  const { modelo } = montarModeloPadrao(
    [exportDe(1, { A: 60 }), exportDe(2, { A: 20 }), exportDe(3, { A: 20 })],
    { porClasse: 30 }
  );
  const porPessoa = [1, 2, 3].map((p) => modelo.classes.A.filter((a) => a[0] === p).length);
  assert.deepEqual(porPessoa, [10, 10, 10], 'quem gravou mais não leva mais lugar');
  console.log('OK  cenário 1 — amostragem balanceada entre pessoas');
}

// --- Cenário 2: sobra de quem gravou pouco vai para os outros -------------
{
  const { modelo } = montarModeloPadrao(
    [exportDe(1, { A: 40 }), exportDe(2, { A: 2 }), exportDe(3, { A: 40 })],
    { porClasse: 30 }
  );
  const porPessoa = [1, 2, 3].map((p) => modelo.classes.A.filter((a) => a[0] === p).length);
  assert.deepEqual(porPessoa, [14, 2, 14]);
  console.log('OK  cenário 2 — a cota não usada é redistribuída');
}

// --- Cenário 3: amostras escolhidas espalhadas, não as primeiras ----------
{
  const { modelo } = montarModeloPadrao(
    [exportDe(1, { A: 40 }), exportDe(2, { A: 40 }), exportDe(3, { A: 40 })],
    { porClasse: 12 }
  );
  const indices = modelo.classes.A.filter((a) => a[0] === 1).map((a) => a[1]);
  assert.deepEqual(indices, [0, 10, 20, 30]);
  console.log('OK  cenário 3 — amostras espalhadas pela sessão de captura');
}

// --- Cenário 4: saída é importável e avisos apontam pouca diversidade -----
{
  const { modelo, avisos } = montarModeloPadrao([exportDe(1, { A: 20, B: 20 }), exportDe(2, { A: 20 })]);
  assert.equal(SignModelStore.validarArquivo(modelo).ok, true);
  assert.equal(modelo.pessoas, 2);
  assert.equal(modelo.mao, 'direita');
  assert.equal(modelo.tauAbs, null, 'o limiar é recalibrado na instalação');
  assert.ok(avisos.some((a) => /Só 2 arquivo/.test(a)), 'avisa que há poucas pessoas');
  assert.ok(avisos.some((a) => /Classe B/.test(a)), 'avisa a classe com um único contribuinte');
  console.log('OK  cenário 4 — modelo montado passa na validação e os avisos são emitidos');
}

// --- Cenário 5: export inválido aborta com o número do arquivo -------------
{
  assert.throws(
    () => montarModeloPadrao([exportDe(1, { A: 5 }), { formato: 'outro' }]),
    /Arquivo 2: Formato desconhecido/
  );
  assert.throws(() => montarModeloPadrao([exportDe(1, { A: 5 })], { porClasse: 0 }), /por-classe/);
  console.log('OK  cenário 5 — entrada inválida é recusada com motivo');
}

console.log('\ntodos os cenários passaram');
