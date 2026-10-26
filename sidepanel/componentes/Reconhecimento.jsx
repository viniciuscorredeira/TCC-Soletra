/**
 * Soletra — view do reconhecimento.
 *
 * Só desenha: recebe a snapshot do SignRecognizer e devolve eventos de usuário.
 * Nenhuma regra de reconhecimento mora aqui, pelo mesmo motivo que o núcleo
 * não sabe nada de componentes.
 */
import { useRef, useState } from 'react';
import {
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Progress,
  SegmentedControl,
  Switch,
  Text,
  TextArea
} from '@radix-ui/themes';
import {
  ExclamationTriangleIcon,
  HandIcon,
  LockClosedIcon,
  MagnifyingGlassIcon
} from '@radix-ui/react-icons';
import { AVISO_DINAMICAS, classesDoConjunto, CONJUNTOS } from '../../src/sign-classes.js';
import { CLASSES_MINIMAS } from '../../src/sign-classifier.js';
import { usarLoja } from '../../ui/loja.js';
import { lojaCamera, lojaReco, acoesReco, acoesTreino } from '../nucleo.js';
import { Campo } from './Campo.jsx';
import { Secao } from './Secao.jsx';
import { BoasVindas, Treino } from './Treino.jsx';

/** Microcopy por estado — cada um precisa dizer o que fazer, não só o que é. */
const DICAS = {
  'sem-mao': 'Mostre a mão para a câmera.',
  desconhecido: 'Sinal não reconhecido — ajuste a mão ou treine essa letra.',
  formando: 'Segure o sinal…',
  travado: 'Relaxe a mão para repetir a mesma letra.',
  'mao-incorreta': 'Tradução bloqueada: mão diferente da configurada.'
};

// Sensibilidade nas mãos do usuário: nenhum padrão serve para toda mão, toda
// câmera e todo modelo treinado — e quem sente o atrito é quem sinaliza.
const RIGORES = [
  { valor: '1.25', rotulo: 'Tolerante' },
  { valor: '1', rotulo: 'Normal' },
  { valor: '0.8', rotulo: 'Exigente' }
];
const PERMANENCIAS = [
  { valor: '450', rotulo: 'Rápido' },
  { valor: '700', rotulo: 'Normal' },
  { valor: '1000', rotulo: 'Calmo' }
];

function dicaDe(s) {
  if (s.estado === 'carregando') return 'Carregando o reconhecedor…';
  if (s.estado === 'erro') return s.erro?.message || 'Falha no reconhecimento.';
  if (s.estado === 'pronto') return 'Inicie a câmera para reconhecer.';
  if (s.modeloVazio) return 'Nenhum sinal treinado ainda — abra "Treinar sinais".';
  return DICAS[s.estadoVisual] || '';
}

/**
 * O anel preenche em T_PERMANENCIA: é o feedback que diz ao usuário que o sinal
 * foi entendido e está sendo confirmado, não ignorado.
 */
function Anel({ s }) {
  const travado = Boolean(s.travadoEm);
  const bloqueado = s.estadoVisual === 'mao-incorreta';

  let caractere;
  if (bloqueado) caractere = '!';
  else if (travado) caractere = s.travadoEm;
  else if (s.candidato) caractere = s.candidato;
  else caractere = s.estadoVisual === 'desconhecido' ? '?' : '–';

  // Flash verde a cada confirmação. A `key` nova remonta o elemento e reinicia
  // a animação — sem isso a segunda confirmação seguida não animaria. A que já
  // existia quando o anel apareceu não pisca.
  const marca = s.ultimaConfirmacao?.em ?? null;
  const marcaInicial = useRef(marca);

  return (
    <div
      className="anel"
      data-travado={travado}
      data-vazio={!travado && !s.candidato}
      data-bloqueado={bloqueado}
      style={{ '--p': travado ? 1 : s.progresso }}
    >
      {marca && marca !== marcaInicial.current && (
        <span key={marca} className="anel__flash" aria-hidden="true" />
      )}
      <span className="anel__caractere">{caractere}</span>
      {travado && <LockClosedIcon className="anel__cadeado" aria-hidden="true" />}
    </div>
  );
}

function desempenhoDe(d) {
  return d?.amostras > 0
    ? `${d.hz} Hz · p50 ${d.p50.toFixed(0)} ms · p95 ${d.p95.toFixed(0)} ms${d.reduzido ? ' · desempenho reduzido' : ''}`
    : '—';
}

/** As duas saídas da trava de mão, no próprio aviso: ou o usuário trocou de
 * mão de propósito, ou a câmera inverte a imagem e a mão está certa. */
function AvisoMao({ s }) {
  const maoVista = s.travaMao?.maoVista ?? null;
  if (!maoVista) return null;
  const espelhada = Boolean(s.cameraEspelhada);

  return (
    <Callout.Root color="red" size="1" variant="surface" role="alert">
      <Callout.Icon>
        <HandIcon />
      </Callout.Icon>
      <Flex direction="column" gap="2">
        <Callout.Text>
          {`A câmera está vendo a mão ${maoVista}, mas o modelo está configurado para a mão ${s.mao}. ` +
            'A tradução fica bloqueada até a mão certa voltar. ' +
            (espelhada
              ? `Se você está usando a mão ${s.mao}, esta câmera talvez não inverta a imagem.`
              : `Se você está usando a mão ${s.mao}, esta câmera provavelmente inverte a imagem.`)}
        </Callout.Text>
        <div className="acoes">
          <Button variant="soft" color="red" onClick={() => acoesReco.definirMao(maoVista)}>
            Usar a mão {maoVista}
          </Button>
          <Button variant="soft" color="gray" onClick={() => acoesReco.definirCameraEspelhada(!espelhada)}>
            {espelhada ? 'A câmera não inverte a imagem' : 'A câmera inverte a imagem'}
          </Button>
        </div>
      </Flex>
    </Callout.Root>
  );
}

function CorpoReconhecimento({ s }) {
  const temTexto = s.texto.trim().length > 0;

  const rigor = RIGORES.find((o) => Math.abs(Number(o.valor) - s.rigor) < 1e-6);
  const permanencia = PERMANENCIAS.find((o) => Number(o.valor) === s.permanencia);
  // O resumo da seção mostra o ajuste atual sem precisar abri-la.
  const resumoAjustes = rigor && permanencia ? `${rigor.rotulo} · ${permanencia.rotulo}` : '';

  // Um classificador por vizinhança compara o gesto com o que conhece: com uma
  // classe só, não existe "com o que" comparar, e tudo vira essa classe. É
  // limitação do método, não defeito de treino — e precisa ser dita, porque o
  // sintoma (todo sinal virar a mesma letra) parece um bug.
  const treinadas = classesDoConjunto(s.conjunto).filter((c) => (s.amostrasPorClasse[c] || 0) > 0).length;
  const poucasClasses = treinadas > 0 && treinadas < CLASSES_MINIMAS;
  const rotuloConjunto = (CONJUNTOS[s.conjunto]?.rotulo || '').toLowerCase();

  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Anel s={s} />
        <Flex direction="column" gap="2" className="reco__medidas">
          <Text as="p" size="1" color="gray" id="recoDica">
            {dicaDe(s)}
          </Text>
          <Progress
            value={Math.round((s.proximidade || 0) * 100)}
            color="cyan"
            size="1"
            aria-hidden="true"
            className="reco__proximidade"
          />
          <Text size="1" color="gray" className="numeros reco__desempenho">
            {desempenhoDe(s.desempenho)}
          </Text>
        </Flex>
      </Flex>

      <AvisoMao s={s} />

      {poucasClasses && (
        <Callout.Root color="amber" size="1" variant="surface">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            {`Só um sinal de ${rotuloConjunto} está treinado, então qualquer gesto será reconhecido como ele. ` +
              'Treine pelo menos mais um para o reconhecimento conseguir distinguir.'}
          </Callout.Text>
        </Callout.Root>
      )}

      <Flex asChild direction="column" gap="1">
        <label>
          <Text size="1" weight="medium" color="gray">
            Texto reconhecido
          </Text>
          {/* Edição manual continua possível: é a via para as letras dinâmicas e
              para corrigir um caractere errado sem apagar a palavra inteira. */}
          <TextArea
            className="saida"
            rows={2}
            spellCheck={false}
            aria-describedby="recoDica"
            placeholder="Os caracteres confirmados aparecem aqui"
            value={s.texto}
            onChange={(e) => acoesReco.definirTexto(e.target.value)}
          />
        </label>
      </Flex>

      <Grid columns="2" gap="2">
        <Button variant="soft" color="gray" disabled={!temTexto} onClick={acoesReco.espaco}>
          Espaço
        </Button>
        <Button variant="soft" color="gray" disabled={!temTexto} onClick={acoesReco.apagar}>
          Apagar
        </Button>
        <Button
          variant="soft"
          color="gray"
          disabled={!s.travadoEm}
          onClick={acoesReco.repetir}
          title="Confirmar de novo a letra travada"
        >
          Repetir letra
        </Button>
        <Button variant="soft" color="gray" disabled={!temTexto} onClick={acoesReco.limpar}>
          Limpar
        </Button>
      </Grid>

      <Button size="3" className="botao-marca" disabled={!temTexto} onClick={acoesReco.pesquisar}>
        <MagnifyingGlassIcon width="16" height="16" /> Pesquisar
      </Button>

      <Text as="p" size="1" color="amber" className="aviso-linha">
        {AVISO_DINAMICAS}
      </Text>

      <Secao titulo="Ajustar sensibilidade" resumo={resumoAjustes}>
        <Campo rotulo="Rigor do reconhecimento">
          <SegmentedControl.Root
            size="2"
            value={rigor?.valor ?? ''}
            onValueChange={(v) => acoesReco.definirRigor(Number(v))}
            aria-label="Rigor do reconhecimento"
          >
            {RIGORES.map((o) => (
              <SegmentedControl.Item key={o.valor} value={o.valor}>
                {o.rotulo}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
        </Campo>
        <Campo rotulo="Tempo para confirmar">
          <SegmentedControl.Root
            size="2"
            value={permanencia?.valor ?? ''}
            onValueChange={(v) => acoesReco.definirPermanencia(Number(v))}
            aria-label="Tempo para confirmar"
          >
            {PERMANENCIAS.map((o) => (
              <SegmentedControl.Item key={o.valor} value={o.valor}>
                {o.rotulo}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
        </Campo>
      </Secao>
    </Flex>
  );
}

/**
 * Só aparece com a câmera ligada: sem vídeo não há o que reconhecer nem
 * treinar. Fica montada (só escondida) com a câmera desligada, para que a
 * seção de treino aberta e as boas-vindas dispensadas sobrevivam a um
 * desliga-e-liga.
 */
export function SecaoReconhecimento() {
  const ativa = usarLoja(lojaCamera, (c) => c.state === 'active');
  const s = usarLoja(lojaReco);

  const [treinoAberto, setTreinoAberto] = useState(false);
  // Escolher treinar do zero dispensa o cartão nesta abertura; sem isso ele
  // ficaria na tela até a primeira amostra gravada.
  const [boasVindasDispensadas, setBoasVindasDispensadas] = useState(false);
  const refTreino = useRef(null);

  if (!s) return null;

  const ligado = s.estado !== 'desligado' && s.estado !== 'erro';
  // Com o modelo vazio, ou numa instalação nova em que o modelo pronto já veio
  // instalado mas a pessoa ainda não escolheu se fica com ele.
  const mostrarBoasVindas =
    !boasVindasDispensadas && s.padraoDisponivel && (s.modeloVazio || s.escolhaInicialPendente) &&
    !s.modeloIncompativel && !s.captura;

  function treinarDoZero() {
    acoesTreino.treinarDoZero();
    setBoasVindasDispensadas(true);
    setTreinoAberto(true);
    requestAnimationFrame(() => refTreino.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return (
    <Card size="2" asChild className="cartao">
      <section className="reco" aria-label="Reconhecimento de Libras" hidden={!ativa}>
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between" gap="2" wrap="wrap">
            <Text as="label" size="2" weight="bold">
              <Flex align="center" gap="2">
                <Switch checked={ligado} onCheckedChange={acoesReco.alternarReconhecimento} />
                Reconhecimento
              </Flex>
            </Text>
            <SegmentedControl.Root
              size="2"
              value={s.conjunto}
              onValueChange={acoesReco.definirConjunto}
              aria-label="Conjunto de sinais"
            >
              <SegmentedControl.Item value="letras">Letras</SegmentedControl.Item>
              <SegmentedControl.Item value="numeros">Números</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>

          {s.estado !== 'desligado' && <CorpoReconhecimento s={s} />}

          {/* Primeira abertura (ou modelo vazio): modelo pronto ou treino do
              zero. Só aparece se a extensão traz o modelo padrão. */}
          {mostrarBoasVindas && (
            <BoasVindas instalado={!s.modeloVazio} aoTreinarDoZero={treinarDoZero} />
          )}

          <Treino s={s} ref={refTreino} aberto={treinoAberto} aoAlternar={setTreinoAberto} />
        </Flex>
      </section>
    </Card>
  );
}
