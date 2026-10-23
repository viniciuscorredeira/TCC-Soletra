import { Flex, Text } from '@radix-ui/themes';

/** Rótulo pequeno sobre um controle, como os campos do resto do painel. */
export function Campo({ rotulo, title, children }) {
  return (
    <Flex direction="column" gap="1" title={title}>
      <Text size="1" weight="medium" color="gray">
        {rotulo}
      </Text>
      {children}
    </Flex>
  );
}
