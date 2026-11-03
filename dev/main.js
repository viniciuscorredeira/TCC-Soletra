/**
 * Soletra (modo dev) — ponto de entrada do painel lateral da versão dev.
 *
 * Importa o ponto de entrada da produção em vez de copiá-lo: o painel dev é o
 * painel de sempre, mais o que vier de dev/. A dependência só anda neste
 * sentido — nada fora de dev/ importa daqui (tests/regra-dev.test.mjs).
 */
import '../sidepanel/main.jsx';
import './dev.css';
import { MARCADOR_DEV } from './marcador.js';
import { vigiarRecarga } from './recarga.js';

document.documentElement.dataset.soletraBuild = MARCADOR_DEV;

// Selo fixo no canto: com as duas extensões abertas, evita testar na errada.
const selo = document.createElement('div');
selo.className = 'dev-selo';
selo.textContent = 'DEV';
selo.setAttribute('aria-hidden', 'true');
document.body.append(selo);

vigiarRecarga();
