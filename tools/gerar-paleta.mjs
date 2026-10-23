/**
 * Gera a paleta da marca para o Radix Themes a partir do azul da logo.
 * Uso: node tools/gerar-paleta.mjs   (regrava ui/paleta.css)
 *
 * O Radix Themes só aceita cores de acento com nome (blue, indigo…), e nenhuma
 * delas é o azul do Soletra: a logo é #0060FF, entre o "blue" (#0090FF) e o
 * "indigo" (#3E63DD) do Radix. A saída é redefinir as escalas que o tema usa —
 * `--blue-*` para o acento e `--slate-*` para os cinzas — com o mesmo desenho
 * das escalas originais.
 *
 * "Mesmo desenho" quer dizer: cada um dos 12 degraus mantém a luminosidade e a
 * saturação (em OKLCH) que o Radix calibrou para o seu papel — 1–2 fundos,
 * 3–5 componentes, 6–8 bordas, 9–10 cor sólida, 11–12 texto —, e só o matiz
 * muda para o da logo. O degrau 9 é a própria cor da logo. Os contrastes de
 * texto do Radix continuam valendo porque a luminosidade não muda.
 *
 * Os cinzas levam o matiz da marca com um pouco mais de saturação que o slate:
 * no escuro viram um azul-marinho profundo, e não preto; no claro, um branco
 * levemente azulado, e não branco puro.
 *
 * A cor secundária é o azul-céu do aro da lupa (#00B4FC), gerada do mesmo jeito
 * sobre o "cyan" e o "sky" do Radix e publicada como `--cyan-*`. É clara
 * demais para levar texto branco, por isso o seu "contrast" é o azul-marinho.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORES_RADIX = join(RAIZ, 'node_modules', '@radix-ui', 'themes', 'tokens', 'colors');
const SAIDA = join(RAIZ, 'ui', 'paleta.css');

/** Azul central da logo (icons/soletra-logo.png), o tom mais frequente da arte. */
const AZUL_LOGO = '#0060ff';
/** Azul-céu do aro da lupa, o tom claro mais saturado da arte. */
const CEU_LOGO = '#00b4fc';
/** Texto sobre o azul-céu: o azul-marinho da paleta, não branco. */
const TEXTO_SOBRE_CEU = '#0b1a33';

// --- conversões sRGB ⇄ OKLCH ----------------------------------------------

const paraLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const deLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexParaRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function rgbParaOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(paraLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}

function oklchParaRgb([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map(deLinear);
}

const dentro = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** Fora do sRGB, reduz a saturação até caber, mantendo luminosidade e matiz. */
function oklchParaHex([L, C, H]) {
  let c = C;
  let rgb = oklchParaRgb([L, c, H]);
  while (!dentro(rgb) && c > 0) {
    c -= 0.002;
    rgb = oklchParaRgb([L, c, H]);
  }
  return rgbParaHex(rgb);
}

const rgbParaHex = (rgb) =>
  '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');

/**
 * Cor translúcida que, sobre o fundo dado, resulta na cor sólida — o mesmo
 * cálculo das escalas "a" (alfa) do Radix, que existem para que componentes
 * sobre qualquer superfície mantenham o tom.
 */
function alfaSobre(hexCor, hexFundo) {
  const alvo = hexParaRgb(hexCor).map((c) => c * 255);
  const fundo = hexParaRgb(hexFundo).map((c) => c * 255);
  let alfa = 0;
  for (let i = 0; i < 3; i++) {
    const t = alvo[i];
    const f = fundo[i];
    if (t > f) alfa = Math.max(alfa, (t - f) / (255 - f));
    else if (t < f) alfa = Math.max(alfa, (f - t) / f);
  }
  alfa = Math.min(1, Math.ceil(alfa * 255) / 255);
  if (alfa === 0) return hexFundo + '00';
  const frente = alvo.map((t, i) => Math.round(Math.min(255, Math.max(0, (t - fundo[i] * (1 - alfa)) / alfa))));
  const a = Math.round(alfa * 255);
  return '#' + [...frente, a].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// --- leitura das escalas de referência do Radix ----------------------------

/** @returns {{claro: string[], escuro: string[]}} os 12 degraus sólidos, em sRGB */
function lerEscala(nome) {
  const css = readFileSync(join(CORES_RADIX, `${nome}.css`), 'utf8');
  const bloco = (seletor) => {
    const inicio = css.indexOf(seletor);
    return css.slice(inicio, css.indexOf('}', inicio));
  };
  const degraus = (texto) =>
    Array.from({ length: 12 }, (_, i) => texto.match(new RegExp(`--${nome}-${i + 1}:\\s*(#[0-9a-f]{6})`))[1]);
  return { claro: degraus(bloco(':root, .light, .light-theme {')), escuro: degraus(bloco('.dark, .dark-theme {')) };
}

const slateRadix = lerEscala('slate');

const [, , H] = rgbParaOklch(hexParaRgb(AZUL_LOGO));

// --- cores da logo -----------------------------------------------------------

/**
 * Escala de uma cor da logo. Luminosidade e saturação de cada degrau: a média
 * entre as duas escalas do Radix vizinhas dessa cor. O 9 é a própria cor; o 10
 * (hover) é um passo mais escuro no claro e mais claro no escuro, como no Radix.
 */
function escalaDaLogo(hex9, [nomeA, nomeB], modo) {
  const [refA, refB] = [lerEscala(nomeA), lerEscala(nomeB)];
  const [L9, C9, H9] = rgbParaOklch(hexParaRgb(hex9));
  return refA[modo].map((hexA, i) => {
    const passo = i + 1;
    if (passo === 9) return hex9;
    if (passo === 10) return oklchParaHex([modo === 'claro' ? L9 - 0.045 : L9 + 0.05, C9, H9]);
    const [La, Ca] = rgbParaOklch(hexParaRgb(hexA));
    const [Lb, Cb] = rgbParaOklch(hexParaRgb(refB[modo][i]));
    return oklchParaHex([(La + Lb) / 2, (Ca + Cb) / 2, H9]);
  });
}

const escalaAcento = (modo) => escalaDaLogo(AZUL_LOGO, ['blue', 'indigo'], modo);
const escalaSecundaria = (modo) => escalaDaLogo(CEU_LOGO, ['cyan', 'sky'], modo);

// --- cinzas ----------------------------------------------------------------

/**
 * Saturação dos cinzas por degrau. No escuro, os fundos sobem um pouco de
 * luminosidade: preto puro cansa e achata a hierarquia entre fundo e cartão.
 */
const SATURACAO_CINZA = {
  claro: [0.006, 0.01, 0.014, 0.018, 0.021, 0.024, 0.028, 0.034, 0.03, 0.03, 0.03, 0.035],
  escuro: [0.03, 0.034, 0.038, 0.042, 0.045, 0.048, 0.05, 0.055, 0.035, 0.035, 0.03, 0.02]
};
const AJUSTE_LUZ_ESCURO = [0.03, 0.035, 0.035, 0.035, 0.03, 0.025, 0.02, 0.015, 0, 0, 0, 0];

function escalaCinza(modo) {
  return slateRadix[modo].map((hex, i) => {
    const [L] = rgbParaOklch(hexParaRgb(hex));
    const luz = modo === 'escuro' ? L + AJUSTE_LUZ_ESCURO[i] : L;
    return oklchParaHex([luz, SATURACAO_CINZA[modo][i], H]);
  });
}

// --- saída -----------------------------------------------------------------

const escalas = {
  claro: { blue: escalaAcento('claro'), cyan: escalaSecundaria('claro'), slate: escalaCinza('claro') },
  escuro: { blue: escalaAcento('escuro'), cyan: escalaSecundaria('escuro'), slate: escalaCinza('escuro') }
};

function bloco(seletor, modo) {
  const fundoAlfa = modo === 'claro' ? '#ffffff' : escalas.escuro.slate[0];
  const linhas = [];
  for (const [nome, escala] of Object.entries(escalas[modo])) {
    escala.forEach((hex, i) => linhas.push(`  --${nome}-${i + 1}: ${hex};`));
    escala.forEach((hex, i) => linhas.push(`  --${nome}-a${i + 1}: ${alfaSobre(hex, fundoAlfa)};`));
    const superficie = modo === 'claro' ? `${escala[1]}cc` : `${escala[2]}80`;
    linhas.push(`  --${nome}-surface: ${superficie};`);
    linhas.push(`  --${nome}-indicator: var(--${nome}-9);`);
    linhas.push(`  --${nome}-track: var(--${nome}-9);`);
  }
  return `${seletor} {\n${linhas.join('\n')}\n}`;
}

const css = `/*
 * Paleta da marca Soletra para o Radix Themes — GERADO por
 * tools/gerar-paleta.mjs a partir das cores da logo (${AZUL_LOGO} e ${CEU_LOGO}).
 * Não editar à mão.
 *
 * Redefine as escalas "blue" (acento), "cyan" (secundária) e "slate" (cinzas)
 * do Radix. Precisa ser
 * importado depois de @radix-ui/themes/styles.css: tem a mesma especificidade,
 * e vence por vir depois — inclusive dos blocos display-p3 do Radix.
 */

${bloco(':root, .light, .light-theme', 'claro')}

${bloco('.dark, .dark-theme', 'escuro')}

:root {
  --cyan-contrast: ${TEXTO_SOBRE_CEU};
}
`;

writeFileSync(SAIDA, css);
console.log(`ui/paleta.css gravado — acento claro: ${escalas.claro.blue.join(' ')}`);
console.log(`secundária clara: ${escalas.claro.cyan.join(' ')}`);
console.log(`cinzas escuros: ${escalas.escuro.slate.join(' ')}`);
console.log(`cinzas claros: ${escalas.claro.slate.join(' ')}`);
