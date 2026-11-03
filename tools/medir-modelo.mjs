/**
 * Mede um modelo parado, sem câmera, de forma reproduzível.
 * Uso: node tools/medir-modelo.mjs [modelo.json] [--comparar outro.json] [--saida medicao.json] [--sem-json]
 *
 * Sem modelo, mede o modelo pronto (modelos/padrao.json). A classificação é a
 * do próprio src/sign-classifier.js, não uma reimplementação: o script só
 * monta os conjuntos de treino e teste e conta o que o classificador responde.
 *
 * Métricas:
 * 1. Acerto por validação em blocos: cada bloco de amostras seguidas de uma
 *    classe sai inteiro do modelo e é classificado pelo resto (as outras
 *    classes ficam completas). Blocos, e não amostras soltas, porque amostras
 *    vizinhas na gravação são quase iguais: tirar uma só e achar a gêmea ao lado
 *    mediria memória, não reconhecimento. Sem limiar e sem teste de razão, com
 *    k = 5 e voto ponderado. Letras (21), números (10) e os dois juntos (31).
 * 2. Razão vencedora/segunda nos acertos e nos erros.
 * 3. O que cada corte da razão faria: acertos descartados e erros barrados.
 * 4. O efeito do rigor da interface, com o limiar e a razão multiplicados
 *    exatamente como na extensão (o classificador é o mesmo).
 * Mais o limiar calculado para o modelo, os pares de classes mais próximos e,
 * com --comparar, a comparação com outro modelo (por exemplo, gravado por
 * outra pessoa), incluindo treinar com um e testar com o outro.
 *
 * Saída: tabela no terminal, com vírgula decimal, e um JSON com cabeçalho
 * (data, commit e SHA-256 do modelo) em medicoes/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { SignClassifier, PADROES_CLASSIFICADOR, LIMIAR_DISTANCIA_PADRAO, calibrarTauAbs } from '../src/sign-classifier.js';
import { SignModelStore } from '../src/sign-model-store.js';
import { distancia } from '../src/sign-features.js';
import { LETRAS_ESTATICAS, NUMEROS } from '../src/sign-classes.js';
import { identidadeModelo } from '../src/identidade-modelo.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FORMATO_MEDICAO = 'soletra-medicao-modelo';
export const VERSAO_MEDICAO = 1;

export const BLOCOS = [17, 25];
export const CORTES_RAZAO = [0.8, 0.9, 0.97, 0.99];
export const RIGORES = [
  { nome: 'Tolerante', multiplicador: 1.25 },
  { nome: 'Normal', multiplicador: 1.0 },
  { nome: 'Exigente', multiplicador: 0.8 }
];

/** Mesmo fator que calibrarTauAbs aplica ao percentil 90 da dispersão interna. */
const FATOR_DISPERSAO = 5;

/**
 * Tabela do TCC (seção 4.3), medida no modelo pronto. Se o modelo medido for
 * esse — mesma identidade —, o script confere que ainda a reproduz.
 */
export const TABELA_TCC = {
  sha256: '313a5735d88001c80bc393ccee451618a43c690d7445b783eb9403f078b41d7c',
  acerto: {
    letras: { 17: 0.934, 25: 0.93 },
    numeros: { 17: 0.92, 25: 0.902 },
    juntos: { 17: 0.875, 25: 0.858 }
  }
};

const NOMES_CONJUNTO = { letras: 'Letras', numeros: 'Números', juntos: 'Juntos' };

// --- Estatística ---------------------------------------------------------

/** Quantil por interpolação linear (o padrão do NumPy), para conferir fora daqui. */
function quantil(ordenado, p) {
  if (ordenado.length === 0) return null;
  const pos = (ordenado.length - 1) * p;
  const base = Math.floor(pos);
  const proximo = ordenado[base + 1] ?? ordenado[base];
  return ordenado[base] + (proximo - ordenado[base]) * (pos - base);
}

export function distribuicao(valores) {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return null;
  return {
    n: v.length,
    min: v[0],
    p10: quantil(v, 0.1),
    p25: quantil(v, 0.25),
    mediana: quantil(v, 0.5),
    p75: quantil(v, 0.75),
    p90: quantil(v, 0.9),
    max: v[v.length - 1]
  };
}

const fracao = (parte, todo) => (todo > 0 ? parte / todo : null);

// --- Validação em blocos -------------------------------------------------

/** Intervalos [início, fim) de `tamanho` amostras seguidas; o último pode ser menor. */
export function blocos(n, tamanho) {
  const lista = [];
  for (let i = 0; i < n; i += tamanho) lista.push([i, Math.min(n, i + tamanho)]);
  return lista;
}

/**
 * O classificador da extensão sem o teste de razão: a decisão (k vizinhos,
 * voto ponderado) é a mesma; só a razão efetiva, que o rigor limita a 0,99,
 * deixa de barrar. Com tauAbs = Infinity, também não há limiar de distância.
 */
function classificadorSemCortes(treino, conjunto) {
  const clf = new SignClassifier().carregar(treino, { tauAbs: Infinity }).filtrarPor(conjunto);
  Object.defineProperty(clf, 'razaoEfetiva', { value: Infinity });
  return clf;
}

/**
 * Valida um conjunto de classes com blocos de um tamanho.
 *
 * Como na extensão, o classificador carrega o modelo inteiro e filtra o
 * conjunto ativo: a decisão só olha as classes do conjunto, mas o limiar de
 * distância é calibrado sobre todas as classes do modelo.
 * @returns {{previsoes: object[], limiares: number[]}} uma previsão por amostra
 */
function validar(classes, nomes, tamanho) {
  const todas = Object.keys(classes);
  const previsoes = [];
  const limiares = [];
  for (const classe of nomes) {
    const amostras = classes[classe];
    for (const [inicio, fim] of blocos(amostras.length, tamanho)) {
      const treino = {};
      for (const outra of todas) {
        treino[outra] = outra === classe ? amostras.filter((_, i) => i < inicio || i >= fim) : classes[outra];
      }
      const semCortes = classificadorSemCortes(treino, nomes);
      // A extensão recalibra o limiar sobre o modelo que tem; aqui, sobre o treino.
      const tauAbs = calibrarTauAbs(treino);
      limiares.push(tauAbs);
      const comRigor = RIGORES.map(({ multiplicador }) =>
        new SignClassifier({ rigor: multiplicador }).carregar(treino, { tauAbs }).filtrarPor(nomes)
      );

      for (let i = inicio; i < fim; i++) {
        const r = semCortes.classificar(amostras[i]);
        previsoes.push({
          classe,
          previsto: r.classe,
          razao: r.razao,
          distancia: r.distanciaMin,
          rigor: comRigor.map((clf) => {
            const d = clf.classificar(amostras[i]);
            return d.classe === null ? d.motivo : d.classe === classe ? 'certo' : 'errado';
          })
        });
      }
    }
  }
  return { previsoes, limiares };
}

function contarConfusoes(pares) {
  const contagem = new Map();
  for (const [real, previsto] of pares) {
    const chave = `${real}→${previsto ?? '—'}`;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return [...contagem]
    .map(([par, vezes]) => {
      const [real, previsto] = par.split('→');
      return { real, previsto, vezes };
    })
    .sort((a, b) => b.vezes - a.vezes || a.real.localeCompare(b.real) || a.previsto.localeCompare(b.previsto));
}

function resumirValidacao(nomes, { previsoes, limiares }, tamanho) {
  const acertos = previsoes.filter((p) => p.previsto === p.classe);
  const erros = previsoes.filter((p) => p.previsto !== p.classe);

  const porClasse = {};
  for (const nome of nomes) {
    const daClasse = previsoes.filter((p) => p.classe === nome);
    const certos = daClasse.filter((p) => p.previsto === nome).length;
    porClasse[nome] = {
      amostras: daClasse.length,
      acertos: certos,
      acerto: fracao(certos, daClasse.length),
      confundidaCom: contarConfusoes(daClasse.filter((p) => p.previsto !== nome).map((p) => [p.classe, p.previsto]))
        .map(({ previsto, vezes }) => ({ classe: previsto, vezes }))
    };
  }

  const cortes = CORTES_RAZAO.map((corte) => {
    const descartados = acertos.filter((p) => p.razao > corte).length;
    const barrados = erros.filter((p) => p.razao > corte).length;
    return {
      corte,
      acertosDescartados: descartados,
      fracaoAcertosDescartados: fracao(descartados, acertos.length),
      errosBarrados: barrados,
      fracaoErrosBarrados: fracao(barrados, erros.length),
      acertoFinal: fracao(acertos.length - descartados, previsoes.length)
    };
  });

  const rigor = RIGORES.map(({ nome, multiplicador }, i) => {
    const conta = (motivo) => previsoes.filter((p) => p.rigor[i] === motivo).length;
    const certos = conta('certo');
    const errados = conta('errado');
    const ambiguos = conta('ambiguo');
    const distantes = conta('distante');
    const referencia = new SignClassifier({ rigor: multiplicador });
    return {
      nome,
      multiplicador,
      razaoEfetiva: referencia.razaoEfetiva,
      limiarEfetivoMediano: quantil([...limiares].sort((a, b) => a - b), 0.5) * multiplicador,
      acertoFinal: fracao(certos, previsoes.length),
      rejeicao: fracao(ambiguos + distantes, previsoes.length),
      rejeitadasAmbiguas: ambiguos,
      rejeitadasDistantes: distantes,
      errosQuePassam: fracao(errados, previsoes.length),
      errosQuePassamQuantidade: errados,
      precisao: fracao(certos, certos + errados)
    };
  });

  return {
    tamanhoBloco: tamanho,
    amostras: previsoes.length,
    acertos: acertos.length,
    acerto: fracao(acertos.length, previsoes.length),
    porClasse,
    confusoes: contarConfusoes(erros.map((p) => [p.classe, p.previsto])),
    razao: { acertos: distribuicao(acertos.map((p) => p.razao)), erros: distribuicao(erros.map((p) => p.razao)) },
    cortes,
    rigor
  };
}

// --- Limiar e vizinhança -------------------------------------------------

/** Menor distância de cada amostra às outras amostras da mesma classe e das outras classes. */
function vizinhancas(classes, nomes) {
  const mesma = [];
  const outra = [];
  for (const nome of nomes) {
    for (const [i, a] of classes[nome].entries()) {
      let dMesma = Infinity;
      let dOutra = Infinity;
      for (const outraClasse of nomes) {
        for (const [j, b] of classes[outraClasse].entries()) {
          if (outraClasse === nome && i === j) continue;
          const d = distancia(a, b);
          if (outraClasse === nome) dMesma = Math.min(dMesma, d);
          else dOutra = Math.min(dOutra, d);
        }
      }
      mesma.push(dMesma);
      outra.push(dOutra);
    }
  }
  return { mesma, outra };
}

/**
 * O limiar que a extensão calcula para este modelo (sobre todas as classes,
 * como na instalação) e quantas amostras de outra classe do conjunto ficam
 * abaixo dele: o limiar só rejeita o que estiver longe de TUDO.
 */
function medirLimiar(classes, nomes) {
  const calibrado = calibrarTauAbs(classes);
  const p90 = distribuicao(vizinhancas(classes, Object.keys(classes)).mesma)?.p90 ?? null;
  const { mesma, outra } = vizinhancas(classes, nomes);
  return {
    padrao: LIMIAR_DISTANCIA_PADRAO,
    p90MesmaClasse: p90,
    cincoVezesP90: p90 === null ? null : p90 * FATOR_DISPERSAO,
    calibrado,
    distanciaMesmaClasse: distribuicao(mesma),
    distanciaOutraClasse: distribuicao(outra),
    porRigor: RIGORES.map(({ nome, multiplicador }) => {
      const limiar = calibrado * multiplicador;
      const abaixo = outra.filter((d) => d <= limiar).length;
      return { nome, limiar, amostrasComOutraClasseAbaixo: abaixo, fracao: fracao(abaixo, outra.length) };
    })
  };
}

/**
 * Pares de classes mais próximos: para cada amostra de A, a distância até a
 * amostra mais próxima de B (e vice-versa); vale a mediana das duas direções.
 */
function paresMaisProximos(classes, nomes, quantos = 12) {
  const pares = [];
  for (let x = 0; x < nomes.length; x++) {
    for (let y = x + 1; y < nomes.length; y++) {
      const a = classes[nomes[x]];
      const b = classes[nomes[y]];
      const deA = a.map((va) => Math.min(...b.map((vb) => distancia(va, vb))));
      const deB = b.map((vb) => Math.min(...a.map((va) => distancia(va, vb))));
      const medA = distribuicao(deA).mediana;
      const medB = distribuicao(deB).mediana;
      pares.push({ par: `${nomes[x]}/${nomes[y]}`, distanciaMediana: (medA + medB) / 2, menor: Math.min(...deA) });
    }
  }
  return pares.sort((p, q) => p.distanciaMediana - q.distanciaMediana).slice(0, quantos);
}

// --- Medição -------------------------------------------------------------

function conjuntosDe(classes) {
  const presentes = (lista) => lista.filter((c) => classes[c]?.length > 0);
  const conjuntos = {
    letras: presentes(LETRAS_ESTATICAS),
    numeros: presentes(NUMEROS),
    juntos: presentes([...LETRAS_ESTATICAS, ...NUMEROS])
  };
  // Com uma classe só não há o que confundir: o conjunto fica de fora.
  return Object.fromEntries(Object.entries(conjuntos).filter(([, nomes]) => nomes.length >= 2));
}

/** Lê e valida um modelo exportado (o mesmo critério da importação na extensão). */
export function lerModelo(caminho) {
  const bytes = readFileSync(caminho);
  const objeto = JSON.parse(bytes.toString('utf8'));
  const v = SignModelStore.validarArquivo(objeto);
  if (!v.ok) throw new Error(`${caminho}: ${v.erro}`);
  return { objeto, classes: v.classes, sha256Arquivo: createHash('sha256').update(bytes).digest('hex') };
}

/**
 * @param {{objeto: object, classes: Record<string, number[][]>}} modelo
 * @param {{blocos?: number[]}} [opcoes]
 */
export async function medirModelo({ objeto, classes, sha256Arquivo = null }, { blocos: tamanhos = BLOCOS } = {}) {
  const nomes = Object.keys(classes);
  const sha256 = await identidadeModelo({ versaoFeatures: objeto.versaoFeatures, classes });
  const conjuntos = {};
  for (const [id, nomesDoConjunto] of Object.entries(conjuntosDe(classes))) {
    conjuntos[id] = {
      classes: nomesDoConjunto,
      validacao: tamanhos.map((t) => resumirValidacao(nomesDoConjunto, validar(classes, nomesDoConjunto, t), t)),
      limiar: medirLimiar(classes, nomesDoConjunto)
    };
  }
  const juntos = conjuntosDe(classes).juntos ?? nomes;
  return {
    modelo: {
      sha256,
      sha256Arquivo,
      versaoFeatures: objeto.versaoFeatures,
      criadoEm: objeto.criadoEm ?? null,
      pessoas: objeto.pessoas ?? null,
      classes: nomes.length,
      amostras: nomes.reduce((s, n) => s + classes[n].length, 0),
      amostrasPorClasse: Object.fromEntries(nomes.map((n) => [n, classes[n].length]))
    },
    conjuntos,
    paresMaisProximos: paresMaisProximos(classes, juntos),
    conferenciaTcc: conferirTcc(sha256, conjuntos)
  };
}

/** Compara com a tabela do TCC quando o modelo é o mesmo; null quando não é. */
export function conferirTcc(sha256, conjuntos, tabela = TABELA_TCC) {
  if (!tabela.sha256 || sha256 !== tabela.sha256) return null;
  const itens = [];
  for (const [id, porBloco] of Object.entries(tabela.acerto)) {
    for (const [tamanho, esperado] of Object.entries(porBloco)) {
      const medido = conjuntos[id]?.validacao.find((v) => v.tamanhoBloco === Number(tamanho))?.acerto ?? null;
      // A tabela traz uma casa decimal em porcentagem: compara nessa precisão.
      const bate = medido !== null && Math.round(medido * 1000) === Math.round(esperado * 1000);
      itens.push({ conjunto: id, tamanhoBloco: Number(tamanho), esperado, medido, bate });
    }
  }
  return { bate: itens.every((i) => i.bate), itens };
}

/**
 * Treina com todas as amostras de um modelo e classifica todas as do outro:
 * mede o quanto um modelo serve à mão de quem não o gravou.
 */
export function medirCruzado(treino, teste) {
  const resultado = {};
  for (const [id, nomes] of Object.entries(conjuntosDe(teste))) {
    const doTreino = Object.fromEntries(nomes.filter((n) => treino[n]?.length).map((n) => [n, treino[n]]));
    if (Object.keys(doTreino).length < 2) continue;
    const semCortes = classificadorSemCortes(doTreino);
    const normal = new SignClassifier().carregar(doTreino);
    let n = 0;
    let certos = 0;
    const normalConta = { certo: 0, errado: 0, ambiguo: 0, distante: 0 };
    const erros = [];
    for (const nome of nomes) {
      for (const v of teste[nome]) {
        n++;
        const r = semCortes.classificar(v);
        if (r.classe === nome) certos++;
        else erros.push([nome, r.classe]);
        const d = normal.classificar(v);
        normalConta[d.classe === null ? d.motivo : d.classe === nome ? 'certo' : 'errado']++;
      }
    }
    resultado[id] = {
      amostras: n,
      acerto: fracao(certos, n),
      normal: {
        limiar: normal.limiarEfetivo,
        acertoFinal: fracao(normalConta.certo, n),
        rejeicao: fracao(normalConta.ambiguo + normalConta.distante, n),
        errosQuePassam: fracao(normalConta.errado, n)
      },
      confusoes: contarConfusoes(erros).slice(0, 10)
    };
  }
  return resultado;
}

// --- Cabeçalho e saída ---------------------------------------------------

function commitAtual() {
  try {
    const opcoes = { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] };
    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], opcoes).toString().trim();
    let modificado = false;
    try {
      execFileSync('git', ['diff', '--quiet', 'HEAD'], opcoes);
    } catch {
      modificado = true;
    }
    return modificado ? `${hash}-modificado` : hash;
  } catch {
    return 'desconhecido';
  }
}

const arredondar = (valor) =>
  JSON.parse(JSON.stringify(valor, (_, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v)));

export function montarArquivo({ medicao, arquivo, comparacao = null, dataHora = new Date().toISOString(), commit = commitAtual() }) {
  return arredondar({
    formato: FORMATO_MEDICAO,
    versaoFormato: VERSAO_MEDICAO,
    dataHora,
    commit,
    node: process.version,
    arquivo,
    parametros: {
      k: PADROES_CLASSIFICADOR.k,
      voto: 'ponderado por 1/(d + 1e-6)',
      razaoMax: PADROES_CLASSIFICADOR.razaoMax,
      razaoTeto: new SignClassifier({ razaoMax: 1, rigor: 100 }).razaoEfetiva,
      limiarPadrao: LIMIAR_DISTANCIA_PADRAO,
      blocos: medicao.conjuntos.juntos?.validacao.map((v) => v.tamanhoBloco) ?? BLOCOS,
      cortesRazao: CORTES_RAZAO,
      rigores: RIGORES
    },
    ...medicao,
    ...(comparacao ? { comparacao } : {})
  });
}

// --- Terminal ------------------------------------------------------------

const decimal = (x, casas = 2) => (Number.isFinite(x) ? x.toFixed(casas).replace('.', ',') : '—');
export const porcento = (x, casas = 1) => (Number.isFinite(x) ? `${decimal(x * 100, casas)}%` : '—');
const coluna = (texto, largura) => String(texto).padStart(largura);

export function formatarTerminal(arquivo) {
  const linhas = [];
  const titulo = (t) => linhas.push('', t, '-'.repeat(t.length));
  const m = arquivo.modelo;
  const blocosMedidos = arquivo.parametros.blocos;

  linhas.push(`Soletra — medição do modelo ${arquivo.arquivo}`);
  linhas.push(`${m.classes} classes, ${m.amostras} amostras · SHA-256 ${m.sha256}`);
  linhas.push(`commit ${arquivo.commit} · ${new Date(arquivo.dataHora).toLocaleString('pt-BR')}`);
  linhas.push(`k = ${arquivo.parametros.k}, voto ponderado, validação em blocos de ${blocosMedidos.join(' e ')} amostras seguidas`);

  titulo('1. Acerto por validação em blocos (sem limiar e sem teste de razão)');
  linhas.push(`${'Conjunto'.padEnd(14)}${blocosMedidos.map((t) => coluna(`blocos de ${t}`, 15)).join('')}`);
  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    linhas.push(`${`${NOMES_CONJUNTO[id]} (${c.classes.length})`.padEnd(14)}${c.validacao.map((v) => coluna(porcento(v.acerto), 15)).join('')}`);
  }
  const conf = arquivo.conferenciaTcc;
  if (conf) {
    linhas.push('');
    linhas.push(conf.bate
      ? `Confere com a tabela do TCC: ${conf.itens.length} de ${conf.itens.length} valores iguais.`
      : `ATENÇÃO: não confere com a tabela do TCC — ${conf.itens.filter((i) => !i.bate).map((i) => `${NOMES_CONJUNTO[i.conjunto]} blocos de ${i.tamanhoBloco}: esperado ${porcento(i.esperado)}, medido ${porcento(i.medido)}`).join('; ')}.`);
  }

  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    linhas.push('', `${NOMES_CONJUNTO[id]} — acerto por classe (${blocosMedidos.map((t) => `blocos de ${t}`).join(' / ')})`);
    const celulas = c.classes.map((nome) => `${nome.padEnd(2)} ${c.validacao.map((v) => porcento(v.porClasse[nome].acerto, 0).padStart(4)).join(' /')}`);
    for (let i = 0; i < celulas.length; i += 5) linhas.push(`  ${celulas.slice(i, i + 5).map((t) => t.padEnd(16)).join('')}`.trimEnd());
    const confusoes = c.validacao[0].confusoes.slice(0, 8).map((x) => `${x.real}→${x.previsto} (${x.vezes})`).join(', ');
    linhas.push(`  Confusões mais frequentes (blocos de ${c.validacao[0].tamanhoBloco}): ${confusoes || 'nenhuma'}`);
  }

  titulo('2. Razão vencedora/segunda');
  linhas.push(`${'Conjunto'.padEnd(20)}${'n'.padStart(6)}${['mín', 'p10', 'p25', 'mediana', 'p75', 'p90', 'máx'].map((t) => coluna(t, 8)).join('')}`);
  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    for (const v of c.validacao) {
      for (const [rotulo, d] of [['acertos', v.razao.acertos], ['erros', v.razao.erros]]) {
        const nome = `${NOMES_CONJUNTO[id]} b${v.tamanhoBloco} ${rotulo}`;
        linhas.push(`${nome.padEnd(20)}${coluna(d?.n ?? 0, 6)}${['min', 'p10', 'p25', 'mediana', 'p75', 'p90', 'max'].map((k) => coluna(decimal(d?.[k]), 8)).join('')}`);
      }
    }
  }

  titulo('3. Efeito do corte da razão (acertos descartados · erros barrados · acerto que sobra)');
  linhas.push(`${'Conjunto'.padEnd(14)}${arquivo.parametros.cortesRazao.map((c) => coluna(`corte ${decimal(c)}`, 24)).join('')}`);
  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    for (const v of c.validacao) {
      const celulas = v.cortes.map((x) => coluna(`${porcento(x.fracaoAcertosDescartados)} · ${porcento(x.fracaoErrosBarrados, 0)} · ${porcento(x.acertoFinal)}`, 24));
      linhas.push(`${`${NOMES_CONJUNTO[id]} b${v.tamanhoBloco}`.padEnd(14)}${celulas.join('')}`);
    }
  }

  titulo('4. Efeito do rigor (limiar e razão como na extensão)');
  linhas.push(`${'Conjunto'.padEnd(14)}${'Rigor'.padEnd(11)}${['razão', 'limiar', 'acerto', 'rejeição', 'erro passa', 'precisão'].map((t) => coluna(t, 11)).join('')}`);
  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    for (const v of c.validacao) {
      for (const r of v.rigor) {
        linhas.push(
          `${`${NOMES_CONJUNTO[id]} b${v.tamanhoBloco}`.padEnd(14)}${r.nome.padEnd(11)}` +
            [decimal(r.razaoEfetiva), decimal(r.limiarEfetivoMediano), porcento(r.acertoFinal), porcento(r.rejeicao), porcento(r.errosQuePassam), porcento(r.precisao)]
              .map((t) => coluna(t, 11)).join('')
        );
      }
    }
  }

  titulo('5. Limiar de distância calculado para o modelo (todas as classes, como na extensão)');
  const l0 = Object.values(arquivo.conjuntos)[0]?.limiar;
  if (l0) linhas.push(`max(${decimal(l0.padrao, 1)}; 5 × p90 da vizinha da mesma classe ${decimal(l0.p90MesmaClasse, 3)} = ${decimal(l0.cincoVezesP90, 3)}) = ${decimal(l0.calibrado, 3)}`);
  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    const l = c.limiar;
    linhas.push(
      `${NOMES_CONJUNTO[id]}:` +
        ` vizinha da mesma classe: mediana ${decimal(l.distanciaMesmaClasse?.mediana, 3)}` +
        ` · da outra classe: mediana ${decimal(l.distanciaOutraClasse?.mediana, 3)}, mín ${decimal(l.distanciaOutraClasse?.min, 3)}`
    );
    linhas.push(`  amostras com uma de outra classe abaixo do limiar: ${l.porRigor.map((r) => `${r.nome} ${porcento(r.fracao)} (${r.amostrasComOutraClasseAbaixo})`).join(' · ')}`);
  }

  titulo('6. Pares de classes mais próximos (mediana da distância à vizinha da outra classe)');
  const pares = arquivo.paresMaisProximos.map((p) => `${p.par} ${decimal(p.distanciaMediana, 3)}`);
  for (let i = 0; i < pares.length; i += 4) linhas.push(`  ${pares.slice(i, i + 4).map((t) => t.padEnd(18)).join('')}`.trimEnd());

  if (arquivo.comparacao) {
    const cmp = arquivo.comparacao;
    titulo(`7. Comparação com ${cmp.arquivo} (SHA-256 ${cmp.modelo.sha256.slice(0, 12)}…)`);
    linhas.push(`${'Conjunto'.padEnd(14)}${'este'.padStart(10)}${'outro'.padStart(10)}${'este→outro'.padStart(14)}${'outro→este'.padStart(14)}`);
    for (const [id, c] of Object.entries(arquivo.conjuntos)) {
      for (const v of c.validacao) {
        const o = cmp.conjuntos[id]?.validacao.find((x) => x.tamanhoBloco === v.tamanhoBloco);
        linhas.push(`${`${NOMES_CONJUNTO[id]} b${v.tamanhoBloco}`.padEnd(14)}${coluna(porcento(v.acerto), 10)}${coluna(porcento(o?.acerto), 10)}`);
      }
      linhas.push(`${`${NOMES_CONJUNTO[id]} cruzado`.padEnd(34)}${coluna(porcento(cmp.cruzado.desteParaOutro[id]?.acerto), 14)}${coluna(porcento(cmp.cruzado.doOutroParaEste[id]?.acerto), 14)}`);
      const normal = (x) => (x ? `${porcento(x.normal.acertoFinal)} acerto, ${porcento(x.normal.rejeicao)} rejeição` : '—');
      linhas.push(`  rigor Normal, cruzado: este→outro ${normal(cmp.cruzado.desteParaOutro[id])} · outro→este ${normal(cmp.cruzado.doOutroParaEste[id])}`);
    }
    linhas.push('  "este→outro": treina com todas as amostras deste modelo e classifica as do outro.');
  }
  return linhas.join('\n');
}

// --- Linha de comando ----------------------------------------------------

function principal(argv) {
  let entrada = join(RAIZ, 'modelos', 'padrao.json');
  let saida = null;
  let comparar = null;
  let semJson = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--saida') saida = resolve(argv[++i]);
    else if (argv[i] === '--comparar') comparar = resolve(argv[++i]);
    else if (argv[i] === '--sem-json') semJson = true;
    else if (argv[i].startsWith('--')) throw new Error(`Opção desconhecida: ${argv[i]}`);
    else entrada = resolve(argv[i]);
  }
  return executar({ entrada, saida, comparar, semJson });
}

/** Relativo ao projeto quando está dentro dele; senão, o caminho inteiro. */
function caminhoLegivel(caminho) {
  const rel = relative(RAIZ, caminho).replaceAll('\\', '/');
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : caminho;
}

async function executar({ entrada, saida, comparar, semJson }) {
  const modelo = lerModelo(entrada);
  const medicao = await medirModelo(modelo);
  let comparacao = null;
  if (comparar) {
    const outro = lerModelo(comparar);
    const medicaoOutro = await medirModelo(outro);
    comparacao = {
      arquivo: caminhoLegivel(comparar),
      modelo: medicaoOutro.modelo,
      conjuntos: medicaoOutro.conjuntos,
      cruzado: { desteParaOutro: medirCruzado(modelo.classes, outro.classes), doOutroParaEste: medirCruzado(outro.classes, modelo.classes) }
    };
  }
  const arquivo = montarArquivo({ medicao, arquivo: caminhoLegivel(entrada), comparacao });
  console.log(formatarTerminal(arquivo));

  if (!semJson) {
    const destino = saida ?? join(RAIZ, 'medicoes', `medir-modelo-${basename(entrada, '.json')}${comparar ? `-x-${basename(comparar, '.json')}` : ''}.json`);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, `${JSON.stringify(arquivo, null, 2)}\n`);
    console.log(`\nJSON gravado em ${caminhoLegivel(destino)}`);
  }
  return arquivo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
