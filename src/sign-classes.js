/**
 * Soletra — catálogo de classes reconhecíveis.
 *
 * O alfabeto manual brasileiro mistura configurações estáticas com sinais que
 * exigem movimento. Esta versão reconhece apenas as estáticas: um classificador
 * quadro-a-quadro não tem como representar trajetória, e fingir que tem produz
 * confusão sistemática em vez de erro honesto.
 *
 * Letras e números compartilham configurações de mão (O≡0, V≡2, W≡3), por isso
 * os dois conjuntos nunca são classificados juntos — a UI alterna entre eles.
 */

/** Letras de configuração estática — as 21 que esta versão reconhece. */
export const LETRAS_ESTATICAS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'Y'
];

/**
 * Letras que envolvem movimento e ficam fora do MVP. O Ç do alfabeto manual
 * brasileiro também é dinâmico (movimento a partir do C).
 */
export const LETRAS_DINAMICAS = ['H', 'J', 'K', 'X', 'Z', 'Ç'];

export const NUMEROS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export const CONJUNTOS = {
  letras: { id: 'letras', rotulo: 'Letras', classes: LETRAS_ESTATICAS },
  numeros: { id: 'numeros', rotulo: 'Números', classes: NUMEROS }
};

export const CONJUNTO_PADRAO = 'letras';

/** Todas as classes treináveis, na ordem em que aparecem na UI de treino. */
export const TODAS_AS_CLASSES = [...LETRAS_ESTATICAS, ...NUMEROS];

/** @returns {string[]} as classes do conjunto, ou as letras se o id for inválido. */
export function classesDoConjunto(conjuntoId) {
  return (CONJUNTOS[conjuntoId] || CONJUNTOS[CONJUNTO_PADRAO]).classes;
}

export function ehClasseValida(classe) {
  return TODAS_AS_CLASSES.includes(classe);
}

/** Texto do aviso permanente sobre a limitação conhecida. */
export const AVISO_DINAMICAS =
  `${LETRAS_DINAMICAS.slice(0, -1).join(', ')} e ${LETRAS_DINAMICAS.at(-1)}` +
  ' envolvem movimento e não são reconhecidas nesta versão.';
