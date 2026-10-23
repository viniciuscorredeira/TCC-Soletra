/**
 * Soletra — tema claro, escuro ou o do sistema.
 *
 * A escolha mora em chrome.storage.local, que é a mesma para o painel e para a
 * aba de permissão: trocar num lado repinta o outro na hora, via onChanged.
 *
 * O storage da extensão é assíncrono, e esperar por ele na abertura pintaria o
 * tema errado por um quadro. Por isso a escolha também é espelhada em
 * localStorage, lido de forma síncrona antes da primeira pintura. O espelho é só
 * cache: se o navegador o apagar ou bloquear, a página abre no tema do sistema e
 * corrige assim que o chrome.storage responder.
 */
import { useEffect, useState } from 'react';

const CHAVE = 'soletra.tema';

/** @typedef {'sistema' | 'claro' | 'escuro'} Tema */
export const TEMAS = /** @type {const} */ (['sistema', 'claro', 'escuro']);

const valido = (t) => TEMAS.includes(t);

const midiaEscura = window.matchMedia('(prefers-color-scheme: dark)');

/** @returns {Tema} */
function lerEspelho() {
  try {
    const t = localStorage.getItem(CHAVE);
    return valido(t) ? t : 'sistema';
  } catch {
    return 'sistema';
  }
}

function espelhar(tema) {
  try {
    localStorage.setItem(CHAVE, tema);
  } catch { /* sem espelho, a próxima abertura só pinta um quadro no tema do sistema */ }
}

/** @param {Tema} tema @param {boolean} sistemaEscuro @returns {'light' | 'dark'} */
function resolver(tema, sistemaEscuro) {
  if (tema === 'sistema') return sistemaEscuro ? 'dark' : 'light';
  return tema === 'escuro' ? 'dark' : 'light';
}

/**
 * Aplica a aparência na raiz do documento: as variáveis do Radix ficam
 * disponíveis já no <html>, e o body e as barras de rolagem do navegador pintam
 * no mesmo tema que o conteúdo.
 */
function aplicarNaRaiz(aparencia) {
  const raiz = document.documentElement;
  raiz.classList.toggle('dark', aparencia === 'dark');
  raiz.classList.toggle('light', aparencia === 'light');
  raiz.style.colorScheme = aparencia;
}

/** Chamado antes do primeiro render, para não pintar um quadro no tema errado. */
export function aplicarTemaInicial() {
  aplicarNaRaiz(resolver(lerEspelho(), midiaEscura.matches));
}

export function useTema() {
  const [tema, setTema] = useState(lerEspelho);
  const [sistemaEscuro, setSistemaEscuro] = useState(midiaEscura.matches);

  useEffect(() => {
    let vivo = true;
    chrome.storage.local
      .get(CHAVE)
      .then((g) => {
        if (vivo && valido(g?.[CHAVE])) {
          setTema(g[CHAVE]);
          espelhar(g[CHAVE]);
        }
      })
      .catch(() => {});

    const aoMudarStorage = (mudancas, area) => {
      const novo = mudancas[CHAVE]?.newValue;
      if (area === 'local' && valido(novo)) {
        setTema(novo);
        espelhar(novo);
      }
    };
    chrome.storage.onChanged.addListener(aoMudarStorage);

    const aoMudarSistema = (e) => setSistemaEscuro(e.matches);
    midiaEscura.addEventListener('change', aoMudarSistema);

    return () => {
      vivo = false;
      chrome.storage.onChanged.removeListener(aoMudarStorage);
      midiaEscura.removeEventListener('change', aoMudarSistema);
    };
  }, []);

  const aparencia = resolver(tema, sistemaEscuro);
  useEffect(() => aplicarNaRaiz(aparencia), [aparencia]);

  /** @param {Tema} novo */
  function definir(novo) {
    if (!valido(novo)) return;
    setTema(novo);
    espelhar(novo);
    chrome.storage.local.set({ [CHAVE]: novo }).catch(() => {});
  }

  return { tema, aparencia, definir };
}
