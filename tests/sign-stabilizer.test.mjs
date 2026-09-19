/**
 * Testes da máquina de confirmação de sinal. Relógio injetado, nenhum timer real.
 * Uso: node tests/sign-stabilizer.test.mjs
 */
import assert from 'node:assert/strict';
import { SignStabilizer, PADROES_ESTABILIZADOR } from '../src/sign-stabilizer.js';

const HZ = 15;
const PASSO = 1000 / HZ;

/** Driver que alimenta o estabilizador em cadência fixa, como o loop real faria. */
function criar(opcoes = {}) {
  const emissoes = [];
  const est = new SignStabilizer(opcoes, (e) => emissoes.push(e));
  let t = 0;
  let ultimo = null;

  /**
   * @param {string|null|'sem-mao'} classe  null = mão presente mas não reconhecida
   * @param {number} duracao em ms
   */
  function alimentar(classe, duracao, { confianca = 1 } = {}) {
    const fim = t + duracao;
    while (t < fim) {
      t += PASSO;
      const temMao = classe !== 'sem-mao';
      ultimo = est.processar({
        t,
        classe: temMao ? classe : null,
        confianca,
        temMao
      });
    }
  }

  function pular(ms) {
    t += ms;
  }

  return { est, emissoes, alimentar, pular, agora: () => t, ultimo: () => ultimo };
}

const letras = (emissoes) => emissoes.map((e) => e.classe);

// --- Cenário 1: confirma uma única vez após a permanência -------------------
{
  const d = criar();
  d.alimentar('A', 400);
  assert.equal(d.emissoes.length, 0, 'não pode confirmar antes da permanência');

  d.alimentar('A', 600);
  assert.equal(d.emissoes.length, 1, 'deve confirmar após T_PERMANENCIA');
  assert.equal(d.emissoes[0].classe, 'A');
  console.log('OK  cenário 1 — confirma uma vez após a permanência');
}

// --- Cenário 2: o tempo até confirmar fica próximo de T_PERMANENCIA --------
// Ancorar a permanência no quadro mais antigo da janela, e não no instante em
// que a votação declarou o vencedor, é o que impede o aquecimento da janela de
// virar atraso invisível para o usuário.
{
  const d = criar();
  d.alimentar('B', 2000);
  const tConfirmacao = d.emissoes[0].t;
  const folga = tConfirmacao - PADROES_ESTABILIZADOR.T_PERMANENCIA;
  assert.ok(
    folga >= 0 && folga < 150,
    `confirmação em ${tConfirmacao.toFixed(0)} ms — esperado ~${PADROES_ESTABILIZADOR.T_PERMANENCIA} ms`
  );
  console.log(`OK  cenário 2 — confirma em ${tConfirmacao.toFixed(0)} ms (alvo 700 ms)`);
}

// --- Cenário 3: segurar a mesma classe emite exatamente uma vez -------------
// Um timeout de auto-repetição transformaria isto em "MMMMMMM".
{
  const d = criar();
  d.alimentar('M', 5000);
  assert.equal(d.emissoes.length, 1, `5 s de M devem emitir 1 caractere, não ${d.emissoes.length}`);
  console.log('OK  cenário 3 — 5 s com a mão parada emitem um único caractere');
}

// --- Cenário 4: oscilação entre duas classes nunca confirma ----------------
{
  const d = criar();
  for (let i = 0; i < 60; i++) d.alimentar(i % 2 === 0 ? 'A' : 'B', PASSO);
  assert.equal(d.emissoes.length, 0, 'oscilação não pode produzir caractere');
  console.log('OK  cenário 4 — sinal oscilante não confirma nada');
}

// --- Cenário 5: LETRA DUPLA — o "SS" de PASSO ------------------------------
// O caso que justifica tratar "desconhecido" como estado de primeira classe:
// relaxar a mão sai da vizinhança de toda classe, e é isso que destrava.
{
  const d = criar();
  d.alimentar('S', 800);
  d.alimentar(null, 250); // usuário relaxa a mão
  d.alimentar('S', 800);

  assert.deepEqual(letras(d.emissoes), ['S', 'S'], 'relaxar entre os dois S deve produzir SS');
  console.log('OK  cenário 5 — relaxar a mão entre dois S produz "SS"');
}

// --- Cenário 6: relaxar de menos NÃO destrava ------------------------------
{
  const d = criar();
  d.alimentar('S', 800);
  d.alimentar(null, 100); // abaixo de T_LIBERA
  d.alimentar('S', 800);

  assert.deepEqual(letras(d.emissoes), ['S'], 'pausa curta não pode duplicar a letra');
  console.log('OK  cenário 6 — pausa curta demais mantém a trava');
}

// --- Cenário 7: trocar de letra confirma sem precisar relaxar --------------
{
  const d = criar();
  d.alimentar('Y', 900);
  d.alimentar('O', 900);
  d.alimentar('U', 900);
  assert.deepEqual(letras(d.emissoes), ['Y', 'O', 'U'], 'letras distintas fluem direto');
  console.log('OK  cenário 7 — letras diferentes em sequência não exigem pausa');
}

// --- Cenário 8: tirar a mão do quadro também destrava ----------------------
{
  const d = criar();
  d.alimentar('E', 900);
  d.alimentar('sem-mao', 400);
  d.alimentar('E', 900);
  assert.deepEqual(letras(d.emissoes), ['E', 'E']);
  console.log('OK  cenário 8 — tirar a mão do quadro destrava a repetição');
}

// --- Cenário 9: confiança baixa nunca confirma ----------------------------
{
  const d = criar();
  d.alimentar('T', 3000, { confianca: 0.3 });
  assert.equal(d.emissoes.length, 0, 'abaixo de T_CONF o quadro não é válido');
  assert.equal(d.ultimo().estadoVisual, 'desconhecido');
  console.log('OK  cenário 9 — confiança abaixo do limiar não confirma');
}

// --- Cenário 10: lacuna longa invalida a janela ---------------------------
// O painel lateral pode ser ocultado no meio de um sinal. Votar com o que
// sobrou confirmaria uma letra que o usuário fez há muito tempo.
{
  const d = criar();
  d.alimentar('R', 600); // quase confirmando
  assert.equal(d.emissoes.length, 0);

  d.pular(3000); // painel oculto
  d.alimentar('R', 250); // pouco tempo depois de voltar

  assert.equal(d.emissoes.length, 0, 'a janela anterior à lacuna não pode dar crédito');
  console.log('OK  cenário 10 — lacuna de 3 s limpa a janela de votação');
}

// --- Cenário 11: progresso cresce de 0 a 1 e zera na troca ----------------
{
  const d = criar();
  d.alimentar('L', 200);
  const inicial = d.ultimo().progresso;
  d.alimentar('L', 300);
  const meio = d.ultimo().progresso;

  assert.ok(inicial >= 0 && inicial <= 1, 'progresso deve estar em [0,1]');
  assert.ok(meio > inicial, `progresso deve crescer (${inicial} → ${meio})`);

  // Precisa de quadros suficientes para o novo sinal vencer a votação: dois
  // quadros isolados são ruído, e absorver ruído é justamente o papel da janela.
  d.alimentar('C', 400);
  assert.ok(
    d.ultimo().progresso < meio,
    `trocar de sinal deve reiniciar o progresso (${d.ultimo().progresso} vs ${meio})`
  );
  assert.equal(d.ultimo().candidato, 'C', 'e o candidato deve passar a ser o novo sinal');
  console.log('OK  cenário 11 — progresso cresce e reinicia na troca de sinal');
}

// --- Cenário 12: estados visuais cobrem os cinco casos da UI --------------
{
  const d = criar();
  d.alimentar('sem-mao', 500);
  assert.equal(d.ultimo().estadoVisual, 'sem-mao');

  d.alimentar(null, 500);
  assert.equal(d.ultimo().estadoVisual, 'desconhecido');

  d.alimentar('F', 300);
  assert.equal(d.ultimo().estadoVisual, 'formando');
  assert.equal(d.ultimo().candidato, 'F');

  d.alimentar('F', 600);
  assert.equal(d.ultimo().estadoVisual, 'travado');
  assert.equal(d.ultimo().travadoEm, 'F');
  assert.equal(d.ultimo().progresso, 0, 'travado não mostra progresso');
  console.log('OK  cenário 12 — estados visuais: sem-mao, desconhecido, formando, travado');
}

// --- Cenário 13: liberarTrava() permite repetir sem relaxar ---------------
{
  const d = criar();
  d.alimentar('P', 900);
  assert.equal(d.emissoes.length, 1);

  d.est.liberarTrava(d.agora());
  d.alimentar('P', 900);
  assert.deepEqual(letras(d.emissoes), ['P', 'P'], 'o botão "Repetir letra" deve funcionar');
  console.log('OK  cenário 13 — liberação manual permite repetir a letra');
}

// --- Cenário 14: destravar não confirma de imediato com quadros velhos ----
// Sem o piso, os quadros anteriores à pausa ainda vivos na janela dariam
// crédito de permanência e a letra sairia dobrada no instante do destrave.
{
  const d = criar();
  d.alimentar('S', 900);
  const apos = d.emissoes.length;
  d.alimentar(null, 220); // destrava
  d.alimentar('S', 200); // pouco tempo de volta no sinal

  assert.equal(d.emissoes.length, apos, 'não pode confirmar logo após destravar');
  console.log('OK  cenário 14 — destravar não dá crédito a quadros anteriores à pausa');
}

// --- Cenário 15: reiniciar() zera tudo -----------------------------------
{
  const d = criar();
  d.alimentar('A', 900);
  d.est.reiniciar();
  const s = d.est.processar({ t: d.agora() + PASSO, classe: 'A', confianca: 1, temMao: true });
  assert.equal(s.travadoEm, null, 'reiniciar deve soltar a trava');
  assert.equal(s.vencedor, 'indefinido', 'reiniciar deve esvaziar a janela');
  console.log('OK  cenário 15 — reiniciar zera janela e trava');
}

console.log('\ntodos os cenários passaram');
