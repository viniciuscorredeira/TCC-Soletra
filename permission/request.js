import { describeMediaError } from '../src/camera-controller.js';

/**
 * Página de topo usada só para disparar o prompt nativo de câmera. O painel
 * lateral não consegue exibi-lo; depois de concedida aqui, a permissão vale
 * para toda a origem chrome-extension:// da extensão.
 */
const btn = document.getElementById('btnGrant');
const result = document.getElementById('result');
document.getElementById('extId').textContent = chrome.runtime.id;

function show(text, kind) {
  result.textContent = text;
  result.className = `result result--${kind}`;
  result.hidden = false;
}

function notifyPanel(state) {
  // O painel pode estar fechado; a rejeição é esperada e não é um erro.
  chrome.runtime.sendMessage({ type: 'rvl:permission-result', state }).catch(() => {});
}

async function requestPermission() {
  btn.disabled = true;
  show('Aguardando sua resposta no aviso do navegador…', 'ok');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    // Só queremos o registro da permissão: libera a câmera imediatamente.
    stream.getTracks().forEach((track) => track.stop());

    show('Permissão concedida. Você já pode fechar esta aba e voltar ao painel lateral.', 'ok');
    notifyPanel('granted');
  } catch (err) {
    const info = describeMediaError(err);
    show(info.message, 'err');
    notifyPanel('denied');
  } finally {
    btn.disabled = false;
  }
}

btn.addEventListener('click', requestPermission);

// Se a permissão já existe, evita fazer o usuário clicar à toa.
(async function init() {
  try {
    const status = await navigator.permissions.query({ name: 'camera' });
    if (status.state === 'granted') {
      show('A câmera já está autorizada. Pode voltar ao painel lateral.', 'ok');
      notifyPanel('granted');
    }
  } catch {
    /* navigator.permissions indisponível: segue pelo fluxo do botão. */
  }
})();
