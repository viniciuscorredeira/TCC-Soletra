/**
 * RVL Libras — agendador do loop de inferência.
 *
 * Separado do adaptador do MediaPipe de propósito: aqui mora a lógica sutil
 * (descarte de quadros, timestamps monotônicos, cancelamento), que é testável
 * em Node com um vídeo falso; lá mora a dependência de WASM, que não é.
 *
 * O agendador é requestVideoFrameCallback, não setInterval: um timer dispara
 * mesmo quando não há quadro novo, e o MediaPipe reprocessaria a mesma imagem
 * gastando CPU para devolver o mesmo resultado. O rVFC dispara uma vez por
 * quadro decodificado e pausa junto com o vídeo, de graça.
 */

export const PADROES_LOOP = {
  /** Taxa alvo. detectForVideo é síncrono e trava a thread do painel: 30 Hz
   *  engasgaria a UI inteira para ganhar uma precisão que ninguém percebe. */
  hz: 15,
  /** Taxa de recuo quando a máquina não dá conta. */
  hzMinimo: 8,
  /** p95 de latência, em ms, que dispara o recuo. */
  limiteP95: 50,
  /** Quantas medições entram na estatística. */
  amostrasTelemetria: 30
};

export class InferenceLoop {
  /**
   * @param {HTMLVideoElement} video
   * @param {(video: any, ts: number) => void} aoQuadro
   * @param {object} [opcoes] `agora`, `agendarQuadro` e `cancelarQuadro` existem
   *   para os testes injetarem relógio e agendador falsos.
   */
  constructor(video, aoQuadro, opcoes = {}) {
    this.video = video;
    this.aoQuadro = aoQuadro;
    this.hzAlvo = opcoes.hz ?? PADROES_LOOP.hz;
    this.hzMinimo = opcoes.hzMinimo ?? PADROES_LOOP.hzMinimo;
    this.limiteP95 = opcoes.limiteP95 ?? PADROES_LOOP.limiteP95;
    this.maxAmostras = opcoes.amostrasTelemetria ?? PADROES_LOOP.amostrasTelemetria;

    this.agora = opcoes.agora ?? (() => performance.now());
    this._agendarRaf = opcoes.agendarQuadro ?? ((cb) => globalThis.requestAnimationFrame(cb));
    this._cancelarRaf = opcoes.cancelarQuadro ?? ((h) => globalThis.cancelAnimationFrame(h));

    this.usaRvfc =
      opcoes.forcarRaf !== true && typeof video?.requestVideoFrameCallback === 'function';

    this._rodando = false;
    this._handle = null;
    this._ts = 0;
    this._ultimoQuadro = -Infinity;
    this._latencias = [];
    this.hzAtual = this.hzAlvo;
    this.reduzido = false;
  }

  get rodando() {
    return this._rodando;
  }

  iniciar() {
    if (this._rodando) return false; // iniciar duas vezes criaria dois loops
    this._rodando = true;
    this._ultimoQuadro = -Infinity;
    this._agendar();
    return true;
  }

  parar() {
    if (!this._rodando) return false;
    this._rodando = false;
    this._cancelar();
    return true;
  }

  /** Estatísticas de latência para a UI e para o capítulo de resultados. */
  estatisticas() {
    if (this._latencias.length === 0) {
      return { p50: 0, p95: 0, amostras: 0, hz: this.hzAtual, reduzido: this.reduzido };
    }
    const ordenado = [...this._latencias].sort((a, b) => a - b);
    const em = (p) => ordenado[Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1)];
    return {
      p50: em(50),
      p95: em(95),
      amostras: ordenado.length,
      hz: this.hzAtual,
      reduzido: this.reduzido
    };
  }

  _agendar() {
    const cb = (now) => this._tick(now);
    this._handle = this.usaRvfc ? this.video.requestVideoFrameCallback(cb) : this._agendarRaf(cb);
  }

  _cancelar() {
    if (this._handle === null) return;
    if (this.usaRvfc) this.video.cancelVideoFrameCallback?.(this._handle);
    else this._cancelarRaf(this._handle);
    this._handle = null;
  }

  _tick(now) {
    // cancelVideoFrameCallback não garante que um callback já agendado deixe de
    // executar — sem esta guarda, um quadro chega depois do parar() e reabre o
    // estado que acabou de ser zerado.
    if (!this._rodando) return;
    this._agendar();

    if (now - this._ultimoQuadro < 1000 / this.hzAtual) return;
    this._ultimoQuadro = now;

    // Timestamp monotônico próprio. Usar metadata.mediaTime parece natural e é
    // uma armadilha: trocar de câmera reinicia a contagem, o MediaPipe recebe um
    // valor menor que o anterior e passa a devolver resultados vazios sem erro.
    this._ts = Math.max(this._ts + 1, Math.round(now));

    const t0 = this.agora();
    this.aoQuadro(this.video, this._ts);
    this._registrar(this.agora() - t0);
  }

  _registrar(latencia) {
    this._latencias.push(latencia);
    if (this._latencias.length > this.maxAmostras) this._latencias.shift();
    if (this._latencias.length < this.maxAmostras) return;

    const { p95 } = this.estatisticas();
    if (p95 > this.limiteP95 && !this.reduzido) {
      this.reduzido = true;
      this.hzAtual = this.hzMinimo;
    } else if (p95 < this.limiteP95 / 2 && this.reduzido) {
      this.reduzido = false;
      this.hzAtual = this.hzAlvo;
    }
  }
}
