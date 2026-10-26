# Soletra — Documentação do Projeto

**Documento atualizado em:** 22/10/2026
**Versão do projeto:** 0.3.0 (`manifest.json`)
**Repositório:** `github.com/viniciuscorredeira/TCC-Soletra`
**Natureza:** Trabalho de Conclusão de Curso — extensão de navegador para reconhecimento do
alfabeto manual de Libras
**Versão integral:** [DOCUMENTACAO-COMPLETA.md](DOCUMENTACAO-COMPLETA.md) traz, além deste
resumo, a jornada do usuário, o mapa da interface, os algoritmos em detalhe, o registro de
decisões, a solução de problemas e um glossário.

---

## Sumário

1. Visão geral
2. Escopo
3. Requisitos funcionais atendidos
4. Requisitos não funcionais atendidos
5. Pontos não atendidos e limitações conhecidas
6. Arquitetura
7. Tecnologias e decisões técnicas
8. Qualidade e testes
9. Privacidade e LGPD
10. Como executar e verificar
11. Trabalhos futuros
12. Histórico de alterações
13. Repositório de referência avaliado

---

## 1. Visão geral

### 1.1 Problema

Pessoas que se comunicam em Libras dependem de digitação em teclado para pesquisar na web. O
alfabeto manual (datilologia) é a forma de soletrar em Libras palavras sem sinal próprio, como
nomes, marcas e termos técnicos. O Soletra transforma essa soletração, feita diante da câmera,
em texto pesquisável.

### 1.2 Objetivo

Desenvolver uma extensão de navegador (Chrome e Edge, Manifest V3) que:

1. acessa a câmera do usuário e exibe o vídeo num **painel lateral**;
2. reconhece as **configurações de mão estáticas** do alfabeto manual de Libras e os dígitos;
3. compõe, letra por letra, um texto editável;
4. pesquisa esse texto na plataforma que o usuário escolher.

### 1.3 Premissas

- **Processamento 100% local.** Os pontos da mão são extraídos por WebAssembly empacotado na
  extensão. Nenhum quadro de vídeo é gravado ou transmitido.
- **Único dado que sai do dispositivo:** o texto que o usuário escolhe pesquisar, e só para a
  plataforma selecionada.
- **Sem dependências externas:** nenhum servidor, CDN ou API de IA. As bibliotecas da interface
  (React e Radix UI) são empacotadas no build, dentro da extensão.

### 1.4 Diferencial técnico

A classificação é feita sobre **landmarks** (a geometria da mão: 21 pontos 3D) e não sobre
**pixels**. Isso traz:

- modelo de centenas de KB em vez de dezenas de MB;
- robustez a fundo, iluminação e tom de pele, porque a cor não chega ao classificador;
- treino feito pelo próprio usuário no navegador, em segundos, sem dataset externo, sem etapa
  em Python e sem TensorFlow.js;
- um **modelo pronto** empacotado, para quem não quer treinar antes de usar.

---

## 2. Escopo

| Dentro do escopo | Fora do escopo desta versão |
|---|---|
| 21 letras estáticas: A B C D E F G I L M N O P Q R S T U V W Y | Letras com movimento: H, J, K, X, Z e Ç |
| 10 dígitos: 0–9 | Sinais de palavras e frases da Libras (a língua em si, além da datilologia) |
| Uma mão por vez, direita ou esquerda | Sinais com as duas mãos |
| Chrome e Edge 114+ no computador | Firefox, Safari e navegadores móveis |
| Pesquisa em 5 plataformas + buscador padrão | Envio do texto para outros aplicativos ou campos de páginas |
| Interface em português do Brasil | Outros idiomas |

As limitações estão detalhadas, com justificativa, na seção 5.

---

## 3. Requisitos funcionais atendidos

Cada funcionalidade é descrita como um cenário: **o que o usuário faz**, **como o sistema
responde** e **quais alertas ou exceções** podem ocorrer. Os textos entre aspas são as mensagens
exibidas na interface.

Legenda: ✅ atendido · ⚠️ atendido com ressalva (detalhada na seção 5)

### 3.1 Câmera

#### RF01 — Lista de câmeras ✅

- **Usuário:** abre o painel do Soletra.
- **Sistema:** procura as câmeras conectadas ao computador e as lista no campo **Dispositivo**.
- **Exceções:** sem nenhuma câmera, o campo mostra "Nenhuma câmera detectada" e fica bloqueado,
  o botão **Iniciar câmera** é desabilitado e aparece o aviso "Nenhuma câmera encontrada. Conecte
  um dispositivo e clique em Recarregar."

#### RF02 — Nome real de cada câmera ✅

- **Usuário:** abre a lista **Dispositivo**.
- **Sistema:** mostra o nome de cada câmera (ex.: "Iriun Webcam", "Integrated Camera"). Como o
  navegador só revela os nomes depois que a extensão obteve acesso à câmera, o sistema, quando a
  permissão já existe, abre a câmera por um instante e a fecha em seguida, apenas para ler os
  nomes.
- **Exceções:** sem permissão, as câmeras aparecem como "Câmera 1 (nome indisponível)", com o
  aviso "Autorize o acesso à câmera para ver os nomes dos dispositivos." e o botão **Conceder
  acesso à câmera**.

#### RF03 — Iniciar a câmera ✅

- **Usuário:** escolhe a câmera e clica em **Iniciar câmera**.
- **Sistema:** mostra "Iniciando…" e "Solicitando acesso à câmera…", pede à câmera escolhida
  imagem de 1280×720 a 60 quadros por segundo (60 é também o teto) e, quando o vídeo chega,
  exibe a imagem, o selo **Ativa**, a etiqueta **AO VIVO** e, no rodapé, a resolução e a taxa
  reais (ex.: "1280×720 · 30 fps"). A área de reconhecimento aparece (RF16).
- **Alertas:** se a câmera entregar menos de 60 fps, o painel avisa a taxa real: "Sua câmera
  está entregando 30 fps, abaixo dos 60 fps suportados. O reconhecimento continua funcionando,
  mas o vídeo pode ficar menos fluido." Abaixo de 15 fps (a taxa de análise), o aviso diz que o
  reconhecimento vai responder mais devagar. Vale a taxa que a câmera declara; uma queda por
  pouca luz não é detectada.
- **Exceções:** se a permissão ainda não foi decidida, o sistema encaminha para a aba de
  autorização (RF12); se a câmera falhar, mostra a mensagem do erro (RF11).

#### RF04 — Parar a câmera ✅

- **Usuário:** clica em **Parar**.
- **Sistema:** encerra a captura de fato (a luz da câmera apaga), mostra "Transmissão encerrada"
  e "Transmissão encerrada. A câmera foi liberada.", pausa o reconhecimento e esconde a área de
  reconhecimento (RF16).

#### RF05 — Trocar de câmera ✅

- **Usuário:** escolhe outra câmera na lista.
- **Sistema:** se a câmera estiver ligada, passa a transmitir da nova sem recarregar a extensão;
  se estiver desligada, apenas memoriza a escolha para o próximo **Iniciar câmera**.

#### RF06 — Recarregar a lista ✅

- **Usuário:** clica em **Recarregar** (por exemplo, depois de conectar uma câmera).
- **Sistema:** atualiza a lista de câmeras. Se a câmera estava ligada, reabre a transmissão; se
  estava desligada, **não liga**, limpa um erro anterior e avisa "Lista de dispositivos
  atualizada. A câmera continua desligada."

#### RF07 — Câmera conectada ou removida durante o uso ✅

- **Usuário:** conecta ou desconecta uma câmera com o painel aberto.
- **Sistema:** uma câmera nova aparece na lista sozinha, sem recarregar.
- **Alertas:** se a câmera **em uso** for desconectada ou bloqueada pelo sistema operacional, a
  transmissão é encerrada, o selo vira **Erro** e aparece "A câmera em uso foi desconectada." ou
  "A transmissão foi encerrada pelo sistema (dispositivo removido ou bloqueado)."

#### RF08 — Lembrar a câmera escolhida ✅

- **Usuário:** escolhe uma câmera e fecha o painel.
- **Sistema:** na próxima abertura, a mesma câmera já vem selecionada, desde que continue
  conectada.

#### RF09 — Estado da câmera sempre visível ✅

- **Sistema:** o selo no topo indica **Parada** (cinza), **Iniciando…** (amarelo, pulsando),
  **Ativa** (verde, pulsando) ou **Erro** (vermelho). Com a câmera ativa, o vídeo mostra a
  etiqueta **AO VIVO** e o rodapé mostra resolução e taxa; parada, o rodapé mostra "—".

#### RF10 — Vídeo espelhado ✅

- **Sistema:** exibe a imagem espelhada, como um espelho, para que quem sinaliza veja a própria
  mão do lado em que ela está. O espelhamento é só visual: a análise usa a imagem original.
- **Exceção:** numa câmera marcada como **Invertida** (RF46), que já entrega a imagem espelhada,
  o painel não espelha de novo.

#### RF11 — Mensagens de erro da câmera ✅

- **Sistema:** traduz cada falha da câmera numa mensagem que diz o que fazer:

| Situação | Mensagem |
|---|---|
| Permissão negada | "Permissão de câmera negada. Autorize o acesso para continuar." + botão de autorização |
| Nenhuma câmera | "Nenhuma câmera encontrada. Conecte um dispositivo e clique em Recarregar." |
| Câmera ocupada por outro programa | "A câmera está em uso por outro aplicativo ou aba. Feche-o e tente novamente." |
| Câmera escolhida sumiu | "A câmera selecionada não está mais disponível. Escolha outro dispositivo." |
| Captura interrompida | "A captura foi interrompida pelo sistema operacional." |
| Contexto inseguro | "Contexto inseguro: a captura só é permitida em páginas da extensão." |

### 3.2 Permissão e consentimento

#### RF12 — Aba de autorização da câmera ✅

- **Usuário:** clica em **Iniciar câmera** pela primeira vez.
- **Sistema:** como o navegador não exibe o pedido de câmera dentro do painel lateral, mostra
  "Abrindo a aba de autorização da câmera…" e abre uma aba própria. Lá o usuário clica no botão e
  responde ao pedido do navegador. A permissão concedida vale para toda a extensão, inclusive para
  a tela cheia.
- **Exceções:** se a câmera já estiver autorizada, a aba avisa "A câmera já está autorizada. Pode
  voltar ao painel lateral." sem pedir nada.

#### RF13 — Retorno da autorização ao painel ✅

- **Usuário:** responde ao pedido na aba de autorização.
- **Sistema:** se concedeu, a aba mostra "Permissão concedida. Você já pode fechar esta aba e
  voltar ao painel lateral."; o painel carrega os nomes reais das câmeras, esconde o botão de
  permissão e avisa "Permissão concedida. Clique em Iniciar câmera."
- **Alertas:** se negou, o painel mostra "Permissão de câmera negada nas configurações do
  navegador."

#### RF14 — Orientação quando a câmera está bloqueada ✅

- **Usuário:** abre o painel.
- **Sistema:** se a câmera nunca foi autorizada, orienta "Clique em Iniciar câmera para autorizar
  o acesso."
- **Alertas:** se foi bloqueada nas configurações, mostra "O acesso à câmera está bloqueado para
  esta extensão. Libere em Configurações do navegador → Privacidade e segurança → Câmera." e o
  botão de autorização.

#### RF15 — Consentimento para o reconhecimento ✅

- **Usuário:** liga a chave **Reconhecimento** pela primeira vez.
- **Sistema:** antes de processar qualquer quadro, abre o aviso "Ativar o reconhecimento de
  Libras", que explica: a extensão calculará, no próprio dispositivo, 21 pontos da mão; nenhuma
  imagem é gravada nem enviada; os sinais treinados ficam salvos como números e podem ser
  exportados ou apagados. Ao clicar em **Entendi, ativar**, a data do aceite é registrada e o
  reconhecimento liga. O aviso não volta a aparecer depois de aceito.
- **Exceções:** em **Agora não**, a chave volta a desligada e nada é processado.

#### RF16 — Área de reconhecimento só com a câmera ligada ✅

- **Usuário:** abre o painel, inicia ou para a câmera.
- **Sistema:** ao abrir, mostra apenas a câmera e seus controles. A área de reconhecimento (chave
  Reconhecimento, Letras/Números, texto, pesquisa e Treinar sinais) só aparece quando a câmera
  fica **ativa**, o que implica a permissão concedida. Ao parar a câmera, ou se ela der erro, a
  área some; ao religar, volta com o texto preservado.
- **Exceções:** se uma gravação de treino estiver em andamento quando a câmera parar, ela é
  cancelada, porque o botão para cancelá-la ficaria escondido.

### 3.3 Reconhecimento

#### RF17 — Ligar e desligar o reconhecimento ✅

- **Usuário:** liga ou desliga a chave **Reconhecimento**.
- **Sistema:** na primeira vez, carrega o detector de mãos (MediaPipe) e mostra "Carregando o
  reconhecedor…"; o detector não é carregado ao abrir o painel, só quando é pedido. Ligado, exibe
  o anel, o texto e os botões; desligado, para a análise e esconde esse bloco, mas mantém o
  detector carregado para religar rápido.
- **Exceções:** se o detector não carregar, mostra "Não foi possível carregar o reconhecedor: …"
  e a chave volta a desligada.

#### RF18 — Alternar entre Letras e Números ✅

- **Usuário:** clica em **Letras** ou **Números**.
- **Sistema:** passa a reconhecer só as classes do conjunto escolhido, descarta a confirmação que
  estava em andamento, troca a grade de treino para esse conjunto e lembra a escolha. Os dois
  conjuntos nunca são analisados juntos porque letras e números compartilham formas de mão
  (O e 0, V e 2, W e 3).

#### RF19 — Anel com a letra candidata ✅

- **Usuário:** faz um sinal diante da câmera.
- **Sistema:** mostra no centro do anel a letra que está sendo reconhecida e enche o anel à medida
  que o sinal se mantém, até confirmar. Sem mão no quadro, mostra "–"; com um gesto que não se
  parece com nenhuma classe, mostra "?".

#### RF20 — Barra de nitidez do sinal ✅

- **Sistema:** abaixo da dica, uma barra mostra o quanto a letra mais provável **se destaca da
  segunda mais provável**. Barra cheia: sinal inequívoco. Barra quase vazia: o gesto está entre
  duas letras, e convém ajustar a mão.

#### RF21 — Confirmação da letra ✅

- **Usuário:** mantém o sinal parado.
- **Sistema:** a letra só é escrita quando vence a maioria dos quadros dos últimos 400 ms (pelo
  menos 55% deles e no mínimo 3) e se mantém por 700 ms. Ao confirmar, a letra entra no texto e o
  anel pisca em verde.
- **Exceções:** se a análise ficar parada por mais de meio segundo (painel escondido, câmera
  pausada), a votação recomeça do zero, para não confirmar um sinal feito antes da pausa.

#### RF22 — Sem repetição acidental ✅

- **Usuário:** continua segurando o mesmo sinal depois da confirmação.
- **Sistema:** mostra um cadeado no anel e não escreve a letra de novo: segurar o M por três
  segundos escreve "M", não "MMMM". A dica muda para "Relaxe a mão para repetir a mesma letra."
  Passar direto para **outra** letra confirma normalmente, sem pausa.

#### RF23 — Letra dupla ✅

- **Usuário:** quer escrever "SS" (como em "PASSO").
- **Sistema:** destrava a letra quando a mão sai dela por pelo menos 200 ms (basta relaxar a mão
  por meio segundo e refazer o sinal). Como alternativa, o botão **Repetir letra**, habilitado
  só enquanto há uma letra travada, libera a repetição com um clique.

#### RF24 — Rejeição de gestos desconhecidos ✅

- **Usuário:** faz um gesto que não corresponde a nenhuma classe treinada, ou fica entre duas
  letras.
- **Sistema:** não inventa uma letra: mostra "?" e a dica "Sinal não reconhecido — ajuste a mão
  ou treine essa letra." Nada é escrito.

#### RF25 — Dicas conforme o momento ✅

- **Sistema:** a linha de dica muda conforme o estado: "Mostre a mão para a câmera." (sem mão),
  "Segure o sinal…" (letra se formando), "Relaxe a mão para repetir a mesma letra." (letra
  travada), "Sinal não reconhecido…" (gesto desconhecido) e "Nenhum sinal treinado ainda — abra
  "Treinar sinais"." (modelo vazio).

#### RF26 — Ajustar sensibilidade ✅

- **Usuário:** abre **Ajustar sensibilidade** e escolhe:
  - **Rigor do reconhecimento:** **Tolerante** aceita gestos mais distantes do treino (útil se a
    letra não é reconhecida); **Exigente** rejeita mais (útil se aparecem letras erradas);
    **Normal** é o padrão.
  - **Tempo para confirmar:** **Rápido** (450 ms), **Normal** (700 ms) ou **Calmo** (1000 ms).
- **Sistema:** aplica na hora, mostra o ajuste atual no título da seção (ex.: "Normal · Rápido")
  e lembra a escolha nas próximas aberturas.

#### RF27 — Aviso de poucas classes treinadas ✅

- **Usuário:** treina só uma letra do conjunto.
- **Sistema:** avisa "Só um sinal de letras está treinado, então qualquer gesto será reconhecido
  como ele. Treine pelo menos mais um para o reconhecimento conseguir distinguir." O aviso some a
  partir da segunda classe treinada.

#### RF28 — Trava de mão diferente da configurada ⚠️

- **Usuário:** escolhe em **Treinar sinais** com qual mão vai sinalizar (RF46), por exemplo
  **Direita**, e passa a sinalizar com a esquerda.
- **Sistema:** **bloqueia a tradução**, porque um sinal da outra mão chega espelhado ao
  classificador e pode virar outra letra com confiança alta. Enquanto durar a trava, nenhuma
  letra é confirmada, o anel fica vermelho com "!", a dica diz "Tradução bloqueada: mão
  diferente da configurada." e uma gravação de treino em curso pausa.
- **Alertas:** "A câmera está vendo a mão esquerda, mas o modelo está configurado para a mão
  direita. A tradução fica bloqueada até a mão certa voltar. Se você está usando a mão direita,
  esta câmera provavelmente inverte a imagem.", com os botões **Usar a mão esquerda** e **A
  câmera inverte a imagem** (RF46).
- **Sem falso alarme:** trava após 5 quadros seguidos com a mão errada (~330 ms), solta após 3
  com a certa e ignora quadros com confiança abaixo de 0,8, porque a indicação de mão do
  detector oscila de um quadro para outro.
- **Ressalva:** o sistema nunca troca a mão sozinho, e não há como detectar por API uma câmera
  que espelha a imagem na origem (Iriun, OBS, DroidCam): o usuário a marca uma vez por câmera.

#### RF29 — Aviso das letras não reconhecidas ✅

- **Sistema:** mantém visível o aviso "H, J, K, X, Z e Ç envolvem movimento e não são reconhecidas
  nesta versão." Essas letras podem ser digitadas na caixa de texto (RF34).

#### RF30 — Indicadores de desempenho ✅

- **Sistema:** ao lado do anel, mostra a taxa de análise e o tempo de cada análise, por exemplo
  "15 Hz · p50 23 ms · p95 30 ms" (p50 é o tempo típico; p95, o tempo nos 5% piores casos).

#### RF31 — Ajuste automático ao desempenho do computador ✅

- **Sistema:** analisa 15 quadros por segundo. Se, nas últimas 30 análises, os 5% mais lentos
  passarem de 50 ms, reduz para 8 por segundo para não travar o painel e acrescenta "· desempenho
  reduzido" aos indicadores. Quando o computador alivia (abaixo de 25 ms), volta a 15.

### 3.4 Composição do texto

#### RF32 — Texto montado letra a letra ✅

- **Sistema:** cada letra confirmada é acrescentada ao final da caixa **Texto reconhecido**.

#### RF33 — Espaço, Apagar e Limpar ✅

- **Usuário:** clica em **Espaço**, **Apagar** ou **Limpar**.
- **Sistema:** **Espaço** separa palavras, mas não insere espaço no início nem dois seguidos (uma
  pausa mal interpretada não vira "YOU  TUBE"); **Apagar** remove o último caractere; **Limpar**
  esvazia a caixa. Com o texto vazio, os três ficam desabilitados.

#### RF34 — Edição manual ✅

- **Usuário:** digita ou corrige diretamente na caixa (por exemplo, para incluir H, J, K, X ou Z).
- **Sistema:** aceita a edição; o reconhecimento continua acrescentando letras ao final, e o
  cursor não é movido enquanto o usuário edita.

#### RF35 — Limite de tamanho ✅

- **Sistema:** o texto tem no máximo 200 caracteres; letras confirmadas além disso são
  ignoradas.

#### RF36 — Texto mantido durante a sessão ✅

- **Usuário:** fecha e reabre o painel, ou troca entre painel e tela cheia.
- **Sistema:** o texto continua lá. Ele é salvo meio segundo depois de cada mudança e só é
  apagado quando o navegador é fechado.

### 3.5 Pesquisa

#### RF37 — Botão Pesquisar ✅

- **Usuário:** clica em **Pesquisar**.
- **Sistema:** o botão só fica habilitado com texto na caixa. Antes de pesquisar, remove espaços
  nas pontas e espaços repetidos no meio.

#### RF38 — Seletor "Onde pesquisar?" ✅

- **Sistema:** abre uma janela com o **Termo reconhecido** em destaque, para conferência, e a nota
  "O texto sai do seu dispositivo apenas para a plataforma que você escolher."

#### RF39 — Plataformas em ordem alfabética ✅

- **Sistema:** uma lista mostra as marcas em ordem alfabética: **Amazon, Google, Maps, Wikipédia e
  YouTube**, cada uma com a logo e o que se encontra lá (ex.: "YouTube — Vídeos"). Uma plataforma
  acrescentada no futuro entra automaticamente na posição certa.

#### RF40 — Buscador padrão do navegador ✅

- **Usuário:** escolhe **Buscador padrão**, num grupo à parte abaixo da lista.
- **Sistema:** pesquisa no buscador configurado no navegador (Google, Bing, DuckDuckGo etc.),
  que só o próprio navegador conhece.

#### RF41 — Pesquisa em nova aba ✅

- **Usuário:** escolhe uma plataforma.
- **Sistema:** abre uma nova aba com a pesquisa, para o usuário ver para onde o texto foi.
  Caracteres especiais como "&" e "#" são codificados e não alteram o endereço da busca.

#### RF42 — Plano B do buscador padrão ✅

- **Alertas:** se o buscador padrão não puder ser acionado, a mesma aba abre a pesquisa no Google
  e o painel avisa "Buscador padrão indisponível — a pesquisa foi aberta no Google." Qualquer
  outra falha mostra "Não foi possível abrir a pesquisa: …".

#### RF43 — Desistir sem enviar nada ✅

- **Usuário:** fecha o seletor pelo ×, por **Cancelar**, pela tecla Esc ou clicando fora.
- **Sistema:** nada é enviado. Arrastar o mouse de dentro da janela para fora não conta como
  desistência.

#### RF44 — Seletor operável pelo teclado ✅

- **Sistema:** ao abrir, o foco vai para a primeira plataforma; Tab e Shift+Tab circulam só dentro
  da janela; ao fechar, o foco volta para onde estava.

#### RF45 — Logos sem internet ✅

- **Sistema:** as logos das plataformas vêm dentro da extensão; nenhuma imagem é baixada para
  desenhar o seletor.

### 3.6 Treino e gestão do modelo

#### RF46 — Escolha da mão dominante ✅

- **Usuário:** em **Treinar sinais**, escolhe **Direita** (padrão) ou **Esquerda**.
- **Sistema:** passa a tratar os sinais como feitos com essa mão. A mão esquerda é espelhada antes
  da análise, então as mesmas amostras (inclusive as do modelo pronto) servem para as duas mãos,
  sem treinar de novo. A escolha fica salva e não pode ser trocada durante uma gravação.
- **Imagem desta câmera:** **Normal** (padrão) ou **Invertida**, guardada por câmera. Marcada
  como Invertida, a câmera tem a imagem corrigida na normalização, na trava do RF28 e na
  exibição (RF10). Amostras pessoais gravadas antes da marcação ficaram com os lados trocados e
  podem precisar ser gravadas de novo.
- **Alertas:** se a mão vista pela câmera não for a configurada, a tradução trava (RF28).

#### RF47 — Treinar uma letra ou número ✅

- **Usuário:** com a câmera e o Reconhecimento ligados, clica numa letra da grade e mantém o sinal.
- **Sistema:** grava 20 amostras, uma a cada 150 ms, apenas nos quadros em que a mão aparece, e
  mostra o progresso ("Gravando "A" — 7/20"). Durante a gravação, os demais botões ficam
  bloqueados. Ao terminar, recalibra o reconhecimento (RF58).
- **Exceções:** com o Reconhecimento desligado, avisa "Ligue o Reconhecimento antes de treinar."

#### RF48 — Cancelar a gravação ✅

- **Usuário:** clica em **Cancelar** na barra de gravação.
- **Sistema:** interrompe na hora; as amostras já gravadas são mantidas. Parar a câmera também
  cancela a gravação (RF16).

#### RF49 — Grade de classes ✅

- **Sistema:** cada letra ou número da grade mostra:
  - um selo com as amostras: "·" (nenhuma), "20" (só de um tipo) ou "50+8" (50 do modelo pronto +
    8 do usuário, com as do usuário em destaque);
  - a cor: laranja com menos de 20 amostras, verde a partir de 20, borda tracejada ao chegar a
    100;
  - a porcentagem de espaço ocupado (RF61);
  - ao passar o mouse, o detalhe (ex.: "A — 50 do modelo pronto, 8 sua(s) de 100 (58% do espaço
    da classe). Clique para reforçar.").

  O título da seção mostra quantas classes têm amostras (ex.: "12/21").

#### RF50 — Limite de 100 amostras por classe ✅

- **Sistema:** cada classe guarda no máximo 100 amostras. Ao chegar lá, a borda fica tracejada e a
  dica diz "Classe cheia (100/100, 100%): gravar mais substitui as mais antigas."

#### RF51 — Aviso antes de passar do limite ✅

- **Usuário:** clica para treinar uma classe que vai ultrapassar 100 amostras.
- **Sistema:**
  - se só amostras do modelo pronto vão sair, apenas informa: ""A" chegou ao limite de 100
    amostras: 20 do modelo pronto vão dar lugar às que você gravar agora." e grava;
  - se amostras **do próprio usuário** vão sair, pede confirmação (""A" já está cheia"), dizendo
    quantas suas e quantas do modelo pronto serão descartadas, com **Gravar mesmo assim** ou
    **Cancelar**, e sugere apagar a letra no × e gravar de novo se ela tiver piorado.
  - durante a gravação no limite, a barra fica laranja e mostra "limite de 100: substituindo as
    mais antigas".

#### RF52 — Apagar uma classe ✅

- **Usuário:** clica no × de uma classe (o × só aparece em classes com amostras).
- **Sistema:** pergunta "Apagar as amostras de "A"?", avisando que não há como desfazer e que as
  outras classes continuam intactas. Confirmado, apaga, recalibra e avisa "Amostras de "A"
  apagadas."

#### RF53 — Voltar uma classe ao modelo pronto ✅

- **Usuário:** clica no × de uma classe que tem amostras do modelo pronto **e** suas.
- **Sistema:** pergunta "Voltar "A" ao modelo pronto?"; confirmado, descarta só as amostras do
  usuário nessa classe e avisa ""A" voltou ao modelo pronto."

#### RF54 — Apagar tudo ✅

- **Usuário:** clica em **Apagar tudo**.
- **Sistema:** pede confirmação com o botão **Sim** em vermelho e o foco já em **Não**, para que
  um Enter por reflexo não apague nada, e sugere exportar antes. Confirmado, remove todas as amostras (do usuário e do modelo pronto)
  e avisa "Modelo apagado. Para voltar a usar o modelo pronto, clique em "Restaurar modelo
  pronto"." O botão fica desabilitado com o modelo vazio.

#### RF55 — Exportar o modelo ✅

- **Usuário:** clica em **Exportar**.
- **Sistema:** baixa o arquivo `soletra-modelo-AAAA-MM-DD.json` com todas as amostras e avisa
  "Modelo exportado." Desabilitado com o modelo vazio ou durante uma gravação.

#### RF56 — Importar um modelo ⚠️

- **Usuário:** clica em **Importar** e escolhe um arquivo `.json`.
- **Sistema:** valida o arquivo **antes** de perguntar qualquer coisa. Se for válido, pergunta
  "O arquivo traz 1550 amostras de 31 classes (mão direita). Isso vai substituir o modelo atual."
  e, confirmado, substitui e avisa "Modelo importado: …".
- **Exceções:** um arquivo inválido é recusado sem tocar no modelo atual, com o motivo: não é
  JSON, formato desconhecido, esquema ou versão de normalização incompatível, classe
  desconhecida, amostra com tamanho errado, valor não numérico ou arquivo sem amostras.
- **Ressalva:** só é possível **substituir**; somar o arquivo ao modelo atual ainda não está na
  interface.

#### RF57 — Arquivos do nome antigo ✅

- **Sistema:** aceita também modelos exportados quando o produto se chamava RVL Libras.

#### RF58 — Recalibração automática ✅

- **Sistema:** sempre que o modelo muda (fim de gravação, apagar, restaurar, importar), recalcula
  sozinho o limite que separa "letra reconhecida" de "gesto desconhecido". O usuário não precisa
  ajustar nada.

#### RF59 — Modelo incompatível ✅

- **Alertas:** se o modelo salvo foi gravado com outra versão da normalização, ele não é usado e
  o painel avisa "O modelo salvo foi gravado com outra versão da normalização e não pode ser
  usado. Treine os sinais novamente." Usá-lo não daria erro, mas reconheceria errado sem motivo
  aparente.

#### RF60 — Migração do nome antigo ✅

- **Sistema:** na primeira abertura após a troca de nome, move os dados salvos sob o nome antigo
  (RVL Libras) para o nome novo, sem perder o modelo treinado e sem sobrescrever dados novos.

#### RF61 — Porcentagem de espaço por letra e número ✅

- **Usuário:** abre **Treinar sinais**.
- **Sistema:** cada letra e número mostra quanto do seu espaço de 100 amostras já está ocupado
  (ex.: "58%"), em texto e numa barra na base do botão (verde, laranja enquanto incompleta,
  branca durante a gravação). O número acompanha a gravação em tempo real.

#### RF62 — Uso total do armazenamento ✅

- **Sistema:** abaixo da grade, mostra o espaço ocupado pela extensão no navegador, por exemplo
  "Armazenamento: 0,85 MB de 10 MB (9%)", atualizado sempre que o modelo muda.
- **Alertas:** a partir de 80%, a linha fica laranja e orienta: "— perto do limite. Exporte o
  modelo e apague classes que não usa."

### 3.7 Modelo pronto

#### RF63 — Modelo pronto por padrão, com escolha de treinar do zero ✅

- **Usuário:** instala a extensão e abre o painel pela primeira vez.
- **Sistema:** no momento da instalação, antes de o painel abrir, instala o modelo pronto (1550
  amostras em 31 classes) e calibra o limiar de reconhecimento, então o reconhecimento funciona
  sem nenhum treino. Na primeira abertura, o cartão "Como você quer começar?" avisa que o modelo
  pronto já está instalado e oferece:
  - **Usar modelo pronto**: mantém o modelo e fecha o cartão de vez;
  - **Treinar do zero**: tira o modelo pronto (o que a pessoa já tiver gravado fica), fecha o
    cartão de vez e abre **Treinar sinais**. O modelo pronto volta em **Adicionar modelo pronto**.
  Enquanto a pessoa não escolhe, o cartão continua aparecendo, mas o modelo pronto já funciona.
- **Atualização:** nada é instalado; o modelo de quem já usa a extensão fica como está.
- **Modelo vazio:** depois de **Apagar tudo** (ou se a instalação automática falhar), o mesmo
  cartão oferece **Usar modelo pronto**, que o instala e avisa "Modelo pronto carregado: 1550
  amostras em 31 classes. Ligue o Reconhecimento para começar.", ou **Treinar do zero**, que fecha
  o cartão nessa abertura e abre **Treinar sinais**.
- **Exceções:** o cartão só aparece se a extensão trouxer o modelo pronto.

#### RF64 — Modelo pronto empacotado ⚠️

- **Sistema:** a extensão traz um modelo com 31 classes (21 letras e 10 números) e 50 amostras
  por classe, que funciona sem treino e sem baixar nada.
- **Ressalva:** o modelo atual foi gravado por **uma pessoa só**, então pode reconhecer pior a
  mão de outras pessoas (seção 5.1).

#### RF65 — Reforçar uma letra do modelo pronto ✅

- **Usuário:** usa o modelo pronto e percebe que uma letra não funciona bem com a sua mão; clica
  nela na grade.
- **Sistema:** grava 20 amostras da mão do usuário, que se **somam** às do modelo pronto; o selo
  passa de "50" para "50+20".

#### RF66 — O modelo se adapta a quem usa ✅

- **Sistema:** quando uma classe chega a 100 amostras, as primeiras a sair são as do modelo
  pronto; só depois saem as mais antigas do usuário. Com o uso, o modelo passa a refletir a mão de
  quem usa.

#### RF67 — Adicionar ou restaurar o modelo pronto ✅

- **Usuário:** clica em **Adicionar modelo pronto** (se treinou do zero) ou **Restaurar modelo
  pronto** (se já usa o padrão ou apagou tudo).
- **Sistema:** repõe as amostras do modelo pronto sem apagar o treino do usuário. Pede
  confirmação ("Restaurar o modelo pronto? … O que você treinou continua salvo e soma a elas.");
  com o modelo vazio, instala direto, porque não há nada a perder.
- **Exceções:** o botão não aparece se a extensão não trouxer o modelo pronto.

#### RF68 — Montagem do modelo pronto a partir de várias pessoas ✅

- **Usuário (desenvolvedor):** reúne os arquivos exportados por várias pessoas e roda
  `node tools/montar-modelo-padrao.mjs`.
- **Sistema:** junta as amostras dando a mesma cota a cada pessoa (quem gravou mais não domina o
  modelo) e escolhe amostras espalhadas pela sessão de cada uma.
- **Alertas:** avisa quando há menos de 3 pessoas ou quando uma classe tem um único contribuinte,
  e recusa arquivos inválidos indicando qual.

### 3.8 Janela e interface

#### RF69 — Abrir como painel lateral ✅

- **Usuário:** clica no ícone do Soletra na barra do navegador.
- **Sistema:** abre o painel lateral, que continua visível enquanto o usuário navega. Em
  navegadores sem painel lateral, abre o Soletra numa aba.

#### RF70 — Botões fechar, minimizar e tela cheia ⚠️

- **Usuário:** usa os três botões redondos do topo, no estilo do macOS.
- **Sistema:**

| Botão | No painel lateral | Na aba de tela cheia |
|---|---|---|
| 🔴 Fechar | Fecha o painel | Fecha a aba |
| 🟡 Minimizar | Avisa "O Soletra já está minimizado no painel lateral. Use o verde para abrir em tela cheia." | Volta ao painel lateral e fecha a aba |
| 🟢 Maximizar | Abre o Soletra numa aba ocupando o navegador inteiro | Liga ou desliga a tela cheia (Esc também sai) |

- **Ressalva:** voltar ao painel exige Chrome 116 ou mais recente; antes disso aparece "Não foi
  possível voltar ao painel lateral. Feche esta aba e clique no ícone do Soletra."

#### RF71 — Troca sem perder o que estava ligado ✅

- **Usuário:** passa do painel para a tela cheia, ou o contrário.
- **Sistema:** a página que sai desliga a câmera **antes** de abrir a outra (muitas webcams só
  aceitam um uso por vez), anota o que estava ligado e a página que entra religa a câmera e o
  reconhecimento. A anotação é apagada ao ser lida: reabrir o painel no dia seguinte não liga a
  câmera sozinho.

#### RF72 — Uma única aba de tela cheia ✅

- **Usuário:** clica no 🟢 com uma aba do Soletra já aberta.
- **Sistema:** reaproveita a aba existente, traz para a frente e a recarrega, em vez de abrir
  outra.

#### RF73 — Janelas de confirmação próprias ✅

- **Sistema:** todas as confirmações (consentimento, apagar, importar, limite) usam janelas da
  própria extensão, porque o diálogo padrão do navegador não é confiável no painel lateral. Esc
  cancela; nas ações destrutivas, o botão de confirmar fica vermelho e o foco começa no botão de
  recusa (**Não**); ao fechar, o foco volta para onde estava.

#### RF74 — Visual adaptado ✅

- **Usuário:** escolhe o tema no botão ao lado do selo de estado: **Sistema**, **Claro** ou
  **Escuro**.
- **Sistema:** em **Sistema** (o padrão), segue o claro ou escuro do sistema operacional. A
  escolha fica salva e vale ao mesmo tempo para o painel e para a aba de autorização da câmera.
  A interface cabe na largura estreita do painel lateral e, em tela cheia, usa uma coluna
  centralizada com vídeo e letra maiores.
- **Transição:** toda troca que muda a aparência é animada (cerca de 1,6 s): o tema novo se
  espalha a partir do botão de tema como tinta jogada, numa mancha com gotas diferente a cada
  troca, inclusive quando o tema muda sozinho pelo modo Sistema. No escuro, a faixa do topo é
  petróleo (azul-marinho a ciano escuro); no claro, o degradê azul da logo.

**Total: 74 funcionalidades — 70 plenamente atendidas e 4 com ressalva (RF28, RF56, RF64, RF70).**

---

## 4. Requisitos não funcionais atendidos

| ID | Requisito | Como é atendido | Status |
|---|---|---|---|
| RNF01 | **Privacidade:** nenhum quadro de vídeo sai do dispositivo | Inferência por WebAssembly local; sem `host_permissions`, sem content scripts, sem chamada de rede | ✅ |
| RNF02 | **Sem código remoto** | MediaPipe vendorizado (~20 MB) e versão fixada em 1.0.1; a CSP do Manifest V3 bloquearia CDN | ✅ |
| RNF03 | **Integridade dos binários** | SHA-256 de cada arquivo em `INTEGRIDADE.json`, conferidos por `tools/verificar-vendor.mjs`. O `.gitattributes` impede o Git de converter as quebras de linha dos binários, e o verificador distingue "quebras de linha convertidas" de "arquivo adulterado", indicando a correção | ✅ |
| RNF04 | **Permissões mínimas** | Só `sidePanel`, `storage` e `search` | ✅ |
| RNF05 | **Desempenho** | Detecção a 15 Hz com recuo para 8 Hz; detector criado sob demanda; render da grade só no que mudou. Medido no spike (Edge 153, CPU): p50 22,9 ms por quadro | ✅ |
| RNF06 | **Robustez a câmera e resolução** | Normalização invariante a posição, escala e proporção da imagem; timestamp monotônico na troca de câmera | ✅ |
| RNF07 | **Armazenamento dentro da quota** | 31 classes × 100 amostras ficam bem abaixo dos 10 MB do `storage.local`; o teto por classe impede o crescimento sem limite, e o uso é exibido por classe e no total, com aviso a partir de 80% (RF61, RF62) | ✅ |
| RNF08 | **Testabilidade** | Lógica isolada em funções puras e classes com relógio injetado; só um módulo depende de WASM | ✅ |
| RNF09 | **Sem dependências externas em execução** | Nada é baixado da rede: React e Radix UI são empacotados no build (Vite). A lógica em `src/` e os testes rodam em Node puro, sem dependências; `npm audit` sem vulnerabilidades (26/10/2026) | ✅ |
| RNF10 | **Acessibilidade básica** | Rótulos ARIA, região `aria-live` para mensagens, foco gerenciado nos modais, navegação por teclado no seletor | ⚠️ |
| RNF11 | **Conformidade com a LGPD** | Consentimento, eliminação, portabilidade e política de privacidade (seção 9) | ⚠️ |
| RNF12 | **Compatibilidade** | Chrome e Edge 114+ (Manifest V3) | ⚠️ |

---

## 5. Pontos não atendidos e limitações conhecidas

### 5.1 Reconhecimento

| Ponto | Situação | Motivo | Impacto | Caminho possível |
|---|---|---|---|---|
| **Letras dinâmicas H, J, K, X, Z** | Não atendido | Envolvem movimento. Um classificador quadro a quadro não representa trajetória, e fingir que representa produz confusão sistemática em vez de erro honesto | Cobertura de 21 das 26 letras; palavras com essas letras exigem edição manual | Segundo pipeline com componente temporal: buffer de landmarks e classificador de sequência, com dataset próprio |
| **Ç** | Não atendido | Também é dinâmico (movimento a partir do C) | Idem | Idem |
| **Acentos e pontuação** | Não atendido | Não fazem parte do alfabeto manual estático | Texto acentuado só por digitação | Edição manual (já disponível) |
| **Sinais de palavras e frases da Libras** | Fora do escopo | O projeto trata da datilologia, não da língua completa, que tem sinais com movimento, expressão facial e duas mãos | O Soletra soletra; não traduz Libras | Trabalho de outra ordem de grandeza |
| **Sinais com as duas mãos** | Não atendido | O detector é configurado para uma mão (`numHands: 1`) | Nenhum para o alfabeto manual, que usa uma mão | — |
| **Detecção da mão dominante** | Atendido parcialmente (RF28) | A indicação de mão do MediaPipe pressupõe imagem espelhada, e webcams virtuais (Iriun, OBS, DroidCam) às vezes espelham na origem, sem como detectar | A mão errada trava a tradução; a inversão da câmera é marcada pelo usuário, uma vez por câmera (RF46) | Perguntar a marcação na primeira vez que cada câmera nova é usada: uma imagem espelhada é geometricamente idêntica à da outra mão, então não há como inferi-la do quadro |
| **Avaliação formal de acurácia** | Não atendido | Não há matriz de confusão nem avaliação leave-one-out | O TCC **não tem números de acurácia** medidos; os pares que colidem (O≡0, V≡2, W≡3) são supostos, não medidos | `src/sign-eval.js` (previsto, não implementado) |
| **Generalização do modelo pronto** | Não validado (RF64) | O `padrao.json` atual vem de **uma pessoa só** (`pessoas: 1`) | Pode falhar com mãos diferentes da do autor, sem erro aparente | Coletar exports de colegas e voluntários e regenerar com a ferramenta de montagem |
| **Velocidade de soletração** | Limitação de projeto | Cada letra exige ~700 ms de permanência mais a votação, para evitar letras falsas a cada tremor | Soletração mais lenta que a natural | Ajuste "Rápido" (450 ms) já disponível |

### 5.2 Plataforma e interface

| Ponto | Situação | Motivo | Impacto |
|---|---|---|---|
| **Firefox, Safari e navegadores móveis** | Não atendido | Usa `chrome.sidePanel` e `chrome.search`, exclusivas do Chromium | Só Chrome e Edge no computador |
| **Voltar ao painel no Chrome 114–115** | Parcial (RF70) | `chrome.sidePanel.open` só existe a partir do 116 | Nessas versões, o 🟡 só exibe um aviso |
| **Painel e aba de tela cheia abertos ao mesmo tempo** | Não tratado | A troca pelos botões solta a câmera antes; abrir pelo ícone com a aba já aberta não | As duas páginas disputam a câmera |
| **Importar com mesclagem** | Parcial (RF56) | O armazenamento suporta `mesclar`, mas a interface só oferece **substituir** | Para somar modelos é preciso usar a ferramenta de montagem |
| **Vários perfis de modelo** | Não atendido | Um único modelo por perfil do navegador | Duas pessoas no mesmo computador compartilham o modelo |
| **Atalhos de teclado e comandos por gesto** (espaço, apagar, pesquisar) | Não atendido | — | Essas ações exigem clique ou Tab |
| **Idiomas além do português** | Não atendido | Textos da interface escritos direto no código | — |
| **Acessibilidade auditada** | Parcial (RNF10) | Há boas práticas de ARIA e foco, mas não houve auditoria WCAG nem teste com leitor de tela | Conformidade não comprovada |
| **Preferência "reduzir movimento"** | Não atendida, por decisão (RF74) | A troca de tema precisa ser sempre perceptível | Quem desativa as animações no sistema ainda vê a tinta de 1,6 s |

### 5.3 Desempenho e ambiente

| Ponto | Situação | Detalhe |
|---|---|---|
| **Aceleração de hardware do navegador** | Problema conhecido | Com a aceleração gráfica ligada, o vídeo de webcam virtual chegou com atraso e o painel perdeu fluidez. **Desativá-la** (`chrome://settings/system`) resolveu. A extensão não consegue detectar nem contornar isso |
| **Webcam pelo celular (Iriun) via Wi-Fi** | Limitação externa | A transmissão sem fio acrescenta latência à imagem; por cabo USB ela é menor |
| **Detecção na thread do painel** | Limitação de projeto | O `detectForVideo` é síncrono; por isso a taxa é limitada a 15 Hz. Rodar a detecção num Web Worker foi experimentado e revertido, porque o atraso percebido vinha da aceleração de hardware, não daqui |
| **Modelo "frio" a cada abertura** | Não atendido | O detector é recriado sempre que o painel abre (~84 ms medidos no spike). Um documento `offscreen` o manteria carregado |

### 5.4 Qualidade, publicação e documentação

| Ponto | Situação | Detalhe |
|---|---|---|
| **Testes de interface** | Não atendido | Os 111 cenários cobrem a lógica (e o gerador da tinta da troca de tema). Interface (DOM), integração com o Chrome e o adaptador do MediaPipe não têm teste automatizado; o adaptador é validado pelo spike de diagnóstico e o resto, por roteiro manual (seção 10) |
| **Publicação nas lojas** | Não atendido | Não publicado na Chrome Web Store nem no Edge Add-ons. Falta hospedar a política de privacidade numa URL pública e preencher as justificativas de câmera e de `search` |
| **Consentimento escrito dos voluntários** | Pendente (RNF11) | O `PRIVACY.md` afirma que quem contribuiu para o modelo pronto consentiu. Esse consentimento precisa ser **registrado por escrito**, inclusive o do autor, e anexado ao TCC |
| **Imagens de origem das logos** | Fora do repositório | `tools/preparar-logos.mjs` não pode ser reexecutado; os PNGs finais estão empacotados e sua presença é conferida por teste |
| **Nomenclatura mista** | Menor | O código de câmera herdado da v0.1.0 usa nomes em inglês (`CameraController`, `showMessage`); o resto, português |

---

## 6. Arquitetura

### 6.1 Pipeline de reconhecimento

```
Câmera → MediaPipe HandLandmarker → 21 pontos (x, y, z)
       → normalização → vetor de 63 números
       → KNN sobre as amostras (modelo pronto + treino do usuário)
       → estabilização temporal → caractere confirmado
       → caixa de texto → Pesquisar → escolha da plataforma → nova aba
```

| Etapa | Módulo | Como funciona |
|---|---|---|
| Detecção | `src/hand-landmarker.js` | MediaPipe `tasks-vision` 1.0.1, delegate CPU, uma mão, modo VIDEO |
| Agendamento | `src/inference-loop.js` | `requestVideoFrameCallback` (um disparo por quadro novo), 15 Hz com recuo para 8 Hz, timestamp estritamente crescente |
| Normalização | `src/sign-features.js` | Translada para o punho, escala pelo tamanho da palma, corrige a proporção da imagem, espelha a mão esquerda, **preserva a rotação** (parâmetro fonológico da Libras); eixo z com peso 0,3 |
| Classificação | `src/sign-classifier.js` | KNN k=5 ponderado por 1/d; rejeita acima de 1,3 raio de palma; teste de razão 0,97 só para empates |
| Trava de mão | `src/trava-mao.js` | Bloqueia a tradução e o treino com a mão diferente da configurada; histerese de 5 quadros para travar e 3 para soltar, confiança mínima 0,8; lateralidade corrigida nas câmeras marcadas como invertidas |
| Confirmação | `src/sign-stabilizer.js` | Votação em janela de 400 ms; permanência de 700 ms; trava anti-repetição liberada após 200 ms fora da classe |
| Texto | `src/text-composer.js` | Composição, espaço sem duplicar, limite de 200 caracteres |
| Pesquisa | `src/search-targets.js` + `background/service-worker.js` | URLs fixadas por teste; o service worker abre a aba |

### 6.2 Camadas

O projeto isola o que é testável do que não é: **um único módulo depende de WASM**
(`src/hand-landmarker.js`) e **um único módulo de `src/` acessa o ambiente sem permitir
substituição** (`src/sign-recognizer.js`, com o relógio real, o storage e a inicialização do
WASM). O restante é função pura ou classe com dependências injetadas.

A interface segue um padrão único: cada controlador expõe **um** callback de estado, e a view
é uma função `renderizar(snapshot)`.

### 6.3 Módulos

| Lógica (`src/`) | Linhas | Responsabilidade |
|---|---:|---|
| `camera-controller.js` | 296 | Ciclo de vida do `MediaStream`, restrições de captura (1280×720 / até 60 fps) e avaliação da taxa entregue |
| `sign-recognizer.js` | 540 | Orquestrador: amarra detector, loop, trava de mão, classificador, estabilizador e texto; corrige câmeras invertidas; lê e instala o modelo pronto; mede o uso do armazenamento |
| `hand-landmarker.js` | 102 | Adaptador do MediaPipe (único módulo dependente de WASM) |
| `inference-loop.js` | 138 | Agendador rVFC, taxa adaptativa, timestamp monotônico |
| `sign-features.js` | 134 | Landmarks → 63 números; carrega `VERSAO_FEATURES` |
| `sign-classifier.js` | 273 | KNN ponderado, rejeição, teste de razão, calibração do limiar |
| `sign-stabilizer.js` | 234 | Máquina de confirmação e trava anti-repetição |
| `trava-mao.js` | 70 | Trava de mão diferente da configurada, com histerese |
| `sign-classes.js` | 51 | Catálogo de letras estáticas, dinâmicas e números |
| `sign-model-store.js` | 423 | Persistência com origem (padrão × pessoal), teto, quota, export/import validado |
| `text-composer.js` | 75 | Composição do texto e preparo para a busca |
| `search-targets.js` | 107 | Catálogo de plataformas (marcas em ordem alfabética) e montagem das URLs |
| `migracao-storage.js` | 64 | Migra as chaves `rvl.*` para `soletra.*` |
| `modelo-pronto.js` | 62 | Lê, instala e calibra o modelo pronto; usado pelo painel e pelo service worker |

| Interface | Linhas | Responsabilidade |
|---|---:|---|
| `sidepanel/nucleo.js` | 597 | Orquestração sem React: câmera, permissão, consentimento, aviso de taxa abaixo de 60 fps, pesquisa, treino, exportar/importar/apagar |
| `sidepanel/panel.html` / `.css` | 12 / 562 | Página do painel e estilos próprios (semáforo, palco, anel, grade de classes, seletor de plataforma) |
| `sidepanel/componentes/Reconhecimento.jsx` | 341 | Anel, barra de proximidade, caixa de texto, ajustes, avisos, trava de mão com suas saídas |
| `sidepanel/componentes/Treino.jsx` | 323 | Grade de classes com % de uso por classe, uso do armazenamento, captura, imagem da câmera (normal/invertida), boas-vindas, exportar/importar/apagar, modelo pronto |
| `sidepanel/componentes/` (demais) | 528 | Topo, Palco, Mensagem, Controles, Rodapé, diálogo de confirmação e "Onde pesquisar?" |
| `sidepanel/dialogo.js` / `seletor-plataforma.js` | 73 / 46 | Pedidos das janelas de confirmação e de plataforma (promessas) |
| `sidepanel/janela.js` | 172 | Botões fechar / painel / tela cheia |
| `ui/` | 390 | Tema Sistema / Claro / Escuro e sua troca animada (tinta), configuração do Radix Themes, loja de estado |
| `background/service-worker.js` | 124 | Abre o painel, executa a pesquisa e instala o modelo pronto na instalação |
| `permission/` | 200 | Aba de autorização da câmera |

| Apoio | Linhas | Responsabilidade |
|---|---:|---|
| `tools/montar-modelo-padrao.mjs` | 148 | Monta o modelo pronto a partir de exports de várias pessoas |
| `tools/verificar-vendor.mjs` | 123 | Confere os SHA-256 dos binários e diagnostica quebras de linha convertidas pelo Git |
| `.gitattributes` | — | Marca `vendor/**` e `modelos/*.json` como `-text`, para o Git não alterar seus bytes |
| `tools/png.mjs` | 217 | Ler, escrever e redimensionar PNG sem dependências |
| `tools/make-icons.mjs` | 66 | Gera os ícones da extensão |
| `tools/preparar-logos.mjs` | 302 | Limpa e reduz as logos das plataformas |
| `spike/spike.html` / `.js` | 69 / 274 | Diagnóstico de CSP e latência (fora do fluxo) |

**Total de código próprio: ~8.330 linhas**, incluindo testes e ferramentas.

### 6.4 Parâmetros

| Módulo | Parâmetro | Valor |
|---|---|---|
| `camera-controller` | Resolução ideal / taxa ideal e máxima / aviso abaixo de | 1280×720 / 60 fps / 60 fps |
| `trava-mao` | Quadros para travar / para soltar / confiança mínima | 5 / 3 / 0,8 |
| `inference-loop` | Taxa alvo / recuo / p95 que dispara o recuo | 15 Hz / 8 Hz / 50 ms |
| `sign-features` | Dimensões / peso do eixo z | 63 / 0,3 |
| `sign-classifier` | k / limiar de distância / teste de razão | 5 / 1,3 raio de palma / 0,97 |
| `sign-classifier` | Rigor (multiplicador do limiar) | Tolerante 1,25 · Normal 1,0 · Exigente 0,8 |
| `sign-stabilizer` | Janela de votação / fração mínima / quadros mínimos | 400 ms / 0,55 / 3 |
| `sign-stabilizer` | Permanência para confirmar | 700 ms (450 / 1000 ajustáveis) |
| `sign-stabilizer` | Confiança mínima / tempo que libera repetição | 0,5 / 200 ms |
| `sign-recognizer` | Intervalo entre amostras na captura | 150 ms |
| `sign-model-store` | Amostras por captura / teto por classe / modelo pronto por classe | 20 / 100 / 50 |
| `sign-model-store` | Quota / limiar do aviso na interface | 10 MB / 80% |
| `text-composer` | Limite do texto | 200 caracteres |

### 6.5 Armazenamento

| Chave (`chrome.storage.local`) | Conteúdo |
|---|---|
| `soletra.modelo.v1.indice` | Esquema, versão das features, mão, limiar, k, versão da calibração, contagens pessoais e do padrão |
| `soletra.modelo.v1.classe.<X>` | Amostras **pessoais** da classe X |
| `soletra.modelo.v1.padrao.<X>` | Amostras do **modelo pronto** na classe X |
| `soletra.reconhecimento.prefs` | Mão, conjunto, rigor e tempo para confirmar |
| `soletra.preferredDeviceId` | Última câmera escolhida |
| `soletra.consentimento.reconhecimento` | Data e versão do aceite |

Em `chrome.storage.session` (some ao fechar o navegador): `soletra.texto` (texto composto) e
`soletra.janela.retomar` (o que religar na troca painel ↔ aba; apagado na leitura).

---

## 7. Tecnologias e decisões técnicas

### 7.1 Stack

| Camada | Tecnologia |
|---|---|
| Plataforma | Extensão Chrome/Edge, **Manifest V3**, `minimum_chrome_version: 114` |
| Linguagem | **JavaScript (ES Modules)**, sem TypeScript; JSX na interface |
| Interface | **React 19** + **Radix UI** (Radix Themes, `Accordion` dos primitivos, `react-icons`), temas Sistema / Claro / Escuro com troca animada pela View Transitions API |
| Build | **Vite**, gera `dist/`; a lógica em `src/` não depende do build |
| Painel | `chrome.sidePanel` |
| Persistência | `chrome.storage.local` e `chrome.storage.session` |
| Visão computacional | **MediaPipe `@mediapipe/tasks-vision` 1.0.1**, vendorizado, delegate CPU |
| Modelo de detecção | `hand_landmarker.task`: 21 pontos 3D por mão |
| Classificação | **KNN** de implementação própria |
| Testes | **Node.js puro**, sem framework |

| Arquivo vendorizado | Tamanho |
|---|---|
| `vendor/mediapipe/vision_bundle.mjs` | 155 KB |
| `vendor/mediapipe/wasm/vision_wasm_internal.js` | 323 KB |
| `vendor/mediapipe/wasm/vision_wasm_internal.wasm` | 11,8 MB |
| `vendor/mediapipe/hand_landmarker.task` | 7,8 MB |

### 7.2 Decisões

| Decisão | Justificativa |
|---|---|
| **Landmarks em vez de pixels** | Modelo pequeno, robusto a fundo, luz e tom de pele, treinável no navegador |
| **KNN em vez de rede neural** | Poucas amostras por classe, treinadas pelo usuário: não há dados nem tempo para otimizar pesos. Inferência em frações de ms sobre ~1.550 vetores |
| **Limiar de rejeição constante (1,3)** | A normalização dá escala física fixa ao espaço. Duas calibrações anteriores rejeitavam sinais legítimos |
| **Delegate CPU, não GPU** | No spike (Edge 153): CPU p50 22,9 ms contra 58,4 ms no GPU, que paga a leitura de textura e exigiria um contexto WebGL vivo |
| **Binários commitados, versão fixa** | A CSP do MV3 bloqueia CDN, e as lojas tratam CDN como código remoto; `@latest` publica builds diários |
| **Binários marcados como `-text` no Git** | Sem isso, clones no Windows convertem as quebras de linha dos `.js` vendorizados e o SHA-256 deixa de bater, mesmo com o conteúdo intacto |
| **`WasmFileset` montado à mão** | Evita a sonda SIMD do `FilesetResolver`, que apontaria para arquivos não vendorizados |
| **`requestVideoFrameCallback`** | Dispara uma vez por quadro novo, ao contrário de um timer, e pausa junto com o vídeo |
| **Painel lateral, não popup** | O popup fecha ao perder o foco e encerra a câmera |
| **Pesquisa no service worker** | O painel lateral não é uma aba; o worker cria a aba e passa `tabId` a `chrome.search.query` |
| **Logos e modelo pronto empacotados** | Nada de recurso remoto; a interface não depende de rede |
| **Modelo pronto em chaves separadas** | Permite voltar uma letra ao padrão e faz o padrão ceder primeiro no teto |
| **Área de reconhecimento condicionada à câmera** | Sem vídeo não há o que reconhecer nem treinar; esconder evita ações sem efeito |
| **Tela cheia como aba, não janela** | O Chrome não deixa a extensão alargar o painel lateral |
| **Modais próprios** | `window.confirm` não é confiável no painel lateral, e confirmações de consentimento ou destrutivas não podem falhar em silêncio |

### 7.3 CSP do Manifest V3 e o MediaPipe

É comum ler que o MV3 impede usar MediaPipe. A limitação vale para o pacote **legado**
(`@mediapipe/hands`), cujo código gerado usava `new Function()`. O pacote `tasks-vision` não usa
`new Function` nem `eval`. Basta declarar:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
}
```

---

## 8. Qualidade e testes

### 8.1 Situação

| Indicador | Resultado (26/10/2026) |
|---|---|
| Suíte de testes | **111 cenários em 14 arquivos, todos passando** (`node tests/todos.mjs`) |
| `TODO` / `FIXME` no código | Nenhum |
| Dependências vulneráveis | **Nenhuma**: `npm audit` sem vulnerabilidades em React, Radix UI e Vite |
| Integridade do vendor | **4/4 arquivos íntegros** (`node tools/verificar-vendor.mjs`), inclusive em clone no Windows |

### 8.2 Cenários por arquivo

| Arquivo | Cenários |
|---|---:|
| `tests/sign-model-store.test.mjs` | 18 |
| `tests/sign-stabilizer.test.mjs` | 15 |
| `tests/sign-classifier.test.mjs` | 10 |
| `tests/inference-loop.test.mjs` | 8 |
| `tests/sign-features.test.mjs` | 8 |
| `tests/text-composer.test.mjs` | 7 |
| `tests/search-targets.test.mjs` | 7 |
| `tests/migracao-storage.test.mjs` | 7 |
| `tests/camera-controller.test.mjs` | 7 |
| `tests/trava-mao.test.mjs` | 6 |
| `tests/integracao.test.mjs` | 6 |
| `tests/montar-modelo-padrao.test.mjs` | 5 |
| `tests/modelo-pronto.test.mjs` | 3 |
| `tests/respingo.test.mjs` | 4 |
| **Total** | **111** |

### 8.3 Cenários que travam erros silenciosos

- **Invariância à resolução:** a mesma mão em 640×480 e 1280×720 gera vetores idênticos. Sem
  isso, o modelo pararia de funcionar ao trocar de webcam, sem erro nenhum.
- **Letra dupla:** S, pausa de 250 ms, S produz `SS`; com pausa de 100 ms, só `S`.
- **Timestamp monotônico:** trocar de câmera reinicia o relógio do vídeo, e um timestamp que
  regride faz o MediaPipe devolver resultado vazio em silêncio.
- **Versão da normalização:** modelo gravado com outra versão é recusado, não reinterpretado.
- **URL com caractere reservado:** um `&` ou `#` no texto fica contido no parâmetro de busca.
- **Catálogo de plataformas:** IDs únicos, HTTPS, logos presentes no pacote e marcas em ordem
  alfabética.
- **Migração de storage:** idempotente e nunca sobrescreve dado novo com resíduo antigo.
- **Integração:** o pipeline completo digita "ABC", produz "AA" ao relaxar a mão e não inventa
  caractere sem mão nem com gesto fora do treino.
- **No teto, o padrão cede primeiro**, **voltar ao padrão é por classe**, **reinstalar o padrão
  não custa o treino pessoal** e **"Apagar tudo" alcança o padrão** (cenários 13 a 16 do store).
- **Montagem balanceada:** quem gravou mais amostras não domina o modelo pronto.
- **Trava de mão:** um quadro errado isolado não bloqueia a tradução, e um quadro ambíguo no
  meio de uma sequência errada não adia a trava.
- **Tinta da troca de tema:** todos os quadros do recorte têm o mesmo número de pontos (senão a
  tinta pularia em vez de crescer) e o último passa do canto mais longe da janela (senão um
  pedaço do tema antigo sobraria num canto).

### 8.4 Boas práticas observadas

- Cabeçalho em cada módulo explicando **por que** a decisão foi tomada.
- Injeção de dependências para testes: relógio no estabilizador, área de storage no store,
  relógio e agendador no loop.
- Versionamento de esquema (`VERSAO_FEATURES`, `ESQUEMA`) com recusa explícita de dados
  incompatíveis; o modelo pronto passa pela mesma validação de um arquivo importado.

---

## 9. Privacidade e LGPD

| Ponto | Situação |
|---|---|
| Quadros de vídeo | Nunca gravados nem transmitidos; ficam na memória do WASM e são sobrescritos a cada quadro |
| Amostras de treino | Vetores numéricos, não imagens; ainda assim tratadas como **dado biométrico derivado** |
| Consentimento | Pedido antes da primeira ativação do reconhecimento, com data registrada (RF15) |
| Amostras do modelo pronto | Empacotadas, sem nome nem identificador; copiadas para o storage só se o usuário escolher |
| Direito de eliminação (art. 18, VI) | × por classe e "Apagar tudo", que alcança também o modelo pronto, sem resíduo |
| Direito de portabilidade (art. 18, V) | Exportar e importar o modelo em JSON |
| Único dado que sai do dispositivo | O termo de busca, depois da escolha da plataforma, e só para ela |
| Permissões | `sidePanel`, `storage`, `search`; sem `host_permissions` e sem content scripts |
| Serviços externos de IA | Nenhum |

Política completa em [PRIVACY.md](PRIVACY.md). Pendências na seção 5.4.

---

## 10. Como executar e verificar

### 10.1 Instalação

1. Compilar a interface (Node 20 ou mais recente): `npm install` e depois `npm run build`,
   que gera a pasta `dist/`.
2. Abrir `chrome://extensions` (Chrome) ou `edge://extensions` (Edge).
3. Ativar o **Modo do desenvolvedor**.
4. **Carregar sem compactação** e selecionar a pasta **`dist/`** (não a raiz do repositório).
5. Clicar no ícone do Soletra para abrir o painel.

Depois de alterar o código, rodar `npm run build` (ou deixar `npm run dev` aberto) e clicar em ↻
no cartão da extensão. Se o vídeo estiver com atraso,
desativar a aceleração de hardware do navegador (seção 5.3).

### 10.2 Comandos

```
npm run build                            # compila a extensão em dist/
npm test                                 # suíte completa — 111 cenários (node tests/todos.mjs)
node tools/verificar-vendor.mjs          # confere os SHA-256 dos binários
node tools/montar-modelo-padrao.mjs --por-classe 50 --saida modelos/padrao.json *.json
```

### 10.3 Roteiro de teste manual

1. Abrir o painel → a área de reconhecimento **não aparece**.
2. **Iniciar câmera** → autorizar na aba aberta → voltar e iniciar → a área aparece.
3. Instalação nova: o cartão "Como você quer começar?" aparece com o modelo pronto já instalado →
   ligar **Reconhecimento** → aceitar o consentimento → soletrar letras sem treinar → **Usar
   modelo pronto** fecha o cartão. Em outra instalação, **Treinar do zero** tira o modelo pronto.
4. Alternar para **Números** e reconhecer dígitos.
5. Fazer S, relaxar, S → texto `SS`. Testar **Repetir letra**, **Espaço**, **Apagar**,
   **Limpar** e digitação manual.
6. **Pesquisar** → conferir a ordem Amazon, Google, Maps, Wikipédia, YouTube → escolher uma →
   nova aba com o termo. Repetir com **Buscador padrão** e com Esc (nada é aberto).
7. Reforçar uma letra → selo `50+20` e uso `70%`; reforçar até 100 → `100%`, borda tracejada e
   aviso de limite. Conferir abaixo da grade a linha "Armazenamento: … MB de 10 MB (…%)".
8. × na letra reforçada → volta a `50`. **Apagar tudo** → **Restaurar modelo pronto**.
9. **Exportar**, apagar e **Importar**.
10. Configurar mão direita e sinalizar com a esquerda → a tradução trava (anel vermelho com
    "!"); voltar à direita → destrava. Marcar **A câmera inverte a imagem** → o vídeo deixa de
    ser espelhado pelo painel. Com uma câmera abaixo de 60 fps, conferir o aviso de taxa.
11. 🟢 abre em aba com a câmera religada; 🟢 de novo → tela cheia; 🟡 → painel; 🔴 → fecha.
12. **Parar** a câmera → a área de reconhecimento some; religar → volta com o texto preservado.

### 10.4 Diagnóstico

`spike/spike.html`, aberta como página da extensão, mede a latência por delegate, separando
quadros com e sem mão rastreada.

---

## 11. Trabalhos futuros

Em ordem de prioridade para o TCC:

1. **Avaliação formal** (`src/sign-eval.js`): matriz de confusão e leave-one-out, incluindo a
   acurácia do modelo pronto em quem não participou do treino. É o resultado quantitativo que o
   trabalho ainda não tem.
2. **Coletar exports de várias pessoas**, com consentimento por escrito, e regenerar o
   `padrao.json`.
3. **Opção "Mesclar" na importação**, que o armazenamento já suporta.
4. **Letras dinâmicas (H, J, K, X, Z e Ç)** com um pipeline temporal.
5. **Ablação da normalização:** rotação ligada × desligada, peso do eixo z e novas distâncias no
   vetor (`VERSAO_FEATURES` 2).
6. **Publicação** na Chrome Web Store e no Edge Add-ons.
7. **Documento `offscreen`** para manter o detector carregado entre aberturas.
8. Ideias levantadas: modo prática (o app sorteia uma letra), treino guiado com imagem de
   referência, autocompletar de palavras, vários perfis de modelo, as 3 classes mais prováveis
   ao vivo, atalhos de teclado e comandos por gesto.

---

## 12. Histórico de alterações

| Data | Commit | Descrição |
|---|---|---|
| 19/09/2026 | `bf7cc0c` | Versão inicial: câmera no painel lateral, pipeline MediaPipe → KNN → estabilização, treino, export/import |
| 19/09/2026 | `7a1df0e` | Configuração local do Claude Code deixa de ser versionada |
| 19/09/2026 | `6ed3405` | Produto renomeado de RVL Libras para Soletra, com migração das chaves |
| 19/09/2026 | `c353056` | `display` de autor deixa de anular o atributo `hidden` |
| 19/09/2026 | `8b29921` | Revisão do painel de treino e do modal de confirmação |
| 19/09/2026 | `13863c8` | Seletor de plataforma de destino na pesquisa |
| 19/09/2026 | `840b6d8` | Correção da descrição do limiar no README |
| 19/09/2026 | `731c1d8` | Marca do Soletra como ícone da extensão |
| 19/09/2026 | `5f25a9b` | Recalibração de modelos salvos com o limiar antigo |
| 19/09/2026 | `b4e1e61` | README, RESUMO e PRIVACY alinhados ao código |
| 13/10/2026 | `0a6ef74` | Amostras do modelo pronto separadas das pessoais |
| 13/10/2026 | `277d283` | Ferramenta de montagem e `modelos/padrao.json` com 50 amostras por classe |
| 13/10/2026 | `c89af4c` | Boas-vindas, reforço e volta ao padrão por classe, teto de 100 com avisos, botões de janela e tela cheia como aba |
| 13/10/2026 | `6163dfa` | Documentação do modelo pronto, do teto e dos botões de janela |
| 21/10/2026 | `5061dfe` a `6208655` | Área de reconhecimento só com a câmera ativa; captura a 60 fps; plataformas em ordem alfabética; % de uso por classe e uso total do armazenamento; `.gitattributes` e diagnóstico de quebra de linha no verificador do MediaPipe; data e tabelas do `PRIVACY.md`; README e esta documentação reescritos |
| 22/10/2026 | `3b1dde2` | Captura limitada a 60 fps, com aviso quando a câmera entrega menos |
| 22/10/2026 | `f5f7cc9` | Mão diferente da configurada trava a tradução e a captura de treino; opção de câmera com imagem invertida, guardada por câmera |
| 22/10/2026 | `a63add1` | Documentação da trava de mão, da câmera invertida e do teto de 60 fps |
| 23/10/2026 | `1d595c6` | Ç incluído no aviso de letras com movimento |
| 23/10/2026 | `645cb27` | Interface compilada com Vite |
| 23/10/2026 | `4a8e233` | Paleta de cores gerada a partir da logo |
| 23/10/2026 | `3ba7b4b` | Tema Sistema, Claro e Escuro |
| 23/10/2026 | `6f2f04e`, `43d2cae` | Painel e aba de permissão reescritos em React com Radix UI |
| 23/10/2026 | `c31237c` | Documentação da interface em React, do tema e da paleta da marca |
| 26/10/2026 | `b1a798a` | Faixa do topo em petróleo no tema escuro; troca de tema animada como tinta jogada a partir do botão de tema, sempre que a aparência muda; ícone do tema girando; teste do recorte da tinta |
| 26/10/2026 | `3c02291` | Versão 0.3.0; tema incluído nas preferências da política de privacidade |
| 26/10/2026 | `d76db1f` | Modelo pronto instalado e calibrado junto com a extensão, sem depender do cartão de boas-vindas |
| 26/10/2026 | `1ebb0ab` | Cartão de boas-vindas mantido na primeira abertura: com o modelo pronto já instalado, "Usar modelo pronto" o mantém e "Treinar do zero" tira só o padrão |
| 26/10/2026 | `c6dcfa3` | Seletor "Onde pesquisar?" redesenhado como lista agrupada no padrão do Radix, com o que se encontra em cada plataforma |

---

## 13. Repositório de referência avaliado

O projeto [WellingtonDev25/leitor_libras](https://github.com/WellingtonDev25/leitor_libras) foi
avaliado como base e **descartado**. É um script Python de 56 linhas com um modelo Teachable
Machine que classifica **pixels 224×224**; o MediaPipe ali só recorta a região da mão, e os
landmarks nunca chegam ao classificador. Reconhece **5 classes** (A–E), não inclui dataset nem
script de treino, não tem estabilização e **não declara licença**, o que reservaria todos os
direitos ao autor.

A abordagem adotada aqui, classificar sobre landmarks em vez de pixels, é tecnicamente superior:
modelo de KB em vez de MB e robustez a fundo, iluminação e tom de pele.
