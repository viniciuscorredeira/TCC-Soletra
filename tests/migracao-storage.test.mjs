/**
 * Testes da migração das chaves de armazenamento (RVL Libras → Soletra).
 * Uso: node tests/migracao-storage.test.mjs
 */
import assert from 'node:assert/strict';
import { migrarChaves, PREFIXO, PREFIXO_ANTIGO } from '../src/migracao-storage.js';

/** storage.local em memória, com contador de escritas e remoções. */
function areaFalsa(inicial = {}) {
  const mapa = new Map(Object.entries(inicial));
  let escritas = 0;
  let remocoes = 0;
  return {
    mapa,
    get escritas() { return escritas; },
    get remocoes() { return remocoes; },
    async get(chaves) {
      const lista = chaves === null || chaves === undefined
        ? [...mapa.keys()]
        : Array.isArray(chaves) ? chaves : [chaves];
      const saida = {};
      for (const c of lista) if (mapa.has(c)) saida[c] = mapa.get(c);
      return saida;
    },
    async set(objeto) {
      escritas++;
      for (const [c, v] of Object.entries(objeto)) mapa.set(c, v);
    },
    async remove(chaves) {
      remocoes++;
      for (const c of Array.isArray(chaves) ? chaves : [chaves]) mapa.delete(c);
    }
  };
}

// --- Cenário 1: o modelo treinado sobrevive ao rename ----------------------
// É o ponto inteiro desta migração: sem ela, as amostras continuam no disco sob
// nomes que ninguém mais lê, e o usuário abre o painel achando que as perdeu.
{
  const area = areaFalsa({
    'rvl.modelo.v1.indice': { esquema: 1, contagem: { A: 20, B: 18 } },
    'rvl.modelo.v1.classe.A': { classe: 'A', amostras: [[1, 2, 3]] },
    'rvl.modelo.v1.classe.B': { classe: 'B', amostras: [[4, 5, 6]] },
    'rvl.preferredDeviceId': 'dev-a',
    'rvl.consentimento.reconhecimento': { aceitoEm: '2026-09-19T00:00:00.000Z', versao: 1 },
    'rvl.reconhecimento.prefs': { mao: 'esquerda', conjunto: 'numeros' }
  });

  const r = await migrarChaves(area);
  assert.equal(r.migradas, 6);

  assert.deepEqual(area.mapa.get('soletra.modelo.v1.classe.A'), { classe: 'A', amostras: [[1, 2, 3]] });
  assert.deepEqual(area.mapa.get('soletra.modelo.v1.indice').contagem, { A: 20, B: 18 });
  assert.equal(area.mapa.get('soletra.preferredDeviceId'), 'dev-a');
  assert.equal(area.mapa.get('soletra.reconhecimento.prefs').mao, 'esquerda');

  const sobraram = [...area.mapa.keys()].filter((k) => k.startsWith(PREFIXO_ANTIGO));
  assert.deepEqual(sobraram, [], 'nenhuma chave antiga pode sobrar');
  console.log('OK  cenário 1 — modelo, preferências e consentimento migram por inteiro');
}

// --- Cenário 2: uma chave por classe treinada, todas migram ---------------
// O modelo grava uma chave por letra. Migrar só o índice deixaria o usuário
// com um catálogo apontando para amostras inexistentes.
{
  const letras = 'ABCDEFGHIJKLMNOPQRSTU'.split('');
  const inicial = { 'rvl.modelo.v1.indice': { contagem: Object.fromEntries(letras.map((l) => [l, 20])) } };
  for (const l of letras) inicial[`rvl.modelo.v1.classe.${l}`] = { classe: l, amostras: [[1]] };

  const area = areaFalsa(inicial);
  const r = await migrarChaves(area);

  assert.equal(r.migradas, letras.length + 1, 'todas as classes mais o índice');
  for (const l of letras) {
    assert.equal(area.mapa.get(`${PREFIXO}modelo.v1.classe.${l}`).classe, l);
  }
  console.log(`OK  cenário 2 — as ${letras.length} classes treinadas migram junto com o índice`);
}

// --- Cenário 3: rodar duas vezes não estraga nada ------------------------
// O painel pode ser aberto em duas janelas, e a migração roda na abertura.
{
  const area = areaFalsa({ 'rvl.texto': 'YOUTUBE', 'rvl.preferredDeviceId': 'dev-a' });

  const primeira = await migrarChaves(area);
  const segunda = await migrarChaves(area);

  assert.equal(primeira.migradas, 2);
  assert.equal(segunda.migradas, 0, 'a segunda passada não tem o que fazer');
  assert.equal(area.mapa.get('soletra.texto'), 'YOUTUBE');
  assert.equal(area.mapa.size, 2, 'nada foi duplicado');
  console.log('OK  cenário 3 — migração é idempotente');
}

// --- Cenário 4: chave nova existente não é sobrescrita por resíduo antigo -
// Se a migração rodou, o usuário treinou de novo e sobrou lixo da versão
// anterior, o dado NOVO tem que vencer — senão a migração apagaria o treino
// mais recente com uma cópia velha.
{
  const area = areaFalsa({
    'rvl.preferredDeviceId': 'antiga',
    'soletra.preferredDeviceId': 'nova'
  });

  const r = await migrarChaves(area);

  assert.equal(r.migradas, 0);
  assert.equal(r.ignoradas, 1);
  assert.equal(area.mapa.get('soletra.preferredDeviceId'), 'nova', 'o dado novo prevalece');
  assert.equal(area.mapa.has('rvl.preferredDeviceId'), false, 'o resíduo é removido');
  console.log('OK  cenário 4 — dado novo prevalece sobre resíduo antigo');
}

// --- Cenário 5: instalação limpa não é tocada ---------------------------
{
  const area = areaFalsa({ 'soletra.preferredDeviceId': 'dev-a', 'outra.coisa': 1 });
  const r = await migrarChaves(area);

  assert.equal(r.migradas, 0);
  assert.equal(area.escritas, 0, 'sem chave antiga não pode haver escrita');
  assert.equal(area.remocoes, 0, 'nem remoção');
  assert.equal(area.mapa.size, 2);
  console.log('OK  cenário 5 — instalação sem histórico não sofre escrita alguma');
}

// --- Cenário 6: chaves de terceiros não são tocadas ---------------------
{
  const area = areaFalsa({ 'rvl.texto': 'A', 'outroApp.config': { x: 1 } });
  await migrarChaves(area);

  assert.deepEqual(area.mapa.get('outroApp.config'), { x: 1 }, 'só o prefixo rvl. é migrado');
  console.log('OK  cenário 6 — chaves de outros prefixos ficam intactas');
}

// --- Cenário 7: storage indisponível não impede o painel de abrir -------
{
  const quebrada = { async get() { throw new Error('storage fora do ar'); } };
  const r = await migrarChaves(quebrada);
  assert.deepEqual(r, { migradas: 0, ignoradas: 0 });

  const semArea = await migrarChaves(undefined);
  assert.deepEqual(semArea, { migradas: 0, ignoradas: 0 });
  console.log('OK  cenário 7 — falha de storage degrada em silêncio, sem lançar');
}

console.log('\ntodos os cenários passaram');
