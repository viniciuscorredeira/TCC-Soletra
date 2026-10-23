import { Button, Flex, Grid, Select, Text } from '@radix-ui/themes';
import { LockOpen1Icon, PlayIcon, ReloadIcon, StopIcon } from '@radix-ui/react-icons';
import { usarLoja } from '../../ui/loja.js';
import {
  lojaCamera,
  lojaDispositivo,
  lojaPermissao,
  iniciarCamera,
  pararCamera,
  recarregar,
  escolherDispositivo,
  abrirAbaPermissao
} from '../nucleo.js';

/**
 * Sem permissão, o navegador devolve todas as câmeras com deviceId vazio, e o
 * Select do Radix não aceita "" como valor de item. O índice entra no lugar e
 * volta a ser "" ao escolher, que é o que o controller espera nesse caso.
 */
const SEM_ID = '__camera-sem-id-';

function itensDe(devices) {
  return devices.map((device, index) => ({
    valor: device.deviceId || `${SEM_ID}${index}`,
    // O rótulo só vem preenchido depois que a permissão é concedida; sem ele
    // resta o índice, e o usuário não consegue distinguir os dispositivos.
    rotulo: device.label || `Câmera ${index + 1} (nome indisponível)`
  }));
}

export function Controles() {
  const { state, devices } = usarLoja(lojaCamera);
  const selecionado = usarLoja(lojaDispositivo);
  const pedirPermissao = usarLoja(lojaPermissao);

  const busy = state === 'requesting';
  const hasDevices = Boolean(devices?.length);
  const itens = itensDe(devices || []);
  const indice = (devices || []).findIndex((d) => d.deviceId === selecionado);
  // "" mostra o placeholder sem tirar o Select do modo controlado.
  const valor = indice >= 0 ? itens[indice].valor : '';

  const placeholder = devices === null ? 'Procurando câmeras…' : 'Nenhuma câmera detectada';

  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="1">
        <Text size="1" weight="medium" color="gray">
          Dispositivo
        </Text>
        <Select.Root
          value={valor}
          onValueChange={(v) => escolherDispositivo(v.startsWith(SEM_ID) ? '' : v)}
          disabled={busy || !hasDevices}
        >
          <Select.Trigger aria-label="Selecionar câmera" placeholder={placeholder} />
          <Select.Content position="popper">
            {itens.map((item) => (
              <Select.Item key={item.valor} value={item.valor}>
                {item.rotulo}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>

      <Grid columns="2" gap="2">
        <Button
          size="2"
          className="largura-total botao-marca"
          disabled={busy || state === 'active' || !hasDevices}
          onClick={iniciarCamera}
        >
          <PlayIcon /> Iniciar câmera
        </Button>
        <Button
          size="2"
          variant="soft"
          color="gray"
          disabled={busy || state !== 'active'}
          onClick={pararCamera}
        >
          <StopIcon /> Parar
        </Button>
        <Button
          size="2"
          variant="soft"
          color="gray"
          disabled={busy || !hasDevices}
          onClick={recarregar}
        >
          <ReloadIcon /> Recarregar
        </Button>
      </Grid>

      {pedirPermissao && (
        <Button size="2" variant="outline" onClick={abrirAbaPermissao}>
          <LockOpen1Icon /> Conceder acesso à câmera
        </Button>
      )}
    </Flex>
  );
}
