#!/usr/bin/env python3
"""Monta docs/screenshots/arte-contato.png: contact sheet para inspeção visual dos sprites.

Lê public/arte/atlas.json e os PNGs em public/arte/, amplia cada um 3x (nearest-neighbor,
para não borrar a pixel art) com o id como rótulo sobre um fundo cinza (revela franjas de
alfa), e acrescenta um mosaico 2x2 de cada piso (para julgar emendas ao repetir a textura).
Não chama rede nem precisa de OPENAI_API_KEY.

Uso: python3 arte/contato.py
Saída: docs/screenshots/arte-contato.png — leia com a ferramenta de leitura de imagem do
agente e confira os critérios do passo do plano.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
ATLAS = RAIZ / "public" / "arte" / "atlas.json"
DIR_ARTE = RAIZ / "public" / "arte"
SAIDA = RAIZ / "docs" / "screenshots" / "arte-contato.png"

ESCALA = 3
COLUNAS = 6
FUNDO_CELULA = (60, 60, 66)  # cinza médio: revela franjas de alfa e bordas
FUNDO_PAGINA = (30, 30, 34)
COR_TEXTO = (255, 255, 255)
MARGEM = 8
ALTURA_ROTULO = 14
ALTURA_TITULO = 24


def _fonte():
    """Fonte padrão do Pillow: sempre disponível, sem depender de arquivo externo."""
    try:
        return ImageFont.load_default(size=11)
    except TypeError:  # Pillow < 10.1 não aceita `size` em load_default()
        return ImageFont.load_default()


def _rotular(imagem, texto, fonte, y):
    desenho = ImageDraw.Draw(imagem)
    caixa = desenho.textbbox((0, 0), texto, font=fonte)
    x = max(0, (imagem.width - (caixa[2] - caixa[0])) // 2)
    desenho.text((x, y), texto, fill=COR_TEXTO, font=fonte)


def _celula_sprite(entrada, imagem_rgba, largura, altura, fonte):
    """Sprite ampliado 3x sobre fundo cinza, ancorado embaixo, com o id como rótulo."""
    ampliada = imagem_rgba.resize(
        (imagem_rgba.width * ESCALA, imagem_rgba.height * ESCALA), Image.NEAREST
    )
    celula = Image.new("RGB", (largura, altura + ALTURA_ROTULO), FUNDO_CELULA)
    destino = ((largura - ampliada.width) // 2, altura - ampliada.height)
    celula.paste(ampliada, destino, ampliada)
    _rotular(celula, entrada["id"], fonte, altura + 1)
    return celula


def _mosaico_piso(imagem_rgba):
    """Ladrilha o piso 2x2 (emenda visível) e amplia 3x."""
    w, h = imagem_rgba.size
    mosaico = Image.new("RGBA", (w * 2, h * 2))
    for linha in range(2):
        for coluna in range(2):
            mosaico.paste(imagem_rgba, (coluna * w, linha * h))
    return mosaico.resize((mosaico.width * ESCALA, mosaico.height * ESCALA), Image.NEAREST)


def _celula_piso(entrada, imagem_rgba, largura, altura, fonte):
    mosaico = _mosaico_piso(imagem_rgba)
    celula = Image.new("RGB", (largura, altura + ALTURA_ROTULO), FUNDO_CELULA)
    celula.paste(mosaico, ((largura - mosaico.width) // 2, (altura - mosaico.height) // 2))
    _rotular(celula, f"{entrada['id']} (2x2)", fonte, altura + 1)
    return celula


def montar(atlas_caminho=ATLAS, dir_arte=DIR_ARTE, saida=SAIDA):
    if not atlas_caminho.exists():
        print(f"faltou {atlas_caminho}; rode antes: python3 arte/gerar.py", file=sys.stderr)
        return None
    atlas = json.load(open(atlas_caminho, encoding="utf-8"))
    if not atlas:
        print("atlas vazio; nada para inspecionar", file=sys.stderr)
        return None

    entradas = [(e, Image.open(dir_arte / e["arquivo"]).convert("RGBA")) for e in atlas]
    pisos = [par for par in entradas if par[0]["categoria"] == "piso"]
    fonte = _fonte()

    largura_celula = max(img.width for _, img in entradas) * ESCALA + MARGEM * 2
    altura_celula = max(img.height for _, img in entradas) * ESCALA + MARGEM * 2
    linhas_grade = (len(entradas) + COLUNAS - 1) // COLUNAS
    altura_grade = linhas_grade * (altura_celula + ALTURA_ROTULO + MARGEM)

    largura_piso = (pisos[0][1].width * 2 * ESCALA + MARGEM * 2) if pisos else 0
    altura_piso = (pisos[0][1].height * 2 * ESCALA + MARGEM * 2) if pisos else 0
    colunas_pisos = max(1, len(pisos))
    largura_secao_pisos = colunas_pisos * largura_piso
    altura_secao_pisos = (altura_piso + ALTURA_ROTULO + MARGEM) if pisos else 0

    largura_pagina = max(COLUNAS * largura_celula, largura_secao_pisos)
    altura_pagina = ALTURA_TITULO + altura_grade + altura_secao_pisos

    pagina = Image.new("RGB", (largura_pagina, altura_pagina), FUNDO_PAGINA)
    # ASCII puro: a fonte padrão do Pillow (sem arquivo externo) não cobre acentos.
    _rotular(
        pagina,
        f"Escritorio de Pixels - contact sheet ({len(entradas)} sprites, {ESCALA}x)",
        fonte,
        4,
    )

    for indice, (entrada, img) in enumerate(entradas):
        linha, coluna = divmod(indice, COLUNAS)
        celula = _celula_sprite(entrada, img, largura_celula - MARGEM * 2, altura_celula - MARGEM * 2, fonte)
        x = coluna * largura_celula + MARGEM
        y = ALTURA_TITULO + linha * (altura_celula + ALTURA_ROTULO + MARGEM) + MARGEM
        pagina.paste(celula, (x, y))

    y_base = ALTURA_TITULO + altura_grade + MARGEM
    for indice, (entrada, img) in enumerate(pisos):
        celula = _celula_piso(entrada, img, largura_piso - MARGEM * 2, altura_piso - MARGEM * 2, fonte)
        pagina.paste(celula, (indice * largura_piso + MARGEM, y_base))

    saida.parent.mkdir(parents=True, exist_ok=True)
    pagina.save(saida, format="PNG", optimize=True)
    return saida


if __name__ == "__main__":
    resultado = montar()
    if resultado is None:
        sys.exit(1)
    print(f"{resultado.relative_to(RAIZ)}: {Image.open(resultado).size}")
