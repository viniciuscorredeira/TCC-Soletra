/**
 * Testes de comportamento do CameraController, com as APIs de mídia mockadas.
 * Uso: node tests/camera-controller.test.mjs
 */
import assert from 'node:assert/strict';

let calls;

function makeTrack(deviceId) {
  return {
    stopped: false,
    getSettings: () => ({ deviceId, width: 1280, height: 720, frameRate: 30 }),
    stop() { this.stopped = true; calls.stops++; },
    addEventListener() {}
  };
}

function setup({ labels = true, permission = 'granted', devices = ['dev-a', 'dev-b'] } = {}) {
  calls = { getUserMedia: 0, enumerate: 0, stops: 0, lastConstraints: null };
  let labelsVisible = labels;

  const nav = {
    mediaDevices: {
      addEventListener() {},
      removeEventListener() {},
      async enumerateDevices() {
        calls.enumerate++;
        return devices.map((id, i) => ({
          kind: 'videoinput',
          deviceId: id,
          label: labelsVisible ? (i === 0 ? 'Iriun Webcam' : 'Integrated Camera') : ''
        }));
      },
      async getUserMedia(constraints) {
        calls.getUserMedia++;
        calls.lastConstraints = constraints;
        labelsVisible = true; // como no navegador: acesso concedido revela os nomes
        const id = constraints?.video?.deviceId?.exact || devices[0];
        const track = makeTrack(id);
        return { getVideoTracks: () => [track], getTracks: () => [track] };
      }
    },
    permissions: { async query() { return { state: permission }; } }
  };

  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  return { videoEl: { srcObject: null, play: async () => {} } };
}

const modUrl = new URL('../src/camera-controller.js', import.meta.url).href;

// --- Cenário 1: reload com a câmera desligada não deve ligá-la ---------------
{
  const { videoEl } = setup();
  const { CameraController } = await import(modUrl);
  const c = new CameraController(videoEl, () => {});
  await c.ensureDeviceLabels();
  assert.equal(c.state, 'idle');

  const streaming = await c.reload();
  assert.equal(streaming, false, 'reload não deve retornar stream ativo');
  assert.equal(calls.getUserMedia, 0, 'reload desligado não pode chamar getUserMedia');
  assert.equal(c.state, 'idle', 'estado deve permanecer idle');
  assert.equal(c.stream, null);
  assert.equal(videoEl.srcObject, null);
  console.log('OK  cenário 1 — reload com câmera desligada mantém desligada');
}

// --- Cenário 2: reload após Parar preserva o estado "stopped" ----------------
{
  const { videoEl } = setup();
  const { CameraController } = await import(modUrl + '?2');
  const c = new CameraController(videoEl, () => {});
  await c.start('dev-a');
  assert.equal(c.state, 'active');
  c.stop();
  assert.equal(c.state, 'stopped');

  const before = calls.getUserMedia;
  const streaming = await c.reload();
  assert.equal(streaming, false);
  assert.equal(calls.getUserMedia, before, 'reload após Parar não pode reabrir o stream');
  assert.equal(c.state, 'stopped', 'estado deve continuar stopped');
  console.log('OK  cenário 2 — reload após Parar continua parado');
}

// --- Cenário 3: reload com a câmera ativa reinicia o stream ------------------
{
  const { videoEl } = setup();
  const { CameraController } = await import(modUrl + '?3');
  const c = new CameraController(videoEl, () => {});
  await c.start('dev-b');
  const before = calls.getUserMedia;

  const streaming = await c.reload();
  assert.equal(streaming, true, 'reload ativo deve reabrir o stream');
  assert.equal(calls.getUserMedia, before + 1);
  assert.equal(c.state, 'active');
  assert.equal(calls.lastConstraints.video.deviceId.exact, 'dev-b', 'deve reusar o dispositivo ativo');
  console.log('OK  cenário 3 — reload com câmera ativa reinicia o mesmo dispositivo');
}

// --- Cenário 4: reload limpa estado de erro sem ligar a câmera ---------------
{
  const { videoEl } = setup();
  const { CameraController } = await import(modUrl + '?4');
  const c = new CameraController(videoEl, () => {});
  c.state = 'error';
  c.error = { code: 'device-busy', message: 'ocupada' };

  const streaming = await c.reload();
  assert.equal(streaming, false);
  assert.equal(c.state, 'idle', 'erro deve virar idle');
  assert.equal(c.error, null, 'erro deve ser limpo');
  assert.equal(calls.getUserMedia, 0);
  console.log('OK  cenário 4 — reload limpa o erro sem ligar a câmera');
}

// --- Cenário 5: rótulos reais destravados com permissão concedida -----------
{
  const { videoEl } = setup({ labels: false, permission: 'granted' });
  const { CameraController } = await import(modUrl + '?5');
  const c = new CameraController(videoEl, () => {});

  await c.ensureDeviceLabels();
  assert.equal(calls.getUserMedia, 1, 'deve abrir um getUserMedia relâmpago');
  assert.equal(calls.stops, 1, 'e encerrar a track imediatamente');
  assert.equal(c.devices[0].label, 'Iriun Webcam');
  assert.equal(c.devices[1].label, 'Integrated Camera');
  assert.equal(c.stream, null, 'a câmera não pode ficar ligada depois do priming');
  assert.equal(c.state, 'idle');
  console.log('OK  cenário 5 — nomes reais das câmeras destravados sem ligar a câmera');
}

// --- Cenário 6: sem permissão, não dispara getUserMedia (evita prompt) ------
{
  const { videoEl } = setup({ labels: false, permission: 'prompt' });
  const { CameraController } = await import(modUrl + '?6');
  const c = new CameraController(videoEl, () => {});

  await c.ensureDeviceLabels();
  assert.equal(calls.getUserMedia, 0, 'sem permissão não pode disparar prompt no priming');
  assert.equal(c.devices.every((d) => !d.label), true);
  console.log('OK  cenário 6 — sem permissão o priming é evitado');
}

// --- Cenário 7: captura limitada a 60 fps e aviso abaixo disso --------------
{
  const { videoEl } = setup();
  const { CameraController, avaliarTaxaDeQuadros, FPS_MAXIMO } = await import(modUrl + '?7');
  const c = new CameraController(videoEl, () => {});

  await c.start('dev-a');
  assert.equal(FPS_MAXIMO, 60);
  assert.deepEqual(calls.lastConstraints.video.frameRate, { ideal: 60, max: 60 });

  // O mock declara 30 fps: abaixo do teto, precisa avisar.
  assert.deepEqual(avaliarTaxaDeQuadros(c.getActiveTrack().getSettings()), { fps: 30, abaixo: true });
  assert.deepEqual(avaliarTaxaDeQuadros({ frameRate: 60 }), { fps: 60, abaixo: false });
  assert.deepEqual(avaliarTaxaDeQuadros({ frameRate: 59.94 }), { fps: 60, abaixo: false }, '59,94 não é queda');
  assert.equal(avaliarTaxaDeQuadros({}), null, 'sem frameRate não há o que avaliar');
  assert.equal(avaliarTaxaDeQuadros(undefined), null);
  console.log('OK  cenário 7 — captura pede no máximo 60 fps e sinaliza câmera abaixo disso');
}

console.log('\ntodos os cenários passaram');
