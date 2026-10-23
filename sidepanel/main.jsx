import '@radix-ui/themes/styles.css';
import '../ui/paleta.css';
import '../ui/marca.css';
import './panel.css';
import { createRoot } from 'react-dom/client';
import { aplicarTemaInicial } from '../ui/tema.js';
import { App } from './App.jsx';
import { iniciar } from './nucleo.js';

aplicarTemaInicial();
createRoot(document.getElementById('raiz')).render(<App />);
iniciar();
