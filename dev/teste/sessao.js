/**
 * Soletra (modo dev) — sessão do teste de sinais.
 *
 * Dois modos:
 *  - unitario  um sinal escolhido, N rodadas;
 *  - geral     letra por letra e depois número por número (ou só um dos dois
 *              conjuntos), N rodadas de cada, em ordem ou sorteados.
 *
 * Duas formas de começar cada rodada:
 *  - reconhecer (padrão)  o sinal é pedido ("aguardando") e a gravação começa
 *                         no quadro em que o reconhecimento o confirma. Se não
 *                         vier dentro do tempo máximo de espera, a rodada fica
 *                         como não reconhecida;
 *  - contagem             uma contagem para a pessoa se preparar com a mão
 *                         baixa, e a gravação começa no fim dela.
 * Em ambas, a gravação dura um tempo fixo, e os quadros dela viram a análise
 * da rodada (rodada.js).
 *
 * Máquina de estados pura: o relógio entra por argumento (t em ms, o mesmo
 * relógio dos quadros) e os efeitos colaterais — trocar o conjunto, liberar a
 * trava — ficam com quem escuta os eventos (controle.js). Assim a sessão inteira
 * roda em Node com quadros sintéticos.
 */
import { LETRAS_ESTATICAS, NUMEROS } from '../../src/sign-classes.js';
import { analisarRodada, resultadoDaRodada } from './rodada.js';

export const PADROES_TESTE = {
  rodadasUnitario: 3,
  rodadasGeral: 1,
  duracaoMs: 5000,
  contagemMs: 3000,
  inicio: 'reconhecer',
  /** Tempo máximo para o sinal pedido ser reconhecido; 0 = sem limite. */
  esperaMaxMs: 10000
};

const CLASSES = { letras: LETRAS_ESTATICAS, numeros: NUMEROS };

export const conjuntoDe = (sinal) => (NUMEROS.includes(sinal) ? 'numeros' : 'letras');

/** Gerador determinístico (mulberry32): a mesma semente sorteia a mesma ordem. */
function gerador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const temRepeticaoSeguida = (lista) => lista.some((item, i) => i > 0 && item.sinal === lista[i - 1].sinal);

/**
 * Lista das rodadas da sessão.
 * @param {object} config
 * @param {'unitario'|'geral'} config.modo
 * @param {string} [config.sinal] no unitário
 * @param {Array<'letras'|'numeros'>} [config.conjuntos] no geral
 * @param {number} config.rodadas por sinal
 * @param {'ordem'|'sorteada'} [config.ordem] no geral
 * @param {number} [config.semente]
 * @returns {Array<{sinal: string, conjunto: string, repeticao: number}>}
 */
export function planejar({ modo, sinal, conjuntos = ['letras', 'numeros'], rodadas, ordem = 'ordem', semente = 1 }) {
  const sinais = modo === 'unitario' ? [sinal] : ['letras', 'numeros'].filter((c) => conjuntos.includes(c)).flatMap((c) => CLASSES[c]);
  const plano = sinais.flatMap((s) =>
    Array.from({ length: rodadas }, (_, i) => ({ sinal: s, conjunto: conjuntoDe(s), repeticao: i + 1 }))
  );
  if (modo === 'unitario' || ordem !== 'sorteada') return plano;

  // Fisher-Yates, sorteado de novo enquanto houver o mesmo sinal duas vezes
  // seguidas: repetir de cara favorece o sinal (a mão já está pronta) e esbarra
  // na trava contra repetição. Com poucos sinais pode não haver saída, e a
  // última ordem sorteada fica.
  const sortear = gerador(semente);
  let lista = plano;
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    lista = [...plano];
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(sortear() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    if (!temRepeticaoSeguida(lista)) break;
  }
  return lista;
}

const EM_ANDAMENTO = new Set(['aguardando', 'contagem', 'gravando']);

export class SessaoTeste {
  /**
   * @param {object} config ver planejar(), mais duracaoMs, inicio, contagemMs e esperaMaxMs
   * @param {(evento: {tipo: string, item?: object, rodada?: object}) => void} [aoEvento]
   */
  constructor(config, aoEvento = () => {}) {
    this.config = {
      duracaoMs: PADROES_TESTE.duracaoMs,
      contagemMs: PADROES_TESTE.contagemMs,
      inicio: PADROES_TESTE.inicio,
      esperaMaxMs: PADROES_TESTE.esperaMaxMs,
      ...config
    };
    this.plano = planejar(this.config);
    this.aoEvento = aoEvento;
    /**
     * pronta → (aguardando | contagem) → gravando → … → concluida;
     * pausada a partir de qualquer fase em andamento.
     */
    this.fase = 'pronta';
    this.indice = 0;
    this.rodadas = [];
    this.inicioSessao = null;
    this.inicioRodada = null;
    this.fim = null;
    this._quadros = [];
    this._espera = null;
  }

  get item() {
    return this.plano[this.indice] ?? null;
  }

  /** Retrato para a interface. */
  estado(t) {
    const faseMs = { aguardando: this.config.esperaMaxMs || null, contagem: this.config.contagemMs, gravando: this.config.duracaoMs }[this.fase] ?? null;
    return {
      fase: this.fase,
      inicio: this.config.inicio,
      indice: this.indice,
      total: this.plano.length,
      item: this.item,
      restanteMs: this.fim !== null && EM_ANDAMENTO.has(this.fase) ? Math.max(0, this.fim - t) : null,
      faseMs,
      erradasNaEspera: this._espera?.erradas.length ?? 0,
      feitas: this.rodadas.filter((r) => r.estado === 'feita').length,
      puladas: this.rodadas.filter((r) => r.estado === 'pulada').length
    };
  }

  iniciar(t) {
    if (this.fase !== 'pronta') return;
    this.inicioSessao = t;
    if (this.plano.length === 0) this._concluir();
    else this._preparar(t);
  }

  aoQuadro(quadro) {
    if (this.fase === 'gravando') {
      if (quadro.t >= this.inicioRodada && quadro.t < this.fim) this._quadros.push(quadro);
      return;
    }
    if (this.fase !== 'aguardando' || quadro.t < this._espera.inicio) return;

    const confirmou = quadro.estabilizador?.confirmou;
    if (!confirmou) return;
    if (confirmou === this.item.sinal) {
      this._espera.reconhecidoEmMs = quadro.t - this._espera.inicio;
      this._gravar(quadro.t);
      this._quadros.push(quadro);
    } else {
      this._espera.erradas.push({ classe: confirmou, ms: quadro.t - this._espera.inicio });
    }
  }

  /** Avança as fases conforme o relógio. Chamado a cada ~100 ms. */
  tick(t) {
    if (this.fase === 'contagem' && t >= this.fim) this._gravar(this.fim);
    else if (this.fase === 'aguardando' && this.fim !== null && t >= this.fim) this._fecharRodada(this.fim, false);
    else if (this.fase === 'gravando' && t >= this.fim) this._fecharRodada(this.fim, true);
  }

  /** Pausar descarta a rodada em andamento; continuar a refaz desde o começo. */
  pausar() {
    if (!EM_ANDAMENTO.has(this.fase)) return;
    this.fase = 'pausada';
    this.fim = null;
    this._quadros = [];
    this.aoEvento({ tipo: 'pausada', item: this.item });
  }

  continuar(t) {
    if (this.fase === 'pausada') this._preparar(t);
  }

  /** Refaz a rodada em andamento desde o começo, descartando o que já foi gravado. */
  repetir(t) {
    if (EM_ANDAMENTO.has(this.fase) || this.fase === 'pausada') this._preparar(t);
  }

  /** A rodada em andamento fica registrada como pulada (fora das taxas). */
  pular(t) {
    if (!EM_ANDAMENTO.has(this.fase) && this.fase !== 'pausada') return;
    const rodada = { indice: this.indice, ...this.item, estado: 'pulada' };
    this.rodadas.push(rodada);
    this.aoEvento({ tipo: 'rodada', rodada });
    this._avancar(t);
  }

  /** Termina antes do fim do plano; a rodada em andamento é descartada. */
  encerrar() {
    if (this.fase === 'concluida' || this.fase === 'pronta') return;
    this._concluir();
  }

  _preparar(t) {
    this._quadros = [];
    if (this.config.inicio === 'reconhecer') {
      this.fase = 'aguardando';
      this._espera = { inicio: t, reconhecidoEmMs: null, erradas: [] };
      this.fim = this.config.esperaMaxMs > 0 ? t + this.config.esperaMaxMs : null;
      this.aoEvento({ tipo: 'aguardando', item: this.item });
    } else {
      this.fase = 'contagem';
      this._espera = null;
      this.fim = t + this.config.contagemMs;
      this.aoEvento({ tipo: 'contagem', item: this.item });
    }
  }

  _gravar(t) {
    this.fase = 'gravando';
    this.inicioRodada = t;
    this.fim = t + this.config.duracaoMs;
    this._quadros = [];
    this.aoEvento({ tipo: 'gravando', item: this.item });
  }

  /** @param {number} t @param {boolean} gravou se houve gravação (não há quando o sinal não foi reconhecido) */
  _fecharRodada(t, gravou) {
    const { sinal } = this.item;
    const analise = gravou
      ? analisarRodada({ sinal, inicio: this.inicioRodada, duracao: this.config.duracaoMs, quadros: this._quadros })
      : null;
    const rodada = {
      indice: this.indice,
      ...this.item,
      estado: 'feita',
      inicio: this.config.inicio,
      ...resultadoDaRodada({ sinal, inicio: this.config.inicio, analise, espera: this._espera }),
      inicioMs: gravou ? this.inicioRodada - this.inicioSessao : null,
      duracaoMs: gravou ? this.config.duracaoMs : 0,
      analise
    };
    this.rodadas.push(rodada);
    this._quadros = [];
    this.aoEvento({ tipo: 'rodada', rodada });
    this._avancar(t);
  }

  _avancar(t) {
    this.indice++;
    if (this.indice >= this.plano.length) this._concluir();
    else this._preparar(t);
  }

  _concluir() {
    this.fase = 'concluida';
    this.fim = null;
    this._quadros = [];
    this.aoEvento({ tipo: 'concluida' });
  }
}
