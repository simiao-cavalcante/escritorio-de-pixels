# Refino da arte com gpt-image-2.5 — notas do experimento (branch `arte/gpt-refino`)

Data: 2026-09-21. Objetivo: melhorar a qualidade percebida dos pixels da arte e da tela
sem mexer no contrato do atlas (ids, tamanhos e âncoras dos 27 assets continuam iguais).

## O que mudou

1. **Geração** (`arte/gerar.py`, `arte/manifesto.json` v2, commit "arte: geração em quality high…")
   - `quality="high"` em vez de `"medium"`; o hash de cada asset passa a cobrir a qualidade.
   - Tamanho de geração pela proporção do alvo: `1536x1024` para os largos (mesa-reuniao,
     balcao, quadro, mesa), `1024x1536` para os altos (estante, personagens, arquivo, planta,
     cafe), `1024x1024` para os quadrados (cadeira, impressora, pisos). Antes tudo era
     `1024x1024` e o recorte proporcional jogava fora até dois terços do quadro.
   - Prompts revisados: preâmbulos com "fills the entire frame edge to edge, no empty margins",
     mesma vista three-quarter para todos os móveis, contorno de 1 px e cores chapadas;
     personagens com cargo reconhecível (sócios de terno escuro de três peças, seniores e
     associados em cinza, júnior sem paletó e de mangas dobradas, estagiários de verde).
   - Ferramentas novas em `gerar.py`: `--brutos DIR` guarda a imagem crua da API,
     `--de-brutos DIR` repete só o pós-processamento sem chamar a API, `--paralelo N`.
     O uso de tokens da API é impresso ao final para estimar custo.
2. **Pós-processamento** (commit "arte: redução por média de área (BOX)…")
   - Personagens e móveis passam de NEAREST para BOX (média de área) na redução, seguida
     da quantização à paleta de 32 cores e de um contorno de 1 px na cor escura da paleta
     em todo pixel opaco que toca um transparente. Os pisos já usavam BOX.
   - Comparação a olho, em cinco assets, a partir das brutas guardadas:
     `docs/screenshots/refino-filtros.png` (colunas NEAREST, BOX, BOX+contorno, LANCZOS).
     Com redução de 30 a 50 vezes, NEAREST amostra um pixel solto da bruta e as linhas
     de dobra do terno, as lombadas da estante e o tampo da mesa viram chuvisco; BOX dá
     campos chapados e a quantização preserva o resultado, mas dilui o traço fino da
     bruta, por isso o contorno é repintado. LANCZOS ficou parecido com BOX, com mais
     contraste espúrio. Escolha: BOX + contorno.
3. **Escala inteira na tela** (commit "cliente: escala inteira do canvas…")
   - `escalaDaTela` devolve um múltiplo inteiro (1, 2, 3…) sempre que o escritório cabe
     pelo menos uma vez no espaço livre; só em janela menor que 960x576 (mais a barra) a
     escala continua fracionária. Cada pixel lógico vira um bloco uniforme de pixels.
   - O palco ocupa toda a altura abaixo da barra e centraliza o canvas nos dois eixos; a
     moldura do canvas passou de `border` para `outline` (a borda entrava na largura e
     fazia 960 px lógicos caberem em 958 px de tela).
   - `npm test`: 202 testes, 201 passam, 1 pulado (Cursor, já era assim).

## Custo

| Item | Valor |
|---|---|
| Chamadas à API | 27 (1 de teste + lote de 26), 0 falhas, 0 retoques por `--so` |
| Tokens de texto (entrada) | 3.391 |
| Tokens de imagem (saída) | 39.732 (1.372 por asset alto/largo, 1.756 por quadrado) |
| Custo aproximado | ≈ US$ 1,21 (tabela gpt-image-2: US$ 5/M texto, US$ 30/M imagem); ≈ US$ 1,27 se a saída for cobrada a US$ 32/M |
| Tempo | ≈ 20 s por chamada; lote de 26 com 3 chamadas simultâneas em ≈ 5 min |

O reprocessamento da frente 2 usou as brutas guardadas (`--de-brutos`), sem nova chamada.

## Antes / depois

| | Antes (main, f529cac) | Depois (esta branch) |
|---|---|---|
| Folha de contato dos 27 sprites | `docs/screenshots/refino-antes-arte-contato.png` | `docs/screenshots/arte-contato.png` |
| Tela da demo a 1920x1200 | `docs/screenshots/demo-01.png` (1280 de largura, escala fracionária 1,03x) | `docs/screenshots/demo-refino-01.png` e `demo-refino-02.png` (painel aberto → 1x centralizado) |
| Filtros de redução | — | `docs/screenshots/refino-filtros.png` |

O que melhorou de forma clara na folha de contato: mesa, mesa de reunião, balcão, quadro e
estante preenchem o tile (antes a mesa de reunião ocupava metade do espaço); os móveis têm
silhueta limpa; os personagens deixaram de ter chuvisco no terno e ganharam contorno, e o
cargo se lê pela cor (verde dos estagiários, papel branco dos júniores, terno escuro dos
sócios); o carpete ficou uniforme; o tapete ganhou um padrão legível ao repetir.

## O que não melhorou (ou piorou)

- ~~Ternos azul-marinho dos sócios listrados de azul e preto~~ — corrigido em 2026-09-22,
  ver "Correção dos ternos" abaixo.
- **Piso de madeira** continua carregado a 32 px (as tábuas da bruta são finas demais);
  está menos alaranjado que antes, mas ainda parece textura, não tábuas.
- **Mesa de reunião** veio vista de cima (tampo e seis cadeiras), não na mesma
  three-quarter da mesa de trabalho, apesar do preâmbulo; preenche o tile, mas o ângulo
  destoa. Um retoque por `--so` com prompt mais específico é o caminho.
- **Escala inteira tem um preço**: a 1920x1200 com o painel aberto sobra 1630 px de largura,
  1,69x não é inteiro e a cena cai para 1x (960x576) no meio de muito espaço vazio; com o
  painel fechado a mesma janela dá 2x. Em notebooks comuns (1366x768, 1440x900) a cena fica
  em 1x com ou sem painel. Os pixels ficam uniformes, mas a cena fica menor do que era com a
  escala fracionária. Se isso incomodar, a alternativa é permitir meio-passos (1,5x), que
  ainda dão pixels regulares em pares.
- Rostos a 32x48 continuam indistintos; é limite do tamanho, não da geração.
- Cadeira e impressora (32x32) continuam pequenas na cena: o contrato do atlas não mudou.

## Correção dos ternos dos sócios (2026-09-22, commit "fix: ternos dos sócios sem listras")

Diagnóstico por medição, antes de gastar chamadas: o azul do terno na bruta era (19,31,66),
quase equidistante do azul-marinho da paleta (31,58,99), do preto do contorno (13,13,16), do
cabelo preto (36,28,20) e do carpete escuro (47,63,79); qualquer sombra da média de área
fazia a quantização alternar entre essas cores, e o terno saía listrado.

Tentativa 1 (prompt) bastou: os prompts de `personagem-socio-a` e `-b` pedem agora "solid
navy suit (medium navy blue, clearly blue and not black), flat two-tone shading, no
gradients, no fold lines". A bruta veio com o terno em (28,55,118) e sombra em (12,30,74),
que caem limpos no azul-marinho e no contorno: no tronco do sprite final, 260 a 290 pixels
de azul-marinho contra 5 a 10 de cores espúrias (antes eram 5 de azul contra 180 de
contorno e 100 de cabelo preto no sócio A). Regeneração só dos dois ids via `--so`:
2 chamadas, 354 tokens de texto e 2.744 de imagem (≈ US$ 0,08). A tentativa 2 (tom
intermediário na paleta) não foi necessária, e a paleta de 32 cores ficou intacta.

Seniores (`personagem-senior-a` e `-b`, terno grafite) conferidos no zoom de 8x e por
contagem: o grafite bruto (68,69,73) cai direto no grafite da paleta (74,74,74), sem
listras; ficaram como estavam.

Arquivos: `docs/screenshots/arte-contato.png` (folha refeita), `demo-refino-03.png`
(captura da demo depois da correção). Custo acumulado do experimento: 29 chamadas,
≈ US$ 1,29.

## Como repetir

```bash
export OPENAI_API_KEY=...
python3 arte/gerar.py --seco                                  # confere prompts, tamanhos e hashes
python3 arte/gerar.py --brutos /tmp/brutos --paralelo 3       # gera o que mudou e guarda as brutas
python3 arte/gerar.py --de-brutos /tmp/brutos --forcar        # só o pós-processamento
python3 arte/contato.py                                       # folha de contato
```
