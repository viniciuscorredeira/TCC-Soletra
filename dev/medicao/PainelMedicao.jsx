/**
 * Soletra (modo dev) — seção "Medir o modelo (dev)": a mesma medição do
 * tools/medir-modelo.mjs, sem terminal, sobre o modelo em uso, o modelo
 * pronto, o treino pessoal ou um arquivo, com gráficos e exportação.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Callout, DropdownMenu, Flex, Progress, SegmentedControl, Select, Text } from '@radix-ui/themes';
import { ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons';
import { usarLoja } from '../../ui/loja.js';
import { Secao } from '../../sidepanel/componentes/Secao.jsx';
import { Campo } from '../../sidepanel/componentes/Campo.jsx';
import { lojaPrefsDev, definirPrefDev } from '../preferencias.js';
import { NOMES_FONTE, resumoDoModeloEmUso } from './fontes.js';
import {
  lojaMedicao, medir, acoesMedicao, abrirPdfMedicao, baixarJsonMedicao, baixarXlsxMedicao
} from './controle.js';
import { ResultadoMedicao } from './ResultadoMedicao.jsx';

const CONFIG_PADRAO = { fonte: 'uso', comparar: 'nenhum', blocos: '17,25' };

const OPCOES_BLOCOS = [
  ['17,25', '17 e 25 (como no TCC)'],
  ['5,10', '5 e 10 (modelos pequenos)']
];

/** Botão que abre o seletor de arquivo do sistema. */
function EscolherArquivo({ rotulo, aoEscolher, variante = 'soft' }) {
  const entrada = useRef(null);
  return (
    <>
      <Button variant={variante} color="gray" onClick={() => entrada.current?.click()}>{rotulo}</Button>
      <input
        ref={entrada}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = '';
          if (arquivo) aoEscolher(arquivo);
        }}
      />
    </>
  );
}

function SeletorFonte({ rotulo, valor, aoMudar, comNenhum, resumo, arquivo, aoEscolherArquivo }) {
  const descricao = {
    uso: resumo ? `${resumo.classes} classes · ${resumo.padrao} do modelo pronto + ${resumo.pessoal} pessoais` : 'sem modelo',
    pessoal: resumo ? `${resumo.pessoal} amostras em ${resumo.classesPessoais} classes` : 'sem modelo'
  };
  return (
    <Campo rotulo={rotulo}>
      <Flex direction="column" gap="1">
        <Flex gap="2" align="center" wrap="wrap">
          <Select.Root value={valor} onValueChange={aoMudar}>
            <Select.Trigger aria-label={rotulo} />
            <Select.Content>
              {comNenhum && <Select.Item value="nenhum">Nenhum</Select.Item>}
              {Object.entries(NOMES_FONTE).map(([id, nome]) => (
                <Select.Item key={id} value={id} disabled={id === 'pessoal' && !resumo?.pessoal}>{nome}</Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          {valor === 'arquivo' && (
            <EscolherArquivo rotulo={arquivo ? 'Trocar arquivo' : 'Escolher arquivo'} aoEscolher={aoEscolherArquivo} />
          )}
        </Flex>
        {valor === 'arquivo' && arquivo && <Text size="1" color="gray">{arquivo.name}</Text>}
        {descricao[valor] && <Text size="1" color="gray">{descricao[valor]}</Text>}
      </Flex>
    </Campo>
  );
}

function Configuracao({ erro }) {
  const salvo = usarLoja(lojaPrefsDev, (p) => p.medicao);
  const c = { ...CONFIG_PADRAO, ...(salvo || {}) };
  const mudar = (campos) => definirPrefDev('medicao', { ...c, ...campos });
  const [resumo, setResumo] = useState(null);
  const [arquivoFonte, setArquivoFonte] = useState(null);
  const [arquivoComparar, setArquivoComparar] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    resumoDoModeloEmUso().then(setResumo);
  }, []);

  const comparar = c.comparar === 'nenhum' ? null : c.comparar;
  const mesmaFonte = comparar && comparar === c.fonte && c.fonte !== 'arquivo';
  const sugerir = resumo?.pessoal > 0 && !(c.fonte === 'pessoal' && comparar === 'pronto');

  function comecar() {
    setAviso(null);
    if (mesmaFonte) { setAviso('Escolha modelos diferentes para comparar.'); return; }
    if (c.fonte === 'arquivo' && !arquivoFonte) { setAviso('Escolha o arquivo do modelo a medir.'); return; }
    if (comparar === 'arquivo' && !arquivoComparar) { setAviso('Escolha o arquivo do modelo de comparação.'); return; }
    medir({ fonte: c.fonte, arquivoFonte, comparar, arquivoComparar, blocos: c.blocos.split(',').map(Number) });
  }

  return (
    <Flex direction="column" gap="3">
      <SeletorFonte
        rotulo="Modelo"
        valor={c.fonte}
        aoMudar={(v) => mudar({ fonte: v })}
        resumo={resumo}
        arquivo={arquivoFonte}
        aoEscolherArquivo={setArquivoFonte}
      />
      <SeletorFonte
        rotulo="Comparar com"
        valor={c.comparar}
        aoMudar={(v) => mudar({ comparar: v })}
        comNenhum
        resumo={resumo}
        arquivo={arquivoComparar}
        aoEscolherArquivo={setArquivoComparar}
      />
      <Campo rotulo="Blocos">
        <SegmentedControl.Root size="1" value={c.blocos} onValueChange={(v) => mudar({ blocos: v })} aria-label="Blocos">
          {OPCOES_BLOCOS.map(([v, r]) => <SegmentedControl.Item key={v} value={v}>{r}</SegmentedControl.Item>)}
        </SegmentedControl.Root>
      </Campo>

      <Text size="1" color="gray">
        Cada bloco de amostras seguidas de uma classe sai do modelo e é classificado pelo resto, com o classificador da
        extensão. Leva alguns segundos (o modelo pronto, uns 5 s; com comparação, o dobro) e roda em segundo plano: o
        painel e a câmera continuam funcionando. Com um treino pessoal de 20 amostras por classe, use blocos de 5 e 10.
      </Text>

      {sugerir && (
        <Callout.Root color="blue" size="1">
          <Callout.Icon><InfoCircledIcon /></Callout.Icon>
          <Callout.Text>
            O modelo pronto reconhece a sua mão? Meça o seu treino pessoal comparado com o modelo pronto e veja
            "Comparação entre modelos".{' '}
            <Button size="1" variant="ghost" onClick={() => mudar({ fonte: 'pessoal', comparar: 'pronto', blocos: '5,10' })}>
              Usar esta combinação
            </Button>
          </Callout.Text>
        </Callout.Root>
      )}

      {(aviso || erro) && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{aviso || erro}</Callout.Text>
        </Callout.Root>
      )}

      <Flex gap="2" wrap="wrap">
        <Button onClick={comecar}>Medir</Button>
        <Button variant="soft" color="gray" onClick={async () => { if (!(await acoesMedicao.abrirUltima())) setAviso('Nenhuma medição salva ainda.'); }}>
          Abrir a última
        </Button>
        <EscolherArquivo rotulo="Abrir medição salva…" aoEscolher={acoesMedicao.abrirArquivo} />
      </Flex>
    </Flex>
  );
}

function Medindo({ p }) {
  const fracao = p?.total ? p.feitas / p.total : 0;
  const geral = p ? ((p.parte - 1) + fracao) / p.partes : 0;
  return (
    <Flex direction="column" gap="2">
      <Progress value={Math.round(geral * 100)} size="1" aria-label="Progresso da medição" />
      <Text size="1" color="gray" className="numeros">
        {[p?.partes > 1 && `Parte ${p.parte} de ${p.partes}`, p?.etapa, p?.total && `${p.feitas} de ${p.total} treinos`].filter(Boolean).join(' · ')}
      </Text>
      <Flex>
        <Button variant="soft" color="gray" onClick={acoesMedicao.cancelar}>Cancelar</Button>
      </Flex>
    </Flex>
  );
}

function Resultado({ arquivo }) {
  const m = arquivo.modelo;
  return (
    <Flex direction="column" gap="3">
      <Text size="1" color="gray" className="numeros">
        {[
          new Date(arquivo.dataHora).toLocaleString('pt-BR'),
          arquivo.arquivo,
          `${m.classes} classes, ${m.amostras} amostras`,
          `modelo ${m.sha256.slice(0, 12)}…`,
          `commit ${arquivo.commit}`
        ].join(' · ')}
      </Text>
      <Flex gap="2" wrap="wrap">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button>Exportar <DropdownMenu.TriggerIcon /></Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={() => baixarJsonMedicao(arquivo)}>JSON — tudo (mesmo formato do terminal)</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => baixarXlsxMedicao(arquivo)}>Excel (.xlsx) — planilha com abas</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => abrirPdfMedicao(arquivo)}>PDF — relatório para imprimir</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <Button variant="soft" color="gray" onClick={acoesMedicao.nova}>Nova medição</Button>
      </Flex>
      <ResultadoMedicao key={`${arquivo.dataHora}-${m.sha256}`} arquivo={arquivo} />
    </Flex>
  );
}

export function PainelMedicao() {
  const e = usarLoja(lojaMedicao);
  const aberto = usarLoja(lojaPrefsDev, (p) => p.medicaoAberta ?? false);
  const resumo = e.fase === 'medindo' ? 'medindo' : e.fase === 'resultado' ? 'resultado' : '';
  return (
    <Secao titulo="Medir o modelo (dev)" resumo={resumo} aberto={aberto || e.fase === 'medindo'} aoAlternar={(v) => definirPrefDev('medicaoAberta', v)}>
      {e.fase === 'medindo' ? <Medindo p={e.progresso} /> : e.fase === 'resultado' && e.arquivo ? <Resultado arquivo={e.arquivo} /> : <Configuracao erro={e.erro} />}
    </Secao>
  );
}
