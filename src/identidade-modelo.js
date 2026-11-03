/**
 * Soletra — identidade de um modelo treinado (SHA-256).
 *
 * Calculada sobre o que define o modelo — a versão da normalização e as
 * amostras de cada classe —, e não sobre os bytes de um arquivo: assim o modelo
 * em uso no navegador e o mesmo modelo num arquivo exportado (que traz a data
 * da exportação) têm a mesma identidade. As classes vão em ordem alfabética, as
 * amostras de cada classe também são ordenadas (a ordem de gravação não muda o
 * modelo) e cada número é arredondado a 4 casas, a precisão com que o store
 * grava.
 *
 * Roda no navegador e no Node (crypto.subtle existe nos dois). Não é usada
 * pela extensão normal: serve aos relatórios do modo dev e ao
 * tools/medir-modelo.mjs, para que uma medição do modelo parado e um teste ao
 * vivo possam ser ligados ao mesmo modelo pelo mesmo número.
 *
 * @param {{versaoFeatures: number, classes: Record<string, ArrayLike<number>[]>}} modelo
 * @returns {Promise<string>} SHA-256 em hexadecimal
 */
export async function identidadeModelo({ versaoFeatures, classes }) {
  const nomes = Object.keys(classes || {})
    .filter((nome) => classes[nome]?.length > 0)
    .sort();
  const canonico = nomes.map((nome) => [
    nome,
    classes[nome].map((v) => JSON.stringify(Array.from(v, (x) => Math.round(x * 1e4) / 1e4))).sort()
  ]);
  const texto = JSON.stringify({ versaoFeatures, classes: canonico });
  const resumo = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
