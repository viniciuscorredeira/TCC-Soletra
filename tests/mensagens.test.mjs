/**
 * Testes das mensagens do painel ao ligar o Reconhecimento e ao usar o modelo
 * pronto (sidepanel/mensagens.js).
 * Uso: node tests/mensagens.test.mjs
 */
import assert from 'node:assert/strict';
import {
  avisoTaxaBaixa,
  mensagemAoLigar,
  mensagemDaCameraAtiva,
  reconhecimentoLigado,
  textoModeloPronto
} from '../sidepanel/mensagens.js';

const MODELO_EM_USO = { texto: 'Modelo pronto em uso. Ligue o Reconhecimento para começar.', tipo: 'info' };

// --- Cenário 1: o bug das Figuras 15 e 16 -----------------------------------
{
  // Câmera ativa a 60 fps, "Usar modelo pronto", depois ligar o Reconhecimento.
  const r = mensagemAoLigar({ atual: MODELO_EM_USO, cameraAtiva: true, settings: { frameRate: 60 } });
  assert.equal(r, null, 'o pedido para ligar o Reconhecimento foi atendido e sai da tela');

  const carregado = { texto: 'Modelo pronto carregado: 1550 amostras em 31 classes. Ligue o Reconhecimento para começar.' };
  assert.equal(mensagemAoLigar({ atual: carregado, cameraAtiva: true, settings: { frameRate: 60 } }), null);

  const treino = { texto: 'Ligue o Reconhecimento antes de treinar.', tipo: 'warn' };
  assert.equal(mensagemAoLigar({ atual: treino, cameraAtiva: true, settings: { frameRate: 60 } }), null);
  console.log('OK  cenário 1 — ligar o Reconhecimento apaga "Ligue o Reconhecimento"');
}

// --- Cenário 2: o aviso de taxa baixa não se perde --------------------------
{
  const r = mensagemAoLigar({ atual: MODELO_EM_USO, cameraAtiva: true, settings: { frameRate: 30 } });
  assert.deepEqual(r, { texto: avisoTaxaBaixa(30), tipo: 'warn' }, 'o aviso que a mensagem tinha substituído volta');
  assert.match(r.texto, /30 fps, abaixo dos 60 fps/);

  const aviso = { texto: avisoTaxaBaixa(30), tipo: 'warn' };
  assert.equal(mensagemAoLigar({ atual: aviso, cameraAtiva: true, settings: { frameRate: 30 } }), undefined, 'o aviso na tela fica');
  console.log('OK  cenário 2 — o aviso de câmera abaixo de 60 fps continua');
}

// --- Cenário 3: outras mensagens e câmera parada ----------------------------
{
  const outra = { texto: 'Modelo exportado.', tipo: 'info' };
  assert.equal(mensagemAoLigar({ atual: outra, cameraAtiva: true, settings: { frameRate: 60 } }), undefined, 'não mexe no resto');
  assert.equal(mensagemAoLigar({ atual: null, cameraAtiva: true, settings: { frameRate: 60 } }), undefined);
  assert.deepEqual(
    mensagemAoLigar({ atual: MODELO_EM_USO, cameraAtiva: false }),
    { texto: 'Reconhecimento pronto. Inicie a câmera para começar.', tipo: 'info' },
    'com a câmera parada, o aviso de sempre'
  );
  console.log('OK  cenário 3 — outras mensagens ficam; câmera parada pede para iniciá-la');
}

// --- Cenário 4: modelo pronto com o Reconhecimento já ligado ----------------
{
  assert.equal(textoModeloPronto('Modelo pronto em uso.', 'desligado'), MODELO_EM_USO.texto, 'texto de sempre quando desligado');
  assert.equal(textoModeloPronto('Modelo pronto em uso.', 'erro'), MODELO_EM_USO.texto);
  for (const estado of ['carregando', 'pronto', 'reconhecendo', 'treinando']) {
    assert.equal(textoModeloPronto('Modelo pronto em uso.', estado), 'Modelo pronto em uso.', `ligado (${estado}): sem pedir para ligar`);
  }
  assert.equal(reconhecimentoLigado('desligado'), false);
  assert.equal(reconhecimentoLigado('reconhecendo'), true);
  console.log('OK  cenário 4 — com o Reconhecimento ligado, o modelo pronto não pede para ligá-lo');
}

// --- Cenário 5: a mensagem da câmera ativa é a mesma de antes ---------------
{
  assert.equal(mensagemDaCameraAtiva({ frameRate: 60 }), null);
  assert.equal(mensagemDaCameraAtiva({ frameRate: 59.94 }), null, '59,94 não é queda');
  assert.equal(mensagemDaCameraAtiva(undefined), null);
  assert.deepEqual(mensagemDaCameraAtiva({ frameRate: 12 }), {
    texto: 'Sua câmera está entregando 12 fps, abaixo dos 60 fps suportados. O reconhecimento vai responder mais devagar.',
    tipo: 'warn'
  });
  assert.equal(
    mensagemDaCameraAtiva({ frameRate: 30 }).texto,
    'Sua câmera está entregando 30 fps, abaixo dos 60 fps suportados. O reconhecimento continua funcionando, mas o vídeo pode ficar menos fluido.'
  );
  console.log('OK  cenário 5 — aviso de taxa com o mesmo texto de antes');
}
