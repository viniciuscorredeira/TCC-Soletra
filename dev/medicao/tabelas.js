/**
 * Soletra (modo dev) — a medição do modelo em planilhas, para o Excel.
 *
 * Puro: entra o arquivo da medição (soletra-medicao-modelo, do painel ou do
 * terminal), saem planilhas como listas de linhas, a primeira sendo o
 * cabeçalho. Porcentagens vão de 0 a 100, como diz cada cabeçalho.
 */
import { NOMES_CONJUNTO, descreverAmbiente, emOrdem } from '../../tools/medicao-modelo.js';

const cem = (f) => (Number.isFinite(f) ? f * 100 : null);
const conjuntos = (arquivo) => emOrdem(arquivo.conjuntos);

function porValidacao(arquivo, cabecalho, linhasDe) {
  const linhas = [cabecalho];
  for (const [id, c] of conjuntos(arquivo)) {
    for (const v of c.validacao) for (const l of linhasDe(v, id, c)) linhas.push([NOMES_CONJUNTO[id], v.tamanhoBloco, ...l]);
  }
  return linhas;
}

function resumo(arquivo) {
  const linhas = porValidacao(
    arquivo,
    ['Conjunto', 'Bloco', 'Classes', 'Amostras', 'Acertos', 'Acerto (%)'],
    (v, _, c) => [[c.classes.length, v.amostras, v.acertos, cem(v.acerto)]]
  );
  const conf = arquivo.conferenciaTcc;
  if (conf) {
    linhas.push([], ['Tabela do TCC', conf.bate ? 'confere' : 'não confere']);
    for (const i of conf.itens) linhas.push([NOMES_CONJUNTO[i.conjunto], i.tamanhoBloco, 'esperado (%)', cem(i.esperado), 'medido (%)', cem(i.medido)]);
  }
  for (const aviso of arquivo.avisos ?? []) linhas.push([], ['Aviso', aviso]);
  return linhas;
}

const porClasse = (arquivo) =>
  porValidacao(arquivo, ['Conjunto', 'Bloco', 'Classe', 'Amostras', 'Acertos', 'Acerto (%)', 'Confundida com'], (v, _, c) =>
    c.classes.map((nome) => {
      const p = v.porClasse[nome];
      return [nome, p.amostras, p.acertos, cem(p.acerto), p.confundidaCom.map((x) => `${x.classe} (${x.vezes})`).join(', ')];
    })
  );

const confusoes = (arquivo) =>
  porValidacao(arquivo, ['Conjunto', 'Bloco', 'Sinal', 'Classificado como', 'Vezes'], (v) =>
    v.confusoes.map((x) => [x.real, x.previsto, x.vezes])
  );

const QUANTIS = ['n', 'min', 'p10', 'p25', 'mediana', 'p75', 'p90', 'max'];

const razao = (arquivo) =>
  porValidacao(arquivo, ['Conjunto', 'Bloco', 'Grupo', 'n', 'mín', 'p10', 'p25', 'mediana', 'p75', 'p90', 'máx'], (v) =>
    [['acertos', v.razao.acertos], ['erros', v.razao.erros]].map(([g, d]) => [g, ...QUANTIS.map((k) => d?.[k] ?? null)])
  );

const cortes = (arquivo) =>
  porValidacao(
    arquivo,
    ['Conjunto', 'Bloco', 'Corte', 'Acertos descartados', 'Acertos descartados (%)', 'Erros barrados', 'Erros barrados (%)', 'Acerto que sobra (%)'],
    (v) => v.cortes.map((x) => [x.corte, x.acertosDescartados, cem(x.fracaoAcertosDescartados), x.errosBarrados, cem(x.fracaoErrosBarrados), cem(x.acertoFinal)])
  );

const rigor = (arquivo) =>
  porValidacao(
    arquivo,
    ['Conjunto', 'Bloco', 'Rigor', 'Multiplicador', 'Razão efetiva', 'Limiar efetivo (mediana)', 'Acerto (%)', 'Rejeição (%)',
      'Rejeitadas ambíguas', 'Rejeitadas distantes', 'Erros que passam (%)', 'Precisão (%)'],
    (v) => v.rigor.map((r) => [r.nome, r.multiplicador, r.razaoEfetiva, r.limiarEfetivoMediano, cem(r.acertoFinal), cem(r.rejeicao),
      r.rejeitadasAmbiguas, r.rejeitadasDistantes, cem(r.errosQuePassam), cem(r.precisao)])
  );

function limiar(arquivo) {
  const linhas = [['Conjunto', 'Limiar calculado', 'p90 da vizinha da mesma classe', 'Mesma classe: mediana', 'Outra classe: mediana',
    'Outra classe: mínimo', 'Com outra classe abaixo — Tolerante (%)', 'Normal (%)', 'Exigente (%)']];
  for (const [id, c] of conjuntos(arquivo)) {
    const l = c.limiar;
    linhas.push([NOMES_CONJUNTO[id], l.calibrado, l.p90MesmaClasse, l.distanciaMesmaClasse?.mediana ?? null, l.distanciaOutraClasse?.mediana ?? null,
      l.distanciaOutraClasse?.min ?? null, ...l.porRigor.map((r) => cem(r.fracao))]);
  }
  return linhas;
}

const pares = (arquivo) => [
  ['Par', 'Distância mediana', 'Menor distância'],
  ...(arquivo.paresMaisProximos || []).map((p) => [p.par, p.distanciaMediana, p.menor])
];

function comparacao(arquivo) {
  const cmp = arquivo.comparacao;
  const linhas = [['Conjunto', 'Bloco', `Acerto — ${arquivo.arquivo} (%)`, `Acerto — ${cmp.arquivo} (%)`]];
  for (const [id, c] of conjuntos(arquivo)) {
    for (const v of c.validacao) {
      const o = cmp.conjuntos[id]?.validacao.find((x) => x.tamanhoBloco === v.tamanhoBloco);
      linhas.push([NOMES_CONJUNTO[id], v.tamanhoBloco, cem(v.acerto), cem(o?.acerto)]);
    }
  }
  linhas.push([], ['Conjunto', 'Treinado com', 'Testado com', 'Acerto sem cortes (%)', 'Rigor Normal: acerto (%)', 'Rejeição (%)', 'Erros que passam (%)']);
  const sentidos = [
    [arquivo.arquivo, cmp.arquivo, cmp.cruzado.desteParaOutro],
    [cmp.arquivo, arquivo.arquivo, cmp.cruzado.doOutroParaEste]
  ];
  for (const [treino, teste, porConjunto] of sentidos) {
    for (const [id, x] of emOrdem(porConjunto)) {
      linhas.push([NOMES_CONJUNTO[id], treino, teste, cem(x.acerto), cem(x.normal.acertoFinal), cem(x.normal.rejeicao), cem(x.normal.errosQuePassam)]);
    }
  }
  return linhas;
}

function metadados(arquivo) {
  const m = arquivo.modelo;
  const p = arquivo.parametros;
  return [
    ['Campo', 'Valor'],
    ['Data', arquivo.dataHora],
    ['Modelo', arquivo.arquivo],
    ['SHA-256 do modelo (amostras)', m.sha256],
    ['SHA-256 do arquivo', m.sha256Arquivo],
    ['Classes', m.classes],
    ['Amostras', m.amostras],
    ['Commit', arquivo.commit],
    ['Ambiente', descreverAmbiente(arquivo) || null],
    ['k', p.k],
    ['Voto', p.voto],
    ['Razão máxima', p.razaoMax],
    ['Teto da razão', p.razaoTeto],
    ['Limiar padrão', p.limiarPadrao],
    ['Blocos', p.blocos.join(', ')],
    ['Cortes da razão', p.cortesRazao.join(', ')],
    ['Rigores', p.rigores.map((r) => `${r.nome} ×${r.multiplicador}`).join(', ')],
    ...(arquivo.comparacao ? [['Comparado com', arquivo.comparacao.arquivo], ['SHA-256 do outro modelo', arquivo.comparacao.modelo.sha256]] : [])
  ];
}

/** @returns {Array<{nome: string, linhas: any[][]}>} */
export function tabelasMedicao(arquivo) {
  return [
    { nome: 'Resumo', linhas: resumo(arquivo) },
    { nome: 'Por classe', linhas: porClasse(arquivo) },
    { nome: 'Confusões', linhas: confusoes(arquivo) },
    { nome: 'Razão', linhas: razao(arquivo) },
    { nome: 'Corte da razão', linhas: cortes(arquivo) },
    { nome: 'Rigor', linhas: rigor(arquivo) },
    { nome: 'Limiar', linhas: limiar(arquivo) },
    { nome: 'Pares próximos', linhas: pares(arquivo) },
    ...(arquivo.comparacao ? [{ nome: 'Comparação', linhas: comparacao(arquivo) }] : []),
    { nome: 'Metadados', linhas: metadados(arquivo) }
  ];
}
