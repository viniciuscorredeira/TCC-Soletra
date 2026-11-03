/**
 * Soletra (modo dev) — o resultado do teste em tabelas, para o Excel e o CSV.
 *
 * Puro: entra o arquivo do teste (exportar.montarArquivo), saem planilhas como
 * listas de linhas. Números ficam números (o Excel os mostra com a vírgula da
 * configuração do computador); porcentagens vão de 0 a 100, tempos em segundos
 * e latências em milissegundos, como diz cada cabeçalho.
 */
import { RESULTADOS, relatorioGeral } from './relatorio.js';
import { NOMES_CATEGORIA, NOMES_COLUNA, NOMES_INICIO, NOMES_RESULTADO } from './rotulos.js';

const cem = (f) => (Number.isFinite(f) ? f * 100 : null);
const s = (ms) => (Number.isFinite(ms) ? ms / 1000 : null);

function distribuicaoEmLinhas(rotulo, d, conversao = (x) => x) {
  if (!d) return [[rotulo, null]];
  return [
    [`${rotulo} — mediana`, conversao(d.mediana)],
    [`${rotulo} — p10`, conversao(d.p10)],
    [`${rotulo} — p25`, conversao(d.p25)],
    [`${rotulo} — p75`, conversao(d.p75)],
    [`${rotulo} — p90`, conversao(d.p90)],
    [`${rotulo} — n`, d.n]
  ];
}

function resumo(arquivo) {
  const r = arquivo.relatorio;
  const a = r.tipo === 'geral' ? r.resumo : r;
  const linhas = [
    ['Relatório', r.tipo === 'geral' ? 'geral' : `unitário (${r.sinal})`],
    ['Início da rodada', NOMES_INICIO[r.inicio] ?? r.inicio],
    ['Rodadas', a.rodadas],
    ['Puladas', a.puladas],
    ...RESULTADOS.map((k) => [`Rodadas: ${NOMES_RESULTADO[k]}`, a.resultados[k] ?? 0]),
    ['Acerto por rodada (%)', cem(a.acerto)],
    ['Taxa de troca (%)', cem(a.taxaTroca)],
    ['Taxa de rejeição (%)', cem(a.taxaRejeicao)],
    ['Taxa de tempo esgotado (%)', cem(a.taxaTempoEsgotado)],
    ['Taxa de não reconhecido (%)', cem(a.taxaNaoReconhecido)],
    ['Acerto por quadro (%)', cem(a.acertoQuadros)],
    ['Tempo médio até reconhecer (s)', s(a.tempoMedioAteReconhecer)],
    ...distribuicaoEmLinhas('Tempo até reconhecer (s)', a.tempoAteReconhecer, s),
    ['Confirmações erradas antes de reconhecer', a.confirmacoesErradasAntes],
    ['Confirmações erradas durante a gravação', a.confirmacoesErradasNaGravacao],
    ['Quadros gravados', a.quadros.total],
    ['Quadros com o sinal pedido', a.quadros.certos],
    ['Quadros com outra classe', a.quadros.outras],
    ['Quadros rejeitados (ambíguos)', a.quadros.ambiguos],
    ['Quadros rejeitados (distantes)', a.quadros.distantes],
    ['Quadros sem mão', a.quadros.semMao],
    ['Quadros com mão bloqueada', a.quadros.bloqueados],
    ...distribuicaoEmLinhas('Razão nos quadros certos', a.razaoNosCertos),
    ...distribuicaoEmLinhas('Razão na confirmação', a.razaoNaConfirmacao),
    ...distribuicaoEmLinhas('Distância até o sinal pedido', a.distanciaAlvo),
    ['Latência p50 (ms)', a.latencia.p50],
    ['Latência p95 (ms)', a.latencia.p95],
    ['Inferência (Hz)', a.hz]
  ];
  if (r.tipo === 'geral') {
    linhas.push(
      ['Piores sinais (acerto por quadro)', r.destaques.pioresSinais.map((p) => `${p.sinal} ${Math.round(p.acertoQuadros * 100)}%`).join(', ')],
      ['Pares mais confundidos (quadros)', r.destaques.paresConfundidos.map((p) => `${p.par} (${p.quadros})`).join(', ')]
    );
  }
  return [['Medida', 'Valor'], ...linhas];
}

function porSinal(arquivo) {
  const r = arquivo.relatorio;
  const lista = r.tipo === 'geral' ? r.porSinal : [r];
  return [
    ['Sinal', 'Rodadas', 'Puladas', 'Acertos', 'Trocas', 'Rejeições', 'Tempo esgotado', 'Não reconhecido',
      'Acerto por rodada (%)', 'Acerto por quadro (%)', 'Tempo médio até reconhecer (s)',
      'Razão nos certos (mediana)', 'Distância até o sinal (mediana)', 'Confundido com (quadros)'],
    ...lista.map((x) => [
      x.sinal, x.rodadas, x.puladas, x.resultados.acerto, x.resultados.troca, x.resultados.rejeicao,
      x.resultados['tempo-esgotado'], x.resultados['nao-reconhecido'], cem(x.acerto), cem(x.acertoQuadros),
      s(x.tempoMedioAteReconhecer), x.razaoNosCertos?.mediana ?? null, x.distanciaAlvo?.mediana ?? null,
      x.confusoes.slice(0, 5).map((c) => `${c.classe} (${c.quadros})`).join(', ')
    ])
  ];
}

/** Uma linha por rodada: é também o CSV. */
export function linhasDasRodadas(arquivo) {
  return [
    ['Nº', 'Sinal', 'Conjunto', 'Repetição', 'Estado', 'Início', 'Resultado', 'Reconhecido',
      'Tempo até reconhecer (s)', 'Confirmações erradas antes', 'Confirmações erradas na gravação',
      'Quadros', 'Válidos', 'Certos', 'Outra classe', 'Rejeitados', 'Sem mão', 'Bloqueados',
      'Acerto por quadro (%)', 'Maior sequência (quadros)', 'Mudanças de classe',
      'Razão (mediana)', 'Razão nos certos (mediana)', 'Distância até o sinal (mediana)',
      'Latência p50 (ms)', 'Latência p95 (ms)', 'Inferência (Hz)', 'Mão detectada'],
    ...arquivo.rodadas.map((r, i) => {
      const a = r.analise;
      const q = a?.quadros;
      return [
        i + 1, r.sinal, r.conjunto, r.repeticao, r.estado, r.inicio ? NOMES_INICIO[r.inicio] : null,
        r.resultado ? NOMES_RESULTADO[r.resultado] : null, r.reconhecido ?? null, s(r.tempoAteReconhecerMs),
        r.confirmacoesAntes?.length ?? null, a ? a.confirmacoes.filter((c) => c.classe !== r.sinal).length : null,
        q?.total ?? null, q?.validos ?? null, q?.certos ?? null, q?.outras ?? null, q?.rejeitados ?? null,
        q?.semMao ?? null, q?.bloqueados ?? null, cem(a?.acertoQuadros), a?.maiorSequencia.quadros ?? null,
        a?.mudancasDeClasse ?? null, a?.razao?.mediana ?? null, a?.razaoNosCertos?.mediana ?? null,
        a?.distanciaAlvo?.mediana ?? null, a?.latencia.p50 ?? null, a?.latencia.p95 ?? null, a?.hz ?? null,
        a?.mao.detectada ?? null
      ];
    })
  ];
}

function matriz(m) {
  return [
    ['Pedido \\ Reconhecido', ...m.colunas.map((c) => NOMES_COLUNA[c] ?? c)],
    ...m.linhas.map((linha) => [linha, ...m.colunas.map((c) => m.celulas[linha]?.[c] ?? 0)])
  ];
}

function quadros(arquivo) {
  const linhas = [['Nº da rodada', 'Sinal', 'Repetição', 'Instante (ms)', 'Categoria', 'Classe', 'Motivo da rejeição',
    'Razão', 'Distância até o sinal', 'Latência (ms)']];
  arquivo.rodadas.forEach((r, i) => {
    for (const l of r.analise?.linhaDoTempo ?? []) {
      linhas.push([i + 1, r.sinal, r.repeticao, l.ms, NOMES_CATEGORIA[l.categoria] ?? l.categoria, l.classe, l.motivo, l.razao, l.distanciaAlvo, l.latencia]);
    }
  });
  return linhas;
}

/** Achata um objeto em pares "caminho → valor" (camera.nome, ajustes.rigor…). */
function achatar(objeto, prefixo = '') {
  return Object.entries(objeto ?? {}).flatMap(([k, v]) => {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) return achatar(v, chave);
    return [[chave, Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'sim' : 'não') : v]];
  });
}

/** @returns {Array<{nome: string, linhas: any[][]}>} */
export function tabelas(arquivo) {
  const geral = relatorioGeral(arquivo.rodadas);
  return [
    { nome: 'Resumo', linhas: resumo(arquivo) },
    { nome: 'Por sinal', linhas: porSinal(arquivo) },
    { nome: 'Rodadas', linhas: linhasDasRodadas(arquivo) },
    { nome: 'Matriz por rodada', linhas: matriz(geral.matrizRodadas) },
    { nome: 'Matriz por quadro', linhas: matriz(geral.matrizQuadros) },
    { nome: 'Quadros', linhas: quadros(arquivo) },
    {
      nome: 'Metadados',
      linhas: [['Campo', 'Valor'], ...achatar({ ...arquivo.metadados, configuracao: arquivo.configuracao, parcial: arquivo.parcial })]
    }
  ];
}
