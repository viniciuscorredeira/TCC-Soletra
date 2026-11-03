/**
 * Build da versão dev. Uso: npm run build:dev (ou npm run dev:all, que
 * recompila as duas versões a cada alteração). Gera dist-dev/, que é carregada
 * no navegador ao lado de dist/.
 *
 * É a configuração da produção (criarConfig) com três diferenças:
 *  - o painel e o service worker saem dos pontos de entrada de dev/, gravados
 *    nos caminhos que o manifesto já declara;
 *  - na cópia, o manifesto recebe dev/manifest.dev.json por cima (nome,
 *    descrição e título) e os ícones são trocados pelos de dev/icons/;
 *  - no --watch, cada recompilação deixa um carimbo para dev/recarga.js;
 *  - o commit do código (git rev-parse) vai para dentro do bundle, para os
 *    relatórios do teste de sinais dizerem de que versão vieram.
 */
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { criarConfig, ENTRADAS, RAIZ } from '../vite.config.js';

const DEV = resolve(RAIZ, 'dev');

// Os mesmos textos de dev/recarga.js.
const MARCA_CARIMBO = '__SOLETRA_CARIMBO__';
const ARQUIVO_CARIMBO = 'dev/recarga.txt';
// O de dev/teste/metadados.js.
const MARCA_COMMIT = '__SOLETRA_COMMIT__';

/** Commit curto, com "-modificado" se havia alterações não commitadas no build. */
function commitAtual() {
  try {
    const git = (args) => execSync(`git ${args}`, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return git('rev-parse --short HEAD') + (git('status --porcelain') ? '-modificado' : '');
  } catch {
    return 'desconhecido';
  }
}

/** Mescla profunda: objetos se combinam, o resto é substituído. */
function mesclar(base, extra) {
  const saida = { ...base };
  for (const [chave, valor] of Object.entries(extra)) {
    const ambosObjetos = [valor, base[chave]].every((v) => v && typeof v === 'object' && !Array.isArray(v));
    saida[chave] = ambosObjetos ? mesclar(base[chave], valor) : valor;
  }
  return saida;
}

function modoDev() {
  let carimbo = '';
  let commit = '';
  return {
    name: 'soletra:modo-dev',

    buildStart() {
      carimbo = this.meta.watchMode ? String(Date.now()) : '';
      commit = commitAtual();
    },

    renderChunk(codigo) {
      if (!codigo.includes(MARCA_CARIMBO) && !codigo.includes(MARCA_COMMIT)) return null;
      const trocado = codigo
        .replaceAll(MARCA_CARIMBO, JSON.stringify(carimbo))
        .replaceAll(MARCA_COMMIT, JSON.stringify(commit));
      return { code: trocado, map: null };
    },

    // O HTML sai do Vite no caminho de origem (dev/panel.html). Os dois ficam a
    // uma pasta da raiz, então os caminhos relativos ../assets/ continuam certos.
    generateBundle: {
      order: 'post',
      handler(_opcoes, bundle) {
        const html = bundle['dev/panel.html'];
        delete bundle['dev/panel.html'];
        this.emitFile({ type: 'asset', fileName: 'sidepanel/panel.html', source: html.source });
      }
    },

    // Depois da cópia dos estáticos, que grava o manifesto e os ícones da produção.
    writeBundle: {
      order: 'post',
      sequential: true,
      handler({ dir }) {
        const manifesto = JSON.parse(readFileSync(resolve(RAIZ, 'manifest.json'), 'utf8'));
        const extra = JSON.parse(readFileSync(resolve(DEV, 'manifest.dev.json'), 'utf8'));
        writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(mesclar(manifesto, extra), null, 2) + '\n');
        cpSync(resolve(DEV, 'icons'), resolve(dir, 'icons'), { recursive: true });

        if (carimbo) {
          const arquivo = resolve(dir, ARQUIVO_CARIMBO);
          mkdirSync(dirname(arquivo), { recursive: true });
          writeFileSync(arquivo, carimbo);
        }
      }
    }
  };
}

export default defineConfig(
  criarConfig({
    outDir: 'dist-dev',
    entradas: {
      ...ENTRADAS,
      panel: resolve(DEV, 'panel.html'),
      'service-worker': resolve(DEV, 'service-worker.js')
    },
    plugins: [modoDev()]
  })
);
