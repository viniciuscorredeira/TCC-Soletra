/**
 * Os dois builds: produção (dist/) e dev (dist-dev/).
 * Uso: node tests/builds.test.mjs
 *
 * Gera as duas versões numa pasta temporária — o dist/ de quem está
 * desenvolvendo fica intocado — e confere que a produção não leva nada de dev/
 * e que a versão dev difere só no que deve diferir. Leva alguns segundos.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMP = mkdtempSync(join(tmpdir(), 'soletra-builds-'));
const MARCADOR_DEV = 'soletra:modo-dev'; // dev/marcador.js
const TEXTO = new Set(['.js', '.html', '.css', '.json']);
const ICONES = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];

function dentroDeDev(id) {
  const rel = relative(RAIZ, id.split('?')[0]);
  return rel.startsWith('dev' + sep) || rel.startsWith('dev/');
}

/** Anota cada módulo de dev/ que o bundler resolveu. */
function anotarModulosDev(lista) {
  return {
    name: 'teste:modulos-dev',
    buildEnd() {
      for (const id of this.getModuleIds()) if (dentroDeDev(id)) lista.push(id);
    }
  };
}

async function gerar(configFile, outDir) {
  const modulosDev = [];
  await build({
    configFile: resolve(RAIZ, configFile),
    logLevel: 'silent',
    plugins: [anotarModulosDev(modulosDev)],
    build: { outDir, emptyOutDir: true }
  });
  return modulosDev;
}

/** Arquivos de texto gerados pelo bundler (vendor/ e modelos/ são só cópia). */
function textosGerados(pasta) {
  const saida = [];
  (function andar(dir) {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      const rel = relative(pasta, caminho);
      if (rel === 'vendor' || rel === 'modelos') continue;
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (TEXTO.has(extname(nome))) saida.push(caminho);
    }
  })(pasta);
  return saida;
}

/** Caminhos de chave (a.b.c) em que dois objetos JSON diferem. */
function diferencas(a, b, prefixo = '') {
  const chaves = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...chaves].flatMap((k) => {
    const [va, vb] = [a?.[k], b?.[k]];
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    const objetos = [va, vb].every((v) => v && typeof v === 'object' && !Array.isArray(v));
    if (objetos) return diferencas(va, vb, caminho);
    return JSON.stringify(va) === JSON.stringify(vb) ? [] : [caminho];
  });
}

/** Todo src/href local de uma página aponta para um arquivo que existe. */
function conferirReferencias(pasta, pagina) {
  const html = readFileSync(join(pasta, pagina), 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, `${pagina} sem scripts nem estilos`);
  for (const ref of refs) {
    assert.ok(existsSync(join(pasta, dirname(pagina), ref)), `${pagina} aponta para ${ref}, que não existe`);
  }
}

const PROD = join(TEMP, 'dist');
const DEV = join(TEMP, 'dist-dev');

try {
  const devNaProducao = await gerar('vite.config.js', PROD);
  const devNoDev = await gerar('dev/vite.config.js', DEV);

  // --- Cenário 1: a produção não resolve nenhum módulo de dev/ -------------
  {
    assert.deepEqual(devNaProducao, [], 'o build de produção resolveu módulos de dev/');
    assert.ok(devNoDev.length > 0, 'o build dev deveria resolver módulos de dev/ (anotador quebrado?)');
    assert.ok(!existsSync(join(PROD, 'dev')), 'dist/ não pode ter a pasta dev/');
    console.log(`OK  cenário 1 — a produção não resolve módulos de dev/ (o build dev resolve ${devNoDev.length})`);
  }

  // --- Cenário 2: o marcador dev existe só no build dev ---------------------
  {
    const comMarcador = (pasta) =>
      textosGerados(pasta).filter((f) => readFileSync(f, 'utf8').includes(MARCADOR_DEV));
    assert.deepEqual(comMarcador(PROD).map((f) => relative(PROD, f)), [], 'marcador dev encontrado em dist/');
    assert.ok(comMarcador(DEV).length > 0, 'marcador dev ausente de dist-dev/');
    const recarga = textosGerados(PROD).filter((f) => readFileSync(f, 'utf8').includes('recarga.txt'));
    assert.deepEqual(recarga, [], 'a recarga automática vazou para dist/');
    console.log('OK  cenário 2 — o marcador dev aparece em dist-dev/ e nunca em dist/');
  }

  // --- Cenário 3: manifestos ------------------------------------------------
  {
    const original = readFileSync(join(RAIZ, 'manifest.json'));
    assert.ok(readFileSync(join(PROD, 'manifest.json')).equals(original), 'dist/manifest.json difere da raiz');

    const dev = JSON.parse(readFileSync(join(DEV, 'manifest.json'), 'utf8'));
    const extra = JSON.parse(readFileSync(join(RAIZ, 'dev', 'manifest.dev.json'), 'utf8'));
    assert.deepEqual(
      diferencas(JSON.parse(original), dev).sort(),
      ['action.default_title', 'description', 'name'],
      'o manifesto dev só pode trocar nome, descrição e título'
    );
    assert.equal(dev.name, extra.name);
    assert.ok(dev.description.length <= 132, 'a descrição do manifesto passa de 132 caracteres');
    console.log('OK  cenário 3 — dist/ leva o manifesto intacto; o dev troca só nome, descrição e título');
  }

  // --- Cenário 4: ícones ----------------------------------------------------
  {
    for (const icone of ICONES) {
      const producao = readFileSync(join(RAIZ, 'icons', icone));
      const dev = readFileSync(join(RAIZ, 'dev', 'icons', icone));
      assert.ok(readFileSync(join(PROD, 'icons', icone)).equals(producao), `dist/icons/${icone} trocado`);
      assert.ok(readFileSync(join(DEV, 'icons', icone)).equals(dev), `dist-dev/icons/${icone} não é o dev`);
      assert.ok(!dev.equals(producao), `dev/icons/${icone} igual ao de produção`);
    }
    console.log('OK  cenário 4 — cada versão leva os próprios ícones');
  }

  // --- Cenário 5: páginas nos caminhos que o manifesto declara --------------
  {
    for (const pasta of [PROD, DEV]) {
      conferirReferencias(pasta, 'sidepanel/panel.html');
      conferirReferencias(pasta, 'permission/request.html');
      assert.ok(existsSync(join(pasta, 'background', 'service-worker.js')), 'service worker fora do lugar');
    }
    assert.ok(!existsSync(join(DEV, 'dev', 'panel.html')), 'o painel dev ficou no caminho de origem');
    console.log('OK  cenário 5 — painel, permissão e service worker onde o manifesto aponta, nas duas versões');
  }
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
