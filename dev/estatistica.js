/**
 * Soletra (modo dev) — estatística descritiva dos relatórios.
 *
 * Percentis por interpolação linear entre as posições vizinhas (o método
 * padrão do NumPy e da maioria das planilhas), para os números do relatório
 * poderem ser conferidos fora da extensão. Valores não finitos são ignorados.
 */

const finitos = (valores) => valores.filter((v) => Number.isFinite(v));

/** @param {number[]} valores @param {number} p em [0, 1] */
export function quantil(valores, p) {
  const ordenado = finitos(valores).sort((a, b) => a - b);
  if (ordenado.length === 0) return null;
  const pos = (ordenado.length - 1) * p;
  const base = Math.floor(pos);
  const proximo = ordenado[base + 1] ?? ordenado[base];
  return ordenado[base] + (proximo - ordenado[base]) * (pos - base);
}

export const mediana = (valores) => quantil(valores, 0.5);

export function media(valores) {
  const v = finitos(valores);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/**
 * Resumo de uma distribuição: n, mínimo, percentis 10/25/50/75/90, máximo e
 * média. null quando não há nenhum valor.
 */
export function distribuicao(valores) {
  const v = finitos(valores);
  if (v.length === 0) return null;
  return {
    n: v.length,
    min: Math.min(...v),
    p10: quantil(v, 0.1),
    p25: quantil(v, 0.25),
    mediana: quantil(v, 0.5),
    p75: quantil(v, 0.75),
    p90: quantil(v, 0.9),
    max: Math.max(...v),
    media: media(v)
  };
}

/** O valor mais frequente (o primeiro a chegar lá, em caso de empate). */
export function moda(valores) {
  const contagem = new Map();
  let melhor = null;
  let maior = 0;
  for (const v of valores) {
    if (v === null || v === undefined) continue;
    const n = (contagem.get(v) || 0) + 1;
    contagem.set(v, n);
    if (n > maior) { maior = n; melhor = v; }
  }
  return melhor;
}

/** Fração com denominador zero vira null, não NaN: "não se aplica" é diferente de 0%. */
export const fracao = (parte, total) => (total > 0 ? parte / total : null);
