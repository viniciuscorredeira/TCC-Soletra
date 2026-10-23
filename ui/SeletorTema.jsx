import { DropdownMenu, IconButton } from '@radix-ui/themes';
import { DesktopIcon, MoonIcon, SunIcon } from '@radix-ui/react-icons';

const OPCOES = {
  sistema: { rotulo: 'Sistema', Icone: DesktopIcon },
  claro: { rotulo: 'Claro', Icone: SunIcon },
  escuro: { rotulo: 'Escuro', Icone: MoonIcon }
};

/**
 * Botão de ícone com menu. Um controle segmentado de três posições não caberia
 * no topo de um painel lateral de 300 px ao lado do título e do status.
 * @param {{tema: import('./tema.js').Tema, definir: (t: string) => void}} props
 */
export function SeletorTema({ tema, definir }) {
  const atual = OPCOES[tema] || OPCOES.sistema;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <IconButton
          variant="ghost"
          color="gray"
          size="2"
          aria-label={`Tema: ${atual.rotulo}. Trocar tema`}
          title="Tema"
        >
          <atual.Icone />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" size="1">
        <DropdownMenu.Label>Tema</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={tema} onValueChange={definir}>
          {Object.entries(OPCOES).map(([id, { rotulo, Icone }]) => (
            <DropdownMenu.RadioItem key={id} value={id}>
              <Icone aria-hidden="true" />
              {rotulo}
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
