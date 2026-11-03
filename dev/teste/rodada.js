/**
 * Soletra (modo dev) — análise de uma rodada do teste de sinais.
 *
 * Uma rodada é o intervalo fixo (5 s por padrão) em que a pessoa mantém o
 * sinal pedido. Entra a lista de quadros que o reconhecedor publicou nesse
 * intervalo (observarQuadros); sai tudo o que o relatório mostra dela. Puro:
 * sem relógio, DOM nem chrome.*, para ser testado em Node com quadros
 * sintéticos.
 *
 * Categorias de quadro:
 *  - certo      o classificador deu o sinal pedido;
 *  - outra      deu outra classe;
 *  - rejeitado  mão vista, mas o classificador recusou (ambíguo ou distante);
 *  - sem-mao    nenhuma mão (ou mão que não pôde ser normalizada);
 *  - bloqueada  mão diferente da configurada: a tradução fica travada.
 *
 * "Válidos" são os quadros em que o classificador decidiu algo (certo, outra
 * ou rejeitado). O acerto por quadro é certos ÷ válidos.
 *
 * Resultado formal da rodada, pela primeira letra confirmada:
 *  - acerto          a primeira confirmação é o sinal pedido;
 *  - troca           a primeira confirmação é outra classe;
 *  - rejeicao        nenhuma confirmação e mais da metade dos quadros com mão
 *                    foi rejeitada pelo classificador;
 *  - tempo-esgotado  nenhuma confirmação por outro motivo (sem mão, mão
 *                    bloqueada, candidato que não chegou a firmar).
 */
import { distribuicao, fracao, moda, mediana, quantil } from '../estatistica.js';

function categoria(q, sinal) {
  if (q.maoBloqueada) return 'bloqueada';
  const c = q.classificacao;
  if (!q.landmarks || !c) return 'sem-mao';
  if (c.classe === sinal) return 'certo';
  if (c.classe) return 'outra';
  return 'rejeitado';
}

/**
 * @param {object} rodada
 * @param {string} rodada.sinal classe pedida
 * @param {number} rodada.inicio instante do "Agora!" (mesmo relógio de quadro.t)
 * @param {number} rodada.duracao em ms
 * @param {object[]} rodada.quadros quadros publicados pelo reconhecedor
 */
export function analisarRodada({ sinal, inicio, duracao, quadros }) {
  const dentro = quadros.filter((q) => q.t >= inicio && q.t < inicio + duracao && !q.captura);

  const contagem = { total: dentro.length, validos: 0, certos: 0, outras: 0, rejeitados: 0, ambiguos: 0, distantes: 0, semMao: 0, bloqueados: 0 };
  const confusoes = new Map();
  const confirmacoes = [];
  const linhaDoTempo = [];

  let sequencia = null;
  let maiorSequencia = { quadros: 0, ms: 0 };
  let mudancas = 0;
  let estadoAnterior;

  for (const q of dentro) {
    const cat = categoria(q, sinal);
    const c = q.classificacao;
    const ms = q.t - inicio;
    const distanciaAlvo = c?.ranking?.find((r) => r.classe === sinal)?.distancia ?? null;

    if (cat === 'certo') contagem.certos++;
    else if (cat === 'outra') {
      contagem.outras++;
      confusoes.set(c.classe, (confusoes.get(c.classe) || 0) + 1);
    } else if (cat === 'rejeitado') {
      contagem.rejeitados++;
      if (c.motivo === 'ambiguo') contagem.ambiguos++;
      if (c.motivo === 'distante') contagem.distantes++;
    } else if (cat === 'sem-mao') contagem.semMao++;
    else contagem.bloqueados++;
    if (cat === 'certo' || cat === 'outra' || cat === 'rejeitado') {
      contagem.validos++;
      // Mudança de decisão entre quadros válidos seguidos: mede o "pisca-pisca".
      const estado = c.classe ?? 'rejeitado';
      if (estadoAnterior !== undefined && estado !== estadoAnterior) mudancas++;
      estadoAnterior = estado;
    }

    if (cat === 'certo') {
      sequencia = sequencia ? { ...sequencia, fim: ms, quadros: sequencia.quadros + 1 } : { inicio: ms, fim: ms, quadros: 1 };
      if (sequencia.quadros > maiorSequencia.quadros) {
        maiorSequencia = { quadros: sequencia.quadros, ms: sequencia.fim - sequencia.inicio };
      }
    } else {
      sequencia = null;
    }

    const confirmou = q.estabilizador?.confirmou;
    if (confirmou) confirmacoes.push({ classe: confirmou, ms, razao: c?.razao ?? null, distanciaAlvo });

    linhaDoTempo.push({
      ms,
      categoria: cat,
      classe: c?.classe ?? null,
      motivo: c?.motivo ?? null,
      razao: Number.isFinite(c?.razao) ? c.razao : null,
      distanciaAlvo,
      latencia: q.duracao
    });
  }

  const primeira = confirmacoes[0] ?? null;
  const comMao = contagem.validos + contagem.bloqueados;
  let resultado;
  if (primeira) resultado = primeira.classe === sinal ? 'acerto' : 'troca';
  else resultado = contagem.rejeitados > comMao / 2 ? 'rejeicao' : 'tempo-esgotado';

  const validos = linhaDoTempo.filter((l) => l.categoria === 'certo' || l.categoria === 'outra' || l.categoria === 'rejeitado');
  const ultimo = dentro.at(-1);
  const ajustes = (q) => q && [q.limiarRazao, q.limiarDistancia, q.rigor, q.permanencia].join('|');

  return {
    quadros: contagem,
    acertoQuadros: fracao(contagem.certos, contagem.validos),
    confusoes: [...confusoes].map(([classe, n]) => ({ classe, quadros: n })).sort((a, b) => b.quadros - a.quadros),
    confirmacoes,
    primeiraConfirmacao: primeira,
    resultado,
    reconhecido: primeira?.classe ?? null,
    maiorSequencia,
    mudancasDeClasse: mudancas,
    razao: distribuicao(validos.map((l) => l.razao)),
    razaoNosCertos: distribuicao(linhaDoTempo.filter((l) => l.categoria === 'certo').map((l) => l.razao)),
    distanciaAlvo: distribuicao(validos.map((l) => l.distanciaAlvo)),
    latencia: { p50: quantil(dentro.map((q) => q.duracao), 0.5), p95: quantil(dentro.map((q) => q.duracao), 0.95) },
    hz: duracao > 0 ? (dentro.length * 1000) / duracao : null,
    mao: {
      detectada: moda(dentro.map((q) => q.maoDetectada)),
      confiancaMediana: mediana(dentro.map((q) => q.confiancaMao)),
      configurada: ultimo?.maoConfigurada ?? null
    },
    ajustes: ultimo
      ? {
          limiarRazao: ultimo.limiarRazao,
          limiarDistancia: ultimo.limiarDistancia,
          rigor: ultimo.rigor,
          permanencia: ultimo.permanencia,
          mudaramNaRodada: new Set(dentro.map(ajustes)).size > 1
        }
      : null,
    linhaDoTempo
  };
}
