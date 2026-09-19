# Resumo do Projeto — Soletra

**Documento atualizado em:** 19/09/2026
**Versão do projeto:** 0.2.0 (`manifest.json`)
**Repositório:** `C:\Gitlab\TCC-Libras-Ref` — Git, branch `main`

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
**pixels**. Resultado: modelo de centenas de KB em vez de dezenas de MB, robustez a fundo, iluminação e tom de
pele, e treino feito pelo próprio usuário no navegador — sem dataset externo, sem etapa em
Python, sem TensorFlow.js.

---

## 2. Stack e tecnologias

### 2.1 Runtime e plataforma

| Camada | Tecnologia | Versão / detalhe |
|---|---|---|
| Plataforma | Extensão Chrome/Edge **Manifest V3** | `minimum_chrome_version: 114` |
| Linguagem | **JavaScript ES Modules** puro | sem TypeScript, sem bundler, sem build step |
| UI | **HTML + CSS** nativos | sem React/Vue; render por snapshot de estado |
| Painel | `chrome.sidePanel` API | fallback para aba dedicada no service worker |
| Persistência | `chrome.storage.local` / `.session` | quota de 10 MB |
| Visão computacional | **MediaPipe `@mediapipe/tasks-vision`** | **1.0.1**, vendorizado, delegate **CPU** |
| Modelo de detecção | `hand_landmarker.task` | 21 pontos (x, y, z) por mão |
| Classificação | **KNN k=5** ponderado por 1/d | implementação própria, 273 linhas |
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
| **KNN em vez de rede neural** | ~20 amostras por classe treinadas pelo usuário: não há dados nem tempo para otimizar pesos. O custo é inferência O(amostras) — frações de ms a 15 Hz sobre ~600 vetores |
| **`requestVideoFrameCallback`, não `setInterval`** | Um timer dispara mesmo sem quadro novo e o MediaPipe reprocessaria a mesma imagem. O rVFC dispara uma vez por quadro e pausa junto com o vídeo |
| **Painel lateral, não popup** | O popup fecha ao perder foco, destrói o documento e encerra o `MediaStream` |
| **Limiar de rejeição constante (1,3)** | A normalização dá escala física fixa ao espaço de 63 dimensões. Duas calibrações anteriores (dispersão interna × 2; separação entre classes × 1,2) rejeitavam sinais legítimos — a segunda encolhia justamente quando o alfabeto ficava completo |
| **Pesquisa executada pelo service worker** | `chrome.search.query` com `disposition` precisa inferir a aba a partir de quem chamou, e o painel lateral não é aba. O worker cria a aba antes e passa `tabId` |
| **Logos empacotadas, não remotas** | A CSP do MV3 bloqueia imagem remota, e a interface não pode depender de rede para se desenhar |
| **Migração de storage do nome antigo** | O produto se chamava RVL Libras (`rvl.*`). Renomear as chaves sem migrar faria o usuário "perder" o modelo sem erro nenhum |

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
       → KNN sobre as amostras do usuário
       → estabilização temporal → caractere confirmado
       → text-box → Pesquisar → escolha da plataforma
```

Nada é enviado antes da escolha: fechar o seletor (×, Cancelar, Esc ou clique fora) não dispara
pesquisa nenhuma. O catálogo de destinos fica em `src/search-targets.js`, com as URLs fixadas por
teste e o termo sempre passado por `encodeURIComponent`.

### 3.2 Camadas

O projeto é organizado para isolar o que é testável do que não é: **um único módulo depende de
WASM** (`src/hand-landmarker.js`, 101 linhas, fino de propósito), e **um único módulo de `src/`
acessa o ambiente sem permitir substituição** (`src/sign-recognizer.js`, onde moram o relógio
real, o storage e a inicialização do WASM). `sign-model-store` e `inference-loop` usam
`chrome.storage.local` e `performance.now()` como padrão, mas os recebem por injeção nos testes;
`migracao-storage` recebe a área de storage como argumento. O resto é função pura ou classe com
relógio injetado.

| Módulo | Linhas | Responsabilidade |
|---|---:|---|
| `src/camera-controller.js` | 279 | Ciclo de vida do `MediaStream` — inalterado desde a v0.1.0 |
| `src/sign-recognizer.js` | 416 | Orquestrador; expõe um `onStateChange`, como o CameraController |
| `src/hand-landmarker.js` | 101 | Adaptador do MediaPipe (único módulo dependente de WASM) |
| `src/inference-loop.js` | 138 | Agendador rVFC, throttle adaptativo, timestamp monotônico |
| `src/sign-features.js` | 134 | Landmarks → 63 números; carrega `VERSAO_FEATURES` |
| `src/sign-classifier.js` | 273 | KNN ponderado, rejeição, teste de razão, calibração de limiar (τ_abs) |
| `src/sign-stabilizer.js` | 234 | Máquina de confirmação e trava anti-repetição |
| `src/sign-classes.js` | 51 | Catálogo de classes estáticas, dinâmicas e números |
| `src/sign-model-store.js` | 271 | Persistência, quota, export/import com validação de esquema |
| `src/text-composer.js` | 75 | Composição do texto e normalização para a busca |
| `src/search-targets.js` | 102 | Catálogo de plataformas de busca e montagem das URLs |
| `src/migracao-storage.js` | 64 | Migra as chaves `rvl.*` (RVL Libras) para `soletra.*` |

| Interface | Linhas | Responsabilidade |
|---|---:|---|
| `sidepanel/panel.html` / `.css` / `.js` | 225 / 764 / 438 | Interface principal |
| `sidepanel/recognition-view.js` | 164 | Anel de progresso, text-box, busca |
| `sidepanel/training-view.js` | 142 | Grade de classes (atualizada no lugar), apagar por classe, exportar/importar/apagar tudo |
| `sidepanel/dialogo.js` | 104 | Modal de confirmação (`window.confirm` não é confiável no painel) |
| `sidepanel/seletor-plataforma.js` | 169 | Modal de escolha do destino da pesquisa |
| `background/service-worker.js` | 97 | Abre o painel no clique do ícone (fallback: aba) e executa a pesquisa |
| `permission/request.html` / `.js` / `.css` | 34 / 56 / 85 | Aba de topo para o prompt nativo de câmera |

| Apoio | Linhas | Responsabilidade |
|---|---:|---|
| `tools/verificar-vendor.mjs` | 89 | Confere os SHA-256 dos binários vendorizados |
| `tools/png.mjs` | 217 | Ler, escrever e redimensionar PNG, sem dependências |
| `tools/make-icons.mjs` | 66 | Gera `icons/icon*.png` a partir de `icons/soletra-logo.png` |
| `tools/preparar-logos.mjs` | 302 | Limpa, apara e reduz as logos das plataformas (origem fora do repositório) |
| `spike/spike.html` / `.js` | 69 / 274 | Diagnóstico de CSP e latência (fora do fluxo de produção) |

**Total de código-fonte próprio: ~7.180 linhas** (incluindo testes e ferramentas).

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
| `sign-model-store` | Amostras recomendadas / teto por classe | 20 / 60 |

---

## 4. Estado atual do código

### 4.1 Situação geral: **funcional e estável**

| Indicador | Resultado |
|---|---|
| Suíte de testes | **85/85 cenários passando** (`node tests/todos.mjs` → exit 0) |
| Integridade do vendor | **4/4 arquivos íntegros** |
| `TODO` / `FIXME` / stubs no código | **nenhum** encontrado em `src/`, `sidepanel/`, `background/`, `permission/`, `tools/` |
| Dependências vulneráveis | não aplicável — zero dependências |
| Documentação | `README.md` (~18 KB) e `PRIVACY.md` (8 KB) atualizados na 0.2.0 |
| Controle de versão | Git, branch `main` |

### 4.2 Cobertura de testes por módulo

| Arquivo de teste | Cenários |
|---|---:|
| `tests/sign-stabilizer.test.mjs` | 15 |
| `tests/sign-model-store.test.mjs` | 11 |
| `tests/sign-classifier.test.mjs` | 10 |
| `tests/inference-loop.test.mjs` | 8 |
| `tests/sign-features.test.mjs` | 8 |
| `tests/text-composer.test.mjs` | 7 |
| `tests/search-targets.test.mjs` | 7 |
| `tests/migracao-storage.test.mjs` | 7 |
| `tests/camera-controller.test.mjs` | 6 |
| `tests/integracao.test.mjs` | 6 |
| **Total** | **85** |

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

### 4.3 Cobertura funcional do reconhecimento

| Conjunto | Classes | Status |
|---|---|---|
| Letras estáticas | A B C D E F G I L M N O P Q R S T U V W Y (**21**) | Implementado |
| Números | 0–9 (**10**) | Implementado |
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
  o que o código faz — presente em todos os 12 módulos de `src/`.
- **Injeção de dependência para testabilidade**: relógio injetado no `SignStabilizer` (`t` é
  argumento de `processar()`, nunca `performance.now()` lido internamente), `area` injetável no
  `SignModelStore`, `agora`/`agendarQuadro`/`cancelarQuadro` no `InferenceLoop`.
- **Versionamento de esquema**: `VERSAO_FEATURES` e `ESQUEMA` com recusa explícita de dados
  incompatíveis.
- **Nomenclatura em português** no código do reconhecimento. A exceção é o código herdado da
  v0.1.0 — `src/camera-controller.js` e a parte de câmera de `sidepanel/panel.js`
  (`CameraController`, `ensureDeviceLabels`, `showMessage`), que seguem em inglês.

---

## 5. Conformidade e privacidade (LGPD)

O `PRIVACY.md` está na versão 0.2.0 e mapeia cada dado tratado com finalidade, local de
armazenamento e retenção.

| Ponto | Situação |
|---|---|
| Quadros de vídeo | Nunca gravados nem transmitidos; memória do WASM, sobrescrita por quadro |
| Amostras de treino | **Vetores numéricos, não imagens** — geometria normalizada da mão. Ainda assim tratadas como **dado biométrico derivado** |
| Direito de eliminação (art. 18, VI) | Botão "Apagar tudo" (e × para apagar uma única classe) — `sign-model-store` garante que não resta resíduo no storage (cenário de teste 9) |
| Direito de portabilidade (art. 18, V) | Export/import do modelo em JSON (~430 KB com as 21 letras, ~640 KB com letras e números, a 20 amostras por classe) com validação de esquema |
| Único ponto de saída de dados | O termo de busca, **apenas** depois de escolher a plataforma no seletor do "Pesquisar" — e só para ela |
| Permissões declaradas | `sidePanel`, `storage`, `search` — **sem `host_permissions`**, sem content scripts |
| Serviços externos de IA | Nenhum. Inferência 100% local por WebAssembly |

**Ponto de atenção para publicação:** Chrome Web Store e Edge Add-ons exigem justificativa de
uso da câmera e URL pública da política de privacidade. A justificativa a declarar já está
redigida no `README.md`. A permissão `search` também pede justificativa: aciona o buscador
padrão do navegador quando o usuário escolhe esse destino.

---

## 6. Como rodar e verificar

```
node tests/todos.mjs                     # suíte completa — 85 cenários
node tools/verificar-vendor.mjs          # confere os SHA-256 dos binários
node tools/verificar-vendor.mjs --gerar  # regrava INTEGRIDADE.json
```

**Instalação em modo desenvolvedor:**

1. Chrome: `chrome://extensions` — Edge: `edge://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione a raiz do repositório
4. Clique no ícone do Soletra para abrir o painel

**Diagnóstico de latência:** abrir `spike/spike.html` como página da extensão. Mede latência por
delegate separando quadros com e sem mão rastreada (regimes de custo diferentes — sem
rastreamento o MediaPipe roda o detector de palma a cada quadro).

**Fluxo de permissão:** extensões não têm permissão `"camera"` no manifesto, e o diálogo nativo
não aparece dentro do painel lateral. A extensão encaminha para `permission/request.html` em aba
de topo; concedida ali, a permissão vale para toda a origem `chrome-extension://<id>`.

---

## 7. Riscos e pontos de atenção

| Risco | Impacto | Mitigação atual |
|---|---|---|
| Ausência de matriz de confusão / avaliação formal | Não se sabe quais pares de configuração realmente colidem; hoje é suposição (O≡0, V≡2) | Previsto em `src/sign-eval.js` (ainda não implementado) |
| 20 MB de binários no repositório | Clone pesado; limite de tamanho das lojas | Decisão consciente — CDN é proibida pela CSP |
| Dependência de uma versão fixa do MediaPipe | Correções de segurança upstream exigem revendorização manual | `INTEGRIDADE.json` + `verificar-vendor.mjs` detectam divergência |
| Modelo treinado pelo usuário = variabilidade de acurácia | Usuário com treino ruim tem experiência ruim | Calibração automática de τ_abs; teto de 60 amostras por classe |
| Cobertura de 21/26 letras | Palavras com H, J, K, X, Z exigem edição manual | Limitação declarada na UI; text-box editável |
| Imagens de origem das logos fora do repositório | `tools/preparar-logos.mjs` não pode ser reexecutado; trocar uma logo exige recuperar a imagem original | Os PNGs finais estão empacotados em `icons/plataformas/` e sua presença é conferida por teste |
| URLs de terceiros podem mudar | Uma plataforma que altere o formato de busca quebra aquele destino | URLs fixadas por teste; o formato do Maps foi conferido na documentação oficial |

---

## 8. Próximos passos registrados

1. **Letras dinâmicas (H, J, K, X, Z e Ç)** — exigem um segundo pipeline com componente
   temporal: buffer de landmarks e classificador de sequência, com dataset próprio.
2. **Matriz de confusão e avaliação leave-one-out** (`src/sign-eval.js`) — medir quais pares de
   configurações realmente colidem, em vez de supor.
3. **Ablação da normalização** — rotação ligada versus desligada, peso do eixo z, e efeito de
   acrescentar distâncias ponta-de-dedo→punho ao vetor (`VERSAO_FEATURES` 2).
4. **Captura em segundo plano via `offscreen` document** — manter o modelo quente entre aberturas
   do painel.

---

## 9. Sobre o repositório de referência

O projeto [WellingtonDev25/leitor_libras](https://github.com/WellingtonDev25/leitor_libras) foi
avaliado como base e **descartado**. É um script Python de 56 linhas com modelo Teachable Machine
que classifica **pixels 224×224** — o MediaPipe ali serve apenas para recortar a *bounding box* da
mão, e os landmarks nunca chegam ao classificador. Reconhece **5 classes** (`A`–`E`), não inclui
dataset nem script de treino, não tem estabilização e **não declara licença**, o que reservaria
todos os direitos ao autor.

A abordagem adotada aqui — classificar sobre landmarks em vez de pixels — é tecnicamente
superior: modelo de KB em vez de MB, e robustez a fundo, iluminação e tom de pele.
