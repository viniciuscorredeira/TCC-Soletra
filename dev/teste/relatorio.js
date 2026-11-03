/**
 * Soletra (modo dev) — relatórios do teste de sinais.
 *
 *  - relatorioUnitario: um sinal, todas as rodadas dele.
 *  - relatorioGeral: todos os sinais da sessão, com tabela por sinal, matrizes
 *    de confusão (por rodada e por quadro), resumo e destaques.
 *
 * Puro: entra a lista de rodadas da sessão (sessao.js), sai um objeto pronto
 * para a tela e para o JSON. As distribuições juntam os quadros de todas as
 * rodadas, a partir da linha do tempo de cada uma — não é média de medianas.
 */
import { TODAS_AS_CLASSES } from '../../src/sign-classes.js';
import { distribuicao, fracao, media, quantil } from '../estatistica.js';

const RESULTADOS = ['acerto', 'troca', 'rejeicao', 'tempo-esgotado'];
const ordemCatalogo = (a, b) => TODAS_AS_CLASSES.indexOf(a) - TODAS_AS_CLASSES.indexOf(b);

const feitas = (rodadas) => rodadas.filter((r) => r.estado === 'feita');

function somarQuadros(lista) {
  const total = { total: 0, validos: 0, certos: 0, outras: 0, rejeitados: 0, ambiguos: 0, distantes: 0, semMao: 0, bloqueados: 0 };
  for (const r of lista) for (const k of Object.keys(total)) total[k] += r.analise.quadros[k];
  return total;
}

function contarResultados(lista) {
  const n = Object.fromEntries(RESULTADOS.map((k) => [k, 0]));
  for (const r of lista) n[r.analise.resultado]++;
  return n;
}

/** Estatísticas que valem para qualquer grupo de rodadas (um sinal ou a sessão toda). */
function agregar(rodadas) {
  const lista = feitas(rodadas);
  const quadros = somarQuadros(lista);
  const resultados = contarResultados(lista);
  const linhas = lista.flatMap((r) => r.analise.linhaDoTempo);
  const validas = linhas.filter((l) => l.categoria === 'certo' || l.categoria === 'outra' || l.categoria === 'rejeitado');
  const acertos = lista.filter((r) => r.analise.resultado === 'acerto');

  const confusoes = new Map();
  for (const r of lista) for (const c of r.analise.confusoes) confusoes.set(c.classe, (confusoes.get(c.classe) || 0) + c.quadros);

  return {
    rodadas: lista.length,
    puladas: rodadas.length - lista.length,
    resultados,
    acerto: fracao(resultados.acerto, lista.length),
    taxaTroca: fracao(resultados.troca, lista.length),
    taxaRejeicao: fracao(resultados.rejeicao, lista.length),
    taxaTempoEsgotado: fracao(resultados['tempo-esgotado'], lista.length),
    quadros,
    acertoQuadros: fracao(quadros.certos, quadros.validos),
    tempoAteConfirmar: distribuicao(acertos.map((r) => r.analise.primeiraConfirmacao.ms)),
    tempoMedioAteConfirmar: media(acertos.map((r) => r.analise.primeiraConfirmacao.ms)),
    confusoes: [...confusoes].map(([classe, n]) => ({ classe, quadros: n })).sort((a, b) => b.quadros - a.quadros),
    razao: distribuicao(validas.map((l) => l.razao)),
    razaoNosCertos: distribuicao(linhas.filter((l) => l.categoria === 'certo').map((l) => l.razao)),
    razaoNaConfirmacao: distribuicao(acertos.map((r) => r.analise.primeiraConfirmacao.razao)),
    distanciaAlvo: distribuicao(validas.map((l) => l.distanciaAlvo)),
    latencia: { p50: quantil(linhas.map((l) => l.latencia), 0.5), p95: quantil(linhas.map((l) => l.latencia), 0.95) },
    hz: media(lista.map((r) => r.analise.hz))
  };
}

/** @param {string} sinal @param {object[]} rodadas da sessão (as de outros sinais são ignoradas) */
export function relatorioUnitario(sinal, rodadas) {
  const doSinal = rodadas.filter((r) => r.sinal === sinal);
  const lista = feitas(doSinal);
  return {
    tipo: 'unitario',
    sinal,
    conjunto: doSinal[0]?.conjunto ?? null,
    ...agregar(doSinal),
    ajustes: lista.at(-1)?.analise.ajustes ?? null,
    rodadasDetalhe: lista.map((r) => ({
      repeticao: r.repeticao,
      resultado: r.analise.resultado,
      reconhecido: r.analise.reconhecido,
      primeiraConfirmacaoMs: r.analise.primeiraConfirmacao?.ms ?? null,
      acertoQuadros: r.analise.acertoQuadros,
      maiorSequencia: r.analise.maiorSequencia,
      mudancasDeClasse: r.analise.mudancasDeClasse,
      linhaDoTempo: r.analise.linhaDoTempo.map(({ ms, categoria, classe }) => ({ ms, categoria, classe }))
    }))
  };
}

/** Pares de classes confundidas, somando os dois sentidos (A→B e B→A). */
function paresConfundidos(matrizQuadros, limite = 5) {
  const pares = new Map();
  for (const [pedido, linha] of Object.entries(matrizQuadros)) {
    for (const [reconhecido, n] of Object.entries(linha)) {
      if (!TODAS_AS_CLASSES.includes(reconhecido) || reconhecido === pedido || n === 0) continue;
      const chave = [pedido, reconhecido].sort(ordemCatalogo).join('↔');
      pares.set(chave, (pares.get(chave) || 0) + n);
    }
  }
  return [...pares].map(([par, quadros]) => ({ par, quadros })).sort((a, b) => b.quadros - a.quadros).slice(0, limite);
}

/** @param {object[]} rodadas da sessão */
export function relatorioGeral(rodadas) {
  const sinais = [...new Set(rodadas.map((r) => r.sinal))];
  const porSinal = sinais.map((s) => relatorioUnitario(s, rodadas)).map(({ rodadasDetalhe, ...resto }) => resto);

  // Matriz por rodada: o que a primeira confirmação deu (ou o motivo de não ter havido).
  const matrizRodadas = {};
  // Matriz por quadro: o que o classificador deu em cada quadro da rodada.
  const matrizQuadros = {};
  for (const s of sinais) {
    matrizRodadas[s] = {};
    matrizQuadros[s] = {};
  }
  const somar = (m, s, k, n = 1) => (m[s][k] = (m[s][k] || 0) + n);
  for (const r of feitas(rodadas)) {
    const a = r.analise;
    somar(matrizRodadas, r.sinal, a.reconhecido ?? a.resultado);
    if (a.quadros.certos) somar(matrizQuadros, r.sinal, r.sinal, a.quadros.certos);
    for (const c of a.confusoes) somar(matrizQuadros, r.sinal, c.classe, c.quadros);
    if (a.quadros.rejeitados) somar(matrizQuadros, r.sinal, 'rejeitado', a.quadros.rejeitados);
    if (a.quadros.semMao) somar(matrizQuadros, r.sinal, 'sem-mao', a.quadros.semMao);
    if (a.quadros.bloqueados) somar(matrizQuadros, r.sinal, 'bloqueada', a.quadros.bloqueados);
  }

  const classesVistas = (m) =>
    [...new Set([...sinais, ...Object.values(m).flatMap((l) => Object.keys(l))])].filter((k) => TODAS_AS_CLASSES.includes(k)).sort(ordemCatalogo);

  const comDados = porSinal.filter((s) => s.acertoQuadros !== null);

  return {
    tipo: 'geral',
    sinais,
    resumo: agregar(rodadas),
    porSinal,
    matrizRodadas: {
      linhas: sinais,
      colunas: [...classesVistas(matrizRodadas), 'rejeicao', 'tempo-esgotado'],
      celulas: matrizRodadas
    },
    matrizQuadros: {
      linhas: sinais,
      colunas: [...classesVistas(matrizQuadros), 'rejeitado', 'sem-mao', 'bloqueada'],
      celulas: matrizQuadros
    },
    destaques: {
      pioresSinais: [...comDados]
        .sort((a, b) => a.acertoQuadros - b.acertoQuadros)
        .slice(0, 5)
        .map((s) => ({ sinal: s.sinal, acertoQuadros: s.acertoQuadros, acerto: s.acerto })),
      paresConfundidos: paresConfundidos(matrizQuadros)
    }
  };
}
