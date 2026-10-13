# Resumo do Projeto — Soletra

**Documento atualizado em:** 13/10/2026
**Versão do projeto:** 0.2.0 (`manifest.json`). As funcionalidades da seção 5 ainda não
mudaram o número de versão.
**Repositório:** `C:\Github\TCC-Soletra` — Git, remoto `github.com/viniciuscorredeira/TCC-Soletra`

---

## 1. Objetivo

Extensão de navegador (Chrome/Edge, Manifest V3) que acessa a câmera do usuário, exibe o vídeo
em um **painel lateral** e reconhece sinais **estáticos** do alfabeto manual de Libras,
compondo um texto que pode ser pesquisado na plataforma que o usuário escolher — buscador
padrão do navegador, Google, YouTube, Google Maps, Amazon ou Wikipédia.

A premissa central do projeto é **processamento 100% local**: os pontos da mão são extraídos
por WebAssembly empacotado dentro da extensão. Nenhum quadro de vídeo é gravado ou transmitido.
O único dado que sai do dispositivo é o texto que o usuário escolhe pesquisar, e apenas para a
plataforma selecionada.

**Diferencial técnico:** classificação sobre **landmarks** (geometria da mão) em vez de
**pixels**. Resultado: modelo de centenas de KB em vez de dezenas de MB, robustez a fundo,
iluminação e tom de pele, e treino feito pelo próprio usuário no navegador — sem dataset externo,
sem etapa em Python, sem TensorFlow.js.

**Desde a 0.2.0, o usuário não precisa mais treinar para começar.** A extensão traz um
**modelo pronto** empacotado. Na primeira abertura o usuário escolhe entre usá-lo, treinar o
próprio modelo do zero, ou partir do pronto e reforçar as letras que falharem com a sua mão
(seção 5.1).

---

## 2. Stack e tecnologias

### 2.1 Runtime e plataforma

| Camada | Tecnologia | Versão / detalhe |
|---|---|---|
| Plataforma | Extensão Chrome/Edge **Manifest V3** | `minimum_chrome_version: 114` |
| Linguagem | **JavaScript ES Modules** puro | sem TypeScript, sem bundler, sem build step |
| UI | **HTML + CSS** nativos | sem React/Vue; render por snapshot de estado |
| Painel | `chrome.sidePanel` API | fallback para aba dedicada no service worker; também abre como aba ocupando o navegador (seção 5.4) |
| Persistência | `chrome.storage.local` / `.session` | quota de 10 MB |
| Visão computacional | **MediaPipe `@mediapipe/tasks-vision`** | **1.0.1**, vendorizado, delegate **CPU** |
| Modelo de detecção | `hand_landmarker.task` | 21 pontos (x, y, z) por mão |
| Classificação | **KNN k=5** ponderado por 1/d | implementação própria, 273 linhas |
| Modelo pronto | `modelos/padrao.json` | 31 classes × 50 amostras, ~725 KB, empacotado |
| Testes | **Node puro** | v24.20.0, sem framework e sem dependências |

### 2.2 Dependências

**Zero dependências de runtime e zero de desenvolvimento.** Não existe `package.json` no
projeto. Todo o código de terceiros está vendorizado em `vendor/mediapipe/` (~20 MB,
commitado propositalmente).

| Arquivo vendorizado | Tamanho |
|---|---|
| `vendor/mediapipe/vision_bundle.mjs` | 155 KB |
| `vendor/mediapipe/wasm/vision_wasm_internal.js` | 323 KB |
| `vendor/mediapipe/wasm/vision_wasm_internal.wasm` | 11,8 MB |
| `vendor/mediapipe/hand_landmarker.task` | 7,8 MB |

**Integridade verificada:** `node tools/verificar-vendor.mjs` → *4 arquivos íntegros —
tasks-vision 1.0.1* (SHA-256 conferidos contra `INTEGRIDADE.json`).

### 2.3 Decisões técnicas que valem registro

| Decisão | Justificativa |
|---|---|
| **CDN proibida, binários commitados** | A CSP do MV3 bloqueia origem externa, e as lojas tratam CDN como "código remoto" na revisão |
| **Versão fixada em `@1.0.1`** | `@latest` publica builds `rc.<data>` diários — irreprodutível |
| **Delegate CPU, não GPU** | Medido no spike (Edge 153): CPU p50 **22,9 ms** contra **58,4 ms** no GPU. O readback de textura domina o custo de um modelo pequeno, e o GPU exigiria manter contexto WebGL vivo num painel recolhível |
| **`FilesetResolver` não utilizado** | O `WasmFileset` é montado à mão, evitando a sonda SIMD em runtime (que apontaria para um par `_nosimd_` não vendorizado) |
| **KNN em vez de rede neural** | Poucas amostras por classe, treinadas pelo usuário: não há dados nem tempo para otimizar pesos. O custo é inferência O(amostras) — frações de ms a 15 Hz sobre ~1.550 vetores (31 classes × 50 do modelo pronto) |
| **`requestVideoFrameCallback`, não `setInterval`** | Um timer dispara mesmo sem quadro novo e o MediaPipe reprocessaria a mesma imagem. O rVFC dispara uma vez por quadro e pausa junto com o vídeo |
| **Painel lateral, não popup** | O popup fecha ao perder foco, destrói o documento e encerra o `MediaStream` |
| **Limiar de rejeição constante (1,3)** | A normalização dá escala física fixa ao espaço de 63 dimensões. Duas calibrações anteriores (dispersão interna × 2; separação entre classes × 1,2) rejeitavam sinais legítimos — a segunda encolhia justamente quando o alfabeto ficava completo |
| **Pesquisa executada pelo service worker** | `chrome.search.query` com `disposition` precisa inferir a aba a partir de quem chamou, e o painel lateral não é aba. O worker cria a aba antes e passa `tabId` |
| **Logos empacotadas, não remotas** | A CSP do MV3 bloqueia imagem remota, e a interface não pode depender de rede para se desenhar |
| **Migração de storage do nome antigo** | O produto se chamava RVL Libras (`rvl.*`). Renomear as chaves sem migrar faria o usuário "perder" o modelo sem erro nenhum |
| **Modelo pronto em chaves separadas das pessoais** | Permite "voltar ao padrão" numa letra apagando só o treino do usuário, e garante que no teto quem sai primeiro é a amostra genérica, não a da mão do usuário (seção 5.1.3) |
| **Modelo pronto empacotado, não baixado** | Mesmo motivo da CDN proibida: nada de código ou dado remoto. Escolher o modelo pronto não envia nem recebe nada |
| **Teto de 100 por classe, padrão com até 50** | Metade do teto fica livre para o reforço pessoal antes que qualquer amostra precise ceder (seção 5.2) |
| **Tela cheia como aba, não janela nova** | O Chrome não deixa uma extensão alargar o painel lateral. Uma aba da própria janela é o mais perto de "o painel ocupando o navegador" (seção 5.4) |

### 2.4 CSP do Manifest V3 e o mito do MediaPipe

É comum ler que o MV3 impede usar MediaPipe. A limitação vale para o pacote **legado**
(`@mediapipe/hands`, `holistic`), cujo glue Emscripten usava `new Function()`. O pacote atual
`tasks-vision` não tem ocorrência de `new Function` nem `eval(` — o `createNamedFunction` foi
reescrito com `Object.defineProperty`. Basta declarar `script-src 'self' 'wasm-unsafe-eval';
object-src 'self';` em `content_security_policy.extension_pages`.

Sem declarar, o WebAssembly é bloqueado; declarando qualquer coisa além disso, o Chrome recusa
a instalação.

---

## 3. Arquitetura

### 3.1 Pipeline de reconhecimento

```
Câmera → MediaPipe HandLandmarker → 21 pontos (x,y,z)
       → normalização → vetor de 63 números
       → KNN sobre as amostras (modelo pronto + treino do usuário)
       → estabilização temporal → caractere confirmado
       → text-box → Pesquisar → escolha da plataforma
```

O classificador não distingue a origem das amostras: o store entrega as do modelo pronto e as
pessoais concatenadas por classe, e o limiar τ_abs é recalibrado sobre o conjunto final.

Nada é enviado antes da escolha: fechar o seletor (×, Cancelar, Esc ou clique fora) não dispara
pesquisa nenhuma. O catálogo de destinos fica em `src/search-targets.js`, com as URLs fixadas por
teste e o termo sempre passado por `encodeURIComponent`.

### 3.2 Camadas

O projeto é organizado para isolar o que é testável do que não é: **um único módulo depende de
WASM** (`src/hand-landmarker.js`, 101 linhas, fino de propósito), e **um único módulo de `src/`
acessa o ambiente sem permitir substituição** (`src/sign-recognizer.js`, onde moram o relógio
real, o storage, a leitura do modelo pronto e a inicialização do WASM). `sign-model-store` e
`inference-loop` usam `chrome.storage.local` e `performance.now()` como padrão, mas os recebem por
injeção nos testes; `migracao-storage` recebe a área de storage como argumento. O resto é função
pura ou classe com relógio injetado.

| Módulo | Linhas | Responsabilidade |
|---|---:|---|
| `src/camera-controller.js` | 279 | Ciclo de vida do `MediaStream` — inalterado desde a v0.1.0 |
| `src/sign-recognizer.js` | 469 | Orquestrador; expõe um `onStateChange`, como o CameraController. Lê e instala o modelo pronto, restaura classes |
| `src/hand-landmarker.js` | 101 | Adaptador do MediaPipe (único módulo dependente de WASM) |
| `src/inference-loop.js` | 138 | Agendador rVFC, throttle adaptativo, timestamp monotônico |
| `src/sign-features.js` | 134 | Landmarks → 63 números; carrega `VERSAO_FEATURES` |
| `src/sign-classifier.js` | 273 | KNN ponderado, rejeição, teste de razão, calibração de limiar (τ_abs) |
| `src/sign-stabilizer.js` | 234 | Máquina de confirmação e trava anti-repetição |
| `src/sign-classes.js` | 51 | Catálogo de classes estáticas, dinâmicas e números |
| `src/sign-model-store.js` | 411 | Persistência com origem (padrão × pessoal), teto por classe, quota, export/import com validação de esquema |
| `src/text-composer.js` | 75 | Composição do texto e normalização para a busca |
| `src/search-targets.js` | 102 | Catálogo de plataformas de busca e montagem das URLs |
| `src/migracao-storage.js` | 64 | Migra as chaves `rvl.*` (RVL Libras) para `soletra.*` |

| Interface | Linhas | Responsabilidade |
|---|---:|---|
| `sidepanel/panel.html` / `.css` / `.js` | 261 / 835 / 562 | Interface principal; boas-vindas, aviso de teto, troca painel ↔ tela cheia |
| `sidepanel/recognition-view.js` | 164 | Anel de progresso, text-box, busca |
| `sidepanel/training-view.js` | 206 | Grade de classes (atualizada no lugar) com selo `padrão+suas`, estado "cheia", apagar ou voltar ao padrão por classe, exportar/importar/apagar tudo, restaurar o modelo pronto |
| `sidepanel/dialogo.js` | 104 | Modal de confirmação (`window.confirm` não é confiável no painel) |
| `sidepanel/janela.js` | 169 | Botões de janela no estilo do macOS: fechar, minimizar para o painel lateral, tela cheia |
| `sidepanel/seletor-plataforma.js` | 169 | Modal de escolha do destino da pesquisa |
| `background/service-worker.js` | 97 | Abre o painel no clique do ícone (fallback: aba) e executa a pesquisa |
| `permission/request.html` / `.js` / `.css` | 34 / 56 / 85 | Aba de topo para o prompt nativo de câmera |

| Apoio | Linhas | Responsabilidade |
|---|---:|---|
| `tools/verificar-vendor.mjs` | 89 | Confere os SHA-256 dos binários vendorizados |
| `tools/montar-modelo-padrao.mjs` | 148 | Junta exports de várias pessoas no `modelos/padrao.json`, com amostragem balanceada |
| `tools/png.mjs` | 217 | Ler, escrever e redimensionar PNG, sem dependências |
| `tools/make-icons.mjs` | 66 | Gera `icons/icon*.png` a partir de `icons/soletra-logo.png` |
| `tools/preparar-logos.mjs` | 302 | Limpa, apara e reduz as logos das plataformas (origem fora do repositório) |
| `spike/spike.html` / `.js` | 69 / 274 | Diagnóstico de CSP e latência (fora do fluxo de produção) |

| Dados | Tamanho | Conteúdo |
|---|---:|---|
| `modelos/padrao.json` | ~725 KB | Modelo pronto: 31 classes (21 letras + 10 números) × 50 amostras de 63 números |

**Total de código-fonte próprio: ~8.190 linhas** (incluindo testes e ferramentas; sem contar o
`padrao.json`).

### 3.3 Parâmetros do pipeline

| Módulo | Parâmetro | Valor |
|---|---|---|
| `inference-loop` | Taxa alvo / recuo | 15 Hz / 8 Hz |
| `inference-loop` | p95 de latência que dispara recuo | 50 ms |
| `sign-features` | Dimensões do vetor | 63 (21 pontos × 3) |
| `sign-classifier` | k / rigor | 5 / 1.0 (multiplicador de τ_abs exposto na UI) |
| `sign-classifier` | Limiar de distância padrão | 1,3 raio de palma (piso: p90 da dispersão interna × 5) |
| `sign-classifier` | Teste de razão (máx.) | 0,97 — só descarta empates |
| `sign-stabilizer` | Janela de votação | 400 ms (~6 quadros a 15 Hz) |
| `sign-stabilizer` | Fração mínima da janela / quadros mínimos | 0,55 / 3 |
| `sign-stabilizer` | Permanência para confirmar | 700 ms |
| `sign-stabilizer` | Confiança mínima do KNN | 0,5 |
| `sign-stabilizer` | Tempo fora da classe que libera repetição | 200 ms |
| `sign-recognizer` | Intervalo entre amostras na captura | 150 ms |
| `sign-model-store` | Amostras por captura (`AMOSTRAS_RECOMENDADAS`) | 20 |
| `sign-model-store` | Teto por classe (`AMOSTRAS_MAXIMAS`) | **100** (era 60) |
| `sign-model-store` | Amostras do modelo pronto por classe (`AMOSTRAS_PADRAO`) | **50** |
| `montar-modelo-padrao` | Amostras por classe no arquivo gerado (`POR_CLASSE_PADRAO`) | 50 (= `AMOSTRAS_PADRAO`) |
| `montar-modelo-padrao` | Mínimo de pessoas antes de avisar | 3 |

### 3.4 Armazenamento (`chrome.storage.local`)

| Chave | Conteúdo |
|---|---|
| `soletra.modelo.v1.indice` | Índice do modelo: `esquema`, `versaoFeatures`, `mao`, `tauAbs`, `k`, `versaoCalibracao`, `contagem` (pessoais por classe) e `contagemPadrao` (do modelo pronto por classe) |
| `soletra.modelo.v1.classe.<X>` | Amostras **pessoais** da classe X |
| `soletra.modelo.v1.padrao.<X>` | Amostras do **modelo pronto** na classe X |
| `soletra.reconhecimento.prefs` | Preferências do reconhecimento (rigor, permanência, conjunto) |
| `soletra.preferredDeviceId` | Última câmera escolhida |
| `soletra.consentimento.reconhecimento` | Data do aceite do consentimento |

Em `chrome.storage.session` (some ao fechar o navegador): `soletra.texto` (texto composto) e
`soletra.janela.retomar` (o que religar ao trocar entre painel e tela cheia; apagado na leitura).

A chave `padrao.*` não mudou o `ESQUEMA` (continua 1): um modelo gravado antes dela não tem
`contagemPadrao` e é lido sem migração, com todas as amostras contadas como pessoais (cenário 17
do store).

---

## 4. Estado atual do código

### 4.1 Situação geral

| Indicador | Resultado |
|---|---|
| Suíte de testes | **97 cenários** em 11 arquivos (`node tests/todos.mjs`). Os 85 da versão de 19/09 passavam; os 12 novos foram escritos sem Node disponível na máquina e **ainda precisam ser executados** |
| Integridade do vendor | **4/4 arquivos íntegros** |
| `TODO` / `FIXME` / stubs no código | **nenhum** encontrado em `src/`, `sidepanel/`, `background/`, `permission/`, `tools/` |
| Dependências vulneráveis | não aplicável — zero dependências |
| Documentação | `README.md`, `PRIVACY.md` e este resumo atualizados com o modelo pronto, o teto de 100 e os botões de janela |
| Controle de versão | Git, histórico na seção 9 |

### 4.2 Cobertura de testes por módulo

| Arquivo de teste | Cenários |
|---|---:|
| `tests/sign-model-store.test.mjs` | 18 (eram 11) |
| `tests/sign-stabilizer.test.mjs` | 15 |
| `tests/sign-classifier.test.mjs` | 10 |
| `tests/inference-loop.test.mjs` | 8 |
| `tests/sign-features.test.mjs` | 8 |
| `tests/text-composer.test.mjs` | 7 |
| `tests/search-targets.test.mjs` | 7 |
| `tests/migracao-storage.test.mjs` | 7 |
| `tests/camera-controller.test.mjs` | 6 |
| `tests/integracao.test.mjs` | 6 |
| `tests/montar-modelo-padrao.test.mjs` | 5 (novo) |
| **Total** | **97** |

Cenários que travam bugs silenciosos (os de maior valor):

- **Invariância a resolução** — a mesma mão em 640×480 e 1280×720 precisa gerar vetores
  idênticos. Sem a correção de *aspect ratio*, o sintoma seria um modelo que para de funcionar
  ao trocar de webcam, sem erro nenhum.
- **Letra dupla** — S por 800 ms, pausa de 250 ms, S por 800 ms deve produzir `['S','S']`; com
  pausa de 100 ms, apenas `['S']`.
- **Timestamp monotônico** — trocar de câmera reinicia o `mediaTime`; um timestamp que regride
  faz o MediaPipe devolver resultado vazio em silêncio.
- **Versão de normalização** — um modelo gravado com outra `VERSAO_FEATURES` é **recusado**, não
  reinterpretado. Reinterpretar não daria erro: daria queda de acurácia sem causa aparente.
- **URL de busca com caractere reservado** — um `&` ou `#` digitado na text-box precisa ficar
  contido no parâmetro, sem injetar nada na URL do terceiro.
- **Migração de storage** — idempotente, e nunca sobrescreve dado novo com resíduo antigo.
- **Integração** — o pipeline completo digita "ABC", produz "AA" ao relaxar a mão entre dois
  sinais iguais e não inventa caractere sem mão no quadro nem com gesto fora do treino.
- **No teto, o padrão cede primeiro** — o modelo pronto entra com 50 amostras; até 50 pessoais
  nada é descartado; a partir daí cada amostra pessoal nova tira uma do padrão, até ele sumir
  por inteiro (cenário 13 do store).
- **Voltar ao padrão é por classe** — restaurar uma letra descarta só as pessoais dela, sem tocar
  nas outras (cenário 14).
- **Reinstalar o padrão não custa o treino pessoal** — e não deixa resíduo de classe que saiu do
  arquivo novo (cenário 15).
- **Eliminação alcança o padrão** — "Apagar tudo" e o × removem também as chaves `padrao.*`
  (cenário 16), o que sustenta o direito de eliminação.
- **Montagem balanceada** — quem gravou 60 amostras não leva mais lugar no padrão do que quem
  gravou 20, e a cota de quem gravou pouco é redistribuída (cenários 1 e 2 da montagem).

Novos cenários do store (11 a 17): instalar o padrão em chave própria preservando a mão do
usuário; pessoais somando às do padrão; teto com o padrão cedendo; restaurar uma classe;
reinstalar o padrão; eliminação incluindo o padrão; índice antigo lido sem migração.

Cenários da montagem (1 a 5): amostragem balanceada entre pessoas; redistribuição da cota não
usada; amostras espalhadas pela sessão de captura em vez das primeiras; saída válida para
`validarArquivo` com avisos de pouca diversidade; entrada inválida recusada com o número do
arquivo.

### 4.3 Cobertura funcional do reconhecimento

| Conjunto | Classes | Status |
|---|---|---|
| Letras estáticas | A B C D E F G I L M N O P Q R S T U V W Y (**21**) | Implementado; incluídas no modelo pronto |
| Números | 0–9 (**10**) | Implementado; incluídos no modelo pronto |
| Letras dinâmicas | **H J K X Z** (+ Ç) | **Fora desta versão** — exigem componente temporal |

A limitação das dinâmicas é **declarada na interface** (`AVISO_DINAMICAS` em
`src/sign-classes.js`) e a text-box aceita edição manual para completá-las. A decisão registrada
no código: *"um classificador quadro-a-quadro não tem como representar trajetória, e fingir que
tem produz confusão sistemática em vez de erro honesto."*

Letras e números compartilham configurações de mão (O≡0, V≡2, W≡3), por isso **nunca são
classificados juntos** — um seletor no painel alterna entre os conjuntos.

### 4.4 Qualidade do código

Pontos observados na leitura dos módulos:

- **Documentação em cabeçalho de módulo** explicando *por que* a decisão foi tomada, não apenas
  o que o código faz — presente em todos os 12 módulos de `src/` e nos módulos novos de
  `sidepanel/` e `tools/`.
- **Injeção de dependência para testabilidade**: relógio injetado no `SignStabilizer` (`t` é
  argumento de `processar()`, nunca `performance.now()` lido internamente), `area` injetável no
  `SignModelStore`, `agora`/`agendarQuadro`/`cancelarQuadro` no `InferenceLoop`. A ferramenta de
  montagem exporta `montarModeloPadrao()` como função pura, separada da leitura de arquivos, para
  poder ser testada.
- **Versionamento de esquema**: `VERSAO_FEATURES` e `ESQUEMA` com recusa explícita de dados
  incompatíveis — o `padrao.json` passa pela mesma validação que um arquivo importado.
- **Render barato a 15 Hz**: a grade de treino é construída uma vez e só atualizada no lugar;
  cada botão guarda a última contagem e origem desenhadas e só escreve no DOM quando elas mudam.
- **Nomenclatura em português** no código do reconhecimento. A exceção é o código herdado da
  v0.1.0 — `src/camera-controller.js` e a parte de câmera de `sidepanel/panel.js`
  (`CameraController`, `ensureDeviceLabels`, `showMessage`), que seguem em inglês.

---

## 5. Funcionalidades adicionadas depois de 19/09/2026

Esta seção descreve, em detalhe, o que foi feito depois do último commit documentado
(`b4e1e61`). Cada subseção traz o problema, a solução e as decisões tomadas.

### 5.1 Modelo pronto (modelo pré-definido)

#### 5.1.1 Problema

Até aqui, cada usuário precisava treinar o próprio modelo do zero antes de reconhecer qualquer
letra: 20 amostras × 21 letras, mais 10 números. Era a maior barreira de entrada do projeto —
quem abria a extensão pela primeira vez não via nada funcionando.

#### 5.1.2 Solução: três caminhos

1. **Usar o modelo pronto** — reconhece sem treino nenhum.
2. **Treinar do zero** — o fluxo de antes, com o modelo só do usuário.
3. **Partir do pronto e reforçar** — usar o modelo pronto e gravar amostras próprias nas letras
   que falharem com a mão do usuário. As amostras pessoais se somam às do modelo pronto.

Na primeira abertura, com o modelo vazio, aparece o cartão **"Como você quer começar?"** com os
botões **Usar modelo pronto** e **Treinar do zero**. "Treinar do zero" fecha o cartão e abre o
painel de treino; o cartão não volta naquela abertura. O cartão só aparece se o
`modelos/padrao.json` existir na extensão: sem o arquivo, nada muda e o painel funciona só com
treino próprio, como antes.

#### 5.1.3 Origem das amostras: padrão × pessoal

As amostras do modelo pronto ficam em **chaves próprias** (`soletra.modelo.v1.padrao.<X>`),
separadas das pessoais (`soletra.modelo.v1.classe.<X>`). O índice guarda as duas contagens
(`contagemPadrao` e `contagem`). O `carregar()` do store concatena as duas listas para o
classificador e devolve também `origem[classe] = { padrao, pessoal }` para a interface.

Isso permite três coisas que uma lista única não permitiria:

- **Voltar ao padrão numa letra** apagando só o que o usuário gravou nela.
- **No teto, sair primeiro a amostra genérica**: o `adicionarAmostra` descarta primeiro do
  padrão e só depois a pessoal mais antiga. Com o uso, o modelo vai convergindo para a mão de
  quem usa.
- **Reinstalar o padrão sem perder o treino pessoal**: `instalarPadrao()` troca só as chaves
  `padrao.*`, e as pessoais têm preferência dentro do teto.

A mão gravada no arquivo do modelo pronto é **ignorada** de propósito: as features já espelham a
mão esquerda (`sign-features`), então o mesmo padrão serve às duas mãos, e a mão que precisa
sobreviver no índice é a do usuário.

O limiar τ_abs também **não é lido do arquivo**: é sempre recalibrado sobre o conjunto final,
porque depende da dispersão interna, que muda quando o treino pessoal se soma.

#### 5.1.4 Interface

| Elemento | Comportamento |
|---|---|
| Selo da classe | `50+8` quando há padrão e pessoais (o número pessoal em destaque, porque é o que o usuário controla); só o total quando há um tipo só; `·` quando vazia |
| Dica do botão (tooltip) | "A — 50 do modelo pronto, 8 sua(s) de 100. Clique para reforçar." |
| Clique na classe | Grava 20 amostras novas (treinar ou reforçar) |
| × numa classe com padrão **e** pessoais | Pergunta "Voltar "A" ao modelo pronto?" e descarta só as pessoais |
| × numa classe só pessoal ou só padrão | Apaga a classe inteira, com confirmação |
| **Adicionar modelo pronto** | Para quem treinou do zero: soma o modelo pronto ao treino próprio |
| **Restaurar modelo pronto** | Para quem já usa o padrão: repõe as amostras padrão que cederam lugar aos reforços. Pede confirmação |
| **Apagar tudo** | Apaga padrão e pessoais |

#### 5.1.5 O arquivo `modelos/padrao.json`

Mesmo formato do botão **Exportar** (`soletra-modelo`, esquema 1, `versaoFeatures` 1), com dois
campos a mais: `pessoas` (quantos exports foram juntados) e `tauAbs: null` (recalibrado na
instalação). É lido com `fetch(chrome.runtime.getURL('modelos/padrao.json'))` — página da
própria extensão, sem precisar de `web_accessible_resources`.

O arquivo atual foi gerado a partir do modelo exportado pelo autor (31 classes × 60 amostras,
uma pessoa), reduzido a **50 amostras por classe** escolhidas espalhadas pela sessão de
captura (índices `⌊i·60/50⌋`), não as 50 primeiras.

#### 5.1.6 Ferramenta `tools/montar-modelo-padrao.mjs`

```
node tools/montar-modelo-padrao.mjs --por-classe 50 --saida modelos/padrao.json a.json b.json ...
```

Junta os exports de **várias pessoas** num modelo pronto:

- **Amostragem balanceada por pessoa**: cada pessoa tem a mesma cota na classe; a sobra de quem
  gravou pouco é redistribuída entre os outros. Sem isso, quem grava mais domina o padrão.
- **Amostras espalhadas** pela sessão de cada pessoa, não as primeiras.
- **Avisos** quando há menos de 3 pessoas no total, ou quando uma classe tem um único
  contribuinte.
- **Validação** da saída com o mesmo `SignModelStore.validarArquivo` da importação; um export
  inválido aborta com o número do arquivo.
- O padrão de 50 por classe vem de `AMOSTRAS_PADRAO`: gerar mais seria peso morto no pacote,
  porque a instalação descartaria o resto.

#### 5.1.7 Generalização: ponto de atenção

Um modelo treinado por **uma pessoa só** aprende a mão dela — tamanho, proporção dos dedos, o
jeito particular de fazer cada letra — e pode falhar em silêncio com quem não participou. O
`padrao.json` atual vem de uma pessoa (`pessoas: 1`). Aumentar para 50 amostras por letra não
resolve isso. O caminho previsto é coletar exports de colegas e voluntários, com consentimento, e
rodar a ferramenta de montagem (seção 8).

### 5.2 Teto de 100 amostras por classe e avisos de limite

#### 5.2.1 Mudança

| Constante | Antes | Agora |
|---|---:|---:|
| `AMOSTRAS_MAXIMAS` (teto por classe) | 60 | **100** |
| `AMOSTRAS_PADRAO` (modelo pronto por classe) | — | **50** |
| `POR_CLASSE_PADRAO` (ferramenta) | 30 | **50** |

Com o modelo pronto entrando com 50, sobram **50 lugares livres** por letra para o reforço
pessoal antes que qualquer amostra precise ceder. Na instalação, o número de amostras do padrão
é `min(50, 100 − pessoais)`, então o treino pessoal nunca é empurrado para fora pelo padrão.

Custo de armazenamento: 31 classes × 100 amostras × 63 números ficam bem abaixo da quota de
10 MB do `chrome.storage.local`.

#### 5.2.2 Problema que os avisos resolvem

O store descartava amostras em silêncio no teto. Uma letra que já funcionava podia piorar depois
de um reforço, sem o usuário entender por quê.

#### 5.2.3 Avisos na interface

| Momento | O que aparece |
|---|---|
| **Na grade** | A classe com 100 amostras fica com **borda tracejada** e número em negrito (estado `classe--cheia`). Tooltip: "Classe cheia (100/100): gravar mais substitui as mais antigas". O texto de ajuda abaixo da grade explica a marcação |
| **Antes de gravar — só o padrão vai ceder** | Mensagem informativa: "A chegou ao limite de 100 amostras: N do modelo pronto vão dar lugar às que você gravar agora." A gravação começa normalmente, porque é o reforço esperado |
| **Antes de gravar — amostras do usuário vão sair** | Confirmação "A já está cheia" (ou "vai passar do limite") dizendo quantas amostras suas e quantas do modelo pronto serão descartadas, com **Gravar mesmo assim** / **Cancelar**, e a sugestão de apagar a letra no × e gravar de novo se ela tiver piorado |
| **Durante a gravação no teto** | A barra de gravação fica laranja e mostra "limite de 100: substituindo as mais antigas" — explica por que o total parou de subir |

A conta é feita antes da captura: `excesso = total + 20 − 100`; o padrão cede até `padrao`
amostras e o resto sai das pessoais.

### 5.3 "Apagar tudo" mantém o caminho de volta ao modelo pronto

Antes, depois de **Apagar tudo** o botão de restaurar sumia (o modelo ficava vazio), e só o
cartão de boas-vindas oferecia o modelo pronto — que não aparecia se o usuário já tivesse
escolhido "Treinar do zero" naquela abertura.

Agora:

- O botão **Restaurar modelo pronto** continua visível com o modelo vazio; só some se o
  `padrao.json` não estiver na extensão.
- Com o modelo vazio, ele carrega o padrão **sem pedir confirmação**: não há treino a perder.
- A mensagem depois de apagar diz: "Modelo apagado. Para voltar a usar o modelo pronto, clique
  em "Restaurar modelo pronto"."

### 5.4 Botões de janela no estilo do macOS (fechar, minimizar, tela cheia)

#### 5.4.1 Comportamento

Três botões redondos no canto esquerdo do topo, nas cores do macOS (vermelho `#ff5f57`, amarelo
`#febc2e`, verde `#28c840`). Os símbolos (×, −, setas) aparecem ao passar o mouse sobre o grupo
ou com foco de teclado, como no macOS. Os três ficam habilitados e com dica nas duas telas.

| Botão | No painel lateral | Na tela cheia (aba) |
|---|---|---|
| 🔴 Fechar | Fecha o painel (`window.close()`) | Fecha a aba (`chrome.tabs.remove`) |
| 🟡 Minimizar | Avisa que já está minimizado — o painel lateral **é** o estado minimizado | Reabre o painel lateral na mesma janela e fecha a aba |
| 🟢 Maximizar | Abre o Soletra numa **aba da janela atual**, ocupando o navegador inteiro, e fecha o painel | Alterna a tela cheia de verdade (Fullscreen API); Esc também sai |

#### 5.4.2 Decisões

- **Aba, não janela nova.** A primeira versão abria uma janela própria (`chrome.windows.create`
  em tela cheia); foi trocada por uma aba na janela atual, que se adapta ao navegador. Se já
  houver uma aba do Soletra aberta, ela é recarregada e trazida para frente
  (`chrome.runtime.getContexts`), em vez de empilhar outra.
- **Uma página por vez, e a câmera solta antes.** Em muitas webcams no Windows o acesso é
  exclusivo; a página que sai desliga câmera e reconhecimento **antes** de abrir a outra. O que
  estava ligado é anotado em `storage.session` (`soletra.janela.retomar`) e religado do outro
  lado. A anotação é apagada na leitura: reabrir o painel no dia seguinte não liga a câmera
  sozinho.
- **Gesto do usuário.** `chrome.sidePanel.open` só funciona dentro do clique, sem `await` antes.
  Por isso a janela da aba é lida já na abertura da página, e a chamada é a primeira do clique.
- **Modo pela URL.** A mesma `panel.html` roda nos dois modos; `?modo=aba` liga o layout de tela
  cheia (coluna centrada de até 760 px, letra maior, vídeo grande). O painel lateral não recebe
  parâmetro, então sem ele é painel.
- **Sem permissão nova.** `tabs.create/remove/reload`, `windows.update` e `runtime.getContexts`
  sobre páginas da própria extensão não exigem permissão no manifesto.

#### 5.4.3 Limitações

- Voltar ao painel usa `chrome.sidePanel.open` (Chrome 116+), e o manifesto aceita a partir da
  114. Sem a API, aparece um aviso pedindo para fechar a aba e clicar no ícone do Soletra.
- Abrir o painel pelo ícone com a aba de tela cheia ainda aberta faz as duas páginas disputarem
  a câmera.

### 5.5 Documentação

- `README.md`: seções "Modelo pronto" (com a ferramenta de montagem) e "Tela cheia, painel e
  fechar"; teto de 100 e padrão de 50; estrutura de arquivos com `janela.js`.
- `PRIVACY.md`: linha nova na tabela de dados para as amostras do modelo pronto; parágrafo sobre
  as amostras de voluntários; "Apagar tudo" passa a incluir o modelo pronto.
- Este resumo.

---

## 6. Conformidade e privacidade (LGPD)

O `PRIVACY.md` está na versão 0.2.0 e mapeia cada dado tratado com finalidade, local de
armazenamento e retenção.

| Ponto | Situação |
|---|---|
| Quadros de vídeo | Nunca gravados nem transmitidos; memória do WASM, sobrescrita por quadro |
| Amostras de treino | **Vetores numéricos, não imagens** — geometria normalizada da mão. Ainda assim tratadas como **dado biométrico derivado** |
| Amostras do modelo pronto | Vêm empacotadas na extensão, de voluntários, sem nome nem identificador; copiadas para o `storage.local` só quando o usuário escolhe usá-las. Escolher o modelo pronto não envia nada |
| Direito de eliminação (art. 18, VI) | Botão "Apagar tudo" (e × para apagar uma única classe) — remove também as amostras do modelo pronto; `sign-model-store` garante que não resta resíduo no storage (cenários 9 e 16) |
| Direito de portabilidade (art. 18, V) | Export/import do modelo em JSON com validação de esquema. O export traz padrão e pessoais juntos; reimportado, tudo vira pessoal |
| Único ponto de saída de dados | O termo de busca, **apenas** depois de escolher a plataforma no seletor do "Pesquisar" — e só para ela |
| Permissões declaradas | `sidePanel`, `storage`, `search` — **sem `host_permissions`**, sem content scripts. Os botões de janela não acrescentaram permissão |
| Serviços externos de IA | Nenhum. Inferência 100% local por WebAssembly |

**Pontos de atenção para publicação:**

- Chrome Web Store e Edge Add-ons exigem justificativa de uso da câmera e URL pública da
  política de privacidade. A justificativa a declarar já está redigida no `README.md`. A
  permissão `search` também pede justificativa: aciona o buscador padrão do navegador quando o
  usuário escolhe esse destino.
- O `PRIVACY.md` afirma que os voluntários do modelo pronto consentiram com a distribuição. Esse
  consentimento precisa ser **registrado por escrito** para cada pessoa cujo export entrar no
  `padrao.json` (inclusive o autor), e anexado à documentação do TCC.

---

## 7. Como rodar e verificar

```
node tests/todos.mjs                     # suíte completa — 97 cenários
node tools/verificar-vendor.mjs          # confere os SHA-256 dos binários
node tools/verificar-vendor.mjs --gerar  # regrava INTEGRIDADE.json
node tools/montar-modelo-padrao.mjs --por-classe 50 --saida modelos/padrao.json *.json
```

**Instalação em modo desenvolvedor:**

1. Chrome: `chrome://extensions` — Edge: `edge://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione a raiz do repositório
4. Clique no ícone do Soletra para abrir o painel

**Roteiro de teste manual das funcionalidades novas:**

1. Com o storage limpo, abrir o painel → cartão "Como você quer começar?" → **Usar modelo
   pronto** → ligar câmera e Reconhecimento e reconhecer letras sem treinar.
2. Clicar numa letra para reforçar → selo passa a `50+20`.
3. Reforçar a mesma letra até 100 → borda tracejada; nova tentativa mostra o aviso ou a
   confirmação de limite; barra laranja durante a gravação.
4. × na letra reforçada → "Voltar ao modelo pronto" → selo volta a `50`.
5. **Apagar tudo** → o botão **Restaurar modelo pronto** continua visível → clicar recarrega o
   padrão sem confirmação.
6. Verde → abre como aba ocupando o navegador, com a câmera religada; verde de novo → tela
   cheia; amarelo → volta ao painel lateral; vermelho → fecha.
7. Exportar, apagar e reimportar o modelo.

**Diagnóstico de latência:** abrir `spike/spike.html` como página da extensão. Mede latência por
delegate separando quadros com e sem mão rastreada (regimes de custo diferentes — sem
rastreamento o MediaPipe roda o detector de palma a cada quadro).

**Fluxo de permissão:** extensões não têm permissão `"camera"` no manifesto, e o diálogo nativo
não aparece dentro do painel lateral. A extensão encaminha para `permission/request.html` em aba
de topo; concedida ali, a permissão vale para toda a origem `chrome-extension://<id>` — inclusive
para a aba de tela cheia.

---

## 8. Riscos, pontos de atenção e próximos passos

### 8.1 Riscos

| Risco | Impacto | Mitigação atual |
|---|---|---|
| Modelo pronto treinado por uma pessoa só | Pode falhar com mãos diferentes da do autor, sem erro aparente | Reforço por letra, voltar ao padrão por letra; ferramenta de montagem pronta para juntar várias pessoas, com aviso abaixo de 3 |
| Ausência de matriz de confusão / avaliação formal | Não se sabe quais pares de configuração realmente colidem; hoje é suposição (O≡0, V≡2) | Previsto em `src/sign-eval.js` (ainda não implementado) |
| Testes novos ainda não executados | Algum cenário novo pode falhar | Rodar `node tests/todos.mjs` antes da entrega |
| 20 MB de binários no repositório | Clone pesado; limite de tamanho das lojas | Decisão consciente — CDN é proibida pela CSP |
| Dependência de uma versão fixa do MediaPipe | Correções de segurança upstream exigem revendorização manual | `INTEGRIDADE.json` + `verificar-vendor.mjs` detectam divergência |
| Modelo treinado pelo usuário = variabilidade de acurácia | Usuário com treino ruim tem experiência ruim | Calibração automática de τ_abs; modelo pronto como ponto de partida; teto de 100 com aviso na interface |
| Cobertura de 21/26 letras | Palavras com H, J, K, X, Z exigem edição manual | Limitação declarada na UI; text-box editável |
| Painel e aba de tela cheia abertos juntos | Disputam a câmera | A troca pelos botões solta a câmera antes; abrir pelo ícone com a aba aberta não é tratado |
| `sidePanel.open` só no Chrome 116+ | No 114–115, o amarelo não volta ao painel | Aviso na interface |
| Imagens de origem das logos fora do repositório | `tools/preparar-logos.mjs` não pode ser reexecutado | Os PNGs finais estão empacotados em `icons/plataformas/` e sua presença é conferida por teste |
| URLs de terceiros podem mudar | Uma plataforma que altere o formato de busca quebra aquele destino | URLs fixadas por teste; o formato do Maps foi conferido na documentação oficial |

### 8.2 Próximos passos registrados

1. **Coletar exports de várias pessoas** (com consentimento por escrito) e regenerar o
   `padrao.json` com `tools/montar-modelo-padrao.mjs`.
2. **Matriz de confusão e avaliação leave-one-out** (`src/sign-eval.js`) — medir quais pares de
   configurações realmente colidem, e medir a acurácia do modelo pronto em quem não participou do
   treino (resultado forte para o TCC).
3. **Escolha "Substituir / Mesclar" na importação** — o store já suporta `mesclar`; a interface
   ainda só substitui.
4. **Letras dinâmicas (H, J, K, X, Z e Ç)** — exigem um segundo pipeline com componente
   temporal: buffer de landmarks e classificador de sequência, com dataset próprio.
5. **Ablação da normalização** — rotação ligada versus desligada, peso do eixo z, e efeito de
   acrescentar distâncias ponta-de-dedo→punho ao vetor (`VERSAO_FEATURES` 2).
6. **Captura em segundo plano via `offscreen` document** — manter o modelo quente entre aberturas
   do painel.
7. Outras ideias levantadas: modo prática/jogo (o app sorteia uma letra e o usuário sinaliza),
   treino guiado com imagem de referência por letra, autocompletar de palavras, vários perfis de
   modelo, barra das 3 classes mais prováveis ao vivo, atalho de teclado e comandos por gesto
   (espaço, apagar, pesquisar).

---

## 9. Histórico de alterações

| Data | Commit | Descrição |
|---|---|---|
| 19/09/2026 | `bf7cc0c` | Versão inicial: câmera no painel lateral, pipeline MediaPipe → KNN → estabilização, treino, export/import |
| 19/09/2026 | `7a1df0e` | Configuração local do Claude Code deixa de ser versionada |
| 19/09/2026 | `6ed3405` | Produto renomeado de RVL Libras para Soletra, com migração das chaves de storage |
| 19/09/2026 | `c353056` | Regra global impede que `display` de autor anule o atributo `hidden` |
| 19/09/2026 | `8b29921` | Revisão do painel de treino e do modal de confirmação |
| 19/09/2026 | `13863c8` | Seletor de plataforma de destino na pesquisa |
| 19/09/2026 | `840b6d8` | Correção da descrição do limiar no README |
| 19/09/2026 | `731c1d8` | Marca do Soletra como ícone da extensão |
| 19/09/2026 | `5f25a9b` | Recalibração de modelos salvos com o limiar antigo |
| 19/09/2026 | `b4e1e61` | README, RESUMO e PRIVACY alinhados ao código |
| 13/10/2026 | `0a6ef74` + `c89af4c` | Modelo pronto: origem padrão × pessoal no store, boas-vindas, reforço e voltar ao padrão por classe, restaurar (seção 5.1) |
| 13/10/2026 | `277d283` | Ferramenta de montagem do modelo pronto e `modelos/padrao.json` com 50 amostras por classe (seções 5.1.5 e 5.1.6) |
| 13/10/2026 | `0a6ef74` + `c89af4c` | Teto de 100 por classe e avisos de limite na interface (seção 5.2) |
| 13/10/2026 | `c89af4c` | "Apagar tudo" mantém o botão de restaurar o modelo pronto (seção 5.3) |
| 13/10/2026 | `c89af4c` | Botões de janela no estilo do macOS e tela cheia como aba (seção 5.4) |
| 13/10/2026 | (este commit) | README, PRIVACY e este resumo documentam tudo acima (seção 5.5) |

---

## 10. Sobre o repositório de referência

O projeto [WellingtonDev25/leitor_libras](https://github.com/WellingtonDev25/leitor_libras) foi
avaliado como base e **descartado**. É um script Python de 56 linhas com modelo Teachable Machine
que classifica **pixels 224×224** — o MediaPipe ali serve apenas para recortar a *bounding box* da
mão, e os landmarks nunca chegam ao classificador. Reconhece **5 classes** (`A`–`E`), não inclui
dataset nem script de treino, não tem estabilização e **não declara licença**, o que reservaria
todos os direitos ao autor.

A abordagem adotada aqui — classificar sobre landmarks em vez de pixels — é tecnicamente
superior: modelo de KB em vez de MB, e robustez a fundo, iluminação e tom de pele.
