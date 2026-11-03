/**
 * Soletra (modo dev) — telas dos relatórios do teste de sinais.
 *
 * Só desenham o objeto que relatorio.js monta (o mesmo que vai para os
 * arquivos). O painel é estreito: tabelas largas rolam na horizontal, e a
 * matriz mostra só as colunas que tiveram algum valor.
 */
import { useState } from 'react';
import { Badge, Button, DataList, Flex, SegmentedControl, Table, Text } from '@radix-ui/themes';
import { ms, num, pct, seg } from '../formato.js';
import { RESULTADOS, relatorioUnitario } from './relatorio.js';
import { CORES_RESULTADO, NOMES_CATEGORIA, NOMES_COLUNA, NOMES_INICIO, NOMES_RESULTADO, nomeSinal } from './rotulos.js';

/** "0,29 (p10 0,18 · p90 0,52)" */
function faixa(d, casas = 2) {
  if (!d) return '—';
  return `${num(d.mediana, casas)} (p10 ${num(d.p10, casas)} · p90 ${num(d.p90, casas)})`;
}

function Item({ rotulo, children }) {
  return (
    <DataList.Item>
      <DataList.Label minWidth="140px">{rotulo}</DataList.Label>
      <DataList.Value className="numeros">{children}</DataList.Value>
    </DataList.Item>
  );
}

function Titulo({ children }) {
  return (
    <Text size="1" weight="bold" color="gray">
      {children}
    </Text>
  );
}

/**
 * Um selo por resultado que aconteceu (o de acerto sempre aparece), na ordem
 * de RESULTADOS: o chrome.storage devolve as chaves em ordem alfabética.
 */
function Resultados({ r }) {
  return (
    <Flex gap="1" wrap="wrap">
      {RESULTADOS.map((k) => [k, r[k] ?? 0])
        .filter(([k, n]) => n || k === 'acerto')
        .map(([k, n]) => (
          <Badge key={k} color={CORES_RESULTADO[k]} variant={n ? 'soft' : 'outline'}>
            {`${NOMES_RESULTADO[k]}: ${n}`}
          </Badge>
        ))}
    </Flex>
  );
}

/** Uma faixa por quadro da rodada, na cor da categoria. */
function LinhaDoTempo({ linha }) {
  if (!linha.length) return <Text size="1" color="gray">Nenhum quadro nesta rodada.</Text>;
  return (
    <div className="dev-tl" role="img" aria-label="Linha do tempo da rodada">
      {linha.map((q, i) => (
        <span key={i} className="dev-tl__q" data-c={q.categoria} title={`${seg(q.ms)}: ${q.classe ?? NOMES_CATEGORIA[q.categoria]}`} />
      ))}
    </div>
  );
}

function Legenda() {
  return (
    <Flex gap="3" wrap="wrap">
      {Object.entries(NOMES_CATEGORIA).map(([c, rotulo]) => (
        <Flex key={c} gap="1" align="center">
          <span className="dev-tl__q dev-tl__amostra" data-c={c} />
          <Text size="1" color="gray">{rotulo}</Text>
        </Flex>
      ))}
    </Flex>
  );
}

/** Números comuns aos dois relatórios (um sinal ou a sessão toda). */
function Agregado({ a, alvo }) {
  const q = a.quadros;
  return (
    <DataList.Root size="1">
      <Item rotulo="Acerto por rodada">{`${pct(a.acerto)} (${a.resultados.acerto} de ${a.rodadas})`}</Item>
      <Item rotulo="Acerto por quadro">{pct(a.acertoQuadros)}</Item>
      <Item rotulo="Tempo até reconhecer">
        {a.tempoMedioAteReconhecer !== null ? `média ${seg(a.tempoMedioAteReconhecer)} · mediana ${seg(a.tempoAteReconhecer?.mediana)}` : '—'}
      </Item>
      <Item rotulo="Confirmações erradas">
        {`${a.confirmacoesErradasAntes} antes de reconhecer · ${a.confirmacoesErradasNaGravacao} durante a gravação`}
      </Item>
      <Item rotulo="Quadros gravados">
        {`${q.certos} certos · ${q.outras} outra classe · ${q.rejeitados} rejeitados · ${q.semMao} sem mão · ${q.bloqueados} bloqueados`}
      </Item>
      {q.rejeitados > 0 && <Item rotulo="Rejeições">{`${q.ambiguos} ambíguas · ${q.distantes} distantes`}</Item>}
      <Item rotulo="Confundido com">
        {a.confusoes.length ? a.confusoes.slice(0, 5).map((c) => `${c.classe} (${c.quadros})`).join(', ') : 'nada'}
      </Item>
      <Item rotulo="Razão nos quadros certos">{faixa(a.razaoNosCertos)}</Item>
      <Item rotulo="Razão na confirmação">{faixa(a.razaoNaConfirmacao)}</Item>
      <Item rotulo={alvo ? `Distância até ${alvo}` : 'Distância até o pedido'}>{faixa(a.distanciaAlvo, 3)}</Item>
      <Item rotulo="Latência">{Number.isFinite(a.latencia.p50) ? `p50 ${ms(a.latencia.p50)} · p95 ${ms(a.latencia.p95)}` : '—'}</Item>
      <Item rotulo="Inferência">{Number.isFinite(a.hz) ? `${num(a.hz, 1)} Hz` : '—'}</Item>
    </DataList.Root>
  );
}

export function RelatorioUnitario({ r }) {
  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="1">
        <Text size="3" weight="bold">{`${nomeSinal(r.sinal)} · ${r.rodadas} rodada(s)`}</Text>
        {r.inicio && <Text size="1" color="gray">{`Início da rodada: ${NOMES_INICIO[r.inicio]}`}</Text>}
        <Resultados r={r.resultados} />
      </Flex>
      <Agregado a={r} alvo={r.sinal} />
      {r.ajustes && (
        <Text size="1" color="gray" className="numeros">
          {`Limites em uso: razão ${num(r.ajustes.limiarRazao)} · distância ${num(r.ajustes.limiarDistancia, 3)} · rigor ×${num(r.ajustes.rigor)} · confirmar em ${num(r.ajustes.permanencia, 0)} ms`}
        </Text>
      )}
      <Titulo>Rodadas</Titulo>
      {r.rodadasDetalhe.map((d) => (
        <Flex key={d.repeticao} direction="column" gap="1">
          <Flex gap="2" align="center" wrap="wrap">
            <Text size="1" weight="medium">{`Rodada ${d.repeticao}`}</Text>
            <Badge color={CORES_RESULTADO[d.resultado]}>
              {d.resultado === 'troca' ? `troca por ${d.reconhecido}` : NOMES_RESULTADO[d.resultado]}
            </Badge>
            <Text size="1" color="gray" className="numeros">
              {[
                Number.isFinite(d.tempoAteReconhecerMs) ? `reconhecida em ${seg(d.tempoAteReconhecerMs)}` : null,
                d.confirmacoesAntes.length ? `antes confirmou ${d.confirmacoesAntes.map((c) => c.classe).join(', ')}` : null,
                d.linhaDoTempo.length ? `${pct(d.acertoQuadros, 0)} dos quadros` : null,
                d.linhaDoTempo.length ? `maior sequência ${d.maiorSequencia.quadros} quadros` : null
              ].filter(Boolean).join(' · ')}
            </Text>
          </Flex>
          {d.resultado !== 'nao-reconhecido' && <LinhaDoTempo linha={d.linhaDoTempo} />}
        </Flex>
      ))}
      <Legenda />
    </Flex>
  );
}

function Matriz({ m }) {
  const totalLinha = (s) => Object.values(m.celulas[s] || {}).reduce((t, n) => t + n, 0);
  // Só as colunas com algum valor: com 31 classes, a matriz inteira não cabe.
  const colunas = m.colunas.filter((c) => m.linhas.some((s) => m.celulas[s]?.[c]));
  if (colunas.length === 0) return <Text size="1" color="gray">Nenhum quadro gravado.</Text>;
  return (
    <div className="dev-rolagem">
      <table className="dev-matriz numeros">
        <thead>
          <tr>
            <th scope="col">pedido ↓</th>
            {colunas.map((c) => <th key={c} scope="col">{NOMES_COLUNA[c] ?? c}</th>)}
          </tr>
        </thead>
        <tbody>
          {m.linhas.map((s) => (
            <tr key={s}>
              <th scope="row">{s}</th>
              {colunas.map((c) => {
                const n = m.celulas[s]?.[c] || 0;
                const total = totalLinha(s);
                return (
                  <td key={c} data-diagonal={c === s} data-vazio={!n} style={{ '--peso': total ? n / total : 0 }}>
                    {n || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RelatorioGeral({ arquivo }) {
  const r = arquivo.relatorio;
  const [sinal, setSinal] = useState(null);
  const [matriz, setMatriz] = useState('rodadas');

  if (sinal) {
    return (
      <Flex direction="column" gap="3">
        <Button variant="soft" color="gray" onClick={() => setSinal(null)}>← Voltar ao relatório geral</Button>
        <RelatorioUnitario r={relatorioUnitario(sinal, arquivo.rodadas)} />
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="1">
        <Text size="3" weight="bold">{`Relatório geral · ${r.sinais.length} sinais · ${r.resumo.rodadas} rodadas`}</Text>
        {r.inicio && <Text size="1" color="gray">{`Início da rodada: ${NOMES_INICIO[r.inicio]}`}</Text>}
        <Resultados r={r.resumo.resultados} />
        {r.resumo.puladas > 0 && <Text size="1" color="gray">{`${r.resumo.puladas} rodada(s) pulada(s), fora das taxas.`}</Text>}
      </Flex>
      <Agregado a={r.resumo} />

      <Titulo>Destaques</Titulo>
      <DataList.Root size="1">
        <Item rotulo="Piores sinais (por quadro)">
          {r.destaques.pioresSinais.map((s) => `${s.sinal} ${pct(s.acertoQuadros, 0)}`).join(' · ') || '—'}
        </Item>
        <Item rotulo="Pares mais confundidos">
          {r.destaques.paresConfundidos.map((p) => `${p.par} (${p.quadros})`).join(' · ') || 'nenhum'}
        </Item>
      </DataList.Root>

      <Titulo>Por sinal (clique para ver o relatório do sinal)</Titulo>
      <div className="dev-rolagem">
        <Table.Root size="1" variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Sinal</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Rod.</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Acerto</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Troca</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Rej.</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Tempo</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Não rec.</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Por quadro</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="end">Reconhece em</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {r.porSinal.map((s) => (
              <Table.Row key={s.sinal} className="dev-linha-clicavel" onClick={() => setSinal(s.sinal)}>
                <Table.RowHeaderCell><Button size="1" variant="ghost">{s.sinal}</Button></Table.RowHeaderCell>
                <Table.Cell justify="end" className="numeros">{s.rodadas}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{s.resultados.acerto}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{s.resultados.troca}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{s.resultados.rejeicao}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{s.resultados['tempo-esgotado']}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{s.resultados['nao-reconhecido']}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{pct(s.acertoQuadros, 0)}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{seg(s.tempoMedioAteReconhecer)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>

      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Titulo>Matriz de confusão</Titulo>
        <SegmentedControl.Root size="1" value={matriz} onValueChange={setMatriz} aria-label="Matriz por rodada ou por quadro">
          <SegmentedControl.Item value="rodadas">Por rodada</SegmentedControl.Item>
          <SegmentedControl.Item value="quadros">Por quadro</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Text size="1" color="gray">
        {matriz === 'rodadas'
          ? 'Linha: sinal pedido. Coluna: a primeira letra confirmada em cada rodada, ou o motivo de não ter havido (rejeição, tempo esgotado, não reconhecido).'
          : 'Linha: sinal pedido. Coluna: o que o classificador deu em cada quadro gravado.'}
      </Text>
      <Matriz m={matriz === 'rodadas' ? r.matrizRodadas : r.matrizQuadros} />
    </Flex>
  );
}
