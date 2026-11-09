# Latência em uso real — registro das sessões

Origem dos valores da **Tabela 3 do TCC** (Seção 5.4, "Latência da Extensão em Uso"). Os
números foram lidos na linha de status do painel, por exemplo
`8 Hz · p50 26 ms · p95 26 ms · desempenho reduzido`, que mostra a taxa de inferência e os
percentis 50 e 95 das últimas 30 medições do laço (`src/inference-loop.js`). A taxa cai de 15
para 8 Hz quando o p95 passa de 50 ms e só volta a 15 Hz quando ele fica abaixo de 25 ms; nesse
intervalo o painel mostra "desempenho reduzido".

Todas as sessões usaram vídeo de 1280×720. A linha "Teste de viabilidade" da Tabela 3
(p50 22,9 ms, p95 23,8 ms, 640×480) não vem da linha de status: vem do spike de diagnóstico
(seção 17.3 da `DOCUMENTACAO-COMPLETA.md`).

## Sessões

| Sessão | Data | Versão | Computador | Navegador | Câmera |
|---|---|---|---|---|---|
| 1 | 13/10/2026 | não registrada | Intel Core i5-10400F 2,90 GHz, 20 GB de RAM (2666 MT/s), Windows 11 | Google Chrome 155.0.8059.85 | 30 fps (nome não registrado) |
| 2 | não registrada | 0.2.0, gravação de demonstração | o mesmo da sessão 1 | o mesmo da sessão 1 | 30 fps (nome não registrado) |
| 3 | não registrada (antes de 27/10/2026) | 0.3.0, gravação de demonstração | o mesmo da sessão 1 | o mesmo da sessão 1 | GENERAL WEBCAM (1b3f:1167), 30 fps |
| 4 | outubro de 2026, em 27/10 ou antes (ver nota) | 0.3.0 | AMD Ryzen 5 5600, Radeon RX 7600, 32 GB de RAM, Windows 11 Pro | Microsoft Edge 156.0.4314.58 | iPhone 13 pelo Iriun Webcam, 60 fps |

**Data da sessão 4.** O grupo se lembrava de 29/10/2026, mas a sequência "BAC1234", gravada no
mesmo dia, já estava na versão do TCC entregue para revisão em 27/10/2026. A sessão foi, portanto,
em 27/10 ou antes; o dia exato não foi registrado.

## Valores da Tabela 3 e de onde saíram

Capturas em [`latencia-sessoes/`](latencia-sessoes/).

| Linha da Tabela 3 | p50 | p95 | Taxa | Captura |
|---|---:|---:|---:|---|
| Sessão 1, modo Letras (tela 1) | 75 ms | 87 ms | 8 Hz | não preservada |
| Sessão 1, modo Números | 82 ms | 91 ms | 8 Hz | não preservada |
| Sessão 1, modo Letras (tela 2) | 85 ms | 104 ms | 8 Hz | não preservada |
| Sessão 2, modo Letras, à espera da mão | 41 ms | 46 ms | 15 Hz | não preservada |
| Sessão 2, modo Letras, reconhecendo | 37 a 42 ms | 42 a 73 ms | 8 Hz | não preservada |
| Sessão 2, modo Números, reconhecendo | 36 ms | 39 a 41 ms | 8 Hz | não preservada |
| Sessão 3, logo após ligar o reconhecimento | 60 ms | 239 ms | 15 Hz | `s3-logo-apos-ligar.jpg` |
| Sessão 3, reconhecendo letras e números | 50 a 55 ms | 58 a 93 ms | 8 Hz | não preservada |
| Sessão 3, à espera da mão (modo Números) | 56 ms | 66 ms | 8 Hz | `s3-espera-numeros.jpg` |
| Sessão 3, gesto não reconhecido ou trava de mão ativa | 55 ms | 107 a 112 ms | 8 Hz | `s3-gesto-nao-reconhecido.jpg` (p95 107), `s3-trava-de-mao.jpg` (p95 112) |
| Sessão 4, à espera da mão (modo Números) | 29 ms | 30 ms | 15 Hz | `s4-espera-numeros-status.png` (Figura 7 do TCC), `s4-treino-numeros.png` (Figura 6) |
| Sessão 4, à espera da mão (modo Letras) | 47 ms | 48 ms | 8 Hz | `s4-espera-letras.png` (Figura 15) |
| Sessão 4, soletrando "BAC1234" | 29 a 50 ms | 51 a 54 ms | 8 Hz | `bac1234-sequencia.png` (Figura 19) |
| Sessão 4, trava de mão ativa | 26 ms | 26 ms | 8 Hz | `s4-trava-de-mao.png` (Figura 17 até a v41) |
| Sessão 4, gesto não reconhecido | 30 ms | 50 ms | 8 Hz | `s4-gesto-nao-reconhecido.png` (Figura 18 até a v41) |

Quadro a quadro, a sequência "BAC1234" dá (p50 / p95, em ms): B 50/54, A 29/52, C 30/51,
1 50/53, 2 50/53, 3 30/52 e 4 30/52.

## Capturas que não entraram na Tabela 3

| Arquivo | Linha de status | Observação |
|---|---|---|
| `s3-espera-letras.jpg` | 8 Hz · p50 59 ms · p95 69 ms | Sessão 3, modo Letras, à espera da mão |
| `pos-trava-de-mao.png` | 8 Hz · p50 26 ms · p95 28 ms | Figura 17 do TCC a partir da v42; 09/11/2026, Iriun Webcam (iPhone 13) |
| `pos-gesto-nao-reconhecido.png` | 8 Hz · p50 27 ms · p95 29 ms | Figura 18 do TCC a partir da v42; 09/11/2026, Iriun Webcam (iPhone 13) |

## Limitações

- As capturas das sessões 1 e 2 e a da linha "Sessão 3, reconhecendo letras e números" não foram
  preservadas, então essas 7 linhas da Tabela 3 ficam sem a captura de origem. Gravar de novo
  não as substituiria, porque a latência muda a cada sessão.
- As datas das sessões 2 e 3, a versão usada na sessão 1 e o nome da câmera das sessões 1 e 2
  não foram registrados.
- A carga de outros programas e o modo de energia do computador não foram registrados em
  nenhuma sessão.
