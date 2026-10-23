/**
 * Página de topo usada só para disparar o prompt nativo de câmera. O painel
 * lateral não consegue exibi-lo; depois de concedida aqui, a permissão vale
 * para toda a origem chrome-extension:// da extensão.
 */
import { useEffect, useState } from 'react';
import { Accordion } from 'radix-ui';
import { Box, Button, Callout, Card, Code, Flex, Heading, Strong, Text } from '@radix-ui/themes';
import { CameraIcon, CheckCircledIcon, ChevronRightIcon, CrossCircledIcon } from '@radix-ui/react-icons';
import { describeMediaError } from '../src/camera-controller.js';
import { RaizTema } from '../ui/RaizTema.jsx';
import { SeletorTema } from '../ui/SeletorTema.jsx';
import { useTema } from '../ui/tema.js';

function notifyPanel(state) {
  // O painel pode estar fechado; a rejeição é esperada e não é um erro.
  chrome.runtime.sendMessage({ type: 'soletra:permission-result', state }).catch(() => {});
}

function Resultado({ resultado }) {
  // A região viva existe sempre, para o leitor de tela anunciar cada mudança.
  return (
    <div role="status" aria-live="polite">
      {resultado && (
        <Callout.Root color={resultado.tipo === 'ok' ? 'green' : 'red'} variant="surface" mt="4">
          <Callout.Icon>{resultado.tipo === 'ok' ? <CheckCircledIcon /> : <CrossCircledIcon />}</Callout.Icon>
          <Callout.Text>{resultado.texto}</Callout.Text>
        </Callout.Root>
      )}
    </div>
  );
}

export function Permissao() {
  const { tema, aparencia, definir } = useTema();
  const [pedindo, setPedindo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const show = (texto, tipo) => setResultado({ texto, tipo });

  async function requestPermission() {
    setPedindo(true);
    show('Aguardando sua resposta no aviso do navegador…', 'ok');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      // Só queremos o registro da permissão: libera a câmera imediatamente.
      stream.getTracks().forEach((track) => track.stop());

      show('Permissão concedida. Você já pode fechar esta aba e voltar ao painel lateral.', 'ok');
      notifyPanel('granted');
    } catch (err) {
      const info = describeMediaError(err);
      show(info.message, 'err');
      notifyPanel('denied');
    } finally {
      setPedindo(false);
    }
  }

  // Se a permissão já existe, evita fazer o usuário clicar à toa.
  useEffect(() => {
    (async () => {
      try {
        const status = await navigator.permissions.query({ name: 'camera' });
        if (status.state === 'granted') {
          show('A câmera já está autorizada. Pode voltar ao painel lateral.', 'ok');
          notifyPanel('granted');
        }
      } catch {
        /* navigator.permissions indisponível: segue pelo fluxo do botão. */
      }
    })();
  }, []);

  return (
    <RaizTema aparencia={aparencia}>
      <div className="pagina__topo">
        <SeletorTema tema={tema} definir={definir} />
      </div>
      <main className="pagina">
        <Card size="4" className="cartao" style={{ maxWidth: 520 }}>
          <Flex direction="column" gap="3">
            <Flex align="center" gap="3">
              <Box className="pagina__icone">
                <CameraIcon width="22" height="22" aria-hidden="true" />
              </Box>
              <Heading as="h1" size="5">
                Autorizar acesso à câmera
              </Heading>
            </Flex>
            <Text as="p" size="2">
              O Soletra precisa da sua permissão para exibir o vídeo da câmera no painel lateral. O
              navegador vai mostrar um aviso no topo desta aba — escolha <Strong>Permitir</Strong>.
            </Text>
            <Text as="p" size="2" color="gray">
              O vídeo é exibido apenas neste navegador. Nenhuma imagem é gravada ou enviada para
              servidores.
            </Text>

            <Box mt="1">
              <Button size="3" className="botao-marca" disabled={pedindo} onClick={requestPermission}>
                Solicitar permissão
              </Button>
              <Resultado resultado={resultado} />
            </Box>

            <Accordion.Root type="single" collapsible className="ajuda">
              <Accordion.Item value="ajuda">
                <Accordion.Header asChild>
                  <div>
                    <Accordion.Trigger className="ajuda__titulo">
                      <ChevronRightIcon className="ajuda__seta" aria-hidden="true" />
                      Já neguei antes. E agora?
                    </Accordion.Trigger>
                  </div>
                </Accordion.Header>
                <Accordion.Content>
                  <Text as="div" size="2" color="gray">
                    <ol>
                      <li>
                        Abra <Code>chrome://settings/content/camera</Code> (ou{' '}
                        <Code>edge://settings/content/camera</Code>).
                      </li>
                      <li>
                        Procure a entrada <Code>chrome-extension://{chrome.runtime.id}</Code> na lista
                        de bloqueados.
                      </li>
                      <li>Remova o bloqueio e recarregue esta aba.</li>
                    </ol>
                  </Text>
                </Accordion.Content>
              </Accordion.Item>
            </Accordion.Root>
          </Flex>
        </Card>
      </main>
    </RaizTema>
  );
}
