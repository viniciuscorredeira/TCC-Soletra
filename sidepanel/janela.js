/**
 * Soletra — botões de janela no estilo do macOS: fechar, minimizar e maximizar.
 *
 * A mesma página roda em dois modos. "painel" é o painel lateral de sempre, e
 * equivale ao minimizado. "aba" é a página aberta numa aba da própria janela do
 * navegador, ocupando a área inteira dele — para quem precisa da câmera grande,
 * numa apresentação ou de longe do computador. Lá o verde ainda leva à tela
 * cheia de verdade (Fullscreen API). O modo vem da URL (`?modo=aba`), porque o
 * painel lateral não recebe parâmetro nenhum.
 *
 * Só um dos dois fica aberto por vez: ao trocar, a página que sai solta a
 * câmera ANTES de abrir a outra. Em muitas webcams no Windows o acesso é
 * exclusivo, e a página nova falharia ao pedir uma câmera que ainda está presa.
 * O que estava ligado (câmera, reconhecimento) é anotado em storage.session e
 * religado pela página que entra.
 */

const CHAVE_RETOMAR = 'soletra.janela.retomar';
const CAMINHO = 'sidepanel/panel.html';

export const MODO = new URLSearchParams(location.search).get('modo') === 'aba' ? 'aba' : 'painel';

/**
 * @param {object} ganchos
 * @param {() => {camera: boolean, reco: boolean}} ganchos.estado o que religar do outro lado
 * @param {() => void} ganchos.soltarCamera para a câmera e o reconhecimento
 * @param {(texto: string, tipo?: string) => void} ganchos.avisar
 */
export function montarJanela({ estado, soltarCamera, avisar }) {
  document.body.dataset.modo = MODO;

  const btnFechar = document.getElementById('btnJanelaFechar');
  const btnMinimizar = document.getElementById('btnJanelaMinimizar');
  const btnMaximizar = document.getElementById('btnJanelaMaximizar');

  // sidePanel.open só funciona no gesto do usuário, sem nenhum await antes.
  // Por isso a janela desta aba é lida já na abertura, e não no clique.
  let minhaJanela = null;
  if (MODO === 'aba') {
    chrome.tabs.getCurrent().then((aba) => (minhaJanela = aba?.windowId ?? null)).catch(() => {});
  }

  function rotular(btn, texto) {
    btn.title = texto;
    btn.setAttribute('aria-label', texto);
  }

  if (MODO === 'painel') {
    rotular(btnMinimizar, 'Minimizar — você já está no painel lateral');
    rotular(btnMaximizar, 'Abrir em tela cheia, numa aba do navegador');
  } else {
    rotular(btnMinimizar, 'Minimizar para o painel lateral');
    const atualizarVerde = () =>
      rotular(btnMaximizar, document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia');
    document.addEventListener('fullscreenchange', atualizarVerde);
    atualizarVerde();
  }

  async function anotarESoltar() {
    try {
      await chrome.storage.session.set({ [CHAVE_RETOMAR]: estado() });
    } catch { /* sem retomada, o usuário só religa à mão */ }
    soltarCamera();
  }

  btnFechar.addEventListener('click', async () => {
    soltarCamera();
    await fecharEstaPagina();
  });

  btnMaximizar.addEventListener('click', async () => {
    if (MODO === 'aba') {
      // Já ocupando o navegador: o verde alterna a tela cheia de verdade, como
      // no macOS. Esc também sai, pelo próprio navegador.
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (err) {
        avisar(`Não foi possível alternar a tela cheia: ${err?.message || err}`, 'warn');
      }
      return;
    }

    await anotarESoltar();
    try {
      await abrirOuFocarAba();
    } catch (err) {
      avisar(`Não foi possível abrir em tela cheia: ${err?.message || err}`, 'error');
      return;
    }
    window.close();
  });

  btnMinimizar.addEventListener('click', async () => {
    if (MODO === 'painel') {
      avisar('O Soletra já está minimizado no painel lateral. Use o verde para abrir em tela cheia.', 'info');
      return;
    }
    // PRIMEIRA chamada do clique, pelo gesto do usuário (ver minhaJanela).
    const aberto = abrirPainel(minhaJanela);
    await anotarESoltar();
    if (!(await aberto)) {
      avisar(
        'Não foi possível voltar ao painel lateral. Feche esta aba e clique no ícone do Soletra.',
        'warn'
      );
      return;
    }
    await fecharEstaPagina();
  });
}

/**
 * Abre a página na janela atual do navegador, como aba. Se já houver uma aba do
 * Soletra aberta, reaproveita-a em vez de empilhar outra.
 */
async function abrirOuFocarAba() {
  const url = chrome.runtime.getURL(`${CAMINHO}?modo=aba`);
  const existentes = (await chrome.runtime.getContexts?.({ contextTypes: ['TAB'] }).catch(() => [])) || [];
  const existente = existentes.find((c) => c.documentUrl?.startsWith(url));
  if (existente) {
    // Recarrega para ela ler a retomada, como faria uma aba nova.
    await chrome.tabs.reload(existente.tabId);
    await chrome.tabs.update(existente.tabId, { active: true });
    await chrome.windows.update(existente.windowId, { focused: true }).catch(() => {});
    return;
  }
  await chrome.tabs.create({ url, active: true });
}

/** @returns {Promise<boolean>} */
async function abrirPainel(windowId) {
  if (!chrome.sidePanel?.open || windowId === null) return false;
  try {
    await chrome.sidePanel.open({ windowId });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fecha a página onde ela estiver. Numa aba, remove a aba; no painel lateral,
 * window.close() fecha o painel.
 */
async function fecharEstaPagina() {
  const aba = await chrome.tabs?.getCurrent?.().catch(() => null);
  if (aba?.id !== undefined) {
    await chrome.tabs.remove(aba.id).catch(() => window.close());
  } else {
    window.close();
  }
}

/**
 * Lê e apaga o que a página anterior deixou para religar. Apagar na leitura
 * garante que só a primeira abertura depois da troca religa a câmera — reabrir
 * o painel no dia seguinte não liga nada sozinho.
 * @returns {Promise<{camera: boolean, reco: boolean}|null>}
 */
export async function lerRetomada() {
  try {
    const { [CHAVE_RETOMAR]: r } = await chrome.storage.session.get(CHAVE_RETOMAR);
    if (r) await chrome.storage.session.remove(CHAVE_RETOMAR);
    return r || null;
  } catch {
    return null;
  }
}
