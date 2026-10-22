/**
 * Testes da trava de mão incorreta.
 * Uso: node tests/trava-mao.test.mjs
 */
import assert from 'node:assert/strict';
import { TravaMao, PADROES_TRAVA } from '../src/trava-mao.js';

const { QUADROS_TRAVAR, QUADROS_SOLTAR } = PADROES_TRAVA;

function repetir(trava, n, quadro) {
  let r;
  for (let i = 0; i < n; i++) r = trava.processar({ esperada: 'direita', confianca: 0.95, ...quadro });
  return r;
}

// --- Cenário 1: mão certa nunca trava ---------------------------------------
{
  const t = new TravaMao();
  assert.equal(repetir(t, 50, { detectada: 'direita' }), false);
  assert.equal(t.maoVista, null);
  console.log('OK  cenário 1 — mão configurada não trava');
}

// --- Cenário 2: mão errada trava só depois de quadros seguidos --------------
{
  const t = new TravaMao();
  assert.equal(repetir(t, QUADROS_TRAVAR - 1, { detectada: 'esquerda' }), false, 'ainda não');
  assert.equal(repetir(t, 1, { detectada: 'esquerda' }), true, 'agora trava');
  assert.equal(t.maoVista, 'esquerda');
  console.log('OK  cenário 2 — trava após quadros seguidos com a mão errada');
}

// --- Cenário 3: oscilação do handedness não trava ---------------------------
{
  const t = new TravaMao();
  for (let i = 0; i < 40; i++) {
    t.processar({ detectada: i % 3 === 0 ? 'esquerda' : 'direita', confianca: 0.95, esperada: 'direita' });
  }
  assert.equal(t.travada, false, 'um quadro errado isolado não pode bloquear a tradução');
  console.log('OK  cenário 3 — quadros errados isolados são ignorados');
}

// --- Cenário 4: solta depois de quadros seguidos com a mão certa ------------
{
  const t = new TravaMao();
  repetir(t, QUADROS_TRAVAR, { detectada: 'esquerda' });
  assert.equal(repetir(t, QUADROS_SOLTAR - 1, { detectada: 'direita' }), true, 'ainda travada');
  assert.equal(repetir(t, 1, { detectada: 'direita' }), false, 'solta');
  assert.equal(t.maoVista, null);
  console.log('OK  cenário 4 — solta após quadros seguidos com a mão certa');
}

// --- Cenário 5: baixa confiança e handedness ausente não contam -------------
{
  const t = new TravaMao();
  repetir(t, 20, { detectada: 'esquerda', confianca: 0.5 });
  repetir(t, 20, { detectada: null });
  assert.equal(t.travada, false, 'evidência fraca não trava');

  // E não zeram a contagem: um quadro ambíguo no meio não adia a trava.
  repetir(t, QUADROS_TRAVAR - 1, { detectada: 'esquerda' });
  repetir(t, 1, { detectada: 'esquerda', confianca: 0.3 });
  assert.equal(repetir(t, 1, { detectada: 'esquerda' }), true);
  console.log('OK  cenário 5 — quadros ambíguos não contam e não zeram a contagem');
}

// --- Cenário 6: reiniciar limpa o estado ------------------------------------
{
  const t = new TravaMao();
  repetir(t, QUADROS_TRAVAR, { detectada: 'esquerda' });
  t.reiniciar();
  assert.equal(t.travada, false);
  assert.equal(t.maoVista, null);
  console.log('OK  cenário 6 — reiniciar solta a trava');
}

console.log('\ntodos os cenários passaram');
