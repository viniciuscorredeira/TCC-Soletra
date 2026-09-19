/**
 * Confere a integridade dos binários do MediaPipe vendorizados em vendor/mediapipe.
 * Uso: node tools/verificar-vendor.mjs          (verifica)
 *      node tools/verificar-vendor.mjs --gerar  (regrava INTEGRIDADE.json)
 *
 * Os arquivos são commitados no repositório para que a extensão possa ser
 * carregada sem compactação direto do clone, sem passo de build e sem CDN — a
 * CSP do Manifest V3 proíbe script externo, e a revisão das lojas trata download
 * em runtime como "código remoto". O preço de commitar binário é não saber se
 * ele foi trocado; este script paga esse preço com SHA-256.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(RAIZ, 'vendor', 'mediapipe');
const MANIFESTO = join(VENDOR, 'INTEGRIDADE.json');

/** Versão fixada de propósito: `@latest` publica builds `rc.<data>` diários. */
export const VERSAO_TASKS_VISION = '1.0.1';

const BASE_NPM = `https://unpkg.com/@mediapipe/tasks-vision@${VERSAO_TASKS_VISION}`;
const BASE_MODELO =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1';

const ARQUIVOS = [
  { caminho: 'vision_bundle.mjs', origem: `${BASE_NPM}/vision_bundle.mjs` },
  { caminho: 'wasm/vision_wasm_internal.js', origem: `${BASE_NPM}/wasm/vision_wasm_internal.js` },
  { caminho: 'wasm/vision_wasm_internal.wasm', origem: `${BASE_NPM}/wasm/vision_wasm_internal.wasm` },
  { caminho: 'hand_landmarker.task', origem: `${BASE_MODELO}/hand_landmarker.task` }
];

function digerir(caminhoRelativo) {
  const bytes = readFileSync(join(VENDOR, caminhoRelativo));
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function gerar() {
  const manifesto = {
    pacote: '@mediapipe/tasks-vision',
    versao: VERSAO_TASKS_VISION,
    geradoEm: new Date().toISOString(),
    arquivos: ARQUIVOS.map((a) => ({ ...a, ...digerir(a.caminho) }))
  };
  writeFileSync(MANIFESTO, `${JSON.stringify(manifesto, null, 2)}\n`);
  console.log('gerado', MANIFESTO);
  for (const a of manifesto.arquivos) {
    console.log(`  ${a.sha256}  ${String(a.bytes).padStart(9)}  ${a.caminho}`);
  }
}

function verificar() {
  const manifesto = JSON.parse(readFileSync(MANIFESTO, 'utf8'));
  let falhas = 0;

  for (const esperado of manifesto.arquivos) {
    let obtido;
    try {
      obtido = digerir(esperado.caminho);
    } catch {
      console.error(`FALTA    ${esperado.caminho}`);
      falhas++;
      continue;
    }
    if (obtido.sha256 !== esperado.sha256) {
      console.error(`DIVERGE  ${esperado.caminho}`);
      console.error(`  esperado ${esperado.sha256} (${esperado.bytes} bytes)`);
      console.error(`  obtido   ${obtido.sha256} (${obtido.bytes} bytes)`);
      falhas++;
      continue;
    }
    console.log(`OK       ${esperado.caminho} (${obtido.bytes} bytes)`);
  }

  if (falhas > 0) {
    console.error(
      `\n${falhas} arquivo(s) fora do esperado. Rebaixe de ${BASE_NPM} e do modelo oficial,` +
        ' ou rode com --gerar se a troca foi intencional.'
    );
    process.exitCode = 1;
    return;
  }
  console.log(`\n${manifesto.arquivos.length} arquivos íntegros — tasks-vision ${manifesto.versao}.`);
}

if (process.argv.includes('--gerar')) gerar();
else verificar();
