/**
 * Soletra (modo dev) — sessão do teste de sinais.
 *
 * Dois modos:
 *  - unitario  um sinal escolhido, N rodadas;
 *  - geral     letra por letra e depois número por número (ou só um dos dois
 *              conjuntos), N rodadas de cada, em ordem ou sorteados.
 *
 * Cada rodada passa por "contagem" (a pessoa se prepara, com a mão baixa) e
 * "gravando" (mantém o sinal pela duração da rodada). Ao fim da gravação, os
 * quadros recebidos viram a análise da rodada (rodada.js).
 *
 * Máquina de estados pura: o relógio entra por argumento (t em ms, o mesmo
 * relógio dos quadros) e os efeitos colaterais — trocar o conjunto, liberar a
 * trava — ficam com quem escuta os eventos (controle.js). Assim a sessão inteira
 * roda em Node com quadros sintéticos.
 */
import { LETRAS_ESTATICAS, NUMEROS } from '../../src/sign-classes.js';
import { analisarRodada } from './rodada.js';

export const PADROES_TESTE = {
  rodadasUnitario: 3,
  rodadasGeral: 1,
  duracaoMs: 5000,
  contagemMs: 3000
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

export class SessaoTeste {
  /**
   * @param {object} config ver planejar(), mais duracaoMs e contagemMs
   * @param {(evento: {tipo: string, item?: object, rodada?: object}) => void} [aoEvento]
   */
  constructor(config, aoEvento = () => {}) {
    this.config = {
      duracaoMs: PADROES_TESTE.duracaoMs,
      contagemMs: PADROES_TESTE.contagemMs,
      ...config
    };
    this.plano = planejar(this.config);
    this.aoEvento = aoEvento;
    /** pronta → contagem ⇄ gravando → … → concluida; pausada a partir de contagem ou gravando. */
    this.fase = 'pronta';
    this.indice = 0;
    this.rodadas = [];
    this.inicioSessao = null;
    this.inicioRodada = null;
    this.fim = null;
    this._quadros = [];
  }

  get item() {
    return this.plano[this.indice] ?? null;
  }

  /** Retrato para a interface. */
  estado(t) {
    return {
      fase: this.fase,
      indice: this.indice,
      total: this.plano.length,
      item: this.item,
      restanteMs: this.fim !== null && (this.fase === 'contagem' || this.fase === 'gravando') ? Math.max(0, this.fim - t) : null,
      faseMs: this.fase === 'contagem' ? this.config.contagemMs : this.config.duracaoMs,
      feitas: this.rodadas.filter((r) => r.estado === 'feita').length,
      puladas: this.rodadas.filter((r) => r.estado === 'pulada').length
    };
  }

  iniciar(t) {
    if (this.fase !== 'pronta') return;
    this.inicioSessao = t;
    if (this.plano.length === 0) this._concluir();
    else this._contar(t);
  }

  aoQuadro(quadro) {
    if (this.fase === 'gravando' && quadro.t >= this.inicioRodada && quadro.t < this.fim) this._quadros.push(quadro);
  }

  /** Avança as fases conforme o relógio. Chamado a cada ~100 ms. */
  tick(t) {
    if (this.fase === 'contagem' && t >= this.fim) this._gravar(this.fim);
    else if (this.fase === 'gravando' && t >= this.fim) this._fecharRodada();
  }

  /** Pausar descarta a rodada em andamento; continuar a refaz desde a contagem. */
  pausar() {
    if (this.fase !== 'contagem' && this.fase !== 'gravando') return;
    this.fase = 'pausada';
    this.fim = null;
    this._quadros = [];
    this.aoEvento({ tipo: 'pausada', item: this.item });
  }

  continuar(t) {
    if (this.fase === 'pausada') this._contar(t);
  }

  /** Refaz a rodada em andamento desde a contagem, descartando o que já foi gravado. */
  repetir(t) {
    if (this.fase === 'contagem' || this.fase === 'gravando' || this.fase === 'pausada') this._contar(t);
  }

  /** A rodada em andamento fica registrada como pulada (fora das taxas). */
  pular(t) {
    if (this.fase !== 'contagem' && this.fase !== 'gravando' && this.fase !== 'pausada') return;
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

  _contar(t) {
    this.fase = 'contagem';
    this.fim = t + this.config.contagemMs;
    this._quadros = [];
    this.aoEvento({ tipo: 'contagem', item: this.item });
  }

  _gravar(t) {
    this.fase = 'gravando';
    this.inicioRodada = t;
    this.fim = t + this.config.duracaoMs;
    this._quadros = [];
    this.aoEvento({ tipo: 'gravando', item: this.item });
  }

  _fecharRodada() {
    const fim = this.fim;
    const rodada = {
      indice: this.indice,
      ...this.item,
      estado: 'feita',
      inicioMs: this.inicioRodada - this.inicioSessao,
      duracaoMs: this.config.duracaoMs,
      analise: analisarRodada({
        sinal: this.item.sinal,
        inicio: this.inicioRodada,
        duracao: this.config.duracaoMs,
        quadros: this._quadros
      })
    };
    this.rodadas.push(rodada);
    this._quadros = [];
    this.aoEvento({ tipo: 'rodada', rodada });
    this._avancar(fim);
  }

  _avancar(t) {
    this.indice++;
    if (this.indice >= this.plano.length) this._concluir();
    else this._contar(t);
  }

  _concluir() {
    this.fase = 'concluida';
    this.fim = null;
    this._quadros = [];
    this.aoEvento({ tipo: 'concluida' });
  }
}
