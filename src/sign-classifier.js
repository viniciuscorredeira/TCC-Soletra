/**
 * Soletra — classificador KNN sobre vetores de características.
 *
 * KNN em vez de rede neural porque o modelo é treinado pelo próprio usuário,
 * no navegador, com ~20 amostras por classe: não há dados nem tempo para
 * treinar pesos, e o KNN acerta esse regime melhor do que qualquer coisa que
 * precise de otimização. O preço é inferência O(amostras), que a 15 Hz sobre
 * ~600 vetores de 63 dimensões custa frações de milissegundo.
 */
import { distancia, DIMENSOES } from './sign-features.js';

export const PADROES_CLASSIFICADOR = {
  k: 5,
  /** Multiplicador do limiar de rejeição — o "rigor" exposto na UI. */
  rigor: 1.0,
  /**
   * Teste de razão: rejeita quando a distância à classe vencedora passa desta
   * fração da distância à concorrente mais próxima.
   *
   * Serve apenas para descartar empates — gestos genuinamente a meio caminho
   * entre duas classes. Não pode ser apertado: num alfabeto manual as classes
   * são naturalmente parecidas (M, N, S e A são todas punhos), e uma resposta
   * CORRETA costuma vir com razão 0,83–0,93. Medido: a 0,80 o classificador
   * acertava 95% e o portão descartava 85% desses acertos.
   *
   * Quem garante a segurança é o limiar de distância, não este: a rejeição de
   * mão relaxada e de gesto não treinado fica em 100% para qualquer valor aqui.
   * Este só desempata entre duas classes treinadas, então fica frouxo — quem
   * quiser mais precisão usa o controle de rigor.
   */
  razaoMax: 0.97
};

/** Teto do teste de razão: acima disso não há discriminação nenhuma. */
const RAZAO_TETO = 0.99;

/**
 * Limiar de distância padrão, em unidades de raio da palma.
 *
 * Constante, e isso é possível justamente porque sign-features normaliza por
 * posição, escala e proporção da imagem: o espaço de 63 dimensões tem escala
 * física fixa, a mesma em qualquer câmera ou resolução. Medido em modelo
 * sintético com 5, 10 e 21 classes: a consulta legítima fica em p95 ≈ 0,75
 * — estável, porque depende da variação da mão do usuário e não do modelo —
 * enquanto uma mão relaxada ou um gesto não treinado ficam acima de 2,1. O
 * valor mora no meio dessa folga.
 */
export const LIMIAR_DISTANCIA_PADRAO = 1.3;

/** Folga sobre a dispersão interna, usada como piso do limiar. */
const FATOR_DISPERSAO = 5.0;

/** Abaixo disto o reconhecimento não consegue discriminar; a UI avisa. */
export const CLASSES_MINIMAS = 2;

const EPSILON = 1e-6;

/** Quantil sobre um array já ordenado, por interpolação linear. */
function quantil(ordenado, p) {
  if (ordenado.length === 0) return NaN;
  if (ordenado.length === 1) return ordenado[0];
  const pos = (ordenado.length - 1) * p;
  const base = Math.floor(pos);
  const resto = pos - base;
  const proximo = ordenado[base + 1] ?? ordenado[base];
  return ordenado[base] + (proximo - ordenado[base]) * resto;
}

/**
 * Calibra o limiar de distância a partir do modelo.
 *
 * O resultado é o PADRÃO constante, elevado apenas se as amostras do usuário
 * forem mais dispersas que o previsto. Duas tentativas anteriores erraram, e
 * vale registrar por quê:
 *
 * 1. Dispersão INTERNA das classes × 2 — mede o tremor do usuário durante a
 *    captura, com a mão parada e amostras a 150 ms de distância. Não tem
 *    relação com o quanto a pose varia ao refazer o sinal depois: o limiar saía
 *    ~3× menor que a distância real de consulta e rejeitava tudo.
 * 2. Separação ENTRE classes × 1,2 — encolhe conforme classes são adicionadas
 *    (medido: 0,66 com 5 classes, 0,32 com 21), apertando o limiar justamente
 *    quando o alfabeto fica completo. Anti-correlacionado com o necessário.
 *
 * O que é de fato estável é a distância da consulta legítima (p95 ≈ 0,75 com 5,
 * 10 ou 21 classes), porque depende da mão do usuário e não do modelo — e
 * porque sign-features normaliza a escala. Daí a constante.
 *
 * @param {Record<string, Array<ArrayLike<number>>>} classes
 * @returns {number} limiar de distância
 */
export function calibrarTauAbs(classes, { padrao = LIMIAR_DISTANCIA_PADRAO } = {}) {
  const nomes = Object.keys(classes || {}).filter((n) => classes[n]?.length > 0);
  if (nomes.length === 0) return Infinity;

  const intra = [];
  for (const nome of nomes) {
    const amostras = classes[nome];
    if (amostras.length < 2) continue;
    for (let i = 0; i < amostras.length; i++) {
      let melhor = Infinity;
      for (let j = 0; j < amostras.length; j++) {
        if (i === j) continue;
        const d = distancia(amostras[i], amostras[j]);
        if (d < melhor) melhor = d;
      }
      if (Number.isFinite(melhor)) intra.push(melhor);
    }
  }

  if (intra.length === 0) return padrao;

  // A dispersão interna serve só de piso: um treino feito com a mão bem
  // instável indica um usuário que varia mais, e o limiar acompanha. Ela nunca
  // aperta o limiar abaixo do padrão, que foi o erro da primeira tentativa.
  intra.sort((a, b) => a - b);
  return Math.max(padrao, quantil(intra, 0.9) * FATOR_DISPERSAO);
}

export class SignClassifier {
  /**
   * @param {object} [opcoes]
   * @param {number} [opcoes.k] vizinhos considerados (ímpar evita empate)
   * @param {number} [opcoes.tauAbs] limiar de rejeição; Infinity aceita tudo
   * @param {number} [opcoes.rigor] multiplicador de tauAbs vindo da UI
   */
  constructor({
    k = PADROES_CLASSIFICADOR.k,
    tauAbs = Infinity,
    rigor = PADROES_CLASSIFICADOR.rigor,
    razaoMax = PADROES_CLASSIFICADOR.razaoMax
  } = {}) {
    this.k = k;
    this.tauAbs = tauAbs;
    this.rigor = rigor;
    this.razaoMax = razaoMax;
    /** @type {Array<{classe: string, vetor: ArrayLike<number>}>} */
    this.amostras = [];
    /** @type {string[]} */
    this.classes = [];
  }

  /**
   * @param {Record<string, Array<ArrayLike<number>>>} classes mapa classe → amostras
   * @param {object} [opcoes] `tauAbs` explícito; senão é calibrado do próprio modelo
   */
  carregar(classes, { tauAbs } = {}) {
    this.amostras = [];
    this.classes = [];

    for (const [classe, amostras] of Object.entries(classes || {})) {
      if (!Array.isArray(amostras) || amostras.length === 0) continue;
      this.classes.push(classe);
      for (const vetor of amostras) {
        if (vetor?.length === DIMENSOES) this.amostras.push({ classe, vetor });
      }
    }

    this.classes.sort();
    this.tauAbs = tauAbs ?? calibrarTauAbs(classes || {});
    return this;
  }

  get vazio() {
    return this.amostras.length === 0;
  }

  /** Conjunto ativo: restringe a classificação a um subconjunto das classes. */
  filtrarPor(classesPermitidas) {
    this._permitidas = classesPermitidas ? new Set(classesPermitidas) : null;
    return this;
  }

  /** Limiar de razão efetivo, já com o rigor da UI aplicado. */
  get razaoEfetiva() {
    return Math.min(RAZAO_TETO, this.razaoMax * this.rigor);
  }

  /**
   * @param {ArrayLike<number>} vetor
   * @returns {{classe: string|null, distanciaMin: number, distanciaOutra: number,
   *            razao: number, confianca: number, motivo: string|null}}
   */
  classificar(vetor) {
    const vazio = {
      classe: null,
      distanciaMin: Infinity,
      distanciaOutra: Infinity,
      razao: 1,
      confianca: 0,
      motivo: 'sem-modelo'
    };
    if (!vetor || vetor.length !== DIMENSOES || this.vazio) return vazio;

    // k vizinhos mais próximos por inserção ordenada: com k ≤ 9 sai mais barato
    // do que ordenar as ~600 amostras inteiras a cada quadro. Na mesma varredura
    // guardamos a menor distância por classe, que alimenta o teste de razão.
    const vizinhos = [];
    const melhorPorClasse = new Map();

    for (const amostra of this.amostras) {
      if (this._permitidas && !this._permitidas.has(amostra.classe)) continue;
      const d = distancia(vetor, amostra.vetor);

      const atual = melhorPorClasse.get(amostra.classe);
      if (atual === undefined || d < atual) melhorPorClasse.set(amostra.classe, d);

      if (vizinhos.length < this.k) {
        vizinhos.push({ d, classe: amostra.classe });
        vizinhos.sort((a, b) => a.d - b.d);
      } else if (d < vizinhos[vizinhos.length - 1].d) {
        vizinhos[vizinhos.length - 1] = { d, classe: amostra.classe };
        vizinhos.sort((a, b) => a.d - b.d);
      }
    }

    if (vizinhos.length === 0) return vazio;

    // Voto ponderado por 1/(d+ε): um vizinho colado pesa mais que três distantes,
    // o que importa nas fronteiras entre configurações parecidas.
    const pesos = new Map();
    let total = 0;
    for (const { d, classe } of vizinhos) {
      const peso = 1 / (d + EPSILON);
      pesos.set(classe, (pesos.get(classe) || 0) + peso);
      total += peso;
    }

    let vencedora = null;
    let melhorPeso = -1;
    for (const [classe, peso] of pesos) {
      if (peso > melhorPeso) { melhorPeso = peso; vencedora = classe; }
    }

    const confianca = total > 0 ? melhorPeso / total : 0;
    const distanciaMin = melhorPorClasse.get(vencedora) ?? vizinhos[0].d;

    // Concorrente mais próxima entre as OUTRAS classes: é contra ela que o
    // teste de razão mede, e é o que torna o critério independente de escala.
    let distanciaOutra = Infinity;
    for (const [classe, d] of melhorPorClasse) {
      if (classe !== vencedora && d < distanciaOutra) distanciaOutra = d;
    }

    const razao = Number.isFinite(distanciaOutra) && distanciaOutra > 0
      ? distanciaMin / distanciaOutra
      : 0; // classe única treinada: não há com o que comparar

    const base = { distanciaMin, distanciaOutra, razao, confianca };

    if (razao > this.razaoEfetiva) {
      return { ...base, classe: null, motivo: 'ambiguo' };
    }
    // Rede de segurança: um gesto longe de tudo pode ainda assim estar bem mais
    // perto de uma classe que das outras e passar no teste de razão.
    if (distanciaMin > this.tauAbs * this.rigor) {
      return { ...base, classe: null, motivo: 'distante' };
    }
    return { ...base, classe: vencedora, motivo: null };
  }

  /**
   * Proximidade em [0,1] para a barra da UI. Baseada na razão, não na distância
   * absoluta: assim a barra significa "o quanto este gesto se destaca das outras
   * classes", que é o mesmo critério usado para aceitar ou rejeitar — a barra
   * cheia e o sinal reconhecido passam a ser a mesma coisa para o usuário.
   */
  proximidade(resultado) {
    const limiar = this.razaoEfetiva;
    const razao = typeof resultado === 'object' ? resultado?.razao : resultado;
    if (!Number.isFinite(razao) || !(limiar > 0)) return 0;
    return Math.min(1, Math.max(0, (limiar - razao) / limiar));
  }
}
