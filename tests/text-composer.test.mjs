/**
 * Testes da composição de texto. Uso: node tests/text-composer.test.mjs
 */
import assert from 'node:assert/strict';
import { TextComposer } from '../src/text-composer.js';

// --- Cenário 1: compor uma palavra letra a letra ---------------------------
{
  const mudancas = [];
  const c = new TextComposer({}, (t) => mudancas.push(t));
  for (const ch of 'YOUTUBE') c.anexar(ch);

  assert.equal(c.texto, 'YOUTUBE');
  assert.equal(mudancas.length, 7, 'cada caractere deve notificar a UI uma vez');
  assert.equal(mudancas.at(-1), 'YOUTUBE');
  console.log('OK  cenário 1 — compõe "YOUTUBE" caractere a caractere');
}

// --- Cenário 2: espaço não abre a palavra nem duplica ---------------------
// Uma pausa mal interpretada deixaria "YOU  TUBE" e a busca sairia errada sem
// o usuário perceber.
{
  const c = new TextComposer();
  assert.equal(c.espaco(), false, 'espaço no início não deve entrar');
  assert.equal(c.texto, '');

  c.anexar('A');
  assert.equal(c.espaco(), true);
  assert.equal(c.espaco(), false, 'espaço repetido não deve entrar');
  assert.equal(c.texto, 'A ');
  console.log('OK  cenário 2 — espaço não inicia o texto nem se repete');
}

// --- Cenário 3: apagar e limpar ------------------------------------------
{
  const c = new TextComposer();
  for (const ch of 'ABC') c.anexar(ch);

  assert.equal(c.apagar(), true);
  assert.equal(c.texto, 'AB');

  assert.equal(c.limpar(), true);
  assert.equal(c.texto, '');
  assert.equal(c.vazio, true);
  assert.equal(c.apagar(), false, 'apagar no vazio não notifica');
  assert.equal(c.limpar(), false, 'limpar no vazio não notifica');
  console.log('OK  cenário 3 — apagar e limpar não notificam à toa');
}

// --- Cenário 4: limite de caracteres --------------------------------------
{
  const c = new TextComposer({ limite: 5 });
  for (const ch of 'ABCDEFGH') c.anexar(ch);
  assert.equal(c.texto, 'ABCDE');
  assert.equal(c.anexar('Z'), false, 'no limite, anexar não muda nada');
  console.log('OK  cenário 4 — limite de caracteres respeitado');
}

// --- Cenário 5: definir() para edição manual e restauração ---------------
{
  const c = new TextComposer({ limite: 10 });
  c.definir('OLA MUNDO EXTRA');
  assert.equal(c.texto, 'OLA MUNDO ', 'definir deve truncar exatamente no limite');
  assert.equal(c.paraBusca(), 'OLA MUNDO', 'o espaço do corte some na normalização da busca');

  c.definir(null);
  assert.equal(c.texto, '', 'definir(null) limpa em vez de escrever "null"');
  console.log('OK  cenário 5 — definir trunca no limite e trata valor nulo');
}

// --- Cenário 6: texto para a busca --------------------------------------
{
  const c = new TextComposer();
  c.definir('  YOU   TUBE  ');
  assert.equal(c.paraBusca(), 'YOU TUBE', 'espaços das pontas e repetidos são normalizados');

  c.definir('');
  assert.equal(c.paraBusca(), '');
  console.log('OK  cenário 6 — texto normalizado para a pesquisa');
}

// --- Cenário 7: entradas inválidas não corrompem o texto ----------------
{
  const c = new TextComposer();
  c.anexar('A');
  assert.equal(c.anexar(''), false);
  assert.equal(c.anexar(null), false);
  assert.equal(c.anexar(undefined), false);
  assert.equal(c.texto, 'A');
  console.log('OK  cenário 7 — anexar inválido é ignorado');
}

console.log('\ntodos os cenários passaram');
