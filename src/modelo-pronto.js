/**
 * Soletra — instalação do modelo pronto e calibração do limiar.
 *
 * Sem MediaPipe nem DOM: o service worker usa isto para deixar o modelo pronto
 * instalado no momento em que a extensão é instalada, e o reconhecedor usa o
 * mesmo caminho quando o usuário restaura o padrão.
 */
import { calibrarTauAbs } from './sign-classifier.js';
import { VERSAO_CALIBRACAO } from './sign-model-store.js';

/** Modelo pronto empacotado na extensão — gerado por tools/montar-modelo-padrao.mjs. */
const CAMINHO_MODELO_PADRAO = 'modelos/padrao.json';

/**
 * Gravada pelo service worker ao instalar o modelo pronto: o painel ainda
 * pergunta, uma vez, se a pessoa quer seguir com ele ou treinar do zero. Sai
 * do storage assim que ela escolhe.
 */
export const CHAVE_ESCOLHA_PENDENTE = 'soletra.escolhaInicialPendente';

/**
 * Lê o modelo pronto empacotado. Ausência não é erro: o arquivo só existe
 * depois que alguém o gera com amostras de várias pessoas, e até lá a
 * extensão funciona só com treino próprio.
 * @returns {Promise<object|null>}
 */
export async function lerModeloPadrao() {
  try {
    const resposta = await fetch(chrome.runtime.getURL(CAMINHO_MODELO_PADRAO));
    if (!resposta.ok) return null;
    return await resposta.json();
  } catch {
    return null;
  }
}

/**
 * Recalibra τ_abs sobre o conjunto atual. O limiar depende da dispersão
 * interna das classes, que muda a cada amostra que entra ou sai.
 * @param {import('./sign-model-store.js').SignModelStore} store
 */
export async function calibrarModelo(store) {
  const { classes } = await store.carregar();
  const tauAbs = calibrarTauAbs(classes);
  await store.atualizarParametros({
    tauAbs: Number.isFinite(tauAbs) ? tauAbs : null,
    versaoCalibracao: VERSAO_CALIBRACAO
  });
}

/**
 * Instala o modelo pronto por baixo das amostras pessoais e recalibra. τ_abs
 * é sempre calculado sobre o conjunto final, e não lido do arquivo.
 * @param {import('./sign-model-store.js').SignModelStore} store
 * @param {object} objeto conteúdo de modelos/padrao.json
 * @returns {Promise<{classes: number, amostras: number}>}
 */
export async function instalarModeloPronto(store, objeto) {
  const r = await store.instalarPadrao(objeto);
  await calibrarModelo(store);
  return r;
}
