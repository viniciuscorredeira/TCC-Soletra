/**
 * Soletra — modal de confirmação.
 *
 * window.confirm() é bloqueado ou ignorado em vários contextos de extensão, e o
 * painel lateral é um deles na prática. As confirmações deste projeto são de
 * conformidade (consentimento para processar a imagem da mão, aviso de envio do
 * texto a terceiro) ou destrutivas (apagar amostras treinadas): nenhuma delas
 * pode depender de um diálogo que talvez não apareça, porque "aceitar em
 * silêncio" seria o pior resultado possível.
 *
 * Este módulo guarda só o pedido pendente; quem desenha é
 * componentes/DialogoConfirmacao.jsx, com o Dialog do Radix — que já cuida de
 * prender o foco, fechar no Escape e devolver o foco a quem estava com ele.
 */
import { criarLoja } from '../ui/loja.js';

/**
 * @typedef {object} PedidoConfirmacao
 * @property {string} titulo
 * @property {string} texto
 * @property {string} rotuloOk
 * @property {string} rotuloNao
 * @property {boolean} perigo
 * @property {Element | null} focoAnterior quem recebe o foco de volta ao fechar
 */

/** @type {ReturnType<typeof criarLoja<PedidoConfirmacao | null>>} */
export const lojaConfirmacao = criarLoja(null);

let resolverPendente = null;

/** @param {boolean} resposta */
export function responderConfirmacao(resposta) {
  if (!resolverPendente) return;

  const r = resolverPendente;
  resolverPendente = null;
  lojaConfirmacao.definir(null);

  r(resposta);
}

/**
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {string} opcoes.texto
 * @param {string} [opcoes.confirmar] rótulo do botão de aceite
 * @param {string} [opcoes.cancelar] rótulo do botão de recusa
 * @param {boolean} [opcoes.perigo] ação destrutiva: pinta o aceite de vermelho
 *   e deixa o foco inicial no "Não", para que um Enter reflexo não apague nada
 * @returns {Promise<boolean>}
 */
export function confirmar({
  titulo,
  texto,
  confirmar: rotuloOk = 'Sim',
  cancelar: rotuloNao = 'Não',
  perigo = false
}) {
  // Uma segunda chamada com um diálogo aberto cancela o anterior, em vez de
  // deixar a promessa pendurada para sempre.
  if (resolverPendente) responderConfirmacao(false);

  // Lido antes de o diálogo abrir: depois, o foco já estaria dentro dele.
  const focoAnterior = document.activeElement;

  const promessa = new Promise((resolve) => {
    resolverPendente = resolve;
  });
  lojaConfirmacao.definir({ titulo, texto, rotuloOk, rotuloNao, perigo, focoAnterior });

  return promessa;
}
