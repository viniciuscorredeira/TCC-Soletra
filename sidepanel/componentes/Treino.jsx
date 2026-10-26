/**
 * Soletra — view do treino.
 *
 * Grade de classes com contagem de amostras, captura assistida e os botões de
 * exportar/importar/apagar, além da escolha entre o modelo pronto e o treino do
 * zero na primeira abertura. Apagar e exportar não são conveniência: são os
 * direitos de eliminação e portabilidade do titular sobre um template
 * biométrico derivado.
 */
import { forwardRef, memo, useRef } from 'react';
import { Button, Callout, Card, Flex, SegmentedControl, Spinner, Text } from '@radix-ui/themes';
import { Cross2Icon, DownloadIcon, ResetIcon, TrashIcon, UploadIcon } from '@radix-ui/react-icons';
import { classesDoConjunto } from '../../src/sign-classes.js';
import { AMOSTRAS_RECOMENDADAS, AMOSTRAS_MAXIMAS } from '../../src/sign-model-store.js';
import { acoesTreino } from '../nucleo.js';
import { Secao } from './Secao.jsx';
import { Campo } from './Campo.jsx';

/** Porcentagem inteira; qualquer uso acima de zero aparece como pelo menos 1%. */
function porcentagem(parte, total) {
  if (!total || parte <= 0) return 0;
  return Math.min(100, Math.max(1, Math.round((parte / total) * 100)));
}

function formatarMB(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: mb < 10 ? 2 : 1 })} MB`;
}

/**
 * Um botão por classe. Durante a captura as contagens mudam a cada ~150 ms e o
 * reconhecedor emite a 15 Hz; com memo e props primitivas, só a classe que
 * mudou é redesenhada, e nenhum botão é destruído e recriado — o que antes
 * saturava a thread do painel e engolia cliques, inclusive o de Cancelar.
 */
const ClasseBotao = memo(function ClasseBotao({ classe, n, padrao, pessoal, ativa, capturando }) {
  const cheia = n >= AMOSTRAS_MAXIMAS;
  // Quanto do teto de amostras da classe já está ocupado, em texto e na barra
  // da base do botão (largura via --uso).
  const uso = porcentagem(n, AMOSTRAS_MAXIMAS);

  const detalhe =
    padrao > 0
      ? `${classe} — ${padrao} do modelo pronto, ${pessoal} sua(s)`
      : `${classe} — ${n} amostra(s)`;
  const titulo = cheia
    ? `${detalhe}. Classe cheia (${AMOSTRAS_MAXIMAS}/${AMOSTRAS_MAXIMAS}, 100%): gravar mais substitui as mais antigas.`
    : `${detalhe} de ${AMOSTRAS_MAXIMAS} (${uso}% do espaço da classe).${padrao > 0 ? ' Clique para reforçar.' : ''}`;

  const situacao = cheia
    ? 'cheia'
    : n >= AMOSTRAS_RECOMENDADAS
      ? 'treinada'
      : n > 0
        ? 'parcial'
        : 'vazia';

  const rotuloX =
    padrao > 0 && pessoal > 0
      ? `Descartar seus treinos de ${classe} e voltar ao modelo pronto`
      : `Apagar as amostras de ${classe}`;

  return (
    <div className="classe-wrap">
      <button
        type="button"
        className="classe"
        data-situacao={situacao}
        data-ativa={ativa}
        style={{ '--uso': uso }}
        title={titulo}
        disabled={capturando}
        onClick={() => acoesTreino.treinar(classe)}
      >
        {classe}
        <span className="classe__n">
          {/* "20+8": padrão + pessoais. O número pessoal em destaque, porque é
              o que o usuário controla. */}
          {padrao > 0 && pessoal > 0 ? (
            <>
              {padrao}+<b>{pessoal}</b>
            </>
          ) : n > 0 ? (
            n
          ) : (
            '·'
          )}
        </span>
        <span className="classe__pct">{uso}%</span>
      </button>
      {/* Excluir uma classe isolada evita refazer o modelo inteiro por causa de
          uma letra que ficou ruim. Fica fora do botão de treino porque um
          <button> não pode conter outro. */}
      {n > 0 && !capturando && (
        <button
          type="button"
          className="classe__x"
          title={rotuloX}
          aria-label={rotuloX}
          onClick={() => acoesTreino.apagarClasse(classe)}
        >
          <Cross2Icon width="10" height="10" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});

/**
 * Uso total do chrome.storage.local, que o store já media. Perto da quota,
 * gravar amostras passaria a falhar; o aviso chega antes disso, com o que fazer.
 */
function UsoArmazenamento({ uso }) {
  if (!uso) return null;
  const texto =
    `Armazenamento: ${formatarMB(uso.usados)} de ${formatarMB(uso.quota)} ` +
    `(${porcentagem(uso.usados, uso.quota)}%)` +
    (uso.alerta ? ' — perto do limite. Exporte o modelo e apague classes que não usa.' : '');
  return (
    <Text as="p" size="1" color={uso.alerta ? 'amber' : 'gray'} className="numeros">
      {texto}
    </Text>
  );
}

function StatusCaptura({ s }) {
  // No teto, cada amostra nova empurra uma antiga para fora. Dizer isso durante
  // a gravação explica por que o total da classe parou de subir.
  const total = s.amostrasPorClasse[s.captura.classe] || 0;
  const noTeto = total >= AMOSTRAS_MAXIMAS;
  const texto =
    `Gravando "${s.captura.classe}" — ${s.captura.capturadas}/${s.captura.alvo}` +
    (s.travaMao ? ` · pausado: use a mão ${s.mao}` : '') +
    (noTeto ? ` · limite de ${AMOSTRAS_MAXIMAS}: substituindo as mais antigas` : '');

  return (
    <Callout.Root color={noTeto ? 'amber' : 'blue'} size="1" variant="soft">
      <Flex align="center" justify="between" gap="2" className="captura">
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="1" className="numeros">
            {texto}
          </Text>
        </Flex>
        <Button size="1" variant="surface" color="gray" onClick={acoesTreino.cancelarCaptura}>
          Cancelar
        </Button>
      </Flex>
    </Callout.Root>
  );
}

/**
 * A escolha entre o modelo pronto e o treino do zero. Numa instalação nova o
 * modelo pronto já vem instalado (o reconhecimento funciona mesmo que o cartão
 * seja ignorado) e "Treinar do zero" o tira; com o modelo vazio, "Usar modelo
 * pronto" o instala.
 * @param {{instalado: boolean, aoTreinarDoZero: () => void}} props
 */
export function BoasVindas({ instalado, aoTreinarDoZero }) {
  return (
    <Card size="2" className="boas-vindas">
      <Flex direction="column" gap="2">
        <Text as="p" size="2" weight="bold">
          Como você quer começar?
        </Text>
        <Text as="p" size="1" color="gray">
          {instalado
            ? 'O modelo pronto já está instalado e reconhece as letras sem treino. Se preferir, ' +
              'treine do zero só com a sua mão; o modelo pronto pode voltar depois.'
            : 'O modelo pronto reconhece as letras sem treino. Se alguma letra falhar com a sua ' +
              'mão, você pode reforçá-la depois em "Treinar sinais".'}
        </Text>
        <div className="acoes">
          <Button className="botao-marca" onClick={acoesTreino.usarPadrao}>
            Usar modelo pronto
          </Button>
          <Button variant="soft" color="gray" onClick={aoTreinarDoZero}>
            Treinar do zero
          </Button>
        </div>
      </Flex>
    </Card>
  );
}

export const Treino = forwardRef(function Treino({ s, aberto, aoAlternar }, ref) {
  const arquivo = useRef(null);
  const classes = classesDoConjunto(s.conjunto);
  const capturando = Boolean(s.captura);
  const treinadas = classes.filter((c) => (s.amostrasPorClasse[c] || 0) > 0).length;

  // Quem treinou do zero vê "Adicionar"; quem já usa o padrão vê "Restaurar",
  // que repõe as amostras padrão que cederam lugar aos reforços. Com o modelo
  // vazio — inclusive logo depois de "Apagar tudo" — o botão continua à vista
  // como "Restaurar": é o caminho de volta, sem depender do cartão de
  // boas-vindas, que pode ter sido dispensado.
  const temPadrao =
    s.modeloVazio || Object.values(s.origemPorClasse || {}).some((o) => o.padrao > 0);

  async function aoEscolherArquivo() {
    const escolhido = arquivo.current.files?.[0];
    arquivo.current.value = ''; // permite reimportar o mesmo arquivo depois
    if (escolhido) await acoesTreino.importar(escolhido);
  }

  return (
    <Secao
      ref={ref}
      titulo="Treinar sinais"
      resumo={`${treinadas}/${classes.length}`}
      aberto={aberto}
      aoAlternar={aoAlternar}
    >
      <Text as="p" size="1" color="gray">
        Faça o sinal e mantenha a mão parada: a extensão grava várias amostras seguidas. Cerca de 20
        por classe costuma bastar.
      </Text>

      <Campo rotulo="Mão dominante">
        <SegmentedControl.Root
          size="2"
          value={s.mao}
          onValueChange={acoesTreino.definirMao}
          disabled={capturando}
          aria-label="Mão dominante"
        >
          <SegmentedControl.Item value="direita">Direita</SegmentedControl.Item>
          <SegmentedControl.Item value="esquerda">Esquerda</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Campo>

      {/* A inversão é guardada por câmera: sem uma em uso, não há o que marcar. */}
      <Campo
        rotulo="Imagem desta câmera"
        title="Algumas câmeras (Iriun, OBS, DroidCam) espelham a imagem na origem e trocam os lados da mão"
      >
        <SegmentedControl.Root
          size="2"
          value={s.cameraEspelhada ? '1' : '0'}
          onValueChange={(v) => acoesTreino.definirCameraEspelhada(v === '1')}
          disabled={capturando || !s.temCamera}
          aria-label="Imagem desta câmera"
        >
          <SegmentedControl.Item value="0">Normal</SegmentedControl.Item>
          <SegmentedControl.Item value="1">Invertida</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Campo>

      <div className="grade">
        {classes.map((classe) => {
          const { padrao = 0, pessoal = 0 } = s.origemPorClasse?.[classe] || {};
          return (
            <ClasseBotao
              key={classe}
              classe={classe}
              n={s.amostrasPorClasse[classe] || 0}
              padrao={padrao}
              pessoal={pessoal}
              ativa={s.captura?.classe === classe}
              capturando={capturando}
            />
          );
        })}
      </div>

      {capturando && <StatusCaptura s={s} />}

      <Text as="p" size="1" color="gray">
        Clique numa classe para treinar — ou reforçar, se ela já veio do modelo pronto. O{' '}
        <strong>×</strong> apaga só as amostras dela; numa classe reforçada, volta ao padrão. Cada
        classe guarda até 100 amostras: a porcentagem e a barra embaixo de cada uma mostram quanto
        desse espaço já está ocupado, e a borda tracejada marca a que chegou lá.
      </Text>

      <UsoArmazenamento uso={s.armazenamento} />

      {s.padraoDisponivel && (
        <Button
          variant="soft"
          disabled={capturando}
          onClick={acoesTreino.instalarPadrao}
          title="Repõe as amostras do modelo pronto sem apagar o que você treinou"
        >
          <ResetIcon /> {temPadrao ? 'Restaurar modelo pronto' : 'Adicionar modelo pronto'}
        </Button>
      )}

      <div className="acoes acoes--estreitas">
        <Button
          variant="soft"
          color="gray"
          disabled={s.modeloVazio || capturando}
          onClick={acoesTreino.exportar}
        >
          <DownloadIcon /> Exportar
        </Button>
        <Button variant="soft" color="gray" disabled={capturando} onClick={() => arquivo.current.click()}>
          <UploadIcon /> Importar
        </Button>
      </div>
      {/* A ação destrutiva fica numa linha só dela, longe de Exportar e
          Importar: num painel estreito os três lado a lado não cabiam, e um
          clique errado aqui apaga o modelo inteiro. */}
      <Button
        variant="soft"
        color="red"
        disabled={s.modeloVazio || capturando}
        onClick={acoesTreino.apagarModelo}
        title="Apagar o modelo inteiro"
      >
        <TrashIcon /> Apagar tudo
      </Button>
      <input
        ref={arquivo}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={aoEscolherArquivo}
      />
    </Secao>
  );
});
