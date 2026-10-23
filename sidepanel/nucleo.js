/**
 * Soletra — núcleo do painel.
 *
 * Tudo o que o painel FAZ mora aqui; os componentes React só desenham o estado
 * destas lojas e chamam estas ações. É a mesma separação de antes entre
 * render(snapshot) e a regra de negócio, agora com o desenho a cargo do React.
 *
 * Câmera e reconhecedor são únicos por página e nascem com o módulo, não com um
 * componente: recriá-los a cada montagem do React abriria uma segunda câmera ou
 * um segundo detector WASM por cima do primeiro.
 */
import { CameraController, avaliarTaxaDeQuadros, FPS_MAXIMO } from '../src/camera-controller.js';
import { SignRecognizer } from '../src/sign-recognizer.js';
import { migrarChaves } from '../src/migracao-storage.js';
import { AMOSTRAS_RECOMENDADAS, AMOSTRAS_MAXIMAS, SignModelStore } from '../src/sign-model-store.js';
import { criarLoja } from '../ui/loja.js';
import { confirmar } from './dialogo.js';
import { escolherPlataforma } from './seletor-plataforma.js';
import { lerRetomada } from './janela.js';

const PREF_KEY = 'soletra.preferredDeviceId';
const CHAVE_CONSENTIMENTO = 'soletra.consentimento.reconhecimento';

/**
 * O controller precisa do <video> no construtor, então o elemento nasce aqui e
 * o componente do palco só o encaixa no lugar.
 */
export const video = document.createElement('video');
video.id = 'preview';
video.autoplay = true;
video.muted = true;
video.playsInline = true;

/**
 * Última snapshot do CameraController. `devices: null` só até a primeira
 * enumeração — é o "Procurando câmeras…" do seletor.
 */
export const lojaCamera = criarLoja({
  state: 'idle',
  error: null,
  devices: null,
  activeDeviceId: null,
  track: null
});
/** Última snapshot do SignRecognizer; null até ele carregar as preferências. */
export const lojaReco = criarLoja(null);
/** @type {ReturnType<typeof criarLoja<{texto: string, tipo: 'info'|'warn'|'error'} | null>>} */
export const lojaMensagem = criarLoja(null);
/** Se o botão "Conceder acesso à câmera" aparece. */
export const lojaPermissao = criarLoja(false);
/** deviceId escolhido no seletor de câmera — o que o <select> guardava em .value. */
export const lojaDispositivo = criarLoja('');

const controller = new CameraController(video, aoMudarCamera);

const reconhecedor = new SignRecognizer(video, (snapshot) => lojaReco.definir(snapshot));

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

export function showMessage(texto, tipo = 'info') {
  lojaMensagem.definir({ texto, tipo });
}

function clearMessage() {
  lojaMensagem.definir(null);
}

/**
 * Mantém a escolha do seletor coerente com a lista: sem a câmera desejada na
 * lista, vale a primeira, como fazia o <select> nativo.
 * @returns {boolean} true quando nenhum dispositivo tem rótulo legível.
 */
function sincronizarDispositivo(devices, activeDeviceId) {
  if (devices.length === 0) return false;

  const desired = activeDeviceId || lojaDispositivo.ler();
  const existe = desired && devices.some((d) => d.deviceId === desired);
  lojaDispositivo.definir(existe ? desired : devices[0].deviceId);

  // O rótulo só vem preenchido depois que a permissão é concedida; sem ele
  // resta o índice, e o usuário não consegue distinguir os dispositivos.
  return devices.every((device) => !device.label);
}

export function describeTrack(track) {
  if (!track) return '—';
  const s = track.getSettings();
  const parts = [];
  if (s.width && s.height) parts.push(`${s.width}×${s.height}`);
  if (s.frameRate) parts.push(`${Math.round(s.frameRate)} fps`);
  return parts.length ? parts.join(' · ') : 'Transmitindo';
}

/**
 * Abaixo de 60 fps o vídeo fica menos fluido; só abaixo da taxa do loop de
 * inferência (15 Hz) é que o reconhecimento em si passa a responder mais
 * devagar — e o aviso diz qual dos dois casos é.
 */
function avisoTaxaBaixa(fps) {
  const efeito =
    fps < 15
      ? 'O reconhecimento vai responder mais devagar.'
      : 'O reconhecimento continua funcionando, mas o vídeo pode ficar menos fluido.';
  return `Sua câmera está entregando ${fps} fps, abaixo dos ${FPS_MAXIMO} fps suportados. ${efeito}`;
}

function aoMudarCamera(snapshot) {
  const { state, error, devices, activeDeviceId, track } = snapshot;

  // A câmera ligada é a validação para o reconhecimento existir: some ao parar
  // e volta ao religar. Uma captura de treino em curso é cancelada, já que o
  // botão de cancelar dela ficaria escondido.
  if (state !== 'active' && reconhecedor.captura) reconhecedor.pararCaptura();

  const labelsMissing = sincronizarDispositivo(devices, activeDeviceId);
  lojaCamera.definir(snapshot);

  const hasDevices = devices.length > 0;

  if (error) {
    showMessage(error.message, 'error');
    lojaPermissao.definir(error.code === 'permission-denied');
  } else if (state === 'active') {
    const taxa = avaliarTaxaDeQuadros(track?.getSettings?.());
    if (taxa?.abaixo) showMessage(avisoTaxaBaixa(taxa.fps), 'warn');
    else clearMessage();
    lojaPermissao.definir(false);
  } else if (!hasDevices) {
    showMessage('Nenhuma câmera encontrada. Conecte um dispositivo e clique em Recarregar.', 'warn');
  } else if (labelsMissing) {
    showMessage('Autorize o acesso à câmera para ver os nomes dos dispositivos.', 'warn');
    lojaPermissao.definir(true);
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
export function abrirAbaPermissao() {
  chrome.tabs.create({ url: chrome.runtime.getURL('permission/request.html') });
}

export async function iniciarCamera() {
  clearMessage();

  // Em estado "prompt" o painel lateral não consegue exibir o diálogo nativo;
  // encaminha para a aba de permissão antes de tentar o getUserMedia.
  const permission = await CameraController.permissionState();
  if (permission === 'prompt') {
    showMessage('Abrindo a aba de autorização da câmera…', 'info');
    abrirAbaPermissao();
    return;
  }

  const deviceId = lojaDispositivo.ler() || undefined;
  const ok = await controller.start(deviceId);
  if (ok) savePreferredDeviceId(controller.activeDeviceId);
}

export function pararCamera() {
  controller.stop();
  showMessage('Transmissão encerrada. A câmera foi liberada.', 'info');
}

export async function recarregar() {
  clearMessage();
  const wasStreaming = controller.state === 'active';
  const streaming = await controller.reload(lojaDispositivo.ler() || undefined);

  if (streaming) {
    savePreferredDeviceId(controller.activeDeviceId);
  } else if (!wasStreaming) {
    // Recarregar não liga a câmera: preserva o estado desligado.
    showMessage('Lista de dispositivos atualizada. A câmera continua desligada.', 'info');
  }
}

export async function escolherDispositivo(deviceId) {
  lojaDispositivo.definir(deviceId);
  savePreferredDeviceId(deviceId);
  // Troca de dispositivo sem recarregar a extensão: só reabre o stream se já
  // houver transmissão em andamento.
  if (controller.state === 'active') {
    await controller.start(deviceId || undefined);
  }
}

// A aba de permissão avisa quando o usuário decide, para atualizar os rótulos.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'soletra:permission-result') return;
  if (msg.state === 'granted') {
    lojaPermissao.definir(false);
    // ensureDeviceLabels destrava os nomes reais das câmeras; a mensagem vem
    // depois do refresh porque o aoMudarCamera() disparado por ele limpa o aviso.
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

/**
 * A busca é o único ponto em que algo sai do dispositivo. O seletor é o
 * consentimento: nada é enviado antes de o usuário apontar para onde, e fechar
 * sem escolher não dispara nada.
 */
async function pesquisar() {
  const termo = reconhecedor.composer.paraBusca();
  if (!termo) return;

  const plataforma = await escolherPlataforma(termo);
  if (!plataforma) return;

  // A pesquisa é executada pelo service worker: o painel lateral não é uma aba,
  // e pedir navegação daqui derrubava o navegador.
  try {
    const r = await chrome.runtime.sendMessage({ type: 'soletra:pesquisar', termo, plataforma });
    if (r?.ok === false) {
      showMessage(`Não foi possível abrir a pesquisa: ${r.erro}`, 'error');
    } else if (r?.via === 'google') {
      showMessage('Buscador padrão indisponível — a pesquisa foi aberta no Google.', 'info');
    }
  } catch (err) {
    showMessage(`Não foi possível abrir a pesquisa: ${err?.message || err}`, 'error');
  }
}

export const acoesReco = {
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
  definirMao: (mao) => reconhecedor.definirMao(mao),
  definirCameraEspelhada: (v) => reconhecedor.definirCameraEspelhada(v),
  pesquisar
};

/**
 * Instala o modelo pronto por baixo do treino pessoal. Não pede confirmação
 * aqui: na primeira abertura não há nada a perder, e a restauração posterior
 * confirma antes de chamar.
 */
async function carregarModeloPronto() {
  try {
    const r = await reconhecedor.instalarModeloPadrao();
    showMessage(
      `Modelo pronto carregado: ${r.amostras} amostras em ${r.classes} classes. ` +
        'Ligue o Reconhecimento para começar.',
      'info'
    );
  } catch (err) {
    showMessage(err?.message || 'Falha ao carregar o modelo pronto.', 'error');
  }
}

/**
 * Antes de gravar numa classe que vai passar do teto, diz o que será perdido.
 * O store descarta em silêncio — primeiro o padrão, depois a pessoal mais
 * antiga —, e sem este aviso uma letra que já funcionava podia piorar sem o
 * usuário entender por quê. Ceder só amostras do padrão é o reforço esperado,
 * então isso só informa; perder amostras do próprio usuário pede confirmação.
 * @returns {Promise<boolean>} se a captura deve começar
 */
async function avisarTeto(classe) {
  const total = reconhecedor.amostrasPorClasse[classe] || 0;
  const { padrao = 0 } = reconhecedor.origemPorClasse[classe] || {};
  const excesso = total + AMOSTRAS_RECOMENDADAS - AMOSTRAS_MAXIMAS;
  if (excesso <= 0) return true;

  const cedePadrao = Math.min(padrao, excesso);
  const cedePessoal = excesso - cedePadrao;
  if (cedePessoal === 0) {
    showMessage(
      `"${classe}" chegou ao limite de ${AMOSTRAS_MAXIMAS} amostras: ${cedePadrao} do modelo pronto ` +
        'vão dar lugar às que você gravar agora.',
      'info'
    );
    return true;
  }

  const partes = [`as ${cedePessoal} mais antigas que você gravou`];
  if (cedePadrao > 0) partes.push(`${cedePadrao} do modelo pronto`);
  return confirmar({
    titulo: total >= AMOSTRAS_MAXIMAS ? `"${classe}" já está cheia` : `"${classe}" vai passar do limite`,
    texto:
      `Cada classe guarda no máximo ${AMOSTRAS_MAXIMAS} amostras, e "${classe}" já tem ${total}. ` +
      `Gravar mais ${AMOSTRAS_RECOMENDADAS} vai descartar ${partes.join(' e ')}. ` +
      'Se a letra já é reconhecida bem, não precisa gravar mais; se piorou, apague a classe no × e grave de novo.',
    confirmar: 'Gravar mesmo assim',
    cancelar: 'Cancelar'
  });
}

export const acoesTreino = {
  async treinar(classe) {
    if (controller.state !== 'active') {
      showMessage('Inicie a câmera antes de treinar um sinal.', 'warn');
      return;
    }
    if (reconhecedor.estado === 'desligado') {
      showMessage('Ligue o Reconhecimento antes de treinar.', 'warn');
      return;
    }
    if (!(await avisarTeto(classe))) return;
    reconhecedor.iniciarCaptura(classe);
  },
  cancelarCaptura: () => reconhecedor.pararCaptura(),
  definirMao: (mao) => reconhecedor.definirMao(mao),
  definirCameraEspelhada: (v) => reconhecedor.definirCameraEspelhada(v),

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
      showMessage(`Modelo importado: ${r.amostras} amostras em ${r.classes} classes.`, 'info');
    } catch (err) {
      showMessage(err?.message || 'Falha ao importar o modelo.', 'error');
    }
  },

  // Primeira abertura: o próprio clique em "Usar modelo pronto" é a escolha.
  usarPadrao: carregarModeloPronto,

  async instalarPadrao() {
    // Com o modelo vazio não há treino a preservar nem nada a perder: o clique
    // já é a escolha, como no cartão de boas-vindas.
    if (reconhecedor.classificador.vazio) {
      await carregarModeloPronto();
      return;
    }
    const ok = await confirmar({
      titulo: 'Restaurar o modelo pronto?',
      texto:
        'As amostras do modelo pronto serão repostas em todas as classes. ' +
        'O que você treinou continua salvo e soma a elas.',
      confirmar: 'Restaurar',
      cancelar: 'Cancelar'
    });
    if (!ok) return;
    await carregarModeloPronto();
  },

  async apagarClasse(classe) {
    const { padrao = 0, pessoal = 0 } = reconhecedor.origemPorClasse[classe] || {};
    if (padrao > 0 && pessoal > 0) {
      const voltar = await confirmar({
        titulo: `Voltar "${classe}" ao modelo pronto?`,
        texto:
          `As ${pessoal} amostra(s) que você gravou para "${classe}" serão descartadas, ` +
          'e a classe volta a usar só as do modelo pronto. As outras classes continuam intactas.',
        confirmar: 'Voltar ao padrão',
        perigo: true
      });
      if (!voltar) return;
      await reconhecedor.restaurarClasse(classe);
      showMessage(`"${classe}" voltou ao modelo pronto.`, 'info');
      return;
    }

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
    showMessage(
      reconhecedor.padraoDisponivel
        ? 'Modelo apagado. Para voltar a usar o modelo pronto, clique em "Restaurar modelo pronto".'
        : 'Modelo apagado.',
      'info'
    );
  }
};

/** Ganchos dos botões de janela (ver janela.js). */
export const ganchosJanela = {
  estado: () => ({
    camera: controller.state === 'active',
    reco: reconhecedor.estado !== 'desligado'
  }),
  soltarCamera() {
    reconhecedor.desligar();
    controller.stop();
  },
  avisar: showMessage
};

window.addEventListener('pagehide', () => {
  controller.dispose();
  reconhecedor.dispose();
});

export async function iniciar() {
  // Antes de qualquer leitura: o produto se chamava "RVL Libras" e prefixava as
  // chaves com `rvl.`. Sem esta passada, o modelo treinado continuaria no disco
  // sob nomes que ninguém mais lê.
  await migrarChaves(chrome.storage.local);

  const permission = await CameraController.permissionState();
  const preferred = await loadPreferredDeviceId();

  await controller.ensureDeviceLabels();
  if (preferred && controller.devices.some((d) => d.deviceId === preferred)) {
    lojaDispositivo.definir(preferred);
  }
  aoMudarCamera({
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
    lojaPermissao.definir(true);
  } else if (permission !== 'granted') {
    showMessage('Clique em Iniciar câmera para autorizar o acesso.', 'info');
    lojaPermissao.definir(true);
  }

  // Carrega preferências e modelo do storage. Não toca no WASM: o detector só
  // nasce quando o usuário liga o Reconhecimento.
  await reconhecedor.iniciar();

  // Vindo da troca painel ↔ tela cheia: religa o que estava ligado do outro
  // lado. O consentimento é conferido de novo, mas já foi dado lá.
  const retomar = await lerRetomada();
  if (retomar?.camera) {
    await iniciarCamera();
    if (retomar.reco && controller.state === 'active' && (await consentimentoConcedido())) {
      await reconhecedor.ligar();
    }
  }

  if (reconhecedor.modeloIncompativel) {
    showMessage(
      'O modelo salvo foi gravado com outra versão da normalização e não pode ser usado. ' +
        'Treine os sinais novamente.',
      'warn'
    );
  }
}
