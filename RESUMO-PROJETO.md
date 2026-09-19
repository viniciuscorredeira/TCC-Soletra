# Resumo do Projeto — RVL Libras

**Documento gerado em:** 15/09/2026
**Versão do projeto:** 0.2.0 (`manifest.json`)
**Repositório:** `C:\Gitlab\TCC-Libras-Ref` (não versionado em Git no momento)

---

## 1. Objetivo

Extensão de navegador (Chrome/Edge, Manifest V3) que acessa a câmera do usuário, exibe o vídeo
em um **painel lateral** e reconhece sinais **estáticos** do alfabeto manual de Libras,
compondo um texto que pode ser enviado ao mecanismo de busca padrão.

A premissa central do projeto é **processamento 100% local**: os pontos da mão são extraídos
por WebAssembly empacotado dentro da extensão. Nenhum quadro de vídeo é gravado ou transmitido.
O único dado que sai do dispositivo é o texto que o usuário escolhe pesquisar.

**Diferencial técnico:** classificação sobre **landmarks** (geometria da mão) em vez de
**pixels**. Resultado: modelo de ~400 KB em vez de MB, robustez a fundo, iluminação e tom de
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
| Classificação | **KNN k=5** ponderado por 1/d | implementação própria, 173 linhas |
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
| **Delegate CPU, não GPU** | Medido no spike: CPU p50 **22,9 ms** contra **58,4 ms** no GPU. O readback de textura domina o custo de um modelo pequeno, e o GPU exigiria manter contexto WebGL vivo num painel recolhível |
| **`FilesetResolver` não utilizado** | O `WasmFileset` é montado à mão, evitando a sonda SIMD em runtime (que apontaria para um par `_nosimd_` não vendorizado) |
| **KNN em vez de rede neural** | ~20 amostras por classe treinadas pelo usuário: não há dados nem tempo para otimizar pesos. O custo é inferência O(amostras) — frações de ms a 15 Hz sobre ~600 vetores |
| **`requestVideoFrameCallback`, não `setInterval`** | Um timer dispara mesmo sem quadro novo e o MediaPipe reprocessaria a mesma imagem. O rVFC dispara uma vez por quadro e pausa junto com o vídeo |
| **Painel lateral, não popup** | O popup fecha ao perder foco, destrói o documento e encerra o `MediaStream` |

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
       → text-box → Pesquisar
```

### 3.2 Camadas

O projeto é organizado para isolar o que é testável do que não é: **um único módulo depende de
WASM** (`src/hand-landmarker.js`, 101 linhas, fino de propósito), e **um único módulo é impuro**
(`src/sign-recognizer.js`, onde moram o relógio real, o storage e a inicialização do WASM).
Todo o resto é função pura ou classe com relógio injetado.

| Módulo | Linhas | Responsabilidade |
|---|---:|---|
| `src/camera-controller.js` | 279 | Ciclo de vida do `MediaStream` — inalterado desde a v0.1.0 |
| `src/sign-recognizer.js` | 382 | Orquestrador; expõe um `onStateChange`, como o CameraController |
| `src/hand-landmarker.js` | 101 | Adaptador do MediaPipe (único módulo dependente de WASM) |
| `src/inference-loop.js` | 138 | Agendador rVFC, throttle adaptativo, timestamp monotônico |
| `src/sign-features.js` | 134 | Landmarks → 63 números; carrega `VERSAO_FEATURES` |
| `src/sign-classifier.js` | 173 | KNN ponderado, rejeição, calibração de limiar (τ_abs) |
| `src/sign-stabilizer.js` | 229 | Máquina de confirmação e trava anti-repetição |
| `src/sign-classes.js` | 51 | Catálogo de classes estáticas, dinâmicas e números |
| `src/sign-model-store.js` | 247 | Persistência, quota, export/import com validação de esquema |
| `src/text-composer.js` | 75 | Composição do texto e normalização para a busca |

| Interface | Linhas | Responsabilidade |
|---|---:|---|
| `sidepanel/panel.html` / `.css` / `.js` | 149 / 439 / 412 | Interface principal |
| `sidepanel/recognition-view.js` | 121 | Anel de progresso, text-box, busca |
| `sidepanel/training-view.js` | 100 | Grade de classes, exportar/importar/apagar |
| `sidepanel/dialogo.js` | 51 | Confirmação inline (`window.confirm` não é confiável no painel) |
| `background/service-worker.js` | 41 | Abre o painel no clique do ícone (fallback: aba) |
| `permission/request.html` / `.js` / `.css` | 34 / 56 / 85 | Aba de topo para o prompt nativo de câmera |

| Apoio | Linhas | Responsabilidade |
|---|---:|---|
| `tools/verificar-vendor.mjs` | 89 | Confere os SHA-256 dos binários vendorizados |
| `tools/make-icons.mjs` | 120 | Gera `icons/*.png` sem dependências |
| `spike/spike.html` / `.js` | 69 / 274 | Diagnóstico de CSP e latência (fora do fluxo de produção) |

**Total de código-fonte próprio: ~5.036 linhas** (incluindo testes e ferramentas).

### 3.3 Parâmetros do pipeline

| Módulo | Parâmetro | Valor |
|---|---|---|
| `inference-loop` | Taxa alvo / recuo | 15 Hz / 8 Hz |
| `inference-loop` | p95 de latência que dispara recuo | 50 ms |
| `sign-features` | Dimensões do vetor | 63 (21 pontos × 3) |
| `sign-classifier` | k / rigor | 5 / 1.0 (multiplicador de τ_abs exposto na UI) |
| `sign-stabilizer` | Janela de votação | 400 ms (~6 quadros a 15 Hz) |
| `sign-stabilizer` | Permanência para confirmar | 700 ms |
| `sign-stabilizer` | Confiança mínima do KNN | 0.6 |
| `sign-model-store` | Amostras recomendadas / teto por classe | 20 / 60 |

---

## 4. Estado atual do código

### 4.1 Situação geral: **funcional e estável**

| Indicador | Resultado |
|---|---|
| Suíte de testes | **63/63 cenários passando** (`node tests/todos.mjs` → exit 0) |
| Integridade do vendor | **4/4 arquivos íntegros** |
| `TODO` / `FIXME` / stubs no código | **nenhum** encontrado em `src/`, `sidepanel/`, `background/`, `permission/`, `tools/` |
| Dependências vulneráveis | não aplicável — zero dependências |
| Documentação | `README.md` (13 KB) e `PRIVACY.md` (7 KB) completos e atualizados na 0.2.0 |

### 4.2 Cobertura de testes por módulo

| Arquivo de teste | Cenários |
|---|---:|
| `tests/sign-stabilizer.test.mjs` | 15 |
| `tests/sign-model-store.test.mjs` | 10 |
| `tests/sign-classifier.test.mjs` | 9 |
| `tests/inference-loop.test.mjs` | 8 |
| `tests/sign-features.test.mjs` | 8 |
| `tests/text-composer.test.mjs` | 7 |
| `tests/camera-controller.test.mjs` | 6 |
| **Total** | **63** |

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
  o que o código faz — presente em todos os 10 módulos de `src/`.
- **Injeção de dependência para testabilidade**: relógio injetado no `SignStabilizer` (`t` é
  argumento de `processar()`, nunca `performance.now()` lido internamente), `area` injetável no
  `SignModelStore`, `agora`/`agendarQuadro`/`cancelarQuadro` no `InferenceLoop`.
- **Versionamento de esquema**: `VERSAO_FEATURES` e `ESQUEMA` com recusa explícita de dados
  incompatíveis.
- **Nomenclatura em português** consistente em todo o código próprio.

---

## 5. Conformidade e privacidade (LGPD)

O `PRIVACY.md` está na versão 0.2.0 e mapeia cada dado tratado com finalidade, local de
armazenamento e retenção.

| Ponto | Situação |
|---|---|
| Quadros de vídeo | Nunca gravados nem transmitidos; memória do WASM, sobrescrita por quadro |
| Amostras de treino | **Vetores numéricos, não imagens** — geometria normalizada da mão. Ainda assim tratadas como **dado biométrico derivado** |
| Direito de eliminação (art. 18, VI) | Botão "Apagar modelo" — `sign-model-store` garante que não resta resíduo no storage (cenário de teste 9) |
| Direito de portabilidade (art. 18, V) | Export/import do modelo em JSON (~400 KB) com validação de esquema |
| Único ponto de saída de dados | O termo de busca, **apenas** ao clicar em "Pesquisar" |
| Permissões declaradas | `sidePanel`, `storage`, `search` — **sem `host_permissions`**, sem content scripts |
| Serviços externos de IA | Nenhum. Inferência 100% local por WebAssembly |

**Ponto de atenção para publicação:** Chrome Web Store e Edge Add-ons exigem justificativa de
uso da câmera e URL pública da política de privacidade. A justificativa a declarar já está
redigida no `README.md`.

---

## 6. Como rodar e verificar

```
node tests/todos.mjs                     # suíte completa — 63 cenários
node tools/verificar-vendor.mjs          # confere os SHA-256 dos binários
node tools/verificar-vendor.mjs --gerar  # regrava INTEGRIDADE.json
```

**Instalação em modo desenvolvedor:**

1. Chrome: `chrome://extensions` — Edge: `edge://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione a raiz do repositório
4. Clique no ícone do RVL Libras para abrir o painel

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
| **Projeto não está sob controle de versão Git** | Perda de histórico; impossível rastrear regressões | Nenhuma — recomenda-se `git init` e commit inicial |
| Ausência de matriz de confusão / avaliação formal | Não se sabe quais pares de configuração realmente colidem; hoje é suposição (O≡0, V≡2) | Previsto em `src/sign-eval.js` (ainda não implementado) |
| 20 MB de binários no repositório | Clone pesado; limite de tamanho das lojas | Decisão consciente — CDN é proibida pela CSP |
| Dependência de uma versão fixa do MediaPipe | Correções de segurança upstream exigem revendorização manual | `INTEGRIDADE.json` + `verificar-vendor.mjs` detectam divergência |
| Modelo treinado pelo usuário = variabilidade de acurácia | Usuário com treino ruim tem experiência ruim | Calibração automática de τ_abs; teto de 60 amostras por classe |
| Cobertura de 21/26 letras | Palavras com H, J, K, X, Z exigem edição manual | Limitação declarada na UI; text-box editável |

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
5. *(Sugestão deste resumo)* **Inicializar o repositório Git** antes de qualquer evolução — o
   projeto já tem `.gitignore` configurado, mas nenhum histórico.

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
