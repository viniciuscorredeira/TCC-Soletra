/**
 * RVL Libras — diálogo de confirmação inline.
 *
 * window.confirm() é bloqueado ou ignorado em vários contextos de extensão, e o
 * painel lateral é um deles na prática. Como as duas confirmações do projeto são
 * de conformidade (consentimento para processar a imagem da mão e aviso de envio
 * do texto a terceiro), elas não podem depender de um diálogo que talvez não
 * apareça: silenciosamente "aceitar" seria o pior resultado possível.
 */
const el = {
  caixa: document.getElementById('dialogo'),
  titulo: document.getElementById('dialogoTitulo'),
  texto: document.getElementById('dialogoTexto'),
  ok: document.getElementById('dialogoOk'),
  cancelar: document.getElementById('dialogoCancelar')
};

let resolverPendente = null;

function fechar(resposta) {
  el.caixa.hidden = true;
  const r = resolverPendente;
  resolverPendente = null;
  r?.(resposta);
}

el.ok.addEventListener('click', () => fechar(true));
el.cancelar.addEventListener('click', () => fechar(false));

/**
 * @param {object} opcoes
 * @param {string} opcoes.titulo
 * @param {string} opcoes.texto
 * @param {string} [opcoes.confirmar] rótulo do botão de aceite
 * @returns {Promise<boolean>}
 */
export function confirmar({ titulo, texto, confirmar: rotulo = 'Continuar' }) {
  // Uma segunda chamada com um diálogo aberto cancela o anterior, em vez de
  // deixar a promessa pendurada para sempre.
  if (resolverPendente) fechar(false);

  el.titulo.textContent = titulo;
  el.texto.textContent = texto;
  el.ok.textContent = rotulo;
  el.caixa.hidden = false;
  el.ok.focus();

  return new Promise((resolve) => {
    resolverPendente = resolve;
  });
}
