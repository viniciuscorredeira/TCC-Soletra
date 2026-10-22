/**
 * Soletra — adaptador do MediaPipe HandLandmarker.
 *
 * Fino de propósito: é o único módulo do projeto que depende de WASM e de
 * `chrome.*`, e portanto o único que não roda nos testes em Node. Toda a lógica
 * que merece teste mora fora daqui — em inference-loop, sign-features,
 * sign-classifier e sign-stabilizer. A validação deste arquivo é o spike da
 * Fase 0 (spike/spike.html), que mediu, em Edge 153 com delegate CPU:
 * init 84 ms, p50 22,9 ms, p95 23,8 ms sobre 100 quadros com mão rastreada.
 */

/** Caminhos dos binários vendorizados; conferidos por tools/verificar-vendor.mjs. */
const ASSETS = {
  bundle: '../vendor/mediapipe/vision_bundle.mjs',
  wasmLoader: 'vendor/mediapipe/wasm/vision_wasm_internal.js',
  wasmBinary: 'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  modelo: 'vendor/mediapipe/hand_landmarker.task'
};

/**
 * CPU, não GPU. Medido no spike: o GPU ficou 155% mais lento (p50 58,4 ms
 * contra 22,9 ms) porque o readback de textura domina o custo de um modelo
 * pequeno como este, e ainda exigiria manter um contexto WebGL vivo num painel
 * que o usuário recolhe a qualquer momento.
 */
export const DELEGATE_PADRAO = 'CPU';

export class HandLandmarkerAdapter {
  constructor(detector, delegate) {
    this._detector = detector;
    this.delegate = delegate;
    this._fechado = false;
  }

  /**
   * @param {object} [opcoes]
   * @param {'CPU'|'GPU'} [opcoes.delegate]
   * @param {HTMLCanvasElement} [opcoes.canvas] obrigatório no delegate GPU
   * @returns {Promise<HandLandmarkerAdapter>}
   */
  static async criar({ delegate = DELEGATE_PADRAO, canvas } = {}) {
    // Import dinâmico: o bundle são 155 KB que só fazem sentido depois que o
    // usuário liga o reconhecimento. Abrir o painel não deve pagar por isso.
    const { HandLandmarker } = await import(ASSETS.bundle);

    // O WasmFileset é uma interface de objeto simples. Montá-lo à mão em vez de
    // usar FilesetResolver.forVisionTasks() evita a sonda SIMD em runtime — que
    // aponta para um par `_nosimd_` que deliberadamente não vendorizamos — e a
    // concatenação interna de caminhos.
    const fileset = {
      wasmLoaderPath: chrome.runtime.getURL(ASSETS.wasmLoader),
      wasmBinaryPath: chrome.runtime.getURL(ASSETS.wasmBinary)
    };

    const opcoes = {
      baseOptions: { modelAssetPath: chrome.runtime.getURL(ASSETS.modelo), delegate },
      numHands: 1,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    };
    if (delegate === 'GPU') {
      if (!canvas) throw new Error('O delegate GPU exige um canvas para o contexto WebGL.');
      opcoes.canvas = canvas;
    }

    const detector = await HandLandmarker.createFromOptions(fileset, opcoes);
    return new HandLandmarkerAdapter(detector, delegate);
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} ts timestamp estritamente crescente (ver inference-loop)
   * @returns {{landmarks: Array, handedness: string|null, confiancaMao: number}|null} null sem mão
   */
  detectar(video, ts) {
    if (this._fechado) return null;

    const r = this._detector.detectForVideo(video, ts);
    const landmarks = r?.landmarks?.[0];
    if (!landmarks || landmarks.length !== 21) return null;

    // O handedness do MediaPipe pressupõe imagem espelhada, e o getUserMedia
    // entrega quadros crus — então vem invertido aqui. Pior: webcams virtuais
    // (Iriun, OBS, DroidCam) às vezes espelham na origem, sem como detectar por
    // API. Por isso o valor sai como "mão vista num quadro cru"; quem corrige a
    // inversão da câmera é o SignRecognizer, com a preferência do usuário.
    const categoria = r?.handednesses?.[0]?.[0];
    const bruto = categoria?.categoryName ?? null;
    const handedness = bruto === 'Left' ? 'direita' : bruto === 'Right' ? 'esquerda' : null;

    return { landmarks, handedness, confiancaMao: categoria?.score ?? 0 };
  }

  fechar() {
    if (this._fechado) return;
    this._fechado = true;
    this._detector?.close?.();
    this._detector = null;
  }
}
