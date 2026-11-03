/**
 * Soletra (modo dev) — conduz a medição do modelo no painel: carrega as
 * fontes, entrega ao Web Worker, acompanha o progresso e guarda o resultado.
 *
 * O arquivo produzido tem o mesmo formato do tools/medir-modelo.mjs
 * (soletra-medicao-modelo): uma medição feita no terminal abre aqui, e uma
 * exportada daqui é lida por quem lê as do terminal.
 */
import { criarLoja } from '../../ui/loja.js';
import { FORMATO_MEDICAO, montarArquivo } from '../../tools/medicao-modelo.js';
import { COMMIT } from '../teste/metadados.js';
import { CHAVE_IMPRESSAO, baixarBlob } from '../teste/exportar.js';
import { carregarFonte } from './fontes.js';
import { nomeDaMedicao } from './nome.js';

/** A última medição, para reabrir depois de fechar o painel. */
const CHAVE_ULTIMA = 'soletra.dev.ultimaMedicao';

/**
 * fase: 'configurando' | 'medindo' | 'resultado'
 * progresso: {parte, partes, feitas, total, etapa} enquanto mede
 */
export const lojaMedicao = criarLoja({ fase: 'configurando', progresso: null, arquivo: null, erro: null });

let trabalho = null;

function rodar(mensagem) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./trabalhador.js', import.meta.url), { type: 'module' });
    trabalho = { worker, reject };
    worker.onmessage = ({ data }) => {
      if (data.tipo === 'progresso') {
        lojaMedicao.definir((e) => ({ ...e, progresso: data }));
        return;
      }
      encerrarTrabalho();
      if (data.tipo === 'pronto') resolve(data);
      else reject(new Error(data.mensagem));
    };
    worker.onerror = (evento) => {
      evento.preventDefault?.();
      encerrarTrabalho();
      reject(new Error(evento.message || 'O cálculo parou com um erro.'));
    };
    worker.postMessage(mensagem);
  });
}

function encerrarTrabalho() {
  trabalho?.worker.terminate();
  trabalho = null;
}

function mostrar(arquivo) {
  lojaMedicao.definir({ fase: 'resultado', progresso: null, arquivo, erro: null });
}

/**
 * @param {object} config
 * @param {string} config.fonte 'uso' | 'pronto' | 'pessoal' | 'arquivo'
 * @param {File} [config.arquivoFonte]
 * @param {string|null} [config.comparar] outra fonte, ou null
 * @param {File} [config.arquivoComparar]
 * @param {number[]} config.blocos
 */
export async function medir({ fonte, arquivoFonte, comparar, arquivoComparar, blocos }) {
  if (trabalho) return;
  lojaMedicao.definir({
    fase: 'medindo',
    progresso: { parte: 1, partes: comparar ? 2 : 1, feitas: 0, total: 0, etapa: 'Carregando o modelo' },
    arquivo: null,
    erro: null
  });
  try {
    const principal = await carregarFonte(fonte, arquivoFonte);
    const outro = comparar ? await carregarFonte(comparar, arquivoComparar) : null;
    const { medicao, comparacao } = await rodar({
      modelo: principal.modelo,
      comparar: outro?.modelo ?? null,
      rotuloComparar: outro?.rotulo ?? null,
      blocos
    });
    const arquivo = montarArquivo({
      medicao,
      comparacao,
      arquivo: principal.rotulo,
      commit: COMMIT,
      ambiente: { navegador: navigator.userAgent, extensao: chrome.runtime.getManifest().version }
    });
    mostrar(arquivo);
    chrome.storage.local.set({ [CHAVE_ULTIMA]: arquivo }).catch(() => {});
  } catch (err) {
    if (err?.cancelada) return;
    lojaMedicao.definir({ fase: 'configurando', progresso: null, arquivo: null, erro: err?.message || String(err) });
  }
}

export const acoesMedicao = {
  cancelar() {
    if (!trabalho) return;
    const { reject } = trabalho;
    encerrarTrabalho();
    reject({ cancelada: true });
    lojaMedicao.definir({ fase: 'configurando', progresso: null, arquivo: null, erro: null });
  },

  nova() {
    lojaMedicao.definir({ fase: 'configurando', progresso: null, arquivo: null, erro: null });
  },

  /** @returns {Promise<boolean>} se havia uma medição salva */
  async abrirUltima() {
    const g = await chrome.storage.local.get(CHAVE_ULTIMA).catch(() => null);
    const arquivo = g?.[CHAVE_ULTIMA];
    if (!arquivo) return false;
    mostrar(arquivo);
    return true;
  },

  /** Abre uma medição exportada antes, daqui ou do terminal. */
  async abrirArquivo(arquivo) {
    let objeto;
    try {
      objeto = JSON.parse(await arquivo.text());
    } catch {
      lojaMedicao.definir((e) => ({ ...e, erro: `${arquivo.name} não é um JSON válido.` }));
      return;
    }
    if (objeto?.formato !== FORMATO_MEDICAO) {
      lojaMedicao.definir((e) => ({
        ...e,
        erro: `${arquivo.name} não é uma medição. Para medir um modelo exportado, escolha "Arquivo .json" em Modelo.`
      }));
      return;
    }
    mostrar(objeto);
  }
};

// --- Exportação ----------------------------------------------------------

export function baixarJsonMedicao(arquivo) {
  baixarBlob(new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json' }), nomeDaMedicao(arquivo, 'json'));
}

export async function baixarXlsxMedicao(arquivo) {
  const [{ tabelasMedicao }, { gerarXlsx }] = await Promise.all([import('./tabelas.js'), import('../teste/xlsx.js')]);
  baixarBlob(
    new Blob([gerarXlsx(tabelasMedicao(arquivo))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nomeDaMedicao(arquivo, 'xlsx')
  );
}

/** A mesma página de impressão do teste de sinais, que reconhece o formato. */
export async function abrirPdfMedicao(arquivo) {
  await chrome.storage.session.set({ [CHAVE_IMPRESSAO]: arquivo });
  await chrome.tabs.create({ url: chrome.runtime.getURL('dev/relatorio.html') });
}
