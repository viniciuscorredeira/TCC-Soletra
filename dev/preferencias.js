/**
 * Soletra (modo dev) — chaves do painel dev, guardadas no chrome.storage.local
 * da própria extensão dev (que é separado do da versão normal).
 */
import { criarLoja } from '../ui/loja.js';

const CHAVE = 'soletra.dev.prefs';

const PADROES = {
  /** Desenhar a mão sobre o vídeo. */
  esqueleto: true,
  /** Numerar os 21 pontos (0 a 20). */
  numeros: false,
  /** Seção "Diagnóstico" aberta. */
  aberto: true
};

export const lojaPrefsDev = criarLoja({ ...PADROES });

export async function carregarPrefsDev() {
  try {
    const g = await chrome.storage.local.get(CHAVE);
    lojaPrefsDev.definir({ ...PADROES, ...(g?.[CHAVE] || {}) });
  } catch { /* fica com os padrões */ }
}

export function definirPrefDev(chave, valor) {
  lojaPrefsDev.definir((p) => ({ ...p, [chave]: valor }));
  chrome.storage.local.set({ [CHAVE]: lojaPrefsDev.ler() }).catch(() => {});
}
