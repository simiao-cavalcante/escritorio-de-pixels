#!/usr/bin/env python3
"""Paleta comum do Escritório de Pixels: 32 cores fixas, gravadas em arte/paleta.png.

Rode uma vez (`python3 arte/paleta.py`); o PNG é commitado e serve de referência
humana, enquanto `imagem_paleta()` é o que `arte/gerar.py` usa para quantizar.
"""
from pathlib import Path

from PIL import Image

# 32 cores: neutros, madeira, carpete, parede, tapete, pele, cabelo, trajes e as seis CLIs.
PALETA = [
    (0x0D, 0x0D, 0x10),  # 00 contorno (quase preto)
    (0xFF, 0xFF, 0xFF),  # 01 branco
    (0xD8, 0xDA, 0xDF),  # 02 cinza claro (papel, camisa)
    (0x8A, 0x8A, 0x8A),  # 03 cinza neutro (crachá padrão)
    (0x4A, 0x2F, 0x18),  # 04 madeira escura
    (0x6F, 0x46, 0x22),  # 05 madeira média
    (0x8B, 0x5A, 0x2B),  # 06 madeira
    (0xC1, 0x9A, 0x63),  # 07 madeira clara
    (0x2F, 0x3F, 0x4F),  # 08 carpete escuro
    (0x47, 0x60, 0x7A),  # 09 carpete médio
    (0x6D, 0x8A, 0xA3),  # 10 carpete claro
    (0x5B, 0x63, 0x70),  # 11 parede escura (rodapé, sombra)
    (0x9A, 0xA3, 0xAD),  # 12 parede média
    (0xC7, 0xCE, 0xD6),  # 13 parede clara
    (0x6D, 0x2A, 0x31),  # 14 vinho do tapete
    (0xF2, 0xCD, 0xA7),  # 15 pele clara
    (0xC9, 0x8D, 0x5E),  # 16 pele média
    (0x7A, 0x4A, 0x2B),  # 17 pele escura
    (0x24, 0x1C, 0x14),  # 18 cabelo preto
    (0x5C, 0x3A, 0x1F),  # 19 cabelo castanho
    (0xD9, 0xB4, 0x5A),  # 20 cabelo loiro
    (0xB3, 0xB3, 0xBB),  # 21 cabelo grisalho
    (0x1F, 0x3A, 0x63),  # 22 terno azul-marinho
    (0x2F, 0x52, 0x88),  # 23 azul-marinho claro (realce)
    (0x6E, 0x74, 0x80),  # 24 terno cinza
    (0x3F, 0x7D, 0x4F),  # 25 verde do estagiário
    (0xC2, 0x60, 0x3E),  # 26 CLI claude (terracota)
    (0x2E, 0x9E, 0x5B),  # 27 CLI codex (verde)
    (0x3B, 0x7D, 0xD8),  # 28 CLI gemini (azul)
    (0x4A, 0x4A, 0x4A),  # 29 CLI grok (grafite; serve também de terno grafite)
    (0x7C, 0x4D, 0xFF),  # 30 CLI cursor (roxo)
    (0x1F, 0xA8, 0xA0),  # 31 CLI opencode (turquesa)
]

CAMINHO = Path(__file__).resolve().parent / "paleta.png"


def imagem_paleta():
    """Imagem modo P para Image.quantize: as 32 cores repetidas até preencher 256 entradas.

    Repetir em vez de completar com preto evita que o quantizador invente uma 33ª cor.
    """
    dados = []
    for i in range(256):
        dados.extend(PALETA[i % len(PALETA)])
    paleta = Image.new("P", (1, 1))
    paleta.putpalette(dados)
    return paleta


def gravar(caminho=CAMINHO):
    """Grava a paleta como PNG de 32x1 pixels."""
    img = Image.new("RGB", (len(PALETA), 1))
    img.putdata(PALETA)
    img.save(caminho, format="PNG", optimize=True)
    return caminho


if __name__ == "__main__":
    assert len(PALETA) == 32, f"a paleta precisa ter 32 cores, tem {len(PALETA)}"
    assert len(set(PALETA)) == 32, "há cores repetidas na paleta"
    gravar()
    print(f"arte/paleta.png: {len(PALETA)} cores, {len(PALETA)}x1")
