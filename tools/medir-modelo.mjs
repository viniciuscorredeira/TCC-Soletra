/**
 * Mede um modelo parado, sem câmera, de forma reproduzível.
 * Uso: node tools/medir-modelo.mjs [modelo.json] [--comparar outro.json] [--blocos 17,25]
 *                                   [--saida medicao.json] [--sem-json]
 *
 * Sem modelo, mede o modelo pronto (modelos/padrao.json). A classificação é a
 * do próprio src/sign-classifier.js, não uma reimplementação: o script só
 * monta os conjuntos de treino e teste e conta o que o classificador responde.
 *
 * Métricas:
 * 1. Acerto por validação em blocos: cada bloco de amostras seguidas de uma
 *    classe sai inteiro do modelo e é classificado pelo resto (as outras
 *    classes ficam completas). Blocos, e não amostras soltas, porque amostras
 *    vizinhas na gravação são quase iguais: tirar uma só e achar a gêmea ao lado
 *    mediria memória, não reconhecimento. Sem limiar e sem teste de razão, com
 *    k = 5 e voto ponderado. Letras (21), números (10) e os dois juntos (31).
 * 2. Razão vencedora/segunda nos acertos e nos erros.
 * 3. O que cada corte da razão faria: acertos descartados e erros barrados.
 * 4. O efeito do rigor da interface, com o limiar e a razão multiplicados
 *    exatamente como na extensão (o classificador é o mesmo).
 * Mais o limiar calculado para o modelo, os pares de classes mais próximos e,
 * com --comparar, a comparação com outro modelo (por exemplo, gravado por
 * outra pessoa), incluindo treinar com um e testar com o outro.
 *
 * Saída: tabela no terminal, com vírgula decimal, e um JSON com cabeçalho
 * (data, commit e SHA-256 do modelo) em medicoes/. O cálculo mora em
 * tools/medicao-modelo.js, o mesmo que a seção "Medir o modelo" do modo dev
 * usa; este arquivo só lê o modelo, escreve a tabela e grava o JSON.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { BLOCOS, NOMES_CONJUNTO, compararModelos, emOrdem, medirModelo, montarArquivo as montarArquivoMedicao, validarModelo } from './medicao-modelo.js';

export {
  BLOCOS, CORTES_RAZAO, FORMATO_MEDICAO, RIGORES, TABELA_TCC, VERSAO_MEDICAO,
  blocos, compararModelos, conferirTcc, distribuicao, medirCruzado, medirModelo, validarModelo
} from './medicao-modelo.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Lê e valida um modelo exportado (o mesmo critério da importação na extensão). */
export function lerModelo(caminho) {
  const bytes = readFileSync(caminho);
  let modelo;
  try {
    modelo = validarModelo(JSON.parse(bytes.toString('utf8')));
  } catch (err) {
    throw new Error(`${caminho}: ${err.message}`);
  }
  return { ...modelo, sha256Arquivo: createHash('sha256').update(bytes).digest('hex') };
}

// --- Cabeçalho e saída ---------------------------------------------------

function commitAtual() {
  try {
    const opcoes = { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] };
    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], opcoes).toString().trim();
    let modificado = false;
    try {
      execFileSync('git', ['diff', '--quiet', 'HEAD'], opcoes);
    } catch {
      modificado = true;
    }
    return modificado ? `${hash}-modificado` : hash;
  } catch {
    return 'desconhecido';
  }
}

/** O arquivo da medição, com o commit e a versão do Node desta máquina. */
export function montarArquivo({ commit = commitAtual(), ...partes }) {
  return montarArquivoMedicao({ ...partes, commit, ambiente: { node: process.version } });
}

// --- Terminal ------------------------------------------------------------

const decimal = (x, casas = 2) => (Number.isFinite(x) ? x.toFixed(casas).replace('.', ',') : '—');
export const porcento = (x, casas = 1) => (Number.isFinite(x) ? `${decimal(x * 100, casas)}%` : '—');
const coluna = (texto, largura) => String(texto).padStart(largura);

export function formatarTerminal(arquivo) {
  const linhas = [];
  const titulo = (t) => linhas.push('', t, '-'.repeat(t.length));
  const m = arquivo.modelo;
  const blocosMedidos = arquivo.parametros.blocos;

  linhas.push(`Soletra — medição do modelo ${arquivo.arquivo}`);
  linhas.push(`${m.classes} classes, ${m.amostras} amostras · SHA-256 ${m.sha256}`);
  linhas.push(`commit ${arquivo.commit} · ${new Date(arquivo.dataHora).toLocaleString('pt-BR')}`);
  linhas.push(`k = ${arquivo.parametros.k}, voto ponderado, validação em blocos de ${blocosMedidos.join(' e ')} amostras seguidas`);

  for (const aviso of arquivo.avisos ?? []) linhas.push(`AVISO  ${aviso}`);

  titulo('1. Acerto por validação em blocos (sem limiar e sem teste de razão)');
  linhas.push(`${'Conjunto'.padEnd(14)}${blocosMedidos.map((t) => coluna(`blocos de ${t}`, 15)).join('')}`);
  for (const [id, c] of emOrdem(arquivo.conjuntos)) {
    linhas.push(`${`${NOMES_CONJUNTO[id]} (${c.classes.length})`.padEnd(14)}${c.validacao.map((v) => coluna(porcento(v.acerto), 15)).join('')}`);
  }
  const conf = arquivo.conferenciaTcc;
  if (conf) {
    linhas.push('');
    linhas.push(conf.bate
      ? `Confere com a tabela do TCC: ${conf.itens.length} de ${conf.itens.length} valores iguais.`
      : `ATENÇÃO: não confere com a tabela do TCC — ${conf.itens.filter((i) => !i.bate).map((i) => `${NOMES_CONJUNTO[i.conjunto]} blocos de ${i.tamanhoBloco}: esperado ${porcento(i.esperado)}, medido ${porcento(i.medido)}`).join('; ')}.`);
  }

  for (const [id, c] of emOrdem(arquivo.conjuntos)) {
    linhas.push('', `${NOMES_CONJUNTO[id]} — acerto por classe (${blocosMedidos.map((t) => `blocos de ${t}`).join(' / ')})`);
    const celulas = c.classes.map((nome) => `${nome.padEnd(2)} ${c.validacao.map((v) => porcento(v.porClasse[nome].acerto, 0).padStart(4)).join(' /')}`);
    for (let i = 0; i < celulas.length; i += 5) linhas.push(`  ${celulas.slice(i, i + 5).map((t) => t.padEnd(16)).join('')}`.trimEnd());
    const confusoes = c.validacao[0].confusoes.slice(0, 8).map((x) => `${x.real}→${x.previsto} (${x.vezes})`).join(', ');
    linhas.push(`  Confusões mais frequentes (blocos de ${c.validacao[0].tamanhoBloco}): ${confusoes || 'nenhuma'}`);
  }

  titulo('2. Razão vencedora/segunda');
  linhas.push(`${'Conjunto'.padEnd(20)}${'n'.padStart(6)}${['mín', 'p10', 'p25', 'mediana', 'p75', 'p90', 'máx'].map((t) => coluna(t, 8)).join('')}`);
  for (const [id, c] of emOrdem(arquivo.conjuntos)) {
    for (const v of c.validacao) {
      for (const [rotulo, d] of [['acertos', v.razao.acertos], ['erros', v.razao.erros]]) {
        const nome = `${NOMES_CONJUNTO[id]} b${v.tamanhoBloco} ${rotulo}`;
        linhas.push(`${nome.padEnd(20)}${coluna(d?.n ?? 0, 6)}${['min', 'p10', 'p25', 'mediana', 'p75', 'p90', 'max'].map((k) => coluna(decimal(d?.[k]), 8)).join('')}`);
      }
    }
  }

  titulo('3. Efeito do corte da razão (acertos descartados · erros barrados · acerto que sobra)');
  linhas.push(`${'Conjunto'.padEnd(14)}${arquivo.parametros.cortesRazao.map((c) => coluna(`corte ${decimal(c)}`, 24)).join('')}`);
  for (const [id, c] of emOrdem(arquivo.conjuntos)) {
    for (const v of c.validacao) {
      const celulas = v.cortes.map((x) => coluna(`${porcento(x.fracaoAcertosDescartados)} · ${porcento(x.fracaoErrosBarrados, 0)} · ${porcento(x.acertoFinal)}`, 24));
      linhas.push(`${`${NOMES_CONJUNTO[id]} b${v.tamanhoBloco}`.padEnd(14)}${celulas.join('')}`);
    }
  }

  titulo('4. Efeito do rigor (limiar e razão como na extensão)');
  linhas.push(`${'Conjunto'.padEnd(14)}${'Rigor'.padEnd(11)}${['razão', 'limiar', 'acerto', 'rejeição', 'erro passa', 'precisão'].map((t) => coluna(t, 11)).join('')}`);
  for (const [id, c] of emOrdem(arquivo.conjuntos)) {
    for (const v of c.validacao) {
      for (const r of v.rigor) {
        linhas.push(
          `${`${NOMES_CONJUNTO[id]} b${v.tamanhoBloco}`.padEnd(14)}${r.nome.padEnd(11)}` +
            [decimal(r.razaoEfetiva), decimal(r.limiarEfetivoMediano), porcento(r.acertoFinal), porcento(r.rejeicao), porcento(r.errosQuePassam), porcento(r.precisao)]
              .map((t) => coluna(t, 11)).join('')
        );
      }
    }
  }

  titulo('5. Limiar de distância calculado para o modelo (todas as classes, como na extensão)');
  const l0 = Object.values(arquivo.conjuntos)[0]?.limiar;
  if (l0) linhas.push(`max(${decimal(l0.padrao, 1)}; 5 × p90 da vizinha da mesma classe ${decimal(l0.p90MesmaClasse, 3)} = ${decimal(l0.cincoVezesP90, 3)}) = ${decimal(l0.calibrado, 3)}`);
  for (const [id, c] of emOrdem(arquivo.conjuntos)) {
    const l = c.limiar;
    linhas.push(
      `${NOMES_CONJUNTO[id]}:` +
        ` vizinha da mesma classe: mediana ${decimal(l.distanciaMesmaClasse?.mediana, 3)}` +
        ` · da outra classe: mediana ${decimal(l.distanciaOutraClasse?.mediana, 3)}, mín ${decimal(l.distanciaOutraClasse?.min, 3)}`
    );
    linhas.push(`  amostras com uma de outra classe abaixo do limiar: ${l.porRigor.map((r) => `${r.nome} ${porcento(r.fracao)} (${r.amostrasComOutraClasseAbaixo})`).join(' · ')}`);
  }

  titulo('6. Pares de classes mais próximos (mediana da distância à vizinha da outra classe)');
  const pares = arquivo.paresMaisProximos.map((p) => `${p.par} ${decimal(p.distanciaMediana, 3)}`);
  for (let i = 0; i < pares.length; i += 4) linhas.push(`  ${pares.slice(i, i + 4).map((t) => t.padEnd(18)).join('')}`.trimEnd());

  if (arquivo.comparacao) {
    const cmp = arquivo.comparacao;
    titulo(`7. Comparação com ${cmp.arquivo} (SHA-256 ${cmp.modelo.sha256.slice(0, 12)}…)`);
    linhas.push(`${'Conjunto'.padEnd(14)}${'este'.padStart(10)}${'outro'.padStart(10)}${'este→outro'.padStart(14)}${'outro→este'.padStart(14)}`);
    for (const [id, c] of emOrdem(arquivo.conjuntos)) {
      for (const v of c.validacao) {
        const o = cmp.conjuntos[id]?.validacao.find((x) => x.tamanhoBloco === v.tamanhoBloco);
        linhas.push(`${`${NOMES_CONJUNTO[id]} b${v.tamanhoBloco}`.padEnd(14)}${coluna(porcento(v.acerto), 10)}${coluna(porcento(o?.acerto), 10)}`);
      }
      linhas.push(`${`${NOMES_CONJUNTO[id]} cruzado`.padEnd(34)}${coluna(porcento(cmp.cruzado.desteParaOutro[id]?.acerto), 14)}${coluna(porcento(cmp.cruzado.doOutroParaEste[id]?.acerto), 14)}`);
      const normal = (x) => (x ? `${porcento(x.normal.acertoFinal)} acerto, ${porcento(x.normal.rejeicao)} rejeição` : '—');
      linhas.push(`  rigor Normal, cruzado: este→outro ${normal(cmp.cruzado.desteParaOutro[id])} · outro→este ${normal(cmp.cruzado.doOutroParaEste[id])}`);
    }
    linhas.push('  "este→outro": treina com todas as amostras deste modelo e classifica as do outro.');
  }
  return linhas.join('\n');
}

// --- Linha de comando ----------------------------------------------------

function principal(argv) {
  let entrada = join(RAIZ, 'modelos', 'padrao.json');
  let saida = null;
  let comparar = null;
  let semJson = false;
  let tamanhos = BLOCOS;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--saida') saida = resolve(argv[++i]);
    else if (argv[i] === '--comparar') comparar = resolve(argv[++i]);
    else if (argv[i] === '--sem-json') semJson = true;
    else if (argv[i] === '--blocos') tamanhos = String(argv[++i]).split(',').map(Number);
    else if (argv[i].startsWith('--')) throw new Error(`Opção desconhecida: ${argv[i]}`);
    else entrada = resolve(argv[i]);
  }
  if (!tamanhos.length || !tamanhos.every((t) => Number.isInteger(t) && t > 0)) {
    throw new Error('--blocos espera tamanhos inteiros separados por vírgula, como 17,25.');
  }
  return executar({ entrada, saida, comparar, semJson, tamanhos });
}

/** Relativo ao projeto quando está dentro dele; senão, o caminho inteiro. */
function caminhoLegivel(caminho) {
  const rel = relative(RAIZ, caminho).replaceAll('\\', '/');
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : caminho;
}

async function executar({ entrada, saida, comparar, semJson, tamanhos }) {
  const modelo = lerModelo(entrada);
  const medicao = await medirModelo(modelo, { blocos: tamanhos });
  const comparacao = comparar
    ? await compararModelos(modelo, lerModelo(comparar), { rotulo: caminhoLegivel(comparar), blocos: tamanhos })
    : null;
  const arquivo = montarArquivo({ medicao, arquivo: caminhoLegivel(entrada), comparacao });
  console.log(formatarTerminal(arquivo));

  if (!semJson) {
    const destino = saida ?? join(RAIZ, 'medicoes', `medir-modelo-${basename(entrada, '.json')}${comparar ? `-x-${basename(comparar, '.json')}` : ''}.json`);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, `${JSON.stringify(arquivo, null, 2)}\n`);
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
