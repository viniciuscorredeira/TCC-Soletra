/**
 * RVL Libras — view do reconhecimento.
 *
 * Só desenha: recebe a snapshot do SignRecognizer e devolve eventos de usuário.
 * Nenhuma regra de reconhecimento mora aqui, pelo mesmo motivo que render() do
 * painel não sabe nada sobre MediaStream.
 */
import { AVISO_DINAMICAS, classesDoConjunto, CONJUNTOS } from '../src/sign-classes.js';
import { CLASSES_MINIMAS } from '../src/sign-classifier.js';

/** Microcopy por estado — cada um precisa dizer o que fazer, não só o que é. */
const DICAS = {
  'sem-mao': 'Mostre a mão para a câmera.',
  desconhecido: 'Sinal não reconhecido — ajuste a mão ou treine essa letra.',
  formando: 'Segure o sinal…',
  travado: 'Relaxe a mão para repetir a mesma letra.'
};

export function montarRecognitionView(acoes) {
  const el = {
    chk: document.getElementById('chkReco'),
    body: document.getElementById('recoBody'),
    segConjunto: [document.getElementById('btnLetras'), document.getElementById('btnNumeros')],
    ring: document.getElementById('ring'),
    ringChar: document.getElementById('ringChar'),
    ringLock: document.getElementById('ringLock'),
    dica: document.getElementById('recoDica'),
    barra: document.getElementById('barProx'),
    perf: document.getElementById('recoPerf'),
    texto: document.getElementById('txtSaida'),
    btnEspaco: document.getElementById('btnEspaco'),
    btnApagar: document.getElementById('btnApagar'),
    btnRepetir: document.getElementById('btnRepetir'),
    btnLimpar: document.getElementById('btnLimpar'),
    btnPesquisar: document.getElementById('btnPesquisar'),
    avisoDinamicas: document.getElementById('avisoDinamicas'),
    avisoPoucas: document.getElementById('avisoPoucas'),
    avisoMao: document.getElementById('avisoMao'),
    segRigor: [...document.querySelectorAll('[data-rigor]')],
    segPerm: [...document.querySelectorAll('[data-perm]')]
  };

  el.avisoDinamicas.textContent = AVISO_DINAMICAS;

  el.chk.addEventListener('change', () => acoes.alternarReconhecimento(el.chk.checked));
  for (const seg of el.segConjunto) {
    seg.addEventListener('click', () => acoes.definirConjunto(seg.dataset.conjunto));
  }
  el.btnEspaco.addEventListener('click', acoes.espaco);
  el.btnApagar.addEventListener('click', acoes.apagar);
  el.btnRepetir.addEventListener('click', acoes.repetir);
  el.btnLimpar.addEventListener('click', acoes.limpar);
  el.btnPesquisar.addEventListener('click', acoes.pesquisar);

  // Sensibilidade nas mãos do usuário: nenhum padrão serve para toda mão, toda
  // câmera e todo modelo treinado — e quem sente o atrito é quem sinaliza.
  for (const seg of el.segRigor) {
    seg.addEventListener('click', () => acoes.definirRigor(Number(seg.dataset.rigor)));
  }
  for (const seg of el.segPerm) {
    seg.addEventListener('click', () => acoes.definirPermanencia(Number(seg.dataset.perm)));
  }

  // Edição manual continua possível: é a via para as letras dinâmicas e para
  // corrigir um caractere errado sem apagar a palavra inteira.
  el.texto.addEventListener('input', () => acoes.definirTexto(el.texto.value));

  let ultimoFlash = null;

  function renderizar(s) {
    el.chk.checked = s.estado !== 'desligado' && s.estado !== 'erro';
    el.body.hidden = s.estado === 'desligado';

    for (const seg of el.segConjunto) {
      seg.classList.toggle('seg--on', seg.dataset.conjunto === s.conjunto);
    }

    // O texto vem do composer; só escrever quando difere evita mover o cursor
    // do usuário no meio de uma edição manual.
    if (el.texto.value !== s.texto) el.texto.value = s.texto;

    const temTexto = s.texto.trim().length > 0;
    el.btnPesquisar.disabled = !temTexto;
    el.btnApagar.disabled = !temTexto;
    el.btnLimpar.disabled = !temTexto;
    el.btnEspaco.disabled = !temTexto;
    el.btnRepetir.disabled = !s.travadoEm;

    const travado = Boolean(s.travadoEm);
    el.ring.style.setProperty('--p', travado ? 1 : s.progresso);
    el.ring.classList.toggle('ring--travado', travado);
    el.ring.classList.toggle('ring--vazio', !travado && !s.candidato);
    el.ringLock.hidden = !travado;

    if (travado) el.ringChar.textContent = s.travadoEm;
    else if (s.candidato) el.ringChar.textContent = s.candidato;
    else el.ringChar.textContent = s.estadoVisual === 'desconhecido' ? '?' : '–';

    // Flash verde a cada confirmação, reiniciado pela troca de classe de
    // animação — sem isso a segunda confirmação seguida não animaria.
    const marca = s.ultimaConfirmacao?.em ?? null;
    if (marca && marca !== ultimoFlash) {
      ultimoFlash = marca;
      el.ring.classList.remove('ring--confirmado');
      void el.ring.offsetWidth;
      el.ring.classList.add('ring--confirmado');
    }

    el.barra.style.width = `${Math.round((s.proximidade || 0) * 100)}%`;

    for (const seg of el.segRigor) {
      seg.classList.toggle('seg--on', Math.abs(Number(seg.dataset.rigor) - s.rigor) < 1e-6);
    }
    for (const seg of el.segPerm) {
      seg.classList.toggle('seg--on', Number(seg.dataset.perm) === s.permanencia);
    }

    // Um classificador por vizinhança compara o gesto com o que conhece: com
    // uma classe só, não existe "com o que" comparar, e tudo vira essa classe.
    // É limitação do método, não defeito de treino — e precisa ser dita, porque
    // o sintoma (todo sinal virar a mesma letra) parece um bug.
    const doConjunto = classesDoConjunto(s.conjunto);
    const treinadas = doConjunto.filter((c) => (s.amostrasPorClasse[c] || 0) > 0).length;
    const poucasClasses = treinadas > 0 && treinadas < CLASSES_MINIMAS;

    if (s.estado === 'carregando') el.dica.textContent = 'Carregando o reconhecedor…';
    else if (s.estado === 'erro') el.dica.textContent = s.erro?.message || 'Falha no reconhecimento.';
    else if (s.estado === 'pronto') el.dica.textContent = 'Inicie a câmera para reconhecer.';
    else if (s.modeloVazio) el.dica.textContent = 'Nenhum sinal treinado ainda — abra "Treinar sinais".';
    else el.dica.textContent = DICAS[s.estadoVisual] || '';

    el.avisoPoucas.hidden = !poucasClasses;
    if (poucasClasses) {
      const rotulo = (CONJUNTOS[s.conjunto]?.rotulo || '').toLowerCase();
      el.avisoPoucas.textContent =
        `Só um sinal de ${rotulo} está treinado, então qualquer gesto será reconhecido como ele. ` +
        'Treine pelo menos mais um para o reconhecimento conseguir distinguir.';
    }

    const d = s.desempenho;
    el.perf.textContent =
      d?.amostras > 0
        ? `${d.hz} Hz · p50 ${d.p50.toFixed(0)} ms · p95 ${d.p95.toFixed(0)} ms${d.reduzido ? ' · desempenho reduzido' : ''}`
        : '—';

    if (s.avisoMao) {
      el.avisoMao.hidden = false;
      el.avisoMao.textContent =
        `A câmera sugere que você está usando a mão ${s.avisoMao}, mas o modelo está` +
        ` configurado para ${s.mao}. Se os sinais não forem reconhecidos, troque em "Treinar sinais".`;
    } else {
      el.avisoMao.hidden = true;
    }
  }

  return { renderizar };
}
