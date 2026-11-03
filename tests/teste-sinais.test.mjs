/**
 * Testes do teste de sinais do modo dev: sessão, análise da rodada, relatórios,
 * arquivo JSON e identidade do modelo.
 * Uso: node tests/teste-sinais.test.mjs
 *
 * Os quadros são sintéticos e montados à mão, então cada número esperado aqui
 * foi contado a olho — é o que garante que o relatório (e o arquivo que vai
 * para o TCC) diz o que aconteceu.
 */
import assert from 'node:assert/strict';
import { quantil, distribuicao, moda } from '../dev/estatistica.js';
import { identidadeModelo } from '../dev/identidade-modelo.js';
import { analisarRodada, resultadoDaRodada } from '../dev/teste/rodada.js';
import { planejar, SessaoTeste } from '../dev/teste/sessao.js';
import { relatorioUnitario, relatorioGeral } from '../dev/teste/relatorio.js';
import { montarArquivo, nomeDoArquivo, FORMATO } from '../dev/teste/exportar.js';
import { LETRAS_ESTATICAS, NUMEROS } from '../src/sign-classes.js';

/** Um quadro como o reconhecedor publica, só com o que o teste lê. */
function quadro(t, { classe = null, motivo = null, razao = 0.3, alvo = 'B', distAlvo = 0.5, mao = true, bloqueada = false, confirmou = null } = {}) {
  return {
    t,
    duracao: 20 + (t % 7),
    landmarks: mao ? [] : null,
    maoDetectada: mao ? 'direita' : null,
    confiancaMao: mao ? 0.9 : null,
    maoConfigurada: 'direita',
    maoBloqueada: bloqueada,
    captura: false,
    classificacao: mao && !bloqueada ? { classe, motivo, razao, ranking: [{ classe: alvo, distancia: distAlvo }] } : null,
    limiarRazao: 0.97,
    limiarDistancia: 1.3,
    rigor: 1,
    permanencia: 700,
    estabilizador: { confirmou }
  };
}

const perto = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- Cenário 1: estatística ------------------------------------------------
{
  // Mesmos valores do numpy.percentile (interpolação linear).
  assert.ok(perto(quantil([1, 2, 3, 4], 0.1), 1.3));
  assert.ok(perto(quantil([4, 1, 3, 2], 0.9), 3.7));
  assert.equal(quantil([], 0.5), null);
  const d = distribuicao([3, 1, 2, NaN, null]);
  assert.equal(d.n, 3);
  assert.equal(d.mediana, 2);
  assert.equal(moda(['a', 'b', 'b', null]), 'b');
  console.log('OK  cenário 1 — percentis por interpolação linear, ignorando valores ausentes');
}

// --- Cenário 2: plano da sessão --------------------------------------------
{
  const u = planejar({ modo: 'unitario', sinal: 'B', rodadas: 3 });
  assert.deepEqual(u.map((r) => r.sinal), ['B', 'B', 'B']);
  assert.deepEqual(u.map((r) => r.repeticao), [1, 2, 3]);

  const g = planejar({ modo: 'geral', rodadas: 1 });
  assert.deepEqual(g.map((r) => r.sinal), [...LETRAS_ESTATICAS, ...NUMEROS], 'em ordem: letras e depois números');
  assert.equal(g.find((r) => r.sinal === '3').conjunto, 'numeros');
  assert.equal(g.find((r) => r.sinal === 'O').conjunto, 'letras');

  const so = planejar({ modo: 'geral', conjuntos: ['numeros'], rodadas: 2 });
  assert.equal(so.length, 20);

  const s1 = planejar({ modo: 'geral', conjuntos: ['numeros'], rodadas: 2, ordem: 'sorteada', semente: 7 });
  const s2 = planejar({ modo: 'geral', conjuntos: ['numeros'], rodadas: 2, ordem: 'sorteada', semente: 7 });
  const s3 = planejar({ modo: 'geral', conjuntos: ['numeros'], rodadas: 2, ordem: 'sorteada', semente: 8 });
  assert.deepEqual(s1, s2, 'a mesma semente sorteia a mesma ordem');
  assert.notDeepEqual(s1.map((r) => r.sinal), s3.map((r) => r.sinal));
  assert.ok(s1.every((r, i) => i === 0 || r.sinal !== s1[i - 1].sinal), 'sem o mesmo sinal duas vezes seguidas');
  assert.deepEqual([...s1.map((r) => r.sinal)].sort(), [...so.map((r) => r.sinal)].sort(), 'sorteio só muda a ordem');
  console.log('OK  cenário 2 — plano em ordem ou sorteado (reproduzível, sem repetição seguida)');
}

// --- Cenário 3: análise de uma rodada --------------------------------------
{
  // Rodada de 1000 ms a partir de t = 1000. Os quadros fora dela não contam.
  const quadros = [
    quadro(900, { classe: 'B' }), // antes do início
    quadro(1000, { classe: 'B', razao: 0.2, distAlvo: 0.4 }),
    quadro(1100, { classe: 'B', razao: 0.4, distAlvo: 0.6 }),
    quadro(1200, { classe: 'D', razao: 0.9, distAlvo: 1.1 }),
    quadro(1300, { classe: null, motivo: 'ambiguo', razao: 0.98, distAlvo: 1.0 }),
    quadro(1400, { classe: 'B', razao: 0.3, distAlvo: 0.5 }),
    quadro(1500, { classe: 'B', razao: 0.3, distAlvo: 0.5 }),
    quadro(1600, { classe: 'B', razao: 0.3, distAlvo: 0.5, confirmou: 'B' }),
    quadro(1700, { mao: false }),
    quadro(1800, { bloqueada: true }),
    quadro(1900, { classe: 'D', razao: 0.8, distAlvo: 0.9 }),
    quadro(2000, { classe: 'B' }) // depois do fim (o fim é exclusivo)
  ];
  const a = analisarRodada({ sinal: 'B', inicio: 1000, duracao: 1000, quadros });

  assert.deepEqual(a.quadros, { total: 10, validos: 8, certos: 5, outras: 2, rejeitados: 1, ambiguos: 1, distantes: 0, semMao: 1, bloqueados: 1 });
  assert.equal(a.acertoQuadros, 5 / 8);
  assert.deepEqual(a.confusoes, [{ classe: 'D', quadros: 2 }]);
  assert.equal(a.resultado, 'acerto');
  assert.equal(a.reconhecido, 'B');
  assert.equal(a.primeiraConfirmacao.ms, 600);
  assert.deepEqual(a.maiorSequencia, { quadros: 3, ms: 200 }, 'B em 1400, 1500 e 1600');
  // Decisões nos válidos: B B D rej B B B D → 4 mudanças.
  assert.equal(a.mudancasDeClasse, 4);
  assert.equal(a.razaoNosCertos.n, 5);
  assert.ok(perto(a.razaoNosCertos.mediana, 0.3));
  assert.equal(a.distanciaAlvo.n, 8);
  assert.equal(a.hz, 10);
  assert.equal(a.mao.detectada, 'direita');
  assert.equal(a.ajustes.mudaramNaRodada, false);
  assert.equal(a.linhaDoTempo.length, 10);
  assert.equal(a.linhaDoTempo[2].categoria, 'outra');

  const troca = analisarRodada({ sinal: 'B', inicio: 0, duracao: 500, quadros: [quadro(0, { classe: 'D', confirmou: 'D' }), quadro(100, { classe: 'B', confirmou: 'B' })] });
  assert.equal(troca.resultado, 'troca', 'vale a PRIMEIRA confirmação');
  assert.equal(troca.reconhecido, 'D');
  assert.equal(troca.confirmacoes.length, 2);

  const rejeicao = analisarRodada({
    sinal: 'B', inicio: 0, duracao: 500,
    quadros: [quadro(0, { motivo: 'distante' }), quadro(100, { motivo: 'distante' }), quadro(200, { classe: 'B' })]
  });
  assert.equal(rejeicao.resultado, 'rejeicao');
  assert.equal(rejeicao.quadros.distantes, 2);

  const semMao = analisarRodada({ sinal: 'B', inicio: 0, duracao: 500, quadros: [quadro(0, { mao: false }), quadro(100, { classe: 'B' })] });
  assert.equal(semMao.resultado, 'tempo-esgotado');

  const vazia = analisarRodada({ sinal: 'B', inicio: 0, duracao: 500, quadros: [] });
  assert.equal(vazia.resultado, 'tempo-esgotado');
  assert.equal(vazia.acertoQuadros, null, 'sem quadros válidos, o acerto por quadro não se aplica');
  console.log('OK  cenário 3 — a rodada conta quadros, confusões, confirmações e o resultado formal');
}

// --- Cenário 4: sessão com pausar, pular e repetir -------------------------
{
  const eventos = [];
  const s = new SessaoTeste({ modo: 'unitario', sinal: 'B', rodadas: 3, inicio: 'contagem', contagemMs: 1000, duracaoMs: 1000 }, (e) => eventos.push(e.tipo));
  s.iniciar(0);
  assert.equal(s.fase, 'contagem');

  // Quadros na contagem são ignorados.
  s.aoQuadro(quadro(500, { classe: 'D', confirmou: 'D' }));
  s.tick(1000);
  assert.equal(s.fase, 'gravando');
  for (let t = 1000; t < 2000; t += 100) s.aoQuadro(quadro(t, { classe: 'B', confirmou: t === 1700 ? 'B' : null }));
  s.tick(2000);
  assert.equal(s.rodadas.length, 1);
  assert.equal(s.rodadas[0].analise.resultado, 'acerto');
  assert.equal(s.rodadas[0].analise.primeiraConfirmacao.ms, 700);
  assert.equal(s.rodadas[0].inicioMs, 1000);
  assert.equal(s.fase, 'contagem', 'segue para a próxima rodada');

  // Rodada 2: pausa no meio da gravação descarta o que foi gravado.
  s.tick(3000);
  s.aoQuadro(quadro(3100, { classe: 'D', confirmou: 'D' }));
  s.pausar();
  assert.equal(s.fase, 'pausada');
  s.continuar(10000);
  assert.equal(s.fase, 'contagem');
  s.tick(11000);
  s.repetir(11500); // repetir volta à contagem
  assert.equal(s.fase, 'contagem');
  s.tick(12500);
  for (let t = 12500; t < 13500; t += 100) s.aoQuadro(quadro(t, { mao: false }));
  s.tick(13500);
  assert.equal(s.rodadas[1].analise.resultado, 'tempo-esgotado', 'o D de antes da pausa não conta');
  assert.equal(s.rodadas[1].analise.quadros.semMao, 10);

  // Rodada 3: pulada.
  s.pular(13600);
  assert.equal(s.rodadas[2].estado, 'pulada');
  assert.equal(s.fase, 'concluida');
  assert.equal(eventos.at(-1), 'concluida');
  assert.deepEqual(s.estado(14000), { fase: 'concluida', inicio: 'contagem', indice: 3, total: 3, item: null, restanteMs: null, faseMs: null, erradasNaEspera: 0, feitas: 2, puladas: 1 });

  // Encerrar antes do fim descarta só a rodada em andamento.
  const e = new SessaoTeste({ modo: 'unitario', sinal: 'A', rodadas: 5, inicio: 'contagem', contagemMs: 10, duracaoMs: 10 });
  e.iniciar(0);
  e.tick(10);
  e.tick(20);
  e.encerrar();
  assert.equal(e.fase, 'concluida');
  assert.equal(e.rodadas.length, 1);
  console.log('OK  cenário 4 — a sessão conduz contagem e gravação, com pausar, repetir, pular e encerrar');
}

// --- Cenário 5: relatórios -------------------------------------------------
function rodadaFeita(sinal, repeticao, quadros, duracao = 1000) {
  const analise = analisarRodada({ sinal, inicio: 0, duracao, quadros });
  return { sinal, conjunto: NUMEROS.includes(sinal) ? 'numeros' : 'letras', repeticao, estado: 'feita', inicio: 'contagem', ...resultadoDaRodada({ sinal, inicio: 'contagem', analise }), analise };
}

const rodadas = [
  // B: acerto (4 certos, 1 D), acerto (5 certos)
  rodadaFeita('B', 1, [0, 100, 200, 300].map((t) => quadro(t, { classe: 'B', confirmou: t === 300 ? 'B' : null, razao: 0.2 })).concat(quadro(400, { classe: 'D' }))),
  rodadaFeita('B', 2, [0, 100, 200, 300, 400].map((t) => quadro(t, { classe: 'B', confirmou: t === 100 ? 'B' : null, razao: 0.4 }))),
  // D: troca para B (3 B, 2 D)
  rodadaFeita('D', 1, [quadro(0, { classe: 'B', alvo: 'D' }), quadro(100, { classe: 'B', alvo: 'D', confirmou: 'B' }), quadro(200, { classe: 'B', alvo: 'D' }), quadro(300, { classe: 'D', alvo: 'D' }), quadro(400, { classe: 'D', alvo: 'D' })]),
  // 0: rejeição
  rodadaFeita('0', 1, [quadro(0, { motivo: 'ambiguo', alvo: '0' }), quadro(100, { motivo: 'ambiguo', alvo: '0' })]),
  // O: pulada
  { sinal: 'O', conjunto: 'letras', repeticao: 1, estado: 'pulada' }
];

{
  const u = relatorioUnitario('B', rodadas);
  assert.equal(u.rodadas, 2);
  assert.equal(u.acerto, 1);
  assert.equal(u.quadros.certos, 9);
  assert.equal(u.quadros.validos, 10);
  assert.equal(u.acertoQuadros, 0.9);
  assert.equal(u.tempoMedioAteReconhecer, 200, '(300 + 100) / 2');
  assert.deepEqual(u.confusoes, [{ classe: 'D', quadros: 1 }]);
  assert.equal(u.razaoNosCertos.n, 9);
  assert.equal(u.rodadasDetalhe.length, 2);
  assert.equal(u.rodadasDetalhe[0].linhaDoTempo.length, 5);

  const g = relatorioGeral(rodadas);
  assert.deepEqual(g.sinais, ['B', 'D', '0', 'O']);
  assert.equal(g.resumo.rodadas, 4, 'a pulada fica fora das taxas');
  assert.equal(g.resumo.puladas, 1);
  assert.deepEqual(g.resumo.resultados, { acerto: 2, troca: 1, rejeicao: 1, 'tempo-esgotado': 0, 'nao-reconhecido': 0 });
  assert.equal(g.resumo.acerto, 0.5);
  assert.equal(g.resumo.taxaTroca, 0.25);
  assert.equal(g.resumo.taxaRejeicao, 0.25);
  assert.deepEqual(g.matrizRodadas.celulas.B, { B: 2 });
  assert.deepEqual(g.matrizRodadas.celulas.D, { B: 1 });
  assert.deepEqual(g.matrizRodadas.celulas['0'], { rejeicao: 1 });
  assert.deepEqual(g.matrizRodadas.celulas.O, {});
  assert.deepEqual(g.matrizQuadros.celulas.D, { D: 2, B: 3 });
  assert.deepEqual(g.matrizQuadros.colunas, ['B', 'D', 'O', '0', 'rejeitado', 'sem-mao', 'bloqueada']);
  assert.deepEqual(g.destaques.paresConfundidos, [{ par: 'B↔D', quadros: 4 }], 'B→D (1) + D→B (3)');
  assert.equal(g.destaques.pioresSinais[0].sinal, '0');
  console.log('OK  cenário 5 — relatórios unitário e geral, com matrizes, resumo e destaques');
}

// --- Cenário 6: arquivo JSON -----------------------------------------------
{
  const arquivo = montarArquivo({
    metadados: { dataHora: '2026-11-03T14:20:00.000Z' },
    configuracao: { modo: 'geral', participante: 'P1' },
    plano: [],
    rodadas,
    relatorio: relatorioGeral(rodadas),
    parcial: true
  });
  assert.equal(arquivo.formato, FORMATO);
  assert.equal(arquivo.parcial, true);
  assert.equal(arquivo.relatorio.resumo.acerto, 0.5);
  // Arredondado a 4 casas e sem NaN/Infinity, que o JSON não representa.
  const texto = JSON.stringify(arquivo);
  assert.ok(!/\d\.\d{5,}/.test(texto), 'nenhum número com mais de 4 casas');
  assert.deepEqual(JSON.parse(texto), arquivo, 'o arquivo sobrevive a ida e volta pelo JSON');
  assert.match(nomeDoArquivo(arquivo), /^soletra-teste-geral-P1-2026-11-03-\d{4}-parcial\.json$/);
  assert.match(nomeDoArquivo({ configuracao: { modo: 'unitario', sinal: 'B' }, metadados: {} }), /^soletra-teste-unitario-B-anonimo-/);
  console.log('OK  cenário 6 — o JSON traz tudo, arredondado e sem valores que o JSON não aceita');
}

// --- Cenário 7: identidade do modelo ---------------------------------------
{
  const v = (x) => Array.from({ length: 63 }, (_, i) => Math.round((x + i / 100) * 1e4) / 1e4);
  const a = await identidadeModelo({ versaoFeatures: 2, classes: { A: [v(0.1), v(0.2)], B: [v(1)] } });
  const b = await identidadeModelo({ versaoFeatures: 2, classes: { B: [v(1)], A: [v(0.2), v(0.1)] } });
  const f32 = await identidadeModelo({ versaoFeatures: 2, classes: { A: [Float32Array.from(v(0.1)), v(0.2)], B: [v(1)] } });
  const outro = await identidadeModelo({ versaoFeatures: 2, classes: { A: [v(0.1)], B: [v(1)] } });
  const outraVersao = await identidadeModelo({ versaoFeatures: 3, classes: { A: [v(0.1), v(0.2)], B: [v(1)] } });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b, 'a ordem das classes e das amostras não muda a identidade');
  assert.equal(a, f32, 'Float32Array e números arredondados dão a mesma identidade');
  assert.notEqual(a, outro);
  assert.notEqual(a, outraVersao);
  console.log('OK  cenário 7 — a identidade do modelo independe da ordem e do formato dos números');
}

// --- Cenário 8: rodada que começa quando o sinal é reconhecido -------------
{
  const eventos = [];
  const s = new SessaoTeste({ modo: 'unitario', sinal: 'A', rodadas: 3, inicio: 'reconhecer', esperaMaxMs: 4000, duracaoMs: 1000 }, (e) => eventos.push(e.tipo));
  s.iniciar(0);
  assert.equal(s.fase, 'aguardando', 'pede o sinal e espera, sem contagem');

  // Rodada 1: quadros antes do reconhecimento não gravam; um M confirmado antes conta como troca.
  s.aoQuadro(quadro(300, { classe: 'A', alvo: 'A' }));
  s.aoQuadro(quadro(600, { classe: 'M', alvo: 'A', confirmou: 'M' }));
  s.tick(900);
  assert.equal(s.fase, 'aguardando');
  assert.equal(s.estado(900).erradasNaEspera, 1);
  s.aoQuadro(quadro(1500, { classe: 'A', alvo: 'A', confirmou: 'A' }));
  assert.equal(s.fase, 'gravando', 'a gravação começa no quadro do reconhecimento');
  for (let t = 1600; t < 2500; t += 100) s.aoQuadro(quadro(t, { classe: 'A', alvo: 'A' }));
  s.tick(2500);
  const r1 = s.rodadas[0];
  assert.equal(r1.inicio, 'reconhecer');
  assert.equal(r1.resultado, 'troca', 'outra letra confirmada antes da pedida');
  assert.equal(r1.reconhecido, 'M');
  assert.equal(r1.tempoAteReconhecerMs, 1500);
  assert.deepEqual(r1.confirmacoesAntes, [{ classe: 'M', ms: 600 }]);
  assert.equal(r1.inicioMs, 1500);
  assert.equal(r1.analise.quadros.total, 10, 'o quadro do reconhecimento e os 9 seguintes');
  assert.equal(r1.analise.quadros.certos, 10);

  // Rodada 2: reconhecida direto → acerto.
  assert.equal(s.fase, 'aguardando');
  s.aoQuadro(quadro(3200, { classe: 'A', alvo: 'A', confirmou: 'A' }));
  for (let t = 3300; t < 4200; t += 100) s.aoQuadro(quadro(t, { classe: t < 3800 ? 'A' : 'N', alvo: 'A' }));
  s.tick(4200);
  assert.equal(s.rodadas[1].resultado, 'acerto');
  assert.equal(s.rodadas[1].tempoAteReconhecerMs, 700, 'de 2500 (pedido) a 3200');

  // Rodada 3: o A não vem dentro do tempo máximo → não reconhecido, sem gravação.
  s.aoQuadro(quadro(5000, { classe: 'N', alvo: 'A' }));
  s.tick(8199);
  assert.equal(s.fase, 'aguardando');
  s.tick(8200);
  const r3 = s.rodadas[2];
  assert.equal(r3.resultado, 'nao-reconhecido');
  assert.equal(r3.analise, null);
  assert.equal(r3.tempoAteReconhecerMs, null);
  assert.equal(s.fase, 'concluida');
  assert.deepEqual(eventos.filter((e) => e === 'aguardando').length, 3);

  const u = relatorioUnitario('A', s.rodadas);
  assert.deepEqual(u.resultados, { acerto: 1, troca: 1, rejeicao: 0, 'tempo-esgotado': 0, 'nao-reconhecido': 1 });
  assert.equal(u.taxaNaoReconhecido, 1 / 3);
  assert.equal(u.tempoMedioAteReconhecer, 1100, '(1500 + 700) / 2');
  assert.equal(u.confirmacoesErradasAntes, 1);
  assert.equal(u.quadros.total, 20, 'a rodada não reconhecida não entra nas contas por quadro');
  assert.equal(u.quadros.certos, 16, '10 na rodada 1 + 6 na rodada 2 (3200 a 3700)');
  assert.equal(u.rodadasDetalhe[2].linhaDoTempo.length, 0);

  const g = relatorioGeral(s.rodadas);
  assert.deepEqual(g.matrizRodadas.celulas.A, { M: 1, A: 1, 'nao-reconhecido': 1 });

  // Sem limite de espera: só sai da espera reconhecendo (ou pulando).
  const semLimite = new SessaoTeste({ modo: 'unitario', sinal: 'A', rodadas: 1, inicio: 'reconhecer', esperaMaxMs: 0, duracaoMs: 100 });
  semLimite.iniciar(0);
  semLimite.tick(1e9);
  assert.equal(semLimite.fase, 'aguardando');
  assert.equal(semLimite.estado(1e9).restanteMs, null);
  console.log('OK  cenário 8 — com início ao reconhecer, a rodada só grava depois de o sinal pedido ser confirmado');
}

// --- Cenário 9: planilhas, Excel e CSV --------------------------------------
{
  const { tabelas, linhasDasRodadas } = await import('../dev/teste/tabelas.js');
  const { gerarXlsx, crc32, letraDaColuna, escaparXml } = await import('../dev/teste/xlsx.js');
  const { gerarCsv } = await import('../dev/teste/csv.js');

  const arquivo = montarArquivo({
    metadados: { dataHora: '2026-11-03T14:20:00.000Z', participante: 'P1', camera: { nome: 'Câmera & "teste" <1>' } },
    configuracao: { modo: 'geral', conjuntos: ['letras', 'numeros'], rodadas: 1 },
    plano: [],
    rodadas,
    relatorio: relatorioGeral(rodadas)
  });

  const abas = tabelas(arquivo);
  assert.deepEqual(abas.map((a) => a.nome), ['Resumo', 'Por sinal', 'Rodadas', 'Matriz por rodada', 'Matriz por quadro', 'Quadros', 'Metadados']);
  const resumo = Object.fromEntries(abas[0].linhas);
  assert.equal(resumo['Acerto por rodada (%)'], 50);
  assert.equal(resumo['Rodadas: troca'], 1);
  const rod = linhasDasRodadas(arquivo);
  assert.equal(rod.length, 1 + rodadas.length, 'cabeçalho + uma linha por rodada');
  assert.equal(rod[1][rod[0].indexOf('Resultado')], 'acerto');
  assert.equal(rod[5][rod[0].indexOf('Estado')], 'pulada');
  const quadrosAba = abas.find((a) => a.nome === 'Quadros').linhas;
  assert.equal(quadrosAba.length - 1, rodadas.filter((r) => r.analise).reduce((s, r) => s + r.analise.linhaDoTempo.length, 0));

  assert.equal(letraDaColuna(0), 'A');
  assert.equal(letraDaColuna(25), 'Z');
  assert.equal(letraDaColuna(27), 'AB');
  assert.equal(escaparXml('a & <b> "c"\u0001'), 'a &amp; &lt;b&gt; &quot;c&quot;');

  // Abre o ZIP gerado (stored) pelo diretório central e confere cada arquivo.
  const bytes = gerarXlsx(abas);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fim = bytes.length - 22;
  assert.equal(dv.getUint32(fim, true), 0x06054b50, 'fim do diretório central');
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const conteudo = {};
  for (let i = 0; i < total; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true);
    const tamanho = dv.getUint32(p + 20, true);
    const tamNome = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + tamNome));
    assert.equal(dv.getUint32(local, true), 0x04034b50);
    const inicio = local + 30 + dv.getUint16(local + 26, true);
    const dados = bytes.subarray(inicio, inicio + tamanho);
    assert.equal(crc32(dados), crc, `CRC de ${nome}`);
    conteudo[nome] = new TextDecoder().decode(dados);
    p += 46 + tamNome;
  }
  assert.ok(conteudo['[Content_Types].xml'] && conteudo['xl/workbook.xml'] && conteudo['xl/styles.xml']);
  assert.equal(Object.keys(conteudo).filter((n) => n.startsWith('xl/worksheets/')).length, 7);
  assert.match(conteudo['xl/workbook.xml'], /<sheet name="Matriz por quadro" sheetId="5" r:id="rId5"\/>/);
  const resumoXml = conteudo['xl/worksheets/sheet1.xml'];
  assert.match(resumoXml, /<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Medida<\/t><\/is><\/c>/, 'cabeçalho em negrito');
  assert.match(resumoXml, /<v>50<\/v>/, 'números como números');
  assert.match(conteudo['xl/worksheets/sheet7.xml'], /Câmera &amp; &quot;teste&quot; &lt;1&gt;/, 'texto escapado');
  assert.deepEqual(gerarXlsx(abas), bytes, 'o mesmo conteúdo gera os mesmos bytes');

  const csv = gerarCsv([['a', 'b,c', 'd"e'], [1.5, null, 'x\ny']]);
  assert.equal(csv, '﻿a,"b,c","d""e"\r\n1.5,,"x\ny"\r\n');
  console.log('OK  cenário 9 — planilhas, Excel (ZIP e XML conferidos) e CSV a partir do arquivo do teste');
}
