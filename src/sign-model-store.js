/**
 * Soletra — persistência do modelo treinado pelo usuário.
 *
 * As amostras são vetores numéricos, nunca imagens: o que fica gravado no
 * dispositivo é a geometria normalizada da mão, não a foto dela. Ainda assim é
 * dado biométrico derivado, e por isso existem apagar e exportar — não só por
 * conveniência, mas porque são os direitos de eliminação e portabilidade do
 * titular (LGPD art. 18, VI e V).
 */
import { VERSAO_FEATURES, DIMENSOES, compactar } from './sign-features.js';
import { ehClasseValida } from './sign-classes.js';

export const ESQUEMA = 1;

/**
 * Versão da fórmula de calibração do limiar de rejeição. Diferente de
 * VERSAO_FEATURES: as amostras continuam válidas, só o limiar derivado delas
 * precisa ser recalculado. Por isso a incompatibilidade aqui provoca
 * recalibração silenciosa, e não recusa do modelo.
 *
 * 1 → limiar pela dispersão interna das classes (rejeitava sinais legítimos:
 *     media o tremor durante a captura, não a variação ao refazer o sinal)
 * 2 → limiar pela separação entre classes + teste de razão
 */
export const VERSAO_CALIBRACAO = 2;
export const CHAVE_INDICE = 'soletra.modelo.v1.indice';
export const PREFIXO_CLASSE = 'soletra.modelo.v1.classe.';
export const FORMATO_ARQUIVO = 'soletra-modelo';

/**
 * O produto se chamou "RVL Libras" e gravava o formato com esse nome. A
 * validação compara com `!==` estrito, então recusar o valor antigo tornaria
 * inútil todo `.json` já exportado por um usuário — inclusive o que ele guardou
 * justamente como cópia de segurança antes de atualizar. A exportação grava só
 * o nome novo; a importação aceita os dois.
 */
export const FORMATOS_ACEITOS = [FORMATO_ARQUIVO, 'rvl-libras-modelo'];

/** Recomendado por classe; acima disso o ganho de acurácia não paga o tempo. */
export const AMOSTRAS_RECOMENDADAS = 20;
/** Teto duro: descarta a mais antiga ao exceder. */
export const AMOSTRAS_MAXIMAS = 60;

/** chrome.storage.local dá 10 MB desde o Chrome 114 — o manifesto já exige 114. */
export const QUOTA_BYTES = 10 * 1024 * 1024;
const AVISO_QUOTA = 0.8;

export class SignModelStore {
  /** @param {object} [area] injetável nos testes; por padrão chrome.storage.local */
  constructor(area = globalThis.chrome?.storage?.local) {
    this.area = area;
  }

  async _get(chaves) {
    return (await this.area.get(chaves)) || {};
  }

  /**
   * @returns {Promise<{indice: object|null, classes: Record<string, number[][]>, incompativel: object|null}>}
   */
  async carregar() {
    const { [CHAVE_INDICE]: indice } = await this._get(CHAVE_INDICE);
    if (!indice) return { indice: null, classes: {}, incompativel: null };

    // A checagem que evita o bug mais caro do projeto: mudar a normalização e
    // seguir usando amostras antigas não dá erro — dá queda de acurácia sem
    // causa aparente, tipicamente perto da entrega. Recusar é melhor que
    // reinterpretar.
    if (indice.versaoFeatures !== VERSAO_FEATURES || indice.esquema !== ESQUEMA) {
      return {
        indice: null,
        classes: {},
        incompativel: {
          versaoGravada: indice.versaoFeatures,
          versaoAtual: VERSAO_FEATURES,
          esquemaGravado: indice.esquema
        }
      };
    }

    const nomes = Object.keys(indice.contagem || {});
    const chaves = nomes.map((c) => PREFIXO_CLASSE + c);
    const bruto = await this._get(chaves);

    const classes = {};
    for (const nome of nomes) {
      const reg = bruto[PREFIXO_CLASSE + nome];
      const amostras = (reg?.amostras || []).filter((a) => a?.length === DIMENSOES);
      if (amostras.length > 0) classes[nome] = amostras;
    }
    return { indice, classes, incompativel: null };
  }

  async _lerIndice() {
    const { [CHAVE_INDICE]: indice } = await this._get(CHAVE_INDICE);
    if (indice && indice.versaoFeatures === VERSAO_FEATURES && indice.esquema === ESQUEMA) {
      return indice;
    }
    return {
      esquema: ESQUEMA,
      versaoFeatures: VERSAO_FEATURES,
      mao: 'direita',
      tauAbs: null,
      k: 5,
      criadoEm: new Date().toISOString(),
      atualizadoEm: null,
      contagem: {}
    };
  }

  async _gravarIndice(indice) {
    indice.atualizadoEm = new Date().toISOString();
    await this.area.set({ [CHAVE_INDICE]: indice });
    return indice;
  }

  /**
   * Grava uma amostra. Uma chave por classe, não uma chave única para o modelo
   * inteiro: com chave única, cada amostra capturada reescreveria ~370 KB.
   */
  async adicionarAmostra(classe, vetor, { mao = 'direita' } = {}) {
    if (!ehClasseValida(classe)) throw new Error(`Classe desconhecida: ${classe}`);
    if (!vetor || vetor.length !== DIMENSOES) throw new Error('Vetor com dimensão inesperada.');

    const indice = await this._lerIndice();
    indice.mao = mao;

    const chave = PREFIXO_CLASSE + classe;
    const { [chave]: reg } = await this._get(chave);
    const amostras = reg?.amostras || [];

    amostras.push(compactar(vetor));
    while (amostras.length > AMOSTRAS_MAXIMAS) amostras.shift();

    await this.area.set({ [chave]: { classe, amostras } });
    indice.contagem[classe] = amostras.length;
    await this._gravarIndice(indice);

    return amostras.length;
  }

  async removerClasse(classe) {
    const indice = await this._lerIndice();
    delete indice.contagem[classe];
    await this.area.remove(PREFIXO_CLASSE + classe);
    await this._gravarIndice(indice);
  }

  /** Apaga o modelo inteiro — o botão que atende o direito de eliminação. */
  async limpar() {
    const indice = await this._lerIndice();
    const chaves = Object.keys(indice.contagem || {}).map((c) => PREFIXO_CLASSE + c);
    await this.area.remove([...chaves, CHAVE_INDICE]);
  }

  /** Grava parâmetros derivados do treino (τ_abs calibrado, k, mão). */
  async atualizarParametros(campos) {
    const indice = await this._lerIndice();
    Object.assign(indice, campos);
    return this._gravarIndice(indice);
  }

  async bytesEmUso() {
    const usados = (await this.area.getBytesInUse?.(null)) ?? 0;
    return { usados, quota: QUOTA_BYTES, alerta: usados > QUOTA_BYTES * AVISO_QUOTA };
  }

  /**
   * Serializa o modelo para arquivo. Vale mais do que conveniência: permite
   * treinar uma vez e distribuir o .json junto com a extensão, e atende o
   * direito de portabilidade de forma verificável.
   */
  async exportar() {
    const { indice, classes } = await this.carregar();
    return {
      formato: FORMATO_ARQUIVO,
      esquema: ESQUEMA,
      versaoFeatures: VERSAO_FEATURES,
      criadoEm: new Date().toISOString(),
      mao: indice?.mao || 'direita',
      tauAbs: indice?.tauAbs ?? null,
      k: indice?.k ?? 5,
      classes
    };
  }

  /**
   * Valida antes de escrever qualquer coisa: um arquivo malformado não pode
   * deixar o modelo do usuário pior do que estava.
   * @returns {{ok: true, classes: object, contagem: number, mao: string, tauAbs: number|null}|{ok: false, erro: string}}
   */
  static validarArquivo(objeto) {
    if (!objeto || typeof objeto !== 'object') return { ok: false, erro: 'Arquivo não é um JSON de objeto.' };
    if (!FORMATOS_ACEITOS.includes(objeto.formato)) {
      return { ok: false, erro: `Formato desconhecido: ${objeto.formato ?? '(ausente)'}.` };
    }
    if (objeto.esquema !== ESQUEMA) {
      return { ok: false, erro: `Esquema ${objeto.esquema} incompatível (esperado ${ESQUEMA}).` };
    }
    if (objeto.versaoFeatures !== VERSAO_FEATURES) {
      return {
        ok: false,
        erro:
          `Modelo gerado com a versão ${objeto.versaoFeatures} da normalização; ` +
          `esta extensão usa a ${VERSAO_FEATURES}. As amostras não são comparáveis.`
      };
    }
    if (!objeto.classes || typeof objeto.classes !== 'object') {
      return { ok: false, erro: 'Arquivo sem o bloco de classes.' };
    }

    const classes = {};
    let contagem = 0;
    for (const [nome, amostras] of Object.entries(objeto.classes)) {
      if (!ehClasseValida(nome)) return { ok: false, erro: `Classe desconhecida no arquivo: ${nome}.` };
      if (!Array.isArray(amostras)) return { ok: false, erro: `Classe ${nome} não traz uma lista.` };
      for (const a of amostras) {
        if (!Array.isArray(a) || a.length !== DIMENSOES) {
          return { ok: false, erro: `Classe ${nome} tem amostra com dimensão ≠ ${DIMENSOES}.` };
        }
        if (!a.every(Number.isFinite)) return { ok: false, erro: `Classe ${nome} tem valor não numérico.` };
      }
      if (amostras.length > 0) {
        classes[nome] = amostras.slice(-AMOSTRAS_MAXIMAS);
        contagem += classes[nome].length;
      }
    }
    if (contagem === 0) return { ok: false, erro: 'O arquivo não contém nenhuma amostra.' };

    return {
      ok: true,
      classes,
      contagem,
      mao: objeto.mao === 'esquerda' ? 'esquerda' : 'direita',
      tauAbs: Number.isFinite(objeto.tauAbs) ? objeto.tauAbs : null
    };
  }

  /**
   * @param {object} objeto conteúdo do arquivo
   * @param {'substituir'|'mesclar'} modo
   */
  async importar(objeto, modo = 'substituir') {
    const v = SignModelStore.validarArquivo(objeto);
    if (!v.ok) throw new Error(v.erro);

    if (modo === 'substituir') await this.limpar();

    const indice = await this._lerIndice();
    indice.mao = v.mao;
    if (v.tauAbs !== null) indice.tauAbs = v.tauAbs;

    const escritas = {};
    for (const [nome, novas] of Object.entries(v.classes)) {
      let amostras = novas;
      if (modo === 'mesclar') {
        const { [PREFIXO_CLASSE + nome]: reg } = await this._get(PREFIXO_CLASSE + nome);
        amostras = [...(reg?.amostras || []), ...novas].slice(-AMOSTRAS_MAXIMAS);
      }
      escritas[PREFIXO_CLASSE + nome] = { classe: nome, amostras };
      indice.contagem[nome] = amostras.length;
    }

    await this.area.set(escritas);
    await this._gravarIndice(indice);
    return { classes: Object.keys(v.classes).length, amostras: v.contagem };
  }
}
