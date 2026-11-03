/**
 * Soletra (modo dev) — seção "Teste de sinais (dev)": configura o teste,
 * conduz as rodadas e mostra o relatório, com a exportação em JSON.
 */
import { useState } from 'react';
import {
  Badge, Button, Callout, Flex, Grid, Progress, SegmentedControl, Select, Text, TextArea, TextField
} from '@radix-ui/themes';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import { usarLoja } from '../../ui/loja.js';
import { lojaReco } from '../../sidepanel/nucleo.js';
import { Secao } from '../../sidepanel/componentes/Secao.jsx';
import { Campo } from '../../sidepanel/componentes/Campo.jsx';
import { LETRAS_ESTATICAS, NUMEROS } from '../../src/sign-classes.js';
import { lojaPrefsDev, definirPrefDev } from '../preferencias.js';
import { PADROES_TESTE } from './sessao.js';
import { lojaTeste, iniciarTeste, acoesTeste } from './controle.js';
import { baixar } from './exportar.js';
import { RelatorioGeral, RelatorioUnitario } from './Relatorios.jsx';

const CONFIG_PADRAO = {
  modo: 'unitario',
  sinal: 'A',
  conjuntos: 'ambos',
  ordem: 'ordem',
  rodadasUnitario: PADROES_TESTE.rodadasUnitario,
  rodadasGeral: PADROES_TESTE.rodadasGeral,
  duracaoS: PADROES_TESTE.duracaoMs / 1000,
  participante: '',
  gravouModeloPronto: 'nao',
  iluminacao: '',
  distancia: '',
  observacoes: ''
};

const CONJUNTOS = { letras: ['letras'], numeros: ['numeros'], ambos: ['letras', 'numeros'] };

function Segmentado({ rotulo, valor, opcoes, aoMudar }) {
  return (
    <Campo rotulo={rotulo}>
      <SegmentedControl.Root size="1" value={String(valor)} onValueChange={aoMudar} aria-label={rotulo}>
        {opcoes.map(([v, r]) => (
          <SegmentedControl.Item key={v} value={String(v)}>{r}</SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>
    </Campo>
  );
}

function Configuracao() {
  const salvo = usarLoja(lojaPrefsDev, (p) => p.teste);
  const reco = usarLoja(lojaReco);
  const [erro, setErro] = useState(null);
  const c = { ...CONFIG_PADRAO, ...(salvo || {}) };
  const mudar = (chave, valor) => definirPrefDev('teste', { ...c, [chave]: valor });

  const unitario = c.modo === 'unitario';
  const chaveRodadas = unitario ? 'rodadasUnitario' : 'rodadasGeral';
  const pronto = reco?.estado === 'reconhecendo';
  const totalSinais = unitario ? 1 : CONJUNTOS[c.conjuntos].reduce((n, k) => n + (k === 'letras' ? 21 : 10), 0);
  const duracaoTotal = totalSinais * c[chaveRodadas] * (c.duracaoS + PADROES_TESTE.contagemMs / 1000);

  async function comecar() {
    setErro(null);
    const msg = await iniciarTeste({
      modo: c.modo,
      sinal: c.sinal,
      conjuntos: CONJUNTOS[c.conjuntos],
      ordem: c.ordem,
      rodadas: c[chaveRodadas],
      duracaoMs: c.duracaoS * 1000,
      participante: c.participante.trim(),
      gravouModeloPronto: c.gravouModeloPronto === 'sim',
      condicoes: { iluminacao: c.iluminacao.trim(), distancia: c.distancia.trim(), observacoes: c.observacoes.trim() }
    });
    if (msg) setErro(msg);
  }

  return (
    <Flex direction="column" gap="3">
      <Segmentado rotulo="Relatório" valor={c.modo} opcoes={[['unitario', 'Unitário (um sinal)'], ['geral', 'Geral (todos)']]} aoMudar={(v) => mudar('modo', v)} />

      {unitario ? (
        <Campo rotulo="Sinal a testar">
          <Select.Root value={c.sinal} onValueChange={(v) => mudar('sinal', v)}>
            <Select.Trigger aria-label="Sinal a testar" />
            <Select.Content>
              <Select.Group>
                <Select.Label>Letras</Select.Label>
                {LETRAS_ESTATICAS.map((s) => <Select.Item key={s} value={s}>{s}</Select.Item>)}
              </Select.Group>
              <Select.Separator />
              <Select.Group>
                <Select.Label>Números</Select.Label>
                {NUMEROS.map((s) => <Select.Item key={s} value={s}>{s}</Select.Item>)}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </Campo>
      ) : (
        <>
          <Segmentado rotulo="Sinais" valor={c.conjuntos} opcoes={[['ambos', 'Letras e números'], ['letras', 'Letras'], ['numeros', 'Números']]} aoMudar={(v) => mudar('conjuntos', v)} />
          <Segmentado rotulo="Ordem" valor={c.ordem} opcoes={[['ordem', 'Em ordem'], ['sorteada', 'Sorteada']]} aoMudar={(v) => mudar('ordem', v)} />
        </>
      )}

      <Grid columns="2" gap="3">
        <Segmentado rotulo="Rodadas por sinal" valor={c[chaveRodadas]} opcoes={[[1, '1'], [3, '3'], [5, '5']]} aoMudar={(v) => mudar(chaveRodadas, Number(v))} />
        <Segmentado rotulo="Duração da rodada" valor={c.duracaoS} opcoes={[[3, '3 s'], [5, '5 s'], [8, '8 s']]} aoMudar={(v) => mudar('duracaoS', Number(v))} />
      </Grid>

      <Grid columns="2" gap="3">
        <Campo rotulo="Participante (código)">
          <TextField.Root size="1" placeholder="P1" value={c.participante} onChange={(e) => mudar('participante', e.target.value)} />
        </Campo>
        <Segmentado rotulo="Gravou o modelo pronto?" valor={c.gravouModeloPronto} opcoes={[['sim', 'Sim'], ['nao', 'Não']]} aoMudar={(v) => mudar('gravouModeloPronto', v)} />
      </Grid>
      <Grid columns="2" gap="3">
        <Campo rotulo="Iluminação">
          <TextField.Root size="1" placeholder="ex.: luz natural" value={c.iluminacao} onChange={(e) => mudar('iluminacao', e.target.value)} />
        </Campo>
        <Campo rotulo="Distância da câmera">
          <TextField.Root size="1" placeholder="ex.: 60 cm" value={c.distancia} onChange={(e) => mudar('distancia', e.target.value)} />
        </Campo>
      </Grid>
      <Campo rotulo="Observações">
        <TextArea size="1" rows={2} value={c.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} />
      </Campo>

      <Text size="1" color="gray">
        {`${totalSinais * c[chaveRodadas]} rodada(s), cerca de ${Math.ceil(duracaoTotal / 60)} min. ` +
          `O teste usa o rigor e o tempo para confirmar atuais do painel. Antes de cada rodada há ${PADROES_TESTE.contagemMs / 1000} s para se preparar com a mão baixa.`}
      </Text>

      {erro && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{erro}</Callout.Text>
        </Callout.Root>
      )}

      <Flex gap="2" wrap="wrap">
        <Button onClick={comecar} disabled={!pronto} title={pronto ? undefined : 'Ligue a câmera e o Reconhecimento'}>
          Começar teste
        </Button>
        <Button variant="soft" color="gray" onClick={async () => { if (!(await acoesTeste.abrirUltimo())) setErro('Nenhum teste salvo ainda.'); }}>
          Abrir o último teste
        </Button>
      </Flex>
    </Flex>
  );
}

function Execucao({ t }) {
  const s = t.sessao;
  const pausada = s.fase === 'pausada';
  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="2" wrap="wrap">
        <Badge size="2" color={pausada ? 'amber' : s.fase === 'gravando' ? 'green' : 'blue'}>
          {pausada ? 'Pausado' : s.fase === 'gravando' ? `Gravando ${s.item?.sinal}` : `Prepare ${s.item?.sinal}`}
        </Badge>
        <Text size="1" color="gray" className="numeros">{`Rodada ${s.indice + 1} de ${s.total} · ${s.feitas} feita(s) · ${s.puladas} pulada(s)`}</Text>
      </Flex>
      <Progress value={Math.round((s.indice / s.total) * 100)} size="1" aria-label="Progresso do teste" />
      {t.aviso && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>{t.aviso}</Callout.Text>
        </Callout.Root>
      )}
      <Grid columns="2" gap="2">
        {pausada ? (
          <Button onClick={acoesTeste.continuar}>Continuar</Button>
        ) : (
          <Button variant="soft" onClick={acoesTeste.pausar}>Pausar</Button>
        )}
        <Button variant="soft" color="gray" onClick={acoesTeste.repetir}>Repetir rodada</Button>
        <Button variant="soft" color="gray" onClick={acoesTeste.pular}>Pular rodada</Button>
        <Button variant="soft" color="red" onClick={acoesTeste.encerrar}>Encerrar e ver relatório</Button>
      </Grid>
      <Text size="1" color="gray">
        Pausar ou repetir descarta a rodada em andamento. Pular a registra como pulada, fora das taxas.
      </Text>
    </Flex>
  );
}

function Resultado({ arquivo }) {
  const m = arquivo.metadados;
  return (
    <Flex direction="column" gap="3">
      {arquivo.parcial && (
        <Callout.Root color="amber" size="1">
          <Callout.Icon><ExclamationTriangleIcon /></Callout.Icon>
          <Callout.Text>Teste encerrado antes do fim: o relatório traz só as rodadas concluídas.</Callout.Text>
        </Callout.Root>
      )}
      <Text size="1" color="gray">
        {[
          new Date(m.dataHora).toLocaleString('pt-BR'),
          m.participante && `participante ${m.participante}`,
          m.modelo && `modelo ${m.modelo.sha256.slice(0, 12)}…`,
          `commit ${m.extensao.commit}`
        ].filter(Boolean).join(' · ')}
      </Text>
      <Flex gap="2" wrap="wrap">
        <Button onClick={() => baixar(arquivo)}>Exportar JSON</Button>
        <Button variant="soft" color="gray" onClick={acoesTeste.novo}>Novo teste</Button>
      </Flex>
      {arquivo.relatorio.tipo === 'unitario' ? (
        <RelatorioUnitario r={arquivo.relatorio} />
      ) : (
        <RelatorioGeral arquivo={arquivo} />
      )}
    </Flex>
  );
}

export function PainelTeste() {
  const t = usarLoja(lojaTeste);
  const aberto = usarLoja(lojaPrefsDev, (p) => p.testeAberto ?? true);
  const resumo = t.fase === 'executando' ? 'em andamento' : t.fase === 'resultado' ? 'relatório' : '';

  return (
    <Secao titulo="Teste de sinais (dev)" resumo={resumo} aberto={aberto || t.fase === 'executando'} aoAlternar={(v) => definirPrefDev('testeAberto', v)}>
      {t.fase === 'executando' && t.sessao ? <Execucao t={t} /> : t.fase === 'resultado' && t.arquivo ? <Resultado arquivo={t.arquivo} /> : <Configuracao />}
    </Secao>
  );
}
