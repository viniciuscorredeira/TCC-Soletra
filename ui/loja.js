/**
 * Soletra — loja mínima de estado, lida pelo React via useSyncExternalStore.
 *
 * O CameraController e o SignRecognizer já entregam o estado como snapshots por
 * callback; a loja só guarda a última e avisa quem desenha. Assim a regra de
 * negócio continua fora dos componentes, como era com o render(snapshot).
 */
import { useSyncExternalStore } from 'react';

/**
 * @template T
 * @param {T} inicial
 */
export function criarLoja(inicial) {
  let valor = inicial;
  const ouvintes = new Set();

  return {
    /** @returns {T} */
    ler: () => valor,
    /** @param {T | ((anterior: T) => T)} novo */
    definir(novo) {
      valor = typeof novo === 'function' ? novo(valor) : novo;
      for (const ouvinte of ouvintes) ouvinte();
    },
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    }
  };
}

const identidade = (v) => v;

/**
 * O seletor deixa um componente depender de um pedaço só da loja: o
 * reconhecedor emite a ~15 Hz, e quem lê um booleano dele não precisa
 * redesenhar a cada quadro. O seletor deve devolver um valor primitivo (ou o
 * próprio objeto da loja), senão cada leitura pareceria uma mudança.
 * @template T, R
 * @param {{ler: () => T, assinar: Function}} loja
 * @param {(valor: T) => R} [seletor]
 * @returns {R}
 */
export function usarLoja(loja, seletor = identidade) {
  return useSyncExternalStore(loja.assinar, () => seletor(loja.ler()));
}
