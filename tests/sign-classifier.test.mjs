/**
 * Testes do classificador KNN. Modelos sintéticos, nenhum mock necessário.
 * Uso: node tests/sign-classifier.test.mjs
 */
import assert from 'node:assert/strict';
import { SignClassifier, calibrarTauAbs, LIMIAR_DISTANCIA_PADRAO } from '../src/sign-classifier.js';
import { DIMENSOES } from '../src/sign-features.js';

/** Vetor de 63 dimensões: um valor-base com um desvio na primeira dimensão. */
function vetor(base, desvio = 0) {
  const v = new Float32Array(DIMENSOES);
  v.fill(base);
  v[0] = base + desvio;
  return v;
}

/** Três classes bem separadas, com dispersão interna pequena. */
function modeloSintetico() {
  return {
    A: [vetor(0, 0), vetor(0, 0.01), vetor(0, -0.01)],
    B: [vetor(1, 0), vetor(1, 0.01), vetor(1, -0.01)],
    C: [vetor(2, 0), vetor(2, 0.01), vetor(2, -0.01)]
  };
}

// --- Cenário 1: vizinho mais próximo vence ---------------------------------
{
  const c = new SignClassifier({ k: 3 }).carregar(modeloSintetico());
  assert.equal(c.classificar(vetor(0, 0.005)).classe, 'A');
  assert.equal(c.classificar(vetor(1, 0.005)).classe, 'B');
  assert.equal(c.classificar(vetor(2, 0.005)).classe, 'C');
  console.log('OK  cenário 1 — classifica pela vizinhança correta');
}

// --- Cenário 2: rejeição de gesto ambíguo ---------------------------------
// Sem rejeição, o KNN rotula qualquer gesto aleatório como alguma letra.
{
  const c = new SignClassifier({ k: 3 }).carregar(modeloSintetico(), { tauAbs: 0.5 });

  // Equidistante de tudo: a razão entre a melhor e a segunda melhor classe fica
  // perto de 1, que é a assinatura de "não se parece com nada em particular".
  const longe = c.classificar(vetor(50));
  assert.equal(longe.classe, null, 'vetor sem classe dominante deve ser rejeitado');
  assert.equal(longe.motivo, 'ambiguo');
  assert.ok(longe.razao > 0.8, `razão deve denunciar a ambiguidade (${longe.razao})`);

  const perto = c.classificar(vetor(0, 0.002));
  assert.equal(perto.classe, 'A', 'vetor próximo continua aceito');
  assert.ok(perto.razao < 0.1, 'sinal claro tem razão baixa');
  console.log('OK  cenário 2 — gesto sem classe dominante é rejeitado pelo teste de razão');
}

// --- Cenário 3: voto ponderado supera a maioria simples -------------------
// Um vizinho colado vale mais que dois distantes — é o que segura as fronteiras
// entre configurações parecidas.
{
  const classes = {
    A: [vetor(0, 0)],
    B: [vetor(0, 1.0), vetor(0, 1.2)]
  };
  const c = new SignClassifier({ k: 3 }).carregar(classes, { tauAbs: Infinity });
  const r = c.classificar(vetor(0, 0.01));

  assert.equal(r.classe, 'A', 'maioria simples diria B; a ponderação deve dizer A');
  assert.ok(r.confianca > 0.9, `um vizinho colado deve dar confiança alta (${r.confianca})`);
  console.log('OK  cenário 3 — voto ponderado por 1/d vence a maioria simples');
}

// --- Cenário 4: k maior que o número de amostras não quebra ---------------
{
  const c = new SignClassifier({ k: 9 }).carregar({ A: [vetor(0)], B: [vetor(1)] }, { tauAbs: Infinity });
  const r = c.classificar(vetor(0, 0.01));
  assert.equal(r.classe, 'A');
  assert.ok(Number.isFinite(r.confianca));
  console.log('OK  cenário 4 — k maior que as amostras disponíveis degrada sem estourar');
}

// --- Cenário 5: modelo vazio não inventa classe --------------------------
{
  const c = new SignClassifier().carregar({});
  assert.equal(c.vazio, true);
  const r = c.classificar(vetor(0));
  assert.equal(r.classe, null);
  assert.equal(r.motivo, 'sem-modelo');
  console.log('OK  cenário 5 — modelo vazio devolve sem-modelo em vez de chutar');
}

// --- Cenário 6: filtro de conjunto restringe as classes candidatas -------
// É assim que o toggle Letras/Números elimina a colisão O≡0 e V≡2.
{
  const c = new SignClassifier({ k: 3 }).carregar(modeloSintetico(), { tauAbs: Infinity });
  c.filtrarPor(['B', 'C']);
  const r = c.classificar(vetor(0, 0.005));
  assert.notEqual(r.classe, 'A', 'classe fora do conjunto ativo não pode vencer');
  assert.ok(['B', 'C'].includes(r.classe));

  c.filtrarPor(null);
  assert.equal(c.classificar(vetor(0, 0.005)).classe, 'A', 'remover o filtro restaura tudo');
  console.log('OK  cenário 6 — filtro por conjunto exclui as classes do outro conjunto');
}

// --- Cenário 7: REGRESSÃO — amostras quase idênticas não colapsam o limiar --
// A captura grava a cada 150 ms com a mão parada, então as amostras de uma
// classe saem quase idênticas. Calibrar o limiar pela dispersão interna media o
// tremor durante a captura, não a variação do usuário ao refazer o sinal depois:
// o limiar ficava ~3× menor que a distância real de consulta e rejeitava 100%
// dos sinais legítimos. A dispersão interna só pode elevar o limiar, nunca
// baixá-lo do padrão constante.
{
  const quaseIdenticas = (base) =>
    Array.from({ length: 20 }, (_, i) => vetor(base, i * 0.0005)); // dispersão ~0

  const classes = {
    A: quaseIdenticas(0),
    B: quaseIdenticas(5),
    C: quaseIdenticas(10)
  };

  const tau = calibrarTauAbs(classes);

  assert.ok(
    tau >= LIMIAR_DISTANCIA_PADRAO,
    `τ_abs (${tau.toFixed(3)}) não pode cair abaixo do padrão ${LIMIAR_DISTANCIA_PADRAO}`
  );

  // E o efeito prático: uma consulta a meio caminho da dispersão precisa passar.
  const c = new SignClassifier({ k: 5 }).carregar(classes, { tauAbs: tau });
  const consulta = vetor(0, 0.3); // usuário refez o sinal com variação real
  assert.equal(c.classificar(consulta).classe, 'A', 'sinal refeito com variação deve ser aceito');

  console.log('OK  cenário 7 — tremor da captura não baixa o limiar abaixo do padrão');
}

// --- Cenário 7b: com uma classe só, o limiar não pode aceitar tudo ---------
// Sem separação entre classes o teste de razão não tem com o que comparar; sem
// um limiar absoluto, QUALQUER gesto vira a única classe treinada — e, pior, a
// trava anti-repetição nunca solta, porque o sinal cru nunca deixa de ser ela.
{
  const soUma = { '1': Array.from({ length: 20 }, (_, i) => vetor(0, i * 0.01)) };
  const tau = calibrarTauAbs(soUma);

  assert.ok(Number.isFinite(tau), 'com uma classe o limiar precisa existir');
  assert.ok(tau > 0, 'e ser positivo');

  const c = new SignClassifier({ k: 5 }).carregar(soUma, { tauAbs: tau });
  assert.equal(c.classificar(vetor(0, 0.1)).classe, '1', 'o próprio sinal deve ser aceito');

  const outro = c.classificar(vetor(9));
  assert.equal(outro.classe, null, 'um gesto distante não pode virar a única classe treinada');
  assert.equal(outro.motivo, 'distante');

  const semAmostras = calibrarTauAbs({});
  assert.equal(semAmostras, Infinity, 'sem modelo não há o que calibrar');
  console.log('OK  cenário 7b — classe única não aceita qualquer gesto');
}

// --- Cenário 8: rigor aperta e afrouxa o limiar --------------------------
{
  const c = new SignClassifier({ k: 3 }).carregar(modeloSintetico(), { tauAbs: 1.0 });
  const alvo = vetor(0, 0.8);

  c.rigor = 1.5;
  assert.ok(c.classificar(alvo).classe !== null, 'tolerante deve aceitar');

  c.rigor = 0.7;
  assert.equal(c.classificar(alvo).classe, null, 'exigente deve rejeitar o mesmo vetor');
  console.log('OK  cenário 8 — o rigor da UI aperta e afrouxa a rejeição');
}

// --- Cenário 9: proximidade acompanha o mesmo critério da aceitação ------
// A barra cheia e o sinal reconhecido passam a ser a mesma coisa: a barra mede
// a razão, que é exatamente o que decide aceitar ou rejeitar.
{
  const c = new SignClassifier({ k: 3 }).carregar(modeloSintetico(), { tauAbs: 1.0 });
  const limiar = c.razaoEfetiva;

  assert.equal(c.proximidade({ razao: 0 }), 1, 'sinal inequívoco enche a barra');
  assert.equal(c.proximidade({ razao: limiar }), 0, 'no limiar de aceitação a barra zera');
  assert.equal(c.proximidade({ razao: 1 }), 0, 'acima do limiar satura em zero');
  assert.ok(Math.abs(c.proximidade({ razao: limiar / 2 }) - 0.5) < 1e-6, 'meio caminho, meia barra');
  assert.equal(c.proximidade({ razao: NaN }), 0, 'sem medida, proximidade zero');
  console.log('OK  cenário 9 — proximidade reflete o critério real de aceitação');
}

console.log('\ntodos os cenários passaram');
