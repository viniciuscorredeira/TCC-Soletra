# Política de Privacidade — Soletra

**Versão 0.3.0 — última atualização: 26/10/2026**

## Resumo

O Soletra exibe a imagem da câmera do usuário no painel lateral e, quando o usuário ativa o
reconhecimento, calcula **no próprio dispositivo** 21 pontos de referência da mão para
identificar sinais do alfabeto manual de Libras e compor um texto.

**Nenhum quadro de vídeo é gravado, armazenado ou transmitido.** Nenhuma imagem é enviada a
servidores, à Integrativa ou a serviços externos de IA. O modelo de reconhecimento é executado
localmente, por WebAssembly empacotado dentro da extensão — não há download de código em tempo
de execução nem chamada a CDN.

**A única informação que sai do dispositivo é o texto que o usuário escolhe pesquisar**, depois
de clicar em "Pesquisar" e escolher a plataforma — e apenas nesse momento. Veja "Compartilhamento com terceiros".

## Dados tratados

| Dado | Finalidade | Onde fica | Retenção |
|---|---|---|---|
| Stream de vídeo da câmera | Exibição em tempo real e extração dos pontos da mão | Memória do navegador (`MediaStream` ligado ao `<video>`) | Enquanto a transmissão estiver ativa; descartado no "Parar" ou ao fechar o painel |
| Acesso momentâneo à câmera para ler os nomes dos dispositivos | Exibir no dropdown o nome real da câmera, exigência técnica do navegador | Nenhum quadro é lido ou guardado — a track é encerrada imediatamente | Instantâneo |
| **Quadros de vídeo lidos pelo WebAssembly** | Detectar os 21 pontos de referência da mão | Memória do módulo WASM, no dispositivo | Por quadro; sobrescrito na inferência seguinte, nunca gravado |
| **Vetor de 63 números (21 pontos normalizados)** | Classificar a configuração de mão | Memória; janela de votação de ~400 ms | Descartado a cada quadro |
| **Amostras de treino gravadas pelo usuário** | Modelo KNN pessoal de reconhecimento | `chrome.storage.local`, no perfil do navegador | Até o usuário apagar o modelo ou desinstalar a extensão |
| **Amostras do modelo pronto** (não são dados do usuário: vêm prontas na extensão) | Reconhecer sem treino próprio | Empacotadas na extensão (`modelos/padrao.json`); copiadas para `chrome.storage.local` na instalação, ou quando o usuário as restaura | Até o usuário apagar o modelo ou desinstalar a extensão |
| **Texto composto** | Montar a palavra ou frase | `chrome.storage.session` | Até fechar o navegador |
| **Termo enviado à plataforma escolhida** | Abrir a pesquisa solicitada | **Sai do dispositivo** — vai à plataforma que o usuário selecionou | Fora do controle da extensão |
| Preferências (`deviceId`, mão dominante, conjunto Letras/Números, tempo de confirmação, rigor, `deviceId` das câmeras marcadas como de imagem invertida, tema Sistema/Claro/Escuro, aviso de que a escolha entre o modelo pronto e o treino do zero ainda não foi feita) | Restaurar a configuração do usuário | `chrome.storage.local`; o tema também em `localStorage`, para a página abrir sem piscar no tema errado | Até a desinstalação |
| Registro do consentimento (data e versão do aceite) | Comprovar o consentimento antes de ativar o reconhecimento | `chrome.storage.local` | Até a desinstalação |

As amostras de treino são **vetores numéricos, não imagens**: o que fica gravado é a geometria
normalizada da mão, não a fotografia dela. Ainda assim, veja o enquadramento legal abaixo.

O reconhecimento e o treino só ficam disponíveis com a câmera **ligada**: a área some quando a
câmera é parada. Em "Treinar sinais", o painel mostra quanto espaço cada letra ou número ocupa
e o uso total do armazenamento local, para o usuário saber o que está guardado no dispositivo.

O modelo pronto contém amostras de **voluntários**, não do usuário. Elas vêm dentro do pacote da
extensão e não são baixadas de lugar nenhum. Escolher usá-lo não envia nada do dispositivo. Os
voluntários consentiram com a distribuição das suas amostras, que não trazem nome nem qualquer
identificador: cada arquivo de origem só é identificado pela ordem em que foi juntado.

Não há coleta de dados de navegação, histórico, credenciais, localização ou áudio. A extensão
não declara `host_permissions` e não executa content scripts em páginas visitadas.

## Compartilhamento com terceiros

**Até a versão 0.1.0 não havia nenhum.** A partir da 0.2.0 há exatamente um ponto de saída:

Ao clicar em **"Pesquisar"**, a extensão abre um seletor e **não envia nada até que o usuário
escolha o destino**. Os destinos possíveis, na ordem em que aparecem (marcas em ordem
alfabética e, separado delas, o buscador padrão), são:

| Plataforma | Endereço |
|---|---|
| Amazon | `amazon.com.br/s` |
| Google | `google.com/search` |
| Google Maps | `google.com/maps/search` |
| Wikipédia | `pt.wikipedia.org` |
| YouTube | `youtube.com/results` |
| Buscador padrão do navegador | definido pelo usuário nas configurações do navegador (`chrome.search`) |

Cada uma é um serviço de terceiro, com política de privacidade própria, fora do controle da
Integrativa.

Salvaguardas implementadas no código, não apenas neste documento:

1. A pesquisa **só é iniciada por clique explícito**. Não há disparo automático ao confirmar um
   caractere, ao detectar pausa ou por qualquer outra heurística.
2. **O destino é sempre escolhido pelo usuário**, no momento da pesquisa. Fechar o seletor pelo
   ×, pelo Cancelar, pela tecla Esc ou clicando fora **não envia nada**.
3. O seletor exibe **o termo que será enviado** e mantém visível, em todas as pesquisas, a
   informação de que o texto sai do dispositivo apenas para a plataforma escolhida. Isso
   substitui o aviso único da versão anterior: a informação passa a aparecer no momento exato
   da decisão, e não uma única vez na estreia.
4. A pesquisa abre em **nova aba**, para que o usuário veja para onde o texto foi.
5. Se o buscador padrão não puder ser acionado, a extensão recorre à busca do Google e
   **avisa** o usuário de que isso aconteceu.

Nenhum quadro de vídeo, nenhuma imagem e nenhum vetor de pontos é transmitido — nem ao
buscador, nem a qualquer outro destino.

## Base para tratamento (LGPD — Lei 13.709/2018)

A imagem de uma pessoa é **dado pessoal**. Os pontos de referência da mão constituem **dado
biométrico derivado**: geometria de mão é uma modalidade biométrica reconhecida, e por
precaução o modelo de treino armazenado é tratado aqui como **dado pessoal sensível**
(art. 5º, II).

**Não há tratamento por parte do fornecedor.** Todo o processamento — leitura dos quadros,
extração dos pontos, classificação e armazenamento das amostras — ocorre no dispositivo do
titular, sob controle exclusivo dele. A Integrativa não recebe, não armazena, não acessa e não
tem meio técnico de acessar esses dados. A extensão não possui servidor, backend ou telemetria.

Medidas adotadas, correspondentes aos direitos do titular:

| Medida | Onde está | Base |
|---|---|---|
| Consentimento específico e destacado antes da primeira ativação do reconhecimento, com data do aceite registrada | Diálogo no painel lateral | art. 7º, I e art. 11, I |
| Botão **"Apagar tudo"**, que remove todas as amostras do dispositivo (inclusive as do modelo pronto), e **×** em cada classe, que remove só as amostras dela | "Treinar sinais" | art. 18, VI (eliminação) |
| Botão **"Exportar"**, que entrega as amostras em JSON legível | "Treinar sinais" | art. 18, V (portabilidade) |
| Escolha explícita do destino a cada pesquisa, com o termo à vista e aviso permanente de saída do dispositivo | Seletor de plataforma no painel lateral | transparência (art. 6º, VI) |
| Processamento local como padrão arquitetural, sem alternativa remota | Toda a extensão | necessidade (art. 6º, III) |
| Revogação a qualquer momento | Permissão de câmera nas configurações do navegador; desinstalação | art. 8º, § 5º |

**Relatório de Impacto (RIPD):** não exigível neste caso. Não há tratamento em escala pelo
controlador — não existe base de dados centralizada, não há transferência ao fornecedor e o
titular é o único detentor e operador dos próprios dados. O raciocínio fica registrado aqui em
vez de omitido, por transparência.

Este documento não substitui parecer jurídico formal. O texto deve ser revisado por quem
responde juridicamente pela publicação antes da submissão às lojas.

## Direitos do titular

Como não há dados do lado do fornecedor, o titular exerce o controle diretamente, dentro da
própria extensão: exportar o modelo, apagar o modelo, revogar a permissão de câmera nas
configurações do navegador e desinstalar a extensão — o que remove todo o conteúdo de
`chrome.storage.local`.

## Permissões declaradas e por quê

| Permissão | Motivo |
|---|---|
| `sidePanel` | Exibir a interface no painel lateral, que mantém a câmera visível durante a navegação |
| `storage` | Guardar as amostras de treino do usuário e suas preferências, localmente |
| `search` | Abrir a pesquisa no mecanismo padrão do navegador quando o usuário escolhe essa opção no seletor |
| Câmera (via `getUserMedia`, não declarada no manifesto) | Capturar a imagem para exibição e extração local dos pontos da mão |

A extensão **não utiliza código remoto**: todo o WebAssembly e o modelo de detecção de mãos
estão empacotados no pacote da extensão e têm integridade verificável
(`node tools/verificar-vendor.mjs`).

## Contato

Integrativa Tecnologia e Gestão de Negócios Ltda. — projetos@integrativa.com.br
