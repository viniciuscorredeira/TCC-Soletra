/**
 * Soletra — que mensagem o painel mostra depois de mexer na câmera, no modelo
 * pronto ou no Reconhecimento.
 *
 * O painel tem um único espaço de mensagem: a nova substitui a anterior, e uma
 * mensagem só some quando alguém a apaga. Estas funções decidem o conteúdo sem
 * tocar em nada, para a regra poder ser testada fora do navegador; quem mostra
 * é o sidepanel/nucleo.js.
 */
import { avaliarTaxaDeQuadros, FPS_MAXIMO } from '../src/camera-controller.js';

/** Começo das mensagens que pedem para ligar o Reconhecimento. */
export const PEDE_RECONHECIMENTO = 'Ligue o Reconhecimento';

/**
 * Abaixo de 60 fps o vídeo fica menos fluido; só abaixo da taxa do loop de
 * inferência (15 Hz) é que o reconhecimento em si passa a responder mais
 * devagar — e o aviso diz qual dos dois casos é.
 */
export function avisoTaxaBaixa(fps) {
  const efeito =
    fps < 15
      ? 'O reconhecimento vai responder mais devagar.'
      : 'O reconhecimento continua funcionando, mas o vídeo pode ficar menos fluido.';
  return `Sua câmera está entregando ${fps} fps, abaixo dos ${FPS_MAXIMO} fps suportados. ${efeito}`;
}

/**
 * Com a câmera ativa, a única mensagem que deve ficar é o aviso de taxa baixa.
 * @param {MediaTrackSettings|undefined} settings do track da câmera
 * @returns {{texto: string, tipo: string}|null} null: espaço vazio
 */
export function mensagemDaCameraAtiva(settings) {
  const taxa = avaliarTaxaDeQuadros(settings);
  return taxa?.abaixo ? { texto: avisoTaxaBaixa(taxa.fps), tipo: 'warn' } : null;
}

/**
 * Depois de ligar o Reconhecimento.
 *
 * Com a câmera parada, avisa que falta iniciá-la. Com a câmera ativa, um
 * pedido para ligar o Reconhecimento (deixado pelo cartão "Usar modelo pronto",
 * por "Adicionar modelo pronto" ou pelo treino) acabou de ser atendido e sai;
 * no lugar dele volta o aviso de taxa baixa, que ele tinha substituído, se a
 * câmera estiver abaixo de 60 fps. Qualquer outra mensagem fica.
 *
 * @param {object} contexto
 * @param {{texto: string}|null} contexto.atual a mensagem na tela
 * @param {boolean} contexto.cameraAtiva
 * @param {MediaTrackSettings} [contexto.settings] do track da câmera
 * @returns {{texto: string, tipo: string}|null|undefined} undefined: não mexer
 */
export function mensagemAoLigar({ atual, cameraAtiva, settings }) {
  if (!cameraAtiva) return { texto: 'Reconhecimento pronto. Inicie a câmera para começar.', tipo: 'info' };
  if (atual?.texto?.includes(PEDE_RECONHECIMENTO)) return mensagemDaCameraAtiva(settings);
  return undefined;
}

/** Ligado de fato: nem desligado, nem parado por erro. */
export const reconhecimentoLigado = (estado) => estado !== 'desligado' && estado !== 'erro';

/**
 * Mensagem sobre o modelo pronto: só pede para ligar o Reconhecimento se ele
 * estiver desligado. Ligado, o pedido estaria errado desde o primeiro instante.
 */
export function textoModeloPronto(frase, estadoReconhecimento) {
  return reconhecimentoLigado(estadoReconhecimento) ? frase : `${frase} ${PEDE_RECONHECIMENTO} para começar.`;
}
