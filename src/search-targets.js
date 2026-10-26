/**
 * Soletra — plataformas de destino da pesquisa.
 *
 * As logos das marcas são PNGs empacotados na extensão, preparados por
 * `node tools/preparar-logos.mjs` a partir de `logos/`. Não há imagem remota:
 * a CSP do Manifest V3 a bloquearia, e a interface não pode depender de rede
 * para se desenhar.
 *
 * Este módulo é importado também pelo service worker, então não pode tocar em
 * DOM nem em `chrome.*` — os caminhos de ícone ficam como texto, e quem os
 * resolve é a view.
 */

/**
 * @typedef {object} Plataforma
 * @property {string} id
 * @property {string} nome
 * @property {string} [descricao]  o que se encontra lá, em poucas palavras
 * @property {string} [icone]      caminho do PNG da marca, relativo à raiz
 * @property {string} [glifo]      SVG inline, para quem não tem logo
 * @property {string} [cor]        cor do ladrilho quando há glifo
 * @property {boolean} [generico]  não é marca: recebe tratamento próprio na UI
 * @property {(termo: string) => string} [url]  ausente = resolvido pelo navegador
 */

/** @type {Plataforma[]} */
export const PLATAFORMAS = [
  {
    id: 'google',
    nome: 'Google',
    descricao: 'Páginas da web',
    icone: 'icons/plataformas/google.png',
    url: (q) => `https://www.google.com/search?q=${q}`
  },
  {
    id: 'youtube',
    nome: 'YouTube',
    descricao: 'Vídeos',
    icone: 'icons/plataformas/youtube.png',
    url: (q) => `https://www.youtube.com/results?search_query=${q}`
  },
  {
    id: 'maps',
    nome: 'Maps',
    descricao: 'Lugares e endereços',
    icone: 'icons/plataformas/maps.png',
    url: (q) => `https://www.google.com/maps/search/?api=1&query=${q}`
  },
  {
    id: 'amazon',
    nome: 'Amazon',
    descricao: 'Produtos à venda',
    icone: 'icons/plataformas/amazon.png',
    url: (q) => `https://www.amazon.com.br/s?k=${q}`
  },
  {
    id: 'wikipedia',
    nome: 'Wikipédia',
    descricao: 'Artigos de enciclopédia',
    icone: 'icons/plataformas/wikipedia.png',
    url: (q) => `https://pt.wikipedia.org/w/index.php?search=${q}`
  },
  {
    // Sem `url`: o destino é o mecanismo configurado pelo usuário, que só o
    // navegador conhece. O service worker resolve com chrome.search.query().
    id: 'padrao',
    nome: 'Buscador padrão',
    descricao: 'O que estiver configurado no navegador',
    generico: true,
    glifo:
      '<circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="1.9" />' +
      '<path d="m19.5 19.5-4.2-4.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />',
    url: undefined
  }
];

/** Plataforma cujo destino só o navegador sabe resolver. */
export const ID_BUSCADOR_PADRAO = 'padrao';

/**
 * As marcas, em ordem alfabética — é a ordem da grade. Ordenadas aqui, e não
 * no catálogo acima, para que uma plataforma nova já entre no lugar certo.
 */
export const MARCAS = PLATAFORMAS.filter((p) => !p.generico).sort((a, b) =>
  a.nome.localeCompare(b.nome, 'pt-BR')
);

export function ehPlataformaValida(id) {
  return PLATAFORMAS.some((p) => p.id === id);
}

/**
 * Monta a URL de busca da plataforma.
 *
 * O termo é sempre passado por encodeURIComponent: sem isso, um texto com `&`
 * ou `#` — que o usuário pode digitar na caixa manualmente — truncaria a
 * consulta ou injetaria parâmetros na URL de terceiro.
 *
 * @param {string} id
 * @param {string} termo
 * @returns {string|null} null para plataforma inexistente, termo vazio, ou para
 *   o buscador padrão, que não tem URL fixa
 */
export function urlDaBusca(id, termo) {
  const texto = String(termo ?? '').trim();
  if (!texto) return null;

  const plataforma = PLATAFORMAS.find((p) => p.id === id);
  if (!plataforma?.url) return null;

  return plataforma.url(encodeURIComponent(texto));
}
