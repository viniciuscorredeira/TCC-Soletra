/**
 * Testes do agendador do loop. Vídeo e relógio falsos, disparados à mão.
 * Uso: node tests/inference-loop.test.mjs
 */
import assert from 'node:assert/strict';
import { InferenceLoop } from '../src/inference-loop.js';

/** Vídeo falso com rVFC sob controle do teste. */
function videoFalso() {
  const pendentes = new Map();
  let proximo = 1;
  return {
    requestVideoFrameCallback(cb) {
      const h = proximo++;
      pendentes.set(h, cb);
      return h;
    },
    cancelVideoFrameCallback(h) {
      pendentes.delete(h);
    },
    /** Dispara o callback agendado mais recente, como o navegador faria. */
    disparar(now) {
      const ultima = [...pendentes.entries()].pop();
      if (!ultima) return false;
      const [h, cb] = ultima;
      pendentes.delete(h);
      cb(now);
      return true;
    },
    get pendentes() {
      return pendentes.size;
    },
    /** Devolve o callback sem removê-lo — para simular corrida com o parar(). */
    espiar() {
      const ultima = [...pendentes.entries()].pop();
      return ultima ? ultima[1] : null;
    }
  };
}

// --- Cenário 1: throttle descarta quadros acima da taxa alvo ---------------
// O navegador entrega 60 Hz; detectForVideo é síncrono e travaria o painel.
{
  const video = videoFalso();
  const quadros = [];
  const loop = new InferenceLoop(video, (_v, ts) => quadros.push(ts), { hz: 15, agora: () => 0 });

  loop.iniciar();
  for (let i = 1; i <= 60; i++) video.disparar(i * (1000 / 60)); // 1 segundo a 60 Hz

  assert.ok(
    quadros.length >= 13 && quadros.length <= 17,
    `esperado ~15 inferências em 1 s a 60 Hz, obtido ${quadros.length}`
  );
  console.log(`OK  cenário 1 — 60 quadros viraram ${quadros.length} inferências (alvo 15 Hz)`);
}

// --- Cenário 2: timestamps estritamente crescentes ------------------------
// Trocar de câmera reinicia o mediaTime; um timestamp que regride faz o
// MediaPipe devolver resultado vazio em silêncio.
{
  const video = videoFalso();
  const ts = [];
  // hz infinito desliga o throttle: o teste quer exercitar só o timestamp.
  const loop = new InferenceLoop(video, (_v, t) => ts.push(t), { hz: Infinity, agora: () => 0 });

  loop.iniciar();
  for (const now of [100, 100, 100, 100.4, 101]) video.disparar(now);

  assert.equal(ts.length, 5, 'sem throttle, todo quadro deve ser processado');
  for (let i = 1; i < ts.length; i++) {
    assert.ok(ts[i] > ts[i - 1], `timestamp deve crescer: ${ts[i - 1]} → ${ts[i]}`);
  }
  console.log(`OK  cenário 2 — timestamps crescentes com relógio repetido (${ts.join(', ')})`);
}

// --- Cenário 2b: relógio que regride é descartado -----------------------
// Segunda linha de defesa contra o mediaTime reiniciando na troca de câmera.
{
  const video = videoFalso();
  const ts = [];
  const loop = new InferenceLoop(video, (_v, t) => ts.push(t), { hz: 15, agora: () => 0 });

  loop.iniciar();
  video.disparar(1000);
  video.disparar(40); // câmera trocada: o relógio do vídeo voltou ao início
  video.disparar(80);

  assert.equal(ts.length, 1, 'quadros com relógio anterior ao último não são processados');
  console.log('OK  cenário 2b — relógio que regride é descartado pelo throttle');
}

// --- Cenário 3: parar() impede o callback pendente de trabalhar -----------
{
  const video = videoFalso();
  let chamadas = 0;
  const loop = new InferenceLoop(video, () => chamadas++, { hz: 1000, agora: () => 0 });

  loop.iniciar();
  video.disparar(100);
  assert.equal(chamadas, 1);

  // Guarda o callback já agendado, para, e só então dispara: é a corrida real.
  const pendente = video.espiar();
  loop.parar();
  pendente(200);

  assert.equal(chamadas, 1, 'callback disparado após parar() não pode processar');
  assert.equal(loop.rodando, false);
  console.log('OK  cenário 3 — quadro em voo após parar() é descartado');
}

// --- Cenário 4: iniciar() duas vezes não cria dois loops ------------------
{
  const video = videoFalso();
  const loop = new InferenceLoop(video, () => {}, { agora: () => 0 });

  assert.equal(loop.iniciar(), true);
  assert.equal(loop.iniciar(), false, 'segundo iniciar deve ser no-op');
  assert.equal(video.pendentes, 1, 'só pode haver um callback agendado');
  loop.parar();
  assert.equal(video.pendentes, 0, 'parar deve cancelar o agendamento');
  console.log('OK  cenário 4 — iniciar duas vezes não duplica o loop');
}

// --- Cenário 5: fallback para requestAnimationFrame ----------------------
{
  const semRvfc = {};
  const agendados = [];
  let chamadas = 0;

  const loop = new InferenceLoop(semRvfc, () => chamadas++, {
    hz: 1000,
    agora: () => 0,
    agendarQuadro: (cb) => { agendados.push(cb); return agendados.length; },
    cancelarQuadro: () => {}
  });

  assert.equal(loop.usaRvfc, false, 'sem rVFC deve cair para rAF');
  loop.iniciar();
  agendados.at(-1)(100);
  assert.equal(chamadas, 1, 'o fallback precisa processar quadros');
  console.log('OK  cenário 5 — cai para requestAnimationFrame quando rVFC não existe');
}

// --- Cenário 6: recuo adaptativo quando a máquina não dá conta ----------
{
  const video = videoFalso();
  let relogio = 0;
  // Cada inferência "custa" 80 ms, bem acima do limite de 50 ms.
  const loop = new InferenceLoop(video, () => { relogio += 80; }, {
    hz: 15,
    hzMinimo: 8,
    limiteP95: 50,
    amostrasTelemetria: 10,
    agora: () => relogio
  });

  loop.iniciar();
  for (let i = 1; i <= 40; i++) video.disparar(i * 200);

  const stats = loop.estatisticas();
  assert.equal(loop.reduzido, true, 'p95 acima do limite deve reduzir a taxa');
  assert.equal(loop.hzAtual, 8);
  assert.ok(stats.p95 >= 80, `p95 medido deve refletir a latência real (${stats.p95})`);
  console.log(`OK  cenário 6 — p95 de ${stats.p95} ms reduziu a taxa para ${loop.hzAtual} Hz`);
}

// --- Cenário 7: volta à taxa alvo quando a máquina alivia --------------
{
  const video = videoFalso();
  let relogio = 0;
  let custo = 80;
  const loop = new InferenceLoop(video, () => { relogio += custo; }, {
    hz: 15, hzMinimo: 8, limiteP95: 50, amostrasTelemetria: 10, agora: () => relogio
  });

  loop.iniciar();
  for (let i = 1; i <= 20; i++) video.disparar(i * 200);
  assert.equal(loop.reduzido, true);

  custo = 5; // máquina aliviou
  for (let i = 21; i <= 60; i++) video.disparar(i * 200);

  assert.equal(loop.reduzido, false, 'deve voltar à taxa alvo');
  assert.equal(loop.hzAtual, 15);
  console.log('OK  cenário 7 — taxa volta ao alvo quando a latência cai');
}

console.log('\ntodos os cenários passaram');
