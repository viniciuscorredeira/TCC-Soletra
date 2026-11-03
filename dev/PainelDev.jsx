/**
 * Soletra (modo dev) — painel de diagnóstico ao vivo.
 *
 * Só desenha o que dev/diagnostico.js agrega dos quadros do reconhecedor, e as
 * chaves do desenho da mão. Números na tela com vírgula decimal, como no TCC.
 */
import { Badge, DataList, Flex, Separator, Switch, Table, Text } from '@radix-ui/themes';
import { usarLoja } from '../ui/loja.js';
import { lojaReco } from '../sidepanel/nucleo.js';
import { Secao } from '../sidepanel/componentes/Secao.jsx';
import { lojaDiagnostico } from './diagnostico.js';
import { lojaPrefsDev, definirPrefDev } from './preferencias.js';

const RIGORES = { 1.25: 'Tolerante', 1: 'Normal', 0.8: 'Exigente' };

/** Símbolos do estabilizador que não são classes. */
const SIMBOLOS = { 'sem-mao': 'sem mão', desconhecido: 'rejeitado', indefinido: 'indefinido' };

const ESTADOS = {
  'sem-mao': 'sem mão',
  desconhecido: 'rejeitado',
  formando: 'formando',
  travado: 'travado',
  'mao-incorreta': 'mão bloqueada'
};

function num(v, casas = 2) {
  return Number.isFinite(v)
    ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
    : '—';
}

const ms = (v) => (Number.isFinite(v) ? `${num(v, 1)} ms` : '—');

function ha(evento, agora) {
  if (!evento) return '—';
  return `há ${num(Math.max(0, agora - evento.em) / 1000, 1)} s`;
}

function decisaoDe(d) {
  if (!d.ativo) return { texto: 'Reconhecimento parado', cor: 'gray' };
  if (d.captura) return { texto: 'Gravando amostras (não classifica)', cor: 'gray' };
  if (d.maoBloqueada) return { texto: 'Bloqueada: mão diferente da configurada', cor: 'red' };
  if (!d.temMao) return { texto: 'Sem mão', cor: 'gray' };
  if (d.classe) return { texto: `Aceita: ${d.classe}`, cor: 'green' };
  if (d.motivo === 'ambiguo') return { texto: 'Rejeitada: ambígua (razão acima do limite)', cor: 'amber' };
  if (d.motivo === 'distante') return { texto: 'Rejeitada: distante (acima do limiar)', cor: 'amber' };
  return { texto: '—', cor: 'gray' };
}

function Item({ rotulo, children }) {
  return (
    <DataList.Item>
      <DataList.Label minWidth="128px">{rotulo}</DataList.Label>
      <DataList.Value className="numeros">{children}</DataList.Value>
    </DataList.Item>
  );
}

function Grupo({ titulo, children }) {
  return (
    <Flex direction="column" gap="2">
      <Text size="1" weight="bold" color="gray">
        {titulo}
      </Text>
      <DataList.Root size="1" orientation="horizontal">
        {children}
      </DataList.Root>
    </Flex>
  );
}

function Ranking({ d }) {
  if (d.ranking.length === 0) {
    return (
      <Text size="1" color="gray">
        Sem classificação neste quadro.
      </Text>
    );
  }
  return (
    <Table.Root size="1" variant="surface">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Classe</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell justify="end">Distância</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell justify="end">Voto</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {d.ranking.map((r) => (
          <Table.Row key={r.classe}>
            <Table.RowHeaderCell>
              {r.classe === d.classe ? <Badge color="green">{r.classe}</Badge> : r.classe}
            </Table.RowHeaderCell>
            <Table.Cell justify="end" className="numeros">{num(r.distancia, 3)}</Table.Cell>
            <Table.Cell justify="end" className="numeros">{`${num(r.voto * 100, 0)}%`}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function Corpo({ d, desempenho }) {
  const decisao = decisaoDe(d);
  const passaRazao = Number.isFinite(d.razao) && d.razao <= d.limiarRazao;
  const passaDistancia = Number.isFinite(d.distanciaMin) && d.distanciaMin <= d.limiarDistancia;
  const rigor = RIGORES[d.rigor] ?? 'Personalizado';

  return (
    <Flex direction="column" gap="3" className="dev-diag" data-ativo={d.ativo}>
      <Flex align="center" gap="2">
        <Badge color={decisao.cor} size="2">
          {decisao.texto}
        </Badge>
      </Flex>

      <Flex direction="column" gap="2">
        <Text size="1" weight="bold" color="gray">
          Classes mais próximas
        </Text>
        <Ranking d={d} />
      </Flex>

      <Grupo titulo="Classificador">
        <Item rotulo="Razão 1ª ÷ 2ª">
          {num(d.razao)} <Text color="gray">· limite {num(d.limiarRazao)}</Text>{' '}
          {Number.isFinite(d.razao) && <Badge color={passaRazao ? 'green' : 'amber'}>{passaRazao ? 'passa' : 'barra'}</Badge>}
        </Item>
        <Item rotulo="Distância da 1ª">
          {num(d.distanciaMin, 3)} <Text color="gray">· limiar {num(d.limiarDistancia, 3)}</Text>{' '}
          {Number.isFinite(d.distanciaMin) && (
            <Badge color={passaDistancia ? 'green' : 'amber'}>{passaDistancia ? 'passa' : 'barra'}</Badge>
          )}
        </Item>
        <Item rotulo="Rigor">{`${rigor} (×${num(d.rigor)})`}</Item>
        <Item rotulo="Tempo para confirmar">{`${num(d.permanencia, 0)} ms`}</Item>
      </Grupo>

      <Grupo titulo="Estabilizador">
        <Item rotulo="Estado">{ESTADOS[d.estado] ?? d.estado}</Item>
        <Item rotulo="Quadro atual">{SIMBOLOS[d.simbolo] ?? d.simbolo ?? '—'}</Item>
        <Item rotulo="Votação da janela">
          {SIMBOLOS[d.vencedor] ?? d.vencedor ?? '—'}{' '}
          <Text color="gray">
            · líder com {d.votosLider} de {d.quadrosJanela} quadros
          </Text>
        </Item>
        <Item rotulo="Candidato">{d.candidato ?? '—'}</Item>
        <Item rotulo="Progresso">{`${num(d.progresso * 100, 0)}%`}</Item>
        <Item rotulo="Travado em">{d.travadoEm ?? '—'}</Item>
        <Item rotulo="Última confirmada">
          {d.ultimaConfirmacao ? `${d.ultimaConfirmacao.classe} · ${ha(d.ultimaConfirmacao, d.t)}` : '—'}
        </Item>
        <Item rotulo="Última rejeição">
          {d.ultimaRejeicao
            ? `${d.ultimaRejeicao.motivo === 'ambiguo' ? 'ambígua' : 'distante'} · ${ha(d.ultimaRejeicao, d.t)}`
            : '—'}
        </Item>
      </Grupo>

      <Grupo titulo="Mão">
        <Item rotulo="Detectada">
          {d.maoDetectada ?? '—'}
          {Number.isFinite(d.confiancaMao) && <Text color="gray"> · confiança {num(d.confiancaMao)}</Text>}
        </Item>
        <Item rotulo="Configurada">{d.maoConfigurada}</Item>
        <Item rotulo="Câmera invertida">{d.cameraEspelhada ? 'sim' : 'não'}</Item>
        <Item rotulo="Trava de mão">{d.maoBloqueada ? 'ativa' : 'livre'}</Item>
      </Grupo>

      <Grupo titulo="Desempenho">
        <Item rotulo="Latência (laço)">
          {desempenho?.amostras > 0
            ? `p50 ${ms(desempenho.p50)} · p95 ${ms(desempenho.p95)}`
            : '—'}
          <Text color="gray"> · últimos {desempenho?.amostras ?? 0}</Text>
        </Item>
        <Item rotulo="Latência (dev)">
          {`p50 ${ms(d.latencia.p50)} · p95 ${ms(d.latencia.p95)}`}
          <Text color="gray"> · últimos {d.latencia.quadros}</Text>
        </Item>
        <Item rotulo="Inferência">
          {Number.isFinite(d.hz) ? `${num(d.hz, 1)} Hz` : '—'}
          <Text color="gray">
            {' '}· alvo {desempenho?.hz ?? '—'} Hz{desempenho?.reduzido ? ' (recuo ativo)' : ''}
          </Text>
        </Item>
        <Item rotulo="Câmera">
          {Number.isFinite(d.fpsCamera) ? `${num(d.fpsCamera, 1)} fps` : '—'}
          <Text color="gray"> · declarado {Number.isFinite(d.fpsDeclarado) ? num(d.fpsDeclarado, 0) : '—'}</Text>
        </Item>
        <Item rotulo="Desenho da mão">
          {d.desenho ? `p50 ${ms(d.desenho.p50)} · p95 ${ms(d.desenho.p95)}` : '—'}
        </Item>
      </Grupo>
    </Flex>
  );
}

export function PainelDev() {
  const prefs = usarLoja(lojaPrefsDev);
  const d = usarLoja(lojaDiagnostico);
  const desempenho = usarLoja(lojaReco, (s) => s?.desempenho ?? null);

  return (
    <Secao
      titulo="Diagnóstico (dev)"
      resumo={d?.ativo ? 'ao vivo' : 'parado'}
      aberto={prefs.aberto}
      aoAlternar={(v) => definirPrefDev('aberto', v)}
    >
      <Flex direction="column" gap="3">
        <Flex gap="4" wrap="wrap">
          <Text as="label" size="2">
            <Flex gap="2" align="center">
              <Switch checked={prefs.esqueleto} onCheckedChange={(v) => definirPrefDev('esqueleto', v)} />
              Desenhar a mão
            </Flex>
          </Text>
          <Text as="label" size="2">
            <Flex gap="2" align="center">
              <Switch
                checked={prefs.numeros}
                disabled={!prefs.esqueleto}
                onCheckedChange={(v) => definirPrefDev('numeros', v)}
              />
              Numerar os pontos
            </Flex>
          </Text>
        </Flex>
        <Separator size="4" />
        {d ? (
          <Corpo d={d} desempenho={desempenho} />
        ) : (
          <Text size="1" color="gray">
            Ligue a câmera e o Reconhecimento para ver os números.
          </Text>
        )}
      </Flex>
    </Secao>
  );
}
