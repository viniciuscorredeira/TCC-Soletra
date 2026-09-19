/**
 * Soletra — view do treino.
 *
 * Grade de classes com contagem de amostras, captura assistida e os botões de
 * exportar/importar/apagar. Apagar e exportar não são conveniência: são os
 * direitos de eliminação e portabilidade do titular sobre um template
 * biométrico derivado.
 */
import { classesDoConjunto } from '../src/sign-classes.js';
import { AMOSTRAS_RECOMENDADAS } from '../src/sign-model-store.js';

export function montarTrainingView(acoes) {
  const el = {
    box: document.getElementById('treinoBox'),
    resumo: document.getElementById('treinoResumo'),
    segMao: [document.getElementById('btnDireita'), document.getElementById('btnEsquerda')],
    grade: document.getElementById('gradeClasses'),
    status: document.getElementById('capturaStatus'),
    statusTexto: document.getElementById('capturaTexto'),
    btnCancelar: document.getElementById('btnCancelarCaptura'),
    btnExportar: document.getElementById('btnExportar'),
    btnImportar: document.getElementById('btnImportar'),
    btnApagar: document.getElementById('btnApagarModelo'),
    arquivo: document.getElementById('arquivoModelo')
  };

  for (const seg of el.segMao) {
    seg.addEventListener('click', () => acoes.definirMao(seg.dataset.mao));
  }
  el.btnCancelar.addEventListener('click', acoes.cancelarCaptura);
  el.btnExportar.addEventListener('click', acoes.exportar);
  el.btnImportar.addEventListener('click', () => el.arquivo.click());
  el.btnApagar.addEventListener('click', acoes.apagarModelo);

  el.arquivo.addEventListener('change', async () => {
    const arquivo = el.arquivo.files?.[0];
    el.arquivo.value = ''; // permite reimportar o mesmo arquivo depois
    if (arquivo) await acoes.importar(arquivo);
  });

  /**
   * Botões vivos, por classe.
   *
   * A grade é construída UMA vez por conjunto e depois só atualizada no lugar.
   * Recriá-la a cada mudança de contagem parecia inofensivo e não era: durante a
   * captura as contagens mudam a cada ~150 ms, então 21 botões eram destruídos e
   * recriados ~7 vezes por segundo. Somado ao detectForVideo síncrono e ao render
   * a 15 Hz, a thread do painel saturava e os cliques — inclusive o de Cancelar —
   * eram engolidos.
   * @type {Map<string, {wrap: HTMLElement, btn: HTMLButtonElement, badge: HTMLElement, x: HTMLButtonElement}>}
   */
  const botoes = new Map();
  let conjuntoDesenhado = null;

  function desenharGrade(conjunto) {
    conjuntoDesenhado = conjunto;
    botoes.clear();
    el.grade.replaceChildren();

    for (const classe of classesDoConjunto(conjunto)) {
      const wrap = document.createElement('div');
      wrap.className = 'classe-wrap';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'classe';
      btn.append(classe);

      const badge = document.createElement('span');
      badge.className = 'classe__n';
      btn.append(badge);
      btn.addEventListener('click', () => acoes.treinar(classe));

      // Excluir uma classe isolada evita refazer o modelo inteiro por causa de
      // uma letra que ficou ruim. Fica fora do botão de treino porque um <button>
      // não pode conter outro.
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'classe__x';
      x.textContent = '×';
      x.title = `Apagar as amostras de ${classe}`;
      x.setAttribute('aria-label', `Apagar as amostras de ${classe}`);
      x.addEventListener('click', () => acoes.apagarClasse(classe));

      wrap.append(btn, x);
      el.grade.append(wrap);
      botoes.set(classe, { wrap, btn, badge, x, n: -1, ativa: null });
    }
  }

  function renderizar(s) {
    const classes = classesDoConjunto(s.conjunto);
    const capturando = Boolean(s.captura);

    for (const seg of el.segMao) {
      seg.classList.toggle('seg--on', seg.dataset.mao === s.mao);
      seg.disabled = capturando;
    }

    const treinadas = classes.filter((c) => (s.amostrasPorClasse[c] || 0) > 0).length;
    const resumo = `${treinadas}/${classes.length}`;
    if (el.resumo.textContent !== resumo) el.resumo.textContent = resumo;

    if (s.conjunto !== conjuntoDesenhado) desenharGrade(s.conjunto);

    // Este laço roda a 15 Hz sobre 21 botões. Escrever só o que mudou faz a
    // diferença entre um render praticamente gratuito e 300 escritas de atributo
    // por segundo competindo com o detectForVideo síncrono pela mesma thread.
    for (const [classe, refs] of botoes) {
      const n = s.amostrasPorClasse[classe] || 0;
      const ativa = s.captura?.classe === classe;

      if (refs.n !== n) {
        refs.n = n;
        refs.badge.textContent = n > 0 ? String(n) : '·';
        refs.btn.title = `${classe} — ${n} amostra(s)`;
        refs.btn.classList.toggle('classe--treinada', n >= AMOSTRAS_RECOMENDADAS);
        refs.btn.classList.toggle('classe--parcial', n > 0 && n < AMOSTRAS_RECOMENDADAS);
      }
      if (refs.ativa !== ativa) {
        refs.ativa = ativa;
        refs.btn.classList.toggle('classe--ativa', ativa);
      }
      if (refs.btn.disabled !== capturando) refs.btn.disabled = capturando;

      const escondeX = n === 0 || capturando;
      if (refs.x.hidden !== escondeX) refs.x.hidden = escondeX;
    }

    if (el.status.hidden === capturando) el.status.hidden = !capturando;
    if (capturando) {
      const texto = `Gravando "${s.captura.classe}" — ${s.captura.capturadas}/${s.captura.alvo}`;
      if (el.statusTexto.textContent !== texto) el.statusTexto.textContent = texto;
    }

    el.btnExportar.disabled = s.modeloVazio || capturando;
    el.btnApagar.disabled = s.modeloVazio || capturando;
    el.btnImportar.disabled = capturando;
  }

  return { renderizar, abrir: () => (el.box.open = true) };
}
