/**
 * Soletra — controlador de captura de vídeo.
 *
 * Encapsula todo o ciclo de vida do MediaStream (enumerar, iniciar, parar,
 * reiniciar) e expõe um único callback de estado para a UI. Nenhum frame sai
 * do navegador: o stream é ligado direto ao elemento <video>.
 */

/** @typedef {'idle'|'requesting'|'active'|'stopped'|'error'} CameraState */

/** Teto da captura. Acima disso só se gasta decodificação: o reconhecimento
 *  analisa no máximo 15 quadros por segundo (ver inference-loop). */
export const FPS_MAXIMO = 60;

const DEFAULT_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: FPS_MAXIMO, max: FPS_MAXIMO }
};

/**
 * Taxa negociada com a câmera, a partir de track.getSettings(). É a taxa que o
 * dispositivo declara — uma queda por pouca luz (exposição automática) não
 * aparece aqui.
 * @returns {{fps: number, abaixo: boolean}|null} null quando o navegador não informa
 */
export function avaliarTaxaDeQuadros(settings) {
  const fps = settings?.frameRate;
  if (!Number.isFinite(fps) || fps <= 0) return null;
  // Arredondado: há câmeras que declaram 59,94 e não fazem sentido reclamar.
  return { fps: Math.round(fps), abaixo: Math.round(fps) < FPS_MAXIMO };
}

/** Traduz a exceção do getUserMedia para uma mensagem acionável em pt-BR. */
export function describeMediaError(error) {
  const name = error?.name || 'UnknownError';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        code: 'permission-denied',
        message: 'Permissão de câmera negada. Autorize o acesso para continuar.',
        recoverable: true
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        code: 'no-device',
        message: 'Nenhuma câmera encontrada. Conecte um dispositivo e clique em Recarregar.',
        recoverable: true
      };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        code: 'device-busy',
        message: 'A câmera está em uso por outro aplicativo ou aba. Feche-o e tente novamente.',
        recoverable: true
      };
    case 'OverconstrainedError':
      return {
        code: 'overconstrained',
        message: 'A câmera selecionada não está mais disponível. Escolha outro dispositivo.',
        recoverable: true
      };
    case 'AbortError':
      return {
        code: 'aborted',
        message: 'A captura foi interrompida pelo sistema operacional.',
        recoverable: true
      };
    case 'SecurityError':
      return {
        code: 'insecure-context',
        message: 'Contexto inseguro: a captura só é permitida em páginas da extensão.',
        recoverable: false
      };
    default:
      return {
        code: 'unknown',
        message: `Falha ao acessar a câmera (${name}).`,
        recoverable: true
      };
  }
}

export class CameraController {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {(snapshot: object) => void} onStateChange
   */
  constructor(videoEl, onStateChange) {
    this.videoEl = videoEl;
    this.onStateChange = onStateChange;
    /** @type {MediaStream|null} */
    this.stream = null;
    /** @type {CameraState} */
    this.state = 'idle';
    this.error = null;
    this.activeDeviceId = null;
    /** @type {MediaDeviceInfo[]} */
    this.devices = [];
    this._startToken = 0;

    this._onDeviceChange = () => this.refreshDevices({ notify: true });
    navigator.mediaDevices.addEventListener('devicechange', this._onDeviceChange);
  }

  _emit() {
    this.onStateChange({
      state: this.state,
      error: this.error,
      devices: this.devices,
      activeDeviceId: this.activeDeviceId,
      track: this.getActiveTrack()
    });
  }

  _setState(state, error = null) {
    this.state = state;
    this.error = error;
    this._emit();
  }

  getActiveTrack() {
    return this.stream?.getVideoTracks()?.[0] || null;
  }

  /**
   * Estado da permissão de câmera para a origem da extensão.
   * @returns {Promise<'granted'|'denied'|'prompt'|'unknown'>}
   */
  static async permissionState() {
    try {
      const status = await navigator.permissions.query({ name: 'camera' });
      return status.state;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Lista as câmeras disponíveis. Os rótulos só ficam legíveis depois que a
   * permissão é concedida — antes disso o navegador devolve strings vazias.
   */
  async refreshDevices({ notify = false } = {}) {
    let all = [];
    try {
      all = await navigator.mediaDevices.enumerateDevices();
    } catch {
      all = [];
    }
    this.devices = all.filter((d) => d.kind === 'videoinput');

    // O dispositivo em uso foi desconectado durante a transmissão.
    const stillThere = this.devices.some((d) => d.deviceId === this.activeDeviceId);
    if (this.state === 'active' && this.activeDeviceId && !stillThere) {
      this._teardownStream();
      this._setState('error', {
        code: 'device-disconnected',
        message: 'A câmera em uso foi desconectada.',
        recoverable: true
      });
      return this.devices;
    }

    if (notify) this._emit();
    return this.devices;
  }

  /**
   * Abre o stream. Quando `deviceId` é informado usa `exact` para garantir o
   * dispositivo escolhido; sem ele deixa o navegador decidir a câmera padrão.
   */
  async start(deviceId) {
    const token = ++this._startToken;
    this._teardownStream();
    this._setState('requesting');

    const video = { ...DEFAULT_CONSTRAINTS };
    if (deviceId) video.deviceId = { exact: deviceId };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });

      // Um stop()/start() disparado durante o await invalida este resultado.
      if (token !== this._startToken) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      this.stream = stream;
      this.videoEl.srcObject = stream;
      await this.videoEl.play().catch(() => {});

      const track = this.getActiveTrack();
      this.activeDeviceId = track?.getSettings()?.deviceId || deviceId || null;

      // Desconexão física ou câmera tomada pelo SO encerram a track sozinhas.
      if (track) {
        track.addEventListener('ended', () => {
          if (this.state !== 'active') return;
          this._teardownStream();
          this._setState('error', {
            code: 'track-ended',
            message: 'A transmissão foi encerrada pelo sistema (dispositivo removido ou bloqueado).',
            recoverable: true
          });
        });
      }

      // Rótulos só ficam disponíveis após a permissão: recarrega a lista.
      await this.refreshDevices();
      this._setState('active');
      return true;
    } catch (err) {
      if (token !== this._startToken) return false;
      this._teardownStream();
      this._setState('error', describeMediaError(err));
      return false;
    }
  }

  /** Encerra todas as tracks e libera a câmera (LED do dispositivo apaga). */
  stop() {
    this._startToken++;
    const had = Boolean(this.stream);
    this._teardownStream();
    this._setState(had ? 'stopped' : this.state === 'error' ? 'error' : 'idle', had ? null : this.error);
  }

  /**
   * Garante que `devices` traga os rótulos reais do sistema (ex.: "Iriun
   * Webcam"). O navegador só expõe `label` depois que a origem obteve acesso
   * à câmera ao menos uma vez; antes disso `enumerateDevices()` devolve
   * strings vazias. Com a permissão já concedida, um getUserMedia relâmpago —
   * aberto e encerrado na mesma tacada — destrava os nomes sem deixar a
   * câmera ligada e sem disparar prompt.
   */
  async ensureDeviceLabels() {
    await this.refreshDevices();

    const missingLabels = this.devices.length > 0 && this.devices.every((d) => !d.label);
    if (!missingLabels || this.stream) return this.devices;
    if ((await CameraController.permissionState()) !== 'granted') return this.devices;

    try {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      probe.getTracks().forEach((track) => track.stop());
    } catch {
      return this.devices;
    }

    return this.refreshDevices();
  }

  /**
   * Recarrega preservando o estado da câmera: reenumera os dispositivos e só
   * reabre o stream se havia transmissão em andamento. Com a câmera desligada
   * o reload NÃO liga — apenas atualiza a lista e limpa um erro anterior.
   *
   * @returns {Promise<boolean>} true se, ao final, existe stream ativo.
   */
  async reload(deviceId) {
    const wasStreaming = this.state === 'active' && Boolean(this.stream);

    this._startToken++;
    this._teardownStream();

    if (!wasStreaming) {
      await this.ensureDeviceLabels();
      const stale = this.state === 'active' || this.state === 'requesting' || this.state === 'error';
      this._setState(stale ? 'idle' : this.state);
      return false;
    }

    await this.refreshDevices();
    return this.start(deviceId ?? this.activeDeviceId ?? undefined);
  }

  _teardownStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoEl.srcObject) {
      this.videoEl.srcObject = null;
    }
  }

  /** Libera listeners globais — chamado no unload do painel. */
  dispose() {
    this._startToken++;
    this._teardownStream();
    navigator.mediaDevices.removeEventListener('devicechange', this._onDeviceChange);
  }
}
