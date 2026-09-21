# Créditos da arte

Todos os sprites em `public/arte/` foram gerados por IA a partir dos prompts em
`arte/manifesto.json` (versão 2) com o modelo **gpt-image-2.5-flare** da OpenAI
(`images.generate`, `quality=high`, tamanho conforme a proporção do alvo: `1536x1024`
para assets largos, `1024x1536` para altos e `1024x1024` para os quadrados), e depois
pós-processados localmente por `arte/gerar.py` com Pillow:

1. alfa binarizado em 128 (pixel art não tem borda semitransparente);
2. personagens e móveis recortados pela caixa de conteúdo, reduzidos com
   nearest-neighbor preservando a proporção e ancorados na base central do tile;
3. pisos reduzidos direto ao tile de 32x32;
4. tudo quantizado à paleta comum de 32 cores de `arte/paleta.py` (`arte/paleta.png`),
   sem dither.

Cada entrada de `public/arte/atlas.json` carrega um `hash` de 12 caracteres que cobre
modelo, preâmbulo da categoria, prompt, tamanho e qualidade: mudar qualquer um deles faz
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
python3 arte/gerar.py --brutos /tmp/brutos --paralelo 3   # guarda as imagens cruas; 3 chamadas por vez
python3 arte/gerar.py --de-brutos /tmp/brutos --forcar    # repete só o pós-processamento, sem API
```

Guardar as brutas (`--brutos`) permite testar outro pós-processamento sem pagar a geração de
novo; a pasta não é versionada.

Trocar de modelo em definitivo é editar `"modelo"` em `arte/manifesto.json`: o hash de cada
asset inclui o modelo, e `--modelo` sozinho faria o lote inteiro ser regerado duas vezes.

O app funciona sem arte: sem `public/arte/atlas.json`, o cliente (Plano 2) desenha
placeholders procedurais e avisa uma vez no console.
