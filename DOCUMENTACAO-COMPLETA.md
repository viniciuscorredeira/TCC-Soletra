# Soletra — Documentação Completa

**Reconhecimento do alfabeto manual de Libras no navegador, com processamento 100% local**

| | |
|---|---|
| **Natureza** | Trabalho de Conclusão de Curso |
| **Versão do produto** | 0.3.0 (`manifest.json`) |
| **Documento atualizado em** | 22/10/2026 |
| **Repositório** | `github.com/viniciuscorredeira/TCC-Soletra` |
| **Plataforma** | Extensão para Google Chrome e Microsoft Edge (Manifest V3), versão 114 ou superior |

Este documento reúne tudo sobre o Soletra: o que ele é, como se usa, cada funcionalidade, como
funciona por dentro, por que cada escolha foi feita, o que foi testado, como os dados pessoais
são tratados e o que ainda não é atendido. Documentos complementares no repositório:
`README.md` (visão técnica para desenvolvedores), `RESUMO-PROJETO.md` (resumo para
acompanhamento do TCC) e `PRIVACY.md` (política de privacidade).

---

## Sumário

**Parte I — O produto**
1. Apresentação
2. Escopo
3. Jornada do usuário
4. A interface, área por área
5. Funcionalidades
6. Requisitos não funcionais
7. Pontos não atendidos e limitações conhecidas

**Parte II — Como funciona por dentro**

8. Arquitetura
9. O pipeline de reconhecimento em detalhe
10. Modelo, armazenamento e formato dos arquivos
11. O modelo pronto
12. MediaPipe, CSP do Manifest V3 e integridade dos binários
13. A pesquisa
14. Janela, painel e tela cheia
15. As logos das plataformas

**Parte III — Decisões**

16. Registro de decisões e alternativas descartadas

**Parte IV — Qualidade e conformidade**

17. Testes e verificação
18. Privacidade e LGPD

**Parte V — Operação e evolução**

19. Instalação, uso e solução de problemas
20. Estrutura de arquivos
21. Parâmetros de referência
22. Trabalhos futuros
23. Histórico de alterações
24. Repositório de referência avaliado
25. Glossário

---

# Parte I — O produto

## 1. Apresentação

### 1.1 O nome

**Soletra**, porque é literalmente o que a extensão faz: soletra com as mãos, letra por letra. O
termo técnico para essa soletração em Libras é **datilologia**.

### 1.2 O problema

A Língua Brasileira de Sinais (Libras) tem sinais próprios para palavras e conceitos, mas nomes
próprios, marcas, termos técnicos e palavras sem sinal são **soletrados** com o alfabeto manual:
cada letra corresponde a uma configuração de mão. Para pesquisar algo na web, porém, a pessoa
surda precisa recorrer ao teclado e à escrita em português. O Soletra transforma a soletração
feita diante da câmera em texto pesquisável, sem sair do navegador.

### 1.3 O objetivo

Desenvolver uma extensão de navegador que:

1. acessa a câmera do usuário e exibe o vídeo num **painel lateral** que permanece aberto
   enquanto ele navega;
2. reconhece as **configurações de mão estáticas** do alfabeto manual de Libras e os dígitos;
3. compõe, letra por letra, um texto que o usuário pode corrigir;
4. pesquisa esse texto na plataforma que o usuário escolher.

### 1.4 Premissas que guiaram o projeto

| Premissa | Consequência no projeto |
|---|---|
| **Processamento 100% local** | Os pontos da mão são extraídos por WebAssembly empacotado na extensão. Nenhum quadro de vídeo é gravado ou transmitido |
| **Um único dado sai do dispositivo** | O texto que o usuário decide pesquisar, e só para a plataforma que ele escolher, no momento em que escolhe |
| **Nenhuma dependência externa** | Sem servidor, sem CDN, sem API de IA. As bibliotecas da interface (React e Radix UI) são empacotadas no build: tudo o que roda está dentro da extensão |
| **Funcionar sem treino** | Um modelo pronto empacotado permite reconhecer desde a primeira abertura |
| **Adaptar-se a quem usa** | O usuário pode treinar do zero ou reforçar as letras que falharem com a sua mão |
| **Erro honesto em vez de acerto inventado** | O sistema prefere dizer "não reconheci" a escrever uma letra errada |

### 1.5 O diferencial técnico

A classificação é feita sobre **landmarks** — a geometria da mão, 21 pontos em 3D — e não sobre
**pixels**. Isso traz:

- **modelo pequeno:** centenas de KB em vez de dezenas de MB;
- **robustez:** fundo, iluminação e tom de pele não chegam ao classificador, porque ele só vê
  posições de articulações;
- **treino no próprio navegador**, em segundos, sem dataset externo, sem etapa em Python e sem
  TensorFlow.js;
- **portabilidade do modelo:** as amostras são números, que podem ser exportados, importados e
  combinados entre pessoas.

---

## 2. Escopo

| Dentro do escopo | Fora do escopo desta versão |
|---|---|
| 21 letras estáticas: A B C D E F G I L M N O P Q R S T U V W Y | Letras com movimento: H, J, K, X, Z e Ç |
| 10 dígitos: 0 a 9 | Sinais de palavras e frases da Libras (a língua em si, além da datilologia) |
| Uma mão por vez, direita ou esquerda | Sinais feitos com as duas mãos |
| Chrome e Edge 114+ no computador | Firefox, Safari e navegadores de celular |
| Pesquisa em 5 plataformas e no buscador padrão | Envio do texto para outros aplicativos ou campos de páginas |
| Interface em português do Brasil | Outros idiomas |

As razões de cada exclusão estão na seção 7.

---

## 3. Jornada do usuário

Esta seção narra o uso do Soletra do início ao fim, na ordem em que uma pessoa o encontra pela
primeira vez. Cada passo remete às funcionalidades (RF) descritas na seção 5.

### 3.1 Primeira abertura

1. **Instalar e abrir.** O usuário clica no ícone do Soletra na barra do navegador e o painel
   lateral se abre à direita da página (RF69). Ele mostra só a área da câmera: o vídeo parado, o
   seletor de câmera e os botões **Iniciar câmera**, **Parar** e **Recarregar**. A área de
   reconhecimento ainda não aparece (RF16).
2. **Autorizar a câmera.** Ao clicar em **Iniciar câmera** pela primeira vez, o painel abre uma
   aba de autorização, porque o navegador não exibe o pedido de câmera dentro do painel (RF12).
   O usuário concede o acesso e volta ao painel, que já mostra o nome real das câmeras (RF13).
3. **Ligar a câmera.** Um novo clique em **Iniciar câmera** liga o vídeo, espelhado como um
   espelho (RF03, RF10). O selo muda para **Ativa** e aparece a área de reconhecimento.
4. **Escolher como começar.** Com o modelo ainda vazio, o cartão "Como você quer começar?"
   oferece **Usar modelo pronto** ou **Treinar do zero** (RF63).
5. **Consentir.** Ao ligar a chave **Reconhecimento**, o sistema explica o tratamento dos pontos
   da mão e pede consentimento uma única vez (RF15).

### 3.2 Soletrar e pesquisar

6. **Fazer o sinal.** O usuário forma uma letra diante da câmera. O anel mostra a letra
   candidata e enche à medida que o sinal se mantém (RF19); a barra de nitidez indica se o gesto
   está claro ou entre duas letras (RF20).
7. **Confirmar.** Depois de cerca de 0,7 s com o sinal estável, a letra entra no texto e o anel
   pisca em verde (RF21). Segurar o sinal não repete a letra (RF22).
8. **Repetir uma letra.** Para "SS", o usuário relaxa a mão por meio segundo e refaz o sinal, ou
   clica em **Repetir letra** (RF23).
9. **Corrigir.** **Espaço**, **Apagar**, **Limpar** e a digitação direta ajustam o texto; é assim
   que se incluem H, J, K, X e Z (RF33, RF34).
10. **Pesquisar.** **Pesquisar** abre o seletor "Onde pesquisar?", que mostra o termo e as
    plataformas em ordem alfabética (RF38, RF39). Escolhida a plataforma, a pesquisa abre numa
    nova aba (RF41). Fechar o seletor sem escolher não envia nada (RF43).

### 3.3 Ajustar e treinar

11. **Ajustar a sensibilidade.** Se letras certas não forem aceitas, o rigor **Tolerante** ajuda;
    se aparecerem letras erradas, **Exigente**. O tempo de confirmação pode ser **Rápido**,
    **Normal** ou **Calmo** (RF26).
12. **Escolher a mão.** Em **Treinar sinais**, o usuário indica se sinaliza com a direita ou a
    esquerda (RF46). Se a câmera perceber a mão oposta, a tradução trava até a mão certa voltar,
    e o aviso oferece trocar a mão ou marcar a câmera como **Invertida** (RF28).
13. **Reforçar uma letra.** Se uma letra falhar com a sua mão, um clique nela grava 20 amostras
    suas, que se somam às do modelo pronto (RF47, RF65). A grade mostra quanto espaço cada letra
    ocupa (RF61) e o uso total do armazenamento (RF62).
14. **Gerir o modelo.** O usuário pode apagar uma letra, voltar uma letra ao modelo pronto,
    apagar tudo, exportar ou importar o modelo (RF52 a RF56).

### 3.4 Uso contínuo

15. **Tela cheia.** O botão verde abre o Soletra ocupando o navegador inteiro, útil a distância
    ou em apresentação; o amarelo volta ao painel (RF70, RF71).
16. **Parar.** **Parar** desliga a câmera e esconde a área de reconhecimento; o texto continua
    guardado até o navegador ser fechado (RF04, RF16, RF36).
17. **Próximas aberturas.** A câmera escolhida, a mão, a marcação de imagem invertida de cada
    câmera, o conjunto (Letras/Números) e os ajustes são lembrados (RF08, RF26, RF46). O
    consentimento não é pedido de novo.

---

## 4. A interface, área por área

O painel é uma única página (`sidepanel/panel.html`) que funciona em dois modos: **painel
lateral** (estreito, o modo normal) e **aba** (tela cheia, com coluna centralizada de até 760 px,
vídeo e letra maiores). A interface é feita com React e os componentes do **Radix UI** (Radix
Themes), e tem três temas à escolha do usuário: **Sistema** (padrão, segue o sistema
operacional), **Claro** e **Escuro**. Sempre que o tema muda, inclusive sozinho pelo modo
Sistema, o novo se espalha pela tela a partir do botão de tema, como tinta jogada, numa animação
de cerca de 1,6 s. No escuro, a faixa do topo troca o azul-vivo da logo por um petróleo, do
azul-marinho a um ciano escuro.

| Área | Posição | Conteúdo |
|---|---|---|
| **Barra superior** | Topo | Botões redondos 🔴 🟡 🟢 (fechar, minimizar, tela cheia), o nome "Soletra", o selo de estado da câmera (Parada, Iniciando…, Ativa, Erro) e o botão de tema (Sistema / Claro / Escuro) |
| **Palco** | Abaixo do topo | O vídeo espelhado, a etiqueta AO VIVO e, com a câmera parada, um ícone e o texto de estado ("Câmera parada", "Solicitando acesso à câmera…", "Transmissão encerrada") |
| **Mensagens** | Abaixo do vídeo | Um aviso com ícone e cor: informação (azul), alerta (âmbar) ou erro (vermelho). É lido por leitores de tela (`aria-live`) |
| **Controles da câmera** | Abaixo das mensagens | Campo **Dispositivo**, botões **Iniciar câmera**, **Parar**, **Recarregar** e, quando falta permissão, **Conceder acesso à câmera** |
| **Reconhecimento** | Só com a câmera ativa | Chave **Reconhecimento** e seletor **Letras / Números** |
| ↳ **Leitura** | Com o reconhecimento ligado | O anel com a letra candidata e o cadeado, a dica, a barra de nitidez e os indicadores de desempenho |
| ↳ **Texto** | Idem | Caixa **Texto reconhecido** e botões **Espaço**, **Apagar**, **Repetir letra**, **Limpar** e **Pesquisar** |
| ↳ **Ajustar sensibilidade** | Seção recolhível | **Rigor do reconhecimento** e **Tempo para confirmar**; o título mostra o ajuste atual |
| ↳ **Avisos** | Idem | Poucas classes treinadas, letras com movimento e a trava de mão diferente da configurada, com os botões **Usar a mão …** e **A câmera inverte a imagem** |
| **Boas-vindas** | Com o modelo vazio | Cartão "Como você quer começar?" com **Usar modelo pronto** e **Treinar do zero** |
| **Treinar sinais** | Seção recolhível | Mão dominante, imagem desta câmera (**Normal / Invertida**), grade de classes (selo de amostras, % de uso, barra), barra de gravação com **Cancelar**, texto de ajuda, uso do armazenamento, **Adicionar/Restaurar modelo pronto**, **Exportar**, **Importar** e **Apagar tudo** |
| **Rodapé** | Base | Resolução e taxa da câmera ("1280×720 · 30 fps") e a nota "Vídeo processado localmente" |
| **Janelas sobrepostas** | Sobre o painel | Confirmação (Sim/Não ou rótulos próprios) e o seletor "Onde pesquisar?" |

Fora do painel há mais uma página: a **aba de autorização** (`permission/request.html`), com um
botão para disparar o pedido de câmera do navegador e o resultado da decisão.

---

## 5. Funcionalidades

Cada funcionalidade é descrita como um cenário: **o que o usuário faz**, **como o sistema
responde** e **quais alertas ou exceções** podem ocorrer. Os textos entre aspas são as mensagens
exibidas na interface.

Legenda: ✅ atendido · ⚠️ atendido com ressalva (detalhada na seção 7)

### 5.1 Câmera

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
  imagem de 1280×720 a 60 quadros por segundo — 60 é também o teto: acima disso só se gastaria
  decodificação — e, quando o vídeo chega, exibe a imagem, o selo **Ativa**, a etiqueta
  **AO VIVO** e, no rodapé, a resolução e a taxa reais (ex.: "1280×720 · 30 fps"). A área de
  reconhecimento aparece (RF16).
- **Alertas:** se a câmera entregar menos de 60 fps, o painel avisa a taxa real e o efeito: "Sua
  câmera está entregando 30 fps, abaixo dos 60 fps suportados. O reconhecimento continua
  funcionando, mas o vídeo pode ficar menos fluido." Abaixo de 15 fps — a taxa de análise
  (RF31) — o aviso diz que o reconhecimento vai responder mais devagar. A taxa avaliada é a que
  a câmera declara ao navegador; uma queda por pouca luz não é detectada.
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
  o painel não espelha de novo — senão quem sinaliza deixaria de se ver como num espelho.

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

### 5.2 Permissão e consentimento

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

### 5.3 Reconhecimento

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
- **Sistema:** **bloqueia a tradução.** Um sinal feito com a outra mão chega espelhado ao
  classificador e pode virar outra letra com confiança alta — erro silencioso, pior que "não
  reconhecido". Enquanto a trava durar, nenhuma letra é confirmada, o anel fica vermelho com
  "!", a dica diz "Tradução bloqueada: mão diferente da configurada." e uma gravação de treino
  em curso pausa ("pausado: use a mão direita"), para o modelo não aprender com a mão errada.
- **Alertas:** o painel explica: "A câmera está vendo a mão esquerda, mas o modelo está
  configurado para a mão direita. A tradução fica bloqueada até a mão certa voltar. Se você está
  usando a mão direita, esta câmera provavelmente inverte a imagem." e oferece as duas saídas:
  **Usar a mão esquerda** (troca a configuração) e **A câmera inverte a imagem** (marca a câmera
  como **Invertida**, RF46).
- **Sem falso alarme:** a indicação de mão do detector oscila de um quadro para outro,
  sobretudo com a mão de perfil. A trava só engata depois de **5 quadros seguidos** com a mão
  errada (cerca de 330 ms) e só solta depois de **3 quadros seguidos** com a certa; quadros com
  confiança abaixo de **0,8** não contam para nenhum dos lados.
- **Ressalva:** o sistema nunca troca a mão sozinho, e não há como detectar por API uma câmera
  que espelha a imagem na origem (Iriun, OBS, DroidCam): o usuário a marca uma vez, e a escolha
  fica guardada para aquela câmera.

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

### 5.4 Composição do texto

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

### 5.5 Pesquisa

#### RF37 — Botão Pesquisar ✅

- **Usuário:** clica em **Pesquisar**.
- **Sistema:** o botão só fica habilitado com texto na caixa. Antes de pesquisar, remove espaços
  nas pontas e espaços repetidos no meio.

#### RF38 — Seletor "Onde pesquisar?" ✅

- **Sistema:** abre uma janela com o **Termo reconhecido** em destaque, para conferência, e a nota
  "O texto sai do seu dispositivo apenas para a plataforma que você escolher."

#### RF39 — Plataformas em ordem alfabética ✅

- **Sistema:** a grade mostra as marcas em ordem alfabética: **Amazon, Google, Maps, Wikipédia e
  YouTube**. Uma plataforma acrescentada no futuro entra automaticamente na posição certa.

#### RF40 — Buscador padrão do navegador ✅

- **Usuário:** escolhe **Buscador padrão**, abaixo da grade.
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

### 5.6 Treino e gestão do modelo

#### RF46 — Escolha da mão dominante ✅

- **Usuário:** em **Treinar sinais**, escolhe **Direita** (padrão) ou **Esquerda**.
- **Sistema:** passa a tratar os sinais como feitos com essa mão. A mão esquerda é espelhada antes
  da análise, então as mesmas amostras (inclusive as do modelo pronto) servem para as duas mãos,
  sem treinar de novo. A escolha fica salva e não pode ser trocada durante uma gravação.
- **Imagem desta câmera:** logo abaixo, **Normal** (padrão) ou **Invertida**. Câmeras que
  espelham a imagem na origem fazem a mão direita parecer a esquerda; marcada como Invertida, a
  câmera tem a imagem corrigida na normalização, na trava do RF28 e na exibição (RF10). A
  escolha é guardada **por câmera**, então quem alterna entre a Iriun e a webcam integrada não
  reconfigura a cada troca. Fica desabilitada sem câmera ativa e durante uma gravação.
- **Atenção:** amostras pessoais gravadas antes de marcar uma câmera como Invertida ficaram com
  os lados trocados e podem precisar ser gravadas de novo.
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

### 5.7 Modelo pronto

#### RF63 — Escolha inicial: modelo pronto ou treino do zero ✅

- **Usuário:** liga a câmera pela primeira vez, com o modelo ainda vazio.
- **Sistema:** mostra o cartão "Como você quer começar?":
  - **Usar modelo pronto** instala o modelo e avisa "Modelo pronto carregado: 1550 amostras em 31
    classes. Ligue o Reconhecimento para começar." O reconhecimento funciona sem nenhum treino;
  - **Treinar do zero** fecha o cartão (que não volta nessa abertura) e abre **Treinar sinais**.
- **Exceções:** o cartão só aparece se a extensão trouxer o modelo pronto.

#### RF64 — Modelo pronto empacotado ⚠️

- **Sistema:** a extensão traz um modelo com 31 classes (21 letras e 10 números) e 50 amostras
  por classe, que funciona sem treino e sem baixar nada.
- **Ressalva:** o modelo atual foi gravado por **uma pessoa só**, então pode reconhecer pior a
  mão de outras pessoas (seção 7.1).

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

### 5.8 Janela e interface

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
- **Sistema:** em **Sistema** (o padrão), segue o claro ou escuro do sistema operacional e troca
  junto com ele. A escolha fica salva e vale ao mesmo tempo para o painel e para a aba de
  autorização da câmera. A interface cabe na largura estreita do painel lateral e, em tela
  cheia, usa uma coluna centralizada com vídeo e letra maiores.
- **Transição:** toda troca que muda a aparência é animada (cerca de 1,6 s): o tema novo se
  espalha a partir do botão de tema como tinta jogada, numa mancha de bordas irregulares e com
  gotas, diferente a cada troca, e o ícone do botão entra girando. Vale também quando o tema
  muda sozinho (modo Sistema) ou foi trocado na outra página. Escolher um tema que não muda a
  aparência (ex.: de Sistema para Escuro com o sistema já escuro) não anima, pois a tela não muda.
- **Faixa do topo:** no claro, o degradê azul da logo; no escuro, um petróleo (azul-marinho a
  ciano escuro), com o ladrilho da logo em branco azulado para não ofuscar.

**Total: 74 funcionalidades — 70 plenamente atendidas e 4 com ressalva (RF28, RF56, RF64, RF70).**

---

## 6. Requisitos não funcionais

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
| RNF11 | **Conformidade com a LGPD** | Consentimento, eliminação, portabilidade e política de privacidade (seção 18) | ⚠️ |
| RNF12 | **Compatibilidade** | Chrome e Edge 114+ (Manifest V3) | ⚠️ |

---

## 7. Pontos não atendidos e limitações conhecidas

### 7.1 Reconhecimento

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

### 7.2 Plataforma e interface

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

### 7.3 Desempenho e ambiente

| Ponto | Situação | Detalhe |
|---|---|---|
| **Aceleração de hardware do navegador** | Problema conhecido | Com a aceleração gráfica ligada, o vídeo de webcam virtual chegou com atraso e o painel perdeu fluidez. **Desativá-la** (`chrome://settings/system`) resolveu. A extensão não consegue detectar nem contornar isso |
| **Webcam pelo celular (Iriun) via Wi-Fi** | Limitação externa | A transmissão sem fio acrescenta latência à imagem; por cabo USB ela é menor |
| **Detecção na thread do painel** | Limitação de projeto | O `detectForVideo` é síncrono; por isso a taxa é limitada a 15 Hz. Rodar a detecção num Web Worker foi experimentado e revertido, porque o atraso percebido vinha da aceleração de hardware, não daqui |
| **Modelo "frio" a cada abertura** | Não atendido | O detector é recriado sempre que o painel abre (~84 ms medidos no spike). Um documento `offscreen` o manteria carregado |

### 7.4 Qualidade, publicação e documentação

| Ponto | Situação | Detalhe |
|---|---|---|
| **Testes de interface** | Não atendido | Os 108 cenários cobrem a lógica (e o gerador da tinta da troca de tema). Interface (DOM), integração com o Chrome e o adaptador do MediaPipe não têm teste automatizado; o adaptador é validado pelo spike de diagnóstico e o resto, por roteiro manual (seção 17.4) |
| **Publicação nas lojas** | Não atendido | Não publicado na Chrome Web Store nem no Edge Add-ons. Falta hospedar a política de privacidade numa URL pública e preencher as justificativas de câmera e de `search` |
| **Consentimento escrito dos voluntários** | Pendente (RNF11) | O `PRIVACY.md` afirma que quem contribuiu para o modelo pronto consentiu. Esse consentimento precisa ser **registrado por escrito**, inclusive o do autor, e anexado ao TCC |
| **Imagens de origem das logos** | Fora do repositório | `tools/preparar-logos.mjs` não pode ser reexecutado; os PNGs finais estão empacotados e sua presença é conferida por teste |
| **Nomenclatura mista** | Menor | O código de câmera herdado da v0.1.0 usa nomes em inglês (`CameraController`, `showMessage`); o resto, português |

---

# Parte II — Como funciona por dentro

## 8. Arquitetura

### 8.1 Componentes

```
┌──────────────────────── Navegador (Chrome / Edge) ────────────────────────┐
│                                                                           │
│  Painel lateral ou aba  (sidepanel/panel.html)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ nucleo.js ── orquestra a página (sem React)                         │  │
│  │   ├─ CameraController ──── getUserMedia ──► <video>                 │  │
│  │   ├─ SignRecognizer                                                 │  │
│  │   │    ├─ InferenceLoop (rVFC, 15 Hz)                               │  │
│  │   │    ├─ HandLandmarkerAdapter ── MediaPipe WASM (vendor/)         │  │
│  │   │    ├─ extrairFeatures ── SignClassifier ── SignStabilizer       │  │
│  │   │    ├─ TextComposer                                              │  │
│  │   │    └─ SignModelStore ── chrome.storage.local                    │  │
│  │   ├─ componentes React + Radix Themes  (desenham o estado)          │  │
│  │   ├─ dialogo / seletor-plataforma      (janelas sobrepostas)        │  │
│  │   └─ janela                            (fechar / painel / tela cheia)│  │
│  └───────────────┬───────────────────────────────▲─────────────────────┘  │
│                  │ mensagem "soletra:pesquisar"  │ "soletra:permission-result"
│                  ▼                               │                        │
│  Service worker (background/)            Aba de autorização (permission/) │
│   ├─ abre o painel no clique do ícone     └─ dispara o pedido de câmera   │
│   └─ abre a aba de pesquisa ──► plataforma escolhida (único dado que sai) │
└───────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Princípios de organização

- **Um callback de estado por controlador.** `CameraController` e `SignRecognizer` expõem cada um
  uma única função de notificação com o estado completo (*snapshot*). `sidepanel/nucleo.js`
  guarda a última snapshot de cada um em lojas mínimas (`ui/loja.js`), que os componentes React
  leem com `useSyncExternalStore`. Os componentes só desenham e chamam ações; a regra de
  negócio continua no núcleo, fora do React. Câmera e reconhecedor nascem com o módulo, não com
  um componente, para que nenhuma remontagem abra uma segunda câmera ou um segundo detector.
- **O reconhecedor consome o mesmo estado da câmera.** Não há um segundo canal de eventos: quando
  a câmera muda de estado, o painel repassa a mesma snapshot ao reconhecedor, que liga ou pausa
  o loop.
- **Isolar o que não é testável.** Só `hand-landmarker.js` depende de WebAssembly, e só
  `sign-recognizer.js` acessa o ambiente real (relógio, storage, WASM) sem permitir
  substituição. Todo o resto é função pura ou classe com dependências injetadas, testável em
  Node.
- **Render barato.** O reconhecedor emite a 15 Hz. Componentes que dependem de um pedaço só do
  estado leem esse pedaço por seletor, e não redesenham a cada quadro; os botões da grade de
  treino são memorizados (`React.memo`) com propriedades primitivas, e só a classe que mudou é
  redesenhada. Recriar os 21 botões a cada amostra (cerca de 7 vezes por segundo durante a
  gravação) saturava a thread do painel e fazia cliques — inclusive o de Cancelar — serem
  perdidos.

### 8.3 Ciclo de vida

| Momento | O que acontece |
|---|---|
| Abertura do painel | Migra chaves antigas, lê a permissão de câmera, carrega nomes das câmeras e a preferida, restaura preferências e texto, carrega o modelo. **Não** carrega o MediaPipe |
| Primeira ativação do reconhecimento | Pede consentimento; carrega o bundle do MediaPipe (import dinâmico de 155 KB), o WASM (11,8 MB) e o modelo de mão (7,8 MB) |
| Câmera ativa + reconhecimento ligado | O loop de inferência roda; caso contrário, fica pausado |
| Desligar o reconhecimento | Para o loop; o detector continua em memória para religar rápido |
| Fechamento do painel (`pagehide`) | Libera a câmera e o detector |
| Troca painel ↔ aba | A página que sai anota o que estava ligado e solta a câmera; a que entra religa |

---

## 9. O pipeline de reconhecimento em detalhe

```
Câmera ─► MediaPipe HandLandmarker ─► 21 pontos (x, y, z)
       ─► normalização ─► vetor de 63 números
       ─► KNN sobre as amostras (modelo pronto + treino do usuário)
       ─► estabilização temporal ─► caractere confirmado
       ─► caixa de texto ─► Pesquisar ─► plataforma escolhida
```

### 9.1 Captura (`camera-controller.js`)

- Pede `getUserMedia` com resolução ideal de **1280×720** e taxa `{ ideal: 60, max: 60 }`, sem
  áudio. Com uma câmera escolhida, usa `deviceId: { exact }` para garantir aquela câmera.
- `avaliarTaxaDeQuadros()` lê a taxa negociada em `track.getSettings()`, arredondada (59,94 conta
  como 60), e o painel avisa quando ela fica abaixo de `FPS_MAXIMO` (60).
- Cada chamada de `start()` recebe um *token*: se o usuário parar ou trocar de câmera enquanto o
  navegador ainda responde, o resultado antigo é descartado e sua câmera, liberada.
- `stop()` encerra todas as *tracks* e solta o `srcObject`: o LED da câmera apaga.
- Escuta `devicechange` (câmeras conectadas e removidas) e o evento `ended` da track (desconexão
  física ou bloqueio pelo sistema).

### 9.2 Agendamento (`inference-loop.js`)

- Usa **`requestVideoFrameCallback`**, que dispara uma vez por quadro de vídeo realmente novo e
  pausa junto com o vídeo. Um `setInterval` dispararia mesmo sem quadro novo e faria o MediaPipe
  reprocessar a mesma imagem.
- **Taxa alvo de 15 Hz.** O `detectForVideo` do MediaPipe é síncrono e ocupa a thread do painel
  por cerca de 23 ms; 30 Hz travariam a interface sem ganho perceptível de precisão.
- **Recuo adaptativo:** guarda as últimas 30 latências; se o p95 passar de 50 ms, cai para 8 Hz;
  quando o p95 fica abaixo de 25 ms, volta a 15 Hz.
- **Timestamp monotônico próprio:** o MediaPipe exige timestamps estritamente crescentes. O tempo
  do vídeo (`mediaTime`) recomeça ao trocar de câmera, e um timestamp que regride faz o MediaPipe
  devolver resultados vazios **sem erro**. O loop usa `max(anterior + 1, agora)`.
- Sem `requestVideoFrameCallback`, cai para `requestAnimationFrame`.

### 9.3 Detecção (`hand-landmarker.js`)

- Modelo `hand_landmarker.task` do MediaPipe Tasks Vision 1.0.1, em modo **VIDEO**, com **uma
  mão** (`numHands: 1`) e confiança mínima de 0,5 para detecção, presença e rastreamento.
- Delegate **CPU** (ver decisões, seção 16).
- Devolve os 21 pontos da mão, a lateralidade detectada e a confiança dela. A lateralidade do
  MediaPipe pressupõe imagem espelhada, e a câmera entrega a imagem crua, então ela é invertida
  antes de ser usada. Ela alimenta a trava de mão (RF28), nunca a normalização, que segue a mão
  configurada pelo usuário.

### 9.3.1 Trava de mão (`trava-mao.js`) e câmera invertida

- O `SignRecognizer` corrige a lateralidade pela marcação da câmera: numa câmera **Invertida**,
  a mão vista é trocada antes da comparação, e a normalização recebe a mão **como ela aparece no
  quadro** (a direita vira esquerda), o que mantém as amostras compatíveis com o modelo pronto.
- A `TravaMao` compara, quadro a quadro, a mão detectada com a configurada, com histerese:
  **5 quadros** seguidos com a mão errada para travar, **3** com a certa para soltar, e quadros
  com confiança abaixo de **0,8** ignorados — sem zerar a contagem, para um quadro de perfil no
  meio não adiar a trava indefinidamente.
- Travada, o quadro vale como "sem mão" para o estabilizador (o candidato em formação se perde),
  o estado visual vira `mao-incorreta` e a captura de treino não grava. Trocar a mão, a marcação
  da câmera ou a própria câmera reinicia a trava.

### 9.4 Normalização (`sign-features.js`)

Transforma os 21 pontos num vetor de **63 números** comparável entre pessoas, distâncias da
câmera e resoluções. É o módulo mais delicado: um erro aqui não quebra nada visivelmente, só
derruba a acurácia em silêncio.

| Passo | O que faz | Por quê |
|---|---|---|
| 1. Isotropia | Multiplica x (e z) pela proporção largura/altura da imagem | O MediaPipe normaliza x pela largura e y pela altura separadamente. Em 1280×720 isso esticaria o eixo horizontal 1,78×, e um modelo treinado numa resolução deixaria de valer em outra |
| 2. Quiralidade | Se a mão configurada é a esquerda, inverte o eixo horizontal | Leva a mão esquerda ao referencial da direita: um modelo treinado por um destro serve a um canhoto sem retreinar |
| 3. Translação | Subtrai o **centroide da palma** (punho + 4 articulações da base dos dedos) | O punho isolado treme e arrastaria o vetor inteiro |
| 4. Escala | Divide pelo **raio RMS da palma**, em 2D | Usar os 21 pontos normalizaria a extensão dos dedos — justamente o que distingue mão aberta de punho |
| 5. Rotação | **Desligada** por padrão (existe como opção de experimento) | A orientação da palma é parâmetro fonológico da Libras: normalizá-la apagaria informação que distingue configurações |
| 6. Peso do z | Multiplica a profundidade por **0,3** | O z de câmera comum é uma estimativa ruidosa; com peso cheio, contaminaria as 63 dimensões |

As amostras gravadas são arredondadas para 4 casas decimais, o que reduz o JSON à metade sem
efeito na distância. A constante `VERSAO_FEATURES` (hoje 1) identifica a fórmula: se ela mudar,
os modelos gravados com a anterior são **recusados** (RF59).

### 9.5 Classificação (`sign-classifier.js`)

**Algoritmo:** KNN (k vizinhos mais próximos) com **k = 5**, distância euclidiana e voto
ponderado por **1/(d + ε)** — um vizinho muito próximo pesa mais que três distantes, o que importa
nas fronteiras entre configurações parecidas. A busca considera só as classes do conjunto ativo
(Letras ou Números).

Depois do voto, dois testes decidem se a classe vencedora é aceita:

| Teste | Regra | Função |
|---|---|---|
| **Razão** | Rejeita se a distância à vencedora passar de **97%** da distância à classe concorrente mais próxima (motivo "ambíguo") | Descartar empates. É frouxo de propósito: no alfabeto manual as classes são naturalmente parecidas (M, N, S e A são todas punhos), e uma resposta **correta** costuma vir com razão entre 0,83 e 0,93. A 0,80, o classificador acertava 95% e o teste descartava 85% desses acertos |
| **Distância absoluta** | Rejeita se a distância à vencedora passar do limiar **τ_abs × rigor** (motivo "distante") | A rede de segurança: mão relaxada ou gesto não treinado ficam longe de tudo |

O **rigor** da interface multiplica os limiares: Tolerante 1,25, Normal 1,0, Exigente 0,8.

A **barra de nitidez** (RF20) é derivada da razão: `(limiar − razão) ÷ limiar`. Assim, "barra
cheia" e "sinal aceito" são o mesmo critério para o usuário.

### 9.6 Calibração do limiar de rejeição

O limiar τ_abs é **1,3 raios de palma**, constante, elevado apenas se as amostras do usuário forem
mais dispersas que o previsto (90º percentil da distância de cada amostra à vizinha mais próxima
da mesma classe, × 5). É recalculado automaticamente sempre que o modelo muda.

A constante só é possível porque a normalização dá ao espaço de 63 dimensões uma **escala física
fixa**. Medido em modelo sintético com 5, 10 e 21 classes, a consulta legítima fica em p95 ≈ 0,75
— estável, porque depende da variação da mão e não do modelo —, enquanto mão relaxada e gesto
não treinado ficam acima de 2,1. O 1,3 está no meio dessa folga.

Esta é a **terceira** fórmula (`VERSAO_CALIBRACAO = 3`). As duas anteriores falharam, e o registro
faz parte do resultado do trabalho:

| Versão | Fórmula | Por que falhou |
|---|---|---|
| 1 | Dispersão **interna** das classes × 2 | Media o tremor durante a captura (mão parada, amostras a 150 ms), não a variação ao refazer o sinal depois. O limiar saía cerca de 3× menor que o necessário e rejeitava tudo |
| 2 | Separação **entre** classes × 1,2 + teste de razão | Encolhia à medida que classes eram adicionadas (0,66 com 5 classes, 0,32 com 21): apertava justamente quando o alfabeto ficava completo |
| 3 | Constante 1,3, elevada só pela dispersão interna, + teste de razão | Em uso |

Modelos salvos com uma fórmula anterior são recalibrados em silêncio ao abrir: as amostras
continuam válidas, só o limiar derivado delas muda.

### 9.7 Estabilização temporal (`sign-stabilizer.js`)

Classificar quadro a quadro produziria uma enxurrada de letras a cada tremor. O estabilizador
transforma o fluxo ruidoso em confirmações discretas, em cinco estágios:

| Estágio | Regra |
|---|---|
| 1. Rejeição | Cada quadro vira um símbolo: a classe, "desconhecido" (rejeitado ou confiança < 0,5) ou "sem mão" |
| 2. Votação | Janela dos últimos **400 ms** (medida em tempo, não em quadros, porque a taxa varia). O vencedor precisa de **55%** dos quadros e, se for uma classe, de pelo menos **3** quadros |
| 3. Permanência | O cronômetro conta desde o quadro mais antigo do vencedor ainda na janela e reinicia quando o vencedor muda. Contar a partir do momento da votação somaria o aquecimento ao tempo prometido ao usuário |
| 4. Confirmação | Vencedor que é classe e permanece **700 ms** (ajustável: 450 / 700 / 1000) é confirmado e fica **travado**. A trava só barra a **mesma** letra; outra letra confirma direto |
| 5. Liberação | Usa os quadros **crus**, não a votação: **200 ms** fora da letra travada a destravam. Um "piso" impede que quadros anteriores à liberação, ainda na janela, confirmem a mesma letra de novo no instante seguinte |

Uma lacuna de mais de **500 ms** entre quadros (painel oculto, câmera pausada) esvazia a janela,
para não confirmar um sinal feito antes da pausa. O relógio é sempre recebido como argumento,
nunca lido dentro do módulo, o que torna a máquina de estados testável sem tempo real.

### 9.8 Composição do texto (`text-composer.js`)

Guarda o texto, com limite de 200 caracteres, e oferece acrescentar, espaço (nunca no início nem
duplicado), apagar, limpar e definir (edição manual). Para a busca, remove espaços nas pontas e
reduz espaços repetidos a um. O texto é salvo em `chrome.storage.session` meio segundo após cada
mudança, e some quando o navegador fecha — o que é também a escolha certa de privacidade.

---

## 10. Modelo, armazenamento e formato dos arquivos

### 10.1 Onde cada dado fica

| Chave | Área | Conteúdo |
|---|---|---|
| `soletra.modelo.v1.indice` | `storage.local` | Esquema, versão das features, mão, τ_abs, k, versão da calibração, contagem de amostras pessoais e do modelo pronto por classe |
| `soletra.modelo.v1.classe.<X>` | `storage.local` | Amostras **pessoais** da classe X |
| `soletra.modelo.v1.padrao.<X>` | `storage.local` | Amostras do **modelo pronto** na classe X |
| `soletra.reconhecimento.prefs` | `storage.local` | Mão, conjunto, rigor, tempo para confirmar e câmeras marcadas como invertidas (por `deviceId`) |
| `soletra.preferredDeviceId` | `storage.local` | Última câmera escolhida |
| `soletra.consentimento.reconhecimento` | `storage.local` | Data e versão do aceite |
| `soletra.texto` | `storage.session` | Texto composto |
| `soletra.janela.retomar` | `storage.session` | O que religar na troca painel ↔ aba; apagado ao ser lido |

Uma chave por classe, e não um único bloco, para que gravar uma amostra reescreva só a classe
afetada.

### 10.2 Origem das amostras: modelo pronto × pessoais

As amostras do modelo pronto ficam em chaves próprias, separadas das pessoais. Ao carregar, o
armazenamento entrega as duas listas **juntas** ao classificador, que não distingue a origem, e
entrega à interface a contagem separada (`padrao`, `pessoal`) para o selo "50+8". A separação
permite três coisas que uma lista única não permitiria:

- **voltar uma letra ao padrão** apagando só o que o usuário gravou nela;
- no limite de 100, **sair primeiro a amostra genérica** e só depois a pessoal mais antiga;
- **reinstalar o padrão sem perder o treino pessoal**.

### 10.3 Limites

| Limite | Valor | Regra |
|---|---|---|
| Amostras por gravação | 20 | Recomendado: acima disso o ganho de acurácia não paga o tempo |
| Teto por classe | 100 | Ao exceder, cede primeiro o padrão, depois a pessoal mais antiga |
| Modelo pronto por classe | 50 | Metade do teto, deixando 50 lugares para o reforço. Na instalação entram `min(50, 100 − pessoais)` |
| Quota do `storage.local` | 10 MB | Aviso na interface a partir de 80% (RF62); 31 classes × 100 amostras ficam muito abaixo disso |

### 10.4 Formato do arquivo exportado

```json
{
  "formato": "soletra-modelo",
  "esquema": 1,
  "versaoFeatures": 1,
  "criadoEm": "2026-10-21T14:00:00.000Z",
  "mao": "direita",
  "tauAbs": 1.3,
  "k": 5,
  "classes": {
    "A": [[0.1234, -0.5678, "… 63 números por amostra …"]],
    "B": [["…"]]
  }
}
```

O export traz as amostras do modelo pronto e as pessoais juntas; reimportado, tudo passa a contar
como pessoal. Tamanho típico: ~430 KB com as 21 letras e ~640 KB com letras e números, a 20
amostras por classe.

### 10.5 Validação na importação

O arquivo é validado **antes** de qualquer escrita, para que um arquivo ruim não deixe o modelo
do usuário pior do que estava. É recusado se: não for um objeto JSON; o `formato` não for
`soletra-modelo` (ou o antigo `rvl-libras-modelo`); o `esquema` ou a `versaoFeatures` forem
diferentes dos atuais; faltar o bloco `classes`; houver classe fora do catálogo, amostra com
tamanho diferente de 63 ou valor não numérico; ou não houver nenhuma amostra. Classes com mais de
100 amostras são cortadas às 100 mais recentes. O armazenamento suporta os modos **substituir** e
**mesclar**; a interface oferece só substituir (seção 7).

### 10.6 Versionamento e migração

| Mecanismo | Quando muda | Efeito |
|---|---|---|
| `ESQUEMA` (1) | Estrutura do armazenamento | Modelo de outro esquema é recusado |
| `VERSAO_FEATURES` (1) | Fórmula de normalização | Modelo de outra versão é **recusado**, com aviso (RF59): reinterpretar não daria erro, daria queda de acurácia sem causa aparente |
| `VERSAO_CALIBRACAO` (3) | Fórmula do limiar | Limiar **recalculado em silêncio**; as amostras continuam válidas |
| Migração `rvl.*` → `soletra.*` | Troca de nome do produto | Na abertura, move as chaves antigas para as novas, sem sobrescrever dado novo; é idempotente |

---

## 11. O modelo pronto

### 11.1 Por que existe

Até a versão 0.2.0, cada pessoa precisava treinar 20 amostras × 21 letras (e mais 10 números)
antes de ver qualquer letra reconhecida. Era a maior barreira de entrada do projeto: quem abria
a extensão pela primeira vez não via nada funcionando.

### 11.2 Como chega ao usuário

O arquivo `modelos/padrao.json` (~725 KB, 31 classes × 50 amostras) vem dentro do pacote da
extensão e é lido localmente; nada é baixado. Ele tem o mesmo formato do **Exportar**, com dois
campos a mais: `pessoas` (quantos exports foram combinados) e `tauAbs: null`, porque o limiar é
sempre recalculado sobre o conjunto final. A mão gravada no arquivo é ignorada: as features já
espelham a esquerda, então o mesmo padrão serve às duas mãos.

### 11.3 Como é montado (`tools/montar-modelo-padrao.mjs`)

```
node tools/montar-modelo-padrao.mjs --por-classe 50 --saida modelos/padrao.json pessoa1.json pessoa2.json …
```

1. Valida cada export com a mesma rotina da importação; um arquivo inválido interrompe a montagem
   indicando qual.
2. Para cada classe, distribui as 50 vagas entre as pessoas **como quem distribui cartas**, uma a
   uma, para que quem gravou mais não domine; a sobra de quem gravou pouco vai para os outros.
3. Dentro da cota de cada pessoa, escolhe amostras **espalhadas** pela sessão de gravação, e não
   as primeiras, porque amostras coladas no tempo são quase iguais.
4. Avisa quando há menos de **3 pessoas** ou quando uma classe tem um único contribuinte.

### 11.4 O arquivo atual

Gerado a partir do modelo do autor (31 classes × 60 amostras, **uma pessoa**), reduzido a 50
amostras por classe escolhidas espalhadas pela sessão. A generalização para outras mãos não foi
medida (seção 7.1).

---

## 12. MediaPipe, CSP do Manifest V3 e integridade dos binários

### 12.1 O "mito" do MediaPipe no Manifest V3

É comum ler que o Manifest V3 impede usar MediaPipe. A limitação vale para o pacote **legado**
(`@mediapipe/hands`, `holistic`), cujo código gerado usava `new Function()`, proibido pela CSP. O
pacote atual, `@mediapipe/tasks-vision`, não tem nenhuma ocorrência de `new Function` nem de
`eval(`. Basta declarar:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
}
```

Sem a declaração, o WebAssembly é bloqueado; declarando qualquer coisa além disso, o Chrome recusa
a instalação. A hipótese foi provada pelo **spike** da fase 0 (seção 17.3) antes de qualquer
outra linha da arquitetura.

### 12.2 Binários vendorizados

| Arquivo | Tamanho |
|---|---|
| `vendor/mediapipe/vision_bundle.mjs` | 155 KB |
| `vendor/mediapipe/wasm/vision_wasm_internal.js` | 323 KB |
| `vendor/mediapipe/wasm/vision_wasm_internal.wasm` | 11,8 MB |
| `vendor/mediapipe/hand_landmarker.task` | 7,8 MB |

Ficam **commitados no repositório**: a CSP proíbe CDN, e as lojas tratam download de código em
tempo de execução como "código remoto". A versão é fixada em **1.0.1**, porque `@latest` publica
builds `rc.<data>` diários. O `FilesetResolver` do MediaPipe não é usado: o conjunto de arquivos
é montado à mão, o que evita a sonda de SIMD em tempo de execução (que apontaria para arquivos
`_nosimd_` não vendorizados).

### 12.3 Integridade

`tools/verificar-vendor.mjs` confere o SHA-256 de cada arquivo contra `INTEGRIDADE.json`. O
`.gitattributes` marca `vendor/**` e `modelos/*.json` como `-text`, para que o Git do Windows
(`core.autocrlf=true`) não converta as quebras de linha dos `.js` ao clonar — o que mudaria o hash
com o conteúdo intacto. O verificador reconhece esse caso e o distingue de adulteração:

| Resultado | Significado |
|---|---|
| `OK` | Arquivo íntegro |
| `CRLF` | Conteúdo intacto, só as quebras de linha foram convertidas; indica o comando de correção |
| `DIVERGE` | Arquivo diferente do esperado: deve ser baixado de novo da fonte oficial |
| `FALTA` | Arquivo ausente |

---

## 13. A pesquisa

- O catálogo de destinos fica em `src/search-targets.js`: Amazon (`amazon.com.br/s`), Google
  (`google.com/search`), Maps (`google.com/maps/search`), Wikipédia (`pt.wikipedia.org`) e YouTube
  (`youtube.com/results`), exibidos em ordem alfabética, mais o **buscador padrão** do navegador.
- O termo passa sempre por `encodeURIComponent`: um "&" ou "#" digitado na caixa não pode truncar
  a consulta nem injetar parâmetros na URL de terceiros.
- A navegação é executada pelo **service worker**, não pelo painel. Para o buscador padrão, a aba
  é criada antes e passada por `tabId` a `chrome.search.query`; com `disposition`, o navegador
  teria de deduzir a aba a partir de quem chamou, e o painel lateral não é uma aba (chamar daqui
  chegou a derrubar o navegador).
- Se `chrome.search` falhar, a mesma aba recebe a busca do Google, para o usuário não ficar com
  uma aba em branco, e o painel avisa.
- A pesquisa é o **único ponto em que algo sai do dispositivo**, e só depois da escolha explícita
  do destino.

---

## 14. Janela, painel e tela cheia

- **Por que painel lateral e não popup:** o popup de extensão fecha ao perder o foco, o que
  destrói a página e encerra a câmera. O painel lateral (`chrome.sidePanel`, Chrome/Edge 114+)
  fica aberto enquanto o usuário navega.
- **Um único arquivo, dois modos:** `panel.html` é o painel; `panel.html?modo=aba` é a tela
  cheia, numa aba da janela atual. O Chrome não permite que uma extensão alargue o painel
  lateral, e uma aba é o mais perto disso; a primeira versão abria uma janela nova e foi trocada.
- **Uma página por vez:** em muitas webcams no Windows o acesso é exclusivo. A página que sai
  anota o que estava ligado em `storage.session`, solta a câmera e só então abre a outra, que
  lê a anotação, apaga-a e religa câmera e reconhecimento (conferindo o consentimento).
- **Gesto do usuário:** `chrome.sidePanel.open` só funciona dentro do clique, sem nenhuma espera
  antes; por isso a janela da aba é descoberta já na abertura da página.
- **Sem permissão nova:** abrir, recarregar e fechar abas da própria extensão não exige
  permissão no manifesto.

---

## 15. As logos das plataformas

As cinco logos ficam empacotadas em `icons/plataformas/` (~20 KB no total), porque a CSP
bloquearia imagens remotas e a interface não pode depender de rede para se desenhar. Foram
preparadas por `tools/preparar-logos.mjs`, que resolveu um problema curioso: três das cinco
imagens de origem eram capturas de um preview de transparência, com o **quadriculado gravado nos
pixels** (0% de transparência real, medido nas logos do Maps e da Amazon).

Um limiar de cor não serviria: a logo da Wikipédia é um globo branco sobre quadriculado branco e
cinza-claro, e "todo pixel claro é fundo" a apagaria inteira. A ferramenta reconhece o fundo pelo
que ele é — um padrão que **alterna** em células regulares —, estimando período e fase pelas
trocas de tom na primeira linha e coluna, com período **fracionário e por eixo** (a logo da
Amazon tinha células de 19,93 px em x e 20,08 px em y; arredondar para 20 invertia o padrão na
metade oposta da imagem). Depois apara, centraliza num quadrado e reduz para 96×96, de 167 KB
para ~20 KB. As imagens de origem não estão no repositório; a ferramenta fica como registro de
proveniência.

---

# Parte III — Decisões

## 16. Registro de decisões e alternativas descartadas

### 16.1 Decisões de arquitetura

| Decisão | Alternativa descartada | Justificativa |
|---|---|---|
| **Classificar landmarks** | Classificar pixels (como o Teachable Machine) | Modelo de KB, robusto a fundo, luz e tom de pele, treinável no navegador |
| **KNN** | Rede neural | Poucas amostras por classe, treinadas pelo usuário: não há dados nem tempo para otimizar pesos. A inferência sobre ~1.550 vetores leva frações de ms |
| **Limiar constante (1,3)** | Limiar por dispersão interna; por separação entre classes | As duas alternativas foram implementadas e falharam (seção 9.6) |
| **Teste de razão frouxo (0,97)** | Teste apertado (0,80) | A 0,80, 85% dos acertos eram descartados |
| **Rotação preservada** | Normalizar a rotação | A orientação da palma é parâmetro fonológico da Libras |
| **Delegate CPU** | GPU | No spike (Edge 153): CPU p50 22,9 ms contra 58,4 ms no GPU, que paga a leitura de textura e exigiria um contexto WebGL vivo num painel que pode ser recolhido |
| **`requestVideoFrameCallback`** | `setInterval` | Dispara só com quadro novo e pausa com o vídeo |
| **Detector sob demanda** | Carregar ao abrir o painel | Abrir o painel não deve pagar ~20 MB e a compilação do WASM por algo que o usuário talvez não use |
| **Painel lateral** | Popup | O popup fecha ao perder o foco e encerra a câmera |
| **Tela cheia como aba** | Janela nova | Integra-se ao navegador e reaproveita a aba existente |
| **Binários commitados, versão fixa** | CDN, `@latest` | Proibido pela CSP; irreprodutível |
| **`.gitattributes` para o vendor** | Confiar na configuração local do Git | Clones no Windows corrompiam o hash |
| **Pesquisa no service worker** | Navegar a partir do painel | O painel não é aba; chamar `chrome.search` dali derrubava o navegador |
| **Modelo pronto em chaves separadas** | Misturar com as pessoais | Permite voltar ao padrão por letra e fazer o padrão ceder primeiro |
| **Modelo pronto empacotado** | Baixado de um servidor | Nada de recurso remoto; escolher o modelo pronto não envia nem recebe nada |
| **Teto de 100, padrão com 50** | Teto de 60 (versão anterior) | Metade livre para o reforço pessoal |
| **Modais próprios** | `window.confirm` | Bloqueado ou ignorado no painel; consentimento e exclusão não podem falhar em silêncio |
| **Consentimento antes da 1ª ativação** | Aviso só na política | Dado biométrico derivado exige consentimento específico e destacado (LGPD) |
| **Área de reconhecimento só com câmera ativa** | Sempre visível | Sem vídeo não há o que reconhecer nem treinar |
| **Plataformas em ordem alfabética** | Ordem do catálogo | Previsibilidade; uma plataforma nova entra no lugar certo |
| **React + Radix Themes, com build (Vite)** | JavaScript puro sem build (versão anterior) | Componentes acessíveis prontos (foco, teclado, leitor de tela), tema claro/escuro coerente e um visual único; a lógica em `src/` continua JavaScript puro, sem React, e testável em Node |
| **Tema Sistema / Claro / Escuro** | Só seguir o sistema operacional | Quem usa o painel numa apresentação ou num ambiente claro precisa poder escolher; "Sistema" continua o padrão |
| **Paleta gerada a partir da logo** | Uma cor pronta do Radix (blue, indigo) | Nenhuma é o azul da marca (#0060FF). As escalas são geradas mantendo a luminosidade de cada degrau do Radix, o que preserva os contrastes; o escuro vira azul-marinho e o claro, branco azulado. O azul-céu da lupa (#00B4FC) entra como cor secundária, para o tema claro não ficar só branco e azul |
| **Português no código** | Inglês | Coerência com o domínio (Libras); exceção no código de câmera herdado da v0.1.0 |

### 16.2 Experimento descartado: detecção num Web Worker

Durante a investigação de um atraso no vídeo, foi implementada uma versão que rodava o MediaPipe
num Web Worker, com envio de quadros reduzidos a 640 px e taxa de 30 Hz. A causa real do atraso
se revelou externa (a aceleração de hardware do navegador, seção 19.3), e a mudança foi
**revertida** por não ser necessária: acrescentava complexidade e um caminho não testável sem
benefício comprovado. Fica registrada como alternativa caso a detecção na thread do painel se
torne um gargalo.

### 16.3 Por que H, J, K, X e Z ficaram de fora

Essas letras (e o Ç) envolvem **movimento**: o significado está na trajetória, não numa pose. Um
classificador quadro a quadro não representa trajetória, e fingir que representa produziria
confusão sistemática em vez de erro honesto. A decisão foi declarar a limitação na interface e
permitir completá-las digitando, em vez de entregar um reconhecimento não confiável.

### 16.4 Por que Letras e Números não são reconhecidos juntos

Letras e números compartilham configurações de mão (O e 0, V e 2, W e 3). Classificá-los juntos
obrigaria o sistema a adivinhar entre formas idênticas; o seletor **Letras / Números** deixa essa
escolha com o usuário.

---

# Parte IV — Qualidade e conformidade

## 17. Testes e verificação

### 17.1 Testes automatizados

```
node tests/todos.mjs
```

**108 cenários em 13 arquivos, todos passando** (26/10/2026), em Node puro, sem framework e sem
dependências.

| Arquivo | Cenários | O que cobre |
|---|---:|---|
| `sign-model-store.test.mjs` | 18 | Persistência, teto, origem padrão × pessoal, export/import, validação, eliminação |
| `sign-stabilizer.test.mjs` | 15 | Votação, permanência, trava, letra dupla, lacunas |
| `sign-classifier.test.mjs` | 10 | KNN e voto ponderado, teste de razão, calibração, conjuntos, classe única, rigor, barra de nitidez |
| `inference-loop.test.mjs` | 8 | Taxa, timestamp monotônico, parada, recuo adaptativo |
| `sign-features.test.mjs` | 8 | Invariância a posição, escala e resolução; espelhamento; quadros inválidos |
| `text-composer.test.mjs` | 7 | Espaço, apagar, limite, preparo para busca |
| `search-targets.test.mjs` | 7 | URLs, codificação, catálogo íntegro, logos presentes, ordem alfabética |
| `migracao-storage.test.mjs` | 7 | Migração idempotente e sem sobrescrever dado novo |
| `camera-controller.test.mjs` | 7 | Recarregar sem ligar a câmera, limpar erro, reabrir a mesma câmera, ler os nomes sem ligar, não acessar sem permissão, teto de 60 fps e aviso abaixo disso |
| `trava-mao.test.mjs` | 6 | Trava após quadros seguidos, oscilação ignorada, soltura, confiança baixa, reinício |
| `integracao.test.mjs` | 6 | Pipeline completo de ponta a ponta |
| `montar-modelo-padrao.test.mjs` | 5 | Montagem balanceada, redistribuição, amostras espalhadas, validação |
| `respingo.test.mjs` | 4 | Tinta da troca de tema: mesmo número de pontos em todos os quadros, começa no botão, termina cobrindo a janela, tempos em ordem |

### 17.2 Cenários que protegem contra erros silenciosos

- **Invariância à resolução:** a mesma mão em 640×480 e 1280×720 gera vetores idênticos. Sem
  isso, o modelo pararia de funcionar ao trocar de webcam, sem erro nenhum.
- **Letra dupla:** S, pausa de 250 ms, S produz "SS"; com pausa de 100 ms, só "S".
- **Timestamp monotônico:** trocar de câmera não faz o MediaPipe devolver resultados vazios.
- **Versão da normalização:** modelo de outra versão é recusado, não reinterpretado.
- **Caractere reservado na busca:** "&" ou "#" ficam contidos no parâmetro.
- **Integração:** o pipeline digita "ABC", produz "AA" ao relaxar a mão e não inventa caractere
  sem mão nem com gesto fora do treino.
- **Modelo pronto:** no teto o padrão cede primeiro; voltar ao padrão é por classe; reinstalar
  não custa o treino pessoal; "Apagar tudo" alcança o padrão.
- **Montagem balanceada:** quem gravou mais não domina o modelo pronto.
- **Trava de mão:** um quadro errado isolado não bloqueia a tradução, e um quadro ambíguo no
  meio de uma sequência errada não adia a trava.
- **Tinta da troca de tema:** sem o mesmo número de pontos em todos os quadros, a tinta pularia
  em vez de crescer; e, se o último quadro não passasse do canto mais longe, um pedaço do tema
  antigo sobraria num canto até o fim da animação.

### 17.3 Spike de diagnóstico

`spike/spike.html`, aberta como página da extensão, foi o **portão de decisão** da arquitetura:
provou que o MediaPipe 1.0.1 roda sob a CSP do Manifest V3 sem CDN e sem `eval`, e mediu a
latência. Critérios: nenhum erro de CSP, 21 pontos por mão, p95 < 40 ms em 640×480 no CPU e
inicialização a frio < 3 s. Resultado (Edge 153, CPU): **inicialização 84 ms, p50 22,9 ms, p95
23,8 ms** sobre 100 quadros com mão rastreada. Ele separa quadros com e sem mão, que são regimes
de custo diferentes (sem rastreamento, o detector de palma roda a cada quadro).

### 17.4 Roteiro de teste manual

1. Abrir o painel → a área de reconhecimento **não aparece**.
2. **Iniciar câmera** → autorizar na aba → voltar e iniciar → a área aparece.
3. Ligar **Reconhecimento** → aceitar o consentimento → **Usar modelo pronto** → soletrar sem
   treinar.
4. Alternar para **Números** e reconhecer dígitos.
5. S, relaxar, S → "SS". Testar **Repetir letra**, **Espaço**, **Apagar**, **Limpar** e digitação.
6. **Pesquisar** → conferir a ordem Amazon, Google, Maps, Wikipédia, YouTube → escolher uma →
   nova aba com o termo. Repetir com **Buscador padrão** e com Esc (nada é aberto).
7. Reforçar uma letra → selo "50+20" e "70%"; até 100 → "100%", borda tracejada e aviso. Conferir
   a linha "Armazenamento: …".
8. × na letra reforçada → volta a "50". **Apagar tudo** → **Restaurar modelo pronto**.
9. **Exportar**, apagar e **Importar**; tentar importar um arquivo inválido.
10. Configurar mão direita e sinalizar com a esquerda → a tradução trava (anel vermelho com "!")
    e nenhuma letra entra no texto; voltar à direita → destrava. Repetir durante uma gravação →
    "pausado". Marcar **A câmera inverte a imagem** → o vídeo deixa de ser espelhado pelo painel.
    Com uma câmera abaixo de 60 fps, conferir o aviso de taxa.
11. 🟢 abre em aba com a câmera religada; 🟢 → tela cheia; 🟡 → painel; 🔴 → fecha.
12. **Parar** → a área some; religar → volta com o texto preservado.
13. Desconectar a câmera em uso → erro "A câmera em uso foi desconectada."

### 17.5 Verificações adicionais

```
node tools/verificar-vendor.mjs          # integridade dos binários do MediaPipe
```

---

## 18. Privacidade e LGPD

### 18.1 Dados tratados

| Dado | Finalidade | Onde fica | Retenção |
|---|---|---|---|
| Vídeo da câmera | Exibir e extrair os pontos da mão | Memória do navegador | Enquanto a câmera estiver ligada |
| Quadros lidos pelo WebAssembly | Detectar os 21 pontos | Memória do módulo, no dispositivo | Por quadro; sobrescritos, nunca gravados |
| Vetor de 63 números | Classificar a configuração | Memória; janela de ~400 ms | Descartado a cada quadro |
| Amostras de treino | Modelo de reconhecimento pessoal | `storage.local` | Até o usuário apagar ou desinstalar |
| Amostras do modelo pronto | Reconhecer sem treino | Pacote da extensão; copiadas ao escolher | Idem |
| Texto composto | Montar a palavra | `storage.session` | Até fechar o navegador |
| Preferências | Restaurar a configuração | `storage.local` | Até desinstalar |
| Registro do consentimento | Comprovar o aceite | `storage.local` | Até desinstalar |
| Termo pesquisado | Abrir a pesquisa | **Sai do dispositivo**, para a plataforma escolhida | Fora do controle da extensão |

Não há coleta de navegação, histórico, credenciais, localização ou áudio; não há
`host_permissions` nem scripts injetados em páginas.

### 18.2 Enquadramento

A imagem de uma pessoa é dado pessoal. Os pontos da mão constituem **dado biométrico derivado**
(geometria de mão é modalidade biométrica reconhecida) e, por precaução, o modelo armazenado é
tratado como **dado pessoal sensível** (art. 5º, II). **Não há tratamento pelo fornecedor:** todo
o processamento ocorre no dispositivo do titular, sob controle exclusivo dele; a extensão não tem
servidor, backend nem telemetria.

### 18.3 Medidas e direitos

| Medida | Onde está | Base legal |
|---|---|---|
| Consentimento específico e destacado antes da primeira ativação, com data registrada | Diálogo no painel (RF15) | art. 7º, I e art. 11, I |
| **Apagar tudo** e × por classe, alcançando também o modelo pronto | Treinar sinais (RF52 a RF54) | art. 18, VI (eliminação) |
| **Exportar** em JSON legível | Treinar sinais (RF55) | art. 18, V (portabilidade) |
| Escolha do destino a cada pesquisa, com o termo à vista | Seletor de plataforma (RF38) | art. 6º, VI (transparência) |
| Processamento local como padrão arquitetural | Toda a extensão | art. 6º, III (necessidade) |
| Revogação a qualquer momento | Permissão de câmera no navegador; desinstalação | art. 8º, § 5º |
| Exibição do armazenamento ocupado | Treinar sinais (RF61, RF62) | Transparência sobre o que está guardado |

**Relatório de Impacto (RIPD):** considerado não exigível, por não haver tratamento em escala
pelo controlador, base centralizada nem transferência ao fornecedor. O raciocínio fica registrado
por transparência. A política completa está em `PRIVACY.md`; ela não substitui parecer jurídico
formal antes da publicação.

### 18.4 Permissões declaradas

| Permissão | Motivo |
|---|---|
| `sidePanel` | Exibir a interface no painel lateral |
| `storage` | Guardar amostras e preferências localmente |
| `search` | Pesquisar no buscador padrão quando o usuário escolhe essa opção |
| Câmera (via `getUserMedia`, não declarada no manifesto) | Capturar a imagem para exibição e extração local dos pontos |

---

# Parte V — Operação e evolução

## 19. Instalação, uso e solução de problemas

### 19.1 Instalação em modo desenvolvedor

1. Compilar a interface (Node 20 ou mais recente): `npm install` e depois `npm run build`,
   que gera a pasta `dist/`.
2. Abrir `chrome://extensions` (Chrome) ou `edge://extensions` (Edge).
3. Ativar o **Modo do desenvolvedor**.
4. **Carregar sem compactação** e selecionar a pasta **`dist/`** (não a raiz do repositório).
5. Clicar no ícone do Soletra para abrir o painel.

Durante o desenvolvimento, `npm run dev` recompila a cada alteração; depois de cada uma, clicar
em ↻ no cartão da extensão e reabrir o painel.

> **Windows:** clonar o repositório numa pasta do usuário (ex.: `Documentos`). Pastas como
> `C:\Program Files (x86)` são protegidas e o Git não consegue escrever nelas sem privilégio de
> administrador.

### 19.2 Comandos

```
npm install                              # dependências da interface (React, Radix UI, Vite)
npm run build                            # compila a extensão em dist/
npm run dev                              # recompila a cada alteração
npm test                                 # suíte completa — 108 cenários (node tests/todos.mjs)
node tools/verificar-vendor.mjs          # confere os SHA-256 dos binários
node tools/verificar-vendor.mjs --gerar  # regrava INTEGRIDADE.json (só em troca intencional)
node tools/montar-modelo-padrao.mjs --por-classe 50 --saida modelos/padrao.json *.json
node tools/make-icons.mjs                # regenera os ícones da extensão
node tools/gerar-paleta.mjs              # regenera ui/paleta.css a partir do azul da logo
```

### 19.3 Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Vídeo atrasado, painel pouco responsivo | Aceleração de hardware do navegador em conflito com a webcam (observado com webcam virtual) | Desativar em `chrome://settings/system` → "Usar aceleração gráfica quando disponível" e reiniciar o navegador |
| Atraso com câmera de celular (Iriun) | Transmissão por Wi-Fi | Conectar o celular por cabo USB; reduzir a resolução no app do Iriun |
| "Permissão de câmera negada" persistente | Permissão negada uma vez fica gravada | Remover em `chrome://settings/content/camera` a entrada `chrome-extension://<id>` |
| "A câmera está em uso por outro aplicativo ou aba" | Outro programa ou a aba de tela cheia do Soletra segura a câmera | Fechar o outro uso; usar os botões 🟢/🟡 para trocar entre painel e aba |
| Letras certas não são aceitas | Limiar apertado para a mão do usuário | Rigor **Tolerante**; reforçar a letra em Treinar sinais |
| Aparecem letras erradas | Limiar frouxo, letras parecidas | Rigor **Exigente**; conferir a mão configurada |
| Toda letra vira a mesma | Só uma classe treinada no conjunto | Treinar pelo menos mais uma (o painel avisa) |
| Tradução bloqueada com a mão certa | Câmera (geralmente virtual: Iriun, OBS, DroidCam) que espelha a imagem | Clicar **A câmera inverte a imagem** no aviso, ou marcar **Invertida** em Treinar sinais |
| Letras pioraram depois de marcar a câmera como Invertida | Amostras pessoais gravadas antes, com os lados trocados | Apagar essas letras no × e gravar de novo |
| Aviso "abaixo dos 60 fps suportados" | A câmera não oferece 60 fps nessa resolução | Nada a fazer se o vídeo está bom; acima de 15 fps o reconhecimento não é afetado |
| Verificador acusa `CRLF` | Clone antigo, anterior ao `.gitattributes` | `git rm --cached -r -q vendor && git checkout HEAD -- vendor` |
| "O modelo salvo foi gravado com outra versão da normalização" | Modelo de uma versão incompatível | Treinar de novo ou restaurar o modelo pronto |

---

## 20. Estrutura de arquivos

```
manifest.json                   MV3: permissões sidePanel + storage + search; CSP com wasm-unsafe-eval
.gitattributes                  impede o Git de alterar os bytes de vendor/ e modelos/
background/service-worker.js    abre o painel (ou aba) no clique do ícone e executa a pesquisa
package.json, vite.config.js    build da interface (React + Radix Themes) para dist/
permission/request.html|css     aba de autorização da câmera (Permissao.jsx)

ui/tema.js, ui/SeletorTema.jsx  tema Sistema / Claro / Escuro, comum às duas páginas
ui/transicao-tema.js            troca de tema animada (tinta a partir do botão de tema)
ui/respingo.js                  formato da tinta (polígono com gotas), puro e testado em Node
ui/RaizTema.jsx                 configuração do Radix Themes (acento e cinzas da marca)
ui/paleta.css                   escalas de cor da logo (azul e azul-céu) — gerado por tools/gerar-paleta.mjs
ui/marca.css                    fundos, degradê da logo, botões que quebram a linha
ui/loja.js                      loja mínima de estado lida pelo React
sidepanel/panel.html|css        página do painel e estilos próprios (semáforo, anel, grade)
sidepanel/nucleo.js             câmera, reconhecedor e todas as ações do painel, sem React
sidepanel/App.jsx, main.jsx     composição e montagem da página
sidepanel/componentes/          Topo, Palco, Mensagem, Controles, Reconhecimento, Treino, Rodape,
                                DialogoConfirmacao, SeletorPlataforma
sidepanel/seletor-plataforma.js pedido da janela "Onde pesquisar?"
sidepanel/dialogo.js            pedido da janela de confirmação
sidepanel/janela.js             botões fechar / painel / tela cheia

src/camera-controller.js        ciclo de vida da câmera (1280×720 / até 60 fps) e avaliação da taxa
src/sign-recognizer.js          orquestrador do reconhecimento; mede o armazenamento
src/hand-landmarker.js          adaptador do MediaPipe (único módulo dependente de WASM)
src/inference-loop.js           agendador rVFC, taxa adaptativa, timestamp monotônico
src/sign-features.js            21 pontos → 63 números; VERSAO_FEATURES
src/sign-classifier.js          KNN ponderado, rejeição, calibração do limiar
src/sign-stabilizer.js          votação, permanência, trava e liberação
src/trava-mao.js                trava de mão diferente da configurada, com histerese
src/sign-classes.js             catálogo de letras estáticas, dinâmicas e números
src/sign-model-store.js         persistência, origem padrão × pessoal, teto, quota, export/import
src/text-composer.js            composição do texto e preparo para a busca
src/search-targets.js           catálogo de plataformas (ordem alfabética) e URLs
src/migracao-storage.js         migração das chaves rvl.* → soletra.*

vendor/mediapipe/               tasks-vision 1.0.1 + hand_landmarker.task + INTEGRIDADE.json
modelos/padrao.json             modelo pronto (31 classes × 50 amostras)
icons/                          ícones da extensão e logos das plataformas
tools/                          montagem do modelo pronto, verificação do vendor, PNG, ícones, logos
spike/spike.html|js             diagnóstico de CSP e latência (fora do fluxo)
tests/                          108 cenários; tests/todos.mjs roda todos

README.md                       visão técnica para desenvolvedores
RESUMO-PROJETO.md               resumo para acompanhamento do TCC
PRIVACY.md                      política de privacidade
DOCUMENTACAO-COMPLETA.md        este documento
```

Total de código próprio: cerca de **8.690 linhas**, incluindo testes e ferramentas.

---

## 21. Parâmetros de referência

| Módulo | Parâmetro | Valor |
|---|---|---|
| Câmera | Resolução ideal / taxa ideal e máxima | 1280×720 / 60 fps |
| Câmera | Taxa abaixo da qual o painel avisa | 60 fps |
| Trava de mão | Quadros para travar / para soltar / confiança mínima | 5 / 3 / 0,8 |
| Loop | Taxa alvo / recuo / p95 que dispara o recuo / volta | 15 Hz / 8 Hz / 50 ms / < 25 ms |
| Loop | Medições consideradas | 30 |
| Detector | Mãos / modo / confianças mínimas | 1 / VIDEO / 0,5 |
| Normalização | Dimensões / peso do z / casas decimais gravadas | 63 / 0,3 / 4 |
| Classificador | k / limiar de distância / teste de razão / teto da razão | 5 / 1,3 / 0,97 / 0,99 |
| Classificador | Rigor (Tolerante · Normal · Exigente) | 1,25 · 1,0 · 0,8 |
| Classificador | Piso do limiar pela dispersão | p90 × 5 |
| Classificador | Classes mínimas para discriminar | 2 |
| Estabilizador | Janela / fração mínima / quadros mínimos | 400 ms / 0,55 / 3 |
| Estabilizador | Confiança mínima | 0,5 |
| Estabilizador | Permanência (Rápido · Normal · Calmo) | 450 · 700 · 1000 ms |
| Estabilizador | Liberação da trava / lacuna que zera | 200 ms / 500 ms |
| Treino | Amostras por gravação / intervalo | 20 / 150 ms |
| Armazenamento | Teto por classe / modelo pronto por classe | 100 / 50 |
| Armazenamento | Quota / aviso | 10 MB / 80% |
| Texto | Limite / atraso para salvar | 200 caracteres / 500 ms |
| Modelo pronto | Mínimo de pessoas antes de avisar | 3 |

---

## 22. Trabalhos futuros

Em ordem de prioridade para o TCC:

1. **Avaliação formal de acurácia** (`src/sign-eval.js`): matriz de confusão e validação
   leave-one-out, incluindo a acurácia do modelo pronto em quem não participou do treino. É o
   resultado quantitativo que o trabalho ainda não tem.
2. **Modelo pronto com várias pessoas**, com consentimento por escrito, regenerado pela
   ferramenta de montagem.
3. **Opção "Mesclar" na importação**, que o armazenamento já suporta.
4. **Letras dinâmicas (H, J, K, X, Z e Ç)** com um pipeline temporal: buffer de pontos e
   classificador de sequência, com dataset próprio.
5. **Ablação da normalização:** rotação ligada × desligada, peso do z e novas distâncias no vetor
   (`VERSAO_FEATURES` 2).
6. **Publicação** na Chrome Web Store e no Edge Add-ons.
7. **Documento `offscreen`** para manter o detector carregado entre aberturas.
8. Ideias levantadas: modo prática (o app sorteia uma letra), treino guiado com imagem de
   referência, autocompletar de palavras, vários perfis de modelo, as 3 classes mais prováveis ao
   vivo, atalhos de teclado e comandos por gesto.

---

## 23. Histórico de alterações

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
| 21/10/2026 | `5061dfe` a `6208655` | Área de reconhecimento só com a câmera ativa; captura a 60 fps; plataformas em ordem alfabética; % de uso por classe e uso total do armazenamento; `.gitattributes` e diagnóstico de quebra de linha no verificador; `PRIVACY.md` atualizado; README, RESUMO e esta documentação |
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

---

## 24. Repositório de referência avaliado

O projeto [WellingtonDev25/leitor_libras](https://github.com/WellingtonDev25/leitor_libras) foi
avaliado como base e **descartado**. É um script Python de 56 linhas com um modelo Teachable
Machine que classifica **pixels 224×224**; o MediaPipe ali só recorta a região da mão, e os pontos
nunca chegam ao classificador. Reconhece **5 classes** (A a E), não inclui dataset nem script de
treino, não tem estabilização e **não declara licença**, o que reservaria todos os direitos ao
autor. A abordagem adotada no Soletra — classificar a geometria da mão em vez de pixels — é
tecnicamente superior: modelo de KB em vez de MB e robustez a fundo, iluminação e tom de pele.

---

## 25. Glossário

| Termo | Significado |
|---|---|
| **Libras** | Língua Brasileira de Sinais, reconhecida pela Lei 10.436/2002 |
| **Alfabeto manual / datilologia** | Representação de cada letra por uma configuração de mão, usada para soletrar |
| **Configuração de mão** | A forma da mão (dedos estendidos, dobrados, posição do polegar); um dos parâmetros da Libras |
| **Sinal estático / dinâmico** | Estático: definido por uma pose. Dinâmico: definido por um movimento (H, J, K, X, Z, Ç) |
| **Landmark** | Ponto de referência anatômico detectado na imagem; o MediaPipe fornece 21 por mão |
| **Feature / vetor de características** | Os 63 números (21 pontos × 3 coordenadas) que representam a mão após a normalização |
| **Normalização** | Transformação que torna o vetor independente de posição, distância e resolução |
| **KNN** | *k-nearest neighbors*: classifica pela classe dos k exemplos mais próximos |
| **τ_abs (limiar de rejeição)** | Distância máxima para um gesto ser aceito como alguma classe |
| **Teste de razão** | Compara a distância à classe vencedora com a da segunda; rejeita empates |
| **Rigor** | Multiplicador dos limiares exposto na interface |
| **Estabilização** | Etapa que transforma o fluxo de classificações em letras confirmadas |
| **Permanência** | Tempo que um sinal precisa se manter para ser confirmado |
| **Trava** | Estado que impede repetir a mesma letra enquanto a mão não sai dela |
| **Modelo pronto / padrão** | Conjunto de amostras empacotado, que funciona sem treino |
| **Amostra pessoal** | Amostra gravada pelo próprio usuário |
| **MediaPipe** | Biblioteca do Google para visão computacional; aqui, o detector de mãos |
| **WebAssembly (WASM)** | Formato binário que roda no navegador com desempenho próximo ao nativo |
| **Delegate CPU / GPU** | Onde o MediaPipe executa o modelo: processador ou placa de vídeo |
| **Manifest V3 (MV3)** | Versão atual da plataforma de extensões do Chrome e do Edge |
| **CSP** | *Content Security Policy*: regras que limitam o código que a extensão pode executar |
| **Service worker** | Script de fundo da extensão, sem interface |
| **Painel lateral** | Área à direita do navegador onde a extensão exibe sua interface |
| **rVFC** | `requestVideoFrameCallback`: aviso do navegador a cada quadro novo de vídeo |
| **p50 / p95** | Mediana e 95º percentil de uma medida de tempo |
| **Vendorizar** | Copiar uma dependência para dentro do repositório, em vez de baixá-la |
| **SHA-256** | Função de *hash* usada para verificar se um arquivo foi alterado |
| **CRLF / LF** | Formas de quebra de linha no Windows e no Unix; a conversão entre elas altera o *hash* |
| **LGPD** | Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018) |
| **Spike** | Protótipo descartável feito para provar uma hipótese técnica antes de construir |
