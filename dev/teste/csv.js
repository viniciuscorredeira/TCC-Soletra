/**
 * Soletra (modo dev) — CSV no formato que pandas, R e planilhas leem sem
 * configuração: vírgula como separador, ponto decimal, aspas quando preciso,
 * quebras de linha CRLF e BOM no início (para o Excel reconhecer o UTF-8 e os
 * acentos).
 */

function campo(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  const texto = String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** @param {any[][]} linhas a primeira é o cabeçalho */
export function gerarCsv(linhas) {
  return '﻿' + linhas.map((l) => l.map(campo).join(',')).join('\r\n') + '\r\n';
}
