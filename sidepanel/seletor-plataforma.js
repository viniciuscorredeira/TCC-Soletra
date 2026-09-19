/**
 * Soletra — seletor de plataforma de busca.
 *
 * Espelha a mecânica de dialogo.js de propósito: Escape, clique no fundo, foco
 * preso e foco devolvido ao fechar já estavam resolvidos ali, e reescrevê-los
 * aqui só criaria uma segunda chance de errar. A diferença é o que a promessa
 * devolve — o id da plataforma escolhida, ou null quando o usuário sai sem
 * pesquisar, que é o caso que precisa ser impossível de confundir.
 */
import { PLATAFORMAS, MARCAS } from '../src/search-targets.js';

const el = {
  fundo: document.getElementById('plataformasFundo'),
  termo: document.getElementById('plataformasTermo'),
  grade: document.getElementById('plataformasGrade'),
  generica: document.getElementById('plataformaGenerica'),
  fechar: document.getElementById('plataformasFechar'),
  cancelar: document.getElementById('plataformasCancelar')
};

let resolverPendente = null;
let focoAnterior = null;

/** Ladrilho com a logo da marca, ou com o glifo de quem não tem PNG. */
function montarTile(p) {
  const tile = document.createElement('span');
  tile.className = 'plataforma__tile';

  if (p.icone) {
    const img = document.createElement('img');
    // Caminho relativo à raiz da extensão; o catálogo é compartilhado com o
    // service worker e por isso não usa chrome.runtime.getURL.
    img.src = `../${p.icone}`;
    img.alt = '';
    img.decoding = 'async';
    tile.append(img);
  } else {
    if (p.cor) tile.style.background = p.cor;
    // innerHTML com conteúdo do próprio catálogo, nunca de entrada do usuário.
    tile.innerHTML += `<svg viewBox="0 0 24 24" aria-hidden="true">${p.glifo}</svg>`;
  }
  return tile;
}

/** Card de marca: logo em cima, nome embaixo. */
function montarCard(p) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'plataforma';
  btn.setAttribute('aria-label', `Pesquisar em ${p.nome}`);

  const nome = document.createElement('span');
  nome.className = 'plataforma__nome';
  nome.textContent = p.nome;

  btn.append(montarTile(p), nome);
  btn.addEventListener('click', () => fechar(p.id));
  return btn;
}

/**
 * Linha larga do destino genérico. Em card, ele ficaria como uma marca sem
 * logotipo; como linha, lê-se claramente como "a outra opção".
 */
function montarLinha(p) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'plataforma plataforma--generica';
  btn.setAttribute('aria-label', `Pesquisar no ${p.nome}`);

  const texto = document.createElement('span');
  texto.className = 'plataforma__texto';

  const nome = document.createElement('span');
  nome.className = 'plataforma__nome';
  nome.textContent = p.nome;
  texto.append(nome);

  if (p.descricao) {
    const desc = document.createElement('span');
    desc.className = 'plataforma__desc';
    desc.textContent = p.descricao;
    texto.append(desc);
  }

  const seta = document.createElement('span');
  seta.className = 'plataforma__seta';
  seta.textContent = '›';
  seta.setAttribute('aria-hidden', 'true');

  btn.append(montarTile(p), texto, seta);
  btn.addEventListener('click', () => fechar(p.id));
  return btn;
}

// Construídos uma vez: o catálogo não muda em tempo de execução.
const cards = MARCAS.map(montarCard);
const genericas = PLATAFORMAS.filter((p) => p.generico).map(montarLinha);

el.grade.append(...cards);
el.generica.append(...genericas);

/** Ordem de tabulação dentro do modal: fechar → cards → cancelar. */
const focaveis = [el.fechar, ...cards, ...genericas, el.cancelar];

function fechar(escolha) {
  if (!resolverPendente) return;

  el.fundo.hidden = true;
  document.removeEventListener('keydown', aoTeclar, true);

  const r = resolverPendente;
  resolverPendente = null;

  focoAnterior?.focus?.();
  focoAnterior = null;

  r(escolha);
}

function aoTeclar(evento) {
  if (!resolverPendente) return;

  if (evento.key === 'Escape') {
    evento.preventDefault();
    fechar(null);
    return;
  }

  // Sair do modal com Tab deixaria o usuário mexendo no painel por baixo de uma
  // escolha pendente.
  if (evento.key === 'Tab') {
    evento.preventDefault();
    const atual = focaveis.indexOf(document.activeElement);
    const passo = evento.shiftKey ? -1 : 1;
    const proximo = (atual + passo + focaveis.length) % focaveis.length;
    focaveis[atual === -1 ? 0 : proximo].focus();
  }
}

// Só o mousedown nascido no fundo cancela: arrastar de dentro da caixa e soltar
// fora não pode ser lido como desistência.
el.fundo.addEventListener('mousedown', (evento) => {
  if (evento.target === el.fundo) fechar(null);
});

el.fechar.addEventListener('click', () => fechar(null));
el.cancelar.addEventListener('click', () => fechar(null));

/**
 * @param {string} termo texto reconhecido, exibido para conferência
 * @returns {Promise<string|null>} id da plataforma, ou null se fechou sem escolher
 */
export function escolherPlataforma(termo) {
  if (resolverPendente) fechar(null);

  el.termo.textContent = termo;
  focoAnterior = document.activeElement;
  el.fundo.hidden = false;

  const promessa = new Promise((resolve) => {
    resolverPendente = resolve;
  });

  document.addEventListener('keydown', aoTeclar, true);
  cards[0].focus();

  return promessa;
}
