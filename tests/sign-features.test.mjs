/**
 * Testes da normalização de landmarks. Funções puras, nenhum mock necessário.
 * Uso: node tests/sign-features.test.mjs
 */
import assert from 'node:assert/strict';
import { extrairFeatures, distancia, DIMENSOES } from '../src/sign-features.js';

/**
 * Constrói uma mão plausível em coordenadas de PIXEL e normaliza pela resolução
 * dada — exatamente o que o MediaPipe faz. Trabalhar em pixels é o que permite
 * comparar a mesma geometria física entre resoluções diferentes.
 */
function maoEmPixels(largura, altura, { cx = 320, cy = 240, escala = 1, giro = 0 } = {}) {
  // Punho, 4 MCPs e 16 pontos de dedos — geometria arbitrária mas fixa.
  const base = [
    [0, 60], [-34, 34], [-48, 6], [-52, -18], [-50, -42],
    [-22, 0], [-26, -34], [-28, -56], [-29, -74],
    [0, -6], [0, -42], [0, -66], [0, -86],
    [20, 0], [24, -36], [26, -58], [27, -76],
    [38, 14], [46, -14], [50, -34], [52, -50]
  ];

  const cos = Math.cos(giro);
  const sen = Math.sin(giro);

  return base.map(([bx, by]) => {
    const rx = bx * cos - by * sen;
    const ry = bx * sen + by * cos;
    const px = cx + rx * escala;
    const py = cy + ry * escala;
    // A profundidade acompanha o ponto, não o giro: rotacionar a mão no plano
    // da imagem não aproxima nem afasta dedo nenhum da câmera.
    return { x: px / largura, y: py / altura, z: (bx * 0.1 * escala) / largura };
  });
}

function vetoresIguais(a, b, tolerancia = 1e-5) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.ok(
      Math.abs(a[i] - b[i]) < tolerancia,
      `dimensão ${i}: ${a[i]} ≠ ${b[i]} (Δ ${Math.abs(a[i] - b[i])})`
    );
  }
}

// --- Cenário 1: formato e sanidade do vetor ---------------------------------
{
  const f = extrairFeatures(maoEmPixels(1280, 720), { largura: 1280, altura: 720 });
  assert.ok(f instanceof Float32Array, 'deve devolver Float32Array');
  assert.equal(f.length, DIMENSOES, 'deve ter 63 dimensões');
  assert.ok([...f].every(Number.isFinite), 'nenhuma dimensão pode ser NaN/Infinity');
  console.log('OK  cenário 1 — vetor com 63 dimensões finitas');
}

// --- Cenário 2: invariância a translação ------------------------------------
{
  const opc = { largura: 1280, altura: 720 };
  const a = extrairFeatures(maoEmPixels(1280, 720, { cx: 320, cy: 240 }), opc);
  const b = extrairFeatures(maoEmPixels(1280, 720, { cx: 900, cy: 500 }), opc);
  vetoresIguais(a, b);
  console.log('OK  cenário 2 — mover a mão na tela não muda o vetor');
}

// --- Cenário 3: invariância a escala ----------------------------------------
{
  const opc = { largura: 1280, altura: 720 };
  const perto = extrairFeatures(maoEmPixels(1280, 720, { escala: 1.7 }), opc);
  const longe = extrairFeatures(maoEmPixels(1280, 720, { escala: 0.6 }), opc);
  vetoresIguais(perto, longe);
  console.log('OK  cenário 3 — aproximar/afastar a mão não muda o vetor');
}

// --- Cenário 4: invariância a resolução (a rede de segurança do aspect ratio) -
// A mesma mão, nos mesmos pixels, filmada em 640×480 e em 1280×720. Sem a
// correção de aspect ratio do Passo 1 os vetores divergem e o modelo treinado
// numa webcam deixa de valer em outra — silenciosamente.
{
  const vga = extrairFeatures(maoEmPixels(640, 480), { largura: 640, altura: 480 });
  const hd = extrairFeatures(maoEmPixels(1280, 720), { largura: 1280, altura: 720 });
  vetoresIguais(vga, hd);
  console.log('OK  cenário 4 — vetor idêntico em 640×480 e 1280×720 (aspect ratio corrigido)');
}

// --- Cenário 5: canhoto reproduz o vetor do destro --------------------------
{
  const opc = { largura: 1280, altura: 720 };
  const destra = extrairFeatures(maoEmPixels(1280, 720), { ...opc, mao: 'direita' });

  const espelhada = maoEmPixels(1280, 720).map((p) => ({ x: 1 - p.x, y: p.y, z: -p.z }));
  const canhota = extrairFeatures(espelhada, { ...opc, mao: 'esquerda' });

  vetoresIguais(destra, canhota);
  console.log('OK  cenário 5 — mão esquerda espelhada cai no referencial da direita');
}

// --- Cenário 6: rotação NÃO é normalizada por padrão ------------------------
// A orientação da palma é informação linguística. O padrão preserva; a flag
// 'plano' descarta. O teste documenta a decisão para que ninguém a inverta sem
// perceber.
{
  const opc = { largura: 1280, altura: 720 };
  const reta = maoEmPixels(1280, 720, { giro: 0 });
  const girada = maoEmPixels(1280, 720, { giro: Math.PI / 6 });

  const semNorm = distancia(extrairFeatures(reta, opc), extrairFeatures(girada, opc));
  assert.ok(semNorm > 0.1, `girar deve mudar o vetor no padrão (distância ${semNorm})`);

  const comNorm = distancia(
    extrairFeatures(reta, { ...opc, rotacao: 'plano' }),
    extrairFeatures(girada, { ...opc, rotacao: 'plano' })
  );
  assert.ok(comNorm < 1e-3, `com rotacao:'plano' o giro deve sumir (distância ${comNorm})`);
  console.log('OK  cenário 6 — rotação preservada por padrão, removida sob a flag');
}

// --- Cenário 7: entradas degeneradas devolvem null, nunca NaN ---------------
{
  const opc = { largura: 1280, altura: 720 };
  const colapsada = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  assert.equal(extrairFeatures(colapsada, opc), null, 'mão colapsada deve devolver null');
  assert.equal(extrairFeatures([], opc), null, 'lista vazia deve devolver null');
  assert.equal(extrairFeatures(null, opc), null, 'null deve devolver null');
  assert.equal(
    extrairFeatures(maoEmPixels(1280, 720), { largura: 0, altura: 720 }),
    null,
    'resolução inválida deve devolver null'
  );

  const comNaN = maoEmPixels(1280, 720);
  comNaN[7] = { x: NaN, y: 0.5, z: 0 };
  assert.equal(extrairFeatures(comNaN, opc), null, 'landmark NaN deve devolver null');
  console.log('OK  cenário 7 — entradas degeneradas devolvem null');
}

// --- Cenário 8: mãos diferentes produzem vetores distinguíveis --------------
{
  const opc = { largura: 1280, altura: 720 };
  const a = maoEmPixels(1280, 720);
  const b = maoEmPixels(1280, 720);
  // Fecha o indicador: pontas descem em direção à palma.
  for (const i of [6, 7, 8]) b[i] = { ...b[i], y: b[i].y + 0.06 };

  const d = distancia(extrairFeatures(a, opc), extrairFeatures(b, opc));
  assert.ok(d > 0.05, `configurações diferentes devem separar (distância ${d})`);
  console.log('OK  cenário 8 — configurações diferentes geram vetores separados');
}

console.log('\ntodos os cenários passaram');
