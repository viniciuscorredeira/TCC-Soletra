/**
 * Soletra (modo dev) — arquivo JSON do teste de sinais.
 *
 * Um arquivo só, com tudo: metadados (quando, com que versão, modelo, câmera e
 * navegador, quem e em que condições), a configuração da sessão, cada rodada
 * com a linha do tempo quadro a quadro, e o relatório. Só números e rótulos:
 * nenhuma imagem e nenhum ponto da mão.
 *
 * Os números saem com ponto decimal (é JSON) e arredondados a 4 casas, que é
 * mais do que qualquer medida aqui sustenta.
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

/** soletra-teste-geral-P1-2026-11-03-1420.json */
export function nomeDoArquivo(arquivo) {
  const c = arquivo.configuracao || {};
  const quando = new Date(arquivo.metadados?.dataHora || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  const data = `${quando.getFullYear()}-${p(quando.getMonth() + 1)}-${p(quando.getDate())}-${p(quando.getHours())}${p(quando.getMinutes())}`;
  const tipo = c.modo === 'unitario' ? `unitario-${c.sinal}` : 'geral';
  const quem = String(c.participante || '').replace(/[^\w-]+/g, '') || 'anonimo';
  return `soletra-teste-${tipo}-${quem}-${data}${arquivo.parcial ? '-parcial' : ''}.json`;
}

/** Baixa o arquivo pelo navegador, como o Exportar do modelo (sem permissão nova). */
export function baixar(arquivo) {
  const blob = new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoArquivo(arquivo);
  a.click();
  URL.revokeObjectURL(url);
}
