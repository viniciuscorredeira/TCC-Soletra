/**
 * Testes do canal de observação e do que o núcleo publica por ele.
 * Uso: node tests/observacao.test.mjs
 *
 * O canal existe para ferramentas de diagnóstico enxergarem o reconhecimento
 * por dentro. Duas garantias importam: sem assinantes, nada é montado (o custo
 * fica numa checagem por quadro), e com assinantes a decisão do classificador
 * e do estabilizador é exatamente a mesma.
 */
import assert from 'node:assert/strict';
import { criarCanal } from '../src/canal.js';
import { extrairFeatures } from '../src/sign-features.js';
import { SignClassifier } from '../src/sign-classifier.js';
import { SignStabilizer } from '../src/sign-stabilizer.js';
import { SignRecognizer } from '../src/sign-recognizer.js';

const W = 640;
const H = 480;

const BASE = [
  [0, 60], [-34, 34], [-48, 6], [-52, -18], [-50, -42],
  [-22, 0], [-26, -34], [-28, -56], [-29, -74],
  [0, -6], [0, -42], [0, -66], [0, -86],
  [20, 0], [24, -36], [26, -58], [27, -76],
  [38, 14], [46, -14], [50, -34], [52, -50]
];

/** Mão sintética: `forma` dobra os dedos de um jeito; `desvio` é o tremor fixo. */
function landmarks(forma, desvio = 0) {
  return BASE.map(([bx, by], i) => {
    const dobra = i >= 5 ? Math.sin(forma + i) * 14 : 0;
    return { x: (320 + bx + dobra + desvio) / W, y: (240 + by + dobra * 0.6) / H, z: (bx * 0.1) / W };
  });
}

const vetor = (forma, desvio) => extrairFeatures(landmarks(forma, desvio), { largura: W, altura: H, mao: 'direita' });

function modelo() {
  const classes = {};
  for (const [nome, forma] of Object.entries({ A: 0, B: 1.4, C: 2.8, D: 4.2 })) {
    classes[nome] = [-2, -1, 0, 1, 2].map((d) => vetor(forma, d));
  }
  return classes;
}

// --- Cenário 1: o canal ----------------------------------------------------
{
  const canal = criarCanal();
  assert.equal(canal.ativo, false, 'sem assinantes, o canal está inativo');

  const recebidos = [];
  const cancelar = canal.assinar((e) => recebidos.push(e));
  const cancelarQuebrado = canal.assinar(() => { throw new Error('assinante quebrado'); });
  const avisoOriginal = console.warn;
  console.warn = () => {};
  try {
    assert.equal(canal.ativo, true);
    canal.emitir(1);
    canal.emitir(2);
  } finally {
    console.warn = avisoOriginal;
    cancelarQuebrado();
  }
  assert.deepEqual(recebidos, [1, 2], 'um assinante que lança não impede os outros');

  cancelar();
  canal.emitir(3);
  assert.deepEqual(recebidos, [1, 2], 'cancelado, o assinante não recebe mais');
  console.log('OK  cenário 1 — o canal entrega a quem assina e isola assinantes que falham');
}

// --- Cenário 2: detalhar não muda a decisão do classificador ---------------
{
  const c = new SignClassifier({ k: 5 }).carregar(modelo());
  for (const [forma, desvio] of [[0, 0.5], [1.4, 3], [2.1, 0], [50, 0]]) {
    const v = vetor(forma, desvio);
    const simples = c.classificar(v);
    const { ranking, ...detalhado } = c.classificar(v, { detalhar: true });
    assert.deepEqual(detalhado, simples, `detalhar mudou a decisão (forma ${forma})`);
    assert.equal(simples.ranking, undefined, 'sem detalhar, nada a mais no resultado');

    assert.equal(ranking.length, 4, 'ranking com todas as classes do modelo');
    for (let i = 1; i < ranking.length; i++) {
      assert.ok(ranking[i - 1].distancia <= ranking[i].distancia, 'ranking em ordem de distância');
    }
    assert.equal(ranking[0].distancia, Math.min(simples.distanciaMin, simples.distanciaOutra));
    const votos = ranking.reduce((s, r) => s + r.voto, 0);
    assert.ok(votos > 0 && votos <= 1 + 1e-9, 'frações de voto entre 0 e 1');
  }
  assert.equal(c.limiarEfetivo, c.tauAbs * c.rigor);
  console.log('OK  cenário 2 — detalhar acrescenta o ranking sem mudar a decisão');
}

// --- Cenário 3: o estabilizador conta os votos da líder --------------------
{
  const e = new SignStabilizer();
  let s;
  for (const t of [0, 67, 134, 201]) s = e.processar({ t, classe: 'A', confianca: 1 });
  s = e.processar({ t: 268, classe: 'B', confianca: 1 });
  assert.equal(s.quadrosJanela, 5);
  assert.equal(s.votosLider, 4, 'quatro quadros de A na janela de cinco');
  console.log('OK  cenário 3 — o snapshot do estabilizador traz os votos da líder e o tamanho da janela');
}

// --- Cenário 4: o reconhecedor só monta o quadro com assinantes ------------
{
  const video = { videoWidth: W, videoHeight: H };
  const r = new SignRecognizer(video, () => {});
  r.classificador.carregar(modelo());
  r.mao = 'direita';
  r.adaptador = {
    detectar: () => ({ landmarks: landmarks(1.4, 0.5), handedness: 'direita', confiancaMao: 0.97 })
  };

  // Sem assinantes: o quadro não é montado e o classificador não detalha.
  const chamadas = [];
  const classificarOriginal = r.classificador.classificar.bind(r.classificador);
  r.classificador.classificar = (v, opcoes) => {
    chamadas.push(opcoes?.detalhar ?? false);
    return classificarOriginal(v, opcoes);
  };
  let montagens = 0;
  const observarOriginal = r._observar.bind(r);
  r._observar = (...args) => { montagens++; return observarOriginal(...args); };

  r._processarQuadro(video, 1);
  assert.equal(montagens, 0, 'sem assinantes, o quadro não pode ser montado');
  assert.deepEqual(chamadas, [false]);
  const semObservar = r._ultimoSnapshotSinal;

  // Com assinante: recebe o quadro completo, com a mesma decisão.
  const quadros = [];
  const cancelar = r.quadros.assinar((q) => quadros.push(q));
  r.estabilizador.reiniciar();
  r._processarQuadro(video, 2);
  cancelar();

  assert.equal(quadros.length, 1);
  const q = quadros[0];
  assert.equal(q.landmarks.length, 21);
  assert.equal(q.maoDetectada, 'direita');
  assert.equal(q.confiancaMao, 0.97);
  assert.equal(q.maoConfigurada, 'direita');
  assert.equal(q.classificacao.classe, 'B');
  assert.equal(q.classificacao.ranking[0].classe, 'B');
  assert.equal(q.limiarDistancia, r.classificador.tauAbs * r.classificador.rigor);
  assert.equal(q.limiarRazao, r.classificador.razaoEfetiva);
  assert.equal(q.permanencia, r.estabilizador.opcoes.T_PERMANENCIA);
  assert.equal(q.estabilizador, r._ultimoSnapshotSinal);
  assert.ok(q.duracao >= 0);
  assert.equal(q.estabilizador.simbolo, semObservar.simbolo, 'observar não muda o estabilizador');
  assert.deepEqual(chamadas, [false, true]);

  // Sem mão: o quadro sai com os pontos vazios.
  r.adaptador = { detectar: () => null };
  r.quadros.assinar((qq) => quadros.push(qq));
  r._processarQuadro(video, 3);
  assert.equal(quadros[1].landmarks, null);
  assert.equal(quadros[1].classificacao, null);
  console.log('OK  cenário 4 — o reconhecedor publica o quadro só com assinantes, sem mudar a decisão');
}
