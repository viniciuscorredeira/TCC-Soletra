/**
 * Soletra — trava de mão incorreta.
 *
 * O modelo é normalizado para UMA mão dominante. Um sinal feito com a outra
 * mão chega espelhado ao classificador e pode virar outra letra com confiança
 * alta — erro silencioso, pior que "não reconhecido". Por isso a mão errada
 * bloqueia a tradução (e a captura de treino), em vez de só gerar um aviso.
 *
 * O handedness do MediaPipe oscila quadro a quadro, sobretudo com a mão de
 * perfil. Travar no primeiro quadro discordante faria a tradução piscar; a
 * trava só engata depois de vários quadros seguidos com a mão errada e só solta
 * depois de vários com a certa. Quadros de baixa confiança não contam para
 * nenhum dos lados.
 *
 * Sem relógio nem DOM: a contagem é por quadro, o que a mantém testável em Node.
 */

export const PADROES_TRAVA = {
  /** Quadros seguidos com a mão errada para travar. ~330 ms a 15 Hz. */
  QUADROS_TRAVAR: 5,
  /** Quadros seguidos com a mão certa para soltar. ~200 ms a 15 Hz. */
  QUADROS_SOLTAR: 3,
  /** Confiança mínima do handedness para o quadro valer como evidência. */
  CONFIANCA_MIN: 0.8
};

export class TravaMao {
  constructor(opcoes = {}) {
    this.opcoes = { ...PADROES_TRAVA, ...opcoes };
    this.reiniciar();
  }

  reiniciar() {
    this.travada = false;
    /** Mão que disparou a trava, para a UI oferecer a troca. */
    this.maoVista = null;
    this._errados = 0;
    this._certos = 0;
  }

  /**
   * @param {object} quadro
   * @param {'direita'|'esquerda'|null} quadro.detectada mão detectada, já corrigida pela inversão da câmera
   * @param {number} [quadro.confianca] score do handedness
   * @param {'direita'|'esquerda'} quadro.esperada mão dominante configurada
   * @returns {boolean} true enquanto a tradução deve ficar bloqueada
   */
  processar({ detectada, confianca = 1, esperada }) {
    // Quadro ambíguo não é evidência: mantém o estado e não zera as contagens,
    // senão um quadro de perfil no meio adiaria a trava indefinidamente.
    if (!detectada || !(confianca >= this.opcoes.CONFIANCA_MIN)) return this.travada;

    if (detectada !== esperada) {
      this._certos = 0;
      this._errados++;
      if (this._errados >= this.opcoes.QUADROS_TRAVAR) {
        this.travada = true;
        this.maoVista = detectada;
      }
    } else {
      this._errados = 0;
      this._certos++;
      if (this._certos >= this.opcoes.QUADROS_SOLTAR) {
        this.travada = false;
        this.maoVista = null;
      }
    }
    return this.travada;
  }
}
