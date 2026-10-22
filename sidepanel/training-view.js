/**
 * Soletra — view do treino.
 *
 * Grade de classes com contagem de amostras, captura assistida e os botões de
 * exportar/importar/apagar, além da escolha entre o modelo pronto e o treino do
 * zero na primeira abertura. Apagar e exportar não são conveniência: são os
 * direitos de eliminação e portabilidade do titular sobre um template
 * biométrico derivado.
 */
import { classesDoConjunto } from '../src/sign-classes.js';
import { AMOSTRAS_RECOMENDADAS, AMOSTRAS_MAXIMAS } from '../src/sign-model-store.js';

export function montarTrainingView(acoes) {
  const el = {
    box: document.getElementById('treinoBox'),
    resumo: document.getElementById('treinoResumo'),
    segMao: [document.getElementById('btnDireita'), document.getElementById('btnEsquerda')],
    segImagem: [document.getElementById('btnImagemNormal'), document.getElementById('btnImagemInvertida')],
    grade: document.getElementById('gradeClasses'),
    status: document.getElementById('capturaStatus'),
    statusTexto: document.getElementById('capturaTexto'),
    btnCancelar: document.getElementById('btnCancelarCaptura'),
    btnExportar: document.getElementById('btnExportar'),
    btnImportar: document.getElementById('btnImportar'),
    btnApagar: document.getElementById('btnApagarModelo'),
    btnInstalarPadrao: document.getElementById('btnInstalarPadrao'),
    arquivo: document.getElementById('arquivoModelo'),
    uso: document.getElementById('usoArmazenamento'),
    boasVindas: document.getElementById('boasVindas'),
    btnUsarPadrao: document.getElementById('btnUsarPadrao'),
    btnTreinarZero: document.getElementById('btnTreinarZero')
  };

  for (const seg of el.segMao) {
    seg.addEventListener('click', () => acoes.definirMao(seg.dataset.mao));
  }
  for (const seg of el.segImagem) {
    seg.addEventListener('click', () => acoes.definirCameraEspelhada(seg.dataset.espelhada === '1'));
  }
  el.btnCancelar.addEventListener('click', acoes.cancelarCaptura);
  el.btnExportar.addEventListener('click', acoes.exportar);
  el.btnImportar.addEventListener('click', () => el.arquivo.click());
  el.btnApagar.addEventListener('click', acoes.apagarModelo);
  el.btnInstalarPadrao.addEventListener('click', acoes.instalarPadrao);
  el.btnUsarPadrao.addEventListener('click', acoes.usarPadrao);
  // Escolher treinar do zero dispensa o cartão nesta abertura; sem isso ele
  // ficaria na tela até a primeira amostra gravada.
  let boasVindasDispensadas = false;
  el.btnTreinarZero.addEventListener('click', () => {
    boasVindasDispensadas = true;
    el.boasVindas.hidden = true;
    el.box.open = true;
    el.box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

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
      // Quanto do teto de amostras da classe já está ocupado, em texto e na
      // barra da base do botão (largura via --uso).
      const pct = document.createElement('span');
      pct.className = 'classe__pct';
      btn.append(badge, pct);
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
      botoes.set(classe, { wrap, btn, badge, pct, x, n: -1, chaveOrigem: '', ativa: null });
    }
  }

  function renderizar(s) {
    const classes = classesDoConjunto(s.conjunto);
    const capturando = Boolean(s.captura);

    for (const seg of el.segMao) {
      seg.classList.toggle('seg--on', seg.dataset.mao === s.mao);
      seg.disabled = capturando;
    }
    // A inversão é guardada por câmera: sem uma em uso, não há o que marcar.
    for (const seg of el.segImagem) {
      seg.classList.toggle('seg--on', (seg.dataset.espelhada === '1') === s.cameraEspelhada);
      seg.disabled = capturando || !s.temCamera;
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
      const { padrao = 0, pessoal = 0 } = s.origemPorClasse?.[classe] || {};
      const ativa = s.captura?.classe === classe;

      const chaveOrigem = `${padrao}+${pessoal}`;
      if (refs.n !== n || refs.chaveOrigem !== chaveOrigem) {
        refs.n = n;
        refs.chaveOrigem = chaveOrigem;
        if (padrao > 0 && pessoal > 0) {
          const b = document.createElement('b');
          b.textContent = String(pessoal);
          refs.badge.replaceChildren(`${padrao}+`, b);
        } else {
          refs.badge.textContent = n > 0 ? String(n) : '·';
        }
        const cheia = n >= AMOSTRAS_MAXIMAS;
        const uso = porcentagem(n, AMOSTRAS_MAXIMAS);
        refs.pct.textContent = `${uso}%`;
        refs.btn.style.setProperty('--uso', uso);
        const detalhe =
          padrao > 0
            ? `${classe} — ${padrao} do modelo pronto, ${pessoal} sua(s)`
            : `${classe} — ${n} amostra(s)`;
        refs.btn.title = cheia
          ? `${detalhe}. Classe cheia (${AMOSTRAS_MAXIMAS}/${AMOSTRAS_MAXIMAS}, 100%): gravar mais substitui as mais antigas.`
          : `${detalhe} de ${AMOSTRAS_MAXIMAS} (${uso}% do espaço da classe).${padrao > 0 ? ' Clique para reforçar.' : ''}`;
        refs.btn.classList.toggle('classe--treinada', n >= AMOSTRAS_RECOMENDADAS && !cheia);
        refs.btn.classList.toggle('classe--parcial', n > 0 && n < AMOSTRAS_RECOMENDADAS);
        refs.btn.classList.toggle('classe--cheia', cheia);

        const rotuloX =
          padrao > 0 && pessoal > 0
            ? `Descartar seus treinos de ${classe} e voltar ao modelo pronto`
            : `Apagar as amostras de ${classe}`;
        refs.x.title = rotuloX;
        refs.x.setAttribute('aria-label', rotuloX);
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
      // No teto, cada amostra nova empurra uma antiga para fora. Dizer isso
      // durante a gravação explica por que o total da classe parou de subir.
      const total = s.amostrasPorClasse[s.captura.classe] || 0;
      const noTeto = total >= AMOSTRAS_MAXIMAS;
      const texto =
        `Gravando "${s.captura.classe}" — ${s.captura.capturadas}/${s.captura.alvo}` +
        (s.travaMao ? ` · pausado: use a mão ${s.mao}` : '') +
        (noTeto ? ` · limite de ${AMOSTRAS_MAXIMAS}: substituindo as mais antigas` : '');
      if (el.statusTexto.textContent !== texto) el.statusTexto.textContent = texto;
      el.status.classList.toggle('captura--teto', noTeto);
    }

    renderizarUso(s.armazenamento);

    el.btnExportar.disabled = s.modeloVazio || capturando;
    el.btnApagar.disabled = s.modeloVazio || capturando;
    el.btnImportar.disabled = capturando;

    // Quem treinou do zero vê "Adicionar"; quem já usa o padrão vê "Restaurar",
    // que repõe as amostras padrão que cederam lugar aos reforços. Com o modelo
    // vazio — inclusive logo depois de "Apagar tudo" — o botão continua à vista
    // como "Restaurar": é o caminho de volta, sem depender do cartão de
    // boas-vindas, que pode ter sido dispensado.
    const temPadrao =
      s.modeloVazio || Object.values(s.origemPorClasse || {}).some((o) => o.padrao > 0);
    const escondePadrao = !s.padraoDisponivel;
    if (el.btnInstalarPadrao.hidden !== escondePadrao) el.btnInstalarPadrao.hidden = escondePadrao;
    el.btnInstalarPadrao.disabled = capturando;
    const rotuloPadrao = temPadrao ? 'Restaurar modelo pronto' : 'Adicionar modelo pronto';
    if (el.btnInstalarPadrao.textContent !== rotuloPadrao) el.btnInstalarPadrao.textContent = rotuloPadrao;

    const mostrarBoasVindas =
      !boasVindasDispensadas && s.padraoDisponivel && s.modeloVazio && !s.modeloIncompativel && !capturando;
    if (el.boasVindas.hidden === mostrarBoasVindas) el.boasVindas.hidden = !mostrarBoasVindas;
  }

  /**
   * Uso total do chrome.storage.local, que o store já media mas a interface não
   * mostrava. Perto da quota, gravar amostras passaria a falhar; o aviso chega
   * antes disso, com o que fazer.
   */
  let usoDesenhado = '';
  function renderizarUso(uso) {
    const texto = uso
      ? `Armazenamento: ${formatarMB(uso.usados)} de ${formatarMB(uso.quota)} ` +
        `(${porcentagem(uso.usados, uso.quota)}%)` +
        (uso.alerta ? ' — perto do limite. Exporte o modelo e apague classes que não usa.' : '')
      : '';
    if (texto === usoDesenhado) return;
    usoDesenhado = texto;
    el.uso.textContent = texto;
    el.uso.hidden = !texto;
    el.uso.classList.toggle('uso-armazenamento--alerta', Boolean(uso?.alerta));
  }

  return { renderizar, abrir: () => (el.box.open = true) };
}

/** Porcentagem inteira; qualquer uso acima de zero aparece como pelo menos 1%. */
function porcentagem(parte, total) {
  if (!total || parte <= 0) return 0;
  return Math.min(100, Math.max(1, Math.round((parte / total) * 100)));
}

function formatarMB(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: mb < 10 ? 2 : 1 })} MB`;
}
