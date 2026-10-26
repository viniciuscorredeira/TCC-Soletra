/**
 * Soletra — o formato da tinta na troca de tema (ui/transicao-tema.js).
 *
 * Fica num módulo à parte, sem React nem DOM, para ser testado em Node puro
 * como o resto da lógica.
 */

/** Pontos do contorno da mancha. Todos os quadros usam o mesmo número, senão o navegador não interpola. */
const PONTOS = 72;

/**
 * Quadros do recorte da tinta, em pixels da janela.
 * @param {number} x origem horizontal (centro do botão)
 * @param {number} y origem vertical
 * @param {number} alcance distância da origem ao canto mais longe da janela
 * @param {() => number} [sortear] fonte de aleatoriedade em [0, 1), trocável nos testes
 * @returns {Keyframe[]}
 */
export function quadrosDoRespingo(x, y, alcance, sortear = Math.random) {
  // Ondulação suave do contorno, com fases sorteadas para cada troca ser diferente.
  const fases = [sortear() * 6, sortear() * 6, sortear() * 6];
  // As gotas: pontas compridas e estreitas em ângulos sorteados.
  const gotas = Array.from({ length: 5 + Math.floor(sortear() * 3) }, () => ({
    angulo: sortear() * Math.PI * 2,
    tamanho: 0.18 + sortear() * 0.3,
    largura: 0.05 + sortear() * 0.07
  }));

  const contorno = (raio, intensidade) => {
    const pontos = [];
    for (let i = 0; i < PONTOS; i++) {
      const a = (i / PONTOS) * Math.PI * 2;
      let f = 1 + intensidade * (
        0.10 * Math.sin(3 * a + fases[0]) +
        0.07 * Math.sin(5 * a + fases[1]) +
        0.05 * Math.sin(11 * a + fases[2])
      );
      for (const g of gotas) {
        let d = Math.abs(a - g.angulo);
        d = Math.min(d, Math.PI * 2 - d);
        f += intensidade * g.tamanho * Math.exp(-((d / g.largura) ** 2));
      }
      const px = (x + raio * f * Math.cos(a)).toFixed(1);
      const py = (y + raio * f * Math.sin(a)).toFixed(1);
      pontos.push(`${px}px ${py}px`);
    }
    return `polygon(${pontos.join(', ')})`;
  };

  // Começa como um pingo, abre com as gotas bem marcadas e termina folgado o
  // bastante para que até o recorte mais fundo passe dos cantos.
  return [
    { clipPath: contorno(1, 1), offset: 0 },
    { clipPath: contorno(alcance * 0.45, 1), offset: 0.45 },
    { clipPath: contorno(alcance * 1.5, 0.6), offset: 1 }
  ];
}
