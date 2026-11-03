/**
 * Regra do modo dev: o núcleo nunca depende de dev/.
 * Uso: node tests/regra-dev.test.mjs
 *
 * dev/ pode importar o núcleo; o contrário, não. Apagar dev/ não pode quebrar
 * a produção. Este teste lê o código do núcleo e falha se algum import, src,
 * href, @import ou string apontar para dentro de dev/. tests/builds.test.mjs
 * confere a mesma regra do lado do bundler.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** O que vai para dist/: as pastas do núcleo e a configuração do build. */
const NUCLEO = ['src', 'sidepanel', 'ui', 'background', 'permission', 'vite.config.js'];
const EXTENSOES = new Set(['.js', '.jsx', '.mjs', '.html', '.css']);

const PADROES = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
  /\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/g,
  /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g
];

/** Qualquer string que comece por dev/ — por exemplo, um chrome.runtime.getURL('dev/…'). */
const STRING_DEV = /['"`](?:\.{0,2}\/)?dev\/[^'"`]*['"`]/g;

function dentroDeDev(caminho) {
  const rel = relative(RAIZ, caminho);
  return rel === 'dev' || rel.startsWith('dev' + sep);
}

/**
 * Referências a dev/ num arquivo do núcleo, como "linha: especificador". Uma
 * por linha: um import para dev/ também casa com a regra das strings.
 */
export function referenciasADev(arquivo, codigo) {
  const achadas = new Map();
  const anotar = (indice, texto) => {
    const linha = codigo.slice(0, indice).split('\n').length;
    if (!achadas.has(linha)) achadas.set(linha, `${linha}: ${texto}`);
  };
  for (const padrao of PADROES) {
    for (const m of codigo.matchAll(padrao)) {
      const spec = m[1];
      let alvo = null;
      if (spec.startsWith('.')) alvo = resolve(dirname(arquivo), spec);
      else if (spec.startsWith('/')) alvo = resolve(RAIZ, '.' + spec);
      if (alvo && dentroDeDev(alvo)) anotar(m.index, spec);
    }
  }
  for (const m of codigo.matchAll(STRING_DEV)) anotar(m.index, m[0]);
  return [...achadas.values()];
}

function listar(caminho) {
  if (statSync(caminho).isFile()) return EXTENSOES.has(extname(caminho)) ? [caminho] : [];
  return readdirSync(caminho).flatMap((nome) => listar(join(caminho, nome)));
}

// --- Cenário 1: o detector enxerga cada forma de referência ----------------
{
  const arquivo = join(RAIZ, 'sidepanel', 'qualquer.js');
  const casos = [
    `import { x } from '../dev/x.js';`,
    `import '../dev/estilo.css';`,
    `const m = await import('../dev/m.js');`,
    `new URL('../dev/a.js', import.meta.url)`,
    `<script type="module" src="../dev/main.js"></script>`,
    `@import url('../dev/a.css');`,
    `import x from '/dev/x.js';`,
    `fetch(chrome.runtime.getURL('dev/recarga.txt'))`
  ];
  for (const caso of casos) {
    assert.equal(referenciasADev(arquivo, caso).length, 1, `deveria acusar: ${caso}`);
  }
  const inocentes = [
    `import { App } from './App.jsx';`,
    `import '../ui/paleta.css';`,
    `import { build } from 'vite';`,
    `const caminho = 'sidepanel/dev/x';`,
    `// referências a desenvolvedor não contam`
  ];
  for (const caso of inocentes) {
    assert.deepEqual(referenciasADev(arquivo, caso), [], `não deveria acusar: ${caso}`);
  }
  console.log('OK  cenário 1 — o detector acusa imports, src, href, @import e strings para dev/');
}

// --- Cenário 2: nenhum arquivo do núcleo aponta para dev/ ------------------
{
  const arquivos = NUCLEO.flatMap((item) => listar(join(RAIZ, item)));
  assert.ok(arquivos.length > 30, `poucos arquivos lidos (${arquivos.length}): o caminho do núcleo mudou?`);
  const violacoes = arquivos.flatMap((arquivo) =>
    referenciasADev(arquivo, readFileSync(arquivo, 'utf8')).map((r) => `${relative(RAIZ, arquivo)}:${r}`)
  );
  assert.deepEqual(violacoes, [], `o núcleo não pode depender de dev/:\n  ${violacoes.join('\n  ')}`);
  console.log(`OK  cenário 2 — ${arquivos.length} arquivos do núcleo, nenhum depende de dev/`);
}
