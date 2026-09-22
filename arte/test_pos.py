"""Testes do pós-processamento da arte. Não usam rede: a imagem de entrada é sintética."""
import sys
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gerar import (  # noqa: E402  (depende do sys.path acima)
    ajustar_piso,
    ajustar_sujeito,
    carregar_manifesto,
    contornar,
    hash_do_asset,
    processar,
    quantizar,
    tamanho_api,
    texto_do_prompt,
)
from paleta import CAMINHO as PALETA_PNG  # noqa: E402
from paleta import PALETA  # noqa: E402


def sujeito_sintetico():
    """1024x1024 transparente com um retângulo opaco de 300x600 fora do centro."""
    tela = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    tela.paste(Image.new("RGBA", (300, 600), (200, 30, 40, 255)), (200, 100))
    return tela


class PosProcessamento(unittest.TestCase):
    def test_sujeito_cabe_no_alvo_com_a_base_no_chao(self):
        alvo = ajustar_sujeito(sujeito_sintetico(), 32, 48)
        self.assertEqual(alvo.size, (32, 48))
        # 300x600 cabe em 32x48 pela altura: 24x48, centralizado em x e colado na base.
        self.assertEqual(alvo.getchannel("A").getbbox(), (4, 0, 28, 48))

    def test_alfa_de_meio_tom_vira_binario(self):
        tela = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        tela.paste(Image.new("RGBA", (32, 32), (10, 200, 10, 120)), (16, 16))
        alvo = ajustar_sujeito(tela, 32, 48)
        self.assertIsNone(alvo.getchannel("A").getbbox())

    def test_piso_fica_opaco_no_tamanho_exato(self):
        piso = Image.new("RGB", (1024, 1024), (120, 90, 50)).convert("RGBA")
        alvo = ajustar_piso(piso, 32, 32)
        self.assertEqual(alvo.size, (32, 32))
        self.assertEqual(alvo.getchannel("A").getextrema(), (255, 255))

    def test_quantizar_usa_so_a_paleta_e_alfa_binario(self):
        alvo = quantizar(ajustar_sujeito(sujeito_sintetico(), 32, 48))
        cores = {cor for _, cor in alvo.getcolors(4096)}
        self.assertLessEqual({cor[:3] for cor in cores}, set(PALETA))
        self.assertLessEqual({cor[3] for cor in cores}, {0, 255})

    def test_hash_muda_com_o_modelo_e_e_estavel(self):
        asset = {"prompt": "x", "w": 32, "h": 48}
        primeiro = hash_do_asset("gpt-image-2.5-flare", "pre", asset)
        self.assertEqual(primeiro, hash_do_asset("gpt-image-2.5-flare", "pre", asset))
        self.assertNotEqual(primeiro, hash_do_asset("gpt-image-2.5-sunburst", "pre", asset))
        self.assertEqual(len(primeiro), 12)

    def test_manifesto_tem_27_assets_coerentes(self):
        manifesto = carregar_manifesto()
        assets = manifesto["assets"]
        self.assertEqual(len(assets), 27)
        self.assertEqual(len({a["id"] for a in assets}), 27)
        contagem = {c: sum(1 for a in assets if a["categoria"] == c) for c in ("personagem", "movel", "piso")}
        self.assertEqual(contagem, {"personagem": 12, "movel": 10, "piso": 5})
        for asset in assets:
            self.assertIn(asset["categoria"], manifesto["preambulos"])
            self.assertIn(manifesto["preambulos"][asset["categoria"]], texto_do_prompt(manifesto, asset))
            self.assertEqual(set(asset["ancora"]), {"x", "y"})
            self.assertEqual(asset["w"] % 32, 0)
            self.assertIn(asset["h"], (32, 48, 64))

    def test_contornar_pinta_so_a_borda_com_a_cor_de_contorno(self):
        alvo = quantizar(ajustar_sujeito(sujeito_sintetico(), 32, 48))
        com_contorno = contornar(alvo)
        contorno = PALETA[0] + (255,)
        self.assertEqual(com_contorno.getpixel((4, 0)), contorno)  # canto do retângulo 24x48
        self.assertEqual(com_contorno.getpixel((27, 47)), contorno)
        self.assertEqual(com_contorno.getpixel((15, 24)), alvo.getpixel((15, 24)))  # miolo intacto
        self.assertNotEqual(com_contorno.getpixel((15, 24)), contorno)
        self.assertEqual(com_contorno.getchannel("A").getbbox(), alvo.getchannel("A").getbbox())

    def test_processar_reduz_por_media_sem_chuvisco_e_com_contorno(self):
        """Bruta listrada (fundo azul com linhas pretas finas): NEAREST amostraria as linhas ao
        acaso; a média dá um campo chapado de uma cor só, cercado pelo contorno."""
        bruta = Image.new("RGBA", (1024, 1536), (31, 58, 99, 255))  # preenche o quadro: vira 32x48
        for y in range(0, 1536, 24):
            bruta.paste(Image.new("RGBA", (1024, 2), (0, 0, 0, 255)), (0, y))
        final = processar(bruta, {"categoria": "personagem", "w": 32, "h": 48})
        miolo = {final.getpixel((x, y)) for x in range(2, 30) for y in range(2, 46)}
        self.assertEqual(len(miolo), 1, f"miolo deveria ser uma cor só, veio {miolo}")
        self.assertEqual(final.getpixel((0, 0)), PALETA[0] + (255,))
        self.assertEqual(final.getpixel((31, 47)), PALETA[0] + (255,))

    def test_tamanho_api_segue_a_proporcao_do_alvo(self):
        self.assertEqual(tamanho_api({"w": 96, "h": 48}), "1536x1024")
        self.assertEqual(tamanho_api({"w": 64, "h": 48}), "1536x1024")
        self.assertEqual(tamanho_api({"w": 64, "h": 32}), "1536x1024")
        self.assertEqual(tamanho_api({"w": 32, "h": 48}), "1024x1536")
        self.assertEqual(tamanho_api({"w": 32, "h": 64}), "1024x1536")
        self.assertEqual(tamanho_api({"w": 32, "h": 32}), "1024x1024")

    def test_paleta_png_bate_com_a_paleta_do_codigo(self):
        """O PNG commitado não pode divergir de PALETA: mesmas 32 cores, na mesma ordem."""
        png = Image.open(PALETA_PNG).convert("RGB")
        self.assertEqual([png.getpixel((x, 0)) for x in range(png.width)], PALETA)


if __name__ == "__main__":
    unittest.main()
