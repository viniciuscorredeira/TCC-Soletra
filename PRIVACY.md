# Política de Privacidade — RVL Libras

**Versão 0.2.0 — última atualização: 15/09/2026**

## Resumo

O RVL Libras exibe a imagem da câmera do usuário no painel lateral e, quando o usuário ativa o
reconhecimento, calcula **no próprio dispositivo** 21 pontos de referência da mão para
identificar sinais do alfabeto manual de Libras e compor um texto.

**Nenhum quadro de vídeo é gravado, armazenado ou transmitido.** Nenhuma imagem é enviada a
servidores, à Integrativa ou a serviços externos de IA. O modelo de reconhecimento é executado
localmente, por WebAssembly empacotado dentro da extensão — não há download de código em tempo
de execução nem chamada a CDN.

**A única informação que sai do dispositivo é o texto que o usuário escolhe pesquisar**, ao
clicar no botão "Pesquisar" — e apenas nesse momento. Veja "Compartilhamento com terceiros".

## Dados tratados

| Dado | Finalidade | Onde fica | Retenção |
|---|---|---|---|
| Stream de vídeo da câmera | Exibição em tempo real e extração dos pontos da mão | Memória do navegador (`MediaStream` ligado ao `<video>`) | Enquanto a transmissão estiver ativa; descartado no "Parar" ou ao fechar o painel |
| Acesso momentâneo à câmera para ler os nomes dos dispositivos | Exibir no dropdown o nome real da câmera, exigência técnica do navegador | Nenhum quadro é lido ou guardado — a track é encerrada imediatamente | Instantâneo |
| **Quadros de vídeo lidos pelo WebAssembly** | Detectar os 21 pontos de referência da mão | Memória do módulo WASM, no dispositivo | Por quadro; sobrescrito na inferência seguinte, nunca gravado |
| **Vetor de 63 números (21 pontos normalizados)** | Classificar a configuração de mão | Memória; janela de votação de ~400 ms | Descartado a cada quadro |
| **Amostras de treino gravadas pelo usuário** | Modelo KNN pessoal de reconhecimento | `chrome.storage.local`, no perfil do navegador | Até o usuário apagar o modelo ou desinstalar a extensão |
| **Texto composto** | Montar a palavra ou frase | `chrome.storage.session` | Até fechar o navegador |
| **Termo enviado ao buscador** | Abrir a pesquisa solicitada | **Sai do dispositivo** — vai ao mecanismo de busca padrão do usuário | Fora do controle da extensão |
| Preferências (`deviceId`, mão dominante, tempo de confirmação, rigor) | Restaurar a configuração do usuário | `chrome.storage.local` | Até a desinstalação |

As amostras de treino são **vetores numéricos, não imagens**: o que fica gravado é a geometria
normalizada da mão, não a fotografia dela. Ainda assim, veja o enquadramento legal abaixo.

Não há coleta de dados de navegação, histórico, credenciais, localização ou áudio. A extensão
não declara `host_permissions` e não executa content scripts em páginas visitadas.

## Compartilhamento com terceiros

**Até a versão 0.1.0 não havia nenhum.** A partir da 0.2.0 há exatamente um ponto de saída:

Ao clicar em **"Pesquisar"**, o texto composto é enviado ao **mecanismo de busca padrão do
navegador** (Google, Bing, DuckDuckGo — o que o usuário tiver configurado), por meio da API
`chrome.search`. Esse mecanismo é um serviço de terceiro, com política de privacidade própria,
fora do controle da Integrativa.

Salvaguardas implementadas no código, não apenas neste documento:

1. A pesquisa **só é iniciada por clique explícito**. Não há disparo automático ao confirmar um
   caractere, ao detectar pausa ou por qualquer outra heurística.
2. Na primeira vez, a extensão exibe um aviso informando que o texto será enviado a um serviço
   de terceiro, e pede confirmação.
3. A pesquisa abre em **nova aba**, para que o usuário veja para onde o texto foi.
4. Se o buscador padrão não puder ser acionado, a extensão recorre à busca do Google
   e **avisa** o usuário de que isso aconteceu.

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
| Botão **"Apagar modelo"**, que remove todas as amostras do dispositivo | "Treinar sinais" | art. 18, VI (eliminação) |
| Botão **"Exportar modelo"**, que entrega as amostras em JSON legível | "Treinar sinais" | art. 18, V (portabilidade) |
| Aviso de envio a terceiro antes da primeira pesquisa | Diálogo no painel lateral | transparência (art. 6º, VI) |
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
| `search` | Abrir uma pesquisa com o texto composto, **somente** mediante clique explícito |
| Câmera (via `getUserMedia`, não declarada no manifesto) | Capturar a imagem para exibição e extração local dos pontos da mão |

A extensão **não utiliza código remoto**: todo o WebAssembly e o modelo de detecção de mãos
estão empacotados no pacote da extensão e têm integridade verificável
(`node tools/verificar-vendor.mjs`).

## Contato

Integrativa Tecnologia e Gestão de Negócios Ltda. — projetos@integrativa.com.br
