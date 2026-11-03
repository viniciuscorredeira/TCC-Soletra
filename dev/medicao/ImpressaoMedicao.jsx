/**
 * Soletra (modo dev) — a medição do modelo em papel (A4), desenhada pela
 * página de impressão (dev/relatorio.html) quando o arquivo guardado é uma
 * medição. Tudo em tabelas: é o que vai para o anexo do TCC.
 */
import { NOMES_CONJUNTO, descreverAmbiente, emOrdem } from '../../tools/medicao-modelo.js';
import { num, pct } from '../formato.js';

const QUANTIS = [['min', 'mín'], ['p10', 'p10'], ['p25', 'p25'], ['mediana', 'mediana'], ['p75', 'p75'], ['p90', 'p90'], ['max', 'máx']];

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
  const m = arquivo.modelo;
  const p = arquivo.parametros;
  return (
    <header>
      <h1>Soletra — medição do modelo</h1>
      <Pares
        linhas={[
          ['Data', new Date(arquivo.dataHora).toLocaleString('pt-BR')],
          ['Modelo', `${arquivo.arquivo} · ${m.classes} classes, ${m.amostras} amostras`],
          ['SHA-256 do modelo', m.sha256],
          arquivo.comparacao && ['Comparado com', `${arquivo.comparacao.arquivo} · SHA-256 ${arquivo.comparacao.modelo.sha256}`],
          ['Método', `validação em blocos de ${p.blocos.join(' e ')} amostras seguidas · k = ${p.k}, voto ${p.voto}`],
          ['Versão', [`commit ${arquivo.commit}`, descreverAmbiente(arquivo)].filter(Boolean).join(' · ')]
        ]}
      />
    </header>
  );
}

function Acerto({ arquivo }) {
  const blocos = arquivo.parametros.blocos;
  return (
    <table className="grade">
      <thead>
        <tr><th>Conjunto</th>{blocos.map((b) => <th key={b}>{`Blocos de ${b}`}</th>)}</tr>
      </thead>
      <tbody>
        {emOrdem(arquivo.conjuntos).map(([id, c]) => (
          <tr key={id}>
            <th>{`${NOMES_CONJUNTO[id]} (${c.classes.length})`}</th>
            {c.validacao.map((v) => <td key={v.tamanhoBloco}>{pct(v.acerto)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Conjunto({ id, c }) {
  const [primeiro] = c.validacao;
  return (
    <section>
      <h2>{`${NOMES_CONJUNTO[id]} (${c.classes.length} classes)`}</h2>

      <h3>Acerto por classe</h3>
      <table className="grade">
        <thead>
          <tr>
            <th>Classe</th>
            {c.validacao.map((v) => <th key={v.tamanhoBloco}>{`Blocos de ${v.tamanhoBloco}`}</th>)}
            <th>{`Confundida com (blocos de ${primeiro.tamanhoBloco})`}</th>
          </tr>
        </thead>
        <tbody>
          {c.classes.map((nome) => (
            <tr key={nome}>
              <th>{nome}</th>
              {c.validacao.map((v) => <td key={v.tamanhoBloco}>{pct(v.porClasse[nome].acerto, 0)}</td>)}
              <td className="esquerda">{primeiro.porClasse[nome].confundidaCom.slice(0, 4).map((x) => `${x.classe} (${x.vezes})`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="quebra-evitar">
        <h3>Razão vencedora/segunda</h3>
        <table className="grade">
          <thead>
            <tr><th>Grupo</th><th>n</th>{QUANTIS.map(([, r]) => <th key={r}>{r}</th>)}</tr>
          </thead>
          <tbody>
            {c.validacao.flatMap((v) =>
              [['acertos', v.razao.acertos], ['erros', v.razao.erros]].map(([g, d]) => (
                <tr key={`${v.tamanhoBloco}-${g}`}>
                  <th>{`${g}, blocos de ${v.tamanhoBloco}`}</th>
                  <td>{d?.n ?? 0}</td>
                  {QUANTIS.map(([k]) => <td key={k}>{num(d?.[k])}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="quebra-evitar">
        <h3>Efeito do corte da razão</h3>
        <table className="grade">
          <thead>
            <tr><th>Blocos</th><th>Corte</th><th>Acertos descartados</th><th>Erros barrados</th><th>Acerto que sobra</th></tr>
          </thead>
          <tbody>
            {c.validacao.flatMap((v) =>
              v.cortes.map((x) => (
                <tr key={`${v.tamanhoBloco}-${x.corte}`}>
                  <th>{v.tamanhoBloco}</th>
                  <td>{num(x.corte)}</td>
                  <td>{`${pct(x.fracaoAcertosDescartados)} (${x.acertosDescartados})`}</td>
                  <td>{`${pct(x.fracaoErrosBarrados, 0)} (${x.errosBarrados})`}</td>
                  <td>{pct(x.acertoFinal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="quebra-evitar">
        <h3>Efeito do rigor</h3>
        <table className="grade">
          <thead>
            <tr><th>Blocos</th><th>Rigor</th><th>Razão</th><th>Limiar</th><th>Acerto</th><th>Rejeição</th><th>Erro passa</th><th>Precisão</th></tr>
          </thead>
          <tbody>
            {c.validacao.flatMap((v) =>
              v.rigor.map((r) => (
                <tr key={`${v.tamanhoBloco}-${r.nome}`}>
                  <th>{v.tamanhoBloco}</th>
                  <td className="esquerda">{r.nome}</td>
                  <td>{num(r.razaoEfetiva)}</td>
                  <td>{num(r.limiarEfetivoMediano)}</td>
                  <td>{pct(r.acertoFinal)}</td>
                  <td>{pct(r.rejeicao)}</td>
                  <td>{pct(r.errosQuePassam)}</td>
                  <td>{pct(r.precisao)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p>
        {`Confusões mais frequentes (blocos de ${primeiro.tamanhoBloco}): ${primeiro.confusoes.slice(0, 10).map((x) => `${x.real}→${x.previsto} (${x.vezes})`).join(', ') || 'nenhuma'}.`}
      </p>
      <p>
        {`Limiar de distância: ${num(c.limiar.calibrado, 3)} (maior entre ${num(c.limiar.padrao, 1)} e 5 × ${num(c.limiar.p90MesmaClasse, 3)}). ` +
          `Amostras com uma de outra classe abaixo dele: ${c.limiar.porRigor.map((r) => `${r.nome} ${pct(r.fracao)}`).join(' · ')}.`}
      </p>
    </section>
  );
}

function Comparacao({ arquivo }) {
  const cmp = arquivo.comparacao;
  const sentidos = [
    [arquivo.arquivo, cmp.arquivo, cmp.cruzado.desteParaOutro],
    [cmp.arquivo, arquivo.arquivo, cmp.cruzado.doOutroParaEste]
  ];
  return (
    <section className="quebra-evitar">
      <h2>Comparação entre modelos</h2>
      <table className="grade">
        <thead>
          <tr><th>Treinado com</th><th>Testado com</th><th>Conjunto</th><th>Sem cortes</th><th>Rigor Normal</th><th>Rejeição</th><th>Erro passa</th></tr>
        </thead>
        <tbody>
          {sentidos.flatMap(([treino, teste, porConjunto]) =>
            emOrdem(porConjunto).map(([id, x]) => (
              <tr key={`${treino}-${id}`}>
                <td className="esquerda">{treino}</td>
                <td className="esquerda">{teste}</td>
                <th>{NOMES_CONJUNTO[id]}</th>
                <td>{pct(x.acerto)}</td>
                <td>{pct(x.normal.acertoFinal)}</td>
                <td>{pct(x.normal.rejeicao)}</td>
                <td>{pct(x.normal.errosQuePassam)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

export function RelatorioMedicao({ arquivo }) {
  const conf = arquivo.conferenciaTcc;
  return (
    <main>
      <Cabecalho arquivo={arquivo} />
      {conf && (
        <p className={conf.bate ? 'confere' : 'aviso'}>
          {conf.bate
            ? `Confere com a tabela do TCC: ${conf.itens.length} de ${conf.itens.length} valores iguais.`
            : 'Não confere com a tabela do TCC: veja os valores abaixo.'}
        </p>
      )}
      {(arquivo.avisos ?? []).map((a) => <p key={a} className="aviso">{a}</p>)}
      <section>
        <h2>Acerto por validação em blocos</h2>
        <p>Sem limiar e sem teste de razão: cada bloco de amostras seguidas de uma classe sai do modelo e é classificado pelo resto.</p>
        <Acerto arquivo={arquivo} />
      </section>
      {emOrdem(arquivo.conjuntos).map(([id, c]) => <Conjunto key={id} id={id} c={c} />)}
      <section className="quebra-evitar">
        <h2>Pares de classes mais próximos</h2>
        <p>{(arquivo.paresMaisProximos || []).map((p) => `${p.par} ${num(p.distanciaMediana, 3)}`).join(' · ')}</p>
      </section>
      {arquivo.comparacao && <Comparacao arquivo={arquivo} />}
      <footer>Gerado pelo modo dev do Soletra (o mesmo cálculo de tools/medir-modelo.mjs). Só números: nenhuma imagem.</footer>
    </main>
  );
}
