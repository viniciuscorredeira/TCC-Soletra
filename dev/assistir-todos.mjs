/**
 * Recompila as duas versões a cada alteração. Uso: npm run dev:all
 *
 * Dois `vite build --watch` no mesmo processo, pela API do Vite — sem depender
 * de um pacote para rodar comandos em paralelo. dist/ precisa de ↻ em
 * chrome://extensions depois de cada recompilação; dist-dev/ recarrega sozinha
 * (dev/recarga.js).
 */
import { resolve } from 'node:path';
import { build } from 'vite';

const RAIZ = resolve(import.meta.dirname, '..');

const VERSOES = [
  { nome: 'produção', configFile: resolve(RAIZ, 'vite.config.js') },
  { nome: 'dev', configFile: resolve(RAIZ, 'dev/vite.config.js') }
];

for (const { nome, configFile } of VERSOES) {
  const observador = await build({ configFile, logLevel: 'warn', build: { watch: {} } });
  observador.on('event', (evento) => {
    if (evento.code === 'END') console.log(`[${nome}] recompilado ${new Date().toLocaleTimeString('pt-BR')}`);
    if (evento.code === 'ERROR') console.error(`[${nome}] erro:`, evento.error?.message ?? evento.error);
    evento.result?.close?.();
  });
}

console.log('Observando dist/ e dist-dev/. Ctrl+C para sair.');
