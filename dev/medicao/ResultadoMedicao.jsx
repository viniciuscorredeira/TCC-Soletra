/**
 * Soletra (modo dev) — telas do resultado da medição do modelo.
 *
 * Só desenham o arquivo da medição (o mesmo que vai para o JSON). O painel é
 * estreito: escolhe-se um conjunto e um tamanho de bloco, e uma vista de cada
 * vez. Os gráficos têm o número ao lado ou uma tabela logo abaixo, para nada
 * depender só da cor.
 */
import { useState } from 'react';
import { Badge, Callout, DataList, Flex, SegmentedControl, Select, Table, Text } from '@radix-ui/themes';
import { CheckCircledIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { usarLoja } from '../../ui/loja.js';
import { lojaReco } from '../../sidepanel/nucleo.js';
import { Campo } from '../../sidepanel/componentes/Campo.jsx';
import { NOMES_CONJUNTO, emOrdem } from '../../tools/medicao-modelo.js';
import { num, pct } from '../formato.js';

const VISTAS = [
  ['classes', 'Acerto por classe'],
  ['confusoes', 'Matriz de confusão'],
  ['razao', 'Razão vencedora/segunda'],
  ['corte', 'Efeito do corte da razão'],
  ['rigor', 'Efeito do rigor'],
  ['limiar', 'Limiar de distância'],
  ['pares', 'Pares mais próximos'],
  ['comparacao', 'Comparação entre modelos']
];

function Titulo({ children }) {
  return <Text size="1" weight="bold" color="gray">{children}</Text>;
}

function Nota({ children }) {
  return <Text size="1" color="gray">{children}</Text>;
}

function Item({ rotulo, children }) {
  return (
    <DataList.Item>
      <DataList.Label minWidth="150px">{rotulo}</DataList.Label>
      <DataList.Value className="numeros">{children}</DataList.Value>
    </DataList.Item>
  );
}

function ConferenciaTcc({ conf }) {
  if (!conf) return null;
  return conf.bate ? (
    <Callout.Root color="green" size="1">
      <Callout.Icon><CheckCircledIcon /></Callout.Icon>
      <Callout.Text>{`Confere com a tabela do TCC: ${conf.itens.length} de ${conf.itens.length} valores iguais.`}</Callout.Text>
    </Callout.Root>
  ) : (
    <Callout.Root color="amber" size="1">
      <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
      <Callout.Text>
        {`Não confere com a tabela do TCC: ${conf.itens.filter((i) => !i.bate)
          .map((i) => `${NOMES_CONJUNTO[i.conjunto]}, blocos de ${i.tamanhoBloco}: esperado ${pct(i.esperado)}, medido ${pct(i.medido)}`)
          .join('; ')}.`}
      </Callout.Text>
    </Callout.Root>
  );
}

function TabelaAcerto({ arquivo }) {
  const blocos = arquivo.parametros.blocos;
  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Conjunto</Table.ColumnHeaderCell>
          {blocos.map((b) => <Table.ColumnHeaderCell key={b} justify="end">{`Blocos de ${b}`}</Table.ColumnHeaderCell>)}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {emOrdem(arquivo.conjuntos).map(([id, c]) => (
          <Table.Row key={id}>
            <Table.RowHeaderCell>{`${NOMES_CONJUNTO[id]} (${c.classes.length})`}</Table.RowHeaderCell>
            {c.validacao.map((v) => <Table.Cell key={v.tamanhoBloco} justify="end" className="numeros">{pct(v.acerto)}</Table.Cell>)}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

// --- Vistas ----------------------------------------------------------------

function PorClasse({ c, v }) {
  const [ordem, setOrdem] = useState('pior');
  const nomes = ordem === 'pior'
    ? [...c.classes].sort((a, b) => v.porClasse[a].acerto - v.porClasse[b].acerto || a.localeCompare(b))
    : c.classes;
  return (
    <Flex direction="column" gap="2">
      <Flex justify="between" align="center" gap="2" wrap="wrap">
        <Nota>Fração das amostras de cada classe classificada certo, sem limiar nem teste de razão.</Nota>
        <SegmentedControl.Root size="1" value={ordem} onValueChange={setOrdem} aria-label="Ordem das classes">
          <SegmentedControl.Item value="pior">Pior primeiro</SegmentedControl.Item>
          <SegmentedControl.Item value="alfa">Em ordem</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <div className="dev-barras" role="list">
        {nomes.map((nome) => {
          const p = v.porClasse[nome];
          const confundida = p.confundidaCom.slice(0, 2).map((x) => `${x.classe} (${x.vezes})`).join(', ');
          return (
            <div
              key={nome}
              className="dev-barras__linha"
              role="listitem"
              title={`${nome}: ${p.acertos} de ${p.amostras} (${pct(p.acerto)})${confundida ? ` · confundida com ${confundida}` : ''}`}
            >
              <span className="dev-barras__nome">{nome}</span>
              <span className="dev-barras__trilho">
                <span className="dev-barras__valor" style={{ width: `${(p.acerto ?? 0) * 100}%` }} />
              </span>
              <span className="dev-barras__numero numeros">{pct(p.acerto, 0)}</span>
              <span className="dev-barras__extra">{confundida ? `→ ${confundida}` : ''}</span>
            </div>
          );
        })}
      </div>
    </Flex>
  );
}

function Confusoes({ c, v }) {
  return (
    <Flex direction="column" gap="2">
      <Nota>Linha: o sinal das amostras. Coluna: o que o classificador respondeu. A diagonal são os acertos.</Nota>
      <div className="dev-rolagem">
        <table className="dev-matriz">
          <thead>
            <tr>
              <th>sinal ↓</th>
              {c.classes.map((n) => <th key={n}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {c.classes.map((linha) => {
              const p = v.porClasse[linha];
              const contagem = Object.fromEntries(p.confundidaCom.map((x) => [x.classe, x.vezes]));
              contagem[linha] = p.acertos;
              return (
                <tr key={linha}>
                  <th>{linha}</th>
                  {c.classes.map((col) => {
                    const n = contagem[col] || 0;
                    return (
                      <td
                        key={col}
                        data-diagonal={col === linha}
                        data-vazio={n === 0}
                        style={{ '--peso': p.amostras ? n / p.amostras : 0 }}
                        title={`${linha} → ${col}: ${n}`}
                      >
                        {n || ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Text size="1" className="numeros">
        {`Mais frequentes: ${v.confusoes.slice(0, 8).map((x) => `${x.real}→${x.previsto} (${x.vezes})`).join(', ') || 'nenhuma'}`}
      </Text>
    </Flex>
  );
}

/**
 * Caixas da razão: bigode de p10 a p90, caixa de p25 a p75, traço na mediana.
 * Linhas verticais nos cortes 0,80 e 0,97 (o da extensão).
 */
function CaixasRazao({ v }) {
  const grupos = [
    { id: 'acertos', rotulo: 'Acertos', d: v.razao.acertos, cor: 'var(--green-9)' },
    { id: 'erros', rotulo: 'Erros', d: v.razao.erros, cor: 'var(--red-9)' }
  ];
  const maiorP90 = Math.max(...grupos.map((g) => g.d?.p90 ?? 0));
  const xMax = Math.min(2, Math.max(1.1, Math.ceil(maiorP90 * 1.1 * 10) / 10));
  const L = 300;
  const E = 64; // espaço dos rótulos à esquerda
  const x = (valor) => E + (Math.min(valor, xMax) / xMax) * (L - E - 8);
  const ticks = [];
  for (let t = 0; t <= xMax + 1e-9; t += 0.5) ticks.push(t);
  const linhaY = (i) => 22 + i * 30;

  return (
    <svg className="dev-caixas" viewBox={`0 0 ${L} 100`} role="img" aria-label="Distribuição da razão nos acertos e nos erros">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={8} y2={78} className="dev-caixas__grade" />
          <text x={x(t)} y={92} textAnchor="middle" className="dev-caixas__eixo">{num(t, 1)}</text>
        </g>
      ))}
      {[0.8, 0.97].map((corte) => (
        <g key={corte}>
          <line x1={x(corte)} x2={x(corte)} y1={4} y2={78} className={corte === 0.97 ? 'dev-caixas__corte dev-caixas__corte--atual' : 'dev-caixas__corte'} />
          {/* Os dois cortes ficam perto: um rótulo à esquerda da linha, o outro à direita. */}
          <text x={x(corte) + (corte === 0.97 ? 3 : -3)} y={4} dy="-0.1em" textAnchor={corte === 0.97 ? 'start' : 'end'} className="dev-caixas__eixo">
            {num(corte)}
          </text>
        </g>
      ))}
      {grupos.map((g, i) => {
        const y = linhaY(i) + 6;
        return (
          <g key={g.id}>
            <text x={0} y={y} dy="0.35em" className="dev-caixas__rotulo">{`${g.rotulo} (${g.d?.n ?? 0})`}</text>
            {g.d && (
              <g>
                <title>{`${g.rotulo}: p10 ${num(g.d.p10)} · p25 ${num(g.d.p25)} · mediana ${num(g.d.mediana)} · p75 ${num(g.d.p75)} · p90 ${num(g.d.p90)}`}</title>
                <line x1={x(g.d.p10)} x2={x(g.d.p90)} y1={y} y2={y} stroke={g.cor} strokeWidth="2" />
                <rect
                  x={x(g.d.p25)}
                  y={y - 8}
                  width={Math.max(2, x(g.d.p75) - x(g.d.p25))}
                  height={16}
                  rx={3}
                  fill={g.cor}
                  fillOpacity="0.3"
                  stroke={g.cor}
                  strokeWidth="1.5"
                />
                <line x1={x(g.d.mediana)} x2={x(g.d.mediana)} y1={y - 8} y2={y + 8} stroke={g.cor} strokeWidth="3" />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Razao({ v }) {
  const linhas = [['Acertos', v.razao.acertos], ['Erros', v.razao.erros]];
  return (
    <Flex direction="column" gap="2">
      <Nota>
        Distância à classe vencedora dividida pela distância à segunda. Perto de 0: sem concorrente. Perto de 1: empate.
        A extensão recusa acima de 0,97 (no rigor Normal).
      </Nota>
      <CaixasRazao v={v} />
      <div className="dev-rolagem">
        <Table.Root size="1">
          <Table.Header>
            <Table.Row>
              {['', 'n', 'mín', 'p10', 'p25', 'mediana', 'p75', 'p90', 'máx'].map((t) => (
                <Table.ColumnHeaderCell key={t} justify={t ? 'end' : 'start'}>{t}</Table.ColumnHeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {linhas.map(([rotulo, d]) => (
              <Table.Row key={rotulo}>
                <Table.RowHeaderCell>{rotulo}</Table.RowHeaderCell>
                <Table.Cell justify="end" className="numeros">{d?.n ?? 0}</Table.Cell>
                {['min', 'p10', 'p25', 'mediana', 'p75', 'p90', 'max'].map((k) => (
                  <Table.Cell key={k} justify="end" className="numeros">{num(d?.[k])}</Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>
    </Flex>
  );
}

function Corte({ v }) {
  return (
    <Flex direction="column" gap="2">
      <Nota>
        Se a extensão recusasse toda resposta com razão acima do corte: quantos acertos ela jogaria fora, quantos erros
        ela evitaria e o acerto que sobraria.
      </Nota>
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Corte</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell justify="end">Acertos descartados</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell justify="end">Erros barrados</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell justify="end">Acerto que sobra</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {v.cortes.map((x) => (
            <Table.Row key={x.corte}>
              <Table.RowHeaderCell className="numeros">
                {num(x.corte)} {x.corte === 0.97 && <Badge size="1" variant="soft">extensão</Badge>}
              </Table.RowHeaderCell>
              <Table.Cell justify="end" className="numeros">{`${pct(x.fracaoAcertosDescartados)} (${x.acertosDescartados})`}</Table.Cell>
              <Table.Cell justify="end" className="numeros">{`${pct(x.fracaoErrosBarrados, 0)} (${x.errosBarrados})`}</Table.Cell>
              <Table.Cell justify="end" className="numeros">{pct(x.acertoFinal)}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Flex>
  );
}

function Rigor({ v }) {
  const rigorAtual = usarLoja(lojaReco, (r) => r?.rigor);
  return (
    <Flex direction="column" gap="2">
      <Nota>
        Os três níveis do painel, com o limiar de distância e a razão multiplicados como na extensão. Acerto, rejeição e
        erro que passa somam 100%. Precisão: das respostas dadas, quantas estavam certas.
      </Nota>
      <div className="dev-rolagem">
        <Table.Root size="1" variant="surface">
          <Table.Header>
            <Table.Row>
              {['Rigor', 'Razão', 'Limiar', 'Acerto', 'Rejeição', 'Erro passa', 'Precisão'].map((t, i) => (
                <Table.ColumnHeaderCell key={t} justify={i ? 'end' : 'start'}>{t}</Table.ColumnHeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {v.rigor.map((r) => (
              <Table.Row key={r.nome}>
                <Table.RowHeaderCell>
                  <Flex gap="1" align="center">
                    {r.nome}
                    {Math.abs((rigorAtual ?? NaN) - r.multiplicador) < 1e-9 && <Badge size="1" variant="soft">atual</Badge>}
                  </Flex>
                </Table.RowHeaderCell>
                <Table.Cell justify="end" className="numeros">{num(r.razaoEfetiva)}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{num(r.limiarEfetivoMediano)}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{pct(r.acertoFinal)}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{pct(r.rejeicao)}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{pct(r.errosQuePassam)}</Table.Cell>
                <Table.Cell justify="end" className="numeros">{pct(r.precisao)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>
    </Flex>
  );
}

function Limiar({ c }) {
  const l = c.limiar;
  return (
    <Flex direction="column" gap="2">
      <DataList.Root size="1">
        <Item rotulo="Limiar calculado">{num(l.calibrado, 3)}</Item>
        <Item rotulo="Como">{`maior entre ${num(l.padrao, 1)} e 5 × ${num(l.p90MesmaClasse, 3)} = ${num(l.cincoVezesP90, 3)}`}</Item>
        <Item rotulo="Vizinha da mesma classe">{`mediana ${num(l.distanciaMesmaClasse?.mediana, 3)}`}</Item>
        <Item rotulo="Vizinha de outra classe">{`mediana ${num(l.distanciaOutraClasse?.mediana, 3)} · mínimo ${num(l.distanciaOutraClasse?.min, 3)}`}</Item>
        {l.porRigor.map((r) => (
          <Item key={r.nome} rotulo={`Abaixo do limiar (${r.nome})`}>
            {`${pct(r.fracao)} das amostras (${r.amostrasComOutraClasseAbaixo}) têm uma de outra classe a menos de ${num(r.limiar, 3)}`}
          </Item>
        ))}
      </DataList.Root>
      <Nota>
        O limiar é calculado sobre o modelo inteiro, como na extensão (5 × o p90 da distância de cada amostra à vizinha
        da mesma classe). Ele só barra o que está longe de tudo: entre duas classes treinadas, quem decide é o voto e a razão.
      </Nota>
    </Flex>
  );
}

function Pares({ arquivo }) {
  const pares = arquivo.paresMaisProximos || [];
  const maior = Math.max(...pares.map((p) => p.distanciaMediana), 1e-9);
  return (
    <Flex direction="column" gap="2">
      <Nota>Mediana da distância de cada amostra à vizinha mais próxima da outra classe, no modelo inteiro. Menor = mais parecidos.</Nota>
      <div className="dev-barras" role="list">
        {pares.map((p) => (
          <div key={p.par} className="dev-barras__linha dev-barras__linha--par" role="listitem" title={`${p.par}: mediana ${num(p.distanciaMediana, 3)} · menor ${num(p.menor, 3)}`}>
            <span className="dev-barras__nome">{p.par}</span>
            <span className="dev-barras__trilho">
              <span className="dev-barras__valor dev-barras__valor--neutro" style={{ width: `${(p.distanciaMediana / maior) * 100}%` }} />
            </span>
            <span className="dev-barras__numero numeros">{num(p.distanciaMediana, 3)}</span>
          </div>
        ))}
      </div>
    </Flex>
  );
}

function Comparacao({ arquivo, id }) {
  const cmp = arquivo.comparacao;
  if (!cmp) {
    return <Nota>Esta medição não comparou modelos. Escolha um em "Comparar com" antes de medir.</Nota>;
  }
  const este = arquivo.conjuntos[id];
  const outro = cmp.conjuntos[id];
  const sentidos = [
    [arquivo.arquivo, cmp.arquivo, cmp.cruzado.desteParaOutro[id]],
    [cmp.arquivo, arquivo.arquivo, cmp.cruzado.doOutroParaEste[id]]
  ];
  return (
    <Flex direction="column" gap="3">
      <Table.Root size="1" variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>Validação em blocos</Table.ColumnHeaderCell>
            {este.validacao.map((v) => <Table.ColumnHeaderCell key={v.tamanhoBloco} justify="end">{`Blocos de ${v.tamanhoBloco}`}</Table.ColumnHeaderCell>)}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.RowHeaderCell>{arquivo.arquivo}</Table.RowHeaderCell>
            {este.validacao.map((v) => <Table.Cell key={v.tamanhoBloco} justify="end" className="numeros">{pct(v.acerto)}</Table.Cell>)}
          </Table.Row>
          <Table.Row>
            <Table.RowHeaderCell>{cmp.arquivo}</Table.RowHeaderCell>
            {este.validacao.map((v) => (
              <Table.Cell key={v.tamanhoBloco} justify="end" className="numeros">
                {pct(outro?.validacao.find((x) => x.tamanhoBloco === v.tamanhoBloco)?.acerto)}
              </Table.Cell>
            ))}
          </Table.Row>
        </Table.Body>
      </Table.Root>

      <Titulo>Treinado com um, testado com o outro</Titulo>
      {sentidos.map(([treino, teste, x]) => (
        <Flex key={treino} direction="column" gap="1" className="dev-cartao">
          <Text size="1" weight="medium">{`Treinado com ${treino}, testado com ${teste}`}</Text>
          {x ? (
            <Text size="1" className="numeros">
              {`${pct(x.acerto)} sem cortes · rigor Normal: ${pct(x.normal.acertoFinal)} de acerto, ${pct(x.normal.rejeicao)} de rejeição, ${pct(x.normal.errosQuePassam)} de erros que passam`}
              {x.confusoes.length ? ` · troca mais: ${x.confusoes.slice(0, 4).map((k) => `${k.real}→${k.previsto} (${k.vezes})`).join(', ')}` : ''}
            </Text>
          ) : (
            <Nota>Sem classes em comum suficientes neste conjunto.</Nota>
          )}
        </Flex>
      ))}
      <Nota>
        É a medida de generalização: com o treino pessoal de um lado e o modelo pronto do outro, diz o quanto o modelo
        pronto reconhece a sua mão sem você treinar.
      </Nota>
    </Flex>
  );
}

export function ResultadoMedicao({ arquivo }) {
  const ids = emOrdem(arquivo.conjuntos).map(([id]) => id);
  const [conjunto, setConjunto] = useState(ids[0]);
  const [bloco, setBloco] = useState(String(arquivo.parametros.blocos[0]));
  const [vista, setVista] = useState('classes');
  const c = arquivo.conjuntos[conjunto] ?? arquivo.conjuntos[ids[0]];
  const v = c.validacao.find((x) => String(x.tamanhoBloco) === bloco) ?? c.validacao[0];
  const usaBloco = ['classes', 'confusoes', 'razao', 'corte', 'rigor'].includes(vista);

  return (
    <Flex direction="column" gap="3">
      <ConferenciaTcc conf={arquivo.conferenciaTcc} />
      {(arquivo.avisos ?? []).map((aviso) => (
        <Callout.Root key={aviso} color="amber" size="1">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{aviso}</Callout.Text>
        </Callout.Root>
      ))}

      <Titulo>Acerto por validação em blocos (sem limiar e sem teste de razão)</Titulo>
      <TabelaAcerto arquivo={arquivo} />

      <Flex gap="3" wrap="wrap">
        <Campo rotulo="Conjunto">
          <SegmentedControl.Root size="1" value={conjunto} onValueChange={setConjunto} aria-label="Conjunto">
            {ids.map((id) => <SegmentedControl.Item key={id} value={id}>{NOMES_CONJUNTO[id]}</SegmentedControl.Item>)}
          </SegmentedControl.Root>
        </Campo>
        <Campo rotulo="Blocos">
          <SegmentedControl.Root size="1" value={bloco} onValueChange={setBloco} aria-label="Tamanho do bloco" disabled={!usaBloco}>
            {arquivo.parametros.blocos.map((b) => <SegmentedControl.Item key={b} value={String(b)}>{`de ${b}`}</SegmentedControl.Item>)}
          </SegmentedControl.Root>
        </Campo>
      </Flex>
      <Campo rotulo="Ver">
        <Select.Root value={vista} onValueChange={setVista}>
          <Select.Trigger aria-label="Ver" />
          <Select.Content>
            {VISTAS.map(([id, rotulo]) => <Select.Item key={id} value={id}>{rotulo}</Select.Item>)}
          </Select.Content>
        </Select.Root>
      </Campo>

      {vista === 'classes' && <PorClasse c={c} v={v} />}
      {vista === 'confusoes' && <Confusoes c={c} v={v} />}
      {vista === 'razao' && <Razao v={v} />}
      {vista === 'corte' && <Corte v={v} />}
      {vista === 'rigor' && <Rigor v={v} />}
      {vista === 'limiar' && <Limiar c={c} />}
      {vista === 'pares' && <Pares arquivo={arquivo} />}
      {vista === 'comparacao' && <Comparacao arquivo={arquivo} id={conjunto} />}
    </Flex>
  );
}
