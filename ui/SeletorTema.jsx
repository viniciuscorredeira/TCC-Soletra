import { useRef, useState } from 'react';
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
 *
 * A escolha só é aplicada depois que o menu fecha: a troca de tema fotografa a
 * página antiga, e com o menu ainda aberto ele ficaria congelado na foto
 * enquanto a tinta se espalha. A tinta parte deste botão — também nas trocas
 * sem clique, que o acham pelo atributo de origem.
 * @param {{tema: import('./tema.js').Tema, definir: (t: string, origem?: Element | null) => void}} props
 */
export function SeletorTema({ tema, definir }) {
  const atual = OPCOES[tema] || OPCOES.sistema;
  const botao = useRef(null);
  const escolhido = useRef(null);
  // O ícone só gira quando a troca vem deste botão, e não ao abrir a página.
  const [girar, setGirar] = useState(false);

  function aoFechar() {
    const novo = escolhido.current;
    escolhido.current = null;
    if (!novo || novo === tema) return;
    setGirar(true);
    definir(novo, botao.current);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <IconButton
          ref={botao}
          data-origem-tema=""
          variant="ghost"
          color="gray"
          size="2"
          aria-label={`Tema: ${atual.rotulo}. Trocar tema`}
          title="Tema"
        >
          <atual.Icone key={tema} className={girar ? 'icone-tema--girar' : undefined} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" size="1" onCloseAutoFocus={aoFechar}>
        <DropdownMenu.Label>Tema</DropdownMenu.Label>
        <DropdownMenu.RadioGroup
          value={tema}
          onValueChange={(novo) => { escolhido.current = novo; }}
        >
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
