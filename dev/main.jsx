/**
 * Soletra (modo dev) — ponto de entrada do painel lateral da versão dev.
 *
 * Monta o MESMO painel da produção (montarPainel) e acrescenta o diagnóstico no
 * fim da coluna. A dependência só anda neste sentido — nada fora de dev/
 * importa daqui (tests/regra-dev.test.mjs).
 */
import { montarPainel } from '../sidepanel/montar.jsx';
import './dev.css';
import { MARCADOR_DEV } from './marcador.js';
import { vigiarRecarga } from './recarga.js';
import { carregarPrefsDev } from './preferencias.js';
import { iniciarDiagnostico } from './diagnostico.js';
import { iniciarEsqueleto } from './esqueleto.js';
import { PainelDev } from './PainelDev.jsx';
import { PainelTeste } from './teste/PainelTeste.jsx';
import { Instrucao } from './teste/Instrucao.jsx';
import { PainelMedicao } from './medicao/PainelMedicao.jsx';

document.documentElement.dataset.soletraBuild = MARCADOR_DEV;

montarPainel({
  extras: (
    <>
      <PainelTeste />
      <PainelMedicao />
      <PainelDev />
      <Instrucao />
    </>
  )
});

// Selo fixo no canto: com as duas extensões abertas, evita testar na errada.
const selo = document.createElement('div');
selo.className = 'dev-selo';
selo.textContent = 'DEV';
selo.setAttribute('aria-hidden', 'true');
document.body.append(selo);

carregarPrefsDev();
iniciarDiagnostico();
iniciarEsqueleto();
vigiarRecarga();
