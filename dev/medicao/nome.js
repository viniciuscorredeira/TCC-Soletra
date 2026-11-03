/**
 * Soletra (modo dev) — nome dos arquivos exportados da medição. Separado do
 * controle para a página de impressão poder usá-lo sem carregar o painel.
 */

/** soletra-medicao-modelo-em-uso-2026-11-03-1420.json (sem extensão para o PDF) */
export function nomeDaMedicao(arquivo, extensao = 'json') {
  const quando = new Date(arquivo.dataHora || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  const data = `${quando.getFullYear()}-${p(quando.getMonth() + 1)}-${p(quando.getDate())}-${p(quando.getHours())}${p(quando.getMinutes())}`;
  const origem = String(arquivo.arquivo || 'modelo')
    .replace(/\s+—.*$/, '')
    .replace(/\.json$/i, '')
    .split('/')
    .pop()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = `soletra-medicao-${origem || 'modelo'}${arquivo.comparacao ? '-comparada' : ''}-${data}`;
  return extensao ? `${base}.${extensao}` : base;
}
