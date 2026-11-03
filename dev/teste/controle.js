/**
 * Soletra (modo dev) — controle do teste de sinais no painel.
 *
 * Liga a sessão pura (sessao.js) ao painel: entrega os quadros do reconhecedor
 * (observarQuadros), move o relógio, e faz o que a sessão pede por eventos —
 * trocar o painel para o conjunto do sinal pedido, liberar a trava no "Agora!",
 * guardar cada rodada concluída. No fim (ou ao encerrar), monta o relatório e o
 * arquivo, e devolve ao painel o texto e o conjunto que estavam antes.
 *
 * O teste não muda nenhum parâmetro do reconhecimento: mede com o rigor e o
 * tempo para confirmar que estiverem no painel, e os registra.
 */
import { criarLoja } from '../../ui/loja.js';
import { acoesReco, lojaReco, observarQuadros } from '../../sidepanel/nucleo.js';
import { suspenderRecarga } from '../recarga.js';
import { SessaoTeste } from './sessao.js';
import { relatorioGeral, relatorioUnitario } from './relatorio.js';
import { montarArquivo } from './exportar.js';
import { coletarMetadados } from './metadados.js';

const CHAVE_ULTIMO = 'soletra.dev.ultimoTeste';
const TICK_MS = 100;
const RENOVAR_SUSPENSAO_MS = 5000;

/**
 * fase: 'configurando' | 'executando' | 'resultado'
 * sessao: retrato da sessão (sessao.estado) enquanto executa
 * arquivo: o resultado (o mesmo objeto que vai para o JSON)
 */
export const lojaTeste = criarLoja({ fase: 'configurando', sessao: null, arquivo: null, aviso: null });

let sessao = null;
let contexto = null;

function publicar(extra = {}) {
  lojaTeste.definir((s) => ({ ...s, fase: 'executando', sessao: sessao.estado(performance.now()), ...extra }));
}

function relatorioDe(config, rodadas) {
  return config.modo === 'unitario' ? relatorioUnitario(config.sinal, rodadas) : relatorioGeral(rodadas);
}

function arquivoAtual(parcial) {
  return montarArquivo({
    metadados: contexto.metadados,
    configuracao: sessao.config,
    plano: sessao.plano,
    rodadas: sessao.rodadas,
    relatorio: relatorioDe(sessao.config, sessao.rodadas),
    parcial
  });
}

/** Cada rodada concluída fica salva: um painel fechado no meio não perde o que já foi feito. */
function salvar(arquivo) {
  chrome.storage.local.set({ [CHAVE_ULTIMO]: arquivo }).catch(() => {});
}

function aoEvento(e) {
  if (e.tipo === 'contagem') {
    // O conjunto troca já na contagem: é o que a pessoa faria no uso real
    // antes de fazer um número, e dá tempo ao painel de se ajustar.
    if (lojaReco.ler()?.conjunto !== e.item.conjunto) acoesReco.definirConjunto(e.item.conjunto);
  } else if (e.tipo === 'gravando') {
    // Uma trava da rodada anterior impediria confirmar a mesma letra de novo.
    acoesReco.repetir();
  } else if (e.tipo === 'rodada') {
    salvar(arquivoAtual(true));
  } else if (e.tipo === 'concluida') {
    finalizar();
  }
}

/** Se o reconhecimento parar no meio (câmera desligada, painel trocado), a rodada pausa. */
function vigiarReconhecimento() {
  const s = lojaReco.ler();
  if (sessao && s?.estado !== 'reconhecendo' && (sessao.fase === 'contagem' || sessao.fase === 'gravando')) {
    sessao.pausar();
    publicar({ aviso: 'O reconhecimento parou, e a rodada foi pausada. Religue-o e clique em Continuar.' });
  }
}

/**
 * @param {object} config ver SessaoTeste e planejar(), mais participante,
 *   gravouModeloPronto e condicoes
 * @returns {Promise<string|null>} mensagem de erro, ou null se começou
 */
export async function iniciarTeste(config) {
  const reco = lojaReco.ler();
  if (!reco || reco.estado !== 'reconhecendo') return 'Ligue a câmera e o Reconhecimento antes de começar o teste.';
  if (reco.modeloVazio) return 'Nenhum sinal treinado: carregue o modelo pronto ou treine antes de testar.';

  contexto = {
    guardado: { texto: reco.texto, conjunto: reco.conjunto },
    metadados: await coletarMetadados(config),
    cancelarQuadros: null,
    cancelarReco: null,
    timer: null,
    renovacao: null
  };
  sessao = new SessaoTeste({ ...config, semente: config.semente ?? Math.floor(Math.random() * 2 ** 31) }, aoEvento);

  contexto.cancelarQuadros = observarQuadros((q) => sessao.aoQuadro(q));
  contexto.cancelarReco = lojaReco.assinar(vigiarReconhecimento);
  suspenderRecarga(true);
  contexto.renovacao = setInterval(() => suspenderRecarga(true), RENOVAR_SUSPENSAO_MS);
  contexto.timer = setInterval(() => {
    sessao.tick(performance.now());
    if (sessao) publicar();
  }, TICK_MS);

  sessao.iniciar(performance.now());
  publicar({ aviso: null, arquivo: null });
  return null;
}

function finalizar() {
  clearInterval(contexto.timer);
  clearInterval(contexto.renovacao);
  contexto.cancelarQuadros();
  contexto.cancelarReco();
  suspenderRecarga(false);

  // As confirmações do teste digitaram no campo de texto; ele volta como estava.
  acoesReco.definirTexto(contexto.guardado.texto);
  if (lojaReco.ler()?.conjunto !== contexto.guardado.conjunto) acoesReco.definirConjunto(contexto.guardado.conjunto);

  const completa = sessao.indice >= sessao.plano.length;
  const arquivo = arquivoAtual(!completa);
  salvar(arquivo);
  sessao = null;
  contexto = null;
  lojaTeste.definir({ fase: 'resultado', sessao: null, arquivo, aviso: null });
}

const agora = () => performance.now();
export const acoesTeste = {
  pausar: () => { sessao?.pausar(); if (sessao) publicar(); },
  continuar: () => { sessao?.continuar(agora()); if (sessao) publicar({ aviso: null }); },
  repetir: () => { sessao?.repetir(agora()); if (sessao) publicar({ aviso: null }); },
  pular: () => { sessao?.pular(agora()); if (sessao) publicar(); },
  encerrar: () => sessao?.encerrar(),
  /** Volta à configuração. */
  novo: () => lojaTeste.definir({ fase: 'configurando', sessao: null, arquivo: null, aviso: null }),
  /** Mostra o último teste salvo (inclusive um interrompido). */
  async abrirUltimo() {
    try {
      const g = await chrome.storage.local.get(CHAVE_ULTIMO);
      const arquivo = g?.[CHAVE_ULTIMO];
      if (arquivo) lojaTeste.definir({ fase: 'resultado', sessao: null, arquivo, aviso: null });
      return Boolean(arquivo);
    } catch {
      return false;
    }
  }
};
