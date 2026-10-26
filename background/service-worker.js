/**
 * Soletra — service worker.
 *
 * Três papéis: abrir o painel lateral no clique do ícone (com queda para uma
 * aba dedicada quando a API sidePanel não existir, abaixo do Chrome/Edge 114),
 * executar a pesquisa pedida pelo painel e, na instalação, deixar o modelo
 * pronto instalado.
 */

import { urlDaBusca, ID_BUSCADOR_PADRAO } from '../src/search-targets.js';
import { SignModelStore } from '../src/sign-model-store.js';
import { lerModeloPadrao, instalarModeloPronto } from '../src/modelo-pronto.js';

const PANEL_PATH = 'sidepanel/panel.html';

/** Usado apenas se o buscador padrão do usuário não puder ser acionado. */
const BUSCA_FALLBACK = 'https://www.google.com/search?q=';

async function enableSidePanelOnActionClick() {
  if (!chrome.sidePanel?.setPanelBehavior) return false;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    return true;
  } catch (error) {
    console.warn('[Soletra] sidePanel indisponível:', error);
    return false;
  }
}

/**
 * Numa instalação nova, deixa o modelo pronto instalado antes de o painel
 * abrir pela primeira vez: o reconhecimento funciona sem treino nenhum, e o
 * usuário não precisa saber que existe um modelo para escolher. Só na
 * instalação — numa atualização o modelo do usuário já está lá, e quem apagou
 * tudo de propósito não recebe o padrão de volta sem pedir.
 */
async function instalarModeloInicial() {
  try {
    const store = new SignModelStore();
    const { indice, incompativel } = await store.carregar();
    if (indice || incompativel) return;
    const objeto = await lerModeloPadrao();
    if (objeto) await instalarModeloPronto(store, objeto);
  } catch (error) {
    // O painel ainda oferece o modelo pronto no cartão de boas-vindas.
    console.warn('[Soletra] falha ao instalar o modelo pronto:', error);
  }
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  enableSidePanelOnActionClick();
  if (reason === 'install') instalarModeloInicial();
});

chrome.runtime.onStartup.addListener(() => {
  enableSidePanelOnActionClick();
});

// Só dispara quando openPanelOnActionClick não pôde ser ativado.
chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel?.open && tab?.windowId !== undefined) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (error) {
      console.warn('[Soletra] falha ao abrir o painel:', error);
    }
  }
  chrome.tabs.create({ url: chrome.runtime.getURL(PANEL_PATH) });
});

/**
 * Executa a pesquisa com o texto composto no painel.
 *
 * Roda aqui, e não no painel lateral, por dois motivos. Navegação de nível de
 * navegador é papel do service worker. E `chrome.search.query` com `disposition`
 * precisa resolver "qual aba" a partir do contexto que chamou — o painel lateral
 * não é uma aba, e pedir isso de lá derrubava o navegador.
 *
 * A aba é criada primeiro e passada por `tabId`, que é mutuamente exclusivo com
 * `disposition`: assim não sobra nenhuma inferência de destino a ser feita.
 */
async function pesquisar(termo, plataforma) {
  const texto = String(termo || '').trim();
  if (!texto) return { ok: false, erro: 'Texto vazio.' };

  // Plataforma com URL própria: basta abrir a aba já no endereço certo.
  const url = urlDaBusca(plataforma, texto);
  if (url) {
    await chrome.tabs.create({ url, active: true });
    return { ok: true, via: plataforma };
  }

  if (plataforma !== ID_BUSCADOR_PADRAO) {
    return { ok: false, erro: `Plataforma desconhecida: ${plataforma}.` };
  }

  // Buscador padrão: só o navegador sabe qual é. A aba é criada ANTES e passada
  // por tabId porque `disposition` obriga o navegador a inferir o destino a
  // partir de quem chamou — e o painel lateral não é uma aba.
  const aba = await chrome.tabs.create({ active: true });

  try {
    await chrome.search.query({ text: texto, tabId: aba.id });
    return { ok: true, via: 'buscador-padrão' };
  } catch (error) {
    // Cai para o Google na mesma aba já aberta, para o usuário não ficar com
    // uma aba em branco e nenhum resultado.
    console.warn('[Soletra] chrome.search indisponível, usando fallback:', error);
    await chrome.tabs.update(aba.id, { url: BUSCA_FALLBACK + encodeURIComponent(texto) });
    return { ok: true, via: 'google', aviso: error?.message || String(error) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.type !== 'soletra:pesquisar') return undefined;
  pesquisar(msg.termo, msg.plataforma)
    .then(responder)
    .catch((error) => responder({ ok: false, erro: error?.message || String(error) }));
  return true; // mantém o canal aberto para a resposta assíncrona
});
