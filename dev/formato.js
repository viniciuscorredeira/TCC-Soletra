/**
 * Soletra (modo dev) — números na tela como no TCC: vírgula decimal. Os
 * arquivos exportados guardam os números crus, com ponto.
 */

export function num(v, casas = 2) {
  return Number.isFinite(v)
    ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
    : '—';
}

export const ms = (v) => (Number.isFinite(v) ? `${num(v, 1)} ms` : '—');

export const seg = (v) => (Number.isFinite(v) ? `${num(v / 1000, 2)} s` : '—');

export const pct = (v, casas = 1) => (Number.isFinite(v) ? `${num(v * 100, casas)}%` : '—');
