/**
 * RVL Libras — spike da Fase 0.
 *
 * Portão de decisão da arquitetura: prova (ou derruba) a hipótese de que o
 * @mediapipe/tasks-vision 1.0.1 executa sob a CSP do Manifest V3 com apenas
 * 'wasm-unsafe-eval', sem CDN e sem eval. A inspeção estática do bundle não
 * encontrou `new Function` nem `eval(` — mas o que decide é o navegador.
 *
 * Critérios de aceite (ver plano, Fase 0):
 *   - nenhum erro de CSP no console ("Refused to ...")
 *   - landmarks[0].length === 21
 *   - p95 de detectForVideo < 40 ms em 640×480 no delegate CPU
 *   - inicialização a frio < 3 s
 *
 * Rode em DOIS contextos: aba de topo e painel lateral. Se passar na aba e
 * falhar no painel, o problema é do painel — não da CSP.
 */
import { HandLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

const AMOSTRAS = 100;
const LARGURA = 640;
const ALTURA = 480;

const el = {
  rodar: document.getElementById('btnRodar'),
  copiar: document.getElementById('btnCopiar'),
  video: document.getElementById('preview'),
  canvas: document.getElementById('canvasGpu'),
  log: document.getElementById('log'),
  veredito: document.getElementById('veredito')
};

const linhas = [];

function log(texto = '') {
  linhas.push(texto);
  el.log.textContent = linhas.join('\n');
}

function vereditoFinal(ok, texto) {
  el.veredito.hidden = false;
  el.veredito.className = `veredito veredito--${ok ? 'ok' : 'erro'}`;
  el.veredito.textContent = texto;
}

function percentil(ordenado, p) {
  if (ordenado.length === 0) return NaN;
  const i = Math.min(ordenado.length - 1, Math.max(0, Math.ceil((p / 100) * ordenado.length) - 1));
  return ordenado[i];
}

/**
 * O WasmFileset é uma interface de objeto simples. Montá-lo à mão em vez de
 * usar FilesetResolver.forVisionTasks() elimina duas fontes de falha silenciosa:
 * a sonda SIMD (que pode apontar para um `_nosimd_` que não vendorizamos) e a
 * concatenação interna de caminhos.
 */
function montarFileset() {
  return {
    wasmLoaderPath: chrome.runtime.getURL('vendor/mediapipe/wasm/vision_wasm_internal.js'),
    wasmBinaryPath: chrome.runtime.getURL('vendor/mediapipe/wasm/vision_wasm_internal.wasm')
  };
}

async function criarDetector(delegate) {
  const opcoes = {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL('vendor/mediapipe/hand_landmarker.task'),
      delegate
    },
    numHands: 1,
    runningMode: 'VIDEO'
  };
  // O delegate GPU exige um canvas para o contexto WebGL; sem ele a task falha.
  if (delegate === 'GPU') opcoes.canvas = el.canvas;

  const t0 = performance.now();
  const detector = await HandLandmarker.createFromOptions(montarFileset(), opcoes);
  return { detector, ms: performance.now() - t0 };
}

/**
 * Mede sobre quadros REAIS, um por callback de vídeo.
 *
 * Um laço apertado de chamadas síncronas não devolve a thread ao navegador, que
 * então não decodifica quadro nenhum: mede-se a mesma imagem cem vezes. Pior,
 * com a mão fora do quadro o MediaPipe roda o detector de palma a cada
 * inferência em vez do modelo de landmarks, e o número que sai é o do pior caso
 * disfarçado de caso típico.
 *
 * As latências são separadas por presença de mão porque são dois regimes
 * distintos, e o que importa para a UI é o regime COM mão rastreada.
 */
function medir(detector, { aquecimento = 20, alvo = AMOSTRAS } = {}) {
  return new Promise((resolve) => {
    const comMao = [];
    const semMao = [];
    let vistos = 0;
    let pontos = 0;
    let ts = Math.round(performance.now());

    const passo = () => {
      ts += 1; // o MediaPipe devolve vazio, em silêncio, se o timestamp regride
      const t0 = performance.now();
      const r = detector.detectForVideo(el.video, ts);
      const dt = performance.now() - t0;
      vistos++;

      const temMao = Boolean(r?.landmarks?.length);
      if (temMao) pontos = r.landmarks[0].length;

      // Os primeiros quadros pagam compilação de shader e JIT; medi-los seria
      // reportar um custo que o usuário sente uma vez e nunca mais.
      if (vistos > aquecimento) (temMao ? comMao : semMao).push(dt);

      if (comMao.length + semMao.length >= alvo) {
        const resumo = (arr) => {
          if (arr.length === 0) return null;
          const o = [...arr].sort((a, b) => a - b);
          return { p50: percentil(o, 50), p95: percentil(o, 95), max: o[o.length - 1], n: o.length };
        };
        resolve({ comMao: resumo(comMao), semMao: resumo(semMao), pontos, vistos });
        return;
      }
      agendar();
    };

    const agendar = () => {
      if (typeof el.video.requestVideoFrameCallback === 'function') {
        el.video.requestVideoFrameCallback(passo);
      } else {
        requestAnimationFrame(passo);
      }
    };
    agendar();
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dá tempo de enquadrar a mão: sem ela, mede-se o detector de palma. */
async function contagem(delegate) {
  for (let i = 3; i > 0; i--) {
    el.veredito.hidden = false;
    el.veredito.className = 'veredito veredito--ok';
    el.veredito.textContent = `Mostre a mão para a câmera — medindo ${delegate} em ${i}…`;
    await esperar(1000);
  }
  el.veredito.textContent = `Medindo ${delegate} — mantenha a mão enquadrada.`;
}

async function testarDelegate(delegate) {
  log(`\n--- delegate ${delegate} ---`);
  await contagem(delegate);
  let detector;
  try {
    const criacao = await criarDetector(delegate);
    detector = criacao.detector;
    log(`  init            : ${criacao.ms.toFixed(0)} ms`);
  } catch (err) {
    log(`  FALHOU na criação: ${err?.name || 'Erro'} — ${err?.message || err}`);
    return null;
  }

  try {
    const m = await medir(detector);
    const linha = (rot, r) =>
      r
        ? `  ${rot}: p50 ${r.p50.toFixed(1)} ms · p95 ${r.p95.toFixed(1)} ms · max ${r.max.toFixed(1)} ms  (${r.n} quadros)`
        : `  ${rot}: sem amostras`;

    log(linha('com mão rastreada ', m.comMao));
    log(linha('sem mão (palma)   ', m.semMao));
    log(`  landmarks[0]      : ${m.pontos} pontos ${m.pontos === 21 ? '(esperado)' : '(ESPERADO 21)'}`);

    if (!m.comMao || m.comMao.n < 30) {
      log('  ATENÇÃO: poucos quadros com mão — mantenha a mão enquadrada e repita.');
    }
    return m;
  } catch (err) {
    log(`  FALHOU na inferência: ${err?.name || 'Erro'} — ${err?.message || err}`);
    return null;
  } finally {
    detector.close();
  }
}

async function rodar() {
  el.rodar.disabled = true;
  el.copiar.disabled = true;
  linhas.length = 0;
  el.veredito.hidden = true;
  el.log.textContent = '';

  const manifesto = chrome.runtime.getManifest();
  log(`contexto        : ${location.href.includes('spike.html') ? 'página da extensão' : location.href}`);
  log(`userAgent       : ${navigator.userAgent}`);
  log(`CSP declarada   : ${manifesto.content_security_policy?.extension_pages || '(nenhuma)'}`);
  log(`concorrência    : ${navigator.hardwareConcurrency} núcleos lógicos`);
  log(`WebAssembly     : ${typeof WebAssembly === 'object' ? 'disponível' : 'AUSENTE'}`);

  log('\nabrindo a câmera…');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: LARGURA }, height: { ideal: ALTURA } },
      audio: false
    });
  } catch (err) {
    log(`  FALHOU: ${err?.name} — ${err?.message}`);
    log('  Autorize a câmera em permission/request.html e tente de novo.');
    vereditoFinal(false, 'Sem câmera — o diagnóstico não pôde rodar.');
    el.rodar.disabled = false;
    return;
  }

  el.video.srcObject = stream;
  await el.video.play().catch(() => {});
  // O primeiro quadro decodificado precisa existir antes de medir.
  await new Promise((r) => (el.video.readyState >= 2 ? r() : el.video.addEventListener('loadeddata', r, { once: true })));
  log(`  resolução real: ${el.video.videoWidth}×${el.video.videoHeight}`);
  log('  Mostre a mão para a câmera durante a medição.');

  const cpu = await testarDelegate('CPU');
  const gpu = await testarDelegate('GPU');

  stream.getTracks().forEach((t) => t.stop());
  el.video.srcObject = null;

  log('\n--- veredito ---');

  // O critério decisivo é o CSP: se o WASM carregou e devolveu 21 landmarks, a
  // arquitetura direta está de pé. Latência é ajuste de parâmetro, não
  // replanejamento — o loop já recua de 15 Hz para 8 Hz sozinho.
  const rodou = Boolean(cpu) && cpu.pontos === 21;
  log(`  CSP permitiu o WASM     : ${rodou ? 'sim' : 'NÃO'}`);
  log(`  21 landmarks            : ${cpu?.pontos === 21 ? 'sim' : 'NÃO'}`);

  if (!rodou) {
    log('  → acionar o Plano B (página sandbox) descrito no plano.');
  } else {
    const p95 = cpu.comMao?.p95;
    log(`  p95 com mão (CPU)       : ${p95 ? `${p95.toFixed(1)} ms` : 'sem amostras'}`);
    log(`  GPU rodou               : ${gpu ? 'sim' : 'não (CPU é o padrão)'}`);

    if (cpu.comMao && gpu?.comMao) {
      const d = ((cpu.comMao.p50 - gpu.comMao.p50) / cpu.comMao.p50) * 100;
      log(`  GPU vs CPU (p50, com mão): ${d > 0 ? `${d.toFixed(0)}% mais rápido` : `${(-d).toFixed(0)}% mais lento`}`);
      log(`  pico GPU                : ${gpu.comMao.max.toFixed(0)} ms — picos altos travam o painel`);
    }

    const folgado = p95 && p95 < 1000 / 15;
    log(`  cabe em 15 Hz (66 ms)   : ${folgado ? 'sim' : 'não — o loop recua para 8 Hz sozinho'}`);
    log('\n  Confira o console: qualquer linha "Refused to ..." reprova o spike');
    log('  mesmo que os números acima estejam bons.');
  }

  vereditoFinal(
    rodou,
    rodou
      ? 'APROVADO — MediaPipe roda sob a CSP do MV3. Seguir com a arquitetura direta.'
      : 'REPROVADO — ver o log e considerar o Plano B (página sandbox).'
  );

  el.rodar.disabled = false;
  el.copiar.disabled = false;
}

el.rodar.addEventListener('click', rodar);
el.copiar.addEventListener('click', async () => {
  await navigator.clipboard.writeText(linhas.join('\n')).catch(() => {});
  el.copiar.textContent = 'Copiado';
  setTimeout(() => (el.copiar.textContent = 'Copiar relatório'), 1500);
});
