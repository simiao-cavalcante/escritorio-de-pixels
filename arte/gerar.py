#!/usr/bin/env python3
"""Gera a arte do Escritório de Pixels com gpt-image-2.5 e pós-processa com Pillow.

Uso:
  python3 arte/gerar.py                        gera o que falta ou mudou de hash
  python3 arte/gerar.py --seco                 só imprime os prompts (não chama a API)
  python3 arte/gerar.py --so personagem-socio-a  gera um asset só
  python3 arte/gerar.py --forcar               regera mesmo com o hash igual
  python3 arte/gerar.py --modelo gpt-image-2.5-sunburst
  python3 arte/gerar.py --brutos /tmp/brutos --paralelo 4   guarda as imagens cruas; 4 chamadas por vez
  python3 arte/gerar.py --de-brutos /tmp/brutos --forcar    só repete o pós-processamento (sem API)

Precisa de OPENAI_API_KEY no ambiente (menos com --seco e --de-brutos).
"""
import argparse
import base64
import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image

from paleta import PALETA, imagem_paleta

RAIZ = Path(__file__).resolve().parent.parent
MANIFESTO = RAIZ / "arte" / "manifesto.json"
SAIDA = RAIZ / "public" / "arte"
ATLAS = SAIDA / "atlas.json"
QUALIDADE = "high"
# Tamanhos que a API aceita; escolhido pela proporção do alvo (ver tamanho_api).
TAMANHO_QUADRADO = "1024x1024"
TAMANHO_LARGO = "1536x1024"
TAMANHO_ALTO = "1024x1536"


# ------------------------------------------------------------------ manifesto

def carregar_manifesto(caminho=MANIFESTO):
    with open(caminho, encoding="utf-8") as arquivo:
        return json.load(arquivo)


def texto_do_prompt(manifesto, asset):
    """Preâmbulo da categoria + prompt do asset, exatamente como vai para a API."""
    return f"{manifesto['preambulos'][asset['categoria']]}. {asset['prompt']}."


def hash_do_asset(modelo, preambulo, asset, qualidade=QUALIDADE):
    """Identidade do asset: muda se modelo, preâmbulo, prompt, tamanho ou qualidade mudarem.
    O tamanho pedido à API deriva de w x h (tamanho_api), então já está coberto."""
    semente = f"{modelo}{preambulo}{asset['prompt']}{asset['w']}x{asset['h']}{qualidade}"
    return hashlib.sha256(semente.encode("utf-8")).hexdigest()[:12]


def tamanho_api(asset):
    """Quadro de geração com a proporção mais próxima do alvo, para o recorte proporcional
    desperdiçar menos: largos (96x48, 64x48, 64x32) em 1536x1024, altos (32x48, 32x64) em
    1024x1536, quadrados (32x32) em 1024x1024."""
    razao = asset["w"] / asset["h"]
    if razao >= 1.25:
        return TAMANHO_LARGO
    if razao <= 0.8:
        return TAMANHO_ALTO
    return TAMANHO_QUADRADO


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


def ajustar_sujeito(img, largura_alvo, altura_alvo, filtro=Image.BOX):
    """Personagem ou móvel: recorta pelo alfa, reduz preservando a proporção e ancora na base central.

    BOX (média de área), não NEAREST: a redução é de 30 a 50 vezes, e com NEAREST cada pixel final
    é uma amostra solta da bruta, então as linhas de dobra e sombra do terno ou dos livros caem
    ao acaso e viram chuvisco. A média devolve campos chapados; o contorno vem depois (contornar).
    """
    img = img.convert("RGBA")
    img.putalpha(alfa_binario(img))
    caixa = img.getchannel("A").getbbox()
    if caixa:
        img = img.crop(caixa)
    escala = min(largura_alvo / img.width, altura_alvo / img.height)
    largura = max(1, min(largura_alvo, round(img.width * escala)))
    altura = max(1, min(altura_alvo, round(img.height * escala)))
    reduzida = img.resize((largura, altura), filtro)
    reduzida.putalpha(alfa_binario(reduzida))  # a média deixa a borda semitransparente
    tela = Image.new("RGBA", (largura_alvo, altura_alvo), (0, 0, 0, 0))
    tela.paste(reduzida, ((largura_alvo - largura) // 2, altura_alvo - altura))
    return tela


def contornar(img, cor=None):
    """Pinta com a cor de contorno da paleta todo pixel opaco que toca (4 vizinhos) um transparente.
    A redução por média dilui o traço de 1 px da bruta; isto devolve uma silhueta nítida no piso."""
    cor = (PALETA[0] + (255,)) if cor is None else cor
    saida = img.copy()
    alfa = saida.getchannel("A").load()
    pixels = saida.load()
    largura, altura = saida.size
    for y in range(altura):
        for x in range(largura):
            if alfa[x, y] < 128:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= largura or ny >= altura or alfa[nx, ny] < 128:
                    pixels[x, y] = cor
                    break
    return saida


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
        return quantizar(ajustar_piso(img, asset["w"], asset["h"]), paleta)
    return contornar(quantizar(ajustar_sujeito(img, asset["w"], asset["h"]), paleta))


# ------------------------------------------------------------------------ API

def gerar_imagem(modelo, texto, categoria, tamanho=TAMANHO_QUADRADO, qualidade=QUALIDADE):
    """Chama a API de imagens e devolve (Image, uso). `uso` é o dicionário de tokens que a API
    informa (ou {}), para estimar custo. Importa openai só aqui, para que --seco e os testes
    rodem sem o pacote."""
    from openai import OpenAI

    cliente = OpenAI()
    resposta = cliente.images.generate(
        model=modelo,
        prompt=texto,
        n=1,
        size=tamanho,
        quality=qualidade,
        background="opaque" if categoria == "piso" else "transparent",
        output_format="png",
    )
    uso = resposta.usage.model_dump() if getattr(resposta, "usage", None) else {}
    return Image.open(io.BytesIO(base64.b64decode(resposta.data[0].b64_json))), uso


# ------------------------------------------------------------------------ CLI

def obter_bruta(asset, texto, modelo, args):
    """Imagem crua do asset: da pasta --de-brutos (sem rede) ou da API (gravando em --brutos)."""
    nome = f"{asset['id']}.png"
    if args.de_brutos:
        return Image.open(Path(args.de_brutos) / nome), {}
    bruta, uso = gerar_imagem(modelo, texto, asset["categoria"], tamanho_api(asset))
    if args.brutos:
        pasta = Path(args.brutos)
        pasta.mkdir(parents=True, exist_ok=True)
        bruta.save(pasta / nome, format="PNG")
    return bruta, uso


def produzir(asset, texto, modelo, args, paleta):
    """Gera (ou relê) a imagem crua e grava o PNG final. Devolve o uso de tokens da API."""
    bruta, uso = obter_bruta(asset, texto, modelo, args)
    final = processar(bruta, asset, paleta)
    SAIDA.mkdir(parents=True, exist_ok=True)
    final.save(SAIDA / f"{asset['id']}.png", format="PNG", optimize=True)
    return uso


def principal(argv=None):
    ap = argparse.ArgumentParser(description="Gera a arte do Escritório de Pixels.")
    ap.add_argument("--modelo", help="sobrescreve o modelo do manifesto")
    ap.add_argument("--so", metavar="ID", help="gera só este asset")
    ap.add_argument("--forcar", action="store_true", help="regera mesmo com o hash igual")
    ap.add_argument("--seco", action="store_true", help="só imprime os prompts; não chama a API")
    ap.add_argument("--brutos", metavar="DIR", help="guarda a imagem crua da API nesta pasta")
    ap.add_argument("--de-brutos", metavar="DIR", dest="de_brutos",
                    help="reprocessa a partir das imagens cruas desta pasta, sem chamar a API")
    ap.add_argument("--paralelo", type=int, default=1, metavar="N", help="chamadas simultâneas à API")
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
    uso_total = {}
    pendentes = []

    for asset in assets:
        preambulo = manifesto["preambulos"][asset["categoria"]]
        texto = texto_do_prompt(manifesto, asset)
        digest = hash_do_asset(modelo, preambulo, asset)
        if args.seco:
            print(f"{asset['id']} [{asset['categoria']} {asset['w']}x{asset['h']} {tamanho_api(asset)} {digest}] {texto}")
            continue
        atual = atlas.get(asset["id"])
        pronto = atual and atual.get("hash") == digest and (SAIDA / f"{asset['id']}.png").exists()
        if pronto and not args.forcar:
            pulados.append(asset["id"])
            continue
        pendentes.append((asset, texto, digest))

    if args.seco:
        print(f"{len(assets)} prompts (modelo {modelo}, {QUALIDADE}); nada foi gerado", file=sys.stderr)
        return 0

    def concluir(asset, digest, resultado):
        """Registra o resultado no atlas (só no fio principal) e grava a cada sucesso: um lote
        interrompido não perde o progresso."""
        if isinstance(resultado, BaseException):
            falhas.append((asset["id"], f"{type(resultado).__name__}: {resultado}"))
            return
        for chave, valor in resultado.items():
            if isinstance(valor, (int, float)):
                uso_total[chave] = uso_total.get(chave, 0) + valor
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
        gravar_atlas(atlas)
        print(f"  ok {asset['id']} {resultado or ''}".rstrip(), file=sys.stderr)

    def tentar(asset, texto):
        try:
            return produzir(asset, texto, modelo, args, paleta)
        except Exception as erro:  # uma falha não derruba o lote inteiro
            return erro

    if args.paralelo > 1 and len(pendentes) > 1:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        with ThreadPoolExecutor(max_workers=args.paralelo) as executor:
            futuros = {executor.submit(tentar, asset, texto): (asset, digest) for asset, texto, digest in pendentes}
            for futuro in as_completed(futuros):
                asset, digest = futuros[futuro]
                concluir(asset, digest, futuro.result())
    else:
        for asset, texto, digest in pendentes:
            concluir(asset, digest, tentar(asset, texto))

    gravar_atlas(atlas)  # cobre o caso de nada ter sido gerado (tudo pulado ou tudo falhou)
    print(f"gerados: {len(gerados)} | pulados: {len(pulados)} | falhas: {len(falhas)}", file=sys.stderr)
    if uso_total:
        print(f"uso acumulado da API: {uso_total}", file=sys.stderr)
    for identificador, erro in falhas:
        print(f"  falhou {identificador}: {erro}", file=sys.stderr)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(principal())
