import { useRef } from 'react';
import { Box, Button, Dialog, Flex, IconButton, Separator, Text } from '@radix-ui/themes';
import { ChevronRightIcon, Cross2Icon } from '@radix-ui/react-icons';
import { PLATAFORMAS, MARCAS } from '../../src/search-targets.js';
import { usarLoja } from '../../ui/loja.js';
import { lojaPlataforma, responderPlataforma } from '../seletor-plataforma.js';

const GENERICAS = PLATAFORMAS.filter((p) => p.generico);

/** Ladrilho com a logo da marca, ou com o glifo de quem não tem PNG. */
function Ladrilho({ p }) {
  if (p.icone) {
    return (
      <span className="plataforma__ladrilho">
        {/* Caminho relativo à raiz da extensão; o catálogo é compartilhado com
            o service worker e por isso não usa chrome.runtime.getURL. */}
        <img src={`../${p.icone}`} alt="" decoding="async" />
      </span>
    );
  }
  return (
    <span className="plataforma__ladrilho" style={p.cor ? { background: p.cor } : undefined}>
      {/* Conteúdo do próprio catálogo, nunca de entrada do usuário. */}
      <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: p.glifo }} />
    </span>
  );
}

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
          <Flex align="start" justify="between" gap="2" mb="3">
            <Dialog.Title size="4" mb="0">
              Onde pesquisar?
            </Dialog.Title>
            <IconButton
              variant="ghost"
              color="gray"
              size="1"
              aria-label="Fechar sem pesquisar"
              onClick={() => responderPlataforma(null)}
            >
              <Cross2Icon />
            </IconButton>
          </Flex>

          <Box className="termo">
            <Text as="div" size="1" color="gray" weight="medium">
              Termo reconhecido
            </Text>
            <Text as="div" size="4" weight="bold" className="termo__valor">
              {p.termo}
            </Text>
          </Box>

          <div className="plataformas">
            {MARCAS.map((m, i) => (
              <button
                key={m.id}
                ref={i === 0 ? primeiro : undefined}
                type="button"
                className="plataforma"
                aria-label={`Pesquisar em ${m.nome}`}
                onClick={() => responderPlataforma(m.id)}
              >
                <Ladrilho p={m} />
                <span className="plataforma__nome">{m.nome}</span>
              </button>
            ))}
          </div>

          <Flex align="center" gap="3" my="3">
            <Separator size="4" />
            <Text size="1" color="gray">
              ou
            </Text>
            <Separator size="4" />
          </Flex>

          {/* Em card, o destino genérico ficaria como uma marca sem logotipo;
              como linha, lê-se claramente como "a outra opção". */}
          {GENERICAS.map((g) => (
            <button
              key={g.id}
              type="button"
              className="plataforma plataforma--generica"
              aria-label={`Pesquisar no ${g.nome}`}
              onClick={() => responderPlataforma(g.id)}
            >
              <Ladrilho p={g} />
              <span className="plataforma__texto">
                <span className="plataforma__nome">{g.nome}</span>
                {g.descricao && <span className="plataforma__desc">{g.descricao}</span>}
              </span>
              <ChevronRightIcon className="plataforma__seta" aria-hidden="true" />
            </button>
          ))}

          <Dialog.Description size="1" color="gray" mt="3" align="center" as="p">
            O texto sai do seu dispositivo apenas para a plataforma que você escolher.
          </Dialog.Description>

          <Button variant="soft" color="gray" mt="3" className="largura-total" onClick={() => responderPlataforma(null)}>
            Cancelar
          </Button>
        </Dialog.Content>
      )}
    </Dialog.Root>
  );
}
