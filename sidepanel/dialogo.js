/**
 * Soletra — modal de confirmação.
 *
 * window.confirm() é bloqueado ou ignorado em vários contextos de extensão, e o
 * painel lateral é um deles na prática. As confirmações deste projeto são de
 * conformidade (consentimento para processar a imagem da mão, aviso de envio do
 * texto a terceiro) ou destrutivas (apagar amostras treinadas): nenhuma delas
 * pode depender de um diálogo que talvez não apareça, porque "aceitar em
 * silêncio" seria o pior resultado possível.
 */
const el = {
  fundo: document.getElementById('dialogoFundo'),
  titulo: document.getElementById('dialogoTitulo'),
  texto: document.getElementById('dialogoTexto'),
  ok: document.getElementById('dialogoOk'),
  cancelar: document.getElementById('dialogoCancelar')
};

let resolverPendente = null;
let focoAnterior = null;

function fechar(resposta) {
  if (!resolverPendente) return;

  el.fundo.hidden = true;
  document.removeEventListener('keydown', aoTeclar, true);

  const r = resolverPendente;
  resolverPendente = null;

  // Devolver o foco evita que o leitor de tela e o Tab recomecem do topo do
  // painel depois de cada confirmação.
  focoAnterior?.focus?.();
  focoAnterior = null;

  r(resposta);
}

function aoTeclar(evento) {
  if (!resolverPendente) return;

  if (evento.key === 'Escape') {
    evento.preventDefault();
    fechar(false);
    return;
  }

  // Prende o foco nos dois botões: com o modal aberto, sair dele com Tab
  // deixaria o usuário editando o painel por baixo de uma pergunta pendente.
  if (evento.key === 'Tab') {
    evento.preventDefault();
    const foco = document.activeElement === el.ok ? el.cancelar : el.ok;
    foco.focus();
  }
}

// Clicar fora cancela — mas só no fundo, nunca num clique que começou dentro
// da caixa e escorregou para fora ao soltar o botão.
el.fundo.addEventListener('mousedown', (evento) => {
  if (evento.target === el.fundo) fechar(false);
});

el.ok.addEventListener('click', () => fechar(true));
el.cancelar.addEventListener('click', () => fechar(false));

/**
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {string} opcoes.texto
 * @param {string} [opcoes.confirmar] rótulo do botão de aceite
 * @param {string} [opcoes.cancelar] rótulo do botão de recusa
 * @param {boolean} [opcoes.perigo] ação destrutiva: pinta o aceite de vermelho
 *   e deixa o foco inicial no "Não", para que um Enter reflexo não apague nada
 * @returns {Promise<boolean>}
 */
export function confirmar({
  titulo,
  texto,
  confirmar: rotuloOk = 'Sim',
  cancelar: rotuloNao = 'Não',
  perigo = false
}) {
  // Uma segunda chamada com um diálogo aberto cancela o anterior, em vez de
  // deixar a promessa pendurada para sempre.
  if (resolverPendente) fechar(false);

  el.titulo.textContent = titulo;
  el.texto.textContent = texto;
  el.ok.textContent = rotuloOk;
  el.cancelar.textContent = rotuloNao;
  el.ok.classList.toggle('btn--destrutivo', perigo);

  focoAnterior = document.activeElement;
  el.fundo.hidden = false;

  const promessa = new Promise((resolve) => {
    resolverPendente = resolve;
  });

  document.addEventListener('keydown', aoTeclar, true);
  (perigo ? el.cancelar : el.ok).focus();

  return promessa;
}
