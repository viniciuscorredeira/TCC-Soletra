/**
 * Soletra — seletor de plataforma de busca.
 *
 * Espelha a mecânica de dialogo.js de propósito: o pedido pendente fica numa
 * loja e o componente (componentes/SeletorPlataforma.jsx) desenha o Dialog do
 * Radix. A diferença é o que a promessa devolve — o id da plataforma escolhida,
 * ou null quando o usuário sai sem pesquisar, que é o caso que precisa ser
 * impossível de confundir.
 */
import { criarLoja } from '../ui/loja.js';

/**
 * Termo em conferência e quem recebe o foco de volta, ou null com o seletor
 * fechado.
 */
export const lojaPlataforma = criarLoja(
  /** @type {{termo: string, focoAnterior: Element | null} | null} */ (null)
);

let resolverPendente = null;

/** @param {string | null} escolha id da plataforma, ou null para sair sem pesquisar */
export function responderPlataforma(escolha) {
  if (!resolverPendente) return;

  const r = resolverPendente;
  resolverPendente = null;
  lojaPlataforma.definir(null);

  r(escolha);
}

/**
 * @param {string} termo texto reconhecido, exibido para conferência
 * @returns {Promise<string|null>} id da plataforma, ou null se fechou sem escolher
 */
export function escolherPlataforma(termo) {
  if (resolverPendente) responderPlataforma(null);

  const promessa = new Promise((resolve) => {
    resolverPendente = resolve;
  });
  lojaPlataforma.definir({ termo, focoAnterior: document.activeElement });

  return promessa;
}
