/**
 * Soletra — migração das chaves de armazenamento.
 *
 * O produto se chamava "RVL Libras" e prefixava tudo com `rvl.`. Renomear as
 * chaves sem mais nada não daria erro nenhum: as amostras continuariam no disco,
 * só que sob nomes que ninguém mais lê — e o usuário abriria o painel para
 * descobrir que perdeu o modelo que levou minutos treinando.
 *
 * Esta rotina roda uma vez, na abertura do painel, antes de qualquer leitura.
 */

export const PREFIXO_ANTIGO = 'rvl.';
export const PREFIXO = 'soletra.';

/**
 * Copia toda chave `rvl.*` para `soletra.*` e remove a antiga.
 *
 * Lê o storage inteiro com `get(null)` em vez de consultar o índice do modelo:
 * assim pega também a chave de cada classe treinada — uma por letra — sem
 * precisar saber de antemão quais existem.
 *
 * É idempotente e nunca sobrescreve uma chave nova já existente, para que rodar
 * de novo (ou rodar em paralelo com outra aba do painel) não destrua dados mais
 * recentes com resíduo antigo.
 *
 * @param {chrome.storage.StorageArea} area
 * @returns {Promise<{migradas: number, ignoradas: number}>}
 */
export async function migrarChaves(area) {
  if (!area?.get) return { migradas: 0, ignoradas: 0 };

  let tudo;
  try {
    tudo = (await area.get(null)) || {};
  } catch {
    // Storage indisponível não pode impedir o painel de abrir.
    return { migradas: 0, ignoradas: 0 };
  }

  const antigas = Object.keys(tudo).filter((k) => k.startsWith(PREFIXO_ANTIGO));
  if (antigas.length === 0) return { migradas: 0, ignoradas: 0 };

  const novas = {};
  const remover = [];
  let ignoradas = 0;

  for (const chave of antigas) {
    const destino = PREFIXO + chave.slice(PREFIXO_ANTIGO.length);
    if (destino in tudo) {
      // Já existe versão nova: ela vence, e a antiga é só resíduo.
      ignoradas++;
    } else {
      novas[destino] = tudo[chave];
    }
    remover.push(chave);
  }

  // Grava antes de apagar: se o navegador for fechado no meio, o pior caso é
  // ficar com as duas cópias, e não com nenhuma.
  if (Object.keys(novas).length > 0) await area.set(novas);
  await area.remove(remover);

  return { migradas: Object.keys(novas).length, ignoradas };
}
