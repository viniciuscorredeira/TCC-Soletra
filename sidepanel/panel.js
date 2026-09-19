import { CameraController } from '../src/camera-controller.js';
import { SignRecognizer } from '../src/sign-recognizer.js';
import { montarRecognitionView } from './recognition-view.js';
import { montarTrainingView } from './training-view.js';
import { confirmar } from './dialogo.js';
import { migrarChaves } from '../src/migracao-storage.js';

const PREF_KEY = 'soletra.preferredDeviceId';
const CHAVE_CONSENTIMENTO = 'soletra.consentimento.reconhecimento';
const CHAVE_AVISO_BUSCA = 'soletra.avisoBuscaAceito';

const el = {
  body: document.body,
  video: document.getElementById('preview'),
  select: document.getElementById('deviceSelect'),
  btnStart: document.getElementById('btnStart'),
  btnStop: document.getElementById('btnStop'),
  btnReload: document.getElementById('btnReload'),
  btnPermission: document.getElementById('btnPermission'),
  badge: document.getElementById('statusBadge'),
  statusText: document.getElementById('statusText'),
  message: document.getElementById('message'),
  placeholderText: document.getElementById('placeholderText'),
  liveTag: document.getElementById('liveTag'),
  streamInfo: document.getElementById('streamInfo')
};

const STATUS = {
  idle: { label: 'Parada', badge: 'badge--idle', placeholder: 'Câmera parada' },
  requesting: { label: 'Iniciando…', badge: 'badge--busy', placeholder: 'Solicitando acesso à câmera…' },
  active: { label: 'Ativa', badge: 'badge--active', placeholder: '' },
  stopped: { label: 'Parada', badge: 'badge--idle', placeholder: 'Transmissão encerrada' },
  error: { label: 'Erro', badge: 'badge--error', placeholder: 'Não foi possível exibir o vídeo' }
};

const controller = new CameraController(el.video, render);

const reconhecedor = new SignRecognizer(el.video, (snapshot) => {
  recognitionView.renderizar(snapshot);
  trainingView.renderizar(snapshot);
});

/** Guarda a última câmera escolhida para restaurá-la na próxima abertura. */
async function loadPreferredDeviceId() {
  try {
    const stored = await chrome.storage.local.get(PREF_KEY);
    return stored?.[PREF_KEY] || '';
  } catch {
    return '';
  }
}

function savePreferredDeviceId(deviceId) {
  chrome.storage.local.set({ [PREF_KEY]: deviceId || '' }).catch(() => {});
}

function showMessage(text, kind = 'info') {
  el.message.textContent = text;
  el.message.className = `message message--${kind}`;
  el.message.hidden = false;
}

function clearMessage() {
  el.message.hidden = true;
  el.message.textContent = '';
}

/** @returns {boolean} true quando nenhum dispositivo tem rótulo legível. */
function fillDeviceOptions(devices, activeDeviceId) {
  const desired = activeDeviceId || el.select.value;

  el.select.replaceChildren();

  if (devices.length === 0) {
    el.select.append(new Option('Nenhuma câmera detectada', ''));
    el.select.disabled = true;
    return false;
  }

  el.select.disabled = false;
  devices.forEach((device, index) => {
    // O rótulo só vem preenchido depois que a permissão é concedida; sem ele
    // resta o índice, e o usuário não consegue distinguir os dispositivos.
    const label = device.label || `Câmera ${index + 1} (nome indisponível)`;
    el.select.append(new Option(label, device.deviceId));
  });

  if (desired && devices.some((d) => d.deviceId === desired)) {
    el.select.value = desired;
  }

  return devices.every((device) => !device.label);
}

function describeTrack(track) {
  if (!track) return '—';
  const s = track.getSettings();
  const parts = [];
  if (s.width && s.height) parts.push(`${s.width}×${s.height}`);
  if (s.frameRate) parts.push(`${Math.round(s.frameRate)} fps`);
  return parts.length ? parts.join(' · ') : 'Transmitindo';
}

function render(snapshot) {
  const { state, error, devices, activeDeviceId, track } = snapshot;
  const status = STATUS[state] || STATUS.idle;

  el.body.dataset.state = state;
  el.badge.className = `badge ${status.badge}`;
  el.statusText.textContent = status.label;
  el.placeholderText.textContent = status.placeholder;
  el.liveTag.hidden = state !== 'active';
  el.streamInfo.textContent = state === 'active' ? describeTrack(track) : '—';

  const labelsMissing = fillDeviceOptions(devices, activeDeviceId);

  const busy = state === 'requesting';
  const hasDevices = devices.length > 0;

  el.btnStart.disabled = busy || state === 'active' || !hasDevices;
  el.btnStop.disabled = busy || state !== 'active';
  el.btnReload.disabled = busy || !hasDevices;
  el.select.disabled = busy || !hasDevices;

  if (error) {
    showMessage(error.message, 'error');
    el.btnPermission.hidden = error.code !== 'permission-denied';
  } else if (state === 'active') {
    clearMessage();
    el.btnPermission.hidden = true;
  } else if (!hasDevices) {
    showMessage('Nenhuma câmera encontrada. Conecte um dispositivo e clique em Recarregar.', 'warn');
  } else if (labelsMissing) {
    showMessage('Autorize o acesso à câmera para ver os nomes dos dispositivos.', 'warn');
    el.btnPermission.hidden = false;
  } else {
    clearMessage();
  }

  // O reconhecedor consome a MESMA snapshot da câmera: liga o loop quando o
  // stream abre e o desliga quando fecha, sem um segundo canal de eventos.
  reconhecedor.aoMudarCamera(snapshot);
}

/**
 * O prompt de permissão de mídia não aparece dentro do painel lateral: o
 * Chrome exige uma aba de topo. A página permission/request.html cumpre esse
 * papel e a permissão fica gravada para a origem chrome-extension:// inteira.
 */
function openPermissionTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL('permission/request.html') });
}

async function startSelected() {
  clearMessage();

  // Em estado "prompt" o painel lateral não consegue exibir o diálogo nativo;
  // encaminha para a aba de permissão antes de tentar o getUserMedia.
  const permission = await CameraController.permissionState();
  if (permission === 'prompt') {
    showMessage('Abrindo a aba de autorização da câmera…', 'info');
    openPermissionTab();
    return;
  }

  const deviceId = el.select.value || undefined;
  const ok = await controller.start(deviceId);
  if (ok) savePreferredDeviceId(controller.activeDeviceId);
}

el.btnStart.addEventListener('click', startSelected);

el.btnStop.addEventListener('click', () => {
  controller.stop();
  showMessage('Transmissão encerrada. A câmera foi liberada.', 'info');
});

el.btnReload.addEventListener('click', async () => {
  clearMessage();
  const wasStreaming = controller.state === 'active';
  const streaming = await controller.reload(el.select.value || undefined);

  if (streaming) {
    savePreferredDeviceId(controller.activeDeviceId);
  } else if (!wasStreaming) {
    // Recarregar não liga a câmera: preserva o estado desligado.
    showMessage('Lista de dispositivos atualizada. A câmera continua desligada.', 'info');
  }
});

el.select.addEventListener('change', async () => {
  savePreferredDeviceId(el.select.value);
  // Troca de dispositivo sem recarregar a extensão: só reabre o stream se já
  // houver transmissão em andamento.
  if (controller.state === 'active') {
    await controller.start(el.select.value || undefined);
  }
});

el.btnPermission.addEventListener('click', openPermissionTab);

// A aba de permissão avisa quando o usuário decide, para atualizar os rótulos.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'soletra:permission-result') return;
  if (msg.state === 'granted') {
    el.btnPermission.hidden = true;
    // ensureDeviceLabels destrava os nomes reais das câmeras; a mensagem vem
    // depois do refresh porque o render() disparado por ele limpa o aviso.
    controller
      .ensureDeviceLabels()
      .then(() => controller.refreshDevices({ notify: true }))
      .then(() => showMessage('Permissão concedida. Clique em Iniciar câmera.', 'info'));
  } else {
    showMessage('Permissão de câmera negada nas configurações do navegador.', 'error');
  }
});

// --- Reconhecimento de Libras ----------------------------------------------

/**
 * O reconhecimento passa a extrair pontos da mão a partir dos quadros — dado
 * biométrico derivado. O consentimento é pedido uma vez, antes da primeira
 * ativação, e a data do aceite fica registrada.
 */
async function consentimentoConcedido() {
  const g = await chrome.storage.local.get(CHAVE_CONSENTIMENTO);
  if (g?.[CHAVE_CONSENTIMENTO]?.aceitoEm) return true;

  const ok = await confirmar({
    titulo: 'Ativar o reconhecimento de Libras',
    texto:
      'A extensão passará a calcular, no seu dispositivo, 21 pontos de referência da sua mão a ' +
      'partir dos quadros da câmera. Nenhuma imagem é gravada nem enviada para servidor algum. ' +
      'Os sinais que você treinar ficam salvos como números no seu navegador, e podem ser ' +
      'exportados ou apagados a qualquer momento em "Treinar sinais".',
    confirmar: 'Entendi, ativar',
    cancelar: 'Agora não'
  });

  if (ok) {
    await chrome.storage.local.set({
      [CHAVE_CONSENTIMENTO]: { aceitoEm: new Date().toISOString(), versao: 1 }
    });
  }
  return ok;
}

/** A busca é o único ponto em que algo sai do dispositivo — e só por clique. */
async function pesquisar() {
  const termo = reconhecedor.composer.paraBusca();
  if (!termo) return;

  const g = await chrome.storage.local.get(CHAVE_AVISO_BUSCA);
  if (!g?.[CHAVE_AVISO_BUSCA]) {
    const ok = await confirmar({
      titulo: 'Pesquisar fora da extensão',
      texto:
        `O texto "${termo}" será enviado ao mecanismo de busca padrão do seu navegador, ` +
        'que é um serviço de terceiro. Tudo o mais permanece no seu dispositivo.',
      confirmar: 'Pesquisar'
    });
    if (!ok) return;
    await chrome.storage.local.set({ [CHAVE_AVISO_BUSCA]: true });
  }

  // A pesquisa é executada pelo service worker: o painel lateral não é uma aba,
  // e pedir navegação daqui derrubava o navegador.
  try {
    const r = await chrome.runtime.sendMessage({ type: 'rvl:pesquisar', termo });
    if (r?.ok === false) {
      showMessage(`Não foi possível abrir a pesquisa: ${r.erro}`, 'error');
    } else if (r?.via === 'google') {
      showMessage('Buscador padrão indisponível — a pesquisa foi aberta no Google.', 'info');
    }
  } catch (err) {
    showMessage(`Não foi possível abrir a pesquisa: ${err?.message || err}`, 'error');
  }
}

const recognitionView = montarRecognitionView({
  async alternarReconhecimento(ligar) {
    if (!ligar) {
      reconhecedor.desligar();
      return;
    }
    if (!(await consentimentoConcedido())) {
      reconhecedor.desligar();
      return;
    }
    await reconhecedor.ligar();
    if (controller.state !== 'active') {
      showMessage('Reconhecimento pronto. Inicie a câmera para começar.', 'info');
    }
  },
  definirConjunto: (id) => reconhecedor.definirConjunto(id),
  espaco: () => reconhecedor.composer.espaco(),
  apagar: () => reconhecedor.composer.apagar(),
  limpar: () => reconhecedor.composer.limpar(),
  definirTexto: (t) => reconhecedor.composer.definir(t),
  repetir: () => reconhecedor.estabilizador.liberarTrava(performance.now()),
  definirRigor: (v) => reconhecedor.definirRigor(v),
  definirPermanencia: (ms) => reconhecedor.definirPermanencia(ms),
  pesquisar
});

const trainingView = montarTrainingView({
  treinar(classe) {
    if (controller.state !== 'active') {
      showMessage('Inicie a câmera antes de treinar um sinal.', 'warn');
      return;
    }
    if (reconhecedor.estado === 'desligado') {
      showMessage('Ligue o Reconhecimento antes de treinar.', 'warn');
      return;
    }
    reconhecedor.iniciarCaptura(classe);
  },
  cancelarCaptura: () => reconhecedor.pararCaptura(),
  definirMao: (mao) => reconhecedor.definirMao(mao),

  async exportar() {
    const modelo = await reconhecedor.exportarModelo();
    const blob = new Blob([JSON.stringify(modelo, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soletra-modelo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage('Modelo exportado.', 'info');
  },

  async importar(arquivo) {
    let objeto;
    try {
      objeto = JSON.parse(await arquivo.text());
    } catch {
      showMessage('O arquivo não é um JSON válido.', 'error');
      return;
    }

    // Valida antes de perguntar: não faz sentido oferecer substituir o modelo
    // do usuário por um arquivo que já se sabe inválido.
    const { SignModelStore } = await import('../src/sign-model-store.js');
    const v = SignModelStore.validarArquivo(objeto);
    if (!v.ok) {
      showMessage(v.erro, 'error');
      return;
    }

    const substituir = await confirmar({
      titulo: 'Importar modelo',
      texto:
        `O arquivo traz ${v.contagem} amostras de ${Object.keys(v.classes).length} classes ` +
        `(mão ${v.mao}). Isso vai substituir o modelo atual.`,
      confirmar: 'Substituir',
      cancelar: 'Cancelar'
    });
    if (!substituir) return;

    try {
      const r = await reconhecedor.importarModelo(objeto, 'substituir');
  async apagarClasse(classe) {
    const ok = await confirmar({
      titulo: `Apagar as amostras de "${classe}"?`,
      texto:
        `As amostras gravadas para "${classe}" serão removidas deste dispositivo e ` +
        'não há como desfazer. As outras classes continuam intactas.',
      perigo: true
    });
    if (!ok) return;
    await reconhecedor.apagarClasse(classe);
    showMessage(`Amostras de "${classe}" apagadas.`, 'info');
  },

      showMessage(`Modelo importado: ${r.amostras} amostras em ${r.classes} classes.`, 'info');
    } catch (err) {
      showMessage(err?.message || 'Falha ao importar o modelo.', 'error');
    }
  },

  async apagarModelo() {
    const ok = await confirmar({
      titulo: 'Apagar todo o modelo treinado?',
      texto:
        'Todas as amostras de todas as classes serão removidas deste dispositivo. ' +
        'Não há como desfazer — considere exportar o modelo antes.',
      perigo: true
    });
    if (!ok) return;
    await reconhecedor.apagarModelo();
    showMessage('Modelo apagado.', 'info');
  }
});

  // Antes de qualquer leitura: o produto se chamava "RVL Libras" e prefixava as
  // chaves com `rvl.`. Sem esta passada, o modelo treinado continuaria no disco
  // sob nomes que ninguém mais lê.
  await migrarChaves(chrome.storage.local);

window.addEventListener('pagehide', () => {
  controller.dispose();
  reconhecedor.dispose();
});

(async function init() {
  const permission = await CameraController.permissionState();
  const preferred = await loadPreferredDeviceId();

  await controller.ensureDeviceLabels();
  if (preferred && controller.devices.some((d) => d.deviceId === preferred)) {
    el.select.value = preferred;
  }
  render({
    state: 'idle',
    error: null,
    devices: controller.devices,
    activeDeviceId: preferred,
    track: null
  });

  if (permission === 'denied') {
    showMessage(
      'O acesso à câmera está bloqueado para esta extensão. Libere em Configurações do navegador → Privacidade e segurança → Câmera.',
      'error'
    );
    el.btnPermission.hidden = false;
  } else if (permission !== 'granted') {
    showMessage('Clique em Iniciar câmera para autorizar o acesso.', 'info');
    el.btnPermission.hidden = false;
  }

  // Carrega preferências e modelo do storage. Não toca no WASM: o detector só
  // nasce quando o usuário liga o Reconhecimento.
  await reconhecedor.iniciar();

  if (reconhecedor.modeloIncompativel) {
    showMessage(
      'O modelo salvo foi gravado com outra versão da normalização e não pode ser usado. ' +
        'Treine os sinais novamente.',
      'warn'
    );
  }
})();
