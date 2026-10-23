import { useEffect, useRef } from 'react';
import { Badge, Text } from '@radix-ui/themes';
import { VideoIcon } from '@radix-ui/react-icons';
import { usarLoja } from '../../ui/loja.js';
import { lojaCamera, lojaReco, video } from '../nucleo.js';
import { statusDe } from './status.js';

export function Palco() {
  const state = usarLoja(lojaCamera, (c) => c.state);
  // Uma câmera que espelha na origem já entrega a imagem como um espelho; o
  // scaleX(-1) do CSS a desespelharia, e quem sinaliza deixaria de se ver do
  // lado certo.
  const espelhada = usarLoja(lojaReco, (s) => Boolean(s?.cameraEspelhada));
  const encaixe = useRef(null);

  // O <video> é do núcleo, não do React: o React nunca mexe nos filhos deste
  // div, que por isso pode recebê-lo sem conflito de reconciliação.
  useEffect(() => {
    encaixe.current.append(video);
  }, []);

  const ativo = state === 'active';

  return (
    <section
      className="palco"
      data-ativo={ativo}
      data-espelhada={espelhada}
      aria-label="Pré-visualização da câmera"
    >
      <div ref={encaixe} className="palco__video" />
      {!ativo && (
        <div className="palco__vazio">
          <VideoIcon width="30" height="30" aria-hidden="true" />
          <Text size="1">{statusDe(state).placeholder}</Text>
        </div>
      )}
      {ativo && (
        <Badge color="red" variant="solid" size="1" className="palco__ao-vivo">
          AO VIVO
        </Badge>
      )}
    </section>
  );
}
