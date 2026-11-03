/**
 * Soletra (modo dev) — o arquivo do teste de sinais e as exportações.
 *
 * O arquivo (montarArquivo) tem tudo: metadados (quando, com que versão,
 * modelo, câmera e navegador, quem e em que condições), a configuração da
 * sessão, cada rodada com a linha do tempo quadro a quadro, e o relatório. Só
 * números e rótulos: nenhuma imagem e nenhum ponto da mão. Dele saem as quatro
 * exportações: JSON (ele mesmo), Excel, CSV e PDF.
 *
 * Os números saem com ponto decimal e arredondados a 4 casas, que é mais do que
 * qualquer medida aqui sustenta.
 */

export const FORMATO = 'soletra-teste-sinais';
export const VERSAO_FORMATO = 1;

function arredondar(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 1e4) / 1e4 : null;
  if (Array.isArray(valor)) return valor.map(arredondar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, arredondar(v)]));
  }
  return valor;
}

/**
 * @param {object} partes
 * @param {object} partes.metadados
 * @param {object} partes.configuracao
 * @param {object[]} partes.plano
 * @param {object[]} partes.rodadas
 * @param {object} partes.relatorio
 * @param {boolean} [partes.parcial] sessão interrompida antes do fim
 */
export function montarArquivo({ metadados, configuracao, plano, rodadas, relatorio, parcial = false }) {
  return arredondar({
    formato: FORMATO,
    versaoFormato: VERSAO_FORMATO,
    parcial,
    metadados,
    configuracao,
    plano,
    rodadas,
    relatorio
  });
}

/** soletra-teste-geral-P1-2026-11-03-1420.json (ou .xlsx, .csv; sem extensão para o PDF) */
export function nomeDoArquivo(arquivo, extensao = 'json') {
  const c = arquivo.configuracao || {};
  const quando = new Date(arquivo.metadados?.dataHora || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  const data = `${quando.getFullYear()}-${p(quando.getMonth() + 1)}-${p(quando.getDate())}-${p(quando.getHours())}${p(quando.getMinutes())}`;
  const tipo = c.modo === 'unitario' ? `unitario-${c.sinal}` : 'geral';
  const quem = String(c.participante || '').replace(/[^\w-]+/g, '') || 'anonimo';
  const base = `soletra-teste-${tipo}-${quem}-${data}${arquivo.parcial ? '-parcial' : ''}`;
  return extensao ? `${base}.${extensao}` : base;
}

/** Baixa pelo navegador, como o Exportar do modelo (sem permissão nova). */
function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Tudo: metadados, rodadas quadro a quadro e relatório. */
export function baixarJson(arquivo) {
  baixarBlob(new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json' }), nomeDoArquivo(arquivo, 'json'));
}

/** Planilha com abas: Resumo, Por sinal, Rodadas, as duas matrizes, Quadros e Metadados. */
export async function baixarXlsx(arquivo) {
  const [{ tabelas }, { gerarXlsx }] = await Promise.all([import('./tabelas.js'), import('./xlsx.js')]);
  const bytes = gerarXlsx(tabelas(arquivo));
  baixarBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nomeDoArquivo(arquivo, 'xlsx')
  );
}

/** Uma linha por rodada. */
export async function baixarCsv(arquivo) {
  const [{ linhasDasRodadas }, { gerarCsv }] = await Promise.all([import('./tabelas.js'), import('./csv.js')]);
  baixarBlob(new Blob([gerarCsv(linhasDasRodadas(arquivo))], { type: 'text/csv;charset=utf-8' }), nomeDoArquivo(arquivo, 'csv'));
}

/** O relatório que dev/relatorio.html lê e imprime. */
export const CHAVE_IMPRESSAO = 'soletra.dev.impressao';

/**
 * PDF: abre o relatório formatado numa aba e chama a impressão do navegador,
 * onde se escolhe "Salvar como PDF". O navegador já sabe montar um PDF com
 * tabelas e cores; gerar um à mão pediria uma biblioteca.
 */
export async function abrirPdf(arquivo) {
  await chrome.storage.session.set({ [CHAVE_IMPRESSAO]: arquivo });
  await chrome.tabs.create({ url: chrome.runtime.getURL('dev/relatorio.html') });
}
