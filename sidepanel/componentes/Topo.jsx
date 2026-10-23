import { useEffect, useRef } from 'react';
import { Badge, Flex, Heading } from '@radix-ui/themes';
import { usarLoja } from '../../ui/loja.js';
import { SeletorTema } from '../../ui/SeletorTema.jsx';
import { lojaCamera, ganchosJanela } from '../nucleo.js';
import { montarJanela } from '../janela.js';
import { statusDe } from './status.js';

/**
 * Semáforo no estilo do macOS. Os rótulos e os cliques são de janela.js, que
 * os amarra uma única vez — a lógica de troca painel ↔ aba não depende do React.
 */
function Semaforo() {
  const fechar = useRef(null);
  const minimizar = useRef(null);
  const maximizar = useRef(null);

  useEffect(() => {
    montarJanela(ganchosJanela, {
      fechar: fechar.current,
      minimizar: minimizar.current,
      maximizar: maximizar.current
    });
  }, []);

  return (
    <div className="semaforo" role="group" aria-label="Janela">
      <button ref={fechar} type="button" className="semaforo__btn semaforo__btn--fechar"
        title="Fechar" aria-label="Fechar">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 3l4 4M7 3l-4 4" /></svg>
      </button>
      <button ref={minimizar} type="button" className="semaforo__btn semaforo__btn--minimizar">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 5h5" /></svg>
      </button>
      <button ref={maximizar} type="button" className="semaforo__btn semaforo__btn--maximizar">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 7V3.6L6.4 7Z M7 3v3.4L3.6 3Z" /></svg>
      </button>
    </div>
  );
}

export function Topo({ tema, definirTema }) {
  const state = usarLoja(lojaCamera, (c) => c.state);
  const status = statusDe(state);

  return (
    <Flex asChild align="center" justify="between" gap="2">
      <header className="topo">
        <Flex align="center" gap="3">
          <Semaforo />
          <Flex align="center" gap="2">
            {/* Ladrilho branco: as mãos azuis da logo sumiriam sobre a faixa azul. */}
            <span className="topo__selo">
              <img src="../icons/icon48.png" alt="" width="20" height="20" />
            </span>
            <Heading as="h1" size="3" weight="bold" className="topo__titulo">
              Soletra
            </Heading>
          </Flex>
        </Flex>
        <Flex align="center" gap="2">
          <Badge color={status.cor} variant="soft" radius="full" className="status" data-estado={state}>
            <span className="status__ponto" aria-hidden="true" />
            {status.label}
          </Badge>
          <SeletorTema tema={tema} definir={definirTema} />
        </Flex>
      </header>
    </Flex>
  );
}
