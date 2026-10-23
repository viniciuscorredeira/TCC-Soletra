/**
 * Build da extensão. Uso: npm run build (ou npm run dev, que recompila a cada
 * alteração). A pasta carregada no navegador é dist/, não a raiz do projeto.
 *
 * As saídas mantêm os caminhos que o manifest.json já declara
 * (sidepanel/panel.html, permission/request.html, background/service-worker.js),
 * para o manifesto ser copiado tal como está.
 */
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const RAIZ = import.meta.dirname;

/**
 * O que a extensão lê em tempo de execução por chrome.runtime.getURL ou fetch
 * — binários do MediaPipe, modelo pronto, ícones e logos — vai para dist/ sem
 * passar pelo bundler. Copiar em vez de mover para public/ preserva os caminhos
 * de que tools/ e verificar-vendor dependem.
 */
const ESTATICOS = ['manifest.json', 'icons', 'vendor', 'modelos'];

function copiarEstaticos() {
  return {
    name: 'soletra:copiar-estaticos',
    writeBundle(opcoes) {
      for (const item of ESTATICOS) {
        cpSync(resolve(RAIZ, item), resolve(opcoes.dir, item), { recursive: true });
      }
    }
  };
}

export default defineConfig({
  root: RAIZ,
  base: './',
  publicDir: false,
  plugins: [react(), copiarEstaticos()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome114',
    // Chrome 114+ já entende modulepreload; o polyfill só somaria código.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        panel: resolve(RAIZ, 'sidepanel/panel.html'),
        request: resolve(RAIZ, 'permission/request.html'),
        'service-worker': resolve(RAIZ, 'background/service-worker.js')
      },
      output: {
        // O service worker precisa de um nome fixo: é o manifesto que aponta para ele.
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'background/service-worker.js' : 'assets/[name]-[hash].js'
      }
    }
  }
});
