import '@radix-ui/themes/styles.css';
import '../ui/paleta.css';
import '../ui/marca.css';
import './panel.css';
import { createRoot } from 'react-dom/client';
import { aplicarTemaInicial } from '../ui/tema.js';
import { App } from './App.jsx';
import { iniciar } from './nucleo.js';

/**
 * Monta o painel. Separado de main.jsx para outro ponto de entrada poder montar
 * o MESMO painel acrescentando seções no fim da coluna (ver App).
 * @param {{extras?: import('react').ReactNode}} [opcoes]
 */
export function montarPainel({ extras = null } = {}) {
  aplicarTemaInicial();
  createRoot(document.getElementById('raiz')).render(<App>{extras}</App>);
  iniciar();
}
