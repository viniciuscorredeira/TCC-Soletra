/**
 * Testes do catálogo de plataformas de busca.
 * Uso: node tests/search-targets.test.mjs
 */
import assert from 'node:assert/strict';
import {
  PLATAFORMAS,
  MARCAS,
  ID_BUSCADOR_PADRAO,
  ehPlataformaValida,
  urlDaBusca
} from '../src/search-targets.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// --- Cenário 1: cada plataforma produz a URL esperada, literal --------------
// Fixar a URL inteira, e não só o domínio, é o que faz este teste servir de
// alarme quando alguém mexer num parâmetro. O do Maps é o mais fácil de errar:
// `api=1` é obrigatório e o parâmetro é `query`, não `q`.
{
  const esperado = {
    google: 'https://www.google.com/search?q=YOUTUBE',
    youtube: 'https://www.youtube.com/results?search_query=YOUTUBE',
    maps: 'https://www.google.com/maps/search/?api=1&query=YOUTUBE',
    amazon: 'https://www.amazon.com.br/s?k=YOUTUBE',
    wikipedia: 'https://pt.wikipedia.org/w/index.php?search=YOUTUBE'
  };

  for (const [id, url] of Object.entries(esperado)) {
    assert.equal(urlDaBusca(id, 'YOUTUBE'), url, `URL de ${id}`);
  }
  console.log(`OK  cenário 1 — ${Object.keys(esperado).length} plataformas geram a URL esperada`);
}

// --- Cenário 2: o buscador padrão não tem URL fixa -------------------------
{
  assert.equal(ehPlataformaValida(ID_BUSCADOR_PADRAO), true, 'está no catálogo');
  assert.equal(
    urlDaBusca(ID_BUSCADOR_PADRAO, 'YOUTUBE'),
    null,
    'só o navegador sabe qual é o mecanismo padrão — quem resolve é o service worker'
  );
  console.log('OK  cenário 2 — buscador padrão fica sem URL, para o navegador resolver');
}

// --- Cenário 3: caractere reservado não escapa do parâmetro ----------------
// A text-box aceita digitação manual, então isto é entrada de usuário: sem
// codificar, um `&` cria um parâmetro novo e um `#` trunca a consulta.
{
  const url = urlDaBusca('google', 'a&b#c=d');
  assert.equal(url, 'https://www.google.com/search?q=a%26b%23c%3Dd');

  const params = new URL(url).searchParams;
  assert.equal(params.get('q'), 'a&b#c=d', 'o termo precisa chegar inteiro do outro lado');
  assert.equal([...params.keys()].length, 1, 'nenhum parâmetro extra pode ter sido injetado');

  const comEspaco = urlDaBusca('youtube', 'ola mundo');
  assert.equal(new URL(comEspaco).searchParams.get('search_query'), 'ola mundo');
  console.log('OK  cenário 3 — & # = e espaço ficam contidos no parâmetro');
}

// --- Cenário 4: entradas inválidas devolvem null --------------------------
{
  assert.equal(urlDaBusca('google', ''), null, 'termo vazio');
  assert.equal(urlDaBusca('google', '   '), null, 'só espaços');
  assert.equal(urlDaBusca('google', null), null, 'termo nulo');
  assert.equal(urlDaBusca('orkut', 'YOUTUBE'), null, 'plataforma inexistente');
  assert.equal(ehPlataformaValida('orkut'), false);
  console.log('OK  cenário 4 — termo vazio e plataforma desconhecida devolvem null');
}

// --- Cenário 5: espaços das pontas não viajam na URL ----------------------
{
  assert.equal(urlDaBusca('google', '  YOUTUBE  '), 'https://www.google.com/search?q=YOUTUBE');
  console.log('OK  cenário 5 — espaços das pontas são removidos antes de codificar');
}

// --- Cenário 6: integridade do catálogo ----------------------------------
{
  const ids = PLATAFORMAS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'não pode haver id duplicado');
  assert.ok(ids.includes(ID_BUSCADOR_PADRAO), 'o buscador padrão precisa estar no catálogo');

  for (const p of PLATAFORMAS) {
    assert.ok(p.nome?.length > 0, `${p.id} precisa de nome`);

    // Cada plataforma se desenha por um PNG empacotado OU por um SVG inline.
    // Nunca por rede: a CSP do MV3 bloquearia, e a interface não pode depender
    // de conexão para se desenhar.
    const temIcone = typeof p.icone === 'string' && p.icone.length > 0;
    const temGlifo = typeof p.glifo === 'string' && p.glifo.includes('<');
    assert.ok(temIcone !== temGlifo, `${p.id} precisa de exatamente um entre icone e glifo`);

    if (temIcone) {
      assert.ok(
        p.icone.startsWith('icons/') && p.icone.endsWith('.png'),
        `${p.id}: ícone deve ser um PNG empacotado, obtido "${p.icone}"`
      );
      assert.ok(!/^https?:|^\/\//i.test(p.icone), `${p.id} não pode apontar para imagem remota`);
    } else {
      assert.ok(!/https?:|url\(/i.test(p.glifo), `${p.id} não pode buscar imagem remota`);
    }

    if (p.url) {
      assert.ok(p.url('x').startsWith('https://'), `${p.id} precisa usar https`);
    }
  }

  // Exatamente um destino genérico, e ele é o buscador padrão.
  const genericos = PLATAFORMAS.filter((p) => p.generico);
  assert.equal(genericos.length, 1, 'só pode haver um destino genérico');
  assert.equal(genericos[0].id, ID_BUSCADOR_PADRAO);
  assert.equal(MARCAS.length, PLATAFORMAS.length - 1, 'MARCAS exclui o destino genérico');

  // A grade mostra as marcas em ordem alfabética.
  const nomes = MARCAS.map((p) => p.nome);
  assert.deepEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')), 'marcas em ordem alfabética');

  console.log(`OK  cenário 6 — catálogo íntegro: ${MARCAS.length} marcas + 1 destino genérico`);
}

// --- Cenário 7: todo ícone referenciado existe no pacote ------------------
// Um caminho errado não quebra nada em tempo de execução: o card aparece com o
// ladrilho vazio e ninguém percebe até alguém abrir o modal.
{
  const raiz = fileURLToPath(new URL('../', import.meta.url));
  let verificados = 0;

  for (const p of PLATAFORMAS) {
    if (!p.icone) continue;
    assert.ok(
      existsSync(raiz + p.icone),
      `${p.id}: falta ${p.icone} — rode "node tools/preparar-logos.mjs"`
    );
    verificados++;
  }
  console.log(`OK  cenário 7 — ${verificados} PNGs de logo presentes no pacote`);
}

console.log('\ntodos os cenários passaram');
