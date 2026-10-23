import '@radix-ui/themes/styles.css';
import '../ui/paleta.css';
import '../ui/marca.css';
import './request.css';
import { createRoot } from 'react-dom/client';
import { aplicarTemaInicial } from '../ui/tema.js';
import { Permissao } from './Permissao.jsx';

aplicarTemaInicial();
createRoot(document.getElementById('raiz')).render(<Permissao />);
