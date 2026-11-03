/**
 * Testes do script de medição do modelo parado (tools/medir-modelo.mjs).
 * Uso: node tests/medir-modelo.test.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  blocos,
  conferirTcc,
  formatarTerminal,
  lerModelo,
  medirCruzado,
  medirModelo,
  montarArquivo,
  porcento,
  FORMATO_MEDICAO,
  TABELA_TCC
} from '../tools/medir-modelo.mjs';
import { VERSAO_FEATURES, DIMENSOES } from '../src/sign-features.js';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(RAIZ, 'tools', 'medir-modelo.mjs');

/** Gerador determinístico, para o modelo de exemplo ser sempre o mesmo. */
function aleatorio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Modelo pequeno: cada classe em torno de um eixo próprio, exceto B e 1, que
 * dividem o mesmo centro (como O e 0 no alfabeto real). Separados por conjunto
 * eles não se confundem; juntos, sim.
 */
function modeloDeExemplo({ amostras = 10, semente = 7, deslocamento = 0 } = {}) {
  const sortear = aleatorio(semente);
  const centros = { A: 0, B: 1, C: 2, 0: 3, 1: 1 };
  const classes = {};
  for (const [classe, eixo] of Object.entries(centros)) {
    classes[classe] = Array.from({ length: amostras }, () =>
      Array.from({ length: DIMENSOES }, (_, d) => (d === eixo ? 3 : 0) + deslocamento + (sortear() - 0.5) * 0.4)
    );
  }
  return { formato: 'soletra-modelo', esquema: 1, versaoFeatures: VERSAO_FEATURES, mao: 'direita', classes };
}

const daMemoria = (objeto) => ({ objeto, classes: objeto.classes });

// --- Cenário 1: blocos de amostras seguidas --------------------------------
{
  assert.deepEqual(blocos(50, 17), [[0, 17], [17, 34], [34, 50]]);
  assert.deepEqual(blocos(50, 25), [[0, 25], [25, 50]]);
  assert.deepEqual(blocos(10, 17), [[0, 10]], 'classe menor que o bloco vira um bloco só');
  console.log('OK  cenário 1 — blocos de amostras seguidas');
}

// --- Cenário 2: conjuntos separados e juntos ------------------------------
const medicao = await medirModelo(daMemoria(modeloDeExemplo()), { blocos: [5] });
{
  const { letras, numeros, juntos } = medicao.conjuntos;
  assert.deepEqual(letras.classes, ['A', 'B', 'C']);
  assert.deepEqual(numeros.classes, ['0', '1']);
  assert.equal(juntos.classes.length, 5);

  assert.equal(letras.validacao[0].acerto, 1, 'sem B/1 juntos, nada se confunde');
  assert.equal(numeros.validacao[0].acerto, 1);
  const j = juntos.validacao[0];
  assert.equal(j.amostras, 50);
  assert.ok(j.acerto < 1 && j.acerto >= 0.6, `juntos confunde B com 1 (acerto ${j.acerto})`);
  for (const c of j.confusoes) assert.ok(['B→1', '1→B'].includes(`${c.real}→${c.previsto}`), `confusão inesperada ${c.real}→${c.previsto}`);
  assert.equal(j.porClasse.A.acerto, 1);
  assert.equal(j.porClasse.B.amostras, 10);
  assert.equal(j.razao.acertos.n + (j.razao.erros?.n ?? 0), 50);
  console.log('OK  cenário 2 — acerto por conjunto, por classe e confusões');
}

// --- Cenário 3: corte da razão e rigor são consistentes -------------------
{
  const j = medicao.conjuntos.juntos.validacao[0];
  for (let i = 1; i < j.cortes.length; i++) {
    assert.ok(j.cortes[i].acertosDescartados <= j.cortes[i - 1].acertosDescartados, 'corte mais frouxo descarta menos');
    assert.ok(j.cortes[i].errosBarrados <= j.cortes[i - 1].errosBarrados, 'corte mais frouxo barra menos');
  }
  for (const c of j.cortes) {
    assert.equal(c.acertoFinal, (j.acertos - c.acertosDescartados) / j.amostras);
  }
  const [tolerante, normal, exigente] = j.rigor;
  assert.deepEqual(j.rigor.map((r) => r.nome), ['Tolerante', 'Normal', 'Exigente']);
  assert.equal(tolerante.razaoEfetiva, 0.99, 'teto da razão');
  assert.equal(normal.razaoEfetiva, 0.97);
  assert.ok(Math.abs(exigente.razaoEfetiva - 0.776) < 1e-9);
  assert.ok(exigente.rejeicao >= normal.rejeicao && normal.rejeicao >= tolerante.rejeicao, 'mais rigor, mais rejeição');
  assert.ok(exigente.errosQuePassam <= tolerante.errosQuePassam);
  for (const r of j.rigor) {
    assert.ok(Math.abs(r.acertoFinal + r.rejeicao + r.errosQuePassam - 1) < 1e-9, 'cada amostra cai em uma categoria');
  }
  console.log('OK  cenário 3 — corte da razão e rigor');
}

// --- Cenário 4: limiar calibrado e pares mais próximos --------------------
{
  const l = medicao.conjuntos.juntos.limiar;
  assert.equal(l.calibrado, Math.max(l.padrao, l.cincoVezesP90));
  assert.equal(medicao.conjuntos.letras.limiar.calibrado, l.calibrado, 'limiar vem do modelo inteiro, como na extensão');
  assert.equal(medicao.paresMaisProximos[0].par, 'B/1', 'o par que divide o centro é o mais próximo');
  console.log('OK  cenário 4 — limiar e pares mais próximos');
}

// --- Cenário 5: conferência com a tabela do TCC ---------------------------
{
  const conjuntos = { letras: { validacao: [{ tamanhoBloco: 17, acerto: 0.93412 }] } };
  const tabela = { sha256: 'x', acerto: { letras: { 17: 0.934 } } };
  assert.equal(conferirTcc('x', conjuntos, tabela).bate, true);
  assert.equal(conferirTcc('x', { letras: { validacao: [{ tamanhoBloco: 17, acerto: 0.9326 }] } }, tabela).bate, false);
  assert.equal(conferirTcc('outro', conjuntos, tabela), null, 'outro modelo: sem conferência');
  assert.equal(medicao.conferenciaTcc, null);
  console.log('OK  cenário 5 — conferência com a tabela do TCC');
}

// --- Cenário 6: comparação entre modelos ----------------------------------
{
  const cruzado = medirCruzado(modeloDeExemplo().classes, modeloDeExemplo({ semente: 99 }).classes);
  assert.equal(cruzado.letras.acerto, 1, 'mesma mão, outra gravação');
  const longe = medirCruzado(modeloDeExemplo().classes, modeloDeExemplo({ semente: 99, deslocamento: 50 }).classes);
  assert.equal(longe.letras.normal.acertoFinal, 0, 'mão muito diferente: o limiar rejeita');
  assert.equal(longe.letras.normal.rejeicao, 1);
  console.log('OK  cenário 6 — modelo treinado com um e testado com outro');
}

// --- Cenário 7: arquivo e terminal ----------------------------------------
{
  const arquivo = montarArquivo({ medicao, arquivo: 'exemplo.json', dataHora: '2026-11-03T12:00:00.000Z', commit: 'abc1234' });
  assert.equal(arquivo.formato, FORMATO_MEDICAO);
  assert.equal(arquivo.commit, 'abc1234');
  assert.match(arquivo.modelo.sha256, /^[0-9a-f]{64}$/);
  assert.equal(arquivo.parametros.k, 5);
  assert.equal(arquivo.parametros.razaoTeto, 0.99);
  assert.deepEqual(arquivo.parametros.blocos, [5]);
  const texto = formatarTerminal(arquivo);
  assert.match(texto, /1\. Acerto por validação em blocos/);
  assert.match(texto, /Juntos \(5\)/);
  assert.equal(porcento(0.934), '93,4%', 'vírgula decimal');
  console.log('OK  cenário 7 — JSON com cabeçalho e tabela com vírgula decimal');
}

// --- Cenário 8: linha de comando ------------------------------------------
{
  const pasta = mkdtempSync(join(tmpdir(), 'soletra-medir-'));
  try {
    const entrada = join(pasta, 'exemplo.json');
    const saida = join(pasta, 'medicao.json');
    writeFileSync(entrada, JSON.stringify(modeloDeExemplo()));
    const terminal = execFileSync(process.execPath, [SCRIPT, entrada, '--saida', saida], { encoding: 'utf8' });
    assert.match(terminal, /4\. Efeito do rigor/);
    const json = JSON.parse(readFileSync(saida, 'utf8'));
    assert.equal(json.formato, FORMATO_MEDICAO);
    assert.equal(json.modelo.sha256Arquivo, createHash('sha256').update(readFileSync(entrada)).digest('hex'));
    assert.deepEqual(json.parametros.blocos, [17, 25]);
    assert.ok(json.dataHora && json.commit);

    writeFileSync(join(pasta, 'ruim.json'), JSON.stringify({ formato: 'outro' }));
    assert.throws(
      () => execFileSync(process.execPath, [SCRIPT, join(pasta, 'ruim.json'), '--sem-json'], { stdio: 'pipe' }),
      'modelo inválido termina com erro'
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
  console.log('OK  cenário 8 — linha de comando grava o JSON e recusa modelo inválido');
}

// --- Cenário 9: o modelo pronto ainda reproduz a tabela do TCC ------------
{
  const pronto = lerModelo(join(RAIZ, 'modelos', 'padrao.json'));
  const real = await medirModelo(pronto);
  assert.equal(real.modelo.sha256, TABELA_TCC.sha256, 'o modelo pronto mudou: refaça a tabela do TCC');
  assert.ok(real.conferenciaTcc?.bate, `tabela do TCC: ${JSON.stringify(real.conferenciaTcc?.itens)}`);
  console.log('OK  cenário 9 — o modelo pronto reproduz a tabela do TCC (93,4/93,0 · 92,0/90,2 · 87,5/85,8)');
}
