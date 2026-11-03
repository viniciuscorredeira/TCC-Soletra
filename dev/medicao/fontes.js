/**
 * Soletra (modo dev) — de onde vem o modelo a medir.
 *
 * - "uso": o que a extensão dev reconhece agora (modelo pronto + treino pessoal);
 * - "pronto": o modelos/padrao.json empacotado, como veio;
 * - "pessoal": só as amostras gravadas no Treinar sinais desta extensão;
 * - "arquivo": um modelo exportado (de outra pessoa, de outra máquina…).
 *
 * Cada fonte vira um objeto no formato do Exportar do painel, que é o que a
 * medição valida e mede.
 */
import { SignModelStore, ESQUEMA, FORMATO_ARQUIVO } from '../../src/sign-model-store.js';
import { VERSAO_FEATURES } from '../../src/sign-features.js';
import { lerModeloPadrao } from '../../src/modelo-pronto.js';

export const NOMES_FONTE = {
  uso: 'Modelo em uso',
  pronto: 'Modelo pronto (empacotado)',
  pessoal: 'Só o treino pessoal',
  arquivo: 'Arquivo .json'
};

const comoExportado = (classes, extra = {}) => ({
  formato: FORMATO_ARQUIVO,
  esquema: ESQUEMA,
  versaoFeatures: VERSAO_FEATURES,
  classes,
  ...extra
});

/** Contagens para mostrar nas opções, sem carregar o modelo pronto. */
export async function resumoDoModeloEmUso() {
  try {
    const { indice, origem } = await new SignModelStore().carregar();
    if (!indice) return null;
    const lista = Object.values(origem);
    return {
      classes: lista.length,
      padrao: lista.reduce((s, o) => s + o.padrao, 0),
      pessoal: lista.reduce((s, o) => s + o.pessoal, 0),
      classesPessoais: lista.filter((o) => o.pessoal > 0).length
    };
  } catch {
    return null;
  }
}

/**
 * @param {'uso'|'pronto'|'pessoal'|'arquivo'} fonte
 * @param {File} [arquivo] quando a fonte é "arquivo"
 * @returns {Promise<{modelo: object, rotulo: string}>}
 */
export async function carregarFonte(fonte, arquivo) {
  if (fonte === 'arquivo') {
    if (!arquivo) throw new Error('Escolha o arquivo do modelo.');
    let objeto;
    try {
      objeto = JSON.parse(await arquivo.text());
    } catch {
      throw new Error(`${arquivo.name} não é um JSON válido.`);
    }
    return { modelo: objeto, rotulo: arquivo.name };
  }

  if (fonte === 'pronto') {
    const objeto = await lerModeloPadrao();
    if (!objeto) throw new Error('Esta versão não traz o modelo pronto (modelos/padrao.json).');
    return { modelo: objeto, rotulo: `${NOMES_FONTE.pronto} — modelos/padrao.json` };
  }

  const { indice, classes, origem } = await new SignModelStore().carregar();
  if (!indice || Object.keys(classes).length === 0) throw new Error('Não há modelo em uso nesta extensão.');

  if (fonte === 'uso') {
    return { modelo: comoExportado(classes, { mao: indice.mao ?? 'direita' }), rotulo: NOMES_FONTE.uso };
  }

  // O store devolve cada classe com as amostras do padrão primeiro e as
  // pessoais depois, na ordem em que foram gravadas.
  const pessoais = {};
  for (const [nome, amostras] of Object.entries(classes)) {
    const resto = amostras.slice(origem[nome]?.padrao ?? 0);
    if (resto.length) pessoais[nome] = resto;
  }
  if (Object.keys(pessoais).length === 0) throw new Error('Nenhuma amostra pessoal: grave sinais em Treinar sinais primeiro.');
  return { modelo: comoExportado(pessoais, { mao: indice.mao ?? 'direita' }), rotulo: NOMES_FONTE.pessoal };
}
