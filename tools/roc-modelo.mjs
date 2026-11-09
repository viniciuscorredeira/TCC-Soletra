/**
 * Curvas ROC de um modelo parado, sem câmera, de forma reproduzível.
 * Uso: node tools/roc-modelo.mjs [modelo.json] [--blocos 17] [--saida roc.json] [--sem-json]
 *
 * Sem modelo, mede o modelo pronto (modelos/padrao.json). A validação é a mesma
 * do tools/medir-modelo.mjs: cada bloco de amostras seguidas de uma classe sai
 * inteiro do modelo e é classificado pelo resto, com o próprio
 * src/sign-classifier.js (k = 5, voto ponderado), sem limiar e sem teste de
 * razão. Para letras e números, mede duas separações:
 *
 * a) Cada classe contra as demais. Para cada amostra e cada classe do conjunto,
 *    a pontuação é a distância da amostra até a amostra mais próxima da classe:
 *    quanto menor, mais a amostra "é" daquela classe. Dá a AUC global (todos os
 *    pares amostra × classe juntos), a média das AUC das classes e a de cada uma.
 * b) Acerto contra erro, pela razão vencedora/segunda, que é o critério do
 *    teste de razão: quanto menor a razão, mais confiável a resposta. Dá a AUC e
 *    o ponto de cada corte da razão (0,80, 0,90, 0,97 e 0,99).
 *
 * A AUC é a estatística de Mann-Whitney com empates contando meio, que é a área
 * sob a curva em escada. Não há dependência: só o classificador da extensão.
 *
 * Saída: tabela no terminal, com vírgula decimal, e um JSON em medicoes/ com as
 * AUC e os pontos das curvas (taxa de falsos positivos, taxa de verdadeiros
 * positivos), de onde sai a Figura 8 do TCC.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { SignClassifier, PADROES_CLASSIFICADOR } from '../src/sign-classifier.js';
import { LETRAS_ESTATICAS, NUMEROS } from '../src/sign-classes.js';
import { identidadeModelo } from '../src/identidade-modelo.js';
import { CORTES_RAZAO, NOMES_CONJUNTO, blocos } from './medicao-modelo.js';
import { lerModelo, montarArquivo as montarArquivoMedicao } from './medir-modelo.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FORMATO_ROC = 'soletra-roc-modelo';
export const VERSAO_ROC = 1;

/** Os valores que o TCC publica (Figura 8), com três casas, para conferência. */
export const AUC_TCC = {
  letras: { global: 0.978, mediaClasses: 0.975, razao: 0.979 },
  numeros: { global: 0.95, mediaClasses: 0.946, razao: 0.973 }
};

/**
 * AUC de Mann-Whitney: a chance de uma pontuação positiva, sorteada, ser maior
 * que uma negativa, com empates contando meio.
 * @param {number[]} positivos pontuações dos casos positivos (maior = mais positivo)
 * @param {number[]} negativos pontuações dos casos negativos
 */
export function auc(positivos, negativos) {
  if (!positivos.length || !negativos.length) return NaN;
  const todos = [
    ...positivos.map((v) => ({ v, pos: true })),
    ...negativos.map((v) => ({ v, pos: false }))
  ].sort((a, b) => a.v - b.v);
  let somaPostos = 0;
  for (let i = 0; i < todos.length; ) {
    let j = i;
    while (j + 1 < todos.length && todos[j + 1].v === todos[i].v) j++;
    const posto = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (todos[k].pos) somaPostos += posto;
    i = j + 1;
  }
  const np = positivos.length;
  return (somaPostos - (np * (np + 1)) / 2) / (np * negativos.length);
}

/**
 * Pontos da curva ROC em escada, do canto (0, 0) ao (1, 1): um por limiar
 * distinto, sem os pontos do meio de cada trecho reto.
 * @returns {number[][]} pares [taxa de falsos positivos, taxa de verdadeiros positivos]
 */
export function curvaRoc(positivos, negativos) {
  const todos = [
    ...positivos.map((v) => ({ v, pos: true })),
    ...negativos.map((v) => ({ v, pos: false }))
  ].sort((a, b) => b.v - a.v);
  const pontos = [[0, 0]];
  let vp = 0;
  let fp = 0;
  for (let i = 0; i < todos.length; ) {
    let j = i;
    while (j < todos.length && todos[j].v === todos[i].v) {
      if (todos[j].pos) vp++;
      else fp++;
      j++;
    }
    pontos.push([fp / negativos.length, vp / positivos.length]);
    i = j;
  }
  const enxuta = [pontos[0]];
  for (let i = 1; i < pontos.length - 1; i++) {
    const [a, b, c] = [enxuta[enxuta.length - 1], pontos[i], pontos[i + 1]];
    const reto = (a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1]);
    if (!reto) enxuta.push(b);
  }
  enxuta.push(pontos[pontos.length - 1]);
  return enxuta.map(([x, y]) => [arred(x, 5), arred(y, 5)]);
}

const arred = (x, casas) => Math.round(x * 10 ** casas) / 10 ** casas;

/**
 * Classifica cada amostra do conjunto na validação em blocos e guarda, além da
 * resposta, a distância até cada classe. O classificador é o da extensão sem
 * os cortes, como em tools/medicao-modelo.js: carrega o modelo inteiro, filtra
 * o conjunto e não rejeita nada (sem limiar e sem teste de razão).
 */
export function coletarPrevisoes(classes, nomes, tamanho) {
  const todas = Object.keys(classes);
  const previsoes = [];
  for (const classe of nomes) {
    const amostras = classes[classe];
    for (const [inicio, fim] of blocos(amostras.length, tamanho)) {
      const treino = {};
      for (const outra of todas) {
        treino[outra] = outra === classe ? amostras.filter((_, i) => i < inicio || i >= fim) : classes[outra];
      }
      const clf = new SignClassifier().carregar(treino, { tauAbs: Infinity }).filtrarPor(nomes);
      Object.defineProperty(clf, 'razaoEfetiva', { value: Infinity });
      for (let i = inicio; i < fim; i++) {
        const r = clf.classificar(amostras[i], { detalhar: true });
        previsoes.push({
          classe,
          previsto: r.classe,
          razao: r.razao,
          distancia: Object.fromEntries(r.ranking.map((x) => [x.classe, x.distancia]))
        });
      }
    }
  }
  return previsoes;
}

/** As duas separações (a e b) de um conjunto de classes. */
export function medirConjunto(classes, nomes, tamanho) {
  const previsoes = coletarPrevisoes(classes, nomes, tamanho);

  // a) Cada classe contra as demais: pontuação = −distância até a classe.
  const porClasse = {};
  const globalPos = [];
  const globalNeg = [];
  for (const c of nomes) {
    const pos = [];
    const neg = [];
    for (const p of previsoes) (p.classe === c ? pos : neg).push(-p.distancia[c]);
    porClasse[c] = arred(auc(pos, neg), 5);
    globalPos.push(...pos);
    globalNeg.push(...neg);
  }
  const valores = Object.values(porClasse);
  const umContraTodos = {
    auc: arred(auc(globalPos, globalNeg), 5),
    aucMediaClasses: arred(valores.reduce((s, v) => s + v, 0) / valores.length, 5),
    porClasse,
    curva: curvaRoc(globalPos, globalNeg)
  };

  // b) Acerto contra erro pela razão: pontuação = −razão.
  const acertos = previsoes.filter((p) => p.previsto === p.classe).map((p) => p.razao);
  const erros = previsoes.filter((p) => p.previsto !== p.classe).map((p) => p.razao);
  const acertoErro = {
    acertos: acertos.length,
    erros: erros.length,
    auc: arred(auc(acertos.map((r) => -r), erros.map((r) => -r)), 5),
    cortes: CORTES_RAZAO.map((corte) => ({
      corte,
      taxaVerdadeirosPositivos: arred(acertos.filter((r) => r <= corte).length / acertos.length, 5),
      taxaFalsosPositivos: arred(erros.filter((r) => r <= corte).length / erros.length, 5)
    })),
    curva: curvaRoc(acertos.map((r) => -r), erros.map((r) => -r))
  };

  return { classes: nomes, amostras: previsoes.length, umContraTodos, acertoErro };
}

/** Confere as AUC com as que o TCC publica, arredondadas a três casas. */
export function conferirTcc(conjuntos, esperado = AUC_TCC) {
  const itens = [];
  for (const [id, valores] of Object.entries(esperado)) {
    const c = conjuntos[id];
    if (!c) continue;
    const medido = { global: c.umContraTodos.auc, mediaClasses: c.umContraTodos.aucMediaClasses, razao: c.acertoErro.auc };
    for (const [chave, v] of Object.entries(valores)) {
      itens.push({ conjunto: id, medida: chave, esperado: v, medido: medido[chave], bate: arred(medido[chave], 3) === v });
    }
  }
  return { bate: itens.every((i) => i.bate), itens };
}

export async function medirRoc(modelo, { tamanho = 17 } = {}) {
  const { objeto, classes } = modelo;
  const conjuntos = {};
  const definicoes = { letras: LETRAS_ESTATICAS, numeros: NUMEROS };
  for (const [id, lista] of Object.entries(definicoes)) {
    const nomes = lista.filter((n) => classes[n]?.length);
    if (nomes.length >= 2) conjuntos[id] = medirConjunto(classes, nomes, tamanho);
  }
  const sha256 = await identidadeModelo({ versaoFeatures: objeto.versaoFeatures, classes });
  const nomes = Object.keys(classes);
  return {
    modelo: {
      sha256,
      sha256Arquivo: modelo.sha256Arquivo ?? null,
      classes: nomes.length,
      amostras: nomes.reduce((s, n) => s + classes[n].length, 0)
    },
    conjuntos,
    conferenciaTcc: tamanho === 17 ? conferirTcc(conjuntos) : null
  };
}

const decimal = (x, casas = 3) => (Number.isFinite(x) ? x.toFixed(casas).replace('.', ',') : '—');
const porcento = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1).replace('.', ',')}%` : '—');

export function formatarTerminal(arquivo) {
  const linhas = [];
  const titulo = (t) => linhas.push('', t, '-'.repeat(t.length));
  linhas.push(`Soletra — curvas ROC do modelo ${arquivo.arquivo}`);
  linhas.push(`${arquivo.modelo.classes} classes, ${arquivo.modelo.amostras} amostras · SHA-256 ${arquivo.modelo.sha256}`);
  linhas.push(`commit ${arquivo.commit} · ${new Date(arquivo.dataHora).toLocaleString('pt-BR')}`);
  linhas.push(`k = ${arquivo.parametros.k}, voto ponderado, validação em blocos de ${arquivo.parametros.bloco} amostras seguidas`);

  titulo('a) Cada classe contra as demais (pontuação: distância até a classe)');
  linhas.push(`${'Conjunto'.padEnd(14)}${'AUC global'.padStart(12)}${'média das classes'.padStart(20)}   classes mais fracas`);
  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    const fracas = Object.entries(c.umContraTodos.porClasse).sort((a, b) => a[1] - b[1]).slice(0, 3)
      .map(([n, v]) => `${n} ${decimal(v, 2)}`).join(', ');
    linhas.push(`${`${NOMES_CONJUNTO[id]} (${c.classes.length})`.padEnd(14)}${decimal(c.umContraTodos.auc).padStart(12)}${decimal(c.umContraTodos.aucMediaClasses).padStart(20)}   ${fracas}`);
  }

  titulo('b) Acerto contra erro, pela razão vencedora/segunda');
  linhas.push(`${'Conjunto'.padEnd(14)}${'AUC'.padStart(8)}${'acertos'.padStart(10)}${'erros'.padStart(8)}   ${arquivo.parametros.cortesRazao.map((c) => `corte ${decimal(c, 2)}`.padStart(18)).join('')}`);
  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    const a = c.acertoErro;
    const pontos = a.cortes.map((p) => `${porcento(p.taxaVerdadeirosPositivos)} · ${porcento(p.taxaFalsosPositivos)}`.padStart(18)).join('');
    linhas.push(`${`${NOMES_CONJUNTO[id]} (${c.classes.length})`.padEnd(14)}${decimal(a.auc).padStart(8)}${String(a.acertos).padStart(10)}${String(a.erros).padStart(8)}   ${pontos}`);
  }
  linhas.push('  Em cada corte: acertos aceitos · erros aceitos (taxas de verdadeiros e de falsos positivos).');

  const conf = arquivo.conferenciaTcc;
  if (conf) {
    linhas.push('');
    linhas.push(conf.bate
      ? `Confere com a Figura 8 do TCC: ${conf.itens.length} de ${conf.itens.length} AUC iguais.`
      : `ATENÇÃO: não confere com a Figura 8 do TCC — ${conf.itens.filter((i) => !i.bate).map((i) => `${NOMES_CONJUNTO[i.conjunto]} ${i.medida}: esperado ${decimal(i.esperado)}, medido ${decimal(i.medido)}`).join('; ')}.`);
  }
  return linhas.join('\n');
}

/** Relativo ao projeto quando está dentro dele; senão, o caminho inteiro. */
function caminhoLegivel(caminho) {
  const rel = relative(RAIZ, caminho).replaceAll('\\', '/');
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : caminho;
}

async function principal(argv) {
  let entrada = join(RAIZ, 'modelos', 'padrao.json');
  let saida = null;
  let semJson = false;
  let tamanho = 17;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--saida') saida = resolve(argv[++i]);
    else if (argv[i] === '--sem-json') semJson = true;
    else if (argv[i] === '--blocos') tamanho = Number(argv[++i]);
    else if (argv[i].startsWith('--')) throw new Error(`Opção desconhecida: ${argv[i]}`);
    else entrada = resolve(argv[i]);
  }
  if (!Number.isInteger(tamanho) || tamanho <= 0) throw new Error('--blocos espera um tamanho inteiro, como 17.');

  const modelo = lerModelo(entrada);
  const medida = await medirRoc(modelo, { tamanho });
  // O cabeçalho (data, commit, ambiente) é o mesmo do tools/medir-modelo.mjs.
  const cabecalho = montarArquivoMedicao({ medicao: { conjuntos: {} }, arquivo: caminhoLegivel(entrada) });
  const arquivo = {
    formato: FORMATO_ROC,
    versaoFormato: VERSAO_ROC,
    dataHora: cabecalho.dataHora,
    commit: cabecalho.commit,
    ambiente: cabecalho.ambiente,
    arquivo: cabecalho.arquivo,
    parametros: { k: PADROES_CLASSIFICADOR.k, voto: cabecalho.parametros.voto, bloco: tamanho, cortesRazao: CORTES_RAZAO },
    ...medida
  };
  console.log(formatarTerminal(arquivo));

  if (!semJson) {
    const destino = saida ?? join(RAIZ, 'medicoes', `roc-modelo-${basename(entrada, '.json')}.json`);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, `${JSON.stringify(arquivo, null, 2)}\n`);
    console.log(`\nJSON gravado em ${caminhoLegivel(destino)}`);
  }
  return arquivo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve()
    .then(() => principal(process.argv.slice(2)))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}
