/**
 * RVL Libras — normalização dos landmarks da mão em vetor de características.
 *
 * Transforma os 21 pontos do MediaPipe num vetor de 63 números comparável entre
 * usuários, distâncias da câmera e resoluções. É o módulo mais delicado do
 * projeto: um erro aqui não quebra nada visivelmente, só derruba a acurácia de
 * forma silenciosa. Daí o VERSAO_FEATURES — mudou a fórmula, as amostras
 * gravadas antes viram lixo geometricamente incompatível e precisam ser
 * recusadas no carregamento, não reinterpretadas.
 */

/**
 * Incremente ao mudar QUALQUER passo da normalização. O sign-model-store recusa
 * carregar modelos gravados com versão diferente.
 */
export const VERSAO_FEATURES = 1;

export const DIMENSOES = 63;

/**
 * Punho + articulações metacarpofalângicas. É o segmento rígido da mão: serve
 * de âncora de translação e de escala porque não muda com a flexão dos dedos.
 */
const PALMA = [0, 5, 9, 13, 17];

/** Índices do punho e do MCP do dedo médio — definem o eixo da palma. */
const PUNHO = 0;
const MCP_MEDIO = 9;

/**
 * Peso do eixo z no vetor final. O z de câmera monocular é uma estimativa
 * ruidosa; entrar com peso cheio contamina as 63 dimensões. Zero o desliga.
 */
const PESO_Z = 0.3;

const ESCALA_MINIMA = 1e-6;

/**
 * @param {Array<{x:number,y:number,z:number}>} landmarks os 21 pontos do MediaPipe
 * @param {object} opcoes
 * @param {number} opcoes.largura  video.videoWidth
 * @param {number} opcoes.altura   video.videoHeight
 * @param {'direita'|'esquerda'} [opcoes.mao] mão dominante declarada pelo usuário
 * @param {'nenhuma'|'plano'} [opcoes.rotacao] normalização de rotação (ver abaixo)
 * @returns {Float32Array|null} 63 números, ou null se o quadro for inaproveitável
 */
export function extrairFeatures(landmarks, { largura, altura, mao = 'direita', rotacao = 'nenhuma' } = {}) {
  if (!Array.isArray(landmarks) || landmarks.length !== 21) return null;
  if (!(largura > 0) || !(altura > 0)) return null;

  // Passo 1 — isotropia. O MediaPipe normaliza x pela largura e y pela altura,
  // independentemente (e z na escala de x). Em 1280×720 isso estica o eixo
  // horizontal em 1,78× e distorce toda distância euclidiana; pior, o modelo
  // treinado numa resolução deixa de valer em outra. Converter tudo para
  // unidades de altura da imagem resolve os dois problemas de uma vez.
  const a = largura / altura;
  const espelhar = mao === 'esquerda' ? -1 : 1;

  const u = new Float64Array(21);
  const v = new Float64Array(21);
  const w = new Float64Array(21);

  for (let i = 0; i < 21; i++) {
    const p = landmarks[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    const z = Number.isFinite(p.z) ? p.z : 0;

    // Passo 2 — quiralidade. Espelhar o eixo horizontal leva a mão esquerda ao
    // referencial canônico da direita, e é o que permite que um modelo treinado
    // por um destro sirva a um canhoto sem retreinar nada.
    u[i] = p.x * a * espelhar;
    v[i] = p.y;
    w[i] = z * a * espelhar;
  }

  // Passo 3 — translação. Centroide da palma, não o punho isolado: o punho
  // treme e arrasta o vetor inteiro junto.
  let cu = 0, cv = 0, cw = 0;
  for (const i of PALMA) { cu += u[i]; cv += v[i]; cw += w[i]; }
  cu /= PALMA.length; cv /= PALMA.length; cw /= PALMA.length;

  for (let i = 0; i < 21; i++) { u[i] -= cu; v[i] -= cv; w[i] -= cw; }

  // Passo 4 — escala. Raio RMS só da palma e só em 2D. Usar os 21 pontos
  // normalizaria a extensão dos dedos, que é justamente o sinal que queremos
  // medir: punho fechado e mão aberta acabariam com escalas diferentes.
  let soma = 0;
  for (const i of PALMA) soma += u[i] * u[i] + v[i] * v[i];
  const s = Math.sqrt(soma / PALMA.length);
  if (!(s > ESCALA_MINIMA)) return null;

  for (let i = 0; i < 21; i++) { u[i] /= s; v[i] /= s; w[i] /= s; }

  // Passo 5 — rotação, desligada por padrão. A orientação da palma é um dos
  // parâmetros fonológicos da língua de sinais: normalizá-la apaga informação
  // que distingue configurações. Fica como flag de ablação para medir, não como
  // padrão.
  if (rotacao === 'plano') {
    const theta = Math.atan2(v[MCP_MEDIO] - v[PUNHO], u[MCP_MEDIO] - u[PUNHO]) + Math.PI / 2;
    const cos = Math.cos(theta);
    const sen = Math.sin(theta);
    for (let i = 0; i < 21; i++) {
      const ui = u[i];
      const vi = v[i];
      u[i] = ui * cos + vi * sen;
      v[i] = -ui * sen + vi * cos;
    }
  }

  const f = new Float32Array(DIMENSOES);
  for (let i = 0; i < 21; i++) {
    f[i * 3] = u[i];
    f[i * 3 + 1] = v[i];
    f[i * 3 + 2] = w[i] * PESO_Z;
  }

  for (let i = 0; i < DIMENSOES; i++) if (!Number.isFinite(f[i])) return null;
  return f;
}

/** Distância euclidiana entre dois vetores de características. */
export function distancia(a, b) {
  let soma = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    soma += d * d;
  }
  return Math.sqrt(soma);
}

/** Arredonda para gravação: 4 casas bastam e reduzem o JSON à metade. */
export function compactar(vetor) {
  return Array.from(vetor, (n) => Math.round(n * 1e4) / 1e4);
}
