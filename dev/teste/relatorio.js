/**
 * Soletra (modo dev) — relatórios do teste de sinais.
 *
 *  - relatorioUnitario: um sinal, todas as rodadas dele.
 *  - relatorioGeral: todos os sinais da sessão, com tabela por sinal, matrizes
 *    de confusão (por rodada e por quadro), resumo e destaques.
 *
 * Puro: entra a lista de rodadas da sessão (sessao.js), sai um objeto pronto
 * para a tela e para os arquivos. As distribuições juntam os quadros de todas
 * as rodadas, a partir da linha do tempo de cada uma — não é média de medianas.
 * Uma rodada não reconhecida não tem gravação: entra nos resultados, mas não
 * nas contas por quadro.
 */
import { TODAS_AS_CLASSES } from '../../src/sign-classes.js';
import { distribuicao, fracao, media, quantil } from '../estatistica.js';

export const RESULTADOS = ['acerto', 'troca', 'rejeicao', 'tempo-esgotado', 'nao-reconhecido'];
const ordemCatalogo = (a, b) => TODAS_AS_CLASSES.indexOf(a) - TODAS_AS_CLASSES.indexOf(b);

const feitas = (rodadas) => rodadas.filter((r) => r.estado === 'feita');
const gravadas = (rodadas) => feitas(rodadas).filter((r) => r.analise);

/** Confirmações de outra letra durante a gravação (depois de a rodada começar). */
const erradasNaGravacao = (r) => (r.analise?.confirmacoes ?? []).filter((c) => c.classe !== r.sinal).length;

function somarQuadros(lista) {
  const total = { total: 0, validos: 0, certos: 0, outras: 0, rejeitados: 0, ambiguos: 0, distantes: 0, semMao: 0, bloqueados: 0 };
  for (const r of lista) for (const k of Object.keys(total)) total[k] += r.analise.quadros[k];
  return total;
}

function contarResultados(lista) {
  const n = Object.fromEntries(RESULTADOS.map((k) => [k, 0]));
  for (const r of lista) n[r.resultado]++;
  return n;
}

/** Estatísticas que valem para qualquer grupo de rodadas (um sinal ou a sessão toda). */
function agregar(rodadas) {
  const lista = feitas(rodadas);
  const comGravacao = gravadas(rodadas);
  const quadros = somarQuadros(comGravacao);
  const resultados = contarResultados(lista);
  const linhas = comGravacao.flatMap((r) => r.analise.linhaDoTempo);
  const validas = linhas.filter((l) => l.categoria === 'certo' || l.categoria === 'outra' || l.categoria === 'rejeitado');
  const reconhecidas = lista.filter((r) => Number.isFinite(r.tempoAteReconhecerMs));

  const confusoes = new Map();
  for (const r of comGravacao) for (const c of r.analise.confusoes) confusoes.set(c.classe, (confusoes.get(c.classe) || 0) + c.quadros);

  return {
    rodadas: lista.length,
    puladas: rodadas.length - lista.length,
    resultados,
    acerto: fracao(resultados.acerto, lista.length),
    taxaTroca: fracao(resultados.troca, lista.length),
    taxaRejeicao: fracao(resultados.rejeicao, lista.length),
    taxaTempoEsgotado: fracao(resultados['tempo-esgotado'], lista.length),
    taxaNaoReconhecido: fracao(resultados['nao-reconhecido'], lista.length),
    quadros,
    acertoQuadros: fracao(quadros.certos, quadros.validos),
    tempoAteReconhecer: distribuicao(reconhecidas.map((r) => r.tempoAteReconhecerMs)),
    tempoMedioAteReconhecer: media(reconhecidas.map((r) => r.tempoAteReconhecerMs)),
    confirmacoesErradasAntes: lista.reduce((s, r) => s + (r.confirmacoesAntes?.length ?? 0), 0),
    confirmacoesErradasNaGravacao: lista.reduce((s, r) => s + erradasNaGravacao(r), 0),
    confusoes: [...confusoes].map(([classe, n]) => ({ classe, quadros: n })).sort((a, b) => b.quadros - a.quadros),
    razao: distribuicao(validas.map((l) => l.razao)),
    razaoNosCertos: distribuicao(linhas.filter((l) => l.categoria === 'certo').map((l) => l.razao)),
    razaoNaConfirmacao: distribuicao(
      comGravacao.map((r) => r.analise.confirmacoes.find((c) => c.classe === r.sinal)?.razao)
    ),
    distanciaAlvo: distribuicao(validas.map((l) => l.distanciaAlvo)),
    latencia: { p50: quantil(linhas.map((l) => l.latencia), 0.5), p95: quantil(linhas.map((l) => l.latencia), 0.95) },
    hz: media(comGravacao.map((r) => r.analise.hz))
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
    inicio: lista[0]?.inicio ?? null,
    ...agregar(doSinal),
    ajustes: gravadas(doSinal).at(-1)?.analise.ajustes ?? null,
    rodadasDetalhe: lista.map((r) => ({
      repeticao: r.repeticao,
      resultado: r.resultado,
      reconhecido: r.reconhecido,
      tempoAteReconhecerMs: r.tempoAteReconhecerMs,
      confirmacoesAntes: r.confirmacoesAntes ?? [],
      confirmacoesErradasNaGravacao: erradasNaGravacao(r),
      acertoQuadros: r.analise?.acertoQuadros ?? null,
      maiorSequencia: r.analise?.maiorSequencia ?? { quadros: 0, ms: 0 },
      mudancasDeClasse: r.analise?.mudancasDeClasse ?? 0,
      linhaDoTempo: (r.analise?.linhaDoTempo ?? []).map(({ ms, categoria, classe }) => ({ ms, categoria, classe }))
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

  // Matriz por rodada: a primeira letra confirmada (ou o motivo de não ter havido).
  const matrizRodadas = {};
  // Matriz por quadro: o que o classificador deu em cada quadro gravado.
  const matrizQuadros = {};
  for (const s of sinais) {
    matrizRodadas[s] = {};
    matrizQuadros[s] = {};
  }
  const somar = (m, s, k, n = 1) => (m[s][k] = (m[s][k] || 0) + n);
  for (const r of feitas(rodadas)) {
    somar(matrizRodadas, r.sinal, r.reconhecido ?? r.resultado);
    const a = r.analise;
    if (!a) continue;
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
    inicio: feitas(rodadas)[0]?.inicio ?? null,
    resumo: agregar(rodadas),
    porSinal,
    matrizRodadas: {
      linhas: sinais,
      colunas: [...classesVistas(matrizRodadas), 'rejeicao', 'tempo-esgotado', 'nao-reconhecido'],
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
