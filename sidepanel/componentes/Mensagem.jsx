import { Callout } from '@radix-ui/themes';
import { CrossCircledIcon, ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { usarLoja } from '../../ui/loja.js';
import { lojaMensagem } from '../nucleo.js';

const TIPOS = {
  info: { cor: 'blue', Icone: InfoCircledIcon },
  warn: { cor: 'amber', Icone: ExclamationTriangleIcon },
  error: { cor: 'red', Icone: CrossCircledIcon }
};

/**
 * A região viva existe sempre, mesmo vazia: um leitor de tela só anuncia
 * mudanças numa região que já estava no documento antes delas.
 */
export function Mensagem() {
  const mensagem = usarLoja(lojaMensagem);
  const tipo = TIPOS[mensagem?.tipo] || TIPOS.info;

  return (
    <div role="status" aria-live="polite">
      {mensagem && (
        <Callout.Root color={tipo.cor} size="1" variant="surface">
          <Callout.Icon>
            <tipo.Icone />
          </Callout.Icon>
          <Callout.Text>{mensagem.texto}</Callout.Text>
        </Callout.Root>
      )}
    </div>
  );
}
