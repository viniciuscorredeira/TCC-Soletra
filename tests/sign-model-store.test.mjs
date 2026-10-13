/**
 * Testes da persistência do modelo, com chrome.storage.local mockado por um Map.
 * Uso: node tests/sign-model-store.test.mjs
 */
import assert from 'node:assert/strict';
import {
  SignModelStore, CHAVE_INDICE, PREFIXO_CLASSE, PREFIXO_PADRAO, AMOSTRAS_MAXIMAS,
  AMOSTRAS_PADRAO
} from '../src/sign-model-store.js';
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
  assert.equal(arquivo.formato, 'soletra-modelo');
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
    [{ formato: 'soletra-modelo', esquema: 99 }, 'esquema incompatível'],
    [
      { formato: 'soletra-modelo', esquema: 1, versaoFeatures: VERSAO_FEATURES + 5, classes: {} },
      'versão de features diferente'
    ],
    [
      { formato: 'soletra-modelo', esquema: 1, versaoFeatures: VERSAO_FEATURES, classes: { A: [[1, 2, 3]] } },
      'dimensão errada'
    ],
    [
      { formato: 'soletra-modelo', esquema: 1, versaoFeatures: VERSAO_FEATURES, classes: { Ω: [vetor(0)] } },
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
    formato: 'soletra-modelo',
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

// --- Cenário 8b: arquivo exportado antes do rename continua importável --
// O produto se chamava "RVL Libras" e gravava esse nome no campo `formato`. A
// validação é estrita, então recusá-lo tornaria inútil justamente a cópia de
// segurança que o usuário exportou antes de atualizar.
{
  const legado = {
    formato: 'rvl-libras-modelo',
    esquema: 1,
    versaoFeatures: VERSAO_FEATURES,
    mao: 'direita',
    classes: { A: [vetor(0)], S: [vetor(2)] }
  };

  const v = SignModelStore.validarArquivo(legado);
  assert.equal(v.ok, true, `arquivo legado deve ser aceito, erro: ${v.erro}`);
  assert.equal(v.contagem, 2);

  const store = new SignModelStore(areaFalsa());
  const r = await store.importar(legado, 'substituir');
  assert.equal(r.classes, 2);

  const { classes } = await store.carregar();
  assert.deepEqual(Object.keys(classes).sort(), ['A', 'S']);

  // E a exportação grava só o nome novo.
  const exportado = await store.exportar();
  assert.equal(exportado.formato, 'soletra-modelo');
  console.log('OK  cenário 8b — .json exportado antes do rename ainda importa');
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

// --- Modelo padrão ---------------------------------------------------------

const arquivoPadrao = (classes) => ({
  formato: 'soletra-modelo',
  esquema: 1,
  versaoFeatures: VERSAO_FEATURES,
  mao: 'esquerda',
  classes
});

// --- Cenário 11: instalar o padrão alimenta o classificador ---------------
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  await store.atualizarParametros({ mao: 'direita' });

  const r = await store.instalarPadrao(arquivoPadrao({ A: [vetor(0), vetor(0.1)], B: [vetor(1)] }));
  assert.deepEqual(r, { classes: 2, amostras: 3 });

  const { indice, classes, origem } = await store.carregar();
  assert.equal(classes.A.length, 2);
  assert.deepEqual(origem.A, { padrao: 2, pessoal: 0 });
  assert.equal(indice.mao, 'direita', 'a mão do arquivo padrão não sobrescreve a do usuário');
  assert.ok(area.mapa.has(`${PREFIXO_PADRAO}A`), 'padrão fica em chave própria');
  assert.ok(!area.mapa.has(`${PREFIXO_CLASSE}A`));
  console.log('OK  cenário 11 — instalar o padrão grava em chave própria e preserva a mão');
}

// --- Cenário 12: reforço pessoal soma ao padrão --------------------------
{
  const store = new SignModelStore(areaFalsa());
  await store.instalarPadrao(arquivoPadrao({ A: [vetor(0), vetor(0.1)] }));

  assert.equal(await store.adicionarAmostra('A', vetor(5)), 3, 'retorna o total da classe');
  const { classes, origem } = await store.carregar();
  assert.equal(classes.A.length, 3);
  assert.deepEqual(origem.A, { padrao: 2, pessoal: 1 });
  console.log('OK  cenário 12 — amostras pessoais somam às do padrão');
}

// --- Cenário 13: no teto, sai primeiro a amostra padrão -------------------
{
  const store = new SignModelStore(areaFalsa());
  const base = Array.from({ length: AMOSTRAS_MAXIMAS }, (_, i) => vetor(i));
  await store.instalarPadrao(arquivoPadrao({ A: base }));
  let { origem } = await store.carregar();
  assert.deepEqual(origem.A, { padrao: AMOSTRAS_PADRAO, pessoal: 0 }, 'o padrão entra limitado por classe');

  // Até o teto, reforçar não custa nenhuma amostra do padrão.
  const livres = AMOSTRAS_MAXIMAS - AMOSTRAS_PADRAO;
  for (let i = 0; i < livres; i++) await store.adicionarAmostra('A', vetor(1000 + i));
  ({ origem } = await store.carregar());
  assert.deepEqual(origem.A, { padrao: AMOSTRAS_PADRAO, pessoal: livres });

  for (let i = 0; i < 5; i++) await store.adicionarAmostra('A', vetor(2000 + i));
  ({ origem } = await store.carregar());
  assert.deepEqual(origem.A, { padrao: AMOSTRAS_PADRAO - 5, pessoal: livres + 5 });

  for (let i = 0; i < AMOSTRAS_MAXIMAS; i++) await store.adicionarAmostra('A', vetor(3000 + i));
  ({ origem } = await store.carregar());
  assert.deepEqual(origem.A, { padrao: 0, pessoal: AMOSTRAS_MAXIMAS }, 'o padrão cede por inteiro');
  console.log('OK  cenário 13 — no teto, o padrão cede lugar às amostras do usuário');
}

// --- Cenário 14: restaurar uma classe descarta só as pessoais -------------
{
  const store = new SignModelStore(areaFalsa());
  await store.instalarPadrao(arquivoPadrao({ A: [vetor(0)], B: [vetor(1)] }));
  await store.adicionarAmostra('A', vetor(5));
  await store.adicionarAmostra('B', vetor(6));

  await store.restaurarClasse('A');
  const { origem } = await store.carregar();
  assert.deepEqual(origem.A, { padrao: 1, pessoal: 0 }, 'A volta ao padrão');
  assert.deepEqual(origem.B, { padrao: 1, pessoal: 1 }, 'B não é afetada');
  console.log('OK  cenário 14 — voltar ao padrão numa classe não mexe nas outras');
}

// --- Cenário 15: reinstalar o padrão preserva as pessoais -----------------
{
  const store = new SignModelStore(areaFalsa());
  await store.adicionarAmostra('A', vetor(5));
  await store.instalarPadrao(arquivoPadrao({ A: [vetor(0)], C: [vetor(2)] }));
  await store.instalarPadrao(arquivoPadrao({ A: [vetor(0), vetor(0.2)] }));

  const { origem } = await store.carregar();
  assert.deepEqual(origem.A, { padrao: 2, pessoal: 1 });
  assert.equal(origem.C, undefined, 'classe que saiu do padrão novo não fica de resíduo');
  console.log('OK  cenário 15 — reinstalar o padrão troca o padrão e mantém o treino pessoal');
}

// --- Cenário 16: apagar tudo e apagar classe incluem o padrão -------------
{
  const area = areaFalsa();
  const store = new SignModelStore(area);
  await store.instalarPadrao(arquivoPadrao({ A: [vetor(0)], B: [vetor(1)] }));
  await store.adicionarAmostra('A', vetor(5));

  await store.removerClasse('A');
  assert.ok(!area.mapa.has(`${PREFIXO_PADRAO}A`) && !area.mapa.has(`${PREFIXO_CLASSE}A`));

  await store.limpar();
  assert.equal(area.mapa.size, 0, 'o padrão também é apagado pelo "Apagar tudo"');
  console.log('OK  cenário 16 — eliminação alcança também as amostras do padrão');
}

// --- Cenário 17: modelo antigo, sem chave de padrão, continua válido -----
{
  const area = areaFalsa();
  area.mapa.set(CHAVE_INDICE, {
    esquema: 1, versaoFeatures: VERSAO_FEATURES, mao: 'direita', contagem: { A: 1 }
  });
  area.mapa.set(`${PREFIXO_CLASSE}A`, { classe: 'A', amostras: [vetor(0)] });

  const store = new SignModelStore(area);
  const { origem } = await store.carregar();
  assert.deepEqual(origem.A, { padrao: 0, pessoal: 1 });
  assert.equal(await store.adicionarAmostra('A', vetor(1)), 2);
  console.log('OK  cenário 17 — índice gravado antes do modelo padrão é lido sem migração');
}

console.log('\ntodos os cenários passaram');
