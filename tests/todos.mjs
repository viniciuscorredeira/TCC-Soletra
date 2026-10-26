/**
 * Roda toda a suíte em sequência. Uso: node tests/todos.mjs
 *
 * Cada arquivo lança na primeira falha, então a saída para no primeiro
 * cenário quebrado — que é o que se quer de um teste sem framework.
 */
const SUITES = [
  'camera-controller.test.mjs',
  'sign-features.test.mjs',
  'sign-classifier.test.mjs',
  'sign-stabilizer.test.mjs',
  'trava-mao.test.mjs',
  'text-composer.test.mjs',
  'inference-loop.test.mjs',
  'sign-model-store.test.mjs',
  'montar-modelo-padrao.test.mjs',
  'search-targets.test.mjs',
  'migracao-storage.test.mjs',
  'modelo-pronto.test.mjs',
  'respingo.test.mjs',
  'integracao.test.mjs'
];

for (const suite of SUITES) {
  console.log(`\n=== ${suite} ===`);
  await import(new URL(suite, import.meta.url).href);
}

console.log('\n\nSUÍTE COMPLETA — todos os arquivos passaram');
