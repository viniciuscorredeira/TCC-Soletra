/**
 * Soletra — composição do texto reconhecido.
 *
 * Mantém a string que aparece na text-box e notifica quem a exibe. Fica
 * separado do estabilizador porque as duas coisas mudam por motivos
 * diferentes: o estabilizador muda quando o reconhecimento muda, este muda
 * também por edição manual (apagar, espaço, limpar, digitação direta).
 */

export const LIMITE_PADRAO = 200;

export class TextComposer {
  /**
   * @param {object} [opcoes]
   * @param {number} [opcoes.limite] máximo de caracteres
   * @param {(texto: string) => void} [aoMudar]
   */
  constructor({ limite = LIMITE_PADRAO } = {}, aoMudar = () => {}) {
    this.limite = limite;
    this.aoMudar = aoMudar;
    this._texto = '';
  }

  get texto() {
    return this._texto;
  }

  get vazio() {
    return this._texto.length === 0;
  }

  _definirInterno(novo) {
    if (novo === this._texto) return false;
    this._texto = novo;
    this.aoMudar(this._texto);
    return true;
  }

  /** Acrescenta um caractere reconhecido. Ignora silenciosamente no limite. */
  anexar(caractere) {
    if (typeof caractere !== 'string' || caractere.length === 0) return false;
    if (this._texto.length >= this.limite) return false;
    return this._definirInterno(this._texto + caractere);
  }

  /**
   * Espaço não abre a palavra nem duplica: sem isso, uma pausa mal interpretada
   * deixaria "YOU  TUBE" e a busca sairia errada sem o usuário notar.
   */
  espaco() {
    if (this._texto.length === 0 || this._texto.endsWith(' ')) return false;
    if (this._texto.length >= this.limite) return false;
    return this._definirInterno(`${this._texto} `);
  }

  apagar() {
    if (this._texto.length === 0) return false;
    return this._definirInterno(this._texto.slice(0, -1));
  }

  limpar() {
    return this._definirInterno('');
  }

  /** Edição direta pelo teclado, ou restauração do texto persistido. */
  definir(texto) {
    const limpo = String(texto ?? '').slice(0, this.limite);
    return this._definirInterno(limpo);
  }

  /** Texto pronto para a busca: sem espaços nas pontas nem repetidos no meio. */
  paraBusca() {
    return this._texto.trim().replace(/\s+/g, ' ');
  }
}
