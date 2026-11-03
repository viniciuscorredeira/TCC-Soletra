/**
 * Soletra (modo dev) — metadados do teste de sinais: quando, com que versão e
 * modelo, em que navegador e câmera, quem e em que condições. Vai para o
 * cabeçalho do JSON, para um resultado poder ser reproduzido e comparado.
 *
 * Nada identifica a pessoa: o participante é um código (P1, P2…) digitado na
 * hora, e a câmera aparece só pelo nome do dispositivo.
 */
import { SignModelStore } from '../../src/sign-model-store.js';
import { lojaCamera, lojaReco } from '../../sidepanel/nucleo.js';
import { lojaDiagnostico } from '../diagnostico.js';
import { identidadeModelo } from '../identidade-modelo.js';

/**
 * Trocado pelo build dev (dev/vite.config.js) pelo commit do código. Um
 * identificador, e não uma string, pelo mesmo motivo do carimbo em recarga.js.
 */
// eslint-disable-next-line no-undef
const COMMIT = __SOLETRA_COMMIT__;

async function modelo() {
  try {
    const { indice, classes, origem } = await new SignModelStore().carregar();
    if (!indice) return null;
    const contar = (campo) => Object.values(origem).reduce((s, o) => s + o[campo], 0);
    return {
      sha256: await identidadeModelo({ versaoFeatures: indice.versaoFeatures, classes }),
      versaoFeatures: indice.versaoFeatures,
      classes: Object.keys(classes).length,
      amostras: contar('padrao') + contar('pessoal'),
      amostrasModeloPronto: contar('padrao'),
      amostrasPessoais: contar('pessoal'),
      mao: indice.mao ?? null,
      limiarDistanciaCalibrado: indice.tauAbs ?? null,
      k: indice.k ?? 5
    };
  } catch {
    return null;
  }
}

function camera() {
  const c = lojaCamera.ler();
  const s = c.track?.getSettings?.() ?? {};
  return {
    nome: c.devices?.find((d) => d.deviceId === c.activeDeviceId)?.label || null,
    largura: s.width ?? null,
    altura: s.height ?? null,
    fpsDeclarado: s.frameRate ?? null,
    fpsMedido: lojaDiagnostico.ler()?.fpsCamera ?? null
  };
}

/**
 * @param {object} quem
 * @param {string} quem.participante
 * @param {boolean|null} quem.gravouModeloPronto
 * @param {{iluminacao?: string, distancia?: string, observacoes?: string}} quem.condicoes
 */
export async function coletarMetadados({ participante, gravouModeloPronto, condicoes }) {
  const reco = lojaReco.ler() ?? {};
  return {
    dataHora: new Date().toISOString(),
    extensao: { versao: chrome.runtime.getManifest().version, commit: COMMIT },
    modelo: await modelo(),
    navegador: {
      userAgent: navigator.userAgent,
      nucleos: navigator.hardwareConcurrency ?? null,
      memoriaGB: navigator.deviceMemory ?? null
    },
    camera: camera(),
    ajustes: {
      rigor: reco.rigor ?? null,
      permanenciaMs: reco.permanencia ?? null,
      maoConfigurada: reco.mao ?? null,
      cameraInvertida: Boolean(reco.cameraEspelhada)
    },
    participante: participante || null,
    gravouModeloPronto: gravouModeloPronto ?? null,
    condicoes: {
      iluminacao: condicoes?.iluminacao || null,
      distancia: condicoes?.distancia || null,
      observacoes: condicoes?.observacoes || null
    }
  };
}
