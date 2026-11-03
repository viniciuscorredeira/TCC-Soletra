/**
 * Soletra — canal de observação.
 *
 * Um ponto por onde um módulo publica o que acontece por dentro (um quadro
 * processado, por exemplo) para quem quiser assinar, sem saber quem assina.
 * Ferramentas de diagnóstico e medição leem por aqui; o fluxo normal não
 * depende disso.
 *
 * Sem assinantes, o custo tem de ser praticamente zero. Por isso quem publica
 * confere `ativo` ANTES de montar o objeto do evento:
 *
 *   if (canal.ativo) canal.emitir({ ... });
 *
 * Um assinante que lança não derruba quem publica nem os outros assinantes.
 */
export function criarCanal() {
  const assinantes = new Set();

  return {
    /** Se há alguém assinando. */
    get ativo() {
      return assinantes.size > 0;
    },

    /**
     * @param {(evento: any) => void} assinante
     * @returns {() => void} cancela a assinatura
     */
    assinar(assinante) {
      assinantes.add(assinante);
      return () => assinantes.delete(assinante);
    },

    emitir(evento) {
      for (const assinante of assinantes) {
        try {
          assinante(evento);
        } catch (err) {
          console.warn('[Soletra] assinante de canal falhou:', err);
        }
      }
    }
  };
}
