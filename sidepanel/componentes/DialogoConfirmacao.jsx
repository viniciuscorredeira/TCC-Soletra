import { useRef } from 'react';
import { Box, Button, Dialog } from '@radix-ui/themes';
import { usarLoja } from '../../ui/loja.js';
import { lojaConfirmacao, responderConfirmacao } from '../dialogo.js';

/**
 * Desenha o pedido de dialogo.js. É um Dialog com role="alertdialog", e não o
 * AlertDialog do Radix, porque este ignora o clique fora — e aqui clicar fora
 * sempre foi "Não", a resposta segura. O Radix só conta como "fora" o clique
 * que COMEÇA fora da caixa: arrastar de dentro e soltar fora não cancela.
 */
export function DialogoConfirmacao() {
  const pedido = usarLoja(lojaConfirmacao);
  const ok = useRef(null);
  const nao = useRef(null);

  // O texto continua na caixa durante a animação de saída.
  const ultimo = useRef(pedido);
  if (pedido) ultimo.current = pedido;
  const p = pedido || ultimo.current;

  return (
    <Dialog.Root
      open={Boolean(pedido)}
      onOpenChange={(aberto) => {
        if (!aberto) responderConfirmacao(false);
      }}
    >
      {p && (
        <Dialog.Content
          role="alertdialog"
          size="2"
          maxWidth="340px"
          // Ação destrutiva: foco inicial no "Não", para que um Enter reflexo
          // não apague nada.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (p.perigo ? nao : ok).current?.focus();
          }}
          // Sem Trigger, o Radix não sabe a quem devolver o foco. Devolvê-lo
          // evita que o leitor de tela e o Tab recomecem do topo do painel.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            p.focoAnterior?.focus?.();
          }}
        >
          <Dialog.Title size="3" mb="2">
            {p.titulo}
          </Dialog.Title>
          <Dialog.Description size="2" color="gray">
            {p.texto}
          </Dialog.Description>
          <Box className="acoes" mt="4">
            <Button ref={nao} variant="soft" color="gray" onClick={() => responderConfirmacao(false)}>
              {p.rotuloNao}
            </Button>
            <Button
              ref={ok}
              color={p.perigo ? 'red' : undefined}
              className={p.perigo ? undefined : 'botao-marca'}
              onClick={() => responderConfirmacao(true)}
            >
              {p.rotuloOk}
            </Button>
          </Box>
        </Dialog.Content>
      )}
    </Dialog.Root>
  );
}
