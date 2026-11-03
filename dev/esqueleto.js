/**
 * Soletra (modo dev) — a mão desenhada sobre o vídeo.
 *
 * Um <canvas> transparente por cima do <video> do palco, desenhado com o
 * DrawingUtils do próprio MediaPipe vendorizado (nenhuma dependência nova). Os
 * pontos são os que o reconhecedor já calculou para o quadro — não há segunda
 * detecção.
 *
 * Alinhamento: o canvas tem o tamanho em pixels do quadro da câmera e recebe o
 * mesmo object-fit: cover e o mesmo espelhamento do vídeo (dev.css), então
 * qualquer corte, proporção ou redimensionamento do painel vale para os dois.
 * Os pontos do MediaPipe estão no quadro cru, que é o que o canvas representa.
 *
 * Nada é gravado: o canvas só mostra os pontos do quadro atual.
 */
import { video } from '../sidepanel/nucleo.js';
import { aoDesenhar, registrarDesenho } from './diagnostico.js';
import { lojaPrefsDev } from './preferencias.js';

const VERDE = '#22c55e';
const BRANCO = '#ffffff';

const canvas = document.createElement('canvas');
canvas.className = 'dev-esqueleto';
canvas.setAttribute('aria-hidden', 'true');
const ctx = canvas.getContext('2d');

let utils = null;
let conexoes = null;

async function carregarDesenho() {
  // A mesma URL que src/hand-landmarker.js importa: o navegador entrega o
  // módulo já carregado, sem baixar nem compilar de novo.
  const { DrawingUtils, HandLandmarker } = await import(
    /* @vite-ignore */ chrome.runtime.getURL('vendor/mediapipe/vision_bundle.mjs')
  );
  utils = new DrawingUtils(ctx);
  conexoes = HandLandmarker.HAND_CONNECTIONS;
}

/** O <video> só entra no palco quando o React o monta; o canvas vai junto. */
function encaixar() {
  const palco = video.parentElement;
  if (palco && canvas.parentElement !== palco) palco.append(canvas);
}

function limpar() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function desenhar(quadro) {
  encaixar();
  const prefs = lojaPrefsDev.ler();
  if (!quadro || !prefs.esqueleto || !utils) {
    limpar();
    return;
  }

  const t0 = performance.now();
  if (canvas.width !== quadro.largura || canvas.height !== quadro.altura) {
    canvas.width = quadro.largura;
    canvas.height = quadro.altura;
  }
  limpar();

  const pontos = quadro.landmarks;
  if (pontos) {
    // Espessuras em pixels de tela: o canvas é reduzido pelo object-fit, e
    // uma linha de 2 px no quadro de 1280 sumiria num painel de 320.
    const escala = Math.max(canvas.clientWidth / canvas.width, canvas.clientHeight / canvas.height) || 1;
    const px = (n) => n / escala;

    utils.drawConnectors(pontos, conexoes, { color: VERDE, lineWidth: px(2.5) });
    utils.drawLandmarks(pontos, { color: VERDE, fillColor: BRANCO, radius: px(3), lineWidth: px(1.5) });

    if (prefs.numeros) numerar(pontos, px, !quadro.cameraEspelhada);
  }
  registrarDesenho(performance.now() - t0);
}

/**
 * Números de 0 a 20 ao lado de cada ponto. O canvas é espelhado pelo CSS junto
 * com o vídeo; o texto é desenhado espelhado de volta para sair legível.
 */
function numerar(pontos, px, espelhadoNaTela) {
  ctx.save();
  ctx.font = `600 ${px(11)}px system-ui, sans-serif`;
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = px(3);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillStyle = BRANCO;
  pontos.forEach((p, i) => {
    ctx.save();
    ctx.translate(p.x * canvas.width, p.y * canvas.height);
    if (espelhadoNaTela) ctx.scale(-1, 1);
    ctx.strokeText(String(i), px(4), -px(2));
    ctx.fillText(String(i), px(4), -px(2));
    ctx.restore();
  });
  ctx.restore();
}

export function iniciarEsqueleto() {
  carregarDesenho().catch((err) => console.warn('[Soletra] DrawingUtils indisponível:', err));
  aoDesenhar(desenhar);
  // Desligar a chave apaga o desenho na hora, sem esperar o próximo quadro.
  lojaPrefsDev.assinar(() => {
    if (!lojaPrefsDev.ler().esqueleto) limpar();
  });
}
