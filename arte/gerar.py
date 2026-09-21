#!/usr/bin/env python3
"""Gera a arte do Escritório de Pixels com gpt-image-2.5 e pós-processa com Pillow.

Uso:
  python3 arte/gerar.py                        gera o que falta ou mudou de hash
  python3 arte/gerar.py --seco                 só imprime os prompts (não chama a API)
  python3 arte/gerar.py --so personagem-socio-a  gera um asset só
  python3 arte/gerar.py --forcar               regera mesmo com o hash igual
  python3 arte/gerar.py --modelo gpt-image-2.5-sunburst

Precisa de OPENAI_API_KEY no ambiente (menos com --seco).
"""
import argparse
import base64
import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image

from paleta import imagem_paleta

RAIZ = Path(__file__).resolve().parent.parent
MANIFESTO = RAIZ / "arte" / "manifesto.json"
SAIDA = RAIZ / "public" / "arte"
ATLAS = SAIDA / "atlas.json"
TAMANHO_API = "1024x1024"
QUALIDADE = "medium"


# ------------------------------------------------------------------ manifesto

def carregar_manifesto(caminho=MANIFESTO):
    with open(caminho, encoding="utf-8") as arquivo:
        return json.load(arquivo)


def texto_do_prompt(manifesto, asset):
    """Preâmbulo da categoria + prompt do asset, exatamente como vai para a API."""
    return f"{manifesto['preambulos'][asset['categoria']]}. {asset['prompt']}."


def hash_do_asset(modelo, preambulo, asset):
    """Identidade do asset: muda se modelo, preâmbulo, prompt ou tamanho mudarem."""
    semente = f"{modelo}{preambulo}{asset['prompt']}{asset['w']}x{asset['h']}"
    return hashlib.sha256(semente.encode("utf-8")).hexdigest()[:12]


# ---------------------------------------------------------------------- atlas

def carregar_atlas(caminho=ATLAS):
    """Atlas atual como dicionário por id; vazio se ainda não existe ou está corrompido."""
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            return {entrada["id"]: entrada for entrada in json.load(arquivo)}
    except (OSError, ValueError, TypeError, KeyError):
        return {}


def gravar_atlas(entradas, caminho=ATLAS):
    """Grava o atlas ordenado por id (o cliente só depende dos ids, mas a ordem fixa evita diffs)."""
    lista = sorted(entradas.values(), key=lambda entrada: entrada["id"])
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as arquivo:
        json.dump(lista, arquivo, ensure_ascii=False, indent=2)
        arquivo.write("\n")
    return lista


# ------------------------------------------------------------ pós-processamento

def alfa_binario(img, limiar=128):
    """Canal alfa sem meio-tom: pixel art não tem borda semitransparente."""
    return img.getchannel("A").point(lambda v: 255 if v >= limiar else 0)


def ajustar_sujeito(img, largura_alvo, altura_alvo):
    """Personagem ou móvel: recorta pelo alfa, reduz preservando a proporção e ancora na base central."""
    img = img.convert("RGBA")
    img.putalpha(alfa_binario(img))
    caixa = img.getchannel("A").getbbox()
    if caixa:
        img = img.crop(caixa)
    escala = min(largura_alvo / img.width, altura_alvo / img.height)
    largura = max(1, min(largura_alvo, round(img.width * escala)))
    altura = max(1, min(altura_alvo, round(img.height * escala)))
    reduzida = img.resize((largura, altura), Image.NEAREST)
    tela = Image.new("RGBA", (largura_alvo, altura_alvo), (0, 0, 0, 0))
    tela.paste(reduzida, ((largura_alvo - largura) // 2, altura_alvo - altura))
    return tela


def ajustar_piso(img, largura_alvo, altura_alvo):
    """Piso: vai direto ao tamanho alvo. BOX (média de área) porque textura reduzida a 32 px
    com NEAREST vira ruído; a quantização seguinte devolve o visual chapado."""
    return img.convert("RGBA").resize((largura_alvo, altura_alvo), Image.BOX)


def quantizar(img, paleta=None):
    """Reduz à paleta comum sem dither e reaplica o alfa binário."""
    paleta = imagem_paleta() if paleta is None else paleta
    alfa = alfa_binario(img)
    rgb = img.convert("RGB").quantize(palette=paleta, dither=Image.Dither.NONE).convert("RGB")
    saida = rgb.convert("RGBA")
    saida.putalpha(alfa)
    return saida


def processar(img, asset, paleta=None):
    """Imagem crua da API → PNG final no tamanho, na âncora e na paleta do asset."""
    if asset["categoria"] == "piso":
        ajustada = ajustar_piso(img, asset["w"], asset["h"])
    else:
        ajustada = ajustar_sujeito(img, asset["w"], asset["h"])
    return quantizar(ajustada, paleta)


# ------------------------------------------------------------------------ API

def gerar_imagem(modelo, texto, categoria):
    """Chama a API de imagens e devolve o PNG como Image. Importa openai só aqui, para
    que --seco e os testes rodem sem o pacote."""
    from openai import OpenAI

    cliente = OpenAI()
    resposta = cliente.images.generate(
        model=modelo,
        prompt=texto,
        n=1,
        size=TAMANHO_API,
        quality=QUALIDADE,
        background="opaque" if categoria == "piso" else "transparent",
        output_format="png",
    )
    return Image.open(io.BytesIO(base64.b64decode(resposta.data[0].b64_json)))


# ------------------------------------------------------------------------ CLI

def principal(argv=None):
    ap = argparse.ArgumentParser(description="Gera a arte do Escritório de Pixels.")
    ap.add_argument("--modelo", help="sobrescreve o modelo do manifesto")
    ap.add_argument("--so", metavar="ID", help="gera só este asset")
    ap.add_argument("--forcar", action="store_true", help="regera mesmo com o hash igual")
    ap.add_argument("--seco", action="store_true", help="só imprime os prompts; não chama a API")
    args = ap.parse_args(argv)

    manifesto = carregar_manifesto()
    modelo = args.modelo or manifesto["modelo"]
    if args.modelo and args.modelo != manifesto["modelo"]:
        print(
            f"aviso: --modelo {args.modelo} difere do manifesto ({manifesto['modelo']}); "
            "o hash muda para todo asset. Use --so para regenerar pontualmente ou "
            'atualize "modelo" em arte/manifesto.json se a troca for definitiva.',
            file=sys.stderr,
        )
    assets = manifesto["assets"]
    if args.so:
        assets = [asset for asset in assets if asset["id"] == args.so]
        if not assets:
            print(f"asset desconhecido: {args.so}", file=sys.stderr)
            return 2

    atlas = carregar_atlas()
    paleta = imagem_paleta()
    gerados, pulados, falhas = [], [], []

    for asset in assets:
        preambulo = manifesto["preambulos"][asset["categoria"]]
        texto = texto_do_prompt(manifesto, asset)
        digest = hash_do_asset(modelo, preambulo, asset)
        if args.seco:
            print(f"{asset['id']} [{asset['categoria']} {asset['w']}x{asset['h']} {digest}] {texto}")
            continue
        atual = atlas.get(asset["id"])
        pronto = atual and atual.get("hash") == digest and (SAIDA / f"{asset['id']}.png").exists()
        if pronto and not args.forcar:
            pulados.append(asset["id"])
            continue
        try:
            bruta = gerar_imagem(modelo, texto, asset["categoria"])
            final = processar(bruta, asset, paleta)
            SAIDA.mkdir(parents=True, exist_ok=True)
            final.save(SAIDA / f"{asset['id']}.png", format="PNG", optimize=True)
        except Exception as erro:  # uma falha não derruba o lote inteiro
            falhas.append((asset["id"], f"{type(erro).__name__}: {erro}"))
            continue
        atlas[asset["id"]] = {
            "id": asset["id"],
            "arquivo": f"{asset['id']}.png",
            "categoria": asset["categoria"],
            "w": asset["w"],
            "h": asset["h"],
            "ancora": asset["ancora"],
            "hash": digest,
        }
        gerados.append(asset["id"])
        gravar_atlas(atlas)  # grava a cada sucesso: um lote interrompido não perde o progresso

    if args.seco:
        print(f"{len(assets)} prompts (modelo {modelo}); nada foi gerado", file=sys.stderr)
        return 0

    gravar_atlas(atlas)  # cobre o caso de nada ter sido gerado (tudo pulado ou tudo falhou)
    print(f"gerados: {len(gerados)} | pulados: {len(pulados)} | falhas: {len(falhas)}", file=sys.stderr)
    for identificador, erro in falhas:
        print(f"  falhou {identificador}: {erro}", file=sys.stderr)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(principal())
