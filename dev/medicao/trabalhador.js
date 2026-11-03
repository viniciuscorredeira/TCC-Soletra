/**
 * Soletra (modo dev) — Web Worker que mede o modelo.
 *
 * A medição monta dezenas de classificadores e classifica milhares de
 * amostras: segundos de CPU que, no painel, congelariam o vídeo e os botões.
 * Aqui ela roda fora da página, com o mesmo código do tools/medir-modelo.mjs, e
 * avisa o progresso a cada treino montado.
 *
 * Entrada: {modelo, comparar?, rotuloComparar?, blocos}. Saída: mensagens
 * {tipo: 'progresso' | 'pronto' | 'erro'}. Os modelos chegam como os
 * exportados pelo painel e passam pela mesma validação da importação.
 */
import { compararModelos, medirModelo, validarModelo } from '../../tools/medicao-modelo.js';

self.onmessage = async ({ data }) => {
  const partes = data.comparar ? 2 : 1;
  const progresso = (parte, rotulo) => ({ feitas, total, etapa }) =>
    self.postMessage({ tipo: 'progresso', parte, partes, feitas, total, etapa: rotulo ? `${rotulo}: ${etapa}` : etapa });
  try {
    let modelo;
    try {
      modelo = validarModelo(data.modelo);
    } catch (err) {
      throw new Error(`Modelo a medir: ${err.message}`);
    }
    let outro = null;
    if (data.comparar) {
      try {
        outro = validarModelo(data.comparar);
      } catch (err) {
        throw new Error(`Modelo de comparação: ${err.message}`);
      }
    }
    const medicao = await medirModelo(modelo, { blocos: data.blocos, aoProgresso: progresso(1) });
    const comparacao = outro
      ? await compararModelos(modelo, outro, { rotulo: data.rotuloComparar, blocos: data.blocos, aoProgresso: progresso(2, 'Comparação') })
      : null;
    self.postMessage({ tipo: 'pronto', medicao, comparacao });
  } catch (err) {
    self.postMessage({ tipo: 'erro', mensagem: err?.message || String(err) });
  }
};
