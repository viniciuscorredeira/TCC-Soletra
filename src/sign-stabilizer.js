/**
 * RVL Libras — máquina de estados da confirmação de sinal.
 *
 * Reconhecer quadro a quadro produziria uma enxurrada de caracteres a cada
 * tremor da mão. Este módulo transforma o fluxo ruidoso do classificador em
 * eventos discretos de confirmação, com duas garantias: o sinal precisa
 * persistir para virar caractere, e não repete enquanto a mão continua parada.
 *
 * O relógio é injetado (`t` é argumento de processar(), nunca performance.now()
 * lido aqui dentro). É o que torna a máquina testável sem timers reais.
 */

/** Símbolos que não são classes, mas participam da votação como cidadãos de primeira classe. */
export const SEM_MAO = 'sem-mao';
export const DESCONHECIDO = 'desconhecido';
export const INDEFINIDO = 'indefinido';

export const PADROES_ESTABILIZADOR = {
  /** Janela de votação, em ms. ~6 quadros a 15 Hz. */
  W_VOTO: 400,
  /** Mínimo de quadros da classe vencedora para ela poder confirmar. */
  N_MIN: 3,
  /**
   * Fração da janela que a vencedora precisa ocupar. Frouxa de propósito: com
   * 0,6 um punhado de quadros ruins derrubava o vencedor para "indefinido", o
   * cronômetro de permanência reiniciava e o anel enchia pela metade sem nunca
   * fechar — o sinal mais visível de rigor excessivo.
   */
  FRACAO_MIN: 0.55,
  /** Confiança mínima do KNN para o quadro contar como válido. */
  T_CONF: 0.5,
  /** Permanência exigida antes de confirmar, em ms. */
  T_PERMANENCIA: 700,
  /** Tempo fora da classe travada que libera a repetição, em ms. */
  T_LIBERA: 200,
  /** Lacuna que invalida a janela (painel oculto, câmera pausada), em ms. */
  T_LACUNA: 500
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export class SignStabilizer {
  /**
   * @param {Partial<typeof PADROES_ESTABILIZADOR>} [opcoes]
   * @param {(evento: {classe: string, t: number}) => void} [aoConfirmar]
   */
  constructor(opcoes = {}, aoConfirmar = () => {}) {
    this.opcoes = { ...PADROES_ESTABILIZADOR, ...opcoes };
    this.aoConfirmar = aoConfirmar;
    this.reiniciar();
  }

  reiniciar() {
    /** @type {Array<{t: number, simbolo: string}>} */
    this._janela = [];
    this._ultimoT = null;
    this._vencedor = INDEFINIDO;
    this._desde = null;
    /** Classe travada após uma confirmação; null quando livre. */
    this._travadoEm = null;
    /** Início da corrida atual de quadros crus fora da classe travada. */
    this._desdeForaDaTrava = null;
    /**
     * Marco de uma classe recém-liberada: a permanência dela não pode contar
     * quadros anteriores à liberação. Vale só para a classe que estava travada;
     * as demais não têm por que ser penalizadas.
     * @type {{classe: string, t: number}|null}
     */
    this._piso = null;
  }

  /**
   * Libera a trava manualmente — é o botão "Repetir letra" da UI, a via de
   * escape para quem não consegue produzir a pausa que destrava por gesto.
   * @param {number} [t] relógio atual; sem ele a próxima permanência conta do
   *   primeiro quadro que chegar.
   */
  liberarTrava(t) {
    this._travadoEm = null;
    this._desdeForaDaTrava = null;
    this._desde = null;
    this._vencedor = INDEFINIDO;
    if (Number.isFinite(t)) this._piso = t;
  }

  /**
   * @param {object} quadro
   * @param {number} quadro.t            relógio em ms (monotônico)
   * @param {string|null} quadro.classe  classe crua do classificador
   * @param {number} [quadro.confianca]
   * @param {number} [quadro.distanciaMin]
   * @param {boolean} [quadro.temMao]
   * @returns {object} snapshot do estado visual
   */
  processar({ t, classe = null, confianca = 1, distanciaMin = 0, temMao = true }) {
    const o = this.opcoes;

    // Estágio 1 — rejeição. "desconhecido" não é erro: é o estado em que o
    // usuário relaxa a mão, e é ele que destrava a repetição do mesmo caractere.
    const valido =
      temMao && classe !== null && confianca >= o.T_CONF && distanciaMin <= (o.TAU_ABS ?? Infinity);
    const simbolo = !temMao ? SEM_MAO : valido ? classe : DESCONHECIDO;

    // Uma lacuna longa significa que a janela guarda passado irrelevante — o
    // painel ficou oculto, a câmera pausou. Votar com isso confirmaria sinais
    // que o usuário fez há meio minuto.
    if (this._ultimoT !== null && t - this._ultimoT > o.T_LACUNA) {
      this._janela = [];
      this._vencedor = INDEFINIDO;
      this._desde = null;
    }
    this._ultimoT = t;

    // Estágio 2 — votação por tempo, não por contagem de quadros: a taxa de
    // inferência varia com a carga da máquina, e uma janela em quadros mudaria
    // de duração sem avisar.
    this._janela.push({ t, simbolo });
    const corte = t - o.W_VOTO;
    while (this._janela.length > 0 && this._janela[0].t < corte) this._janela.shift();

    const vencedor = this._apurar();

    // Estágio 3 — permanência. O cronômetro reinicia quando o vencedor muda, e
    // conta desde o quadro mais antigo desse símbolo ainda na janela — não desde
    // o instante em que a votação o declarou. A diferença não é cosmética: a
    // votação só declara um vencedor depois de acumular N_MIN quadros, e ancorar
    // ali somaria esse aquecimento ao T_PERMANENCIA, exigindo quase um segundo
    // de mão parada onde o usuário foi informado que bastariam 700 ms.
    if (vencedor !== this._vencedor) {
      this._vencedor = vencedor;
      let inicio = this._inicioNaJanela(vencedor, t);
      if (this._piso?.classe === vencedor) inicio = Math.max(inicio, this._piso.t);
      this._desde = inicio;
    }
    if (this._desde === null) this._desde = t;

    const ehClasse = vencedor !== INDEFINIDO && vencedor !== DESCONHECIDO && vencedor !== SEM_MAO;

    // Estágio 5 — liberação. Diferente da confirmação, que exige evidência
    // acumulada, a liberação usa o fluxo CRU de quadros. Confirmar é um
    // compromisso e pode ser lento; destravar é um reset e precisa ser
    // responsivo — se dependesse da janela votada, o atraso dela somaria ao
    // T_LIBERA e relaxar a mão por meio segundo não bastaria para repetir letra.
    if (this._travadoEm !== null) {
      if (simbolo === this._travadoEm) {
        this._desdeForaDaTrava = null;
      } else {
        if (this._desdeForaDaTrava === null) this._desdeForaDaTrava = t;
        if (t - this._desdeForaDaTrava >= o.T_LIBERA) {
          // O piso impede que quadros anteriores à liberação, ainda vivos na
          // janela, deem crédito de permanência e confirmem a MESMA letra de
          // novo no instante seguinte ao destravamento.
          this._piso = { classe: this._travadoEm, t };
          this._travadoEm = null;
          this._desdeForaDaTrava = null;
        }
      }
    }

    // Estágio 4 — confirmação. A trava barra apenas a REPETIÇÃO da mesma
    // classe: trocar de letra é inequívoco e confirma na hora, sem pagar o
    // T_LIBERA. Repetir a mesma letra é que exige sair dela antes — e a trava
    // só se solta por mudança de estado, nunca por tempo, senão segurar um M
    // por três segundos escreveria "MMMM".
    let confirmou = null;
    const maduro = ehClasse && t - this._desde >= o.T_PERMANENCIA;
    if (maduro && this._travadoEm !== vencedor) {
      confirmou = vencedor;
      this._travadoEm = vencedor;
      this._desdeForaDaTrava = null;
      this.aoConfirmar({ classe: vencedor, t });
    }

    return this._snapshot({ t, simbolo, vencedor, ehClasse, confirmou, distanciaMin });
  }

  /** Timestamp do quadro mais antigo desse símbolo ainda na janela. */
  _inicioNaJanela(simbolo, padrao) {
    for (const entrada of this._janela) {
      if (entrada.simbolo === simbolo) return entrada.t;
    }
    return padrao;
  }

  /** Vencedor da janela, ou INDEFINIDO se ninguém tem maioria suficiente. */
  _apurar() {
    const o = this.opcoes;
    const total = this._janela.length;
    if (total === 0) return INDEFINIDO;

    const contagem = new Map();
    for (const { simbolo } of this._janela) {
      contagem.set(simbolo, (contagem.get(simbolo) || 0) + 1);
    }

    let vencedor = null;
    let melhor = 0;
    for (const [simbolo, n] of contagem) {
      if (n > melhor) { melhor = n; vencedor = simbolo; }
    }

    if (melhor / total < o.FRACAO_MIN) return INDEFINIDO;

    // N_MIN vale só para classes reais: confirmar exige evidência, mas
    // destravar não pode ficar refém de quantos quadros couberam na janela.
    const ehClasse = vencedor !== INDEFINIDO && vencedor !== DESCONHECIDO && vencedor !== SEM_MAO;
    if (ehClasse && melhor < o.N_MIN) return INDEFINIDO;

    return vencedor;
  }

  _snapshot({ t, simbolo, vencedor, ehClasse, confirmou, distanciaMin }) {
    const travado = this._travadoEm !== null;
    const progresso =
      ehClasse && !travado ? clamp01((t - this._desde) / this.opcoes.T_PERMANENCIA) : 0;

    let estadoVisual;
    if (travado) estadoVisual = 'travado';
    else if (ehClasse) estadoVisual = 'formando';
    else if (simbolo === SEM_MAO) estadoVisual = 'sem-mao';
    else estadoVisual = 'desconhecido';

    return {
      simbolo,
      vencedor,
      candidato: ehClasse ? vencedor : null,
      progresso,
      travadoEm: this._travadoEm,
      confirmou,
      estadoVisual,
      distanciaMin
    };
  }
}
