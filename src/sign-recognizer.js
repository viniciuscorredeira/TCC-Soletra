/**
 * Soletra — orquestrador do reconhecimento.
 *
 * Amarra adaptador, loop, normalização, classificador, estabilizador e
 * composição num só objeto que expõe UM callback de estado — o mesmo padrão do
 * CameraController, para que a UI continue sendo uma função de render(snapshot)
 * e não uma teia de listeners.
 *
 * É o único módulo impuro do fluxo: aqui mora o relógio real, o storage e a
 * inicialização do WASM. Tudo que tem lógica testável foi mantido fora.
 */
import { HandLandmarkerAdapter, DELEGATE_PADRAO } from './hand-landmarker.js';
import { InferenceLoop } from './inference-loop.js';
import { extrairFeatures } from './sign-features.js';
import { SignClassifier, calibrarTauAbs } from './sign-classifier.js';
import { SignStabilizer, PADROES_ESTABILIZADOR } from './sign-stabilizer.js';
import { TextComposer } from './text-composer.js';
import { SignModelStore, AMOSTRAS_RECOMENDADAS, VERSAO_CALIBRACAO } from './sign-model-store.js';
import { CONJUNTO_PADRAO, classesDoConjunto } from './sign-classes.js';
import { TravaMao } from './trava-mao.js';
import {
  lerModeloPadrao, calibrarModelo, instalarModeloPronto, CHAVE_ESCOLHA_PENDENTE
} from './modelo-pronto.js';

/** @typedef {'desligado'|'carregando'|'pronto'|'reconhecendo'|'treinando'|'erro'} EstadoReconhecimento */

const CHAVE_TEXTO = 'soletra.texto';
const CHAVE_PREFS = 'soletra.reconhecimento.prefs';

/** Intervalo entre amostras na captura de treino: amostras coladas no tempo
 *  são quase idênticas e inflam o modelo sem acrescentar variabilidade. */
const INTERVALO_CAPTURA = 150;

const oposta = (mao) => (mao === 'esquerda' ? 'direita' : 'esquerda');

export class SignRecognizer {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {(snapshot: object) => void} aoMudarEstado
   */
  constructor(videoEl, aoMudarEstado) {
    this.videoEl = videoEl;
    this.aoMudarEstado = aoMudarEstado;

    /** @type {EstadoReconhecimento} */
    this.estado = 'desligado';
    this.erro = null;
    this.mao = 'direita';
    this.conjunto = CONJUNTO_PADRAO;
    this.trava = new TravaMao();
    /**
     * Câmeras que espelham a imagem na origem, por deviceId. Por dispositivo e
     * não global: a Iriun pode espelhar e a webcam integrada não, e quem
     * alterna entre as duas não deveria ter de reconfigurar a cada troca.
     * @type {Record<string, boolean>}
     */
    this.espelhadas = {};
    this.deviceId = null;

    this.store = new SignModelStore();
    this.classificador = new SignClassifier();
    this.composer = new TextComposer({}, () => {
      this._persistirTexto();
      this._emitir();
    });

    this.estabilizador = new SignStabilizer({}, ({ classe }) => {
      this.composer.anexar(classe);
      this.ultimaConfirmacao = { classe, em: Date.now() };
    });

    this.loop = new InferenceLoop(videoEl, (video, ts) => this._processarQuadro(video, ts));

    this.adaptador = null;
    this.ultimaConfirmacao = null;
    this.amostrasPorClasse = {};
    /** @type {Record<string, {padrao: number, pessoal: number}>} */
    this.origemPorClasse = {};
    this.padraoDisponivel = false;
    /** Instalação nova com o modelo pronto: falta perguntar se fica com ele ou treina do zero. */
    this.escolhaInicialPendente = false;
    /** @type {{usados: number, quota: number, alerta: boolean}|null} */
    this.usoArmazenamento = null;
    this.modeloIncompativel = null;
    this.captura = null;
    this._ultimoSnapshotSinal = null;
    this._cameraAtiva = false;
    this._ligado = false;
  }

  // --- ciclo de vida -------------------------------------------------------

  /** Restaura preferências e o texto da sessão; não toca no WASM. */
  async iniciar() {
    try {
      const prefs = await chrome.storage.local.get(CHAVE_PREFS);
      const p = prefs?.[CHAVE_PREFS];
      if (p?.mao) this.mao = p.mao;
      if (p?.conjunto) this.conjunto = p.conjunto;
      if (Number.isFinite(p?.tPermanencia)) {
        this.estabilizador.opcoes.T_PERMANENCIA = p.tPermanencia;
      }
      if (Number.isFinite(p?.rigor)) this.classificador.rigor = p.rigor;
      if (p?.espelhadas && typeof p.espelhadas === 'object') this.espelhadas = { ...p.espelhadas };
    } catch { /* preferências são conveniência: seguir com os padrões */ }

    try {
      const sessao = await chrome.storage.session?.get(CHAVE_TEXTO);
      if (sessao?.[CHAVE_TEXTO]) this.composer.definir(sessao[CHAVE_TEXTO]);
    } catch { /* idem */ }

    try {
      const g = await chrome.storage.local.get(CHAVE_ESCOLHA_PENDENTE);
      this.escolhaInicialPendente = g?.[CHAVE_ESCOLHA_PENDENTE] === true;
    } catch { /* sem a marca, o cartão só aparece com o modelo vazio */ }

    this.padraoDisponivel = Boolean(await lerModeloPadrao());
    await this.recarregarModelo();
    this._emitir();
  }

  /**
   * Cria o detector sob demanda. Abrir o painel não pode pagar 20 MB de assets
   * e compilação de WASM por uma funcionalidade que o usuário talvez não use.
   */
  async ligar() {
    if (this._ligado) return true;
    this._ligado = true;

    if (!this.adaptador) {
      this._definirEstado('carregando');
      try {
        this.adaptador = await HandLandmarkerAdapter.criar({ delegate: DELEGATE_PADRAO });
      } catch (err) {
        this._ligado = false;
        this._definirEstado('erro', {
          code: 'landmarker-falhou',
          message: `Não foi possível carregar o reconhecedor: ${err?.message || err}`
        });
        return false;
      }
    }

    this._definirEstado(this._cameraAtiva ? 'reconhecendo' : 'pronto');
    this._sincronizarLoop();
    return true;
  }

  desligar() {
    this._ligado = false;
    this.loop.parar();
    this.estabilizador.reiniciar();
    this.captura = null;
    this._ultimoSnapshotSinal = null;
    this.trava.reiniciar();
    // O detector fica vivo de propósito: recriá-lo custa dezenas de ms e o
    // usuário que desliga costuma religar.
    this._definirEstado('desligado');
  }

  /**
   * Ponte com o CameraController: recebe a MESMA snapshot que a UI já consome,
   * o que evita criar um segundo canal de eventos para a mesma informação.
   */
  aoMudarCamera(snapshotCamera) {
    this._cameraAtiva = snapshotCamera?.state === 'active';
    const deviceId = snapshotCamera?.activeDeviceId || null;
    if (deviceId !== this.deviceId) {
      // Outra câmera pode inverter a imagem de outro jeito: a evidência
      // acumulada pela trava não vale mais.
      this.deviceId = deviceId;
      this.trava.reiniciar();
      this._emitir();
    }
    this._sincronizarLoop();
  }

  /** Se a câmera em uso espelha a imagem na origem, segundo o usuário. */
  get cameraEspelhada() {
    return Boolean(this.deviceId && this.espelhadas[this.deviceId]);
  }

  /**
   * Mão como ela aparece no quadro cru. Uma câmera que espelha na origem faz a
   * mão direita parecer a esquerda — para a normalização e para o handedness.
   */
  get _maoNaImagem() {
    return this.cameraEspelhada ? oposta(this.mao) : this.mao;
  }

  _sincronizarLoop() {
    const deveRodar = this._ligado && this._cameraAtiva && Boolean(this.adaptador);

    if (deveRodar && !this.loop.rodando) {
      this.estabilizador.reiniciar();
      this.loop.iniciar();
      this._definirEstado(this.captura ? 'treinando' : 'reconhecendo');
    } else if (!deveRodar && this.loop.rodando) {
      this.loop.parar();
      this.estabilizador.reiniciar();
      this.trava.reiniciar();
      this._ultimoSnapshotSinal = null;
      if (this._ligado) this._definirEstado('pronto');
    }
  }

  dispose() {
    this.loop.parar();
    this.adaptador?.fechar();
    this.adaptador = null;
  }

  // --- modelo --------------------------------------------------------------

  async recarregarModelo() {
    const { indice, classes, origem, incompativel } = await this.store.carregar();
    this.modeloIncompativel = incompativel;

    this.amostrasPorClasse = Object.fromEntries(
      Object.entries(classes).map(([c, a]) => [c, a.length])
    );
    this.origemPorClasse = origem;

    // Modelos gravados antes da correção do limiar trazem um τ_abs calculado
    // pela fórmula antiga, que rejeitava sinais legítimos. As amostras seguem
    // válidas — só o limiar derivado delas precisa ser refeito, e isso é
    // silencioso de propósito: o usuário não tem por que retreinar.
    let tauAbs = indice?.tauAbs ?? undefined;
    if (indice && Object.keys(classes).length > 0 && indice.versaoCalibracao !== VERSAO_CALIBRACAO) {
      tauAbs = calibrarTauAbs(classes);
      await this.store.atualizarParametros({
        tauAbs: Number.isFinite(tauAbs) ? tauAbs : null,
        versaoCalibracao: VERSAO_CALIBRACAO
      });
    }

    this.classificador.carregar(classes, { tauAbs });
    if (indice?.mao) this.mao = indice.mao;
    this._aplicarConjunto();

    // Medido aqui, e não a cada amostra: todo caminho que muda o modelo
    // (fim de captura, apagar, importar, instalar o padrão) passa por esta
    // função, e durante a captura as contagens por classe já mostram o avanço.
    try {
      this.usoArmazenamento = await this.store.bytesEmUso();
    } catch {
      this.usoArmazenamento = null;
    }

    this._emitir();
    return this.classificador;
  }

  _aplicarConjunto() {
    this.classificador.filtrarPor(classesDoConjunto(this.conjunto));
  }

  async definirConjunto(conjuntoId) {
    this.conjunto = conjuntoId;
    this._aplicarConjunto();
    this.estabilizador.reiniciar();
    await this._persistirPrefs();
    this._emitir();
  }

  async definirMao(mao) {
    this.mao = mao === 'esquerda' ? 'esquerda' : 'direita';
    this.trava.reiniciar();
    this.estabilizador.reiniciar();
    await this.store.atualizarParametros({ mao: this.mao });
    await this._persistirPrefs();
    this._emitir();
  }

  /** Marca a câmera em uso como espelhada (ou não). Sem câmera ativa, não há o que marcar. */
  async definirCameraEspelhada(espelhada) {
    if (!this.deviceId) return;
    if (espelhada) this.espelhadas[this.deviceId] = true;
    else delete this.espelhadas[this.deviceId];
    this.trava.reiniciar();
    this.estabilizador.reiniciar();
    await this._persistirPrefs();
    this._emitir();
  }

  async definirPermanencia(ms) {
    this.estabilizador.opcoes.T_PERMANENCIA = ms;
    await this._persistirPrefs();
    this._emitir();
  }

  async definirRigor(multiplicador) {
    this.classificador.rigor = multiplicador;
    await this._persistirPrefs();
    this._emitir();
  }

  async _persistirPrefs() {
    try {
      await chrome.storage.local.set({
        [CHAVE_PREFS]: {
          mao: this.mao,
          conjunto: this.conjunto,
          tPermanencia: this.estabilizador.opcoes.T_PERMANENCIA,
          rigor: this.classificador.rigor,
          espelhadas: this.espelhadas
        }
      });
    } catch { /* preferência perdida não quebra o fluxo */ }
  }

  /** O texto vai para storage.session: é efêmero por design e some ao fechar
   *  o navegador, que é também a escolha correta de privacidade. */
  _persistirTexto() {
    clearTimeout(this._timerTexto);
    this._timerTexto = setTimeout(() => {
      chrome.storage.session?.set({ [CHAVE_TEXTO]: this.composer.texto }).catch(() => {});
    }, 500);
  }

  // --- treino --------------------------------------------------------------

  iniciarCaptura(classe, alvo = AMOSTRAS_RECOMENDADAS) {
    this.captura = { classe, alvo, capturadas: 0, ultima: 0, erro: null };
    this.estabilizador.reiniciar();
    if (this.loop.rodando) this._definirEstado('treinando');
    this._emitir();
  }

  /**
   * Encerra a captura. O estado é derrubado e emitido ANTES da recalibração:
   * ela lê o modelo inteiro do storage e pode levar centenas de milissegundos,
   * e esperar por isso faria o Cancelar parecer travado justamente quando o
   * usuário quer sair.
   */
  async pararCaptura() {
    const tinha = Boolean(this.captura?.capturadas);
    this.captura = null;
    this.estado = this.loop.rodando ? 'reconhecendo' : this.estado;
    this._emitir();

    if (tinha) await this._recalibrar();
    this._emitir();
  }

  /**
   * Recalibra τ_abs a partir da dispersão interna das classes. Sem isso o KNN
   * aceita qualquer gesto como alguma letra — e uma constante fixa não
   * sobreviveria à troca de câmera ou de usuário.
   */
  async _recalibrar() {
    await calibrarModelo(this.store);
    await this.recarregarModelo();
  }

  async apagarModelo() {
    await this.store.limpar();
    await this.recarregarModelo();
  }

  /**
   * Apaga uma classe só. Uma letra que saiu ruim não deveria custar o modelo
   * inteiro — e τ_abs precisa ser recalibrado, porque a dispersão que o define
   * mudou com a remoção.
   */
  async apagarClasse(classe) {
    await this.store.removerClasse(classe);
    await this._recalibrar();
  }

  /**
   * Volta uma classe ao padrão, descartando só as amostras pessoais. Recalibra
   * pelo mesmo motivo de apagarClasse.
   */
  async restaurarClasse(classe) {
    await this.store.restaurarClasse(classe);
    await this._recalibrar();
  }

  /** Tira o modelo pronto e fica só com o que o usuário gravou. */
  async removerModeloPadrao() {
    await this.store.removerPadrao();
    await this._recalibrar();
  }

  /** O usuário escolheu no cartão de boas-vindas; ele não volta a aparecer por isso. */
  async concluirEscolhaInicial() {
    this.escolhaInicialPendente = false;
    try {
      await chrome.storage.local.remove(CHAVE_ESCOLHA_PENDENTE);
    } catch { /* na pior hipótese, o cartão aparece de novo na próxima abertura */ }
    this._emitir();
  }

  /**
   * Instala o modelo padrão por baixo das amostras pessoais (ver
   * src/modelo-pronto.js, que o service worker também usa na instalação).
   */
  async instalarModeloPadrao() {
    const objeto = await lerModeloPadrao();
    if (!objeto) throw new Error('O modelo padrão não está disponível nesta versão da extensão.');
    const r = await instalarModeloPronto(this.store, objeto);
    await this.recarregarModelo();
    return r;
  }

  async importarModelo(objeto, modo = 'substituir') {
    const r = await this.store.importar(objeto, modo);
    await this.recarregarModelo();
    return r;
  }

  exportarModelo() {
    return this.store.exportar();
  }

  // --- quadro --------------------------------------------------------------

  _processarQuadro(video, ts) {
    const t = performance.now();
    const deteccao = this.adaptador?.detectar(video, ts);

    if (!deteccao) {
      this._ultimoSnapshotSinal = this.estabilizador.processar({ t, temMao: false });
      this._emitir();
      return;
    }

    const features = extrairFeatures(deteccao.landmarks, {
      largura: video.videoWidth,
      altura: video.videoHeight,
      mao: this._maoNaImagem
    });

    if (!features) {
      this._ultimoSnapshotSinal = this.estabilizador.processar({ t, temMao: false });
      this._emitir();
      return;
    }

    // Mão diferente da configurada bloqueia a tradução e a captura: classificar
    // um sinal espelhado produz a letra errada com confiança alta, e gravá-lo
    // envenenaria o modelo. Para o estabilizador vale como "sem mão", o que
    // zera o candidato em formação.
    const vista = deteccao.handedness;
    const detectada = vista && this.cameraEspelhada ? oposta(vista) : vista;
    if (this.trava.processar({ detectada, confianca: deteccao.confiancaMao, esperada: this.mao })) {
      this._ultimoSnapshotSinal = {
        ...this.estabilizador.processar({ t, temMao: false }),
        estadoVisual: 'mao-incorreta'
      };
      this._emitir();
      return;
    }

    if (this.captura) {
      this._capturarAmostra(features, t);
      this._emitir();
      return;
    }

    const r = this.classificador.classificar(features);
    this._ultimoSnapshotSinal = this.estabilizador.processar({
      t,
      classe: r.classe,
      confianca: r.confianca,
      temMao: true
    });
    this._ultimoSnapshotSinal.proximidade = this.classificador.proximidade(r);
    this._emitir();
  }

  _capturarAmostra(features, t) {
    const c = this.captura;
    if (t - c.ultima < INTERVALO_CAPTURA) return;
    c.ultima = t;

    this.store
      .adicionarAmostra(c.classe, features, { mao: this.mao })
      .then((total) => {
        this.amostrasPorClasse[c.classe] = total;
        // No teto o store descarta padrão antes de pessoal, então a conta fecha
        // sem reler o storage: pessoais crescem até o total, o resto é padrão.
        const o = this.origemPorClasse[c.classe] || { padrao: 0, pessoal: 0 };
        const pessoal = Math.min(o.pessoal + 1, total);
        this.origemPorClasse[c.classe] = { pessoal, padrao: total - pessoal };
      })
      .catch((err) => {
        c.erro = err?.message || String(err);
      });

    c.capturadas++;
    if (c.capturadas >= c.alvo) this.pararCaptura();
  }

  // --- estado --------------------------------------------------------------

  _definirEstado(estado, erro = null) {
    this.estado = estado;
    this.erro = erro;
    this._emitir();
  }

  _emitir() {
    const sinal = this._ultimoSnapshotSinal;
    const stats = this.loop.estatisticas();

    this.aoMudarEstado({
      estado: this.estado,
      erro: this.erro,
      conjunto: this.conjunto,
      mao: this.mao,
      travaMao: this.trava.travada ? { maoVista: this.trava.maoVista } : null,
      cameraEspelhada: this.cameraEspelhada,
      temCamera: Boolean(this.deviceId),

      candidato: sinal?.candidato ?? null,
      progresso: sinal?.progresso ?? 0,
      travadoEm: sinal?.travadoEm ?? null,
      estadoVisual: sinal?.estadoVisual ?? 'sem-mao',
      proximidade: sinal?.proximidade ?? 0,
      ultimaConfirmacao: this.ultimaConfirmacao,

      texto: this.composer.texto,
      captura: this.captura ? { ...this.captura } : null,
      amostrasPorClasse: this.amostrasPorClasse,
      origemPorClasse: this.origemPorClasse,
      padraoDisponivel: this.padraoDisponivel,
      escolhaInicialPendente: this.escolhaInicialPendente,
      armazenamento: this.usoArmazenamento,
      modeloVazio: this.classificador.vazio,
      modeloIncompativel: this.modeloIncompativel,

      permanencia: this.estabilizador.opcoes.T_PERMANENCIA,
      permanenciaPadrao: PADROES_ESTABILIZADOR.T_PERMANENCIA,
      rigor: this.classificador.rigor,
      desempenho: stats
    });
  }
}
