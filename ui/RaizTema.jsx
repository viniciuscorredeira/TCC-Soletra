import { Theme } from '@radix-ui/themes';

/**
 * Tema do Radix comum às páginas da extensão. "blue" e "slate" são os nomes
 * que o Radix conhece, mas as duas escalas são redefinidas em ui/paleta.css
 * com o azul da logo — por isso o tom não aparece aqui como cor literal.
 * @param {{aparencia: 'light' | 'dark', children: import('react').ReactNode}} props
 */
export function RaizTema({ aparencia, children }) {
  return (
    <Theme
      appearance={aparencia}
      accentColor="blue"
      grayColor="slate"
      radius="medium"
      scaling="95%"
      panelBackground="solid"
    >
      {children}
    </Theme>
  );
}
