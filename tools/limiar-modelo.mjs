/**
 * Distâncias que o limiar absoluto precisa separar, medidas num modelo parado.
 * Uso: node tools/limiar-modelo.mjs [modelo.json] [--blocos 17] [--saida limiar.json] [--sem-json]
 *
 * Sem modelo, mede o modelo pronto (modelos/padrao.json). O limiar é o da
 * extensão: src/sign-classifier.js (calibrarTauAbs) sobre o modelo inteiro,
 * isto é, o maior valor entre o piso de 1,3 e cinco vezes o p90 da distância de
 * cada amostra até a vizinha mais próxima da mesma classe.
 *
 * Para letras e números, mede duas distribuições:
 *
 * a) Consulta legítima. Cada bloco de amostras seguidas de uma classe sai do
 *    modelo (a mesma divisão do tools/medir-modelo.mjs), e cada amostra do bloco
 *    é medida até a amostra mais próxima da PRÓPRIA classe que ficou. É a
 *    distância que um sinal certo, feito em outro momento, tem até o modelo.
 * b) Sinal fora do conjunto. Cada amostra do outro conjunto (os números, para o
 *    modo Letras, e as letras, para o modo Números) é medida até a amostra mais
 *    próxima do conjunto ativo. Não é um gesto qualquer, mas é um sinal real que
 *    o modo não conhece, o que serve de aproximação para o gesto não treinado.
 *
 * Para cada uma, dá a distribuição e a fração acima do piso (1,3) e acima do
 * limiar calibrado: a primeira mostra quanto o piso barraria, e a segunda,
 * quanto o limiar em uso de fato barra.
 *
 * Saída: tabela no terminal, com vírgula decimal, e um JSON em medicoes/.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { calibrarTauAbs, LIMIAR_DISTANCIA_PADRAO } from '../src/sign-classifier.js';
import { distancia } from '../src/sign-features.js';
import { LETRAS_ESTATICAS, NUMEROS } from '../src/sign-classes.js';
import { identidadeModelo } from '../src/identidade-modelo.js';
import { NOMES_CONJUNTO, blocos, distribuicao } from './medicao-modelo.js';
import { lerModelo, montarArquivo as montarArquivoMedicao } from './medir-modelo.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FORMATO_LIMIAR = 'soletra-limiar-modelo';
export const VERSAO_LIMIAR = 1;

/** Menor distância de `amostra` até alguma das `outras`. */
function maisProxima(amostra, outras) {
  let melhor = Infinity;
  for (const o of outras) {
    const d = distancia(amostra, o);
    if (d < melhor) melhor = d;
  }
  return melhor;
}

/** Distância de cada amostra de um bloco retirado até a própria classe que ficou. */
export function distanciasLegitimas(classes, nomes, tamanho) {
  const valores = [];
  for (const nome of nomes) {
    const amostras = classes[nome];
    for (const [ini, fim] of blocos(amostras.length, tamanho)) {
      const resto = [...amostras.slice(0, ini), ...amostras.slice(fim)];
      if (resto.length === 0) continue;
      for (let i = ini; i < fim; i++) valores.push(maisProxima(amostras[i], resto));
    }
  }
  return valores;
}

/** Distância de cada amostra de `fora` até a amostra mais próxima de `nomes`. */
export function distanciasForaDoConjunto(classes, nomes, fora) {
  const conjunto = nomes.flatMap((n) => classes[n]);
  return fora.flatMap((n) => classes[n].map((a) => maisProxima(a, conjunto)));
}

const acima = (valores, limite) => (valores.length ? valores.filter((v) => v > limite).length / valores.length : null);

function resumo(valores, limiar) {
  return {
    ...distribuicao(valores),
    p95: distribuicao95(valores),
    acimaDoPiso: acima(valores, LIMIAR_DISTANCIA_PADRAO),
    acimaDoLimiar: acima(valores, limiar)
  };
}

function distribuicao95(valores) {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * 0.95;
  const b = Math.floor(pos);
  return v[b] + ((v[b + 1] ?? v[b]) - v[b]) * (pos - b);
}

export async function medirLimiar(modelo, { tamanho = 17 } = {}) {
  const { objeto, classes } = modelo;
  const limiar = calibrarTauAbs(classes);
  const definicoes = {
    letras: [LETRAS_ESTATICAS, NUMEROS],
    numeros: [NUMEROS, LETRAS_ESTATICAS]
  };
  const conjuntos = {};
  for (const [id, [lista, outra]] of Object.entries(definicoes)) {
    const nomes = lista.filter((n) => classes[n]?.length);
    const fora = outra.filter((n) => classes[n]?.length);
    if (nomes.length < 2) continue;
    conjuntos[id] = {
      legitima: resumo(distanciasLegitimas(classes, nomes, tamanho), limiar),
      foraDoConjunto: fora.length ? resumo(distanciasForaDoConjunto(classes, nomes, fora), limiar) : null
    };
  }
  const sha256 = await identidadeModelo({ versaoFeatures: objeto.versaoFeatures, classes });
  const nomes = Object.keys(classes);
  return {
    modelo: {
      sha256,
      sha256Arquivo: modelo.sha256Arquivo ?? null,
      classes: nomes.length,
      amostras: nomes.reduce((s, n) => s + classes[n].length, 0)
    },
    limiar: { piso: LIMIAR_DISTANCIA_PADRAO, calibrado: limiar },
    conjuntos
  };
}

const decimal = (x, casas = 2) => (Number.isFinite(x) ? x.toFixed(casas).replace('.', ',') : '—');
const porcento = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1).replace('.', ',')}%` : '—');

export function formatarTerminal(arquivo) {
  const { limiar } = arquivo;
  const linhas = [
    `Limiar absoluto — ${arquivo.arquivo} (${arquivo.modelo.amostras} amostras, blocos de ${arquivo.parametros.bloco})`,
    `Piso ${decimal(limiar.piso)}; limiar calibrado ${decimal(limiar.calibrado, 3)}`,
    '',
    'Conjunto  Distância               mediana    p90    p95   acima de 1,3   acima do limiar'
  ];
  for (const [id, c] of Object.entries(arquivo.conjuntos)) {
    for (const [rotulo, r] of [['consulta legítima', c.legitima], ['fora do conjunto', c.foraDoConjunto]]) {
      if (!r) continue;
      linhas.push(
        `${NOMES_CONJUNTO[id].padEnd(9)} ${rotulo.padEnd(20)} ${decimal(r.mediana).padStart(8)} ${decimal(r.p90).padStart(6)} ${decimal(r.p95).padStart(6)} ${porcento(r.acimaDoPiso).padStart(14)} ${porcento(r.acimaDoLimiar).padStart(17)}`
      );
    }
  }
  return linhas.join('\n');
}

/** Relativo ao projeto quando está dentro dele; senão, o caminho inteiro. */
function caminhoLegivel(caminho) {
  const rel = relative(RAIZ, caminho).replaceAll('\\', '/');
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : caminho;
}

async function principal(argv) {
  let entrada = join(RAIZ, 'modelos', 'padrao.json');
  let saida = null;
  let semJson = false;
  let tamanho = 17;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--saida') saida = resolve(argv[++i]);
    else if (argv[i] === '--sem-json') semJson = true;
    else if (argv[i] === '--blocos') tamanho = Number(argv[++i]);
    else if (argv[i].startsWith('--')) throw new Error(`Opção desconhecida: ${argv[i]}`);
    else entrada = resolve(argv[i]);
  }
  if (!Number.isInteger(tamanho) || tamanho <= 0) throw new Error('--blocos espera um tamanho inteiro, como 17.');

  const modelo = lerModelo(entrada);
  const medida = await medirLimiar(modelo, { tamanho });
  // O cabeçalho (data, commit, ambiente) é o mesmo do tools/medir-modelo.mjs.
  const cabecalho = montarArquivoMedicao({ medicao: { conjuntos: {} }, arquivo: caminhoLegivel(entrada) });
  const arquivo = {
    formato: FORMATO_LIMIAR,
    versaoFormato: VERSAO_LIMIAR,
    dataHora: cabecalho.dataHora,
    commit: cabecalho.commit,
    ambiente: cabecalho.ambiente,
    arquivo: cabecalho.arquivo,
    parametros: { bloco: tamanho, fatorDispersao: 5, percentilDispersao: 0.9 },
    ...medida
  };
  console.log(formatarTerminal(arquivo));

  if (!semJson) {
    const destino = saida ?? join(RAIZ, 'medicoes', `limiar-modelo-${basename(entrada, '.json')}.json`);
    mkdirSync(dirname(destino), { recursive: true });
    const arredondado = (_, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(6)) : v);
    writeFileSync(destino, `${JSON.stringify(arquivo, arredondado, 2)}\n`);
    console.log(`\nJSON gravado em ${caminhoLegivel(destino)}`);
  }
  return arquivo;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve()
    .then(() => principal(process.argv.slice(2)))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
}
