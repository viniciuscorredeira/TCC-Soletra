/**
 * RVL Libras — view do treino.
 *
 * Grade de classes com contagem de amostras, captura assistida e os botões de
 * exportar/importar/apagar. Os dois últimos não são conveniência: apagar e
 * exportar são os direitos de eliminação e portabilidade do titular sobre um
 * template biométrico derivado.
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

  /** Guarda o conjunto desenhado para não recriar 21 botões a cada quadro. */
  let assinaturaGrade = '';

  function renderizar(s) {
    const classes = classesDoConjunto(s.conjunto);
    const capturando = Boolean(s.captura);

    for (const seg of el.segMao) {
      seg.classList.toggle('seg--on', seg.dataset.mao === s.mao);
      seg.disabled = capturando;
    }

    const treinadas = classes.filter((c) => (s.amostrasPorClasse[c] || 0) > 0).length;
    el.resumo.textContent = `— ${treinadas}/${classes.length} ${s.conjunto} treinadas`;

    // A grade é redesenhada só quando algo que ela mostra muda; o render roda a
    // 15 Hz e recriar os botões a cada quadro mataria o clique do usuário.
    const assinatura = `${s.conjunto}|${s.captura?.classe ?? ''}|${classes
      .map((c) => s.amostrasPorClasse[c] || 0)
      .join(',')}|${capturando}`;

    if (assinatura !== assinaturaGrade) {
      assinaturaGrade = assinatura;
      el.grade.replaceChildren();

      for (const classe of classes) {
        const n = s.amostrasPorClasse[classe] || 0;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'classe';
        btn.classList.toggle('classe--treinada', n >= AMOSTRAS_RECOMENDADAS);
        btn.classList.toggle('classe--ativa', s.captura?.classe === classe);
        btn.disabled = capturando;
        btn.title = `${classe} — ${n} amostra(s)`;
        btn.append(classe);

        const badge = document.createElement('span');
        badge.className = 'classe__n';
        badge.textContent = n > 0 ? String(n) : '·';
        btn.append(badge);

        btn.addEventListener('click', () => acoes.treinar(classe));
        el.grade.append(btn);
      }
    }

    el.status.hidden = !capturando;
    if (capturando) {
      el.statusTexto.textContent =
        `Gravando "${s.captura.classe}" — ${s.captura.capturadas}/${s.captura.alvo}.` +
        ' Mantenha o sinal, variando um pouco o ângulo.';
    }

    el.btnExportar.disabled = s.modeloVazio || capturando;
    el.btnApagar.disabled = s.modeloVazio || capturando;
    el.btnImportar.disabled = capturando;
  }

  return { renderizar, abrir: () => (el.box.open = true) };
}
