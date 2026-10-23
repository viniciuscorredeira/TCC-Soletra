import { Flex, Text } from '@radix-ui/themes';
import { LockClosedIcon } from '@radix-ui/react-icons';
import { usarLoja } from '../../ui/loja.js';
import { lojaCamera, describeTrack } from '../nucleo.js';

export function Rodape() {
  const { state, track } = usarLoja(lojaCamera);

  return (
    <Flex asChild justify="between" align="center" gap="1" wrap="wrap">
      <footer className="rodape">
        <Text size="1" color="gray" className="numeros">
          {state === 'active' ? describeTrack(track) : '—'}
        </Text>
        <Text size="1" color="gray">
          <Flex as="span" align="center" gap="1">
            <LockClosedIcon aria-hidden="true" /> Vídeo processado localmente
          </Flex>
        </Text>
      </footer>
    </Flex>
  );
}
