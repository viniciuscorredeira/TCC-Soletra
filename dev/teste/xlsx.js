/**
 * Soletra (modo dev) — planilha Excel (.xlsx) sem dependências.
 *
 * Um .xlsx é um ZIP com alguns XML (Office Open XML, SpreadsheetML). Aqui vai o
 * mínimo que o Excel, o LibreOffice e o Google Planilhas abrem: uma aba por
 * planilha, textos inline (sem a tabela de strings compartilhadas), a primeira
 * linha em negrito e congelada, e larguras de coluna estimadas pelo conteúdo. O
 * ZIP sai sem compressão (método "stored"), o que dispensa um deflate próprio.
 *
 * Puro: devolve os bytes, e quem chama decide o que fazer com eles.
 */

const encoder = new TextEncoder();

// --- ZIP --------------------------------------------------------------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * ZIP sem compressão. Data fixa (1º/1/1980): o mesmo conteúdo gera os mesmos
 * bytes, o que deixa o arquivo testável.
 * @param {Array<{nome: string, dados: Uint8Array}>} arquivos
 */
export function zipar(arquivos) {
  const partes = [];
  const central = [];
  let deslocamento = 0;

  for (const { nome, dados } of arquivos) {
    const bytesNome = encoder.encode(nome);
    const crc = crc32(dados);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão necessária
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true); // hora
    local.setUint16(12, 0x21, true); // data: 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, bytesNome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), bytesNome, dados);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, 0, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, dados.length, true);
    c.setUint32(24, dados.length, true);
    c.setUint16(28, bytesNome.length, true);
    c.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(c.buffer), bytesNome);

    deslocamento += 30 + bytesNome.length + dados.length;
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todas) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

// --- SpreadsheetML ------------------------------------------------------------

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CABECALHO_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Escapa para XML e tira os caracteres de controle que o XML 1.0 não aceita. */
export function escaparXml(texto) {
  return String(texto)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function letraDaColuna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** O Excel recusa nomes de aba com []:*?/\ ou com mais de 31 caracteres. */
const nomeDeAba = (nome) => String(nome).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);

function celula(valor, ref, estilo) {
  if (valor === null || valor === undefined || valor === '') return '';
  const s = estilo ? ` s="${estilo}"` : '';
  if (typeof valor === 'number') return Number.isFinite(valor) ? `<c r="${ref}"${s}><v>${valor}</v></c>` : '';
  const texto = escaparXml(typeof valor === 'boolean' ? (valor ? 'sim' : 'não') : valor);
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${texto}</t></is></c>`;
}

function aba(linhas) {
  const colunas = Math.max(1, ...linhas.map((l) => l.length));
  const larguras = Array.from({ length: colunas }, (_, c) =>
    Math.min(45, Math.max(8, ...linhas.slice(0, 200).map((l) => String(l[c] ?? '').length + 2)))
  );
  const cols = larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const dados = linhas
    .map((linha, r) => {
      const celulas = linha.map((v, c) => celula(v, `${letraDaColuna(c)}${r + 1}`, r === 0 ? 1 : 0)).join('');
      return `<row r="${r + 1}">${celulas}</row>`;
    })
    .join('');
  return (
    CABECALHO_XML +
    `<worksheet xmlns="${NS}" xmlns:r="${NS_R}">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${dados}</sheetData></worksheet>`
  );
}

const ESTILOS =
  CABECALHO_XML +
  `<styleSheet xmlns="${NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '</styleSheet>';

/**
 * @param {Array<{nome: string, linhas: any[][]}>} planilhas a primeira linha de cada uma é o cabeçalho
 * @returns {Uint8Array} o arquivo .xlsx
 */
export function gerarXlsx(planilhas) {
  const n = planilhas.length;
  const tipos =
    CABECALHO_XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    planilhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>';
  const relsRaiz =
    CABECALHO_XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  const pasta =
    CABECALHO_XML +
    `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets>` +
    planilhas.map((p, i) => `<sheet name="${escaparXml(nomeDeAba(p.nome))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    '</sheets></workbook>';
  const relsPasta =
    CABECALHO_XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    planilhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';

  const arquivos = [
    ['[Content_Types].xml', tipos],
    ['_rels/.rels', relsRaiz],
    ['xl/workbook.xml', pasta],
    ['xl/_rels/workbook.xml.rels', relsPasta],
    ['xl/styles.xml', ESTILOS],
    ...planilhas.map((p, i) => [`xl/worksheets/sheet${i + 1}.xml`, aba(p.linhas)])
  ];
  return zipar(arquivos.map(([nome, xml]) => ({ nome, dados: encoder.encode(xml) })));
}
