/**
 * Monta o modelo padrão (modelos/padrao.json) a partir de modelos exportados
 * por várias pessoas no botão "Exportar" do painel.
 * Uso: node tools/montar-modelo-padrao.mjs [--por-classe 50] [--saida modelos/padrao.json] a.json b.json ...
 *
 * O modelo padrão só generaliza se vier de mãos diferentes: treinado por uma
 * pessoa só, ele aprende a mão dela — tamanho, proporção dos dedos, o jeito
 * particular de fazer cada letra — e falha em silêncio com quem não participou.
 * Por isso a amostragem é balanceada por pessoa, e não "as N primeiras".
 *
 * As amostras são dado biométrico derivado de quem treinou: só entra no padrão
 * o export de quem consentiu com a distribuição junto da extensão.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { SignModelStore, ESQUEMA, FORMATO_ARQUIVO, AMOSTRAS_MAXIMAS, AMOSTRAS_PADRAO } from '../src/sign-model-store.js';
import { VERSAO_FEATURES } from '../src/sign-features.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * O mesmo que a extensão aceita do padrão por classe (metade do teto de 100):
 * gerar mais seria peso morto no pacote, porque a instalação descartaria o resto.
 */
export const POR_CLASSE_PADRAO = AMOSTRAS_PADRAO;

/** Abaixo disso o padrão ainda é, na prática, o modelo de uma pessoa. */
export const MINIMO_PESSOAS = 3;

/** k índices espalhados por 0..n-1: amostras coladas no tempo são quase iguais. */
function espalhados(n, k) {
  if (k >= n) return Array.from({ length: n }, (_, i) => i);
  return Array.from({ length: k }, (_, j) => Math.floor((j * n) / k));
}

/**
 * Divide `alvo` entre as pessoas uma a uma, como quem distribui cartas, para
 * que ninguém domine a classe só porque gravou mais amostras.
 */
function cotas(disponiveis, alvo) {
  const cota = disponiveis.map(() => 0);
  let restante = alvo;
  let avancou = true;
  while (restante > 0 && avancou) {
    avancou = false;
    for (let i = 0; i < disponiveis.length && restante > 0; i++) {
      if (cota[i] < disponiveis[i]) {
        cota[i]++;
        restante--;
        avancou = true;
      }
    }
  }
  return cota;
}

/**
 * @param {object[]} arquivos conteúdos dos exports, um por pessoa
 * @param {{porClasse?: number}} [opcoes]
 * @returns {{modelo: object, avisos: string[]}}
 */
export function montarModeloPadrao(arquivos, { porClasse = POR_CLASSE_PADRAO } = {}) {
  if (!Number.isInteger(porClasse) || porClasse < 1 || porClasse > AMOSTRAS_MAXIMAS) {
    throw new Error(`--por-classe precisa estar entre 1 e ${AMOSTRAS_MAXIMAS}.`);
  }

  const validos = arquivos.map((arquivo, i) => {
    const v = SignModelStore.validarArquivo(arquivo);
    if (!v.ok) throw new Error(`Arquivo ${i + 1}: ${v.erro}`);
    return v.classes;
  });

  const avisos = [];
  if (validos.length < MINIMO_PESSOAS) {
    avisos.push(
      `Só ${validos.length} arquivo(s): com menos de ${MINIMO_PESSOAS} pessoas o padrão tende a ` +
        'reconhecer bem apenas quem treinou.'
    );
  }

  const nomes = [...new Set(validos.flatMap((c) => Object.keys(c)))];
  const classes = {};
  for (const nome of nomes) {
    const porPessoa = validos.map((c) => c[nome] || []);
    const contribuintes = porPessoa.filter((a) => a.length > 0).length;
    if (contribuintes < Math.min(MINIMO_PESSOAS, validos.length)) {
      avisos.push(`Classe ${nome}: amostras de só ${contribuintes} pessoa(s).`);
    }

    const cota = cotas(porPessoa.map((a) => a.length), porClasse);
    classes[nome] = porPessoa.flatMap((amostras, i) => espalhados(amostras.length, cota[i]).map((j) => amostras[j]));
  }

  const modelo = {
    formato: FORMATO_ARQUIVO,
    esquema: ESQUEMA,
    versaoFeatures: VERSAO_FEATURES,
    criadoEm: new Date().toISOString(),
    // As features espelham a mão esquerda, então todo export já está no
    // referencial da direita, qualquer que tenha sido a mão de quem treinou.
    mao: 'direita',
    // Recalibrado na instalação, sobre o padrão somado ao treino pessoal.
    tauAbs: null,
    k: 5,
    pessoas: validos.length,
    classes
  };

  const conferido = SignModelStore.validarArquivo(modelo);
  if (!conferido.ok) throw new Error(`O modelo montado não passou na validação: ${conferido.erro}`);
  return { modelo, avisos };
}

function principal(argv) {
  let porClasse = POR_CLASSE_PADRAO;
  let saida = join(RAIZ, 'modelos', 'padrao.json');
  const entradas = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--por-classe') porClasse = Number(argv[++i]);
    else if (argv[i] === '--saida') saida = resolve(argv[++i]);
    else entradas.push(resolve(argv[i]));
  }

  if (entradas.length === 0) {
    console.error('Uso: node tools/montar-modelo-padrao.mjs [--por-classe 50] [--saida caminho] a.json b.json ...');
    process.exitCode = 1;
    return;
  }

  const arquivos = entradas.map((caminho) => JSON.parse(readFileSync(caminho, 'utf8')));
  const { modelo, avisos } = montarModeloPadrao(arquivos, { porClasse });

  mkdirSync(dirname(saida), { recursive: true });
  // Sem indentação: a 30 amostras × 31 classes, o JSON indentado passa do dobro.
  writeFileSync(saida, `${JSON.stringify(modelo)}\n`);

  for (const aviso of avisos) console.warn(`AVISO  ${aviso}`);
  const total = Object.values(modelo.classes).reduce((s, a) => s + a.length, 0);
  console.log(
    `gerado ${saida}\n  ${modelo.pessoas} pessoa(s), ${Object.keys(modelo.classes).length} classes, ${total} amostras`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2));
}
