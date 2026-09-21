# Escritório de Pixels — Plano 3: Arte (gpt-image-2.5), documentação e publicação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar os 27 sprites do escritório com gpt-image-2.5, publicá-los em `public/arte/` com um `atlas.json` verificável, escrever a documentação (protocolo, adaptadores, READMEs pt-BR e en, GIF da demo) e publicar o repositório no GitHub — este último passo só com confirmação explícita do usuário.

**Architecture:** `arte/` é uma ferramenta de desenvolvimento em Python, fora do runtime: `paleta.py` fixa 32 cores, `manifesto.json` descreve cada asset (id, categoria, prompt, tamanho, âncora) e `gerar.py` chama a API de imagens, pós-processa com Pillow (recorte pelo alfa, redução nearest-neighbor, âncora na base central, quantização à paleta) e escreve `public/arte/<id>.png` mais `public/arte/atlas.json`. O cliente do Plano 2 consome só o atlas e cai em placeholders procedurais quando falta um id. A documentação descreve os artefatos do Plano 1 (rotas, hooks, instaladores) e o modo demo é a única fonte de imagens e GIF.

**Tech Stack:** Node.js >= 20 (ESM, `node:test`) para o teste do atlas; Python 3 com `openai` e `Pillow` só em `arte/`; `gh` para a publicação; `ffmpeg` para normalizar o GIF (paleta de 64 cores e largura 960) nos dois caminhos de gravação.

Spec: `docs/superpowers/specs/2026-09-20-escritorio-de-pixels-design.md` (seções 9, 14, 15 e 16; estrutura de pastas da seção 3; matriz de capacidades da seção 7; privacidade da seção 10).

Pré-requisitos: Plano 1 (`docs/superpowers/plans/2026-09-20-escritorio-nucleo.md`) e Plano 2 (`docs/superpowers/plans/2026-09-21-escritorio-cliente.md`) concluídos, `npm test` verde em `feat/cliente`.

## Global Constraints

- Node `>= 20`, ESM, **zero dependências de runtime**; Python existe só em `arte/`, com `arte/requirements.txt`, e nunca entra em `package.json`.
- Nada de conteúdo real de sessões em capturas, GIF ou fixtures: só o modo demo (`node server.mjs --demo`, que responde `503` a `/eventos` e `/hook/*`).
- Modelo de imagem padrão `gpt-image-2.5-flare` (alternativa `gpt-image-2.5-sunburst`), sobrescrevível por `--modelo`; `size=1024x1024`, `quality=medium`.
- Ids de sprite e formato do atlas exatamente como o cliente do Plano 2 espera: `public/arte/atlas.json` = `[{ id, arquivo, categoria, w, h, ancora: { x, y }, hash }]`, ordenado por id.
- Personagens `32x48` com âncora `(16, 48)`; móveis com âncora na base central; pisos `32x32` com âncora `(0, 0)`.
- `arte/gerar.py` é idempotente: só regera quando o hash (`modelo + preâmbulo + prompt + tamanho`) muda ou com `--forcar`; falha de API não interrompe o lote e o processo sai com código 1 se houve falha.
- A única chamada de rede externa do projeto continua sendo a de `arte/gerar.py`, rodada à mão em desenvolvimento.
- Identificadores e comentários em português; mensagens de commit em português terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Branch `feat/arte` a partir de `feat/cliente`; a integração e a publicação acontecem em `main`.
- **Publicar no GitHub só com confirmação explícita do usuário no momento da execução** (Task 7, Step 4).
- Cada tarefa termina com `npm test` verde e um commit.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `arte/requirements.txt` | dependências de desenvolvimento da arte (`openai`, `Pillow`); nunca em `package.json` |
| `arte/paleta.py` + `arte/paleta.png` | 32 cores fixas; `imagem_paleta()` (modo P) para a quantização; PNG 32x1 commitado |
| `arte/manifesto.json` | `versao`, `modelo`, `preambulos` por categoria e os 27 assets (`id`, `categoria`, `prompt`, `w`, `h`, `ancora`) |
| `arte/gerar.py` | chama gpt-image-2.5, pós-processa com Pillow, escreve `public/arte/*.png` e atualiza o atlas |
| `arte/test_pos.py` | testes do pós-processamento e do manifesto, sem rede (`python3 -m unittest arte/test_pos.py`) |
| `.github/workflows/ci.yml` | job `test` do Plano 1 inalterado; ganha o job `arte` (Python, sem rede) |
| `arte/CREDITOS.md` | origem da arte, modelo, versão do manifesto e licença |
| `arte/contato.py` | contact sheet (`docs/screenshots/arte-contato.png`) para inspeção visual dos 27 sprites |
| `public/arte/*.png`, `public/arte/atlas.json` | saída consumida por `public/sprites.js` (Plano 2) |
| `test/atlas.test.js` | atlas × manifesto × IHDR dos PNGs; pulado enquanto não houver arte |
| `docs/protocolo.md` | evento v1: campos, tipos, limites, respostas, `curl`, deduplicação, privacidade |
| `docs/adaptadores.md` | hooks por CLI, instalação, particularidades, OpenCode, esqueleto de contribuição |
| `adaptadores/generico.md` | como emitir eventos via `curl` para uma CLI sem adaptador dedicado |
| `README.md`, `README.en.md` | capa com o GIF, instalação, hooks, salas e cargos, privacidade, créditos, licença |
| `docs/demo.gif`, `docs/screenshots/demo-NN.png` | demonstração gravada só com dados sintéticos |
| `package.json` | `repository`, `homepage`, `bugs`, `keywords` conferidos antes da publicação |

---

### Task 1: `arte/paleta.py`, `arte/paleta.png` e `arte/requirements.txt`

**Files:**
- Create: `arte/requirements.txt`, `arte/paleta.py`
- Generate: `arte/paleta.png`

**Interfaces:**
- Produces: `PALETA` (lista de 32 tuplas RGB), `imagem_paleta() → PIL.Image` no modo `P` com as 32 cores repetidas até 256 entradas, `gravar(caminho) → Path`.
- Consumed by: `arte/gerar.py` (quantização) e `arte/test_pos.py`.

- [ ] **Step 1: Criar a branch e `arte/requirements.txt`**

```bash
git checkout feat/cliente
git checkout -b feat/arte
mkdir -p arte
```

`arte/requirements.txt`:

```
# Ferramentas de desenvolvimento da arte. O servidor continua com zero dependências.
openai>=1.40
Pillow>=10.4
```

- [ ] **Step 2: Conferir o ambiente Python**

Run: `python3 -c "import PIL, openai; print('Pillow', PIL.__version__); print('openai', openai.__version__)"`
Expected: `Pillow 12.3.0` e `openai` com versão `1.x` (>= 1.40). Se faltar algo: `python3 -m pip install -r arte/requirements.txt`.

- [ ] **Step 3: Escrever `arte/paleta.py`**

```python
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
```

- [ ] **Step 4: Gerar a paleta**

Run: `python3 arte/paleta.py`
Expected: `arte/paleta.png: 32 cores, 32x1`.

- [ ] **Step 5: Conferir o PNG gerado**

Run:

```bash
python3 -c "
from PIL import Image
img = Image.open('arte/paleta.png')
print(img.mode, img.size, len(set(img.convert('RGB').getdata())))
"
```

Expected: `RGB (32, 1) 32`.

- [ ] **Step 6: Commit**

```bash
git add arte/requirements.txt arte/paleta.py arte/paleta.png
git commit -m "feat: paleta comum de 32 cores da arte do escritório

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `arte/manifesto.json` — 27 assets com prompts

**Files:**
- Create: `arte/manifesto.json`

**Interfaces:**
- Produces: `{ versao: 1, modelo: 'gpt-image-2.5-flare', preambulos: { personagem, movel, piso }, assets: [{ id, categoria, prompt, w, h, ancora: { x, y } }] }`.
- Ids consumidos pelo cliente (Plano 2): personagens `personagem-<socio|senior|associado|junior|advogado|estagiario>-<a|b>`, móveis `movel-<mesa|estante|arquivo|mesa-reuniao|balcao|cadeira|planta|cafe|impressora|quadro>`, pisos `piso-<madeira|carpete|parede|porta|tapete>`.

Prompts em inglês (é o idioma em que o modelo rende melhor), descrevendo pessoas fictícias e diversas, trajes de advocacia, sem logos nem marcas reais. `piso-porta` e `piso-tapete` usam o preâmbulo de piso por serem tiles do mesmo tamanho, mas não precisam ser repetíveis: o cliente os desenha uma vez cada.

- [ ] **Step 1: Escrever `arte/manifesto.json`**

```json
{
  "versao": 1,
  "modelo": "gpt-image-2.5-flare",
  "preambulos": {
    "personagem": "16-bit pixel art, top-down three-quarter view, flat colors, no anti-aliasing, thin dark outline, a single subject centered, transparent background, no text, no watermark",
    "movel": "16-bit pixel art, top-down three-quarter view, flat colors, no anti-aliasing, thin dark outline, a single subject centered, transparent background, no text, no watermark",
    "piso": "seamless tileable 16-bit pixel art texture, top-down view, flat colors, no anti-aliasing, opaque, no objects, no text"
  },
  "assets": [
    { "id": "personagem-socio-a", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional law firm senior partner: a woman in her fifties with light brown skin and short silver hair, navy blue three-piece suit, burgundy tie, blank name badge, standing upright with her arms at her sides" },
    { "id": "personagem-socio-b", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional law firm senior partner: a man in his sixties with dark brown skin, a bald head and a short grey beard, dark navy suit, white shirt, deep green tie, standing upright with his arms at his sides" },
    { "id": "personagem-senior-a", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional senior lawyer: a man in his forties with olive skin and short black hair, graphite grey suit over a light blue shirt with no tie, a closed cardboard folder under one arm" },
    { "id": "personagem-senior-b", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional senior lawyer: a woman in her forties with dark skin and long black braids tied back, graphite grey blazer and skirt over a cream blouse, holding a closed cardboard folder" },
    { "id": "personagem-associado-a", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional associate lawyer: a woman in her thirties with fair skin and shoulder-length auburn hair, medium grey blazer over a white shirt, carrying a thin closed laptop" },
    { "id": "personagem-associado-b", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional associate lawyer: a man in his thirties with brown skin and short curly black hair, medium grey suit with no tie, carrying a thin closed laptop" },
    { "id": "personagem-junior-a", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional junior lawyer: a young man with pale skin and messy blond hair, light grey shirt with rolled-up sleeves and dark trousers, hugging a tall stack of paper" },
    { "id": "personagem-junior-b", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional junior lawyer: a young woman with medium brown skin and a short black bob, light grey blouse and dark trousers, hugging a tall stack of paper" },
    { "id": "personagem-advogado-a", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional lawyer of no particular seniority: a person with tan skin and short dark brown hair, plain neutral grey suit and white shirt, arms at the sides, calm neutral pose" },
    { "id": "personagem-advogado-b", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional lawyer of no particular seniority: a person with pale skin and grey hair in a low bun, plain neutral grey blazer and dark trousers, arms at the sides, calm neutral pose" },
    { "id": "personagem-estagiario-a", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional law intern: a young man with dark skin and short black hair, dark green sweater over a white shirt, beige trousers, holding a small notebook, eager upright pose" },
    { "id": "personagem-estagiario-b", "categoria": "personagem", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a fictional law intern: a young woman with light olive skin and brown hair in a ponytail, dark green cardigan over a white blouse, grey skirt, holding a small notebook" },
    { "id": "movel-mesa", "categoria": "movel", "w": 64, "h": 48, "ancora": { "x": 32, "y": 48 },
      "prompt": "a wooden office desk with a boxy computer monitor, a keyboard and a small pile of documents on top" },
    { "id": "movel-estante", "categoria": "movel", "w": 32, "h": 64, "ancora": { "x": 16, "y": 64 },
      "prompt": "a tall dark wooden bookshelf packed with thick law books bound in deep red, green and brown" },
    { "id": "movel-arquivo", "categoria": "movel", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a grey steel filing cabinet with four closed drawers and metal handles, one drawer slightly ajar showing beige folders" },
    { "id": "movel-mesa-reuniao", "categoria": "movel", "w": 96, "h": 48, "ancora": { "x": 48, "y": 48 },
      "prompt": "a long oval wooden meeting table with six dark chairs around it, a glass water jug and a few scattered documents on top" },
    { "id": "movel-balcao", "categoria": "movel", "w": 96, "h": 48, "ancora": { "x": 48, "y": 48 },
      "prompt": "a wide wooden reception counter with a pale stone top, a small service bell and a closed guest book" },
    { "id": "movel-cadeira", "categoria": "movel", "w": 32, "h": 32, "ancora": { "x": 16, "y": 32 },
      "prompt": "a single black office swivel chair with a padded back and five castors" },
    { "id": "movel-planta", "categoria": "movel", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a tall potted plant with broad green leaves in a terracotta pot" },
    { "id": "movel-cafe", "categoria": "movel", "w": 32, "h": 48, "ancora": { "x": 16, "y": 48 },
      "prompt": "a small chrome and black espresso machine standing on a short white cabinet, with two cups beside it" },
    { "id": "movel-impressora", "categoria": "movel", "w": 32, "h": 32, "ancora": { "x": 16, "y": 32 },
      "prompt": "a grey office printer with a paper tray and a few printed sheets in the output slot" },
    { "id": "movel-quadro", "categoria": "movel", "w": 64, "h": 32, "ancora": { "x": 32, "y": 32 },
      "prompt": "a cork notice board in a wooden frame with blank white, yellow and blue paper notes pinned to it" },
    { "id": "piso-madeira", "categoria": "piso", "w": 32, "h": 32, "ancora": { "x": 0, "y": 0 },
      "prompt": "a warm brown wooden parquet floor made of short planks in a regular pattern" },
    { "id": "piso-carpete", "categoria": "piso", "w": 32, "h": 32, "ancora": { "x": 0, "y": 0 },
      "prompt": "a dark blue-grey office carpet with a fine even weave" },
    { "id": "piso-parede", "categoria": "piso", "w": 32, "h": 32, "ancora": { "x": 0, "y": 0 },
      "prompt": "a plain painted interior office wall in light warm grey, with a faint vertical seam" },
    { "id": "piso-porta", "categoria": "piso", "w": 32, "h": 32, "ancora": { "x": 0, "y": 0 },
      "prompt": "a closed dark wooden office door with a brass handle and a pale frame, filling the whole tile" },
    { "id": "piso-tapete", "categoria": "piso", "w": 32, "h": 32, "ancora": { "x": 0, "y": 0 },
      "prompt": "a deep red patterned rug with a simple geometric border" }
  ]
}
```

- [ ] **Step 2: Conferir a contagem, os ids e as âncoras**

Run:

```bash
python3 -c "
import json
m = json.load(open('arte/manifesto.json', encoding='utf-8'))
a = m['assets']
cont = {c: sum(1 for x in a if x['categoria'] == c) for c in ('personagem', 'movel', 'piso')}
print(len(a), cont, 'ids unicos:', len({x['id'] for x in a}) == len(a))
print('ancora base central:', all(x['ancora'] == {'x': x['w'] // 2, 'y': x['h']} for x in a if x['categoria'] != 'piso'))
print('pisos na origem:', all(x['ancora'] == {'x': 0, 'y': 0} for x in a if x['categoria'] == 'piso'))
"
```

Expected:

```
27 {'personagem': 12, 'movel': 10, 'piso': 5} ids unicos: True
ancora base central: True
pisos na origem: True
```

- [ ] **Step 3: Conferir que os ids batem com os que o cliente pede**

Run:

```bash
python3 -c "
import json
ids = {x['id'] for x in json.load(open('arte/manifesto.json', encoding='utf-8'))['assets']}
esperados = {f'personagem-{c}-{v}' for c in ('socio','senior','associado','junior','advogado','estagiario') for v in 'ab'}
esperados |= {f'movel-{n}' for n in ('mesa','estante','arquivo','mesa-reuniao','balcao','cadeira','planta','cafe','impressora','quadro')}
esperados |= {f'piso-{n}' for n in ('madeira','carpete','parede','porta','tapete')}
print('faltando:', sorted(esperados - ids))
print('sobrando:', sorted(ids - esperados))
"
```

Expected:

```
faltando: []
sobrando: []
```

- [ ] **Step 4: Commit**

```bash
git add arte/manifesto.json
git commit -m "feat: manifesto da arte com 27 assets e preâmbulos por categoria

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `arte/gerar.py` e `arte/test_pos.py`

**Files:**
- Create: `arte/gerar.py`, `arte/test_pos.py`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `arte/manifesto.json` (Task 2), `paleta.imagem_paleta()` (Task 1).
- Produces (funções importáveis): `carregar_manifesto()`, `texto_do_prompt(manifesto, asset)`, `hash_do_asset(modelo, preambulo, asset) → str[12]`, `carregar_atlas()`, `gravar_atlas(entradas)`, `alfa_binario(img)`, `ajustar_sujeito(img, w, h)`, `ajustar_piso(img, w, h)`, `quantizar(img, paleta=None)`, `processar(img, asset, paleta=None)`, `gerar_imagem(modelo, texto, categoria)`, `principal(argv=None) → int`.
- CLI: `python3 arte/gerar.py [--seco] [--so ID] [--forcar] [--modelo M]`.
- Efeito: escreve `public/arte/<id>.png` e `public/arte/atlas.json`.

- [ ] **Step 1: Escrever `arte/test_pos.py`**

```python
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
    hash_do_asset,
    quantizar,
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

    def test_paleta_png_bate_com_a_paleta_do_codigo(self):
        """O PNG commitado não pode divergir de PALETA: mesmas 32 cores, na mesma ordem."""
        png = Image.open(PALETA_PNG).convert("RGB")
        self.assertEqual(list(png.getdata()), PALETA)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `python3 -m unittest arte/test_pos.py`
Expected: FAIL com `ModuleNotFoundError: No module named 'gerar'`.

- [ ] **Step 3: Escrever `arte/gerar.py`**

O atlas é gravado logo após cada asset bem-sucedido (`gravar_atlas(atlas)` dentro do laço)
e de novo no fim: um lote interrompido no meio (Ctrl+C, queda de rede, cota) deixa
`public/arte/atlas.json` coerente com os PNGs já escritos, e a execução seguinte pula o que
já está pronto. Quando `--modelo` difere do manifesto, o script avisa em stderr que o hash
muda para todo asset (ver Task 4, Step 1).

```python
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
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `python3 -m unittest arte/test_pos.py`
Expected: `Ran 7 tests` e `OK`.

- [ ] **Step 5: Acrescentar o job `arte` ao CI**

O CI (`.github/workflows/ci.yml`, criado no Plano 1) só roda `npm test`, em Node. Com
Python entrando no repositório nesta tarefa, ele ganha um segundo job que instala Pillow e
roda `arte/test_pos.py` — sem rede, sem `OPENAI_API_KEY`. O job `test` existente não muda.

`.github/workflows/ci.yml`:

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
  arte:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install Pillow
      - run: python3 -m unittest arte/test_pos.py
```

Run: `git diff -- .github/workflows/ci.yml`
Expected: o job `test` inalterado e um job `arte` novo, com `setup-python@v5`, `pip install
Pillow` e `python3 -m unittest arte/test_pos.py`.

- [ ] **Step 6: Conferir o modo seco (sem API)**

Run: `python3 arte/gerar.py --seco | wc -l`
Expected: `27` (a linha de resumo `27 prompts (modelo gpt-image-2.5-flare); nada foi gerado` sai em stderr).

Run: `python3 arte/gerar.py --seco 2>/dev/null | head -2`
Expected: duas linhas começando por `personagem-socio-a [personagem 32x48 ` e `personagem-socio-b [personagem 32x48 `, cada uma terminando com o preâmbulo de personagem seguido do prompt do asset.

Run: `python3 arte/gerar.py --seco --so piso-madeira 2>/dev/null`
Expected: uma linha começando por `piso-madeira [piso 32x32 ` e com o preâmbulo de piso.

Run: `python3 arte/gerar.py --so nao-existe; echo "saida=$?"`
Expected: `asset desconhecido: nao-existe` e `saida=2`.

Run: `python3 arte/gerar.py --seco --modelo gpt-image-2.5-sunburst 2>&1 >/dev/null | head -1`
Expected: `aviso: --modelo gpt-image-2.5-sunburst difere do manifesto (gpt-image-2.5-flare); o hash muda para todo asset. Use --so para regenerar pontualmente ou atualize "modelo" em arte/manifesto.json se a troca for definitiva.`

- [ ] **Step 7: Commit**

```bash
git add arte/gerar.py arte/test_pos.py .github/workflows/ci.yml
git commit -m "feat: gerador de arte com gpt-image-2.5, pós-processamento e atlas idempotente

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Geração real, inspeção visual e `test/atlas.test.js`

**Files:**
- Create: `public/arte/*.png` (27), `public/arte/atlas.json`, `test/atlas.test.js`, `arte/contato.py`, `docs/screenshots/arte-contato.png`

**Interfaces:**
- Consumes: `arte/gerar.py` (Task 3), `arte/manifesto.json` (Task 2).
- Produces: `public/arte/atlas.json` = `[{ id, arquivo, categoria, w, h, ancora: { x, y }, hash }]`, consumido por `public/sprites.js` (Plano 2).

**Custo e tempo:** são 27 imagens 1024x1024 em `quality=medium` — ordem de grandeza de alguns centavos de dólar por imagem, poucos dólares no lote inteiro, e alguns minutos de execução. Confira o preço vigente no painel da OpenAI antes de rodar. O script é idempotente: rodar de novo sem mudar o manifesto não gasta nada (tudo é pulado), e `--so <id>` regenera um asset só.

- [ ] **Step 1: Conferir a chave e o modelo**

Run: `python3 -c "import os; print('OPENAI_API_KEY', 'ok' if os.environ.get('OPENAI_API_KEY') else 'AUSENTE')"`
Expected: `OPENAI_API_KEY ok`.

Run: `python3 -c "from openai import OpenAI; print(sorted(m.id for m in OpenAI().models.list() if 'image' in m.id))"`
Expected: lista contendo `gpt-image-2.5-flare` e `gpt-image-2.5-sunburst`.

Se `flare` não aparecer, a troca é definitiva: mude `"modelo"` em `arte/manifesto.json` para
`gpt-image-2.5-sunburst`, rode `python3 arte/gerar.py` **sem** `--modelo` e anote a troca em
`arte/CREDITOS.md` na Task 5. O motivo: o `hash` de cada asset inclui o modelo, e é o
manifesto que entra nele. Passar só `--modelo gpt-image-2.5-sunburst` serve para um teste
pontual (de preferência com `--so <id>`): com a flag, os 27 assets ficam com hash diferente
do atlas e seriam todos regerados; sem a flag, na execução seguinte, o hash volta ao do
manifesto e os 27 seriam regerados **de novo**, pagando o lote duas vezes. Por isso
`gerar.py` imprime um aviso em stderr sempre que `--modelo` difere do manifesto (conferido
na Task 3, Step 6).

- [ ] **Step 2: Gerar os 27 assets**

Run: `python3 arte/gerar.py`
Expected (em stderr): `gerados: 27 | pulados: 0 | falhas: 0`, código de saída 0. Se aparecerem falhas, rode de novo: os que deram certo são pulados e só os que faltam são tentados.

- [ ] **Step 3: Conferir a idempotência**

Run: `python3 arte/gerar.py; echo "saida=$?"`
Expected: `gerados: 0 | pulados: 27 | falhas: 0` e `saida=0` (nenhuma chamada nova à API).

- [ ] **Step 4: Conferir tamanhos e paleta de cada PNG**

Run:

```bash
python3 - <<'PY'
import json, sys
from pathlib import Path
from PIL import Image
sys.path.insert(0, "arte")
from paleta import PALETA
for entrada in json.load(open("public/arte/atlas.json", encoding="utf-8")):
    img = Image.open(Path("public/arte") / entrada["arquivo"]).convert("RGBA")
    fora = {cor[:3] for _, cor in img.getcolors(65536) if cor[3] == 255} - set(PALETA)
    print(f"{entrada['id']:24} {img.size[0]}x{img.size[1]} declarado={entrada['w']}x{entrada['h']} fora-da-paleta={len(fora)}")
PY
```

Expected: 27 linhas, cada uma com o tamanho igual ao declarado e `fora-da-paleta=0`.

- [ ] **Step 5: Escrever `arte/contato.py` — inspeção visual executável**

`open public/arte` e o Quick Look funcionam, mas não deixam rastro nem são repetíveis por
um agente. `arte/contato.py` monta um único PNG — um contact sheet — com todos os sprites
do atlas ampliados 3x (nearest-neighbor, sem borrar a pixel art), cada um com o id como
rótulo sobre um fundo cinza (revela franja de alfa que sumiria num fundo branco), e um
mosaico 2x2 de cada piso repetido, para julgar a emenda de perto. Não chama rede.

```python
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
```

- [ ] **Step 6: Rodar a inspeção e conferir os critérios**

Run: `python3 arte/contato.py`
Expected: uma linha `docs/screenshots/arte-contato.png: (L, A)` (as dimensões variam com o
tamanho do maior sprite; não há um valor fixo a conferir).

Leia `docs/screenshots/arte-contato.png` com a ferramenta de leitura de imagem do agente e
confira, asset por asset:

- personagem: silhueta única e legível a 32x48, cabeça e corpo distinguíveis, contorno escuro visível, pés tocando a borda de baixo, sem cortes nas laterais, fundo transparente sem franja (nenhum halo colorido contra o cinza de fundo);
- variações `a` e `b` do mesmo cargo claramente diferentes entre si (cabelo, pele, roupa) e coerentes com o cargo (sócio de terno azul-marinho, sênior grafite, associado cinza, júnior cinza-claro, advogado neutro, estagiário verde);
- móvel: objeto único, centralizado, sem chão desenhado em volta, sem texto nem logo;
- cores de todos os sprites dentro da paleta de 32 cores (o Step 4 já confere isso por comando; aqui é a conferência visual);
- piso: textura chapada, sem gradiente, tamanho correto, e — no mosaico 2x2 de `piso-madeira`, `piso-carpete` e `piso-parede` — emenda pouco perceptível entre os quatro ladrilhos;
- nenhum asset com letras, marca d'água ou rosto de pessoa real.

Para cada asset reprovado, regenere só ele (a API dá um resultado diferente a cada chamada):

```bash
python3 arte/gerar.py --forcar --so personagem-socio-a
```

Se o problema for do prompt (e não do sorteio), ajuste o `prompt` no manifesto e rode sem
`--forcar`: o hash muda e o asset é regerado sozinho. Repita o Step 4 e depois
`python3 arte/contato.py` a cada rodada, até o contact sheet passar em todos os critérios.

- [ ] **Step 7: Escrever `test/atlas.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_ARTE = join(RAIZ, 'public', 'arte');
const CAMINHO_ATLAS = join(DIR_ARTE, 'atlas.json');

const manifesto = JSON.parse(readFileSync(join(RAIZ, 'arte', 'manifesto.json'), 'utf8'));
// Sem arte gerada o projeto continua utilizável (placeholders do cliente): o teste é pulado.
const comArte = existsSync(CAMINHO_ATLAS) ? test : test.skip;

/** Largura e altura do IHDR de um PNG: assinatura nos bytes 1..4 e tamanho nos bytes 16..24. */
function dimensoesPng(caminho) {
  const bytes = readFileSync(caminho);
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', `${caminho} não é um PNG`);
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

test('manifesto da arte tem 27 assets com ids, tamanhos e âncoras válidos', () => {
  const assets = manifesto.assets;
  assert.equal(assets.length, 27);
  assert.equal(new Set(assets.map((a) => a.id)).size, 27);
  for (const a of assets) {
    assert.match(a.id, /^(personagem|movel|piso)-[a-z-]+$/, a.id);
    assert.equal(a.id.split('-')[0], a.categoria, a.id);
    assert.ok(Object.hasOwn(manifesto.preambulos, a.categoria), a.categoria);
    assert.ok(typeof a.prompt === 'string' && a.prompt.length > 20, a.id);
    assert.equal(a.w % 32, 0, a.id);
    assert.ok([32, 48, 64].includes(a.h), a.id);
    assert.equal(typeof a.ancora.x, 'number', a.id);
    assert.equal(typeof a.ancora.y, 'number', a.id);
  }
});

comArte('atlas cobre o manifesto e cada PNG bate com o tamanho declarado', () => {
  const atlas = JSON.parse(readFileSync(CAMINHO_ATLAS, 'utf8'));
  const porId = new Map(manifesto.assets.map((a) => [a.id, a]));
  assert.equal(atlas.length, manifesto.assets.length);
  assert.deepEqual(atlas.map((e) => e.id), [...atlas.map((e) => e.id)].sort());
  for (const entrada of atlas) {
    const asset = porId.get(entrada.id);
    assert.ok(asset, `id fora do manifesto: ${entrada.id}`);
    assert.equal(entrada.arquivo, `${entrada.id}.png`);
    assert.equal(entrada.categoria, asset.categoria, entrada.id);
    assert.equal(entrada.w, asset.w, entrada.id);
    assert.equal(entrada.h, asset.h, entrada.id);
    assert.deepEqual(entrada.ancora, asset.ancora, entrada.id);
    assert.match(entrada.hash, /^[0-9a-f]{12}$/, entrada.id);
    const arquivo = join(DIR_ARTE, entrada.arquivo);
    assert.ok(existsSync(arquivo), `PNG ausente: ${entrada.arquivo}`);
    assert.deepEqual(dimensoesPng(arquivo), { w: entrada.w, h: entrada.h }, entrada.id);
  }
});
```

- [ ] **Step 8: Rodar o teste do atlas nos dois caminhos**

Run: `node --test test/atlas.test.js`
Expected: dois testes verdes; no resumo, `pass 2`, `fail 0`, `skipped 0` (em Node 20 as linhas saem com `#`, em versões mais novas com `ℹ`).

Run (confere o caminho do pulo e restaura o atlas):

```bash
TMP=$(mktemp -d)
mv public/arte/atlas.json "$TMP/atlas-escritorio.json" && node --test test/atlas.test.js; mv "$TMP/atlas-escritorio.json" public/arte/atlas.json
```

Expected: `pass 1`, `skipped 1`, `fail 0`, e a segunda linha marcada com `# SKIP`.

- [ ] **Step 9: Rodar a suíte inteira**

Run: `npm test`
Expected: `fail 0`, com `test/atlas.test.js` entre os arquivos executados.

- [ ] **Step 10: Ver a arte no cliente**

Run: `node server.mjs --demo` e abra `http://127.0.0.1:7777`.
Expected: os personagens e móveis aparecem com os PNGs (não mais com os placeholders procedurais) e o console do navegador não avisa sobre atlas ausente. Encerre com Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add public/arte test/atlas.test.js arte/manifesto.json arte/contato.py docs/screenshots/arte-contato.png
git commit -m "feat: arte gerada com gpt-image-2.5 e teste do atlas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `arte/CREDITOS.md`, `docs/protocolo.md` e `docs/adaptadores.md`

**Files:**
- Create: `arte/CREDITOS.md`, `docs/protocolo.md`, `docs/adaptadores.md`, `adaptadores/generico.md`

**Interfaces:**
- Consumes: rotas e limites da Task 15 do Plano 1, `adaptadores/*.hooks.json` e `EVENTOS_POR_CLI` da Task 17 do Plano 1, protocolo da Task 2 do Plano 1.
- Produces: documentação referenciada pelos READMEs (Task 6) e pelo `package.json` (`files`).

- [ ] **Step 1: Escrever `arte/CREDITOS.md`**

````markdown
# Créditos da arte

Todos os sprites em `public/arte/` foram gerados por IA a partir dos prompts em
`arte/manifesto.json` (versão 1) com o modelo **gpt-image-2.5-flare** da OpenAI
(`images.generate`, `size=1024x1024`, `quality=medium`), e depois pós-processados
localmente por `arte/gerar.py` com Pillow:

1. alfa binarizado em 128 (pixel art não tem borda semitransparente);
2. personagens e móveis recortados pela caixa de conteúdo, reduzidos com
   nearest-neighbor preservando a proporção e ancorados na base central do tile;
3. pisos reduzidos direto ao tile de 32x32;
4. tudo quantizado à paleta comum de 32 cores de `arte/paleta.py` (`arte/paleta.png`),
   sem dither.

Cada entrada de `public/arte/atlas.json` carrega um `hash` de 12 caracteres que cobre
modelo, preâmbulo da categoria, prompt e tamanho: mudar qualquer um deles faz
`arte/gerar.py` regerar aquele asset e só ele.

## Conteúdo

As pessoas retratadas são **fictícias**, descritas nos prompts com variações de cabelo,
pele e roupa para dar diversidade ao escritório. Não há retrato de pessoa real, logo,
marca, fonte tipográfica ou elemento de identidade visual de terceiros. Nenhum asset de
terceiros foi baixado, copiado ou derivado.

## Licença

Os PNGs e o `atlas.json` seguem a mesma licença do código, **MIT** (ver `../LICENSE`).
Confira também os termos de uso da OpenAI vigentes para conteúdo gerado.

## Como regerar

```bash
python3 -m pip install -r arte/requirements.txt
export OPENAI_API_KEY=...            # a única chamada de rede externa do projeto
python3 arte/gerar.py                # gera só o que falta ou mudou de hash
python3 arte/gerar.py --seco         # imprime os 27 prompts, sem chamar a API
python3 arte/gerar.py --so movel-cafe --forcar
python3 arte/gerar.py --so movel-cafe --modelo gpt-image-2.5-sunburst   # teste pontual
```

Trocar de modelo em definitivo é editar `"modelo"` em `arte/manifesto.json`: o hash de cada
asset inclui o modelo, e `--modelo` sozinho faria o lote inteiro ser regerado duas vezes.

O app funciona sem arte: sem `public/arte/atlas.json`, `public/sprites.js` desenha
placeholders procedurais e avisa uma vez no console.
````

- [ ] **Step 2: Escrever `docs/protocolo.md`**

````markdown
# Protocolo de eventos v1

O Escritório de Pixels só escuta em `127.0.0.1`. Qualquer ferramenta capaz de fazer um
`POST` local pode alimentá-lo.

| Rota | Para quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /eventos` | qualquer script, pipeline ou CLI que fale este protocolo | um evento v1 ou um array de eventos | `202 { aceitos, rejeitados }` |
| `POST /hook/<cli>` | hooks nativos de `claude`, `codex`, `grok`, `cursor`, `gemini` | payload nativo da CLI (o servidor traduz) | `204`, sem corpo |
| `POST /hook/generico?cli=<nome>` | CLIs que seguem o formato snake_case do Claude Code | payload nativo | `204`, sem corpo |

Leitura: `GET /fluxo` (Server-Sent Events, snapshot + deltas numerados), `GET /estado`
(o mesmo objeto do snapshot, para depuração) e `GET /saude` (contadores por adaptador).

## Campos comuns

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `v` | número | sim | sempre `1` |
| `tipo` | string | sim | um dos dez tipos abaixo |
| `cli` | string | sim | `[a-z0-9_-]{1,32}`; `claude`, `codex`, `gemini`, `opencode`, `grok`, `cursor` ou outro identificador curto |
| `sessao` | string | sim | id da sessão na CLI; a identidade interna é `cli:sessao` |
| `ts` | string ISO | não | informativo (ficha e ações recentes); o estado usa o relógio do servidor na chegada |
| `cwd` | string | não | diretório de trabalho; é a identidade do projeto |
| `projeto` | string | não | rótulo legível; ausente, usa-se o basename de `cwd` |
| `modelo` | string | não | id do modelo; muda o cargo (e o sprite) se mudar no meio da sessão |

## Os dez tipos

| Tipo | Campos próprios | Efeito no escritório |
| --- | --- | --- |
| `sessao.inicio` | `modelo?`, `origem?` | cria ou atualiza o advogado; quem estava ocioso volta à recepção |
| `sessao.fim` | — | o advogado sai (some do mapa em 3 s) |
| `prompt` | `prompt` (texto) | abre um turno novo e vira o "caso atual" |
| `ferramenta.inicio` | `ferramenta: { nome, detalhe?, id? }`, `agente?: { id, tipo }` | advogado fica `trabalhando` e caminha para a sala da ferramenta |
| `ferramenta.fim` | `ferramenta: { nome, id?, ok? }`, `agente?` | fecha a chamada pendente; sem pendentes, volta a `pensando` |
| `subagente.inicio` | `agente: { id, tipo, descricao? }` | cria um estagiário (sala `reunioes`, ou `revisao` se o tipo casar com a regra) |
| `subagente.fim` | `agente: { id }` | o estagiário sai |
| `tokens` | `tokens: { contexto?, janela?, saidaTotal?, saidaIncremento? }` | só metadados na ficha do caso |
| `aguardando` | `motivo?` (`permissao`, `pergunta`, `outro`) | o advogado vai para a copa com "?" na cabeça |
| `parado` | — | o turno terminou; o advogado volta à recepção |

Semântica de `tokens`: `contexto` e `janela` são absolutos e substituem o valor anterior;
`saidaTotal` é um acumulado da sessão e substitui; `saidaIncremento` soma ao acumulado e
marca a saída como estimada (a ficha mostra "≈").

Quem envia `ferramenta.inicio` deve enviar o `ferramenta.fim` correspondente com o mesmo
`ferramenta.id`. Sem `id`, o servidor casa pelo nome e encerra a pendente mais antiga com
aquele nome. Um `ferramenta.fim` sem pendente é ignorado, e `parado` ou `sessao.fim`
descartam todas as pendentes da sessão e dos seus estagiários.

## Limites

| O quê | Limite | Ao exceder |
| --- | --- | --- |
| Corpo de `/eventos` | 64 KB | `413` e `rejeitadosPorTamanho` em `/saude` |
| Corpo de `/hook/*` | 4 MB | `413` e `rejeitadosPorTamanho` em `/saude` |
| `prompt` | 200 caracteres | truncado com `…` |
| `ferramenta.detalhe` | 120 caracteres | truncado com `…` |
| `agente.descricao` | 120 caracteres | truncado com `…` |
| `ferramenta.nome` | 80 caracteres | truncado |
| `sessao` | 200 caracteres | evento rejeitado |
| Sessões simultâneas | 64 | remove a ociosa mais antiga |
| Estagiários por sessão | 32 | substitui o ocioso mais antigo |
| Clientes de `/fluxo` | 8 | `503` |

## Respostas e erros

- `202 { "aceitos": n, "rejeitados": [{ "indice": i, "erro": "..." }] }` em `/eventos`:
  num array, os eventos válidos são aplicados e os inválidos voltam listados por índice.
- `400 { "erro": "JSON inválido" }` quando o corpo não é JSON.
- `413` quando o corpo passa do limite; o evento não é processado.
- `421` quando o `Host` não é `127.0.0.1:<porta>`, `localhost:<porta>` ou `[::1]:<porta>`.
- `403` quando há `Origin` e ele não é local.
- `503` em `/eventos` e `/hook/*` quando o servidor está em `--demo`.
- `/hook/*` responde `204` sempre que o corpo cabe no limite, inclusive para payloads que
  não sabe traduzir (contados como `ignorados` em `/saude`). Um hook nunca deve atrapalhar
  o agente.

## Exemplos com curl

Um evento:

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '{"v":1,"tipo":"sessao.inicio","cli":"meucli","sessao":"abc123","modelo":"gpt-5.4","cwd":"/caminho/do/projeto"}'
```

```json
{"aceitos":1,"rejeitados":[]}
```

Um lote (prompt e início de ferramenta):

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '[
    {"v":1,"tipo":"prompt","cli":"meucli","sessao":"abc123","prompt":"Minutar contestação"},
    {"v":1,"tipo":"ferramenta.inicio","cli":"meucli","sessao":"abc123","ferramenta":{"nome":"Read","detalhe":"peticao-inicial.md","id":"t-1"}}
  ]'
```

```json
{"aceitos":2,"rejeitados":[]}
```

Lote com um evento inválido:

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '[{"v":1,"tipo":"parado","cli":"meucli","sessao":"abc123"},{"v":1,"tipo":"xpto"}]'
```

```json
{"aceitos":1,"rejeitados":[{"indice":1,"erro":"tipo desconhecido: xpto"}]}
```

Payload nativo no formato do Claude Code, de uma CLI qualquer:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST 'http://127.0.0.1:7777/hook/generico?cli=copilot' \
  -H 'content-type: application/json' \
  -d '{"hook_event_name":"PreToolUse","session_id":"s-1","cwd":"/caminho/do/projeto","tool_name":"Read","tool_input":{"file_path":"/caminho/do/projeto/peticao.md"},"tool_use_id":"t-1"}'
```

```
204
```

Conferir o que chegou:

```bash
curl -s http://127.0.0.1:7777/saude
curl -s http://127.0.0.1:7777/estado
```

Acompanhar o fluxo:

```bash
curl -N http://127.0.0.1:7777/fluxo
```

## Deduplicação

O servidor calcula uma chave com `cli`, `sessao`, `tipo`, `ferramenta.id` (ou
`ferramenta.nome`), `agente.id` e `ts` arredondado ao segundo, e descarta repetições
recebidas nos últimos 2 s. Isso cobre hooks instalados em dobro e a importação automática
que o Grok faz dos hooks do Claude e do Cursor.

## Privacidade

- Nada do conteúdo observado vai para disco: `prompt`, `detalhe` e `descricao` são
  truncados na ingestão e só esses resumos ficam em memória.
- Rode com `--ocultar-prompts` para trocar o texto do caso por
  "Caso em andamento (n caracteres)" em tela compartilhada ou gravação.
- Não há telemetria. A única chamada de rede externa do projeto é o gerador de arte,
  rodado à mão em desenvolvimento.

## Versão

Este é o protocolo v1 (`"v": 1`). Campos desconhecidos são ignorados, o que permite
acrescentar campos opcionais sem quebrar clientes antigos. Tipo novo ou mudança de
semântica exigem `v: 2`.
````

- [ ] **Step 3: Escrever `docs/adaptadores.md`**

````markdown
# Adaptadores por CLI

A tradução do payload nativo para o [evento v1](protocolo.md) fica **no servidor**, em
`POST /hook/<cli>`. Do lado da CLI o adaptador é só um trecho de configuração de hook:
`http` quando a CLI oferece (Claude Code, Grok), `command` com `curl` quando não.

Nenhum hook instalado bloqueia o agente: o servidor responde `204` sem corpo, o timeout é
de 2 segundos e o comando termina em `|| true`, então uma queda do Escritório é ignorada
pela CLI.

## Matriz de capacidades da v1

| CLI | Obrigatória na v1 | Sessão | Prompt | Ferramentas | Subagentes | Modelo | Tokens | Testada nesta máquina |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | sim | sim | sim | sim | sim | no início | estimados (transcrito) | sim |
| Codex | sim | sim | sim | sim | sim | em todo evento | totais (rollout) | sim |
| Grok | sim | sim | sim | sim | sim | não | não | sim |
| Cursor Agent | sim | sim | sim | sim | sim | conforme o payload | não | sim |
| Gemini CLI | não (documentada) | sim | sim | sim | não | em `AfterModel` | em `AfterModel` | **não** |
| OpenCode | não (v1.1) | — | — | — | — | — | — | não |

## Instalar e desinstalar

```bash
node server.mjs instalar claude       # claude, codex, grok, cursor, gemini
node server.mjs desinstalar claude
```

O instalador:

- lê o arquivo alvo; se não for JSON válido, aborta sem tocar nele (arquivo ausente é criado);
- insere só as entradas do Escritório e preserva tudo o mais; é idempotente (reconhece as
  suas pela URL ou pelo comando contendo `/hook/`);
- grava um backup `<arquivo>.bak-<carimbo>` e escreve de forma atômica (temporário no mesmo
  diretório + `rename`);
- usa a porta de `~/.escritorio-de-pixels/config.json` (`--porta N` a persiste). Se o
  servidor subir numa porta diferente da última instalada, ele avisa e sugere reinstalar.

Trocou de porta? `node server.mjs --porta 7800` e depois `node server.mjs instalar <cli>`
de novo, para os hooks apontarem para a porta nova.

## Mapeamento comum

Claude Code, Codex, Grok e Cursor usam os mesmos nomes de evento com grafias diferentes:

| Evento de hook | Evento v1 |
| --- | --- |
| `SessionStart` | `sessao.inicio` (com `modelo` quando o payload traz) |
| `UserPromptSubmit`, `beforeSubmitPrompt` | `prompt` |
| `PreToolUse` | `ferramenta.inicio` (`id` = `tool_use_id`; `detalhe` extraído de `tool_input`; `agente` de `agent_id`/`agent_type`) |
| `PostToolUse`, `PostToolUseFailure` | `ferramenta.fim` com `ok` e o mesmo `id` |
| `SubagentStart`, `SubagentStop` | `subagente.inicio`, `subagente.fim` |
| `PermissionRequest`, `Notification` | `aguardando` |
| `Stop`, `Interrupt`, `StopCancelled` | `parado` |
| `SessionEnd` | `sessao.fim` |

Payload não mapeado não vira erro: conta como `ignorados` em `GET /saude`.

## Claude Code

Arquivo: `~/.claude/settings.json`. Hooks `command` com `curl` e `async: true` (o Claude Code
não espera nem mostra erro quando o servidor está fora do ar). Conteúdo de
`adaptadores/claude.hooks.json` (aqui com um evento por linha para caber na página; o arquivo é
gravado expandido). REGRA DE EXECUÇÃO: antes de escrever `docs/adaptadores.md`, regenere cada
bloco JSON deste documento a partir do arquivo real da branch (`cat adaptadores/<cli>.hooks.json`),
porque os instaladores mudaram durante a captura real; os blocos abaixo são a forma esperada,
não a fonte da verdade:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "PreToolUse": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "PostToolUse": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "SubagentStart": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "SubagentStop": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "Notification": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "Stop": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:7777/hook/claude", "timeout": 2 }] }]
  }
}
```

Particularidades:

- O `model` só vem em `SessionStart`; o cargo é definido ali e só muda se outro evento
  trouxer modelo diferente.
- Tokens são **estimados**: no `Stop`, o tradutor lê no máximo os últimos 64 KB do
  `transcript_path`, que precisa estar dentro de `~/.claude/projects/`. Desligue com
  `node server.mjs --sem-transcritos`.
- Se os hooks `http` ficarem lentos na sua máquina, troque por `command` com o `curl` da
  seção do Codex, apontando para `/hook/claude`.

## Codex

Arquivo: `~/.codex/hooks.json`. Hooks `command` (o payload chega no stdin). Conteúdo de
`adaptadores/codex.hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "Interrupt": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/codex >/dev/null 2>&1 || true", "timeout": 2 }] }]
  }
}
```

Particularidades:

- **Confiança nos hooks:** na primeira execução depois de instalar, o Codex pede para você
  confirmar que confia nos hooks novos. Confirme dentro do próprio Codex. Existe a flag
  `--dangerously-bypass-hook-trust`, que o instalador não usa nem recomenda.
- `model` vem em todo evento.
- Tokens são **totais**: no `Stop`, o tradutor lê os últimos 64 KB do rollout em
  `~/.codex/sessions/` ou `~/.codex/archived_sessions/` e usa o último `token_usage_record`.
- O mecanismo `notify` não é usado: só emite `agent-turn-complete`, sem modelo nem tokens,
  e aceita um único comando.

## Grok

Arquivo próprio: `~/.grok/hooks/escritorio.json` (o Grok lê os arquivos do diretório
`hooks/`). Hooks `command` com `curl` (o Grok 1.0.34 recusa hooks `http` para `http://`).
Conteúdo de `adaptadores/grok.hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "SessionEnd": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "PreToolUse": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "PostToolUse": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "PostToolUseFailure": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "PermissionDenied": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "Notification": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "SubagentStart": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "SubagentStop": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "StopFailure": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}],
    "StopCancelled": [{"hooks": [{"type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2}]}]
  }
}
```

Particularidades:

- O Grok **importa automaticamente** os hooks de `~/.claude/settings.json` e
  `~/.cursor/hooks.json`. Por isso `/hook/claude` e `/hook/cursor` reconhecem o envelope
  camelCase do Grok (`hookEventName`) e rotulam o evento como `cli: grok`; a deduplicação
  de 2 s elimina o evento em dobro quando o arquivo dedicado também está instalado.
- O payload não traz modelo nem tokens: o advogado aparece com o cargo neutro
  ("advogado") e a ficha não mostra barra de contexto.
- Desinstalar remove o arquivo inteiro (com backup), já que ele é só nosso.

## Cursor Agent

Arquivo: `~/.cursor/hooks.json`. Formato próprio: `version` no topo e as entradas
diretamente na lista de cada evento (sem o agrupamento `{ "hooks": [...] }`). Conteúdo de
`adaptadores/cursor.hooks.json`:

```json
{
  "hooks": {
    "sessionStart": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }],
    "sessionEnd": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }],
    "beforeSubmitPrompt": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }],
    "preToolUse": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }],
    "postToolUse": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }],
    "postToolUseFailure": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }],
    "subagentStart": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }],
    "subagentStop": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }],
    "stop": [{ "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/cursor >/dev/null 2>&1 || true", "timeout": 2 }]
  },
  "version": 1
}
```

Particularidades:

- Os hooks cobrem o modo interativo e o modo `--print`, então não há wrapper nem script
  intermediário.
- O payload vem em camelCase (`hookEventName`, `sessionId`, `toolName`, `toolInput`).
- Modelo e tokens dependem do payload da versão instalada; quando não vêm, vale o mesmo
  que no Grok.

## Gemini CLI (documentado, **não testado**)

Arquivo: `~/.gemini/settings.json`. Hooks `command`, com `timeout` em **milissegundos**.
Conteúdo de `adaptadores/gemini.hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/gemini >/dev/null 2>&1 || true", "timeout": 2000 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/gemini >/dev/null 2>&1 || true", "timeout": 2000 }] }],
    "BeforeAgent": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/gemini >/dev/null 2>&1 || true", "timeout": 2000 }] }],
    "AfterAgent": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/gemini >/dev/null 2>&1 || true", "timeout": 2000 }] }],
    "BeforeTool": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/gemini >/dev/null 2>&1 || true", "timeout": 2000 }] }],
    "AfterTool": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/gemini >/dev/null 2>&1 || true", "timeout": 2000 }] }],
    "AfterModel": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/gemini >/dev/null 2>&1 || true", "timeout": 2000 }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/gemini >/dev/null 2>&1 || true", "timeout": 2000 }] }]
  }
}
```

Particularidades:

- Mapeamento próprio: `BeforeAgent` vira `prompt`, `AfterAgent` vira `parado`,
  `BeforeTool`/`AfterTool` viram `ferramenta.inicio`/`ferramenta.fim` e `AfterModel` vira
  `tokens` (e atualiza o modelo a partir de `llm_response`).
- Sem eventos de subagente: o Gemini não aparece com estagiários.
- O tradutor nasceu da documentação, com fixtures sintéticas. **Não foi testado numa
  instalação real.** Se você usa o Gemini CLI, confira `GET /saude` (campo `ignorados`) e
  abra uma issue com o payload anonimizado.

## OpenCode (v1.1)

O OpenCode não tem hooks: `opencode serve` expõe um fluxo SSE em
`127.0.0.1:4096/event` com sessões, mensagens, ferramentas, modelo e tokens. O adaptador
será uma ponte (`node server.mjs ponte opencode`) que assina esse fluxo e traduz. Fica
fora da v1 porque exige um processo a mais; acompanhe a issue aberta no repositório.

## Outras CLIs: `/hook/generico`

`POST /hook/generico?cli=<nome>` aceita payloads no formato snake_case do Claude Code, que
GitHub Copilot CLI, Kimi CLI e Qwen Code seguem de perto. Aponte o hook `command` da sua
CLI para lá:

```bash
curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- \
  'http://127.0.0.1:7777/hook/generico?cli=copilot' >/dev/null 2>&1 || true
```

O `cli` vira o identificador do adaptador em `GET /saude` e a cor do crachá (cinza, até
existir uma regra em `cargos.json`). Qualquer ferramenta que não tenha hooks pode falar
direto o [protocolo v1](protocolo.md) em `POST /eventos`.

## Contribuir com um adaptador

1. **Capture payloads reais** da CLI (`scripts/capturar.mjs`) e anonimize-os
   (`scripts/sanitizar-fixtures.mjs`) em `test/fixtures/<cli>/`.
2. **Escreva o tradutor** em `src/tradutores/<cli>.js`, exportando
   `criarTradutor<Cli>({ agora, ... }) → (payload) => evento[] | null`. Devolva `null`
   para payload não mapeado (vira `ignorados` em `/saude`); reaproveite `src/tradutores/comum.js`.
3. **Teste** em `test/tradutores-<cli>.test.js` (arquivo novo por CLI, seguindo
   `test/tradutores-gemini.test.js`) com as fixtures: um caso por evento mapeado e um
   payload desconhecido; rode também `test/fixtures.test.js`, que confere as fixtures
   anonimizadas de todas as CLIs.
4. **Registre a CLI** em `CLIS` e `EVENTOS_POR_CLI` de `src/instalar.js`, com o formato de
   arquivo e o tipo de entrada da CLI, e gere `adaptadores/<cli>.hooks.json`.
5. **Ligue a rota**: acrescente o tradutor ao mapa de `src/app.js`.
6. **Documente** aqui (uma seção com o arquivo, o JSON e as particularidades) e na matriz
   de capacidades acima; se a CLI trouxer cores próprias, acrescente o crachá em
   `cargos.json`.
7. `npm test` verde e um exemplo real rodado de ponta a ponta, conferido em `GET /saude`.
````

- [ ] **Step 4: Escrever `adaptadores/generico.md`**

A spec lista esse arquivo à parte: um atalho curto para quem não tem (ou não quer esperar)
um adaptador dedicado, sem precisar garimpar a seção "Outras CLIs" de `docs/adaptadores.md`.

````markdown
# Adaptador genérico: qualquer CLI sem hook dedicado

Sua ferramenta não está na lista de CLIs com adaptador próprio? Duas portas continuam
abertas, sem esperar por um tradutor novo.

## 1. Falar o protocolo v1 direto

Se a ferramenta (ou um script em volta dela) monta o JSON do
[protocolo v1](../docs/protocolo.md), poste direto em `/eventos`:

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '{"v":1,"tipo":"prompt","cli":"minhacli","sessao":"abc123","prompt":"Minutar contestação"}'
```

## 2. Já emitir hooks no formato do Claude Code

Se a CLI segue de perto o payload snake_case do Claude Code (`hook_event_name`,
`session_id`, `tool_name`, `tool_input`, ...), aponte o hook para
`/hook/generico?cli=<nome>` e o servidor traduz:

```bash
curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- \
  'http://127.0.0.1:7777/hook/generico?cli=minhacli' >/dev/null 2>&1 || true
```

O `<nome>` vira o identificador do adaptador em `GET /saude` e a cor do crachá (cinza, até
existir uma regra em `cargos.json`).

Payload não mapeado não vira erro: conta como `ignorados` em `GET /saude` — é o primeiro
lugar para olhar quando um hook parece mudo.

Quer um adaptador de verdade, com tradução das particularidades da sua CLI? O roteiro está
no fim de [docs/adaptadores.md](../docs/adaptadores.md).
````

- [ ] **Step 5: Conferir os links relativos**

Run:

```bash
node -e "
const { readFileSync, existsSync } = require('fs');
const { join, dirname } = require('path');
let ruins = 0;
for (const f of ['docs/protocolo.md', 'docs/adaptadores.md', 'arte/CREDITOS.md', 'adaptadores/generico.md']) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
    const alvo = join(dirname(f), m[1].split('#')[0]);
    if (!existsSync(alvo)) { console.log('link quebrado em', f, '->', m[1]); ruins += 1; }
  }
}
console.log('links quebrados:', ruins);
"
```

Expected: `links quebrados: 0`.

- [ ] **Step 6: Conferir que os JSON da documentação batem com os arquivos gerados**

Run:

```bash
python3 - <<'PY'
import json, re
doc = open("docs/adaptadores.md", encoding="utf-8").read()
blocos = []
for bruto in re.findall(r"```json\n(\{.*?\n\})\n```", doc, re.S):
    try:
        blocos.append(json.loads(bruto))
    except ValueError:
        pass
for cli in ("claude", "codex", "grok", "cursor", "gemini"):
    real = json.load(open(f"adaptadores/{cli}.hooks.json", encoding="utf-8"))
    print(cli, "ok" if any(b == real for b in blocos) else "DIFERE")
PY
```

Expected: `claude ok`, `codex ok`, `grok ok`, `cursor ok`, `gemini ok`. Se algum der
`DIFERE`, copie o conteúdo do arquivo real para a seção correspondente (o arquivo é a
fonte da verdade; a página só o reproduz com um evento por linha).

- [ ] **Step 7: Rodar a suíte e commitar**

Run: `npm test`
Expected: `fail 0`.

```bash
git add arte/CREDITOS.md docs/protocolo.md docs/adaptadores.md adaptadores/generico.md
git commit -m "docs: protocolo v1, adaptadores por CLI e créditos da arte

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `README.md`, `README.en.md` e `docs/demo.gif`

**Files:**
- Create: `README.md`, `README.en.md`, `docs/demo.gif`, `docs/screenshots/demo-NN.png` (só no caminho alternativo)

**Interfaces:**
- Consumes: `docs/protocolo.md` e `docs/adaptadores.md` (Task 5), `arte/CREDITOS.md` (Task 5), `LICENSE` (Plano 1), modo demo (Task 16 do Plano 1), cliente (Plano 2).
- Produces: a capa do repositório e o GIF referenciado pelos dois READMEs.

O GIF e as capturas saem **só** de `node server.mjs --demo`, que recusa eventos externos
com `503`: nenhum conteúdo real de sessão aparece.

- [ ] **Step 1: Escrever `README.md`**

````markdown
# Escritório de Pixels

![O Escritório de Pixels em modo demo: advogados em pixel art caminhando entre as salas](docs/demo.gif)

Visualizador local, somente leitura, que mostra as sessões das suas CLIs de agentes de IA
como um escritório de advocacia em pixel art. Cada sessão é um advogado que caminha entre
as salas conforme a fase provável do trabalho; subagentes são estagiários que orbitam quem
os recrutou; o último prompt é o caso em andamento.

Feito para ficar num segundo monitor enquanto os agentes pesquisam e minutam peças e
pareceres.

- Servidor local em Node com **zero dependências de runtime**.
- Escuta só em `127.0.0.1`; nada do conteúdo observado vai para disco.
- Funciona com **Claude Code, Codex, Grok CLI e Cursor Agent** (testados), **Gemini CLI**
  (documentado) e qualquer ferramenta que fale o [protocolo v1](docs/protocolo.md).
- A sala indica a **fase provável** do trabalho, inferida da ferramenta usada — é uma
  aproximação, não um oráculo.

## Como funciona

```
CLI (Claude, Codex, Grok, Cursor, Gemini)
  -> hook nativo (http ou command + curl)
  -> POST /hook/<cli>  ou  POST /eventos      (o servidor normaliza e deduplica)
  -> estado em memória: advogados, estagiários, salas
  -> GET /fluxo (Server-Sent Events: snapshot + deltas numerados)
  -> navegador (Canvas 2D: escritório, HUD, ficha do caso)
```

O servidor decide **o quê** (estado, sala, cargo, atividade). O navegador decide **onde e
como** (posto na sala, trajeto, animação).

## Instalação e execução

Requer Node.js >= 20. Não há `npm install`: não há dependências.

```bash
git clone https://github.com/simiaocavalcanteia-arch/escritorio-de-pixels.git
cd escritorio-de-pixels
node server.mjs
```

Abra <http://127.0.0.1:7777>. Para ver o escritório cheio sem instalar nada:

```bash
node server.mjs --demo
```

| Opção | O que faz |
| --- | --- |
| `--porta N` | usa outra porta (padrão `7777`); fica salva em `~/.escritorio-de-pixels/config.json` |
| `--demo` | sessões sintéticas; recusa eventos externos (para capturas e vídeos) |
| `--ocultar-prompts` | troca o texto do caso por "Caso em andamento (n caracteres)" |
| `--sem-transcritos` | não lê transcritos para estimar tokens |
| `instalar <cli>` / `desinstalar <cli>` | instala ou remove os hooks da CLI |

## Instalar os hooks da sua CLI

```bash
node server.mjs instalar claude    # claude, codex, grok, cursor, gemini
```

O instalador insere só as entradas do Escritório no arquivo de hooks da CLI, preserva o
resto, grava um backup e escreve de forma atômica. `desinstalar` desfaz.

| CLI | Sessão | Prompt | Ferramentas | Subagentes | Modelo | Tokens | Testada nesta máquina |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | sim | sim | sim | sim | no início | estimados | sim |
| Codex | sim | sim | sim | sim | em todo evento | totais | sim |
| Grok | sim | sim | sim | sim | não | não | sim |
| Cursor Agent | sim | sim | sim | sim | conforme o payload | não | sim |
| Gemini CLI | sim | sim | sim | não | em `AfterModel` | em `AfterModel` | não |
| OpenCode | — | — | — | — | — | — | não (v1.1, via `opencode serve`) |

Detalhes, trechos de configuração, particularidades (o Codex pede para confiar nos hooks;
o Grok importa os hooks do Claude e do Cursor) e o esqueleto para contribuir com um
adaptador novo: [docs/adaptadores.md](docs/adaptadores.md).

Outras CLIs falam por `POST /hook/generico?cli=<nome>` (formato snake_case do Claude Code)
ou direto pelo [protocolo v1](docs/protocolo.md) em `POST /eventos`.

## Salas e cargos

As salas são inferidas da ferramenta em uso, por regras em `salas.json` (edite e salve: o
servidor recarrega sozinho; arquivo inválido é recusado e o anterior continua valendo).

| Sala | Fase | Cai aqui |
| --- | --- | --- |
| `recepcao` | espera e pensamento | ocioso, entre turnos, ferramenta sem regra |
| `biblioteca` | pesquisa | `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, busca em geral |
| `gabinete` | minuta | `Edit`, `Write`, `apply_patch`, skills de redação |
| `revisao` | revisão | subagentes de revisão, `code-review`, `security-review` |
| `cartorio` | protocolo e expediente | `Bash`, `shell`, `run_terminal_cmd` |
| `reunioes` | recrutamento e consultas | `Agent`, `Task`, ferramentas MCP |
| `copa` | pausa | esperando permissão ou resposta sua |

O cargo vem do modelo, por regras em `cargos.json`:

| Cargo | Padrões iniciais |
| --- | --- |
| Júnior | `haiku`, `mini`, `nano`, `flash-lite`, `local` |
| Sócio(a) | `fable`, `mythos`, `gpt-6`, `astra`, `ultra`, `grok-5` |
| Advogado(a) sênior | `opus`, `gpt-5.4+`, `gemini-3 pro`, `grok-4` |
| Associado(a) | `sonnet`, `gpt-5`, `gemini flash`, `codex` |
| Advogado(a) | modelo ausente ou sem regra |

`cargos.json` também define a cor e a sigla do crachá de cada CLI. Subagentes são sempre
estagiários.

## Privacidade e segurança

- O servidor escuta **só** em `127.0.0.1`. Não há modo remoto.
- Toda requisição precisa de `Host` local (`127.0.0.1:<porta>`, `localhost:<porta>` ou
  `[::1]:<porta>`); qualquer outro recebe `421`. Isso fecha DNS rebinding.
- `Origin` externo recebe `403`.
- **Nada do conteúdo observado é gravado em disco.** Prompt, detalhe da ferramenta e
  descrição do subagente são truncados na ingestão (200/120/120 caracteres) e só esses
  resumos ficam em memória.
- Transcritos: só são lidos os do diretório da própria CLI (`~/.claude/projects/`,
  `~/.codex/sessions/`), no máximo 64 KB do final, e só para estimar tokens. Desligue com
  `--sem-transcritos`.
- As únicas gravações são de configuração: `~/.escritorio-de-pixels/config.json`, os
  arquivos de hooks e seus backups, e as preferências de idioma e painel no `localStorage`.
- Vai compartilhar a tela? Use `--ocultar-prompts`.
- Sem telemetria. A única chamada de rede externa do projeto é o gerador de arte
  (`arte/gerar.py`), rodado à mão em desenvolvimento.

## Protocolo

Qualquer script pode alimentar o escritório:

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '{"v":1,"tipo":"prompt","cli":"meucli","sessao":"abc123","prompt":"Minutar contestação"}'
```

Os dez tipos de evento, campos, limites e exemplos estão em
[docs/protocolo.md](docs/protocolo.md). `GET /saude` mostra o que cada adaptador está
recebendo — é o primeiro lugar para olhar quando um hook parece mudo.

## Contribuindo

Issues e pull requests são bem-vindos, especialmente adaptadores novos. Antes de abrir um
PR: `npm test` (é `node --test test/*.test.js`, sem dependências) e nada de payload real
não anonimizado nas fixtures. O roteiro para um adaptador novo está no fim de
[docs/adaptadores.md](docs/adaptadores.md).

## Créditos

- Inspirado no **Age of Agents** (agentsmill, MIT), mas escrito do zero, leve e neutro
  quanto ao provedor de LLM.
- Arte gerada com **gpt-image-2.5** (OpenAI) a partir dos prompts de `arte/manifesto.json`
  e pós-processada localmente com Pillow: [arte/CREDITOS.md](arte/CREDITOS.md).
- Pessoas retratadas nos sprites são fictícias; não há logos nem marcas de terceiros.

## Licença

MIT — veja [LICENSE](LICENSE). A arte gerada segue a mesma licença.

---

[English version](README.en.md)
````

- [ ] **Step 2: Escrever `README.en.md`**

````markdown
# Pixel Office (Escritório de Pixels)

![The Pixel Office in demo mode: pixel-art lawyers walking between rooms](docs/demo.gif)

A local, read-only visualizer that shows your AI agent CLI sessions as a pixel-art law
office. Each session is a lawyer who walks between rooms according to the likely phase of
the work; subagents are interns orbiting whoever hired them; the latest prompt is the case
at hand.

Built to sit on a second monitor while agents research and draft legal documents.

- Local Node server with **zero runtime dependencies**.
- Listens on `127.0.0.1` only; nothing it observes is ever written to disk.
- Works with **Claude Code, Codex, Grok CLI and Cursor Agent** (tested), **Gemini CLI**
  (documented) and anything that speaks the [v1 protocol](docs/protocolo.md).
- The room shows the **likely phase** of the work, inferred from the tool in use — an
  approximation, not an oracle.

## How it works

```
CLI (Claude, Codex, Grok, Cursor, Gemini)
  -> native hook (http or command + curl)
  -> POST /hook/<cli>  or  POST /eventos      (the server normalizes and deduplicates)
  -> in-memory state: lawyers, interns, rooms
  -> GET /fluxo (Server-Sent Events: snapshot + numbered deltas)
  -> browser (2D Canvas: office, HUD, case sheet)
```

The server decides **what** (state, room, rank, activity). The browser decides **where and
how** (desk inside the room, path, animation).

## Install and run

Requires Node.js >= 20. There is no `npm install`: there are no dependencies.

```bash
git clone https://github.com/simiaocavalcanteia-arch/escritorio-de-pixels.git
cd escritorio-de-pixels
node server.mjs
```

Open <http://127.0.0.1:7777>. To see a full office without installing anything:

```bash
node server.mjs --demo
```

| Flag | What it does |
| --- | --- |
| `--porta N` | use another port (default `7777`); saved in `~/.escritorio-de-pixels/config.json` |
| `--demo` | synthetic sessions; rejects external events (for screenshots and videos) |
| `--ocultar-prompts` | replaces the case text with "Caso em andamento (n caracteres)" |
| `--sem-transcritos` | never reads transcripts to estimate tokens |
| `instalar <cli>` / `desinstalar <cli>` | installs or removes that CLI's hooks |

The CLI flags and the room ids are in Portuguese; the interface itself switches between
pt-BR and English in the top bar.

## Install your CLI's hooks

```bash
node server.mjs instalar claude    # claude, codex, grok, cursor, gemini
```

The installer adds only the Office entries to the CLI's hook file, preserves everything
else, writes a backup and saves atomically. `desinstalar` undoes it.

| CLI | Session | Prompt | Tools | Subagents | Model | Tokens | Tested on this machine |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | yes | yes | yes | yes | at start | estimated | yes |
| Codex | yes | yes | yes | yes | every event | totals | yes |
| Grok | yes | yes | yes | yes | no | no | yes |
| Cursor Agent | yes | yes | yes | yes | payload dependent | no | yes |
| Gemini CLI | yes | yes | yes | no | in `AfterModel` | in `AfterModel` | no |
| OpenCode | — | — | — | — | — | — | no (v1.1, via `opencode serve`) |

Configuration snippets, quirks (Codex asks you to trust new hooks; Grok imports Claude's
and Cursor's hooks) and the checklist for contributing a new adapter:
[docs/adaptadores.md](docs/adaptadores.md).

Other CLIs can post to `POST /hook/generico?cli=<name>` (Claude Code's snake_case payload)
or speak the [v1 protocol](docs/protocolo.md) directly at `POST /eventos`.

## Rooms and ranks

Rooms come from the tool in use, through rules in `salas.json` (edit and save: the server
reloads it; an invalid file is rejected and the previous one stays in force).

| Room | Phase | What lands here |
| --- | --- | --- |
| `recepcao` (reception) | waiting and thinking | idle, between turns, tool with no rule |
| `biblioteca` (library) | research | `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch` |
| `gabinete` (office) | drafting | `Edit`, `Write`, `apply_patch`, writing skills |
| `revisao` (review) | review | review subagents, `code-review`, `security-review` |
| `cartorio` (registry) | filing and chores | `Bash`, `shell`, `run_terminal_cmd` |
| `reunioes` (meetings) | hiring and consulting | `Agent`, `Task`, MCP tools |
| `copa` (break room) | pause | waiting for your permission or answer |

Ranks come from the model, through rules in `cargos.json`:

| Rank | Initial patterns |
| --- | --- |
| Junior | `haiku`, `mini`, `nano`, `flash-lite`, `local` |
| Partner | `fable`, `mythos`, `gpt-6`, `astra`, `ultra`, `grok-5` |
| Senior lawyer | `opus`, `gpt-5.4+`, `gemini-3 pro`, `grok-4` |
| Associate | `sonnet`, `gpt-5`, `gemini flash`, `codex` |
| Lawyer | model missing or with no rule |

`cargos.json` also sets each CLI's badge color and initials. Subagents are always interns.

## Privacy and security

- The server listens on `127.0.0.1` **only**. There is no remote mode.
- Every request needs a local `Host` (`127.0.0.1:<port>`, `localhost:<port>` or
  `[::1]:<port>`); anything else gets `421`, which closes DNS rebinding.
- An external `Origin` gets `403`.
- **Nothing it observes is written to disk.** Prompt, tool detail and subagent description
  are truncated on ingestion (200/120/120 characters) and only those summaries stay in
  memory.
- Transcripts: only the CLI's own directory is read (`~/.claude/projects/`,
  `~/.codex/sessions/`), at most the last 64 KB, and only to estimate tokens. Turn it off
  with `--sem-transcritos`.
- The only writes are configuration: `~/.escritorio-de-pixels/config.json`, the hook files
  and their backups, and language/panel preferences in `localStorage`.
- Sharing your screen? Use `--ocultar-prompts`.
- No telemetry. The project's only outbound network call is the art generator
  (`arte/gerar.py`), run by hand during development.

## Protocol

Any script can feed the office:

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '{"v":1,"tipo":"prompt","cli":"mycli","sessao":"abc123","prompt":"Draft the answer"}'
```

The ten event types, fields, limits and examples are in
[docs/protocolo.md](docs/protocolo.md) (in Portuguese, with English-readable JSON).
`GET /saude` shows what each adapter is receiving — the first place to look when a hook
seems silent.

## Contributing

Issues and pull requests are welcome, especially new adapters. Before opening a PR: run
`npm test` (`node --test test/*.test.js`, no dependencies) and make sure no real,
unanonymized payload ends up in the fixtures. The adapter checklist is at the end of
[docs/adaptadores.md](docs/adaptadores.md).

## Credits

- Inspired by **Age of Agents** (agentsmill, MIT), but written from scratch, lightweight
  and LLM-provider neutral.
- Art generated with **gpt-image-2.5** (OpenAI) from the prompts in `arte/manifesto.json`
  and post-processed locally with Pillow: [arte/CREDITOS.md](arte/CREDITOS.md).
- The people in the sprites are fictional; there are no third-party logos or brands.

## License

MIT — see [LICENSE](LICENSE). The generated art is under the same license.

---

[Versão em português](README.md)
````

- [ ] **Step 3: Subir a demo e gravar o GIF**

Run (num terminal separado): `node server.mjs --demo`
Expected: `Escritório de Pixels em http://127.0.0.1:7777 (demo)`.

**Caminho preferido (Chrome):** com as ferramentas `mcp__claude-in-chrome` disponíveis,
abra `http://127.0.0.1:7777`, redimensione a janela para 1280x800, espere uns 10 s para o
escritório encher e grave com `gif_creator` uns 8 a 12 segundos, incluindo: advogados
caminhando entre salas, um balão de ferramenta, um estagiário orbitando, o painel lateral
aberto e a ficha do caso. Salve o bruto em `docs/demo-bruto.gif` (1280 de largura, paleta
e taxa de quadros a critério da ferramenta) e normalize com `ffmpeg`: largura 960 com
`neighbor` (a pixel art não borra), 8 quadros/s e uma paleta única de 64 cores gerada do
próprio vídeo, sem dither. O bruto não é commitado.

```bash
ffmpeg -y -i docs/demo-bruto.gif -vf "fps=8,scale=960:-1:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=none" docs/demo.gif
rm docs/demo-bruto.gif
```

**Caminho alternativo (capturas + ffmpeg):** sem as ferramentas de navegador, capture de
8 a 12 quadros com o Chrome headless por linha de comando (escreve o PNG direto, sem tocar
na tela) e monte o GIF com o mesmo filtro de paleta:

```bash
mkdir -p docs/screenshots
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME="/Applications/Chromium.app/Contents/MacOS/Chromium"
for i in $(seq -f '%02g' 1 10); do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 \
    --virtual-time-budget=8000 --screenshot="$PWD/docs/screenshots/demo-$i.png" http://127.0.0.1:7777 2>/dev/null
  sleep 1.5
done
ffmpeg -y -framerate 2 -i docs/screenshots/demo-%02d.png -vf "scale=960:-1:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=none" docs/demo.gif
```

Sem nenhum dos dois binários, registre no relatório final que o GIF não foi gerado: os
READMEs continuam apontando para `docs/demo.gif` e o Step 5 acusa o link quebrado até que
alguém com Chrome rode este passo.

Encerre a demo com Ctrl+C quando terminar.

- [ ] **Step 4: Conferir o GIF**

Run:

```bash
python3 -c "
from PIL import Image
g = Image.open('docs/demo.gif')
print(g.size, 'quadros:', getattr(g, 'n_frames', 1))
"
ls -lh docs/demo.gif
```

Expected: largura `960`, pelo menos 8 quadros e arquivo abaixo de 5 MB (se passar disso,
reduza `max_colors` para 32, corte quadros com `fps=6` ou baixe a largura para 720, sempre
com o mesmo filtro de paleta). `ls docs/demo-bruto.gif` deve falhar: o bruto foi apagado.

Confira a olho: o GIF mostra **só** dados sintéticos (nomes de projeto e casos do modo
demo), sem caminho de arquivo real nem texto de prompt seu.

- [ ] **Step 5: Conferir os links dos READMEs**

Run:

```bash
node -e "
const { readFileSync, existsSync } = require('fs');
const { join, dirname } = require('path');
let ruins = 0;
for (const f of ['README.md', 'README.en.md', 'docs/protocolo.md', 'docs/adaptadores.md', 'arte/CREDITOS.md']) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
    const alvo = join(dirname(f), m[1].split('#')[0]);
    if (!existsSync(alvo)) { console.log('link quebrado em', f, '->', m[1]); ruins += 1; }
  }
}
console.log('links quebrados:', ruins);
"
```

Expected: `links quebrados: 0`.

- [ ] **Step 6: Rodar a suíte e commitar**

Run: `npm test`
Expected: `fail 0`.

```bash
git add README.md README.en.md docs/demo.gif docs/screenshots
git commit -m "docs: README em pt-BR e en com GIF da demo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Integração em `main`, checagem final e publicação no GitHub

**Files:**
- Modify: `package.json`
- Publish: repositório `simiaocavalcanteia-arch/escritorio-de-pixels`, tag `v0.1.0`, release, issues iniciais

**Interfaces:**
- Consumes: tudo dos Planos 1, 2 e 3.
- Produces: `main` com o histórico dos três planos, repositório público e issues do que ficou para depois.

> **O Step 4 publica código na internet e exige confirmação explícita do usuário no momento
> da execução.** Os Steps 1 a 3 são locais e podem ser feitos antes.

- [ ] **Step 1: Integrar as branches em `main`**

Como `feat/arte` nasceu de `feat/cliente`, que nasceu de `feat/nucleo`, um merge só cobre
os três planos.

```bash
git checkout feat/arte
npm test
git checkout main
git merge --ff-only feat/arte || git merge --no-ff feat/arte -m "merge: núcleo, cliente e arte do Escritório de Pixels

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git branch --merged main
git log --oneline | head -5
```

Expected: `git branch --merged main` lista `feat/nucleo`, `feat/cliente`, `feat/arte` e
`main`. Nada de squash: o histórico por tarefa fica preservado.

- [ ] **Step 2: Checagem final**

Run: `npm test`
Expected: `fail 0`, com `test/atlas.test.js` entre os arquivos executados.

Run: `python3 -m unittest arte/test_pos.py`
Expected: `Ran 7 tests` e `OK`.

Esses dois comandos são exatamente os jobs `test` e `arte` de `.github/workflows/ci.yml`
(Task 3, Step 5); depois do push, o CI repete os dois no GitHub.

Run: `node server.mjs --demo` e abra `http://127.0.0.1:7777`.
Expected: sete salas rotuladas, advogados de CLIs diferentes caminhando com os sprites
gerados, estagiário orbitando, painel lateral agrupado por projeto, ficha do caso abrindo
por clique e por Enter, alternância pt-BR/en. Encerre com Ctrl+C.

Run (varredura de privacidade: nenhum caminho pessoal commitado):

```bash
git grep -nI -e "$HOME" -e "/Users/" -- . ':!docs/superpowers' || echo "nenhum caminho pessoal"
```

Expected: `nenhum caminho pessoal`, ou só linhas com caminhos claramente sintéticos, como
`/Users/you/project` na fixture inline de `test/tradutores-grok.test.js`. Qualquer linha
com o valor real de `$HOME`, com um nome de usuário real ou com um caminho de projeto seu
é vazamento: troque por um caminho genérico (`/caminho/do/projeto`) ou por `~/...` e refaça
a varredura. Os planos em `docs/superpowers` ficam de fora porque citam o caminho local de
propósito. Caminhos com `~/...` nas docs (`~/.claude/settings.json`,
`~/.codex/sessions/`, `~/.escritorio-de-pixels/config.json`) são esperados: são instruções
ao leitor, não conteúdo observado. O nome do autor em `LICENSE` e em `package.json` é
intencional.

Run (nada de arquivo grande por engano):

```bash
git ls-files -z | xargs -0 du -k | sort -rn | head -5
```

Expected: o maior arquivo é `docs/demo.gif`, abaixo de 5 MB; os PNGs da arte ficam na casa
de poucos KB cada.

- [ ] **Step 3: Conferir e completar o `package.json`**

`package.json` completo:

```json
{
  "name": "escritorio-de-pixels",
  "version": "0.1.0",
  "description": "Escritório de advocacia em pixel art que mostra, em tempo real, o trabalho de agentes de IA (Claude Code, Codex, Grok, Cursor, Gemini).",
  "type": "module",
  "bin": { "escritorio-de-pixels": "./server.mjs" },
  "files": ["server.mjs", "src/", "public/", "salas.json", "cargos.json", "adaptadores/", "docs/protocolo.md", "docs/adaptadores.md", "docs/demo.gif", "arte/CREDITOS.md", "README.md", "README.en.md", "LICENSE"],
  "engines": { "node": ">=20" },
  "repository": { "type": "git", "url": "git+https://github.com/simiaocavalcanteia-arch/escritorio-de-pixels.git" },
  "homepage": "https://github.com/simiaocavalcanteia-arch/escritorio-de-pixels#readme",
  "bugs": { "url": "https://github.com/simiaocavalcanteia-arch/escritorio-de-pixels/issues" },
  "keywords": ["claude-code", "codex", "cursor", "grok", "gemini-cli", "pixel-art", "ai-agents", "visualization", "legal-tech", "hooks", "sse", "pt-br"],
  "author": "Simião Cavalcante",
  "license": "MIT",
  "scripts": {
    "start": "node server.mjs",
    "demo": "node server.mjs --demo",
    "test": "node --test test/*.test.js"
  }
}
```

Run:

```bash
node -e "
const p = require('./package.json');
console.log('deps:', Object.keys(p.dependencies || {}).length, '| engines:', p.engines.node, '| bin:', !!p.bin, '| files:', p.files.length);
const { existsSync } = require('fs');
for (const f of p.files) if (!existsSync(f.replace(/\/$/, ''))) console.log('FALTA em files:', f);
console.log('repository:', !!p.repository, '| homepage:', !!p.homepage, '| keywords:', p.keywords.length);
"
```

Expected:

```
deps: 0 | engines: >=20 | bin: true | files: 13
repository: true | homepage: true | keywords: 12
```

(sem nenhuma linha `FALTA em files:`). `docs/demo.gif` entra em `files` porque os dois
READMEs o referenciam: um tarball sem ele mostraria uma imagem quebrada na página do npm.

```bash
git add package.json
git commit -m "chore: metadados do pacote para a publicação

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: ⚠️ PARE — publicar no GitHub (exige confirmação explícita do usuário)**

> **Não execute este passo por conta própria.** Ele torna o código público e permanente.
> Pergunte ao usuário, nesta conversa, algo como: *"Posso publicar o repositório em
> `simiaocavalcanteia-arch/escritorio-de-pixels` como **público**?"* e só siga com um
> "sim" explícito dele agora. Plano aprovado não é autorização de publicação. Se o usuário
> preferir, troque `--public` por `--private`; se ele disser não ou não responder, pule
> para o Step 8 e deixe o repositório só local.

Antes de rodar, confirme a conta:

Run: `gh auth status`
Expected: autenticado como `simiaocavalcanteia-arch`.

Com o "sim" do usuário:

```bash
gh repo create simiaocavalcanteia-arch/escritorio-de-pixels \
  --public --source . --remote origin --push \
  --description "Escritório de advocacia em pixel art que mostra, em tempo real, o trabalho de agentes de IA (Claude Code, Codex, Grok, Cursor, Gemini). Node sem dependências, só loopback."
```

Expected: a URL `https://github.com/simiaocavalcanteia-arch/escritorio-de-pixels` e o push
da `main` concluído.

Run: `gh repo view --json name,visibility,defaultBranchRef -q '.name + " " + .visibility + " " + .defaultBranchRef.name'`
Expected: `escritorio-de-pixels PUBLIC main`.

- [ ] **Step 5: Topics**

```bash
gh repo edit --add-topic claude-code --add-topic codex --add-topic pixel-art \
  --add-topic ai-agents --add-topic visualization --add-topic legal-tech --add-topic pt-br
gh repo view --json repositoryTopics -q '[.repositoryTopics[].name] | join(", ")'
```

Expected: `ai-agents, claude-code, codex, legal-tech, pixel-art, pt-br, visualization`.

- [ ] **Step 6: Tag e release `v0.1.0`**

```bash
git tag -a v0.1.0 -m "v0.1.0 — primeiro escritório"
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0 — primeiro escritório" --notes "Primeira versão pública.

- Servidor local em Node, sem dependências de runtime, escutando só em 127.0.0.1.
- Protocolo de eventos v1 e adaptadores por hooks nativos de Claude Code, Codex, Grok e Cursor; Gemini CLI documentado e não testado.
- Cliente Canvas 2D: sete salas, estagiários, ficha do caso, painel por projeto, pt-BR e en.
- Arte em pixel art gerada com gpt-image-2.5 e pós-processada localmente; placeholders procedurais quando falta um sprite.
- Nada do conteúdo observado é gravado em disco; \`--ocultar-prompts\` para tela compartilhada.

Instalação: \`git clone\`, \`node server.mjs\`, \`node server.mjs instalar <cli>\`."
```

Run: `gh release view v0.1.0 --json tagName,isDraft -q '.tagName + " draft=" + (.isDraft|tostring)'`
Expected: `v0.1.0 draft=false`.

- [ ] **Step 7: Abrir as issues iniciais**

```bash
gh issue create --title "Adaptador OpenCode via \`opencode serve\`" --body "O OpenCode não tem hooks: \`opencode serve\` expõe SSE em 127.0.0.1:4096/event com sessões, mensagens, ferramentas, modelo e tokens. Implementar uma ponte \`node server.mjs ponte opencode\` que assina esse fluxo e traduz para eventos v1. Ficou fora da v1 por exigir um processo a mais. Ver docs/adaptadores.md."

gh issue create --title "Gemini CLI: validar os hooks numa instalação real" --body "O tradutor de \`src/tradutores/gemini.js\` nasceu da documentação, com fixtures sintéticas, e nunca rodou numa instalação real. Quem usa o Gemini CLI: instale com \`node server.mjs instalar gemini\`, confira \`GET /saude\` (campo \`ignorados\`) e mande o payload anonimizado de cada evento para virar fixture."

gh issue create --title "Copilot CLI, Kimi CLI e Qwen Code via \`/hook/generico\`" --body "Essas CLIs seguem de perto o formato snake_case do Claude Code e devem funcionar por \`POST /hook/generico?cli=<nome>\`. Falta confirmar na prática, capturar fixtures e, se o formato bater, promovê-las a adaptador próprio com entrada em \`EVENTOS_POR_CLI\` e amostra em \`adaptadores/\`."

gh issue create --title "Publicar no npm (opcional)" --body "O \`package.json\` já tem \`bin\`, \`files\` e \`engines\`. Publicar permitiria \`npx escritorio-de-pixels\`. Antes: conferir o que entra no tarball (\`npm pack --dry-run\`; \`docs/demo.gif\` já está em \`files\` porque o README o referencia, então conferir o tamanho final) e escolher o escopo do nome."

gh issue list --limit 10
```

Expected: quatro issues abertas, listadas por `gh issue list`.

- [ ] **Step 8: Empurrar o que faltar e fechar**

```bash
git push
git status --short
```

Expected: nada pendente (`git status --short` sem saída) e `main` igual ao remoto. Se a
publicação foi adiada no Step 4, o repositório fica só local e o `git push` é dispensado —
avise isso ao usuário no relatório final.

Run (só se publicou; o CI leva um ou dois minutos): `gh run list --limit 3`
Expected: a execução mais recente de `ci` na `main` com os jobs `test` e `arte` concluídos
com sucesso.

---

## Fora deste plano

- **Publicação no npm:** fica como issue opcional (Task 7, Step 7); o `package.json` já
  está preparado.
- **Ponte OpenCode** (`node server.mjs ponte opencode`) e **validação real do Gemini CLI**:
  issues abertas, não implementadas.
- **Mais arte:** quadros de animação (andar, sentar, digitar) e variações por sala. A v1
  anima por procedimento sobre um quadro só; o manifesto aceita ids novos sem mudar o
  formato do atlas.
- **Acesso remoto, persistência histórica, estatísticas acumuladas, mobile e Windows:**
  não objetivos declarados na spec.
- Tudo do Plano 1 (servidor, protocolo, estado, tradutores, instaladores) e do Plano 2
  (cliente Canvas, HUD, ficha do caso) já está feito quando este plano começa.

## Autorrevisão do plano

- **Cobertura da spec:** seção 9 inteira — manifesto com `id`, `categoria`, `prompt`,
  tamanho e âncora (Task 2), conjunto de 12 personagens, 10 móveis e 5 pisos (Task 2),
  `gerar.py` com modelo configurável, `size=1024x1024`, `quality=medium` e preâmbulo por
  categoria (Task 3), `background` transparente para sujeito e opaco para piso (Task 3),
  pós-processamento com recorte, nearest-neighbor, âncora na base central e quantização à
  paleta de 32 cores com alfa binário em 128 (Tasks 1 e 3), atlas com `hash` cobrindo
  prompt, tamanho, modelo e preâmbulo, com pulo por hash e `--forcar` (Task 3), falha de
  API que não interrompe o lote e relatório final (Task 3), placeholders como rede de
  segurança (citados nos READMEs e no `CREDITOS.md`), licença MIT e `arte/CREDITOS.md`
  (Task 5). Seção 14: papéis e ordem de execução respeitados (arte depois do cliente,
  README e publicação por último). Seção 15: `gh repo create` público, push, README pt-BR
  com GIF, `README.en.md`, `package.json` com `bin`, `files` e `engines`, topics exatos,
  npm como passo opcional posterior (Task 7). Seção 16: paleta comum, preâmbulo por
  categoria e hash por asset como mitigação da inconsistência entre imagens (Tasks 1 a 3);
  escopo fechado com Gemini documentado e OpenCode como issue (Task 7). Seção 3: a
  estrutura de pastas (`arte/`, `public/arte/`, `docs/`) é a da spec. Seção 10: a
  documentação de privacidade dos READMEs e do `protocolo.md` repete os limites reais
  implementados no Plano 1.
- **Sem placeholders:** todo passo traz código completo (Python, JavaScript ou Markdown
  inteiro) ou um comando com saída esperada. As duas únicas partes exploratórias são a
  inspeção visual dos PNGs (Task 4, Step 5, com critérios de aceite e receita de
  regeneração) e a gravação do GIF (Task 6, Step 3, com caminho preferido pelo navegador e
  alternativa por Chrome headless, ambos normalizados pelo mesmo filtro de paleta do
  `ffmpeg`).
- **Consistência de nomes entre tarefas e planos:** `PALETA`/`imagem_paleta()` (Task 1 →
  3 → 4), `ajustar_sujeito`/`ajustar_piso`/`quantizar`/`processar` (Task 3 → `test_pos.py`),
  `hash_do_asset` e o formato `{ id, arquivo, categoria, w, h, ancora, hash }` (Task 3 →
  Task 4 → `public/sprites.js` do Plano 2), ids de sprite `personagem-<cargo>-<a|b>`,
  `movel-<nome>` e `piso-<nome>` idênticos aos que o cliente pede (Task 2, conferidos por
  comando no Step 3 e pelo `test/atlas.test.js`), rotas e limites de `docs/protocolo.md`
  iguais aos de `src/app.js` e `src/protocolo.js` (Plano 1, Tasks 2 e 15), JSON de
  `docs/adaptadores.md` conferido contra `adaptadores/*.hooks.json` por comando (Task 5,
  Step 5), `EVENTOS_POR_CLI` refletido evento a evento em cada seção da documentação.
- **Riscos assumidos:** o custo da geração é real e o usuário paga por imagem (avisado na
  Task 4, com idempotência e `--so` para limitar o gasto); o modelo pode devolver arte
  ruim, e a saída é regenerar o asset individualmente ou ajustar o prompt; `gpt-image-2.5-flare`
  pode sumir da conta, e a alternativa `--modelo gpt-image-2.5-sunburst` está prevista na
  Task 4, Step 1; a publicação depende de confirmação humana e o plano não a antecipa.
- Revisão externa: 12 correções aplicadas em 2026-09-21.
