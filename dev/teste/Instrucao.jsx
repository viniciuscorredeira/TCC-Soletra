/**
 * Soletra (modo dev) — o pedido do teste por cima do vídeo: qual sinal fazer,
 * a contagem para se preparar e o tempo que falta da rodada.
 *
 * Vai por portal para dentro do palco (o mesmo div que recebe o <video> e o
 * canvas do esqueleto), fora da árvore que o painel desenha.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usarLoja } from '../../ui/loja.js';
import { video } from '../../sidepanel/nucleo.js';
import { lojaTeste } from './controle.js';

const nomeSinal = (s) => (/^\d$/.test(s) ? 'o número' : 'a letra');

export function Instrucao() {
  const t = usarLoja(lojaTeste);
  const [palco, setPalco] = useState(null);

  // O <video> entra no palco num efeito do próprio palco; até lá, espera.
  useEffect(() => {
    if (palco) return undefined;
    const id = setInterval(() => video.parentElement && setPalco(video.parentElement), 200);
    return () => clearInterval(id);
  }, [palco]);

  const s = t.sessao;
  if (!palco || t.fase !== 'executando' || !s?.item) return null;

  const { fase, item, restanteMs, faseMs, indice, total } = s;
  const progresso = restanteMs !== null && faseMs ? 1 - restanteMs / faseMs : 0;

  return createPortal(
    <div className="dev-instrucao" data-fase={fase} aria-live="polite">
      <div className="dev-instrucao__topo">{`Rodada ${indice + 1} de ${total}`}</div>
      <div className="dev-instrucao__centro">
        {fase === 'aguardando' && (
          <>
            <span className="dev-instrucao__texto">{`Faça ${nomeSinal(item.sinal)}`}</span>
            <span className="dev-instrucao__sinal">{item.sinal}</span>
            <span className="dev-instrucao__texto">
              {'a rodada começa quando for reconhecido' +
                (restanteMs !== null ? ` · ${Math.ceil(restanteMs / 1000)} s` : '') +
                (s.erradasNaEspera ? ` · ${s.erradasNaEspera} errada(s)` : '')}
            </span>
          </>
        )}
        {fase === 'contagem' && (
          <>
            <span className="dev-instrucao__texto">{`Prepare ${nomeSinal(item.sinal)}`}</span>
            <span className="dev-instrucao__sinal">{item.sinal}</span>
            <span className="dev-instrucao__texto">{`baixe a mão · ${Math.ceil((restanteMs ?? 0) / 1000)}`}</span>
          </>
        )}
        {fase === 'gravando' && (
          <>
            <span className="dev-instrucao__texto">Agora! Mantenha</span>
            <span className="dev-instrucao__sinal">{item.sinal}</span>
            <span className="dev-instrucao__texto">{`${((restanteMs ?? 0) / 1000).toFixed(1).replace('.', ',')} s`}</span>
          </>
        )}
        {fase === 'pausada' && <span className="dev-instrucao__texto">Pausado</span>}
      </div>
      {(fase === 'contagem' || fase === 'gravando' || (fase === 'aguardando' && restanteMs !== null)) && (
        <div className="dev-instrucao__barra" style={{ '--p': progresso }} />
      )}
    </div>,
    palco
  );
}
