import { useRef } from 'react';
import { Button, Dialog, Flex, IconButton, Text } from '@radix-ui/themes';
import { ChevronRightIcon, Cross2Icon, LockClosedIcon } from '@radix-ui/react-icons';
import { PLATAFORMAS, MARCAS } from '../../src/search-targets.js';
import { usarLoja } from '../../ui/loja.js';
import { lojaPlataforma, responderPlataforma } from '../seletor-plataforma.js';

const GENERICAS = PLATAFORMAS.filter((p) => p.generico);

/** Ladrilho com a logo da marca, ou com o glifo de quem não tem PNG. */
function Ladrilho({ p }) {
  if (p.icone) {
    return (
      <span className="destino__ladrilho">
        {/* Caminho relativo à raiz da extensão; o catálogo é compartilhado com
            o service worker e por isso não usa chrome.runtime.getURL. */}
        <img src={`../${p.icone}`} alt="" decoding="async" />
      </span>
    );
  }
  return (
    <span className="destino__ladrilho" style={p.cor ? { background: p.cor } : undefined}>
      {/* Conteúdo do próprio catálogo, nunca de entrada do usuário. */}
      <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: p.glifo }} />
    </span>
  );
}

/** Uma linha da lista: logo, nome, o que se encontra lá e a seta de "ir". */
const Destino = ({ p, rotulo, ref }) => (
  <button
    ref={ref}
    type="button"
    className={p.generico ? 'destino destino--generico' : 'destino'}
    aria-label={rotulo}
    onClick={() => responderPlataforma(p.id)}
  >
    <Ladrilho p={p} />
    <span className="destino__texto">
      <span className="destino__nome">{p.nome}</span>
      {p.descricao && <span className="destino__desc">{p.descricao}</span>}
    </span>
    <ChevronRightIcon className="destino__seta" aria-hidden="true" />
  </button>
);

export function SeletorPlataforma() {
  const pedido = usarLoja(lojaPlataforma);
  const primeiro = useRef(null);

  // O termo continua na caixa durante a animação de saída.
  const ultimo = useRef(pedido);
  if (pedido) ultimo.current = pedido;
  const p = pedido || ultimo.current;

  return (
    <Dialog.Root
      open={Boolean(pedido)}
      onOpenChange={(aberto) => {
        if (!aberto) responderPlataforma(null);
      }}
    >
      {p && (
        <Dialog.Content
          size="2"
          maxWidth="360px"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            primeiro.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            p.focoAnterior?.focus?.();
          }}
        >
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between" gap="2">
              <Dialog.Title size="4" mb="0">
                Onde pesquisar?
              </Dialog.Title>
              <IconButton
                variant="ghost"
                color="gray"
                size="2"
                aria-label="Fechar sem pesquisar"
                onClick={() => responderPlataforma(null)}
              >
                <Cross2Icon />
              </IconButton>
            </Flex>

            <div className="termo">
              <Text as="div" size="1" color="gray" weight="medium" className="termo__rotulo">
                Termo reconhecido
              </Text>
              <Text as="div" size="5" weight="bold" className="termo__valor">
                {p.termo}
              </Text>
            </div>

            {/* Lista agrupada, e não grade de cartões: cinco marcas não fecham
                linhas iguais num painel estreito, e a linha deixa espaço para
                dizer o que se encontra em cada uma. */}
            <div className="destinos" role="group" aria-label="Plataformas">
              {MARCAS.map((m, i) => (
                <Destino
                  key={m.id}
                  p={m}
                  rotulo={`Pesquisar em ${m.nome}`}
                  ref={i === 0 ? primeiro : undefined}
                />
              ))}
            </div>

            {/* O destino genérico não é uma marca: fica num grupo à parte. */}
            <div className="destinos">
              {GENERICAS.map((g) => (
                <Destino key={g.id} p={g} rotulo={`Pesquisar no ${g.nome}`} />
              ))}
            </div>

            <Dialog.Description size="1" color="gray" as="p" className="aviso-envio">
              <LockClosedIcon aria-hidden="true" />
              O texto sai do seu dispositivo apenas para a plataforma que você escolher.
            </Dialog.Description>

            <Button variant="soft" color="gray" className="largura-total" onClick={() => responderPlataforma(null)}>
              Cancelar
            </Button>
          </Flex>
        </Dialog.Content>
      )}
    </Dialog.Root>
  );
}
