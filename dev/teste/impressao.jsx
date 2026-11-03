/**
 * Soletra (modo dev) — relatório do teste de sinais, ou da medição do modelo,
 * para imprimir ou salvar em PDF (dev/relatorio.html).
 *
 * O painel guarda o arquivo (do teste ou da medição) em storage.session e
 * abre esta página, que o desenha em HTML simples, pensado para papel A4 (sem
 * os componentes interativos do painel), e chama a impressão do navegador. O
 * título da página vira o nome sugerido do PDF.
 */
import './impressao.css';
import { createRoot } from 'react-dom/client';
import { ms, num, pct, seg } from '../formato.js';
import { CHAVE_IMPRESSAO, nomeDoArquivo } from './exportar.js';
import { RESULTADOS, relatorioGeral, relatorioUnitario } from './relatorio.js';
import { NOMES_CATEGORIA, NOMES_COLUNA, NOMES_INICIO, NOMES_RESULTADO, nomeSinal } from './rotulos.js';
import { FORMATO_MEDICAO } from '../../tools/medicao-modelo.js';
import { RelatorioMedicao } from '../medicao/ImpressaoMedicao.jsx';
import { nomeDaMedicao } from '../medicao/nome.js';

const faixa = (d, casas = 2) => (d ? `${num(d.mediana, casas)} (p10 ${num(d.p10, casas)} · p25 ${num(d.p25, casas)} · p75 ${num(d.p75, casas)} · p90 ${num(d.p90, casas)})` : '—');

function Pares({ linhas }) {
  return (
    <table className="pares">
      <tbody>
        {linhas.filter(Boolean).map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cabecalho({ arquivo }) {
  const m = arquivo.metadados;
  const c = arquivo.configuracao;
  const r = arquivo.relatorio;
  const cam = m.camera || {};
  return (
    <header>
      <h1>{`Soletra — teste de sinais · ${r.tipo === 'geral' ? 'relatório geral' : `relatório unitário (${nomeSinal(r.sinal)})`}`}</h1>
      {arquivo.parcial && <p className="aviso">Teste encerrado antes do fim: só as rodadas concluídas.</p>}
      <Pares
        linhas={[
          ['Data', new Date(m.dataHora).toLocaleString('pt-BR')],
          ['Participante', m.participante],
          ['Gravou o modelo pronto', m.gravouModeloPronto === null ? null : m.gravouModeloPronto ? 'sim' : 'não'],
          ['Início da rodada', NOMES_INICIO[c.inicio]],
          ['Rodadas', `${c.rodadas} por sinal · ${seg(c.duracaoMs)} cada${c.inicio === 'reconhecer' ? ` · espera máxima ${c.esperaMaxMs ? seg(c.esperaMaxMs) : 'sem limite'}` : ''}`],
          c.modo === 'geral' && ['Ordem', c.ordem === 'sorteada' ? `sorteada (semente ${c.semente})` : 'em ordem'],
          ['Ajustes', `rigor ×${num(m.ajustes.rigor)} · confirmar em ${num(m.ajustes.permanenciaMs, 0)} ms · mão ${m.ajustes.maoConfigurada}${m.ajustes.cameraInvertida ? ' · câmera invertida' : ''}`],
          ['Modelo', m.modelo ? `${m.modelo.classes} classes, ${m.modelo.amostras} amostras · SHA-256 ${m.modelo.sha256}` : null],
          ['Câmera', [cam.nome, cam.largura && `${cam.largura}×${cam.altura}`, Number.isFinite(cam.fpsMedido) && `${num(cam.fpsMedido, 1)} fps medidos`].filter(Boolean).join(' · ')],
          ['Condições', [m.condicoes.iluminacao, m.condicoes.distancia, m.condicoes.observacoes].filter(Boolean).join(' · ') || null],
          ['Versão', `${m.extensao.versao} · commit ${m.extensao.commit}`]
        ]}
      />
    </header>
  );
}

function Agregado({ a }) {
  const q = a.quadros;
  return (
    <Pares
      linhas={[
        ['Resultados', RESULTADOS.filter((k) => a.resultados[k]).map((k) => `${NOMES_RESULTADO[k]} ${a.resultados[k]}`).join(' · ') || '—'],
        ['Acerto por rodada', `${pct(a.acerto)} (${a.resultados.acerto} de ${a.rodadas})`],
        ['Acerto por quadro', pct(a.acertoQuadros)],
        ['Tempo até reconhecer', a.tempoAteReconhecer ? `média ${seg(a.tempoMedioAteReconhecer)} · mediana ${seg(a.tempoAteReconhecer.mediana)}` : '—'],
        ['Confirmações erradas', `${a.confirmacoesErradasAntes} antes de reconhecer · ${a.confirmacoesErradasNaGravacao} durante a gravação`],
        ['Quadros', `${q.total} gravados: ${q.certos} certos · ${q.outras} outra classe · ${q.rejeitados} rejeitados (${q.ambiguos} ambíguos, ${q.distantes} distantes) · ${q.semMao} sem mão · ${q.bloqueados} bloqueados`],
        ['Confundido com', a.confusoes.slice(0, 6).map((c) => `${c.classe} (${c.quadros})`).join(', ') || 'nada'],
        ['Razão nos quadros certos', faixa(a.razaoNosCertos)],
        ['Razão na confirmação', faixa(a.razaoNaConfirmacao)],
        ['Distância até o sinal pedido', faixa(a.distanciaAlvo, 3)],
        ['Latência', Number.isFinite(a.latencia.p50) ? `p50 ${ms(a.latencia.p50)} · p95 ${ms(a.latencia.p95)} · ${num(a.hz, 1)} Hz` : '—']
      ]}
    />
  );
}

function Matriz({ titulo, m }) {
  const colunas = m.colunas.filter((c) => m.linhas.some((s) => m.celulas[s]?.[c]));
  if (colunas.length === 0) {
    return (
      <section className="quebra-evitar">
        <h3>{titulo}</h3>
        <p>Nenhum quadro gravado.</p>
      </section>
    );
  }
  return (
    <section className="quebra-evitar">
      <h3>{titulo}</h3>
      <table className="matriz">
        <thead>
          <tr>
            <th>pedido ↓</th>
            {colunas.map((c) => <th key={c}>{NOMES_COLUNA[c] ?? c}</th>)}
          </tr>
        </thead>
        <tbody>
          {m.linhas.map((s) => {
            const total = Object.values(m.celulas[s] || {}).reduce((t, n) => t + n, 0);
            return (
              <tr key={s}>
                <th>{s}</th>
                {colunas.map((c) => {
                  const n = m.celulas[s]?.[c] || 0;
                  return <td key={c} data-diagonal={c === s} style={{ '--peso': total && n ? n / total : 0 }}>{n || ''}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Rodadas({ r }) {
  return (
    <section className="quebra-evitar">
      <h3>{`${nomeSinal(r.sinal)} — rodadas`}</h3>
      {r.rodadasDetalhe.map((d) => (
        <div key={d.repeticao} className="rodada">
          <p>
            <strong>{`Rodada ${d.repeticao}: ${d.resultado === 'troca' ? `troca por ${d.reconhecido}` : NOMES_RESULTADO[d.resultado]}`}</strong>
            {[
              Number.isFinite(d.tempoAteReconhecerMs) && ` · reconhecida em ${seg(d.tempoAteReconhecerMs)}`,
              d.confirmacoesAntes.length > 0 && ` · antes confirmou ${d.confirmacoesAntes.map((c) => c.classe).join(', ')}`,
              d.linhaDoTempo.length > 0 && ` · ${pct(d.acertoQuadros, 0)} dos quadros · maior sequência ${d.maiorSequencia.quadros} quadros`
            ].filter(Boolean).join('')}
          </p>
          {d.linhaDoTempo.length > 0 && (
            <div className="tl">
              {d.linhaDoTempo.map((q, i) => <span key={i} data-c={q.categoria} />)}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function Legenda() {
  return (
    <p className="legenda">
      {Object.entries(NOMES_CATEGORIA).map(([c, nome]) => (
        <span key={c}><i data-c={c} /> {nome}</span>
      ))}
    </p>
  );
}

function Relatorio({ arquivo }) {
  const r = arquivo.relatorio;
  const geral = r.tipo === 'geral';
  const matrizes = relatorioGeral(arquivo.rodadas);
  return (
    <main>
      <Cabecalho arquivo={arquivo} />
      <section>
        <h2>Resumo</h2>
        <Agregado a={geral ? r.resumo : r} />
      </section>
      {geral && (
        <>
          <section>
            <h2>Destaques</h2>
            <Pares
              linhas={[
                ['Piores sinais (por quadro)', r.destaques.pioresSinais.map((s) => `${s.sinal} ${pct(s.acertoQuadros, 0)}`).join(' · ') || '—'],
                ['Pares mais confundidos', r.destaques.paresConfundidos.map((p) => `${p.par} (${p.quadros})`).join(' · ') || 'nenhum']
              ]}
            />
          </section>
          <section>
            <h2>Por sinal</h2>
            <table className="grade">
              <thead>
                <tr>
                  <th>Sinal</th><th>Rod.</th><th>Acerto</th><th>Troca</th><th>Rej.</th><th>Tempo</th><th>Não rec.</th>
                  <th>Por quadro</th><th>Reconhece em</th><th>Razão (mediana)</th>
                </tr>
              </thead>
              <tbody>
                {r.porSinal.map((s) => (
                  <tr key={s.sinal}>
                    <th>{s.sinal}</th><td>{s.rodadas}</td><td>{s.resultados.acerto}</td><td>{s.resultados.troca}</td>
                    <td>{s.resultados.rejeicao}</td><td>{s.resultados['tempo-esgotado']}</td><td>{s.resultados['nao-reconhecido']}</td>
                    <td>{pct(s.acertoQuadros, 0)}</td><td>{seg(s.tempoMedioAteReconhecer)}</td><td>{num(s.razaoNosCertos?.mediana)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      <section>
        <h2>Matrizes de confusão</h2>
        <Matriz titulo="Por rodada (primeira letra confirmada)" m={matrizes.matrizRodadas} />
        <Matriz titulo="Por quadro (o que o classificador deu em cada quadro)" m={matrizes.matrizQuadros} />
      </section>
      <section>
        <h2>Rodadas</h2>
        <Legenda />
        {(geral ? r.sinais.map((s) => relatorioUnitario(s, arquivo.rodadas)) : [r]).map((u) => <Rodadas key={u.sinal} r={u} />)}
      </section>
      <footer>Gerado pelo modo dev do Soletra. Sem imagens nem pontos da mão: só números.</footer>
    </main>
  );
}

function Erro({ texto }) {
  return <main><p className="aviso">{texto}</p></main>;
}

const raiz = createRoot(document.getElementById('raiz'));
chrome.storage.session
  .get(CHAVE_IMPRESSAO)
  .then((g) => {
    const arquivo = g?.[CHAVE_IMPRESSAO];
    if (!arquivo) {
      raiz.render(<Erro texto="Nenhum relatório para imprimir. Volte ao painel e use Exportar → PDF." />);
      return;
    }
    // A mesma página serve ao teste de sinais e à medição do modelo.
    const medicao = arquivo.formato === FORMATO_MEDICAO;
    document.title = medicao ? nomeDaMedicao(arquivo, null) : nomeDoArquivo(arquivo, null);
    raiz.render(
      <>
        <div className="barra">
          <button type="button" onClick={() => window.print()}>Imprimir / Salvar como PDF</button>
          <span>Na janela de impressão, escolha o destino “Salvar como PDF”.</span>
        </div>
        {medicao ? <RelatorioMedicao arquivo={arquivo} /> : <Relatorio arquivo={arquivo} />}
      </>
    );
    // Dois quadros: o primeiro desenha, o segundo garante o layout antes da impressão.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  })
  .catch((err) => raiz.render(<Erro texto={`Não foi possível abrir o relatório: ${err?.message || err}`} />));
