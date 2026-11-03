/**
 * Soletra (modo dev) — agregador do diagnóstico ao vivo.
 *
 * Assina os quadros do reconhecedor (observarQuadros) e transforma cada um no
 * que o painel dev mostra: classes mais próximas, razão e limiares efetivos,
 * estado do estabilizador, mão, latência, taxa de inferência e fps da câmera.
 *
 * O assinante só guarda o quadro e anota dois números. Todo o resto — contas,
 * a loja que o React lê e o desenho da mão — roda no requestAnimationFrame,
 * fora do tempo que o laço de inferência mede. Sem isso o próprio diagnóstico
 * inflaria o p95 e poderia disparar o recuo para 8 Hz, que só existe para
 * máquinas lentas.
 */
import { criarLoja } from '../ui/loja.js';
import { observarQuadros, video } from '../sidepanel/nucleo.js';

/** Quadros na janela de latência própria: ~10 s a 15 Hz, mais estável que os 30 do laço. */
const JANELA_LATENCIA = 150;
/** Janela da taxa de inferência medida, em ms. */
const JANELA_HZ = 2000;
/** Sem quadro novo por este tempo, o diagnóstico considera o reconhecimento parado. */
const PARADO_MS = 600;

/** Quantil por posição, como o InferenceLoop faz (p em 0..100). */
export function percentil(valores, p) {
  if (valores.length === 0) return NaN;
  const ordenado = [...valores].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1)];
}

/** Estado que o painel dev desenha; null enquanto nenhum quadro chegou. */
export const lojaDiagnostico = criarLoja(null);

/** Quem desenha por cima do vídeo (ver esqueleto.js) recebe o quadro no mesmo rAF. */
const desenhistas = new Set();

/** @param {(quadro: object|null) => void} desenhar recebe null quando o reconhecimento para */
export function aoDesenhar(desenhar) {
  desenhistas.add(desenhar);
  return () => desenhistas.delete(desenhar);
}

const duracoes = [];
const instantes = [];
const tempoDesenho = [];
let ultimo = null;
let pendente = false;
let ultimaConfirmacao = null;
let ultimaRejeicao = null;
let timerParado = null;

/** Tempo de desenho de um quadro, informado por quem desenha. */
export function registrarDesenho(ms) {
  tempoDesenho.push(ms);
  if (tempoDesenho.length > JANELA_LATENCIA) tempoDesenho.shift();
}

// --- fps da câmera --------------------------------------------------------
// Medido pelos quadros que o vídeo de fato apresenta (presentedFrames do rVFC),
// não pelo que a câmera declara em getSettings(): uma câmera em pouca luz
// declara 30 e entrega 15. É um callback a mais por quadro, sem detecção.

let fpsCamera = null;
let marcaFps = null;

function medirFps(agora, meta) {
  if (marcaFps && agora - marcaFps.t >= 1000) {
    const quadros = meta.presentedFrames - marcaFps.quadros;
    // A contagem recomeça quando a câmera troca; essa janela é descartada.
    if (quadros >= 0) fpsCamera = (quadros * 1000) / (agora - marcaFps.t);
    marcaFps = null;
  }
  if (!marcaFps) marcaFps = { t: agora, quadros: meta.presentedFrames };
  video.requestVideoFrameCallback(medirFps);
}

function fpsDeclarado() {
  const fps = video.srcObject?.getVideoTracks?.()[0]?.getSettings?.().frameRate;
  return Number.isFinite(fps) ? fps : null;
}

// --- quadros --------------------------------------------------------------

function aoQuadro(quadro) {
  ultimo = quadro;
  duracoes.push(quadro.duracao);
  if (duracoes.length > JANELA_LATENCIA) duracoes.shift();
  instantes.push(quadro.t);

  if (!pendente) {
    pendente = true;
    requestAnimationFrame(publicar);
  }
  clearTimeout(timerParado);
  timerParado = setTimeout(parar, PARADO_MS);
}

function parar() {
  ultimo = null;
  for (const desenhar of desenhistas) desenhar(null);
  lojaDiagnostico.definir((d) => (d ? { ...d, ativo: false } : d));
}

function publicar() {
  pendente = false;
  const q = ultimo;
  if (!q) return;

  for (const desenhar of desenhistas) desenhar(q);

  const e = q.estabilizador ?? {};
  const c = q.classificacao;
  if (e.confirmou) ultimaConfirmacao = { classe: e.confirmou, em: q.t };
  if (c?.motivo) ultimaRejeicao = { motivo: c.motivo, em: q.t };

  while (instantes.length > 1 && q.t - instantes[0] > JANELA_HZ) instantes.shift();
  const span = instantes.length > 1 ? instantes[instantes.length - 1] - instantes[0] : 0;

  lojaDiagnostico.definir({
    ativo: true,
    t: q.t,
    temMao: Boolean(q.landmarks),
    captura: q.captura,

    ranking: c?.ranking ?? [],
    classe: c?.classe ?? null,
    motivo: c?.motivo ?? null,
    razao: c?.razao ?? null,
    distanciaMin: c?.distanciaMin ?? null,
    limiarRazao: q.limiarRazao,
    limiarDistancia: q.limiarDistancia,
    rigor: q.rigor,
    permanencia: q.permanencia,

    estado: e.estadoVisual ?? 'sem-mao',
    simbolo: e.simbolo ?? null,
    vencedor: e.vencedor ?? null,
    candidato: e.candidato ?? null,
    votosLider: e.votosLider ?? 0,
    quadrosJanela: e.quadrosJanela ?? 0,
    progresso: e.progresso ?? 0,
    travadoEm: e.travadoEm ?? null,
    ultimaConfirmacao,
    ultimaRejeicao,

    maoDetectada: q.maoDetectada,
    confiancaMao: q.confiancaMao,
    maoConfigurada: q.maoConfigurada,
    maoBloqueada: q.maoBloqueada,
    cameraEspelhada: q.cameraEspelhada,

    latencia: { p50: percentil(duracoes, 50), p95: percentil(duracoes, 95), quadros: duracoes.length },
    desenho: tempoDesenho.length ? { p50: percentil(tempoDesenho, 50), p95: percentil(tempoDesenho, 95) } : null,
    hz: span > 0 ? ((instantes.length - 1) * 1000) / span : null,
    fpsCamera,
    fpsDeclarado: fpsDeclarado()
  });
}

let iniciado = false;

/** Começa a assinar os quadros. Idempotente. */
export function iniciarDiagnostico() {
  if (iniciado) return;
  iniciado = true;
  observarQuadros(aoQuadro);
  if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(medirFps);
}
