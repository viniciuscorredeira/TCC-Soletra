/**
 * Teste de integração: landmarks → features → KNN → estabilizador → texto.
 * Uso: node tests/integracao.test.mjs
 *
 * Existe porque os dois bugs mais graves do projeto não moravam em módulo
 * nenhum, e sim na junção deles — cada peça passava nos próprios testes
 * enquanto o conjunto não digitava nada. Aqui o pipeline roda inteiro, com
 * quadros sintéticos em cadência realista.
 */
import assert from 'node:assert/strict';
import { extrairFeatures } from '../src/sign-features.js';
import { SignClassifier, calibrarTauAbs } from '../src/sign-classifier.js';
import { SignStabilizer } from '../src/sign-stabilizer.js';
import { TextComposer } from '../src/text-composer.js';

const W = 640;
const H = 480;
const HZ = 15;
const PASSO = 1000 / HZ;

/** Gerador determinístico: um teste que falha às vezes não serve para nada. */
let semente = 2024;
const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);

const BASE = [
  [0, 60], [-34, 34], [-48, 6], [-52, -18], [-50, -42],
  [-22, 0], [-26, -34], [-28, -56], [-29, -74],
  [0, -6], [0, -42], [0, -66], [0, -86],
  [20, 0], [24, -36], [26, -58], [27, -76],
  [38, 14], [46, -14], [50, -34], [52, -50]
];

/**
 * `forma` identifica a configuração de mão; `tremor` em pixels simula a
 * instabilidade natural — pequena ao gravar (mão parada), maior ao refazer o
 * sinal depois, que é exatamente a diferença que derrubava o limiar antigo.
 */
function landmarks(forma, tremor) {
  return BASE.map(([bx, by], i) => {
    const dobra = i >= 5 ? Math.sin(forma + i) * 14 : 0;
    return {
      x: (320 + bx + dobra + (rnd() - 0.5) * tremor) / W,
      y: (240 + by + dobra * 0.6 + (rnd() - 0.5) * tremor) / H,
      z: (bx * 0.1) / W
    };
  });
}

/**
 * Mão relaxada: dedos recolhidos em direção à palma. Não é um ponto da mesma
 * família de configurações treinadas — é outra geometria, que é o que a mão do
 * usuário realmente faz entre um sinal e outro.
 */
function landmarksRelaxada(tremor) {
  return BASE.map(([bx, by], i) => {
    const recolhe = i >= 5 ? 0.45 : 0; // dedos a 55% da extensão, rumo à palma
    return {
      x: (320 + bx * (1 - recolhe * 0.5) + (rnd() - 0.5) * tremor) / W,
      y: (240 + by * (1 - recolhe) + (rnd() - 0.5) * tremor) / H,
      z: (bx * 0.1) / W
    };
  });
}

const vetorDe = (forma, tremor) =>
  extrairFeatures(landmarks(forma, tremor), { largura: W, altura: H, mao: 'direita' });

const FORMAS = { A: 0, B: 1.4, C: 2.8 };
const TREMOR_TREINO = 2;
const TREMOR_USO = 7;

/** Reproduz a captura da UI: 20 amostras com a mão parada. */
function treinar(nomes) {
  const classes = {};
  for (const nome of nomes) {
    classes[nome] = Array.from({ length: 20 }, () => vetorDe(FORMAS[nome], TREMOR_TREINO));
  }
  return classes;
}

/** Monta o pipeline completo, como o SignRecognizer faz em produção. */
function montarPipeline(classes) {
  const tauAbs = calibrarTauAbs(classes);
  const classificador = new SignClassifier({ k: 5 }).carregar(classes, { tauAbs });
  const composer = new TextComposer();
  const estabilizador = new SignStabilizer({}, ({ classe }) => composer.anexar(classe));

  let t = 0;

  /** @param {string|'relaxa'|'sem-mao'} sinal */
  function sinalizar(sinal, duracao) {
    const fim = t + duracao;
    while (t < fim) {
      t += PASSO;

      if (sinal === 'sem-mao') {
        estabilizador.processar({ t, temMao: false });
        continue;
      }

      const pts =
        sinal === 'relaxa' ? landmarksRelaxada(TREMOR_USO) : landmarks(FORMAS[sinal], TREMOR_USO);
      const v = extrairFeatures(pts, { largura: W, altura: H, mao: 'direita' });
      const r = classificador.classificar(v);
      estabilizador.processar({
        t,
        classe: r.classe,
        confianca: r.confianca,
        temMao: true
      });
    }
  }

  return { sinalizar, composer, classificador, tauAbs };
}

// --- Cenário 1: digita uma palavra de letras distintas ---------------------
{
  const p = montarPipeline(treinar(['A', 'B', 'C']));
  p.sinalizar('A', 1000);
  p.sinalizar('B', 1000);
  p.sinalizar('C', 1000);

  assert.equal(p.composer.texto, 'ABC', `esperado "ABC", obtido "${p.composer.texto}"`);
  console.log('OK  cenário 1 — pipeline completo digita "ABC"');
}

// --- Cenário 2: REGRESSÃO — o sinal treinado é aceito de volta -------------
// O limiar calibrado pela dispersão interna media o tremor durante a captura, e
// rejeitava 100% das consultas legítimas: a barra subia e nada era digitado.
{
  const classes = treinar(['A', 'B', 'C']);
  const p = montarPipeline(classes);

  let aceitos = 0;
  for (let i = 0; i < 100; i++) {
    if (p.classificador.classificar(vetorDe(FORMAS.A, TREMOR_USO)).classe === 'A') aceitos++;
  }
  assert.ok(aceitos >= 90, `o próprio sinal treinado deve ser aceito (${aceitos}/100)`);
  console.log(`OK  cenário 2 — sinal treinado reconhecido em ${aceitos}/100 quadros`);
}

// --- Cenário 3: REGRESSÃO — letra dupla com a mão relaxando ---------------
{
  const p = montarPipeline(treinar(['A', 'B', 'C']));
  p.sinalizar('A', 1000);
  p.sinalizar('relaxa', 500);
  p.sinalizar('A', 1000);

  assert.equal(p.composer.texto, 'AA', `esperado "AA", obtido "${p.composer.texto}"`);
  console.log('OK  cenário 3 — relaxar a mão entre dois sinais iguais produz "AA"');
}

// --- Cenário 4: REGRESSÃO — classe única não trava para sempre ------------
// Com um só sinal treinado, tudo era classificado como ele; o símbolo cru nunca
// deixava de ser a classe travada, a trava jamais soltava e o painel ficava
// preso em 100% sem digitar mais nada.
{
  const p = montarPipeline(treinar(['A']));

  p.sinalizar('A', 1000);
  assert.equal(p.composer.texto, 'A', 'o primeiro caractere deve sair');

  // Um gesto diferente não pode ser confundido com a única classe treinada —
  // é o que permite a trava soltar.
  const r = p.classificador.classificar(
    extrairFeatures(landmarksRelaxada(TREMOR_USO), { largura: W, altura: H, mao: 'direita' })
  );
  assert.equal(r.classe, null, 'mão relaxada não pode virar a única classe treinada');

  p.sinalizar('relaxa', 600); // é isto que o usuário faz entre dois sinais
  p.sinalizar('A', 1000);

  assert.equal(p.composer.texto, 'AA', `trava deve soltar mesmo com uma classe (obtido "${p.composer.texto}")`);
  console.log('OK  cenário 4 — com uma classe só, a trava ainda solta');
}

// --- Cenário 5: tirar a mão do quadro não inventa caractere --------------
{
  const p = montarPipeline(treinar(['A', 'B', 'C']));
  p.sinalizar('sem-mao', 2000);
  assert.equal(p.composer.texto, '', 'sem mão não pode sair caractere nenhum');
  console.log('OK  cenário 5 — nenhum caractere é inventado sem mão no quadro');
}

// --- Cenário 6: gesto nunca treinado não vira letra -----------------------
{
  const p = montarPipeline(treinar(['A', 'B', 'C']));
  p.sinalizar('relaxa', 3000);
  assert.equal(p.composer.texto, '', `gesto desconhecido não pode digitar (obtido "${p.composer.texto}")`);
  console.log('OK  cenário 6 — gesto fora do treino não produz caractere');
}

console.log('\ntodos os cenários passaram');
