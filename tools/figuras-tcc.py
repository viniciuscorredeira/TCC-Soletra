"""
Figuras 8 e 9 do TCC, refeitas a partir dos dados do repositório.

  Figura 8 (curvas ROC): medicoes/roc-modelo-padrao.json, gerado por
           node tools/roc-modelo.mjs
  Figura 9 (acerto por sinal): Planilhas de Testes/soletra-testes-medias-*.xlsx,
           aba "Por sinal (média)"

Uso: python3 tools/figuras-tcc.py [pasta de saída]   (padrão: medicoes/figuras)

É a única ferramenta do projeto em Python, e só serve para desenhar as figuras
do TCC: precisa de matplotlib e openpyxl (pip install matplotlib openpyxl). A
extensão, os testes e as outras ferramentas continuam sem dependências.
"""
import glob, json, os, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import openpyxl

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, 'medicoes', 'figuras')
os.makedirs(SAIDA, exist_ok=True)

# Tokens (paleta de referência, superfície branca da página)
SUPERFICIE = '#ffffff'
TINTA = '#0b0b0b'
TINTA2 = '#52514e'
MUDA = '#898781'
GRADE = '#e1e0d9'
EIXO = '#c3c2b7'
AZUL = '#2a78d6'      # série 1: Letras
LARANJA = '#eb6834'   # série 2: Números

CM = 1 / 2.54
plt.rcParams.update({
    'font.family': ['Arial', 'Liberation Sans', 'DejaVu Sans'], 'font.size': 7.5,
    'axes.edgecolor': EIXO, 'axes.linewidth': 0.6, 'axes.labelcolor': TINTA2,
    'xtick.color': EIXO, 'ytick.color': EIXO, 'xtick.labelcolor': TINTA2, 'ytick.labelcolor': TINTA2,
    'xtick.major.size': 0, 'ytick.major.size': 0, 'xtick.major.pad': 4, 'ytick.major.pad': 4,
    'xtick.labelsize': 7, 'ytick.labelsize': 7, 'axes.labelsize': 7.5,
    'figure.facecolor': SUPERFICIE, 'axes.facecolor': SUPERFICIE, 'savefig.facecolor': SUPERFICIE,
    'lines.solid_capstyle': 'round', 'lines.solid_joinstyle': 'round',
})

def virg(x, casas=1):
    return f'{x:.{casas}f}'.replace('.', ',')

def eixos_limpos(ax, grade_y=True, grade_x=True):
    for lado in ('top', 'right'):
        ax.spines[lado].set_visible(False)
    ax.set_axisbelow(True)
    if grade_y:
        ax.grid(axis='y', color=GRADE, lw=0.5)
    if grade_x:
        ax.grid(axis='x', color=GRADE, lw=0.5)

def titulo_painel(ax, titulo, subtitulo, folga=10):
    ax.annotate(titulo, xy=(0, 1), xycoords='axes fraction', xytext=(0, folga + 11), textcoords='offset points',
                ha='left', va='bottom', fontsize=8, fontweight='bold', color=TINTA)
    ax.annotate(subtitulo, xy=(0, 1), xycoords='axes fraction', xytext=(0, folga), textcoords='offset points',
                ha='left', va='bottom', fontsize=7, color=TINTA2)


# ---------------------------------------------------------------- Figura 8
roc = json.load(open(f'{REPO}/medicoes/roc-modelo-padrao.json', encoding='utf-8'))
C = roc['conjuntos']
series = [('letras', 'Letras', AZUL), ('numeros', 'Números', LARANJA)]
# traço diferente para a série 2: a identidade sobrevive à impressão em tons de cinza
TRACO = {'letras': '-', 'numeros': (0, (3.2, 1.4))}

fig, eixos = plt.subplots(1, 2, figsize=(16 * CM, 8.6 * CM), dpi=300, sharey=True,
                          gridspec_kw={'wspace': 0.12})
paineis = [
    ('umContraTodos', 'a) Cada classe contra as demais', 'Pontuação: distância da amostra até a classe'),
    ('acertoErro', 'b) Acerto contra erro', 'Pontuação: razão entre a vencedora e a segunda'),
]
for ax, (chave, titulo, subtitulo) in zip(eixos, paineis):
    eixos_limpos(ax)
    ax.set_xlim(-0.005, 1.005)
    ax.set_ylim(-0.005, 1.005)
    ax.set_aspect('equal')
    ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
    ax.set_xticks(ticks, [virg(t) for t in ticks])
    ax.set_yticks(ticks, [virg(t) for t in ticks])
    ax.set_xlabel('Taxa de falsos positivos', labelpad=5)
    # referência: classificador ao acaso
    ax.plot([0, 1], [0, 1], color=EIXO, lw=0.6, zorder=1)
    ax.text(0.80, 0.735, 'ao acaso (AUC = 0,5)', rotation=45, rotation_mode='anchor', ha='center', va='center',
            fontsize=6.3, color=MUDA)
    for nome, rotulo, cor in reversed(series):
        x, y = zip(*C[nome][chave]['curva'])
        ax.plot(x, y, color=cor, lw=1.5, ls=TRACO[nome], zorder=3 if nome == 'letras' else 2, clip_on=False)
    titulo_painel(ax, titulo, subtitulo)

    # bloco de identidade + AUC, sem moldura, no canto vazio
    x0, y0, passo = 0.56, 0.19, 0.08
    ax.text(0.985, y0 + 0.08, 'AUC', transform=ax.transAxes, ha='right', va='center', fontsize=6.5, color=MUDA)
    for i, (nome, rotulo, cor) in enumerate(series):
        yy = y0 - i * passo
        ax.add_line(Line2D([x0, x0 + 0.075], [yy, yy], transform=ax.transAxes, color=cor, lw=1.5, ls=TRACO[nome]))
        ax.text(x0 + 0.10, yy, rotulo, transform=ax.transAxes, ha='left', va='center',
                fontsize=7, color=TINTA2)
        auc = C[nome][chave]['auc']
        ax.text(0.985, yy, virg(auc, 3), transform=ax.transAxes, ha='right', va='center', fontsize=7.5,
                color=TINTA, fontweight='bold')

eixos[0].set_ylabel('Taxa de verdadeiros positivos', labelpad=6)

# painel b: pontos dos cortes da razão
axb = eixos[1]
marcas = {0.8: ('o', 4.8), 0.97: ('D', 4.2)}
for nome, rotulo, cor in series:
    for p in C[nome]['acertoErro']['cortes']:
        if p['corte'] in marcas:
            m, s = marcas[p['corte']]
            axb.plot(p['taxaFalsosPositivos'], p['taxaVerdadeirosPositivos'], marker=m, ms=s, mfc=cor,
                     mec=SUPERFICIE, mew=1.1, zorder=5, clip_on=False, ls='none')
kx, ky = 0.56, 0.43
axb.text(kx, ky + 0.08, 'Cortes do teste de razão', transform=axb.transAxes, ha='left', va='center', fontsize=6.5, color=MUDA)
for i, (corte, (m, s)) in enumerate(marcas.items()):
    yy = ky - i * 0.08
    axb.add_line(Line2D([kx + 0.0375], [yy], transform=axb.transAxes, marker=m, ms=s, mfc=TINTA2, mec=SUPERFICIE, mew=1.1, ls='none'))
    axb.text(kx + 0.10, yy, f'razão ≤ {virg(corte, 2)}', transform=axb.transAxes, ha='left', va='center', fontsize=7, color=TINTA2)

fig.subplots_adjust(left=0.085, right=0.99, bottom=0.13, top=0.85)
fig.savefig(os.path.join(SAIDA, 'figura-8-roc.png'), dpi=300)
plt.close(fig)


# ---------------------------------------------------------------- Figura 9
arquivo = glob.glob(f'{REPO}/Planilhas de Testes/*medias*.xlsx')[0]
ws = openpyxl.load_workbook(arquivo, read_only=True, data_only=True)['Por sinal (média)']
linhas = list(ws.iter_rows(values_only=True))
cab = next(i for i, r in enumerate(linhas) if r and r[0] == 'Sinal')
idx = {nome: j for j, nome in enumerate(linhas[cab])}
dados = {}
for r in linhas[cab + 1:]:
    if r and r[0] not in (None, '') and r[idx['Acerto por rodada (%)']] is not None:
        dados[str(r[0])] = (float(r[idx['Acerto por rodada (%)']]), float(r[idx['Acerto por quadro (%)']]))
letras = list('ABCDEFGILMNOPQRSTUVWY')
numeros = list('0123456789')
ordem = letras + numeros
assert all(s in dados for s in ordem), sorted(set(ordem) - set(dados))
xs = list(range(len(letras))) + [len(letras) + 1 + i for i in range(len(numeros))]

MEDIA = {'rodada': (94.6, 'média\n94,6%'), 'quadro': (97.4, 'média\n97,4%')}
fig, (a1, a2) = plt.subplots(2, 1, figsize=(16 * CM, 10.2 * CM), dpi=300, sharex=True,
                             gridspec_kw={'hspace': 0.5})
for ax, k, titulo, subtitulo in (
    (a1, 0, 'Acerto por rodada', 'Rodadas que terminaram com o sinal pedido; 9 por sinal (3 participantes × 3 rodadas)'),
    (a2, 1, 'Acerto por quadro', 'Quadros classificados como o sinal pedido, entre os que o classificador decidiu'),
):
    eixos_limpos(ax, grade_x=False)
    ax.spines['left'].set_visible(False)
    ax.set_ylim(57, 103)
    ax.set_yticks([60, 70, 80, 90, 100], ['60%', '70%', '80%', '90%', '100%'])
    ax.set_xlim(-0.8, xs[-1] + 0.8)
    media, rot = MEDIA['rodada' if k == 0 else 'quadro']
    ax.axhline(media, color=MUDA, lw=0.7, zorder=1)
    ax.annotate(rot, xy=(1, media), xycoords=('axes fraction', 'data'), xytext=(6, 0), textcoords='offset points',
                ha='left', va='center', fontsize=6.5, color=TINTA2)
    vals = [dados[s][k] for s in ordem]
    ax.plot(xs, vals, ls='none', marker='o', ms=4.6, mfc=AZUL, mec=SUPERFICIE, mew=0.9, zorder=3, clip_on=False)
    titulo_painel(ax, titulo, subtitulo)
    # rótulos só nos extremos de que o texto fala
    for s, v in sorted(zip(ordem, vals), key=lambda t: t[1])[:2 if k == 0 else 1]:
        x = xs[ordem.index(s)]
        texto = f'{s}: {round(v * 9 / 100)} de 9' if k == 0 else f'{s}: {virg(v, 0)}%'
        ax.text(x + 0.45, v, texto, ha='left', va='center', fontsize=6.8, color=TINTA)

a2.set_xticks(xs, ordem)
a2.tick_params(axis='x', labelsize=7, labelcolor=TINTA2, pad=4)
# grupos
for nome, grupo in (('Letras', xs[:len(letras)]), ('Números', xs[len(letras):])):
    centro = (grupo[0] + grupo[-1]) / 2
    a2.annotate(nome, xy=(centro, 0), xycoords=('data', 'axes fraction'), xytext=(0, -16), textcoords='offset points',
                ha='center', va='top', fontsize=7, color=TINTA2, fontweight='bold')
    a2.plot([grupo[0] - 0.4, grupo[-1] + 0.4], [57, 57], color=EIXO, lw=0.6, clip_on=False, zorder=1)
for ax in (a1, a2):
    ax.spines['bottom'].set_visible(False)
fig.subplots_adjust(left=0.07, right=0.93, bottom=0.13, top=0.89)
fig.savefig(os.path.join(SAIDA, 'figura-9-acerto-por-sinal.png'), dpi=300)
plt.close(fig)
print(f'Figuras gravadas em {os.path.relpath(SAIDA, REPO)}/')
