import { Card, Flex } from '@radix-ui/themes';
import { RaizTema } from '../ui/RaizTema.jsx';
import { useTema } from '../ui/tema.js';
import { Topo } from './componentes/Topo.jsx';
import { Palco } from './componentes/Palco.jsx';
import { Mensagem } from './componentes/Mensagem.jsx';
import { Controles } from './componentes/Controles.jsx';
import { SecaoReconhecimento } from './componentes/Reconhecimento.jsx';
import { Rodape } from './componentes/Rodape.jsx';
import { DialogoConfirmacao } from './componentes/DialogoConfirmacao.jsx';
import { SeletorPlataforma } from './componentes/SeletorPlataforma.jsx';

/**
 * @param {{children?: import('react').ReactNode}} props `children` entra no fim
 *   da coluna principal, depois do reconhecimento. O painel não passa nada; é o
 *   ponto onde um build pode acrescentar seções sem mexer nesta composição.
 */
export function App({ children }) {
  const { tema, aparencia, definir } = useTema();

  return (
    <RaizTema aparencia={aparencia}>
      <div className="app">
        <Topo tema={tema} definirTema={definir} />
        <main className="app__principal">
          {/* Câmera e reconhecimento em cartões irmãos: no tema claro, os
              controles soltos sobre o fundo se perdiam no branco. */}
          <Card size="2" asChild className="cartao">
            <section aria-label="Câmera">
              <Flex direction="column" gap="3">
                <Palco />
                <Controles />
              </Flex>
            </section>
          </Card>
          <Mensagem />
          <SecaoReconhecimento />
          {children}
        </main>
        <Rodape />
      </div>

      {/* Fora do <main>: os diálogos cobrem o painel inteiro, inclusive o vídeo. */}
      <DialogoConfirmacao />
      <SeletorPlataforma />
    </RaizTema>
  );
}
