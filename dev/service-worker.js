/**
 * Soletra (modo dev) — service worker da versão dev.
 *
 * O da produção, importado tal como está (os ouvintes dele continuam
 * registrados no primeiro giro do módulo, como o Chrome exige), mais a recarga
 * automática. O build dev o grava como background/service-worker.js.
 */
import '../background/service-worker.js';
import { MARCADOR_DEV } from './marcador.js';
import { vigiarRecarga } from './recarga.js';

console.info(`[Soletra] ${MARCADOR_DEV}`);
vigiarRecarga();
