# Soletra

**Soletra** — porque é literalmente o que a extensão faz: soletra com as mãos, letra por letra.
O termo técnico é *datilologia*.

Extensão de navegador (Manifest V3, Chrome e Edge) que acessa a câmera do usuário, exibe o
vídeo em tempo real em um **painel lateral** e reconhece sinais estáticos do alfabeto manual
de Libras, compondo um texto que pode ser pesquisado no navegador.

Todo o processamento é **local**: os pontos da mão são extraídos por WebAssembly empacotado
dentro da extensão. Nenhum quadro de vídeo é gravado ou transmitido. A única informação que
sai do dispositivo é o texto que o usuário escolhe pesquisar, na plataforma que ele selecionar.

> Documentação completa do projeto — jornada do usuário, as 74 funcionalidades, algoritmos,
> decisões, testes, LGPD e limitações — em [DOCUMENTACAO-COMPLETA.md](DOCUMENTACAO-COMPLETA.md).

## Funcionalidades

| Recurso | Comportamento |
|---|---|
| Seleção de dispositivo | Dropdown alimentado por `enumerateDevices()`; trocar a câmera reabre o stream sem recarregar a extensão |
| Iniciar câmera | `getUserMedia()` com o `deviceId` selecionado (1280×720 ideais, `frameRate: { ideal: 60, max: 60 }`, sem áudio) |
| Taxa abaixo de 60 fps | `avaliarTaxaDeQuadros()` lê a taxa negociada em `track.getSettings()`; abaixo de 60 o painel avisa a taxa real e o efeito (vídeo menos fluido; abaixo dos 15 Hz da inferência, reconhecimento mais lento). Uma queda por pouca luz não aparece em `getSettings()` e não é detectada |
| Parar transmissão | `track.stop()` em todas as tracks e `srcObject = null` — o LED da câmera apaga |
| Recarregar | Reenumera dispositivos preservando o estado: só reabre o stream se a câmera estava ativa; se estava desligada, continua desligada (apenas limpa erro anterior) |
| Estado visual | Badge (Parada / Iniciando / Ativa / Erro), tag AO VIVO e resolução/fps no rodapé |
| Preferência | A última câmera escolhida é salva em `chrome.storage.local` |
| Área de reconhecimento | Só aparece com a câmera **ativa** — e, portanto, com a permissão já concedida. Some ao parar a câmera (ou em erro) e volta ao religar; uma captura de treino em andamento é cancelada, já que o botão de cancelar dela ficaria oculto. O texto reconhecido é preservado |

O vídeo é exibido espelhado (`scaleX(-1)`), como convém a quem sinaliza olhando para a própria imagem.
Numa câmera marcada como **Invertida** (ver "Mão dominante e câmeras invertidas"), que já entrega
a imagem espelhada, o `scaleX(-1)` é removido para o efeito de espelho se manter.

### Nomes reais dos dispositivos

O navegador só preenche `MediaDeviceInfo.label` depois que a origem obteve acesso à câmera ao
menos uma vez — antes disso `enumerateDevices()` devolve strings vazias e o dropdown não teria
como distinguir uma câmera da outra. Com a permissão **já concedida**, `ensureDeviceLabels()`
abre um `getUserMedia` relâmpago e encerra as tracks na mesma tacada, o que destrava os nomes
(`Iriun Webcam`, `Integrated Camera`, …) sem deixar a câmera ligada e sem disparar prompt.
Sem permissão, o priming é evitado e o painel exibe o aviso para autorizar o acesso.

## Reconhecimento de Libras

O usuário treina os sinais com a própria mão, na própria câmera, e o modelo fica no
dispositivo. Não há dataset externo, não há etapa de treino em Python, não há TensorFlow.js.

```
Câmera → MediaPipe HandLandmarker → 21 pontos (x,y,z)
       → normalização → vetor de 63 números
       → KNN sobre as amostras do usuário
       → estabilização temporal → caractere confirmado
       → text-box → Pesquisar → escolha da plataforma
```

O botão **Pesquisar** abre um seletor com seis destinos: uma grade com as cinco marcas, em
**ordem alfabética** (Amazon, Google, Maps, Wikipédia e YouTube), e, separado abaixo dela, o
buscador padrão do navegador. A ordem é aplicada em `MARCAS`, não no catálogo, para que uma
plataforma nova já entre no lugar certo. Nas cinco marcas o termo vai embutido na URL
de busca; no buscador padrão ele é entregue a `chrome.search.query`, porque só o navegador sabe
qual é esse buscador. Nada é enviado antes da escolha: fechar o seletor não dispara pesquisa nenhuma.
O catálogo fica em [src/search-targets.js](src/search-targets.js), com as URLs fixadas por
teste. O termo passa sempre por `encodeURIComponent`, e o rodapé do seletor lembra, em toda
pesquisa, que o texto vai apenas para a plataforma escolhida.

A navegação é executada pelo **service worker**, não pelo painel. Para o buscador padrão, a aba
é criada antes e passada por `tabId` a `chrome.search.query`: com `disposition`, o navegador
teria de inferir o destino a partir de quem chamou — e o painel lateral não é uma aba. Se
`chrome.search` falhar, a mesma aba cai para o Google, para o usuário não ficar com uma aba em
branco.

As logos ficam empacotadas em `icons/plataformas/` (~20 KB). Nenhuma imagem é carregada da
rede: a CSP do Manifest V3 a bloquearia, e a interface não pode depender de conexão para se
desenhar. Elas foram preparadas por `tools/preparar-logos.mjs`; o diretório `logos/` com as
imagens de origem não está mais no repositório, então a ferramenta fica como registro de
proveniência do que já está empacotado.

Três dos cinco arquivos de origem eram capturas de um preview de transparência — o quadriculado
estava **gravado nos pixels**, não era canal alfa (medido nas logos do Maps e da Amazon: 0% de
transparência). A ferramenta reconhece esse fundo pelo que ele é: um padrão que **alterna** em
células regulares. Um limiar de cor não serviria — a logo da Wikipédia é um globo branco sobre
xadrez branco-e-cinza-claro, e "todo pixel claro é fundo" a apagaria inteira.

O período e a fase saem das trocas de tom na primeira linha e na primeira coluna, com período
**fracionário e por eixo**: a logo da Amazon vem redimensionada, com células de 19,93 px em x e
20,08 px em y. Arredondar para 20 fazia o padrão previsto inverter na metade oposta da imagem
(86% de acerto no topo, 14% na base), e usar a média dos eixos derrubava o encaixe de 94,8% para
65,8%. Depois a ferramenta apara ao conteúdo, centraliza num quadrado e reduz para 96×96 com
alfa pré-multiplicado — de 167 KB de entrada para ~20 KB empacotados.

| Etapa | Onde | Decisão |
|---|---|---|
| Detecção dos pontos | `@mediapipe/tasks-vision` 1.0.1, delegate **CPU** | Medido no spike (Edge 153): CPU p50 22,9 ms contra 58,4 ms no GPU, que ainda paga readback de textura e exige um contexto WebGL num painel que o usuário recolhe |
| Normalização | [src/sign-features.js](src/sign-features.js) | Invariante a posição, escala e resolução; **preserva** rotação, que é parâmetro fonológico da língua |
| Classificação | [src/sign-classifier.js](src/sign-classifier.js) | KNN k=5 ponderado por 1/d, com limiar de distância constante (1,3) — possível porque a normalização dá escala física fixa ao espaço de 63 dimensões — e teste de razão frouxo (0,97) só para descartar empates |
| Confirmação | [src/sign-stabilizer.js](src/sign-stabilizer.js) | O sinal precisa persistir ~700 ms (ajustável entre 450 e 1000 ms); a mesma letra não repete enquanto a mão não sai dela |

### Cobertura

Reconhece as **21 letras de configuração estática** (A B C D E F G I L M N O P Q R S T U V W Y)
e os **10 dígitos**. **H, J, K, X e Z envolvem movimento** e ficam fora desta versão: um
classificador quadro-a-quadro não representa trajetória, e fingir que representa produziria
confusão sistemática em vez de erro honesto. A extensão avisa isso na interface, e a text-box
aceita edição manual para completá-las.

Letras e números compartilham configurações de mão (O≡0, V≡2, W≡3), por isso os dois conjuntos
nunca são classificados juntos — um seletor no painel alterna entre eles.

### Como digitar letra dupla

Formar o sinal, **relaxar a mão por meio segundo**, formar de novo. Ao relaxar, o vetor sai da
vizinhança de toda classe e o classificador rejeita — é essa rejeição que destrava a repetição.
Sem ela, "PASSO" sairia "PASO". Há também um botão "Repetir letra" como via de escape acessível.

Trocar de letra não exige pausa: a troca é inequívoca e confirma direto.

### Treino

Em "Treinar sinais", escolha a mão dominante, clique numa classe e mantenha o sinal com a mão
parada — a extensão grava uma amostra a cada 150 ms até completar 20 (teto de 100 por classe; ao chegar nele o painel avisa e marca a classe como cheia).

Cada letra e número da grade mostra a **porcentagem do seu espaço já ocupada** (amostras ÷ 100),
em texto e numa barra na base do botão. Abaixo da grade fica o **uso total do armazenamento
local** — "Armazenamento: 0,85 MB de 10 MB (9%)" —, medido por `getBytesInUse` sempre que o
modelo muda; a partir de 80% da quota a linha fica laranja e sugere exportar e apagar classes.
Ao fim, o limiar de rejeição é recalibrado automaticamente: parte da constante de 1,3 raio de
palma e só sobe se as amostras do usuário forem mais dispersas que o previsto.

Cada classe treinada tem um **×** para apagar só as amostras dela, com recalibração do limiar
em seguida — uma letra que saiu ruim não custa o modelo inteiro. **Apagar tudo** fica separado dos demais botões, e toda ação destrutiva
passa por um modal de confirmação com o foco inicial no "Não". "Ajustar sensibilidade" expõe o
rigor do classificador (multiplicador do limiar: Tolerante, Normal, Exigente) e o tempo para
confirmar uma letra (Rápido 450 ms, Normal 700 ms, Calmo 1000 ms).

### Mão dominante e câmeras invertidas

As features espelham a mão esquerda, então um sinal feito com a mão **não configurada** chega
espelhado ao classificador e pode virar outra letra com confiança alta. Por isso a mão
diferente da configurada **bloqueia a tradução** e a captura de treino (`src/trava-mao.js`): o
anel fica vermelho com "!" e o aviso oferece "Usar a mão …" ou "A câmera inverte a imagem". O
handedness do MediaPipe oscila quadro a quadro, então a trava tem histerese — 5 quadros
seguidos com a mão errada para travar, 3 com a certa para soltar — e ignora quadros com score
abaixo de 0,8.

Webcams virtuais (Iriun, OBS, DroidCam) às vezes espelham a imagem na origem, e não há API que
diga isso. Em "Treinar sinais", **Imagem desta câmera: Normal / Invertida** registra a inversão
**por `deviceId`**; numa câmera invertida, o `SignRecognizer` troca o handedness antes da trava
e passa à normalização a mão como ela aparece no quadro, mantendo as amostras compatíveis com o
modelo pronto. Amostras pessoais gravadas numa câmera invertida antes da marcação ficaram com os
lados trocados e podem precisar ser regravadas.

O modelo pode ser **exportado e importado** em JSON — ~430 KB com as 21 letras e ~640 KB com
letras e números, a 20 amostras por classe: treine uma vez e distribua o
arquivo junto com a extensão. A importação aceita também os arquivos exportados quando o
produto se chamava RVL Libras (formato `rvl-libras-modelo`), e as chaves antigas do storage são
migradas na primeira abertura. Isso também atende os direitos de portabilidade e eliminação
previstos na LGPD — ver [PRIVACY.md](PRIVACY.md).

### Modelo pronto

Quando a extensão traz `modelos/padrao.json`, a primeira abertura oferece **Usar modelo pronto**
ou **Treinar do zero**. Sem o arquivo, nada muda: o painel funciona só com treino próprio.

As amostras do padrão ficam em chaves separadas das pessoais (`soletra.modelo.v1.padrao.*`), e
o classificador usa as duas juntas. Clicar numa classe que veio do padrão **reforça** a letra
com a mão do usuário, e o selo mostra `padrão+suas` (ex.: `50+8`). O padrão entra com até 50 amostras por classe, deixando 50 lugares livres para o reforço. No teto de 100, sai primeiro a
amostra padrão mais antiga, então o modelo vai convergindo para a mão de quem usa. O **×** numa
classe reforçada descarta só o treino pessoal e volta ao padrão. **Restaurar modelo pronto**
repõe o padrão sem apagar o treino pessoal. Um modelo gravado antes disto é lido sem migração,
com todas as amostras contadas como pessoais.

O padrão é montado a partir dos exports de várias pessoas, com amostragem balanceada para que
ninguém domine uma classe:

```
node tools/montar-modelo-padrao.mjs pessoa1.json pessoa2.json pessoa3.json
node tools/montar-modelo-padrao.mjs --por-classe 50 --saida modelos/padrao.json *.json
```

Com menos de 3 pessoas, ou com uma classe gravada por uma pessoa só, a ferramenta avisa: um
padrão de uma mão só reconhece bem apenas essa mão. Como as features espelham a mão esquerda,
exports das duas mãos podem ser misturados.

## MediaPipe vendorizado e a CSP do Manifest V3

O Manifest V3 proíbe `'unsafe-eval'`, e é comum ler que isso impede usar MediaPipe em
extensões. Essa limitação vale para o pacote **legado** (`@mediapipe/hands`, `holistic`), cujo
glue Emscripten gerava funções com `new Function()`. O pacote atual, `@mediapipe/tasks-vision`,
não tem nenhuma ocorrência de `new Function` nem de `eval(` — o `createNamedFunction` foi
reescrito com `Object.defineProperty`. Basta declarar:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
}
```

Sem declarar, o WebAssembly é bloqueado; declarando qualquer coisa além disso, o Chrome recusa
a instalação.

Os ~20 MB de binários ficam em `vendor/mediapipe/`, **commitados no repositório** — CDN é
proibido pela CSP e conta como "código remoto" na revisão das lojas. A versão é fixada em
`@1.0.1` de propósito: `@latest` publica builds `rc.<data>` diários.

```
node tools/verificar-vendor.mjs          confere os SHA-256
node tools/verificar-vendor.mjs --gerar  regrava INTEGRIDADE.json
```

O `.gitattributes` marca `vendor/**` (e `modelos/*.json`) como `-text`. Sem isso, o Git do
Windows (`core.autocrlf=true`) converte as quebras de linha de `vision_bundle.mjs` e
`vision_wasm_internal.js` ao clonar, e o hash deixa de bater com o conteúdo intacto. O
verificador reconhece esse caso: quando o arquivo só difere em CRLF, ele o marca como `CRLF` em
vez de `DIVERGE` e indica a correção para um clone antigo:

```
git rm --cached -r -q vendor && git checkout HEAD -- vendor
```

O `FilesetResolver` não é usado: o `WasmFileset` é montado à mão, o que evita a sonda SIMD em
runtime (que apontaria para um par `_nosimd_` deliberadamente não vendorizado).

### Diagnóstico

`spike/spike.html`, aberta como página da extensão, mede latência por delegate separando
quadros com e sem mão rastreada — os dois são regimes de custo diferentes, porque sem
rastreamento o MediaPipe roda o detector de palma a cada quadro.

## Testes

```
node tests/todos.mjs
```

104 cenários, em Node puro, sem framework e sem dependências. Os módulos de lógica são todos
funções puras ou classes com relógio injetado; o único arquivo que depende de WASM
(`src/hand-landmarker.js`) é fino de propósito e validado pelo diagnóstico acima.

Cenários que merecem destaque por travarem bugs silenciosos:

- **Invariância a resolução** — a mesma mão em 640×480 e 1280×720 precisa gerar vetores
  idênticos. Falha se a correção de *aspect ratio* for esquecida, e o sintoma seria um modelo
  que para de funcionar ao trocar de webcam, sem erro nenhum.
- **Letra dupla** — S por 800 ms, pausa de 250 ms, S por 800 ms deve produzir `['S','S']`;
  com pausa de 100 ms, apenas `['S']`.
- **Timestamp monotônico** — trocar de câmera reinicia o `mediaTime`, e um timestamp que
  regride faz o MediaPipe devolver resultado vazio em silêncio.
- **Versão de normalização** — um modelo gravado com outra `VERSAO_FEATURES` é recusado, não
  reinterpretado: reinterpretar não daria erro, daria queda de acurácia sem causa aparente.
- **URL de busca com caractere reservado** — a text-box aceita edição manual, então um `&` ou
  `#` digitado ali é entrada de usuário: precisa ficar contido no parâmetro, sem injetar nada
  na URL do terceiro.
- **Migração de storage** — renomear as chaves `rvl.*` sem migrá-las não daria erro: o modelo
  continuaria no disco sob nomes que ninguém lê. A migração é idempotente e nunca sobrescreve
  dado novo com resíduo antigo.
- **Trava de mão** — um quadro de handedness errado isolado não pode bloquear a tradução, e um
  quadro de baixa confiança no meio de uma sequência errada não pode adiar a trava.

## Por que painel lateral e não popup

O popup de extensão fecha ao perder o foco, o que destrói o documento e encerra o `MediaStream`.
Para manter a câmera visível enquanto o usuário navega, a interface usa `chrome.sidePanel`
(Chrome/Edge 114+). O clique no ícone abre o painel; se a API não estiver disponível, o
service worker cai para abrir `sidepanel/panel.html` em uma aba dedicada.

### Tela cheia, painel e fechar

No topo ficam os três botões no estilo do macOS. O **verde** abre a mesma página numa aba da
janela atual, ocupando o navegador inteiro (`panel.html?modo=aba`), sem criar janela nova; se já
houver uma aba do Soletra, ela é reaproveitada. Na aba, o verde alterna a tela cheia de verdade
(Fullscreen API; Esc também sai). O **amarelo** minimiza de volta ao painel lateral, que é o estado
normal; no painel ele só avisa que já está minimizado. O **vermelho** fecha. Na troca, a página que sai solta a câmera antes de abrir a outra, porque
muitas webcams só aceitam um acesso por vez, e a câmera e o reconhecimento são religados do
outro lado (`storage.session`). Voltar ao painel usa `chrome.sidePanel.open`, do Chrome 116+.

## Instalação em modo desenvolvedor

1. Chrome: `chrome://extensions` — Edge: `edge://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** e selecione a raiz deste repositório
4. Clique no ícone do Soletra na barra de ferramentas para abrir o painel

Depois de alterar o código, clique em ↻ no cartão da extensão em `chrome://extensions` e reabra
o painel.

### Vídeo com atraso ou travando

Se a imagem da câmera chega atrasada ou o painel não responde com fluidez, a primeira coisa a
testar é **desativar a aceleração de hardware** do navegador (`chrome://settings/system` →
"Usar aceleração gráfica quando disponível" → reiniciar). Na prática foi o que resolveu o
atraso com webcam virtual. Com câmeras de celular como o **Iriun Webcam**, a conexão por cabo
USB também tem menos latência que o Wi-Fi.

## Fluxo de permissão de câmera

Extensões não têm uma permissão `"camera"` no manifesto: o acesso passa pelo `getUserMedia()`
na página da extensão e pelo prompt do navegador. O diálogo nativo **não é exibido dentro do
painel lateral**, então a extensão encaminha o usuário para `permission/request.html`, aberta
em aba de topo. Concedida ali, a permissão vale para toda a origem `chrome-extension://<id>`
e o painel passa a abrir o stream diretamente (e a ver os rótulos dos dispositivos).

Se a permissão foi negada uma vez, é preciso removê-la em
`chrome://settings/content/camera` → entrada `chrome-extension://<id>`.

## Erros tratados

| Exceção do `getUserMedia` | Mensagem ao usuário |
|---|---|
| `NotAllowedError` | Permissão negada — oferece o botão de autorização |
| `NotFoundError` | Nenhuma câmera encontrada |
| `NotReadableError` | Câmera em uso por outro aplicativo ou aba |
| `OverconstrainedError` | Dispositivo selecionado indisponível |
| `AbortError` / `SecurityError` | Captura interrompida pelo SO / contexto inseguro |

Além disso: `devicechange` detecta câmeras conectadas e removidas, e `track.onended` captura
a desconexão física do dispositivo em uso durante a transmissão.

## Estrutura

```
manifest.json                 MV3, permissões sidePanel + storage + search, CSP com wasm-unsafe-eval
background/service-worker.js  abre o painel lateral no clique do ícone (fallback: aba) e executa a pesquisa
permission/request.html|js    aba de topo para o prompt nativo de câmera

sidepanel/panel.html|css|js   interface principal
sidepanel/recognition-view.js UI do reconhecimento (anel de progresso, text-box, busca)
sidepanel/training-view.js    UI do treino (grade com % de uso por classe, uso do armazenamento, modelo pronto, exportar/importar/apagar)
sidepanel/dialogo.js          modal de confirmação (window.confirm não é confiável no painel)
sidepanel/janela.js           botões de janela (fechar, voltar ao painel, tela cheia)
icons/plataformas/            logos das plataformas de busca, empacotadas
sidepanel/seletor-plataforma.js  modal de escolha do destino da pesquisa

src/camera-controller.js      ciclo de vida do MediaStream, restrições de captura (1280×720 / até 60 fps) e avaliação da taxa
src/sign-recognizer.js        orquestrador; expõe um onStateChange, como o CameraController
src/hand-landmarker.js        adaptador do MediaPipe (único módulo dependente de WASM)
src/inference-loop.js         agendador rVFC, throttle adaptativo, timestamp monotônico
src/sign-features.js          landmarks → 63 números; tem VERSAO_FEATURES
src/sign-classifier.js        KNN ponderado, rejeição, calibração de limiar
src/sign-stabilizer.js        máquina de confirmação e trava anti-repetição
src/trava-mao.js              trava de mão diferente da configurada, com histerese
src/sign-classes.js           catálogo de classes estáticas, dinâmicas e números
src/sign-model-store.js       persistência, quota, export/import com validação de esquema
src/text-composer.js          composição do texto e normalização para a busca
src/migracao-storage.js       migra as chaves de storage do nome antigo (RVL Libras)
src/search-targets.js         catálogo de plataformas de busca e montagem das URLs

vendor/mediapipe/             tasks-vision 1.0.1 + hand_landmarker.task + INTEGRIDADE.json
modelos/padrao.json           modelo pronto (opcional), gerado por tools/montar-modelo-padrao.mjs
tools/montar-modelo-padrao.mjs  junta exports de várias pessoas no modelo pronto, balanceado por pessoa
tools/verificar-vendor.mjs    confere os SHA-256 dos binários vendorizados e diagnostica CRLF
.gitattributes                impede o Git de converter as quebras de linha dos binários
tools/png.mjs                 ler, escrever e redimensionar PNG, sem dependências
tools/make-icons.mjs          gera os ícones da extensão a partir de icons/soletra-logo.png
tools/preparar-logos.mjs      limpa, apara e reduz as logos para icons/plataformas/ (origem fora do repo)
icons/soletra-logo.png        arte da marca; origem dos ícones da extensão
spike/spike.html|js           diagnóstico de CSP e latência (não faz parte do fluxo)
tests/todos.mjs               roda a suíte inteira
```

## Publicação nas lojas

Chrome Web Store e Edge Add-ons exigem justificativa de uso da câmera e URL de política de
privacidade. Ver [PRIVACY.md](PRIVACY.md) — a justificativa a declarar é:
*"A extensão exibe a imagem da câmera do próprio usuário na interface, localmente, sem
gravação nem transmissão."*

## Próximos passos

- **Letras dinâmicas (H, J, K, X, Z e o Ç)** — exigem um segundo pipeline com componente
  temporal: buffer de landmarks e classificador de sequência, com dataset próprio.
- **Matriz de confusão e avaliação leave-one-out** (`src/sign-eval.js`) — para medir quais
  pares de configurações realmente colidem, em vez de supor que são só O≡0 e V≡2.
- **Ablação da normalização** — rotação ligada versus desligada, peso do eixo z, e o efeito de
  acrescentar as distâncias ponta-de-dedo→punho ao vetor (`VERSAO_FEATURES` 2).
- Captura em segundo plano via `offscreen` document, para manter o modelo quente entre
  aberturas do painel.

## Sobre o repositório de referência

O projeto [WellingtonDev25/leitor_libras](https://github.com/WellingtonDev25/leitor_libras) foi
avaliado como base e **descartado**. É um script Python de 56 linhas com um modelo Teachable
Machine que classifica **pixels 224×224** — o MediaPipe ali serve apenas para recortar a
*bounding box* da mão, e os landmarks nunca chegam ao classificador. Reconhece **5 classes**
(`['A','B','C','D','E']`), não inclui dataset nem script de treino, não tem mecanismo de
estabilização e **não declara licença**, o que reservaria todos os direitos ao autor.

A abordagem adotada aqui — classificar sobre landmarks em vez de pixels — é também
tecnicamente superior: modelo de KB em vez de MB, e robustez a fundo, iluminação e tom de pele.
