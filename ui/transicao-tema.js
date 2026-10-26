/**
 * Soletra — a troca de tema animada.
 *
 * Usa a View Transitions API: o navegador fotografa a página no tema antigo,
 * aplica o novo e mostra a página nova por cima da foto. Quem decide o formato
 * da revelação é o recorte animado em ::view-transition-new(root).
 *
 * Toda troca que muda a aparência revela a página nova como tinta jogada a
 * partir do botão de tema: uma mancha de bordas irregulares, com algumas gotas
 * compridas, que cresce até cobrir a tela. Vale também quando o tema muda sem
 * clique (modo Sistema, ou a outra página trocou pelo chrome.storage): a tinta
 * sai do botão de tema da página do mesmo jeito. É de propósito que nem
 * "reduzir movimento" desliga a tinta — a troca tem de ser sempre perceptível.
 */
import { flushSync } from 'react-dom';
import { quadrosDoRespingo } from './respingo.js';

/** Longa o bastante para a tinta ser vista se espalhando, e não só o resultado. */
const DURACAO_MS = 1600;
/** Marca o botão de onde a tinta parte quando a troca não veio de um clique (ui/SeletorTema.jsx). */
const ATRIBUTO_ORIGEM = 'data-origem-tema';

/**
 * Centro de onde a tinta parte: o botão recebido, senão o botão de tema da
 * página, senão o canto superior direito, onde esse botão costuma ficar.
 * @param {Element | null} origem
 */
function pontoDeOrigem(origem) {
  for (const el of [origem, document.querySelector(`[${ATRIBUTO_ORIGEM}]`)]) {
    const caixa = el?.getBoundingClientRect();
    if (caixa?.width) return { x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 2 };
  }
  return { x: innerWidth - 24, y: 24 };
}

/**
 * Aplica `aplicar` com a tinta saindo de `origem`. Só sem a View Transitions
 * API (navegador antigo) a troca acontece sem animação.
 * @param {() => void} aplicar muda o estado do tema (roda dentro de um flushSync)
 * @param {Element | null} [origem] o botão de tema
 */
export function trocarComTinta(aplicar, origem = null) {
  if (!document.startViewTransition) {
    aplicar();
    return;
  }

  const { x, y } = pontoDeOrigem(origem);
  const alcance = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y)
  );

  // O atributo desliga o esmaecer padrão (ver ui/marca.css) só nesta troca.
  const raiz = document.documentElement;
  raiz.dataset.troca = 'tinta';
  const transicao = document.startViewTransition(() => flushSync(aplicar));
  transicao.ready
    .then(() => {
      raiz.animate(
        quadrosDoRespingo(x, y, alcance),
        {
          duration: DURACAO_MS,
          // Desacelera menos que um ease-out comum: a tinta segue visível
          // avançando até perto do fim, em vez de cobrir quase tudo no início.
          easing: 'cubic-bezier(.4, .1, .3, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    })
    .catch(() => {});
  transicao.finished.finally(() => delete raiz.dataset.troca);
}
