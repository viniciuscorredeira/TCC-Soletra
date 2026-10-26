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
 * 2 → limiar pela separação entre classes + teste de razão (encolhia conforme
 *     classes eram adicionadas: apertava justamente com o alfabeto completo)
 * 3 → limiar constante (LIMIAR_DISTANCIA_PADRAO), elevado só pela dispersão
 *     interna, + teste de razão — ver calibrarTauAbs em sign-classifier
 */
export const VERSAO_CALIBRACAO = 3;
export const CHAVE_INDICE = 'soletra.modelo.v1.indice';
export const PREFIXO_CLASSE = 'soletra.modelo.v1.classe.';

/**
 * Amostras vindas do modelo padrão empacotado ficam em chaves próprias, ao lado
 * das pessoais e não misturadas a elas. É o que permite "voltar ao padrão" numa
 * letra descartando só o que o usuário gravou, e garante que, no teto de
 * amostras, quem sai primeiro é a amostra genérica — não a da mão do usuário.
 *
 * Não muda o ESQUEMA: um modelo gravado antes disto não tem chave de padrão e
 * continua válido, com todas as amostras contadas como pessoais.
 */
export const PREFIXO_PADRAO = 'soletra.modelo.v1.padrao.';
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
/** Teto duro: ao exceder, cede primeiro o padrão e depois a pessoal mais antiga. */
export const AMOSTRAS_MAXIMAS = 100;
/**
 * Quantas amostras do modelo pronto entram por classe. Metade do teto: o padrão
 * já reconhece bem com isso, e sobram 50 lugares para o usuário reforçar a
 * letra antes que qualquer amostra precise ceder.
 */
export const AMOSTRAS_PADRAO = 50;

/**
 * `n` itens espalhados pela lista, não os últimos: as amostras de uma captura
 * vêm em sequência, e pegar só o fim descartaria as variações do começo.
 */
function espalhar(lista, n) {
  if (n >= lista.length) return lista;
  return Array.from({ length: n }, (_, i) => lista[Math.floor((i * lista.length) / n)]);
}

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
   * `classes` junta padrão e pessoais — o classificador não distingue a origem.
   * `origem` traz a contagem separada, para a UI.
   * @returns {Promise<{indice: object|null, classes: Record<string, number[][]>,
   *   origem: Record<string, {padrao: number, pessoal: number}>, incompativel: object|null}>}
   */
  async carregar() {
    const { [CHAVE_INDICE]: indice } = await this._get(CHAVE_INDICE);
    if (!indice) return { indice: null, classes: {}, origem: {}, incompativel: null };

    // A checagem que evita o bug mais caro do projeto: mudar a normalização e
    // seguir usando amostras antigas não dá erro — dá queda de acurácia sem
    // causa aparente, tipicamente perto da entrega. Recusar é melhor que
    // reinterpretar.
    if (indice.versaoFeatures !== VERSAO_FEATURES || indice.esquema !== ESQUEMA) {
      return {
        indice: null,
        classes: {},
        origem: {},
        incompativel: {
          versaoGravada: indice.versaoFeatures,
          versaoAtual: VERSAO_FEATURES,
          esquemaGravado: indice.esquema
        }
      };
    }

    const nomes = [
      ...new Set([...Object.keys(indice.contagem || {}), ...Object.keys(indice.contagemPadrao || {})])
    ];
    const chaves = nomes.flatMap((c) => [PREFIXO_PADRAO + c, PREFIXO_CLASSE + c]);
    const bruto = await this._get(chaves);
    const validas = (reg) => (reg?.amostras || []).filter((a) => a?.length === DIMENSOES);

    const classes = {};
    const origem = {};
    for (const nome of nomes) {
      const padrao = validas(bruto[PREFIXO_PADRAO + nome]);
      const pessoais = validas(bruto[PREFIXO_CLASSE + nome]);
      if (padrao.length + pessoais.length === 0) continue;
      classes[nome] = [...padrao, ...pessoais];
      origem[nome] = { padrao: padrao.length, pessoal: pessoais.length };
    }
    return { indice, classes, origem, incompativel: null };
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
      contagem: {},
      contagemPadrao: {}
    };
  }

  async _gravarIndice(indice) {
    indice.atualizadoEm = new Date().toISOString();
    await this.area.set({ [CHAVE_INDICE]: indice });
    return indice;
  }

  /**
   * Grava uma amostra pessoal. Uma chave por classe, não uma chave única para o
   * modelo inteiro: com chave única, cada amostra capturada reescreveria ~370 KB.
   *
   * O teto vale para a classe inteira (padrão + pessoais). Ao excedê-lo, sai
   * primeiro a amostra padrão mais antiga: quem reforça uma letra está dizendo
   * que o genérico não serve para a mão dele, e o modelo vai convergindo para a
   * mão do usuário sem que ele precise apagar nada.
   *
   * @returns {Promise<number>} total de amostras da classe depois da gravação
   */
  async adicionarAmostra(classe, vetor, { mao = 'direita' } = {}) {
    if (!ehClasseValida(classe)) throw new Error(`Classe desconhecida: ${classe}`);
    if (!vetor || vetor.length !== DIMENSOES) throw new Error('Vetor com dimensão inesperada.');

    const indice = await this._lerIndice();
    indice.mao = mao;
    indice.contagemPadrao ||= {};

    const chave = PREFIXO_CLASSE + classe;
    const chavePadrao = PREFIXO_PADRAO + classe;
    const { [chave]: reg, [chavePadrao]: regPadrao } = await this._get([chave, chavePadrao]);
    const amostras = reg?.amostras || [];
    const padrao = regPadrao?.amostras || [];

    amostras.push(compactar(vetor));
    let padraoMudou = false;
    while (amostras.length + padrao.length > AMOSTRAS_MAXIMAS) {
      if (padrao.length > 0) {
        padrao.shift();
        padraoMudou = true;
      } else {
        amostras.shift();
      }
    }

    const escritas = { [chave]: { classe, amostras } };
    if (padraoMudou) {
      if (padrao.length > 0) {
        escritas[chavePadrao] = { classe, amostras: padrao };
        indice.contagemPadrao[classe] = padrao.length;
      } else {
        await this.area.remove(chavePadrao);
        delete indice.contagemPadrao[classe];
      }
    }

    await this.area.set(escritas);
    indice.contagem[classe] = amostras.length;
    await this._gravarIndice(indice);

    return amostras.length + padrao.length;
  }

  /** Apaga a classe inteira: amostras pessoais e as do padrão. */
  async removerClasse(classe) {
    const indice = await this._lerIndice();
    delete indice.contagem[classe];
    if (indice.contagemPadrao) delete indice.contagemPadrao[classe];
    await this.area.remove([PREFIXO_CLASSE + classe, PREFIXO_PADRAO + classe]);
    await this._gravarIndice(indice);
  }

  /**
   * Descarta só o que o usuário gravou numa classe, mantendo as amostras do
   * padrão — o "desfazer" de um reforço que piorou a letra.
   */
  async restaurarClasse(classe) {
    const indice = await this._lerIndice();
    delete indice.contagem[classe];
    await this.area.remove(PREFIXO_CLASSE + classe);
    await this._gravarIndice(indice);
  }

  /**
   * Tira as amostras do padrão de todas as classes e mantém as pessoais — o
   * "treinar do zero" de quem começou com o modelo pronto já instalado.
   */
  async removerPadrao() {
    const indice = await this._lerIndice();
    const chaves = Object.keys(indice.contagemPadrao || {}).map((c) => PREFIXO_PADRAO + c);
    if (chaves.length > 0) await this.area.remove(chaves);
    indice.contagemPadrao = {};
    await this._gravarIndice(indice);
  }

  /**
   * Instala (ou reinstala) o modelo padrão. Substitui as amostras padrão que
   * existirem, mas não toca nas pessoais: reinstalar o padrão não pode custar o
   * treino que o usuário fez por cima dele.
   *
   * A mão do arquivo é ignorada de propósito. As features já espelham a mão
   * esquerda (sign-features), então o padrão serve às duas; a mão gravada no
   * índice é a do usuário, e é ela que precisa sobreviver.
   *
   * @returns {Promise<{classes: number, amostras: number}>}
   */
  async instalarPadrao(objeto) {
    const v = SignModelStore.validarArquivo(objeto);
    if (!v.ok) throw new Error(v.erro);

    const indice = await this._lerIndice();
    const antigas = Object.keys(indice.contagemPadrao || {}).map((c) => PREFIXO_PADRAO + c);
    if (antigas.length > 0) await this.area.remove(antigas);
    indice.contagemPadrao = {};

    const pessoais = await this._get(Object.keys(v.classes).map((c) => PREFIXO_CLASSE + c));
    const escritas = {};
    let total = 0;
    for (const [nome, amostras] of Object.entries(v.classes)) {
      // No máximo AMOSTRAS_PADRAO por classe, e o teto da classe também vale
      // aqui — com as pessoais tendo preferência.
      const nPessoais = pessoais[PREFIXO_CLASSE + nome]?.amostras?.length || 0;
      const cabem = Math.max(0, Math.min(AMOSTRAS_PADRAO, AMOSTRAS_MAXIMAS - nPessoais));
      if (cabem === 0) continue;
      const usadas = espalhar(amostras, cabem);
      escritas[PREFIXO_PADRAO + nome] = { classe: nome, amostras: usadas };
      indice.contagemPadrao[nome] = usadas.length;
      total += usadas.length;
    }

    await this.area.set(escritas);
    await this._gravarIndice(indice);
    return { classes: Object.keys(indice.contagemPadrao).length, amostras: total };
  }

  /** Apaga o modelo inteiro — o botão que atende o direito de eliminação. */
  async limpar() {
    const indice = await this._lerIndice();
    const chaves = [
      ...Object.keys(indice.contagem || {}).map((c) => PREFIXO_CLASSE + c),
      ...Object.keys(indice.contagemPadrao || {}).map((c) => PREFIXO_PADRAO + c)
    ];
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
    const remover = [];
    indice.contagemPadrao ||= {};
    for (const [nome, novas] of Object.entries(v.classes)) {
      let amostras = novas;
      if (modo === 'mesclar') {
        const chavePadrao = PREFIXO_PADRAO + nome;
        const { [PREFIXO_CLASSE + nome]: reg, [chavePadrao]: regPadrao } =
          await this._get([PREFIXO_CLASSE + nome, chavePadrao]);
        amostras = [...(reg?.amostras || []), ...novas].slice(-AMOSTRAS_MAXIMAS);

        // Mesma regra de adicionarAmostra: no teto, cede o padrão.
        const padrao = regPadrao?.amostras || [];
        const cabem = AMOSTRAS_MAXIMAS - amostras.length;
        if (padrao.length > cabem) {
          if (cabem > 0) {
            escritas[chavePadrao] = { classe: nome, amostras: padrao.slice(-cabem) };
            indice.contagemPadrao[nome] = cabem;
          } else {
            remover.push(chavePadrao);
            delete indice.contagemPadrao[nome];
          }
        }
      }
      escritas[PREFIXO_CLASSE + nome] = { classe: nome, amostras };
      indice.contagem[nome] = amostras.length;
    }

    if (remover.length > 0) await this.area.remove(remover);
    await this.area.set(escritas);
    await this._gravarIndice(indice);
    return { classes: Object.keys(v.classes).length, amostras: v.contagem };
  }
}
