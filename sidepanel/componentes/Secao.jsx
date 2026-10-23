import { forwardRef } from 'react';
import { Accordion } from 'radix-ui';
import { ChevronRightIcon } from '@radix-ui/react-icons';

/**
 * Seção recolhível — uma única aparência para todas as do painel. O Radix
 * Themes não tem Accordion; este vem dos primitivos e ganha o visual em
 * panel.css, com as mesmas variáveis do tema.
 *
 * Sem `aberto`, a seção cuida do próprio estado. Com ele, quem a usa decide —
 * é o caso de "Treinar sinais", aberta por código a partir das boas-vindas.
 */
export const Secao = forwardRef(function Secao({ titulo, resumo, aberto, aoAlternar, children }, ref) {
  const controle =
    aberto === undefined
      ? {}
      : { value: aberto ? 'secao' : '', onValueChange: (v) => aoAlternar?.(v === 'secao') };

  return (
    <Accordion.Root type="single" collapsible className="secao" {...controle}>
      <Accordion.Item value="secao" ref={ref}>
        <Accordion.Header className="secao__cabecalho">
          <Accordion.Trigger className="secao__titulo">
            <ChevronRightIcon className="secao__seta" aria-hidden="true" />
            <span>{titulo}</span>
            {resumo ? <span className="secao__contador">{resumo}</span> : null}
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="secao__corpo">
          <div className="secao__conteudo">{children}</div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
});
