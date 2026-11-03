/**
 * Soletra (modo dev) — nomes que o teste de sinais mostra, os mesmos na tela,
 * nas planilhas e no PDF.
 */

export const NOMES_RESULTADO = {
  acerto: 'acerto',
  troca: 'troca',
  rejeicao: 'rejeição',
  'tempo-esgotado': 'tempo esgotado',
  'nao-reconhecido': 'não reconhecido'
};

export const CORES_RESULTADO = {
  acerto: 'green',
  troca: 'red',
  rejeicao: 'amber',
  'tempo-esgotado': 'gray',
  'nao-reconhecido': 'gray'
};

export const NOMES_CATEGORIA = {
  certo: 'sinal pedido',
  outra: 'outra classe',
  rejeitado: 'rejeitado',
  'sem-mao': 'sem mão',
  bloqueada: 'mão bloqueada'
};

/** Cabeçalhos curtos das colunas especiais das matrizes. */
export const NOMES_COLUNA = {
  rejeicao: 'rej.',
  'tempo-esgotado': 'tempo',
  'nao-reconhecido': 'não rec.',
  rejeitado: 'rej.',
  'sem-mao': 'sem mão',
  bloqueada: 'bloq.'
};

export const NOMES_INICIO = {
  reconhecer: 'ao reconhecer o sinal',
  contagem: 'após a contagem'
};

export const nomeSinal = (s) => (/^\d$/.test(s) ? `Número ${s}` : `Letra ${s}`);
