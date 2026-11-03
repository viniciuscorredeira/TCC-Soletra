/**
 * Soletra — medição de um modelo parado: o cálculo, sem arquivo nem terminal.
 *
 * Usado por tools/medir-modelo.mjs (linha de comando) e pela seção "Medir o
 * modelo" do modo dev, que o roda num Web Worker: os dois dão os mesmos
 * números. Não importa nada de Node nem do DOM. A classificação é a do próprio
 * src/sign-classifier.js; aqui só se montam os conjuntos de treino e teste e
 * se conta o que o classificador responde. As métricas estão descritas em
 * tools/medir-modelo.mjs.
 */
import { SignClassifier, PADROES_CLASSIFICADOR, LIMIAR_DISTANCIA_PADRAO, calibrarTauAbs } from '../src/sign-classifier.js';
import { SignModelStore } from '../src/sign-model-store.js';
import { distancia } from '../src/sign-features.js';
import { LETRAS_ESTATICAS, NUMEROS } from '../src/sign-classes.js';
import { identidadeModelo } from '../src/identidade-modelo.js';

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


export const NOMES_CONJUNTO = { letras: 'Letras', numeros: 'Números', juntos: 'Juntos' };

/**
 * [id, valor] na ordem letras, números, juntos. Quem mostra uma medição usa
 * isto, e não Object.entries: o chrome.storage devolve as chaves em ordem
 * alfabética, o que poria "juntos" primeiro.
 */
export function emOrdem(porConjunto) {
  return Object.keys(NOMES_CONJUNTO).filter((id) => porConjunto?.[id]).map((id) => [id, porConjunto[id]]);
}

/** "extensão 0.3.0 · navegador …" ou "Node v26…", para cabeçalhos e planilhas. */
export function descreverAmbiente(arquivo) {
  const nomes = { extensao: 'extensão', navegador: 'navegador', node: 'Node' };
  const ambiente = arquivo.ambiente || (arquivo.node ? { node: arquivo.node } : {});
  return Object.entries(ambiente).map(([k, v]) => `${nomes[k] ?? k} ${v}`).join(' · ');
}

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
function validar(classes, nomes, tamanho, aoTreinar) {
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
      aoTreinar?.();
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

/**
 * Valida um modelo exportado com o mesmo critério da importação na extensão.
 * @returns {{objeto: object, classes: Record<string, number[][]>}}
 */
export function validarModelo(objeto) {
  const v = SignModelStore.validarArquivo(objeto);
  if (!v.ok) throw new Error(v.erro);
  return { objeto, classes: v.classes };
}

/** Quantos treinos a validação vai montar: serve para mostrar o progresso. */
function contarEtapas(classes, tamanhos) {
  let total = 0;
  for (const nomes of Object.values(conjuntosDe(classes))) {
    for (const t of tamanhos) for (const n of nomes) total += blocos(classes[n].length, t).length;
  }
  return total;
}

/**
 * Classe com amostras demais num bloco só: sem nada dela no treino, ela não
 * tem como ser acertada, e o acerto cai por um motivo que não é o classificador.
 */
function avisosDeTamanho(classes, tamanhos) {
  const avisos = [];
  for (const t of tamanhos) {
    const pequenas = Object.keys(classes).filter((n) => classes[n].length <= t);
    if (pequenas.length) {
      avisos.push(
        `Com blocos de ${t}, ${pequenas.join(', ')} ${pequenas.length > 1 ? 'saem inteiras' : 'sai inteira'} do treino ` +
          `(${t} amostras ou menos) e não ${pequenas.length > 1 ? 'podem' : 'pode'} ser acertada${pequenas.length > 1 ? 's' : ''}: use blocos menores.`
      );
    }
  }
  return avisos;
}

/**
 * @param {{objeto: object, classes: Record<string, number[][]>, sha256Arquivo?: string|null}} modelo
 * @param {object} [opcoes]
 * @param {number[]} [opcoes.blocos] tamanhos dos blocos
 * @param {(p: {feitas: number, total: number, etapa: string}) => void} [opcoes.aoProgresso]
 */
export async function medirModelo({ objeto, classes, sha256Arquivo = null }, { blocos: tamanhos = BLOCOS, aoProgresso } = {}) {
  const nomes = Object.keys(classes);
  const sha256 = await identidadeModelo({ versaoFeatures: objeto.versaoFeatures, classes });
  const total = contarEtapas(classes, tamanhos);
  let feitas = 0;
  const conjuntos = {};
  for (const [id, nomesDoConjunto] of Object.entries(conjuntosDe(classes))) {
    const validacao = [];
    for (const t of tamanhos) {
      const etapa = `${NOMES_CONJUNTO[id]}, blocos de ${t}`;
      aoProgresso?.({ feitas, total, etapa });
      const resultado = validar(classes, nomesDoConjunto, t, () => aoProgresso?.({ feitas: ++feitas, total, etapa }));
      validacao.push(resumirValidacao(nomesDoConjunto, resultado, t));
    }
    conjuntos[id] = { classes: nomesDoConjunto, validacao, limiar: medirLimiar(classes, nomesDoConjunto) };
  }
  aoProgresso?.({ feitas, total, etapa: 'Pares de classes mais próximos' });
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
    avisos: avisosDeTamanho(classes, tamanhos),
    conjuntos,
    paresMaisProximos: paresMaisProximos(classes, juntos),
    conferenciaTcc: conferirTcc(sha256, conjuntos)
  };
}

/**
 * Compara com a tabela do TCC quando o modelo é o mesmo, nos tamanhos de bloco
 * que foram medidos; null quando o modelo é outro ou nenhum tamanho coincide.
 */
export function conferirTcc(sha256, conjuntos, tabela = TABELA_TCC) {
  if (!tabela.sha256 || sha256 !== tabela.sha256) return null;
  const itens = [];
  for (const [id, porBloco] of Object.entries(tabela.acerto)) {
    for (const [tamanho, esperado] of Object.entries(porBloco)) {
      const v = conjuntos[id]?.validacao.find((x) => x.tamanhoBloco === Number(tamanho));
      if (!v) continue;
      // A tabela traz uma casa decimal em porcentagem: compara nessa precisão.
      const bate = Math.round(v.acerto * 1000) === Math.round(esperado * 1000);
      itens.push({ conjunto: id, tamanhoBloco: Number(tamanho), esperado, medido: v.acerto, bate });
    }
  }
  return itens.length ? { bate: itens.every((i) => i.bate), itens } : null;
}

/**
 * Treina com todas as amostras de um modelo e classifica todas as do outro:
 * mede o quanto um modelo serve à mão de quem não o gravou. Como na extensão,
 * o limiar é calibrado sobre o modelo de treino inteiro e o conjunto é filtrado.
 */
export function medirCruzado(treino, teste) {
  const resultado = {};
  for (const [id, nomes] of Object.entries(conjuntosDe(teste))) {
    const presentes = nomes.filter((n) => treino[n]?.length);
    if (presentes.length < 2) continue;
    const semCortes = classificadorSemCortes(treino, presentes);
    const normal = new SignClassifier().carregar(treino).filtrarPor(presentes);
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

/**
 * O outro modelo medido do mesmo jeito, mais o cruzamento nos dois sentidos.
 * @param {object} [opcoes]
 * @param {string} [opcoes.rotulo] como o outro modelo aparece no relatório
 */
export async function compararModelos(modelo, outro, { rotulo, blocos: tamanhos = BLOCOS, aoProgresso } = {}) {
  const medicaoOutro = await medirModelo(outro, { blocos: tamanhos, aoProgresso });
  return {
    arquivo: rotulo,
    modelo: medicaoOutro.modelo,
    avisos: medicaoOutro.avisos,
    conjuntos: medicaoOutro.conjuntos,
    cruzado: {
      desteParaOutro: medirCruzado(modelo.classes, outro.classes),
      doOutroParaEste: medirCruzado(outro.classes, modelo.classes)
    }
  };
}

/**
 * Seis casas, e não quatro: uma fração como 977/1050 = 0,930476 guardada como
 * 0,9305 viraria 93,1% ao ser arredondada de novo para a tela, e o TCC diz 93,0%.
 */
const arredondar = (valor) =>
  JSON.parse(JSON.stringify(valor, (_, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v)));

/**
 * O arquivo da medição, igual no terminal e no modo dev.
 * @param {object} partes
 * @param {string} partes.arquivo de onde veio o modelo (caminho ou descrição)
 * @param {object} [partes.ambiente] onde rodou: {node} no terminal, {navegador, extensao} no modo dev
 */
export function montarArquivo({ medicao, arquivo, comparacao = null, dataHora = new Date().toISOString(), commit = 'desconhecido', ambiente = {} }) {
  return arredondar({
    formato: FORMATO_MEDICAO,
    versaoFormato: VERSAO_MEDICAO,
    dataHora,
    commit,
    ambiente,
    arquivo,
    parametros: {
      k: PADROES_CLASSIFICADOR.k,
      voto: 'ponderado por 1/(d + 1e-6)',
      razaoMax: PADROES_CLASSIFICADOR.razaoMax,
      razaoTeto: new SignClassifier({ razaoMax: 1, rigor: 100 }).razaoEfetiva,
      limiarPadrao: LIMIAR_DISTANCIA_PADRAO,
      blocos: Object.values(medicao.conjuntos)[0]?.validacao.map((v) => v.tamanhoBloco) ?? BLOCOS,
      cortesRazao: CORTES_RAZAO,
      rigores: RIGORES
    },
    ...medicao,
    ...(comparacao ? { comparacao } : {})
  });
}
