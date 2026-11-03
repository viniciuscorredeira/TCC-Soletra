/**
 * Soletra (modo dev) — recarrega a extensão sozinha depois de cada recompilação.
 *
 * Com `npm run build:dev -- --watch` (ou `npm run dev:all`), o build grava em
 * dist-dev/dev/recarga.txt um carimbo novo a cada recompilação, e grava o MESMO
 * carimbo no lugar de CARIMBO, dentro do código que acabou de gerar. Basta então
 * comparar: se o arquivo traz um carimbo diferente do embutido, este código é
 * velho, e a extensão recarrega. Funciona até num service worker que acordou
 * depois da recompilação, porque ele ainda carrega o código antigo.
 *
 * Numa extensão sem compactação, o fetch de um arquivo dela lê o disco a cada
 * pedido, então a leitura enxerga o que o build acabou de escrever.
 *
 * O Chrome fecha o painel lateral ao recarregar a extensão e não deixa reabri-lo
 * por código (sidePanel.open exige um gesto do usuário): depois de cada
 * recompilação, um clique no ícone reabre o painel com o código novo.
 */

/**
 * Trocado pelo build (dev/vite.config.js) por uma string: o carimbo no --watch,
 * vazia fora dele. É um identificador, e não uma string de marcação, porque o
 * bundler avaliaria a string como constante e apagaria a guarda abaixo antes
 * da troca; um global desconhecido ele deixa como está.
 */
// eslint-disable-next-line no-undef
const CARIMBO = __SOLETRA_CARIMBO__;
const ARQUIVO = 'dev/recarga.txt';
const INTERVALO_MS = 1000;

/**
 * Suspensão da recarga, em storage.session para valer também no service
 * worker. Expira sozinha: quem suspende renova a cada poucos segundos, e um
 * painel fechado no meio de um teste não deixa a recarga desligada para sempre.
 */
const CHAVE_SUSPENSAO = 'soletra.dev.recargaSuspensaAte';
const VALIDADE_SUSPENSAO_MS = 15000;

/** Liga (e renova) ou desliga a suspensão — durante um teste, uma recarga perderia a sessão. */
export function suspenderRecarga(suspensa) {
  const ate = suspensa ? Date.now() + VALIDADE_SUSPENSAO_MS : 0;
  chrome.storage.session?.set({ [CHAVE_SUSPENSAO]: ate }).catch(() => {});
}

async function suspensa() {
  try {
    const g = await chrome.storage.session.get(CHAVE_SUSPENSAO);
    return (g?.[CHAVE_SUSPENSAO] || 0) > Date.now();
  } catch {
    return false;
  }
}

export function vigiarRecarga() {
  if (!CARIMBO) return; // build sem --watch: não há o que vigiar
  const url = chrome.runtime.getURL(ARQUIVO);
  setInterval(async () => {
    try {
      const resposta = await fetch(url, { cache: 'no-store' });
      if (!resposta.ok) return;
      const atual = (await resposta.text()).trim();
      if (atual && atual !== CARIMBO && !(await suspensa())) chrome.runtime.reload();
    } catch {
      // A pasta pode estar sendo reescrita; a próxima leitura tenta de novo.
    }
  }, INTERVALO_MS);
}
