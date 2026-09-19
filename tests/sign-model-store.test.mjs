/**
 * Testes da persistência do modelo, com chrome.storage.local mockado por um Map.
 * Uso: node tests/sign-model-store.test.mjs
 */
import assert from 'node:assert/strict';
import { SignModelStore, CHAVE_INDICE, PREFIXO_CLASSE, AMOSTRAS_MAXIMAS } from '../src/sign-model-store.js';
import { VERSAO_FEATURES, DIMENSOES } from '../src/sign-features.js';

/** storage.local em memória, com contador de escritas. */
function areaFalsa() {
  const mapa = new Map();
  let escritas = 0;
  return {
    mapa,
    get escritas() { return escritas; },
    async get(chaves) {
      const lista = chaves === null || chaves === undefined
        ? [...mapa.keys()]
        : Array.isArray(chaves) ? chaves : [chaves];
      const saida = {};
      for (const c of lista) if (mapa.has(c)) saida[c] = mapa.get(c);
      return saida;
    },
    async set(objeto) {
      escritas++;
      for (const [c, v] of Object.entries(objeto)) mapa.set(c, v);
    },
    async remove(chaves) {
      for (const c of Array.isArray(chaves) ? chaves : [chaves]) mapa.delete(c);
    },
    async getBytesInUse() {
      return JSON.stringify([...mapa.entries()]).length;
    }
  };
}

const vetor = (base) => Array.from({ length: DIMENSOES }, (_, i) => base + i * 0.001);

// --- Cenário 1: ida e volta de amostras ------------------------------------
{
  const area = areaFalsa();
  const store = new SignModelStore(area);

  assert.equal(await store.adicionarAmostra('A', vetor(0)), 1);
  assert.equal(await store.adicionarAmostra('A', vetor(0.1)), 2);
  assert.equal(await store.adicionarAmostra('B', vetor(1)), 1);

  const { indice, classes, incompativel } = await store.carregar();
  assert.equal(incompativel, null);
  assert.equal(classes.A.length, 2);
  assert.equal(classes.B.length, 1);
  assert.equal(indice.contagem.A, 2);
  assert.equal(indice.versaoFeatures, VERSAO_FEATURES);
  console.log('OK  cenário 1 — grava e relê amostras por classe');
}

// --- Cenário 2: uma chave por classe, não uma para o modelo inteiro --------
// Com chave única, cada amostra capturada reescreveria o modelo completo.
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  for (const c of ['A', 'B', 'C']) await store.adicionarAmostra(c, vetor(0));

  const chaves = [...area.mapa.keys()];
  assert.ok(chaves.includes(`${PREFIXO_CLASSE}A`));
  assert.ok(chaves.includes(`${PREFIXO_CLASSE}B`));
  assert.ok(chaves.includes(CHAVE_INDICE));
  assert.equal(chaves.length, 4, 'três classes + índice');
  console.log('OK  cenário 2 — chaveamento por classe evita reescrever o modelo inteiro');
}

// --- Cenário 3: teto de amostras descarta a mais antiga -------------------
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  for (let i = 0; i < AMOSTRAS_MAXIMAS + 10; i++) await store.adicionarAmostra('A', vetor(i));

  const { classes } = await store.carregar();
  assert.equal(classes.A.length, AMOSTRAS_MAXIMAS, 'não pode crescer sem limite');
  assert.ok(classes.A[0][0] > 9, 'as mais antigas devem ter saído');
  console.log(`OK  cenário 3 — teto de ${AMOSTRAS_MAXIMAS} amostras por classe respeitado`);
}

// --- Cenário 4: versão de features incompatível é RECUSADA ---------------
// Reinterpretar amostras de outra normalização não dá erro: dá queda silenciosa
// de acurácia. Recusar é o comportamento correto.
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  await store.adicionarAmostra('A', vetor(0));

  const indice = area.mapa.get(CHAVE_INDICE);
  area.mapa.set(CHAVE_INDICE, { ...indice, versaoFeatures: VERSAO_FEATURES + 1 });

  const r = await store.carregar();
  assert.equal(r.indice, null, 'não pode carregar modelo de outra versão');
  assert.deepEqual(r.classes, {}, 'nenhuma amostra pode vazar para o classificador');
  assert.equal(r.incompativel.versaoGravada, VERSAO_FEATURES + 1);
  console.log('OK  cenário 4 — modelo de outra versão de features é recusado, não reinterpretado');
}

// --- Cenário 5: exportar → importar é idempotente ------------------------
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  await store.adicionarAmostra('A', vetor(0));
  await store.adicionarAmostra('A', vetor(0.5));
  await store.adicionarAmostra('S', vetor(2));
  await store.atualizarParametros({ tauAbs: 0.42, mao: 'esquerda' });

  const arquivo = await store.exportar();
  assert.equal(arquivo.formato, 'rvl-libras-modelo');
  assert.equal(arquivo.mao, 'esquerda');
  assert.equal(arquivo.tauAbs, 0.42);

  const destino = new SignModelStore(areaFalsa());
  const r = await destino.importar(arquivo, 'substituir');
  assert.equal(r.classes, 2);
  assert.equal(r.amostras, 3);

  const recarregado = await destino.carregar();
  assert.deepEqual(Object.keys(recarregado.classes).sort(), ['A', 'S']);
  assert.equal(recarregado.classes.A.length, 2);
  assert.equal(recarregado.indice.mao, 'esquerda', 'a mão dominante viaja com o modelo');
  assert.equal(recarregado.indice.tauAbs, 0.42, 'o limiar calibrado viaja com o modelo');
  console.log('OK  cenário 5 — exportar e importar preserva amostras, mão e τ_abs');
}

// --- Cenário 6: arquivos inválidos são recusados com motivo legível ------
{
  const casos = [
    [null, 'objeto nulo'],
    [{ formato: 'outra-coisa' }, 'formato errado'],
    [{ formato: 'rvl-libras-modelo', esquema: 99 }, 'esquema incompatível'],
    [
      { formato: 'rvl-libras-modelo', esquema: 1, versaoFeatures: VERSAO_FEATURES + 5, classes: {} },
      'versão de features diferente'
    ],
    [
      { formato: 'rvl-libras-modelo', esquema: 1, versaoFeatures: VERSAO_FEATURES, classes: { A: [[1, 2, 3]] } },
      'dimensão errada'
    ],
    [
      { formato: 'rvl-libras-modelo', esquema: 1, versaoFeatures: VERSAO_FEATURES, classes: { Ω: [vetor(0)] } },
      'classe fora do catálogo'
    ]
  ];

  for (const [entrada, rotulo] of casos) {
    const v = SignModelStore.validarArquivo(entrada);
    assert.equal(v.ok, false, `deveria recusar: ${rotulo}`);
    assert.ok(typeof v.erro === 'string' && v.erro.length > 10, `motivo legível para: ${rotulo}`);
  }
  console.log('OK  cenário 6 — seis formas de arquivo inválido recusadas com motivo');
}

// --- Cenário 7: import inválido não corrompe o modelo existente ---------
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  await store.adicionarAmostra('A', vetor(0));

  await assert.rejects(
    () => store.importar({ formato: 'errado' }),
    /Formato desconhecido/,
    'import inválido deve lançar'
  );

  const { classes } = await store.carregar();
  assert.equal(classes.A.length, 1, 'o modelo anterior deve continuar intacto');
  console.log('OK  cenário 7 — import inválido não apaga o que já existia');
}

// --- Cenário 8: mesclar soma em vez de substituir ----------------------
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  await store.adicionarAmostra('A', vetor(0));

  const arquivo = {
    formato: 'rvl-libras-modelo',
    esquema: 1,
    versaoFeatures: VERSAO_FEATURES,
    classes: { A: [vetor(9)], B: [vetor(3)] }
  };

  await store.importar(arquivo, 'mesclar');
  const { classes } = await store.carregar();
  assert.equal(classes.A.length, 2, 'mesclar soma as amostras da classe');
  assert.equal(classes.B.length, 1, 'e traz as classes novas');
  console.log('OK  cenário 8 — modo mesclar soma sem descartar o treino anterior');
}

// --- Cenário 9: limpar apaga tudo (direito de eliminação) -------------
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  await store.adicionarAmostra('A', vetor(0));
  await store.adicionarAmostra('B', vetor(1));

  await store.limpar();
  assert.equal(area.mapa.size, 0, 'nenhuma chave pode sobrar após apagar o modelo');

  const r = await store.carregar();
  assert.equal(r.indice, null);
  assert.deepEqual(r.classes, {});
  console.log('OK  cenário 9 — apagar o modelo não deixa resíduo no storage');
}

// --- Cenário 10: classe desconhecida é rejeitada na gravação ----------
{
  const store = new SignModelStore(areaFalsa());
  await assert.rejects(() => store.adicionarAmostra('Ω', vetor(0)), /Classe desconhecida/);
  await assert.rejects(() => store.adicionarAmostra('A', [1, 2, 3]), /dimensão inesperada/);
  console.log('OK  cenário 10 — grava só classe do catálogo e vetor com 63 dimensões');
}

console.log('\ntodos os cenários passaram');
