# Escritório de Pixels — Plano 2: Cliente Canvas (escritório, personagens, HUD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliente de navegador, sem dependências, que consome o fluxo SSE do Plano 1 e mostra o escritório em pixel art: sete salas com postos, advogados e estagiários caminhando, balões, crachás por CLI, HUD com saúde dos adaptadores, painel por projeto, ficha do caso e alternância pt-BR/en.

**Architecture:** `escritorio.js` é o único arquivo que toca em `window`: abre o `EventSource`, roda o laço de `requestAnimationFrame` e liga o HUD ao estado. Toda a lógica fica em módulos ES sem DOM — `fluxo-cliente.js` (redutor do SSE), `mundo.js` (layout e grafo), `personagens.js` (postos, rotas e limites), `hud-util.js` (agrupamento, formatação e escala), `i18n.js` (textos), `sprites.js` (atlas e placeholders) e `cores.js` (cores das entidades) —, importáveis por `node --test`. `render.js` desenha no Canvas 2D e `hud.js` monta a barra, o painel e a ficha em DOM puro.

**Tech Stack:** Node.js >= 20 (só para os testes), ESM, Canvas 2D e DOM nativos. Zero dependências em runtime, nada de CDN.

Spec: `docs/superpowers/specs/2026-09-20-escritorio-de-pixels-design.md` (seções 5, 6, 8, 10, 12 e 13).

Pré-requisito: o Plano 1 (`docs/superpowers/plans/2026-09-20-escritorio-nucleo.md`) concluído na branch `feat/nucleo`. Comece com `git checkout feat/nucleo && git checkout -b feat/cliente`.

## Global Constraints

- Node `>= 20`, ESM, zero dependências; `npm test` continua sendo `node --test test/*.test.js` (sem subpastas de teste).
- Nada de bibliotecas no cliente (sem PixiJS, sem React, sem CDN): Canvas 2D e DOM puros.
- Texto vindo do servidor sempre por `textContent`, nunca `innerHTML`; `localStorage` só dentro de `try/catch`; `prefers-reduced-motion` respeitado (sem balanço, deslocamento instantâneo).
- Contrato do fluxo (não invente outro): `snapshot { seq, advogados, estagiarios, salas: [{ id, rotulo }], saude, crachas }`; deltas `advogado`, `estagiario`, `remover { tipo, id }`, `saude`, todos com `seq` crescente; delta com `seq <= seq do snapshot` é descartado; salto (`seq > ultimoSeq + 1`) fecha e reabre o `EventSource`.
- Ids de sala: `recepcao`, `biblioteca`, `gabinete`, `revisao`, `cartorio`, `reunioes`, `copa`. Estados: `recepcao`, `pensando`, `trabalhando`, `aguardando`, `ocioso`, `saiu`. Cargos: `junior`, `socio`, `senior`, `associado`, `advogado`.
- Ids de sprite: personagens `personagem-<socio|senior|associado|junior|advogado|estagiario>-<a|b>`; móveis `movel-<mesa|estante|arquivo|mesa-reuniao|balcao|cadeira|planta|cafe|impressora|quadro>`; pisos `piso-<madeira|carpete|parede|porta|tapete>`. Sem `public/arte/atlas.json` (404) ou sem um id, o cliente desenha placeholder procedural e avisa uma única vez no console.
- Resolução lógica fixa: 960x576 = 30x18 tiles de 32 px, escalada à janela mantendo proporção, `image-rendering: pixelated`, sem câmera.
- Identificadores em português; mensagens de commit `feat:`/`test:`/`docs:` em português terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Cada tarefa termina com o teste do arquivo verde, `npm test` verde e um commit.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/cargos.js` (alterado) | `listarCrachas()` no classificador |
| `src/app.js` (alterado) | `crachas` no snapshot enviado ao cliente |
| `public/i18n.js` | textos pt-BR e en, rótulos de sala em en, número por idioma |
| `public/mundo.js` | tiles, sete salas com portas, postos e móveis, grafo de waypoints e BFS |
| `public/fluxo-cliente.js` | `aplicarMensagem` (redutor do SSE, com `conectado`) e `criarClienteFluxo` com fonte injetável |
| `public/personagens.js` | elenco: limites, ocupação de postos, debounce de sala, rotas e órbita |
| `public/hud-util.js` | agrupar por projeto, contar por CLI, tokens, cor da saúde, truncar, escala do canvas |
| `public/cores.js` | cores de cargo, sala, piso, saúde e crachá num único lugar (`hud-util.js`, `render.js` e `hud.js` importam daqui) |
| `public/sprites.js` | atlas com `fetch` injetável, placeholders e variação a/b estável |
| `public/render.js` | desenho da cena no Canvas 2D e `atorEm` (acerto do clique) |
| `public/hud.js` | barra superior, painel lateral e ficha do caso em DOM puro |
| `public/escritorio.js` | bootstrap: `EventSource`, `requestAnimationFrame`, clique, `localStorage` |
| `public/index.html`, `public/estilo.css` | página e estilos (substituem o placeholder do Plano 1) |
| `test/cliente-*.test.js` | testes dos módulos sem DOM (i18n, mundo, fluxo, personagens, hud-util e cores, sprites, render) |
| `docs/screenshots/*.png` | capturas da verificação visual com `--demo` (Chrome headless por linha de comando) |

---

### Task 1: `crachas` no snapshot (`src/cargos.js` e `src/app.js`)

O cliente desenha o crachá com a cor e a sigla da CLI. Elas já existem em `cargos.json`, mas não saem no snapshot: esta tarefa as expõe.

Nada a fazer para a saúde dos adaptadores: o servidor já emite o delta `saude` (`fluxo.transmitir('saude', { saude })` no tique de `src/app.js`, a cada lote ingerido que sujou a saúde), coberto pelo teste `'tique com saúde suja emite delta saude no SSE, com seq maior que o do snapshot'` de `test/app.test.js`; o redutor do cliente o trata na Task 4 e o HUD desenha a barra a partir de `estado.saude` na Task 9.

**Files:**
- Modify: `src/cargos.js`, `src/app.js`
- Test: `test/cargos.test.js` (acrescentar caso), `test/app.test.js` (acrescentar asserções)

**Interfaces:**
- Produces: `criarClassificador(config) → { cargoDoModelo, crachaDaCli, listarCrachas }`; `listarCrachas() → { clis: { <cli>: { cor, sigla } }, padrao: { cor, sigla } }`.
- Consumes: `carregarCargos` (Task 4 do Plano 1) e `snapshot()` de `src/app.js` (Task 15 do Plano 1).

- [ ] **Step 1: Acrescentar o teste de `listarCrachas` em `test/cargos.test.js`**

Insira este bloco depois do teste `'crachá por CLI com fallback'`:

```js
test('listarCrachas entrega o mapa inteiro para o cliente, em cópia', () => {
  const classificador = padrao();
  const crachas = classificador.listarCrachas();
  assert.deepEqual(Object.keys(crachas.clis).sort(), ['claude', 'codex', 'cursor', 'gemini', 'grok', 'opencode']);
  assert.deepEqual(crachas.clis.codex, { cor: '#2e9e5b', sigla: 'CX' });
  assert.deepEqual(crachas.padrao, { cor: '#8a8a8a', sigla: '??' });
  crachas.clis.claude.sigla = 'XX';
  assert.equal(classificador.crachaDaCli('claude').sigla, 'CL');
});
```

- [ ] **Step 2: Acrescentar as asserções em `test/app.test.js`**

No teste `'POST /eventos aplica e GET /estado reflete; Host estranho recebe 421; Origin externo 403'`, logo depois da linha `assert.equal(estado.salas.length, 7);`, insira:

```js
    assert.deepEqual(estado.crachas.clis.claude, { cor: '#c2603e', sigla: 'CL' });
    assert.deepEqual(estado.crachas.padrao, { cor: '#8a8a8a', sigla: '??' });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node --test test/cargos.test.js test/app.test.js`
Expected: FAIL com `classificador.listarCrachas is not a function` e `Cannot read properties of undefined (reading 'clis')`.

- [ ] **Step 4: Implementar `listarCrachas` em `src/cargos.js`**

Em `criarClassificador`, acrescente o terceiro método (o objeto devolvido passa a ter `cargoDoModelo`, `crachaDaCli` e `listarCrachas`):

```js
export function criarClassificador(config) {
  return {
    cargoDoModelo(modelo) {
      if (typeof modelo !== 'string' || !modelo) return config.padrao;
      const m = modelo.toLowerCase();
      for (const r of config.regras) if (r.re.test(m)) return r.cargo;
      return config.padrao;
    },
    crachaDaCli(cli) {
      return config.clis[cli] ?? config.cliPadrao;
    },
    /** Mapa de crachás para o snapshot; cópia, para o cliente não mexer na config. */
    listarCrachas() {
      const clis = {};
      for (const [nome, cracha] of Object.entries(config.clis)) clis[nome] = { ...cracha };
      return { clis, padrao: { ...config.cliPadrao } };
    },
  };
}
```

- [ ] **Step 5: Incluir `crachas` no snapshot de `src/app.js`**

Troque a função `snapshot()` por:

```js
  function snapshot() {
    return {
      ...escritorio.snapshot(),
      salas: Object.entries(SALAS_ROTULOS).map(([id, rotulo]) => ({ id, rotulo })),
      crachas: cargos.listarCrachas(),
      saude,
    };
  }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test test/cargos.test.js test/app.test.js`
Expected: `# pass 12`, `# fail 0` (5 de cargos e 7 de app).

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/cargos.js src/app.js test/cargos.test.js test/app.test.js
git commit -m "feat: expor crachás das CLIs no snapshot do fluxo" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `public/i18n.js` — textos pt-BR e en

**Files:**
- Create: `public/i18n.js`
- Test: `test/cliente-i18n.test.js`

**Interfaces:**
- Produces: `IDIOMAS = ['pt-BR', 'en']`; `IDIOMA_PADRAO`; `TEXTOS`, `CARGOS_TEXTO`, `ESTADOS_TEXTO`, `SALAS_TEXTO`; `idiomaDoNavegador(lista) → 'pt-BR' | 'en'`; `criarI18n(idioma) → { idioma, t(chave), cargo(id), estado(id), sala(id, rotuloDoServidor), numero(n), outro() }`.
- Regra: em pt-BR o rótulo da sala é o que o servidor mandou no snapshot; em en, o mapa por id.

- [ ] **Step 1: Escrever o teste**

`test/cliente-i18n.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarI18n, idiomaDoNavegador, IDIOMAS, TEXTOS } from '../public/i18n.js';

test('os dois idiomas têm exatamente as mesmas chaves', () => {
  assert.deepEqual(IDIOMAS, ['pt-BR', 'en']);
  assert.deepEqual(Object.keys(TEXTOS['pt-BR']).sort(), Object.keys(TEXTOS.en).sort());
});

test('t, cargo e estado traduzem e caem no pt-BR quando falta chave', () => {
  const pt = criarI18n('pt-BR');
  const en = criarI18n('en');
  assert.equal(pt.t('casoAtual'), 'Caso atual');
  assert.equal(en.t('casoAtual'), 'Current case');
  assert.equal(pt.t('semConexao'), 'Sem conexão com o servidor');
  assert.equal(en.t('semConexao'), 'No connection to the server');
  assert.equal(pt.cargo('socio'), 'Sócio(a)');
  assert.equal(en.cargo('socio'), 'Partner');
  assert.equal(en.estado('trabalhando'), 'working');
  assert.equal(en.t('naoExiste'), 'naoExiste');
  assert.equal(criarI18n('klingon').idioma, 'pt-BR');
});

test('rótulo de sala: pt-BR usa o do servidor, en traduz por id', () => {
  const pt = criarI18n('pt-BR');
  const en = criarI18n('en');
  assert.equal(pt.sala('gabinete', 'Gabinete de Redação'), 'Gabinete de Redação');
  assert.equal(en.sala('gabinete', 'Gabinete de Redação'), 'Drafting Office');
  assert.equal(en.sala('inexistente', 'Sala X'), 'Sala X');
});

test('numero usa separador de milhar por idioma', () => {
  assert.equal(criarI18n('pt-BR').numero(1234567), '1.234.567');
  assert.equal(criarI18n('en').numero(1234567), '1,234,567');
  assert.equal(criarI18n('pt-BR').numero(42), '42');
  assert.equal(criarI18n('pt-BR').numero(undefined), '—');
});

test('idiomaDoNavegador escolhe en só quando o navegador pede en', () => {
  assert.equal(idiomaDoNavegador(['en-US', 'pt-BR']), 'en');
  assert.equal(idiomaDoNavegador(['pt-BR', 'en']), 'pt-BR');
  assert.equal(idiomaDoNavegador(['fr', 'en-GB']), 'en');
  assert.equal(idiomaDoNavegador(['fr-FR']), 'pt-BR');
  assert.equal(idiomaDoNavegador([]), 'pt-BR');
  assert.equal(criarI18n('en').outro(), 'pt-BR');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/cliente-i18n.test.js`
Expected: FAIL com `Cannot find module '../public/i18n.js'`.

- [ ] **Step 3: Implementar `public/i18n.js`**

```js
// Textos da interface em pt-BR e en. Sem DOM: só dados e funções puras.

export const IDIOMAS = Object.freeze(['pt-BR', 'en']);
export const IDIOMA_PADRAO = 'pt-BR';

export const TEXTOS = Object.freeze({
  'pt-BR': {
    titulo: 'Escritório de Pixels',
    abrirPainel: 'Abrir painel',
    fecharPainel: 'Fechar painel',
    fechar: 'Fechar',
    trocarIdioma: 'English',
    advogados: 'advogados',
    foraDoMapa: 'fora do mapa',
    semAdvogados: 'Nenhuma sessão ativa. Instale os hooks e rode uma CLI.',
    semConexao: 'Sem conexão com o servidor',
    fichaDoCaso: 'Ficha do caso',
    casoAtual: 'Caso atual',
    semCaso: 'sem caso',
    turno: 'Turno',
    cli: 'CLI',
    modelo: 'Modelo',
    cargo: 'Cargo',
    sala: 'Sala',
    avisoSala: 'a sala indica a fase provável',
    acoesRecentes: 'Ações recentes',
    semAcoes: 'sem ações',
    tokens: 'Tokens',
    contexto: 'Contexto',
    janelaDesconhecida: 'janela desconhecida',
    saida: 'Saída',
    estagiarios: 'Estagiários',
    semEstagiarios: 'nenhum estagiário ativo',
    saude: 'Saúde dos adaptadores',
    semEventos: 'sem eventos',
    desconhecido: 'desconhecido',
    semProjeto: 'sem projeto',
  },
  en: {
    titulo: 'Pixel Law Office',
    abrirPainel: 'Open panel',
    fecharPainel: 'Close panel',
    fechar: 'Close',
    trocarIdioma: 'Português',
    advogados: 'lawyers',
    foraDoMapa: 'off the map',
    semAdvogados: 'No active session. Install the hooks and run a CLI.',
    semConexao: 'No connection to the server',
    fichaDoCaso: 'Case file',
    casoAtual: 'Current case',
    semCaso: 'no case',
    turno: 'Turn',
    cli: 'CLI',
    modelo: 'Model',
    cargo: 'Role',
    sala: 'Room',
    avisoSala: 'the room shows the likely phase',
    acoesRecentes: 'Recent actions',
    semAcoes: 'no actions',
    tokens: 'Tokens',
    contexto: 'Context',
    janelaDesconhecida: 'unknown window',
    saida: 'Output',
    estagiarios: 'Interns',
    semEstagiarios: 'no active intern',
    saude: 'Adapter health',
    semEventos: 'no events',
    desconhecido: 'unknown',
    semProjeto: 'no project',
  },
});

export const CARGOS_TEXTO = Object.freeze({
  'pt-BR': { socio: 'Sócio(a)', senior: 'Advogado(a) sênior', associado: 'Associado(a)', junior: 'Júnior', advogado: 'Advogado(a)', estagiario: 'Estagiário(a)' },
  en: { socio: 'Partner', senior: 'Senior lawyer', associado: 'Associate', junior: 'Junior', advogado: 'Lawyer', estagiario: 'Intern' },
});

export const ESTADOS_TEXTO = Object.freeze({
  'pt-BR': { recepcao: 'na recepção', pensando: 'pensando', trabalhando: 'trabalhando', aguardando: 'aguardando', ocioso: 'ocioso', saiu: 'saiu' },
  en: { recepcao: 'at reception', pensando: 'thinking', trabalhando: 'working', aguardando: 'waiting', ocioso: 'idle', saiu: 'left' },
});

// O servidor manda os rótulos em pt-BR no snapshot; em en traduzimos por id.
export const SALAS_TEXTO = Object.freeze({
  en: { recepcao: 'Reception', biblioteca: 'Library', gabinete: 'Drafting Office', revisao: 'Review Room', cartorio: 'Registry', reunioes: 'Meeting Room', copa: 'Break Room' },
});

export function idiomaDoNavegador(idiomas = []) {
  for (const bruto of idiomas) {
    const lingua = String(bruto ?? '').toLowerCase();
    if (lingua.startsWith('en')) return 'en';
    if (lingua.startsWith('pt')) return IDIOMA_PADRAO;
  }
  return IDIOMA_PADRAO;
}

export function criarI18n(idioma = IDIOMA_PADRAO) {
  const lingua = IDIOMAS.includes(idioma) ? idioma : IDIOMA_PADRAO;
  return {
    idioma: lingua,
    t(chave) {
      return TEXTOS[lingua][chave] ?? TEXTOS[IDIOMA_PADRAO][chave] ?? chave;
    },
    cargo(id) {
      return CARGOS_TEXTO[lingua][id] ?? CARGOS_TEXTO[IDIOMA_PADRAO][id] ?? id;
    },
    estado(id) {
      return ESTADOS_TEXTO[lingua][id] ?? ESTADOS_TEXTO[IDIOMA_PADRAO][id] ?? id;
    },
    sala(id, rotuloDoServidor) {
      if (lingua === 'en') return SALAS_TEXTO.en[id] ?? rotuloDoServidor ?? id;
      return rotuloDoServidor ?? id;
    },
    numero(valor) {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
      const separador = lingua === 'en' ? ',' : '.';
      return Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, separador);
    },
    outro() {
      return lingua === 'en' ? IDIOMA_PADRAO : 'en';
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/cliente-i18n.test.js`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public/i18n.js test/cliente-i18n.test.js
git commit -m "feat: textos do cliente em pt-BR e en" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `public/mundo.js` — layout, postos e grafo de caminhos

Planta do andar em 30x18 tiles (x da esquerda, y de cima). O retângulo inclui as paredes; o interior vai de `x0+1,y0+1` a `x1-1,y1-1`; a porta é o tile da parede que dá para o corredor.

| Sala | Retângulo (x0,y0 → x1,y1) | Porta | Postos | Posição |
| --- | --- | --- | --- | --- |
| `reunioes` | 0,0 → 8,6 | 4,6 | 4 | canto superior esquerdo |
| `copa` | 9,0 → 20,5 | 14,5 | 3 | topo, no centro |
| `revisao` | 21,0 → 29,6 | 25,6 | 3 | canto superior direito |
| `biblioteca` | 0,9 → 6,17 | 6,12 | 4 | esquerda |
| `gabinete` | 22,9 → 29,13 | 22,11 | 4 | direita, no meio |
| `cartorio` | 22,14 → 29,17 | 22,15 | 3 | canto inferior direito |
| `recepcao` | 9,11 → 19,17 | 14,11 | 6 | embaixo, no centro (a maior) |

Corredor em cruz: braço horizontal ao longo de `y = 8` por toda a largura e eixo central em `x = 14`, ligando a porta da copa (norte, `14,5`) ao saguão em frente à porta da recepção (sul, `14,11`). Dois ramais servem as laterais: oeste em `x = 7` (da junção `7,8` até a porta da biblioteca, em `y = 12`) e leste em `x = 21` (da junção `21,8` até as portas do gabinete, `y = 11`, e do cartório, `y = 15`). O saguão é o trecho entre o cruzamento `14,8` e a porta da recepção. Todo tile fora dos retângulos das salas é corredor; os waypoints de `NOS` seguem exatamente esses eixos, então os personagens andam em linha reta por eles.

**Files:**
- Create: `public/mundo.js`
- Test: `test/cliente-mundo.test.js`

**Interfaces:**
- Produces: `TILE = 32`, `COLUNAS = 30`, `LINHAS = 18`, `LARGURA = 960`, `ALTURA = 576`; `SALAS` (retângulo, piso, porta, postos com móvel e decoração); `ORDEM_SALAS`; `NOS` e `ARESTAS`; `salaEm`, `ehPorta`, `ehParede`, `tipoDePiso`; `noDaSala(sala) → 'porta-<sala>'`; `caminhoEntreNos(a, b) → string[]`; `noMaisProximo(x, y)`; `postosDaSala`, `posicaoJuntoAPorta(sala, indice)`. (Sem `caminhoEntreSalas` nem `centroDaSala`: ninguém os consumia; `personagens.js` monta a rota com `caminhoEntreNos` + `NOS`.)
- Postos por sala: recepção 6, biblioteca 4, gabinete 4, revisão 3, cartório 3, reuniões 4, copa 3.

- [ ] **Step 1: Escrever o teste**

`test/cliente-mundo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SALAS, ORDEM_SALAS, NOS, ARESTAS, COLUNAS, LINHAS, LARGURA, ALTURA,
  noDaSala, caminhoEntreNos, noMaisProximo, salaEm, ehParede, ehPorta, tipoDePiso, posicaoJuntoAPorta, postosDaSala,
} from '../public/mundo.js';

const IDS = ['recepcao', 'biblioteca', 'gabinete', 'revisao', 'cartorio', 'reunioes', 'copa'];
const POSTOS_ESPERADOS = { recepcao: 6, biblioteca: 4, gabinete: 4, revisao: 3, cartorio: 3, reunioes: 4, copa: 3 };

test('resolução lógica e as sete salas com os ids do contrato', () => {
  assert.equal(LARGURA, 960);
  assert.equal(ALTURA, 576);
  assert.equal(COLUNAS, 30);
  assert.equal(LINHAS, 18);
  assert.deepEqual([...ORDEM_SALAS].sort(), [...IDS].sort());
  assert.deepEqual(Object.keys(SALAS).sort(), [...IDS].sort());
});

test('salas cabem no grid e não se sobrepõem', () => {
  const ocupado = new Map();
  for (const s of Object.values(SALAS)) {
    assert.ok(s.x0 >= 0 && s.x1 < COLUNAS && s.y0 >= 0 && s.y1 < LINHAS, `${s.id} fora do grid`);
    assert.ok(s.x1 - s.x0 >= 3 && s.y1 - s.y0 >= 3, `${s.id} pequena demais`);
    for (let x = s.x0; x <= s.x1; x += 1) {
      for (let y = s.y0; y <= s.y1; y += 1) {
        const chave = `${x},${y}`;
        assert.equal(ocupado.has(chave), false, `${chave} em ${s.id} e ${ocupado.get(chave)}`);
        ocupado.set(chave, s.id);
      }
    }
  }
  // A recepção é a maior sala.
  const area = (s) => (s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1);
  for (const s of Object.values(SALAS)) {
    if (s.id !== 'recepcao') assert.ok(area(SALAS.recepcao) > area(s), `recepcao não é maior que ${s.id}`);
  }
});

test('postos por sala: contagem do plano, dentro do interior e sem sobrepor móveis', () => {
  for (const [id, quantidade] of Object.entries(POSTOS_ESPERADOS)) {
    const s = SALAS[id];
    assert.equal(postosDaSala(id).length, quantidade, `postos de ${id}`);
    const usados = new Set(s.decoracao.map((m) => `${m.x},${m.y}`));
    for (const p of s.postos) {
      assert.ok(p.x > s.x0 && p.x < s.x1 && p.y > s.y0 && p.y < s.y1, `posto de ${id} fora do interior`);
      assert.equal(usados.has(`${p.x},${p.y}`), false, `posto de ${id} em cima de decoração`);
      if (p.movel) {
        assert.ok(p.movel.x > s.x0 && p.movel.x < s.x1 && p.movel.y > s.y0 && p.movel.y < s.y1, `móvel de ${id} fora do interior`);
        assert.match(p.movel.sprite, /^movel-/);
      }
    }
    for (const m of s.decoracao) assert.match(m.sprite, /^movel-/);
  }
});

test('cada porta fica na parede da sala e dá para um tile de corredor', () => {
  for (const s of Object.values(SALAS)) {
    const { x, y } = s.porta;
    const naBorda = x === s.x0 || x === s.x1 || y === s.y0 || y === s.y1;
    assert.ok(naBorda, `porta de ${s.id} não está na parede`);
    assert.equal(ehPorta(x, y), true);
    assert.equal(ehParede(x, y), false);
    const fora = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]
      .filter((p) => salaEm(p.x, p.y) === null);
    assert.ok(fora.length >= 1, `porta de ${s.id} não toca o corredor`);
  }
});

test('tipoDePiso distingue parede, porta, sala e corredor', () => {
  assert.equal(tipoDePiso(0, 0), 'piso-parede');
  assert.equal(tipoDePiso(4, 6), 'piso-porta');
  assert.equal(tipoDePiso(14, 8), 'piso-madeira');
  assert.equal(tipoDePiso(2, 11), 'piso-carpete');
  assert.equal(tipoDePiso(13, 13), 'piso-tapete');
  assert.equal(salaEm(14, 8), null);
  assert.equal(salaEm(13, 13), 'recepcao');
});

test('o grafo liga todas as salas entre si e o caminho começa e termina nas portas', () => {
  for (const [a, b] of ARESTAS) {
    assert.ok(NOS[a], `nó ${a} não existe`);
    assert.ok(NOS[b], `nó ${b} não existe`);
  }
  for (const origem of IDS) {
    for (const destino of IDS) {
      const nomes = caminhoEntreNos(noDaSala(origem), noDaSala(destino));
      if (origem === destino) {
        assert.deepEqual(nomes, [noDaSala(origem)]);
        continue;
      }
      const caminho = nomes.map((n) => ({ ...NOS[n] }));
      assert.ok(caminho.length >= 2, `sem caminho de ${origem} a ${destino}`);
      assert.deepEqual(caminho[0], { ...SALAS[origem].porta });
      assert.deepEqual(caminho.at(-1), { ...SALAS[destino].porta });
      // Cada trecho é reto (só muda um eixo por vez).
      for (let i = 1; i < caminho.length; i += 1) {
        const dx = Math.abs(caminho[i].x - caminho[i - 1].x);
        const dy = Math.abs(caminho[i].y - caminho[i - 1].y);
        assert.ok(dx === 0 || dy === 0, `trecho torto de ${origem} a ${destino}`);
      }
    }
  }
});

test('caminho da biblioteca ao cartório passa pelo cruzamento central', () => {
  const nomes = caminhoEntreNos('porta-biblioteca', 'porta-cartorio');
  assert.deepEqual(nomes, ['porta-biblioteca', 'ramal-oeste', 'ramal-oeste-topo', 'cruz', 'ramal-leste-topo', 'ramal-leste', 'ramal-cartorio', 'porta-cartorio']);
  assert.deepEqual(caminhoEntreNos('cruz', 'cruz'), ['cruz']);
  assert.deepEqual(caminhoEntreNos('cruz', 'inexistente'), []);
});

test('noMaisProximo devolve a porta da própria sala para cada posto', () => {
  for (const id of IDS) {
    for (const p of postosDaSala(id)) {
      assert.equal(noMaisProximo(p.x, p.y), `porta-${id}`, `posto ${p.x},${p.y} de ${id}`);
    }
  }
  assert.equal(noMaisProximo(14, 8), 'cruz');
});

test('posicaoJuntoAPorta fica dentro da sala e varia por índice', () => {
  for (const id of IDS) {
    const s = SALAS[id];
    const vistos = new Set();
    for (let i = 0; i < 3; i += 1) {
      const p = posicaoJuntoAPorta(id, i);
      assert.ok(p.x > s.x0 && p.x < s.x1 && p.y > s.y0 && p.y < s.y1, `${id}: ${p.x},${p.y} fora do interior`);
      vistos.add(`${p.x},${p.y}`);
    }
    assert.ok(vistos.size >= 2, `${id}: posições não se deslocam por índice`);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/cliente-mundo.test.js`
Expected: FAIL com `Cannot find module '../public/mundo.js'`.

- [ ] **Step 3: Implementar `public/mundo.js`**

```js
// Layout fixo do escritório: tiles, salas, postos, móveis e grafo de waypoints.
// Sem DOM: coordenadas em tiles (o desenho multiplica por TILE).

export const TILE = 32;
export const COLUNAS = 30;
export const LINHAS = 18;
export const LARGURA = COLUNAS * TILE; // 960
export const ALTURA = LINHAS * TILE; // 576

const posto = (x, y, sprite, mx = x, my = y - 1) => ({ x, y, movel: sprite ? { sprite, x: mx, y: my } : null });
const movel = (sprite, x, y) => ({ sprite, x, y });

export const SALAS = Object.freeze({
  reunioes: {
    id: 'reunioes', x0: 0, y0: 0, x1: 8, y1: 6, piso: 'piso-madeira', porta: { x: 4, y: 6 },
    postos: [posto(3, 3, null), posto(5, 3, null), posto(4, 2, null), posto(4, 4, null)],
    decoracao: [movel('movel-mesa-reuniao', 4, 3), movel('movel-planta', 1, 1), movel('movel-quadro', 7, 1), movel('movel-cadeira', 1, 5)],
  },
  copa: {
    id: 'copa', x0: 9, y0: 0, x1: 20, y1: 5, piso: 'piso-madeira', porta: { x: 14, y: 5 },
    postos: [posto(12, 3, null), posto(14, 3, null), posto(16, 3, null)],
    decoracao: [movel('movel-cafe', 11, 2), movel('movel-planta', 18, 2), movel('movel-planta', 18, 4), movel('movel-quadro', 10, 1)],
  },
  revisao: {
    id: 'revisao', x0: 21, y0: 0, x1: 29, y1: 6, piso: 'piso-carpete', porta: { x: 25, y: 6 },
    postos: [posto(23, 3, 'movel-mesa'), posto(25, 3, 'movel-mesa'), posto(27, 3, 'movel-mesa')],
    decoracao: [movel('movel-quadro', 22, 1), movel('movel-arquivo', 28, 1), movel('movel-planta', 28, 5)],
  },
  biblioteca: {
    id: 'biblioteca', x0: 0, y0: 9, x1: 6, y1: 17, piso: 'piso-carpete', porta: { x: 6, y: 12 },
    postos: [posto(2, 11, 'movel-mesa'), posto(4, 11, 'movel-mesa'), posto(2, 14, 'movel-mesa'), posto(4, 14, 'movel-mesa')],
    decoracao: [movel('movel-estante', 1, 10), movel('movel-estante', 5, 10), movel('movel-estante', 1, 16), movel('movel-planta', 5, 16)],
  },
  gabinete: {
    id: 'gabinete', x0: 22, y0: 9, x1: 29, y1: 13, piso: 'piso-carpete', porta: { x: 22, y: 11 },
    postos: [posto(23, 11, 'movel-mesa'), posto(24, 11, 'movel-mesa'), posto(26, 11, 'movel-mesa'), posto(27, 11, 'movel-mesa')],
    decoracao: [movel('movel-estante', 28, 10), movel('movel-planta', 28, 12), movel('movel-arquivo', 23, 12)],
  },
  recepcao: {
    id: 'recepcao', x0: 9, y0: 11, x1: 19, y1: 17, piso: 'piso-tapete', porta: { x: 14, y: 11 },
    postos: [
      posto(11, 13, 'movel-balcao'), posto(13, 13, 'movel-balcao'), posto(15, 13, 'movel-balcao'), posto(17, 13, 'movel-balcao'),
      posto(12, 15, 'movel-cadeira', 12, 16), posto(16, 15, 'movel-cadeira', 16, 16),
    ],
    decoracao: [movel('movel-planta', 10, 16), movel('movel-planta', 18, 16), movel('movel-quadro', 10, 12)],
  },
  cartorio: {
    id: 'cartorio', x0: 22, y0: 14, x1: 29, y1: 17, piso: 'piso-carpete', porta: { x: 22, y: 15 },
    postos: [posto(24, 16, 'movel-impressora'), posto(26, 16, 'movel-arquivo'), posto(28, 16, 'movel-balcao')],
    decoracao: [movel('movel-planta', 23, 16)],
  },
});

export const ORDEM_SALAS = Object.freeze(['recepcao', 'biblioteca', 'gabinete', 'revisao', 'cartorio', 'reunioes', 'copa']);

// Nós do grafo de caminhos: portas das salas e junções do corredor (em tiles).
export const NOS = Object.freeze({
  'corr-oeste': { x: 4, y: 8 },
  'ramal-oeste-topo': { x: 7, y: 8 },
  cruz: { x: 14, y: 8 },
  'ramal-leste-topo': { x: 21, y: 8 },
  'corr-leste': { x: 25, y: 8 },
  saguao: { x: 14, y: 10 },
  'ramal-oeste': { x: 7, y: 12 },
  'ramal-leste': { x: 21, y: 11 },
  'ramal-cartorio': { x: 21, y: 15 },
  'porta-reunioes': { x: 4, y: 6 },
  'porta-copa': { x: 14, y: 5 },
  'porta-revisao': { x: 25, y: 6 },
  'porta-biblioteca': { x: 6, y: 12 },
  'porta-recepcao': { x: 14, y: 11 },
  'porta-gabinete': { x: 22, y: 11 },
  'porta-cartorio': { x: 22, y: 15 },
});

export const ARESTAS = Object.freeze([
  ['corr-oeste', 'ramal-oeste-topo'],
  ['ramal-oeste-topo', 'cruz'],
  ['cruz', 'ramal-leste-topo'],
  ['ramal-leste-topo', 'corr-leste'],
  ['corr-oeste', 'porta-reunioes'],
  ['cruz', 'porta-copa'],
  ['corr-leste', 'porta-revisao'],
  ['ramal-oeste-topo', 'ramal-oeste'],
  ['ramal-oeste', 'porta-biblioteca'],
  ['cruz', 'saguao'],
  ['saguao', 'porta-recepcao'],
  ['ramal-leste-topo', 'ramal-leste'],
  ['ramal-leste', 'porta-gabinete'],
  ['ramal-leste', 'ramal-cartorio'],
  ['ramal-cartorio', 'porta-cartorio'],
]);

const VIZINHOS = (() => {
  const mapa = new Map(Object.keys(NOS).map((n) => [n, []]));
  for (const [a, b] of ARESTAS) {
    mapa.get(a).push(b);
    mapa.get(b).push(a);
  }
  return mapa;
})();

/** Nome do nó do grafo que fica na porta da sala. */
export function noDaSala(sala) {
  return `porta-${sala}`;
}

export function salaEm(x, y) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (const sala of Object.values(SALAS)) {
    if (cx >= sala.x0 && cx <= sala.x1 && cy >= sala.y0 && cy <= sala.y1) return sala.id;
  }
  return null;
}

export function ehPorta(x, y) {
  for (const sala of Object.values(SALAS)) {
    if (sala.porta.x === x && sala.porta.y === y) return true;
  }
  return false;
}

export function ehParede(x, y) {
  const id = salaEm(x, y);
  if (!id) return false;
  const s = SALAS[id];
  const borda = x === s.x0 || x === s.x1 || y === s.y0 || y === s.y1;
  return borda && !ehPorta(x, y);
}

/** Sprite de piso do tile, usado pelo render. */
export function tipoDePiso(x, y) {
  if (ehParede(x, y)) return 'piso-parede';
  if (ehPorta(x, y)) return 'piso-porta';
  const id = salaEm(x, y);
  return id ? SALAS[id].piso : 'piso-madeira';
}

/** Busca em largura no grafo de waypoints. Devolve nomes de nós, inclusive os extremos. */
export function caminhoEntreNos(origem, destino) {
  if (!VIZINHOS.has(origem) || !VIZINHOS.has(destino)) return [];
  if (origem === destino) return [origem];
  const anterior = new Map([[origem, null]]);
  const fila = [origem];
  while (fila.length) {
    const atual = fila.shift();
    for (const vizinho of VIZINHOS.get(atual)) {
      if (anterior.has(vizinho)) continue;
      anterior.set(vizinho, atual);
      if (vizinho === destino) {
        const caminho = [];
        for (let n = destino; n !== null; n = anterior.get(n)) caminho.unshift(n);
        return caminho;
      }
      fila.push(vizinho);
    }
  }
  return [];
}

/** Nó do grafo mais próximo de uma posição livre, para recalcular rota no meio do caminho. */
export function noMaisProximo(x, y) {
  const sala = salaEm(x, y);
  if (sala) return noDaSala(sala); // de dentro da sala, sempre pela própria porta
  let melhor = null;
  let menor = Infinity;
  for (const [nome, p] of Object.entries(NOS)) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < menor) {
      menor = d;
      melhor = nome;
    }
  }
  return melhor;
}

export function postosDaSala(sala) {
  return SALAS[sala]?.postos ?? [];
}

/** Posição em pé junto à porta, deslocada por índice, para quem não achou posto livre. */
export function posicaoJuntoAPorta(sala, indice) {
  const s = SALAS[sala];
  const dentro = s.porta.y === s.y0 ? 1 : s.porta.y === s.y1 ? -1 : 0;
  const lado = dentro === 0 ? (s.porta.x === s.x0 ? 1 : -1) : 0;
  const deslocamento = (indice % 3) - 1;
  const x = s.porta.x + (dentro === 0 ? lado : deslocamento);
  const y = s.porta.y + (dentro === 0 ? deslocamento : dentro);
  // Nunca em cima da parede: preso ao interior da sala.
  return {
    x: Math.min(Math.max(x, s.x0 + 1), s.x1 - 1),
    y: Math.min(Math.max(y, s.y0 + 1), s.y1 - 1),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/cliente-mundo.test.js`
Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public/mundo.js test/cliente-mundo.test.js
git commit -m "feat: planta do escritório com salas, postos e grafo de caminhos" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `public/fluxo-cliente.js` — redutor do SSE

**Files:**
- Create: `public/fluxo-cliente.js`
- Test: `test/cliente-fluxo.test.js`

**Interfaces:**
- Produces: `TIPOS`; `estadoInicial() → { seq: -1, advogados, estagiarios, salas, saude, crachas, temSnapshot, precisaReconectar, conectado }`; `aplicarMensagem(estado, tipo, dados) → novoEstado` (imutável: devolve o mesmo objeto quando não há mudança); `criarClienteFluxo({ criarFonte, aoEstado, aoErro }) → { estado, reconectar, fechar }`.
- Regras: `snapshot` substitui tudo e põe `conectado: true`; delta com `seq <= estado.seq` é descartado; `seq > estado.seq + 1` marca `precisaReconectar` sem aplicar; `remover` apaga por tipo e id; `saude` substitui o mapa (o servidor o emite a cada tique com saúde suja); o evento `error` do `EventSource` vira a mensagem local `erro`, que põe `conectado: false` sem descartar os dados (o mapa continua desenhado e o painel mostra "Sem conexão com o servidor" até o próximo snapshot).

- [ ] **Step 1: Escrever o teste**

`test/cliente-fluxo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoInicial, aplicarMensagem, criarClienteFluxo } from '../public/fluxo-cliente.js';

const snap = (seq = 0, extra = {}) => ({
  seq,
  advogados: [{ id: 'claude:s1', sala: 'recepcao', ultimaAtividade: 1 }],
  estagiarios: [],
  salas: [{ id: 'recepcao', rotulo: 'Recepção' }],
  saude: { claude: { eventos: 1 } },
  crachas: { clis: { claude: { cor: '#c2603e', sigla: 'CL' } }, padrao: { cor: '#8a8a8a', sigla: '??' } },
  ...extra,
});

test('snapshot substitui todo o estado', () => {
  const e = aplicarMensagem(estadoInicial(), 'snapshot', snap(7));
  assert.equal(e.seq, 7);
  assert.equal(e.temSnapshot, true);
  assert.equal(e.advogados.length, 1);
  assert.equal(e.crachas.clis.claude.sigla, 'CL');
  assert.equal(e.salas[0].rotulo, 'Recepção');
  const e2 = aplicarMensagem(e, 'snapshot', { seq: 9, advogados: [], estagiarios: [], salas: [], saude: {}, crachas: null });
  assert.equal(e2.seq, 9);
  assert.deepEqual(e2.advogados, []);
});

test('deltas substituem a entidade inteira e removem por id', () => {
  let e = aplicarMensagem(estadoInicial(), 'snapshot', snap(0));
  e = aplicarMensagem(e, 'advogado', { seq: 1, advogado: { id: 'claude:s1', sala: 'gabinete', ultimaAtividade: 2 } });
  assert.equal(e.seq, 1);
  assert.equal(e.advogados.length, 1);
  assert.equal(e.advogados[0].sala, 'gabinete');
  e = aplicarMensagem(e, 'advogado', { seq: 2, advogado: { id: 'codex:s2', sala: 'cartorio' } });
  assert.equal(e.advogados.length, 2);
  e = aplicarMensagem(e, 'estagiario', { seq: 3, estagiario: { id: 'claude:s1:a1', sala: 'reunioes' } });
  assert.equal(e.estagiarios.length, 1);
  e = aplicarMensagem(e, 'remover', { seq: 4, tipo: 'estagiario', id: 'claude:s1:a1' });
  assert.deepEqual(e.estagiarios, []);
  e = aplicarMensagem(e, 'remover', { seq: 5, tipo: 'advogado', id: 'claude:s1' });
  assert.deepEqual(e.advogados.map((a) => a.id), ['codex:s2']);
  e = aplicarMensagem(e, 'saude', { seq: 6, saude: { codex: { eventos: 3 } } });
  assert.deepEqual(e.saude, { codex: { eventos: 3 } });
  assert.equal(e.seq, 6);
});

test('delta atrasado é descartado e o estado não muda de identidade', () => {
  const base = aplicarMensagem(estadoInicial(), 'snapshot', snap(5));
  const igual = aplicarMensagem(base, 'advogado', { seq: 5, advogado: { id: 'x' } });
  assert.equal(igual, base);
  assert.equal(aplicarMensagem(base, 'advogado', { seq: 3, advogado: { id: 'x' } }), base);
  assert.equal(aplicarMensagem(base, 'tipoEstranho', { seq: 6 }), base);
  assert.equal(aplicarMensagem(estadoInicial(), 'advogado', { seq: 1, advogado: { id: 'x' } }).temSnapshot, false);
});

test('salto de seq marca precisaReconectar sem aplicar o delta', () => {
  const base = aplicarMensagem(estadoInicial(), 'snapshot', snap(5));
  const e = aplicarMensagem(base, 'advogado', { seq: 8, advogado: { id: 'codex:s9' } });
  assert.equal(e.precisaReconectar, true);
  assert.equal(e.seq, 5);
  assert.equal(e.advogados.length, 1);
});

test('erro de conexão põe conectado=false sem perder os dados; o snapshot seguinte religa', () => {
  assert.equal(estadoInicial().conectado, false);
  const base = aplicarMensagem(estadoInicial(), 'snapshot', snap(5));
  assert.equal(base.conectado, true);
  const caido = aplicarMensagem(base, 'erro');
  assert.equal(caido.conectado, false);
  assert.equal(caido.seq, 5);
  assert.equal(caido.advogados.length, 1, 'os dados ficam para o mapa continuar desenhado');
  assert.equal(aplicarMensagem(caido, 'erro'), caido, 'erro repetido não muda a identidade do estado');
  assert.equal(aplicarMensagem(caido, 'snapshot', snap(6)).conectado, true);
});

function fonteFalsa() {
  const ouvintes = new Map();
  return {
    fechada: false,
    addEventListener(tipo, fn) {
      ouvintes.set(tipo, fn);
    },
    close() {
      this.fechada = true;
    },
    emitir(tipo, dados) {
      ouvintes.get(tipo)?.({ data: JSON.stringify(dados) });
    },
    emitirBruto(tipo, texto) {
      ouvintes.get(tipo)?.({ data: texto });
    },
  };
}

test('cliente aplica mensagens, avisa a cada mudança e reabre a fonte no salto', () => {
  const fontes = [];
  const estados = [];
  const erros = [];
  const cliente = criarClienteFluxo({
    criarFonte: () => {
      const f = fonteFalsa();
      fontes.push(f);
      return f;
    },
    aoEstado: (e) => estados.push(e),
    aoErro: (m) => erros.push(m),
  });
  fontes[0].emitir('snapshot', snap(0));
  fontes[0].emitir('advogado', { seq: 1, advogado: { id: 'claude:s1', sala: 'biblioteca' } });
  assert.equal(estados.length, 2);
  assert.equal(cliente.estado.advogados[0].sala, 'biblioteca');
  assert.equal(cliente.estado.conectado, true);

  fontes[0].emitir('error');
  assert.equal(estados.length, 3, 'a queda é uma mudança de estado: o HUD precisa mostrar "sem conexão"');
  assert.equal(cliente.estado.conectado, false);
  assert.equal(cliente.estado.advogados.length, 1, 'os dados ficam até chegar o snapshot novo');
  assert.deepEqual(erros, ['fluxo caiu; o EventSource reconecta sozinho']);
  fontes[0].emitir('snapshot', snap(1)); // o EventSource reconectou sozinho e o servidor mandou snapshot novo
  assert.equal(cliente.estado.conectado, true);

  fontes[0].emitir('advogado', { seq: 9, advogado: { id: 'claude:s1', sala: 'copa' } });
  assert.equal(fontes.length, 2, 'deveria ter reaberto o EventSource');
  assert.equal(fontes[0].fechada, true);
  assert.equal(cliente.estado.temSnapshot, false);
  assert.equal(erros.length, 2);

  fontes[1].emitir('snapshot', snap(20));
  assert.equal(cliente.estado.seq, 20);
  cliente.fechar();
  assert.equal(fontes[1].fechada, true);
});

test('JSON inválido no fluxo vira aviso, não exceção', () => {
  const erros = [];
  let fonte;
  const cliente = criarClienteFluxo({
    criarFonte: () => {
      fonte = fonteFalsa();
      return fonte;
    },
    aoErro: (m) => erros.push(m),
  });
  assert.doesNotThrow(() => fonte.emitirBruto('snapshot', '{nope'));
  assert.deepEqual(erros, ['mensagem do fluxo com JSON inválido']);
  assert.equal(cliente.estado.temSnapshot, false);
  cliente.fechar();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/cliente-fluxo.test.js`
Expected: FAIL com `Cannot find module '../public/fluxo-cliente.js'`.

- [ ] **Step 3: Implementar `public/fluxo-cliente.js`**

```js
// Redutor do fluxo SSE: snapshot + deltas numerados, com detecção de salto de seq.
// Sem DOM: a fábrica do EventSource é injetada.

export const TIPOS = Object.freeze(['snapshot', 'advogado', 'estagiario', 'remover', 'saude']);

export function estadoInicial() {
  return Object.freeze({
    seq: -1,
    advogados: [],
    estagiarios: [],
    salas: [],
    saude: {},
    crachas: null,
    temSnapshot: false,
    precisaReconectar: false,
    conectado: false, // true a partir do snapshot; false no evento error do EventSource
  });
}

function substituir(lista, entidade) {
  const i = lista.findIndex((x) => x.id === entidade.id);
  if (i === -1) return [...lista, entidade];
  const copia = [...lista];
  copia[i] = entidade;
  return copia;
}

/** Aplica uma mensagem do fluxo e devolve o novo estado (nunca muda o anterior). */
export function aplicarMensagem(estado, tipo, dados) {
  // `erro` não vem do servidor: é o evento error do EventSource. Os dados ficam (o mapa segue
  // desenhado); só `conectado` cai, para o HUD avisar. O snapshot seguinte religa.
  if (tipo === 'erro') return estado.conectado ? { ...estado, conectado: false } : estado;
  if (!dados || typeof dados !== 'object') return estado;

  if (tipo === 'snapshot') {
    return {
      seq: Number.isInteger(dados.seq) ? dados.seq : 0,
      advogados: Array.isArray(dados.advogados) ? dados.advogados : [],
      estagiarios: Array.isArray(dados.estagiarios) ? dados.estagiarios : [],
      salas: Array.isArray(dados.salas) ? dados.salas : [],
      saude: dados.saude ?? {},
      crachas: dados.crachas ?? null,
      temSnapshot: true,
      precisaReconectar: false,
      conectado: true,
    };
  }

  if (!TIPOS.includes(tipo)) return estado;
  if (!estado.temSnapshot) return estado; // delta antes do snapshot: ignora
  if (!Number.isInteger(dados.seq)) return estado;
  if (dados.seq <= estado.seq) return estado; // atrasado: descarta
  if (dados.seq > estado.seq + 1) return { ...estado, precisaReconectar: true }; // salto: pede snapshot novo

  const base = { ...estado, seq: dados.seq };
  if (tipo === 'advogado' && dados.advogado?.id) return { ...base, advogados: substituir(estado.advogados, dados.advogado) };
  if (tipo === 'estagiario' && dados.estagiario?.id) return { ...base, estagiarios: substituir(estado.estagiarios, dados.estagiario) };
  if (tipo === 'remover' && dados.id) {
    if (dados.tipo === 'advogado') return { ...base, advogados: estado.advogados.filter((a) => a.id !== dados.id) };
    if (dados.tipo === 'estagiario') return { ...base, estagiarios: estado.estagiarios.filter((e) => e.id !== dados.id) };
    return base;
  }
  if (tipo === 'saude') return { ...base, saude: dados.saude ?? {} };
  return base;
}

/**
 * Liga o redutor a um EventSource. `criarFonte` devolve algo com
 * addEventListener(tipo, fn), onerror e close() — o EventSource do navegador serve.
 */
export function criarClienteFluxo({ criarFonte, aoEstado = () => {}, aoErro = () => {} }) {
  let estado = estadoInicial();
  let fonte = null;
  let vivo = true;

  function receber(tipo, texto) {
    let dados;
    try {
      dados = JSON.parse(texto);
    } catch {
      aoErro('mensagem do fluxo com JSON inválido');
      return;
    }
    const novo = aplicarMensagem(estado, tipo, dados);
    if (novo === estado) return;
    estado = novo;
    if (estado.precisaReconectar) {
      aoErro('salto de seq no fluxo; reabrindo a conexão');
      reconectar();
      return;
    }
    aoEstado(estado);
  }

  function abrir() {
    fonte = criarFonte();
    for (const tipo of TIPOS) fonte.addEventListener(tipo, (ev) => receber(tipo, ev.data));
    fonte.addEventListener('error', () => {
      aoErro('fluxo caiu; o EventSource reconecta sozinho');
      const novo = aplicarMensagem(estado, 'erro');
      if (novo === estado) return;
      estado = novo;
      aoEstado(estado);
    });
  }

  function reconectar() {
    try {
      fonte?.close();
    } catch {
      /* já fechado */
    }
    estado = estadoInicial();
    if (vivo) abrir();
  }

  abrir();

  return {
    get estado() {
      return estado;
    },
    reconectar,
    fechar() {
      vivo = false;
      try {
        fonte?.close();
      } catch {
        /* já fechado */
      }
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/cliente-fluxo.test.js`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public/fluxo-cliente.js test/cliente-fluxo.test.js
git commit -m "feat: redutor do fluxo SSE com descarte por seq e reconexão no salto" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `public/personagens.js` — elenco, postos, rotas e órbita

**Files:**
- Create: `public/personagens.js`
- Test: `test/cliente-personagens.test.js`

**Interfaces:**
- Consumes: `mundo.js` (`SALAS`, `caminhoEntreNos`, `noDaSala`, `noMaisProximo`, `NOS`, `salaEm`, `posicaoJuntoAPorta`).
- Produces: `LIMITE_ADVOGADOS = 24`, `LIMITE_ESTAGIARIOS = 6`, `VELOCIDADE_TILES_S = 3`, `DEBOUNCE_SALA_MS = 1000`, `RAIO_ORBITA = 1`; `ordenarPorAtividade(advogados)`; `criarElenco({ agora, reduzirMovimento }) → { sincronizar(estado) → { visiveis, foraDoMapa }, atualizar(dtMs), atores(), ator(id), postoDe(id), definirMovimentoReduzido(v), movimentoReduzido }`.
- Ator: `{ id, tipo, indice, entidade, cargo, cli, x, y, direcao, andando, fase, sala, posto, alvo, rota, aresta, noAtual, dono, orbitando }` (posições em tiles; `rota` é uma lista de `{ x, y, no? }`, com `no` nos pontos que são nós do grafo; `aresta = { de, para }` é a aresta do grafo que o ator está percorrendo, ou `null`).
- Regras: mapa com os 24 advogados de `ultimaAtividade` mais recente e até 6 estagiários por advogado (`foraDoMapa` lista só advogados: estagiário além do limite apenas não é desenhado); posto ocupado é o primeiro livre da sala e é devolvido ao sair; sem posto, fica em pé junto à porta com deslocamento por índice; troca de sala só depois de 1 s estável; rota recalculada sem andar para trás: no corredor parte do extremo da aresta atual que dá a caminhada mais curta até o destino (ou de `para`, se já passou da metade), dentro de uma sala parte da porta e, sem aresta, do nó mais próximo; estagiário sem atividade orbita o advogado (raio 1 tile, ângulo por índice); com `reduzirMovimento`, deslocamento instantâneo e `fase` sempre 0.

- [ ] **Step 1: Escrever o teste**

`test/cliente-personagens.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarElenco, ordenarPorAtividade, LIMITE_ADVOGADOS, LIMITE_ESTAGIARIOS, DEBOUNCE_SALA_MS, RAIO_ORBITA } from '../public/personagens.js';
import { SALAS, salaEm } from '../public/mundo.js';

const advogado = (id, extra = {}) => ({
  id, cli: 'claude', sessao: id, cargo: 'senior', sala: 'recepcao', estado: 'pensando',
  estagiarios: [], ultimaAtividade: 1000, atividade: null, ...extra,
});
const estagiario = (id, extra = {}) => ({ id, sessao: 's1', tipo: 'pesquisa', estado: 'pensando', sala: 'reunioes', atividade: null, ultimaAtividade: 1000, ...extra });

function relogio(inicio = 0) {
  let t = inicio;
  return { agora: () => t, avancar: (ms) => { t += ms; } };
}

test('o mapa mostra 24 advogados, os de atividade mais recente; o resto fica fora do mapa', () => {
  const advogados = [];
  for (let i = 0; i < 30; i += 1) advogados.push(advogado(`claude:s${i}`, { ultimaAtividade: i }));
  const elenco = criarElenco({ agora: () => 0 });
  const { visiveis, foraDoMapa } = elenco.sincronizar({ advogados, estagiarios: [] });
  assert.equal(visiveis.length, LIMITE_ADVOGADOS);
  assert.equal(foraDoMapa.length, 6);
  assert.equal(visiveis[0], 'claude:s29');
  assert.deepEqual(foraDoMapa.sort(), ['claude:s0', 'claude:s1', 'claude:s2', 'claude:s3', 'claude:s4', 'claude:s5']);
  assert.equal(elenco.atores().length, LIMITE_ADVOGADOS);
  assert.deepEqual(ordenarPorAtividade(advogados)[0].id, 'claude:s29');
});

test('no máximo 6 estagiários por advogado entram no mapa', () => {
  const ids = [];
  const estagiarios = [];
  for (let i = 0; i < 8; i += 1) {
    ids.push(`claude:s1:a${i}`);
    estagiarios.push(estagiario(`claude:s1:a${i}`));
  }
  const elenco = criarElenco({ agora: () => 0 });
  const { foraDoMapa } = elenco.sincronizar({ advogados: [advogado('claude:s1', { estagiarios: ids })], estagiarios });
  const noMapa = elenco.atores().filter((a) => a.tipo === 'estagiario');
  assert.equal(noMapa.length, LIMITE_ESTAGIARIOS);
  assert.deepEqual(noMapa.map((a) => a.id).sort(), ['claude:s1:a0', 'claude:s1:a1', 'claude:s1:a2', 'claude:s1:a3', 'claude:s1:a4', 'claude:s1:a5']);
  assert.deepEqual(foraDoMapa, [], 'foraDoMapa lista só advogados: estagiário além do limite apenas não é desenhado');
});

test('postos: cada um pega o primeiro livre e libera ao sair; sem posto fica em pé na sala', () => {
  const elenco = criarElenco({ agora: () => 0, reduzirMovimento: true });
  const advogados = [];
  for (let i = 0; i < 4; i += 1) advogados.push(advogado(`claude:s${i}`, { sala: 'cartorio', ultimaAtividade: 100 - i }));
  elenco.sincronizar({ advogados, estagiarios: [] });
  const postos = advogados.map((a) => elenco.postoDe(a.id));
  assert.deepEqual(postos.slice(0, 3), [0, 1, 2]);
  assert.equal(postos[3], null, 'o quarto não tem posto no cartório (só 3)');
  const emPe = elenco.ator('claude:s3');
  assert.equal(salaEm(emPe.x, emPe.y), 'cartorio');

  // o primeiro sai: o posto 0 volta a ficar livre para quem chegar depois
  elenco.sincronizar({ advogados: advogados.slice(1), estagiarios: [] });
  elenco.sincronizar({ advogados: [...advogados.slice(1), advogado('claude:s9', { sala: 'cartorio', ultimaAtividade: 1 })], estagiarios: [] });
  assert.equal(elenco.postoDe('claude:s9'), 0);
});

test('troca de sala só vale depois de 1 s estável (debounce)', () => {
  const r = relogio(10_000);
  const elenco = criarElenco({ agora: r.agora, reduzirMovimento: true });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'recepcao' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'recepcao');

  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'recepcao', 'não muda na primeira leitura');
  r.avancar(DEBOUNCE_SALA_MS - 100);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'recepcao', 'ainda dentro do debounce');
  r.avancar(200);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'biblioteca');

  // chamada curtíssima: volta antes de 1 s e nada acontece
  r.avancar(100);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'cartorio' })], estagiarios: [] });
  r.avancar(100);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  r.avancar(2000);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'biblioteca');
});

test('movimento a 3 tiles por segundo, com espelhamento pela direção', () => {
  const r = relogio(0);
  const elenco = criarElenco({ agora: r.agora });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'recepcao' })], estagiarios: [] });
  const ator = elenco.ator('claude:s1');
  ator.x = 10;
  ator.y = 13;
  ator.rota = [{ x: 16, y: 13 }];
  elenco.atualizar(500);
  assert.ok(Math.abs(ator.x - 11.5) < 1e-9, `andou ${ator.x - 10} tiles em 0,5 s`);
  assert.equal(ator.andando, true);
  assert.equal(ator.direcao, 1);
  ator.rota = [{ x: 10, y: 13 }];
  elenco.atualizar(500);
  assert.equal(ator.direcao, -1);
  elenco.atualizar(10_000);
  assert.equal(ator.andando, false);
  assert.deepEqual([ator.x, ator.y], [10, 13]);
});

test('mudança de destino no meio do caminho recalcula da posição atual sem andar para trás', () => {
  const r = relogio(0);
  const elenco = criarElenco({ agora: r.agora });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'recepcao' })], estagiarios: [] });
  const ator = elenco.ator('claude:s1');
  elenco.atualizar(5000); // chega no posto da recepção

  r.avancar(1);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'revisao' })], estagiarios: [] });
  r.avancar(DEBOUNCE_SALA_MS);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'revisao' })], estagiarios: [] });
  elenco.atualizar(1800); // sai da recepção, passa pelo saguão (14,10) e sobe o eixo central rumo ao cruzamento (14,8)
  const meio = { x: ator.x, y: ator.y };
  assert.equal(salaEm(meio.x, meio.y), null, 'deveria estar no corredor');
  assert.ok(Math.abs(meio.x - 14) < 1e-9 && Math.abs(meio.y - 9.2) < 0.02, `esperava (14, 9.2), veio (${meio.x}, ${meio.y})`);
  assert.deepEqual(ator.aresta, { de: 'saguao', para: 'cruz' });

  r.avancar(1);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'cartorio' })], estagiarios: [] });
  r.avancar(DEBOUNCE_SALA_MS);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'cartorio' })], estagiarios: [] });
  assert.deepEqual({ x: ator.x, y: ator.y }, meio, 'não pode teleportar ao recalcular');
  assert.equal(ator.sala, 'cartorio');
  // O nó mais próximo em linha reta é o saguão (14,10), atrás dele; a rota nova parte do cruzamento (14,8), à frente.
  assert.equal(ator.rota[0].no, 'cruz');
  elenco.atualizar(100);
  assert.ok(ator.y < meio.y, `deveria seguir subindo, mas foi de y=${meio.y} para y=${ator.y}`);
  elenco.atualizar(30_000);
  assert.equal(salaEm(ator.x, ator.y), 'cartorio');
  assert.deepEqual({ x: ator.x, y: ator.y }, { x: SALAS.cartorio.postos[0].x, y: SALAS.cartorio.postos[0].y });
});

test('com movimento reduzido o deslocamento é instantâneo e sem balanço', () => {
  const elenco = criarElenco({ agora: () => 0, reduzirMovimento: true });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'gabinete' })], estagiarios: [] });
  const ator = elenco.ator('claude:s1');
  assert.deepEqual({ x: ator.x, y: ator.y }, { x: SALAS.gabinete.postos[0].x, y: SALAS.gabinete.postos[0].y });
  elenco.atualizar(16);
  assert.equal(ator.fase, 0);
  assert.equal(ator.andando, false);
});

test('estagiário sem atividade orbita o advogado; com atividade caminha para a sala dela', () => {
  const r = relogio(0);
  const elenco = criarElenco({ agora: r.agora, reduzirMovimento: true });
  const estado = {
    advogados: [advogado('claude:s1', { sala: 'gabinete', estagiarios: ['claude:s1:a0', 'claude:s1:a1'] })],
    estagiarios: [estagiario('claude:s1:a0'), estagiario('claude:s1:a1')],
  };
  elenco.sincronizar(estado);
  elenco.atualizar(16);
  const dono = elenco.ator('claude:s1');
  for (const id of ['claude:s1:a0', 'claude:s1:a1']) {
    const filho = elenco.ator(id);
    const d = Math.hypot(filho.x - dono.x, (filho.y - dono.y) / 0.6);
    assert.ok(Math.abs(d - RAIO_ORBITA) < 1e-9, `${id} deveria orbitar a 1 tile`);
  }
  assert.notDeepEqual(
    { x: elenco.ator('claude:s1:a0').x, y: elenco.ator('claude:s1:a0').y },
    { x: elenco.ator('claude:s1:a1').x, y: elenco.ator('claude:s1:a1').y },
  );

  const comAtividade = {
    advogados: estado.advogados,
    estagiarios: [estagiario('claude:s1:a0', { sala: 'biblioteca', atividade: { nome: 'Grep', detalhe: 'reclamação' } }), estado.estagiarios[1]],
  };
  r.avancar(1);
  elenco.sincronizar(comAtividade);
  r.avancar(DEBOUNCE_SALA_MS);
  elenco.sincronizar(comAtividade);
  elenco.atualizar(16);
  const andarilho = elenco.ator('claude:s1:a0');
  assert.equal(andarilho.orbitando, false);
  assert.equal(salaEm(andarilho.x, andarilho.y), 'biblioteca');
});

test('advogado que some do estado sai do elenco e devolve o posto', () => {
  const elenco = criarElenco({ agora: () => 0, reduzirMovimento: true });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'revisao' })], estagiarios: [] });
  assert.equal(elenco.postoDe('claude:s1'), 0);
  elenco.sincronizar({ advogados: [], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1'), null);
  elenco.sincronizar({ advogados: [advogado('codex:s2', { sala: 'revisao' })], estagiarios: [] });
  assert.equal(elenco.postoDe('codex:s2'), 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/cliente-personagens.test.js`
Expected: FAIL com `Cannot find module '../public/personagens.js'`.

- [ ] **Step 3: Implementar `public/personagens.js`**

```js
// Elenco: quem aparece no mapa, em que posto, andando por onde.
// Sem DOM: relógio injetado, posições em tiles.

import { SALAS, caminhoEntreNos, noDaSala, noMaisProximo, NOS, salaEm, posicaoJuntoAPorta } from './mundo.js';

export const LIMITE_ADVOGADOS = 24;
export const LIMITE_ESTAGIARIOS = 6;
export const VELOCIDADE_TILES_S = 3;
export const DEBOUNCE_SALA_MS = 1000;
export const RAIO_ORBITA = 1;

export function ordenarPorAtividade(advogados) {
  return [...advogados].sort((a, b) => (b.ultimaAtividade ?? 0) - (a.ultimaAtividade ?? 0) || a.id.localeCompare(b.id));
}

/** Comprimento, em tiles, de um caminho de nós do grafo; caminho vazio (sem ligação) conta como infinito. */
function comprimento(nomes) {
  if (!nomes.length) return Infinity;
  let total = 0;
  for (let i = 1; i < nomes.length; i += 1) {
    total += Math.hypot(NOS[nomes[i]].x - NOS[nomes[i - 1]].x, NOS[nomes[i]].y - NOS[nomes[i - 1]].y);
  }
  return total;
}

export function criarElenco({ agora = () => Date.now(), reduzirMovimento = false } = {}) {
  const atores = new Map(); // id → ator
  const ocupacao = new Map(); // sala → Map(indice do posto → id do ator)
  let movimentoReduzido = reduzirMovimento;

  const mapaDaSala = (sala) => {
    if (!ocupacao.has(sala)) ocupacao.set(sala, new Map());
    return ocupacao.get(sala);
  };

  function liberarPosto(ator) {
    if (ator.sala && ator.posto !== null) {
      const mapa = mapaDaSala(ator.sala);
      if (mapa.get(ator.posto) === ator.id) mapa.delete(ator.posto);
    }
    ator.posto = null;
  }

  function ocuparPosto(ator, sala) {
    const mapa = mapaDaSala(sala);
    const postos = SALAS[sala]?.postos ?? [];
    for (let i = 0; i < postos.length; i += 1) {
      if (!mapa.has(i)) {
        mapa.set(i, ator.id);
        ator.posto = i;
        return { ...postos[i] };
      }
    }
    ator.posto = null;
    return { ...posicaoJuntoAPorta(sala, ator.indice), movel: null, emPe: true };
  }

  /**
   * Nó por onde a rota nova começa. No corredor o ator está sobre uma aresta (`de` → `para`) do
   * grafo: partir do nó mais próximo em linha reta o faria voltar pela aresta. Então parte do
   * extremo que dá a caminhada mais curta até `chegada` (distância até o extremo + caminho no
   * grafo), ou de `para` se já passou da metade (sem meia-volta por pouco). Dentro de uma sala só
   * se sai pela porta; sem aresta (parado num nó, ou rota montada à mão), vale o nó mais próximo.
   */
  function noDePartida(ator, chegada) {
    const salaAtual = salaEm(ator.x, ator.y);
    if (salaAtual) return noDaSala(salaAtual);
    const { aresta } = ator;
    if (!aresta || !NOS[aresta.de] || !NOS[aresta.para]) return noMaisProximo(ator.x, ator.y);
    const de = NOS[aresta.de];
    const para = NOS[aresta.para];
    const percorrido = Math.hypot(ator.x - de.x, ator.y - de.y);
    const total = Math.hypot(para.x - de.x, para.y - de.y);
    if (percorrido >= total / 2) return aresta.para;
    const caminhada = (no) => Math.hypot(NOS[no].x - ator.x, NOS[no].y - ator.y) + comprimento(caminhoEntreNos(no, chegada));
    return caminhada(aresta.para) <= caminhada(aresta.de) ? aresta.para : aresta.de;
  }

  function definirRota(ator, salaNova) {
    liberarPosto(ator);
    ator.sala = salaNova;
    const alvo = ocuparPosto(ator, salaNova);
    ator.alvo = alvo;
    const destino = { x: alvo.x, y: alvo.y };
    if (movimentoReduzido) {
      ator.x = destino.x;
      ator.y = destino.y;
      ator.rota = [];
      ator.aresta = null;
      ator.andando = false;
      return;
    }
    if (salaEm(ator.x, ator.y) === salaNova) {
      ator.rota = [destino];
      return;
    }
    const chegada = noDaSala(salaNova);
    const nos = caminhoEntreNos(noDePartida(ator, chegada), chegada);
    const pontos = nos.length ? nos.map((n) => ({ ...NOS[n], no: n })) : [{ ...SALAS[salaNova].porta, no: chegada }];
    ator.rota = [...pontos, destino];
  }

  function criarAtor(id, tipo, entidade, indice) {
    const sala = SALAS[entidade.sala] ? entidade.sala : 'recepcao';
    const inicio = { ...SALAS[sala].porta };
    const ator = {
      id,
      tipo,
      indice,
      entidade,
      cargo: tipo === 'estagiario' ? 'estagiario' : entidade.cargo ?? 'advogado',
      cli: entidade.cli ?? null,
      x: inicio.x,
      y: inicio.y,
      direcao: 1,
      andando: false,
      fase: 0,
      sala: null,
      posto: null,
      alvo: null,
      rota: [],
      aresta: null,
      noAtual: null,
      salaPendente: null,
      desdePendente: 0,
      dono: null,
      orbitando: false,
    };
    atores.set(id, ator);
    definirRota(ator, sala);
    return ator;
  }

  function pedirSala(ator, salaDesejada) {
    const sala = SALAS[salaDesejada] ? salaDesejada : 'recepcao';
    if (sala === ator.sala) {
      ator.salaPendente = null;
      return;
    }
    if (ator.salaPendente !== sala) {
      ator.salaPendente = sala;
      ator.desdePendente = agora();
      return;
    }
    if (agora() - ator.desdePendente >= DEBOUNCE_SALA_MS) {
      ator.salaPendente = null;
      definirRota(ator, sala);
    }
  }

  function remover(id) {
    const ator = atores.get(id);
    if (!ator) return;
    liberarPosto(ator);
    atores.delete(id);
  }

  /** Reconcilia o elenco com o estado do fluxo. Devolve os advogados que ficaram fora do mapa. */
  function sincronizar(estado) {
    const ordenados = ordenarPorAtividade(estado.advogados ?? []);
    const visiveis = ordenados.slice(0, LIMITE_ADVOGADOS);
    const foraDoMapa = ordenados.slice(LIMITE_ADVOGADOS).map((a) => a.id);
    const porId = new Map((estado.estagiarios ?? []).map((e) => [e.id, e]));
    const vivos = new Set();

    visiveis.forEach((advogado, indice) => {
      vivos.add(advogado.id);
      let ator = atores.get(advogado.id);
      if (!ator) ator = criarAtor(advogado.id, 'advogado', advogado, indice);
      ator.entidade = advogado;
      ator.indice = indice;
      ator.cargo = advogado.cargo ?? 'advogado';
      ator.cli = advogado.cli ?? null;
      pedirSala(ator, advogado.sala);

      // Filtra uma vez só; quem passa do limite apenas não é desenhado (foraDoMapa lista advogados).
      const conhecidos = (advogado.estagiarios ?? []).filter((id) => porId.has(id));
      conhecidos.slice(0, LIMITE_ESTAGIARIOS).forEach((id, i) => {
        const estagiario = porId.get(id);
        vivos.add(id);
        let filho = atores.get(id);
        if (!filho) filho = criarAtor(id, 'estagiario', estagiario, i);
        filho.entidade = estagiario;
        filho.indice = i;
        filho.dono = advogado.id;
        filho.cli = advogado.cli ?? null;
        filho.orbitando = !estagiario.atividade;
        if (filho.orbitando) {
          liberarPosto(filho);
          filho.sala = estagiario.sala ?? filho.sala;
          filho.rota = [];
          filho.aresta = null;
          filho.salaPendente = null;
        } else {
          pedirSala(filho, estagiario.sala);
        }
      });
    });

    for (const id of [...atores.keys()]) if (!vivos.has(id)) remover(id);
    return { visiveis: visiveis.map((a) => a.id), foraDoMapa };
  }

  /** Chegou num ponto da rota: se for nó do grafo, vira o nó atual; a aresta em curso acaba. */
  function chegarEm(ator, ponto) {
    ator.rota.shift();
    if (ponto.no) ator.noAtual = ponto.no;
    ator.aresta = null;
  }

  function avancar(ator, passo) {
    let restante = passo;
    ator.andando = false;
    while (restante > 0 && ator.rota.length) {
      const alvo = ator.rota[0];
      const dx = alvo.x - ator.x;
      const dy = alvo.y - ator.y;
      const distancia = Math.hypot(dx, dy);
      if (distancia <= 1e-6) {
        chegarEm(ator, alvo);
        continue;
      }
      ator.andando = true;
      if (alvo.no) ator.aresta = { de: ator.noAtual, para: alvo.no }; // aresta do grafo em curso
      if (Math.abs(dx) > 1e-6) ator.direcao = dx > 0 ? 1 : -1;
      if (distancia <= restante) {
        ator.x = alvo.x;
        ator.y = alvo.y;
        restante -= distancia;
        chegarEm(ator, alvo);
      } else {
        ator.x += (dx / distancia) * restante;
        ator.y += (dy / distancia) * restante;
        restante = 0;
      }
    }
  }

  function orbitar(ator) {
    const dono = atores.get(ator.dono);
    if (!dono) return;
    const angulo = (Math.PI * 2 * ator.indice) / LIMITE_ESTAGIARIOS;
    ator.x = dono.x + Math.cos(angulo) * RAIO_ORBITA;
    ator.y = dono.y + Math.sin(angulo) * RAIO_ORBITA * 0.6;
    ator.andando = false;
    ator.direcao = dono.direcao;
  }

  /** Avança a animação em `dtMs` milissegundos. */
  function atualizar(dtMs) {
    const passo = (VELOCIDADE_TILES_S * dtMs) / 1000;
    for (const ator of atores.values()) {
      if (ator.tipo === 'estagiario' && ator.orbitando) {
        orbitar(ator);
      } else {
        avancar(ator, passo);
      }
      ator.fase = movimentoReduzido ? 0 : (ator.fase + dtMs) % 100000;
    }
  }

  return {
    sincronizar,
    atualizar,
    atores: () => [...atores.values()],
    ator: (id) => atores.get(id) ?? null,
    postoDe: (id) => atores.get(id)?.posto ?? null,
    definirMovimentoReduzido(valor) {
      movimentoReduzido = Boolean(valor);
    },
    get movimentoReduzido() {
      return movimentoReduzido;
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/cliente-personagens.test.js`
Expected: `# pass 9`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public/personagens.js test/cliente-personagens.test.js
git commit -m "feat: elenco com postos, debounce de sala, rotas e órbita dos estagiários" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `public/cores.js` e `public/hud-util.js` — cores, agrupamento, formatação, saúde e escala

**Files:**
- Create: `public/cores.js`, `public/hud-util.js`
- Test: `test/cliente-hud-util.test.js`

**Interfaces:**
- `cores.js` produz `CORES = { cargo: {...}, sala: {...}, piso: {...}, saude: { ok, semEventos, erro }, crachaPadrao, fundo, texto, balao }` (congelado). É o único lugar com cor de entidade: `hud-util.js`, `render.js` e `hud.js` importam daqui; `estilo.css` fica só com o chrome do HUD.
- `hud-util.js` produz `JANELA_SAUDE_MS`, `CRACHA_PADRAO` (cor de `CORES.crachaPadrao`), `LARGURA_PAINEL = 290`, `ALTURA_BARRA = 48`; `truncar(texto, max = 24)`; `agruparPorProjeto(advogados) → [{ projetoId, rotulo, advogados }]` (rótulos repetidos ganham o diretório pai); `contarPorCli`; `crachaDe(crachas, cli)`; `corDaSaude(saude, agora) → 'verde' | 'cinza' | 'vermelho'`; `linhasDeSaude(saude, agora)`; `formatarTokens(tokens, i18n) → { contexto, proporcao, saida } | null`; `descreverAtividade(atividade, max)`; `estagiariosDe(estado, advogado)`; `escalaDaTela({ larguraJanela, alturaJanela, painelAberto }) → número` (pode ser menor que 1).
- Saúde: vermelho quando `rejeitadosPorTamanho > 0` ou `invalidos > 0`; cinza sem eventos ou com evento de mais de 5 min; verde no resto.
- Escala: `min((larguraJanela − (painel aberto ? 290 : 0)) / 960, (alturaJanela − 48) / 576)`, nunca abaixo de 0,2.

- [ ] **Step 1: Escrever o teste**

`test/cliente-hud-util.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncar, agruparPorProjeto, contarPorCli, crachaDe, corDaSaude, linhasDeSaude, formatarTokens, descreverAtividade, estagiariosDe, escalaDaTela, CRACHA_PADRAO, LARGURA_PAINEL, ALTURA_BARRA } from '../public/hud-util.js';
import { CORES } from '../public/cores.js';
import { criarI18n } from '../public/i18n.js';

const i18n = criarI18n('pt-BR');

test('truncar corta com reticências e respeita o limite', () => {
  assert.equal(truncar('curto'), 'curto');
  assert.equal(truncar('a'.repeat(30)), `${'a'.repeat(23)}…`);
  assert.equal(truncar('a'.repeat(30)).length, 24);
  assert.equal(truncar(null), '');
  assert.equal(truncar('abcdef', 3), 'ab…');
});

test('agruparPorProjeto junta por projetoId e desambigua rótulos iguais com o diretório pai', () => {
  const grupos = agruparPorProjeto([
    { id: 'a', projetoId: '/casa/dev/site', projeto: 'site' },
    { id: 'b', projetoId: '/casa/dev/site', projeto: 'site' },
    { id: 'c', projetoId: '/trabalho/cliente/site', projeto: 'site' },
    { id: 'd', projetoId: '/casa/dev/escritorio', projeto: 'escritorio' },
  ]);
  assert.equal(grupos.length, 3);
  assert.deepEqual(grupos.map((g) => g.rotulo), ['dev/site', 'cliente/site', 'escritorio']);
  assert.deepEqual(grupos[0].advogados.map((a) => a.id), ['a', 'b']);
});

test('contarPorCli ordena por quantidade e depois por nome', () => {
  assert.deepEqual(
    contarPorCli([{ cli: 'codex' }, { cli: 'claude' }, { cli: 'claude' }, { cli: 'grok' }]),
    [{ cli: 'claude', quantidade: 2 }, { cli: 'codex', quantidade: 1 }, { cli: 'grok', quantidade: 1 }],
  );
});

test('crachaDe usa o mapa do snapshot e cai no padrão', () => {
  const crachas = { clis: { claude: { cor: '#c2603e', sigla: 'CL' } }, padrao: { cor: '#8a8a8a', sigla: '??' } };
  assert.deepEqual(crachaDe(crachas, 'claude'), { cor: '#c2603e', sigla: 'CL' });
  assert.deepEqual(crachaDe(crachas, 'copilot'), { cor: '#8a8a8a', sigla: '??' });
  assert.deepEqual(crachaDe(null, 'claude'), CRACHA_PADRAO);
});

test('corDaSaude: verde recente, cinza sem eventos ou antigo, vermelho com rejeição', () => {
  const agora = Date.parse('2026-09-21T12:00:00.000Z');
  const iso = (msAtras) => new Date(agora - msAtras).toISOString();
  assert.equal(corDaSaude({ ultimoEvento: iso(60_000), eventos: 3 }, agora), 'verde');
  assert.equal(corDaSaude({ ultimoEvento: iso(10 * 60_000), eventos: 3 }, agora), 'cinza');
  assert.equal(corDaSaude({ ultimoEvento: null, eventos: 0 }, agora), 'cinza');
  assert.equal(corDaSaude({ ultimoEvento: iso(1000), eventos: 3, invalidos: 1 }, agora), 'vermelho');
  assert.equal(corDaSaude({ ultimoEvento: iso(1000), eventos: 3, rejeitadosPorTamanho: 2 }, agora), 'vermelho');
  assert.equal(corDaSaude(undefined, agora), 'cinza');
  const linhas = linhasDeSaude({ grok: { ultimoEvento: null, eventos: 0 }, claude: { ultimoEvento: iso(1000), eventos: 5 } }, agora);
  assert.deepEqual(linhas.map((l) => [l.cli, l.cor]), [['claude', 'verde'], ['grok', 'cinza']]);
});

test('formatarTokens mostra janela, proporção e saída estimada', () => {
  assert.deepEqual(formatarTokens({ contexto: 12400, janela: 200000, saida: 3200, saidaEstimada: true }, i18n), {
    contexto: '12.400 / 200.000', proporcao: 0.062, saida: '≈ 3.200',
  });
  assert.deepEqual(formatarTokens({ contexto: 900, janela: null, saida: 0, saidaEstimada: false }, i18n), {
    contexto: '900 (janela desconhecida)', proporcao: null, saida: null,
  });
  assert.equal(formatarTokens({ contexto: null, janela: null, saida: 0, saidaEstimada: false }, i18n), null);
  assert.equal(formatarTokens(null, i18n), null);
});

test('descreverAtividade junta nome e detalhe truncado', () => {
  assert.equal(descreverAtividade({ nome: 'Read', detalhe: 'src/app.js' }), 'Read · src/app.js');
  assert.equal(descreverAtividade({ nome: 'Bash', detalhe: 'x'.repeat(40) }), `Bash · ${'x'.repeat(23)}…`);
  assert.equal(descreverAtividade({ nome: 'Write', detalhe: null }), 'Write');
  assert.equal(descreverAtividade(null), null);
});

test('estagiariosDe filtra pelos ids do advogado', () => {
  const estado = { estagiarios: [{ id: 'a1' }, { id: 'a2' }, { id: 'b1' }] };
  assert.deepEqual(estagiariosDe(estado, { estagiarios: ['a1', 'b1'] }).map((e) => e.id), ['a1', 'b1']);
  assert.deepEqual(estagiariosDe(estado, { estagiarios: [] }), []);
  assert.deepEqual(estagiariosDe({}, undefined), []);
});

test('cores.js: todo cargo, sala, piso e estado de saúde tem cor hexadecimal, e nada muda em runtime', () => {
  const hex = /^#[0-9a-f]{6}$/;
  for (const cargo of ['socio', 'senior', 'associado', 'junior', 'advogado', 'estagiario']) assert.match(CORES.cargo[cargo] ?? '', hex, `cargo ${cargo}`);
  for (const sala of ['recepcao', 'biblioteca', 'gabinete', 'revisao', 'cartorio', 'reunioes', 'copa']) assert.match(CORES.sala[sala] ?? '', hex, `sala ${sala}`);
  for (const piso of ['piso-madeira', 'piso-carpete', 'piso-parede', 'piso-porta', 'piso-tapete']) assert.match(CORES.piso[piso] ?? '', hex, `piso ${piso}`);
  for (const estado of ['ok', 'semEventos', 'erro']) assert.match(CORES.saude[estado] ?? '', hex, `saúde ${estado}`);
  for (const chave of ['crachaPadrao', 'fundo', 'texto', 'balao']) assert.match(CORES[chave] ?? '', hex, chave);
  assert.equal(CRACHA_PADRAO.cor, CORES.crachaPadrao);
  assert.ok(Object.isFrozen(CORES) && Object.isFrozen(CORES.cargo) && Object.isFrozen(CORES.saude));
});

test('escalaDaTela desconta a barra e o painel aberto e aceita escala menor que 1', () => {
  assert.equal(LARGURA_PAINEL, 290);
  assert.equal(ALTURA_BARRA, 48);
  assert.equal(escalaDaTela({ larguraJanela: 1920, alturaJanela: 1200, painelAberto: false }), 2);
  assert.equal(escalaDaTela({ larguraJanela: 1250, alturaJanela: 1000, painelAberto: true }), 1);
  assert.equal(escalaDaTela({ larguraJanela: 800, alturaJanela: 700, painelAberto: false }), 800 / 960);
  assert.ok(escalaDaTela({ larguraJanela: 800, alturaJanela: 700, painelAberto: true }) < 800 / 960, 'painel aberto tira largura do canvas');
  assert.equal(escalaDaTela({ larguraJanela: 1000, alturaJanela: 336, painelAberto: false }), 0.5);
  assert.equal(escalaDaTela({ larguraJanela: 100, alturaJanela: 100, painelAberto: true }), 0.2, 'janela minúscula não zera nem inverte o canvas');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/cliente-hud-util.test.js`
Expected: FAIL com `Cannot find module '../public/hud-util.js'`.

- [ ] **Step 3: Implementar `public/cores.js`**

```js
// Cores das entidades num único lugar. Placeholders (render), pontos de saúde e crachá (HUD)
// importam daqui; estilo.css fica só com o chrome do HUD (fundo da página, bordas, fontes).

export const CORES = Object.freeze({
  cargo: Object.freeze({
    socio: '#25324f',
    senior: '#3d3f44',
    associado: '#6d6f75',
    junior: '#a8aab0',
    advogado: '#87898f',
    estagiario: '#3f7d52',
  }),
  sala: Object.freeze({
    recepcao: '#8a6f4a',
    biblioteca: '#46698c',
    gabinete: '#7b5b8c',
    revisao: '#8c5b5b',
    cartorio: '#5b8c74',
    reunioes: '#8c7b46',
    copa: '#468c83',
  }),
  piso: Object.freeze({
    'piso-madeira': '#3a3228',
    'piso-carpete': '#2f3a3a',
    'piso-parede': '#1d1b17',
    'piso-porta': '#6b563a',
    'piso-tapete': '#4a3a30',
  }),
  // Ponto de saúde na barra: corDaSaude (hud-util) devolve verde/cinza/vermelho → ok/semEventos/erro.
  saude: Object.freeze({ ok: '#3fa45b', semEventos: '#6b6b6b', erro: '#c2483e' }),
  crachaPadrao: '#8a8a8a',
  fundo: '#17150f',
  texto: '#e8e2d2',
  balao: '#26241c',
});
```

- [ ] **Step 4: Implementar `public/hud-util.js`**

```js
// Cálculos do HUD sem tocar no DOM: agrupamento, formatação, saúde e escala do canvas.

import { LARGURA, ALTURA } from './mundo.js';
import { CORES } from './cores.js';

export const JANELA_SAUDE_MS = 5 * 60 * 1000;
export const CRACHA_PADRAO = Object.freeze({ cor: CORES.crachaPadrao, sigla: '??' });
export const LARGURA_PAINEL = 290; // estilo.css: --largura-painel
export const ALTURA_BARRA = 48; // estilo.css: --altura-barra

export function truncar(texto, max = 24) {
  const s = String(texto ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Agrupa por projetoId; rótulos repetidos ganham o diretório pai para desambiguar. */
export function agruparPorProjeto(advogados) {
  const grupos = new Map();
  for (const advogado of advogados) {
    const chave = advogado.projetoId ?? '';
    if (!grupos.has(chave)) {
      grupos.set(chave, { projetoId: advogado.projetoId ?? null, rotulo: advogado.projeto ?? '', advogados: [] });
    }
    grupos.get(chave).advogados.push(advogado);
  }
  const lista = [...grupos.values()];
  const repetidos = new Map();
  for (const g of lista) repetidos.set(g.rotulo, (repetidos.get(g.rotulo) ?? 0) + 1);
  for (const g of lista) {
    if (repetidos.get(g.rotulo) > 1 && g.projetoId) {
      const partes = g.projetoId.split('/').filter(Boolean);
      g.rotulo = partes.slice(-2).join('/');
    }
  }
  return lista;
}

export function contarPorCli(advogados) {
  const contagem = new Map();
  for (const a of advogados) contagem.set(a.cli, (contagem.get(a.cli) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([cli, quantidade]) => ({ cli, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.cli.localeCompare(b.cli));
}

export function crachaDe(crachas, cli) {
  return crachas?.clis?.[cli] ?? crachas?.padrao ?? CRACHA_PADRAO;
}

/** verde: evento há menos de 5 min; vermelho: rejeições ou inválidos; cinza: o resto. */
export function corDaSaude(saude, agora = Date.now()) {
  if (!saude) return 'cinza';
  if ((saude.rejeitadosPorTamanho ?? 0) > 0 || (saude.invalidos ?? 0) > 0) return 'vermelho';
  if (!saude.ultimoEvento) return 'cinza';
  const quando = Date.parse(saude.ultimoEvento);
  if (!Number.isFinite(quando)) return 'cinza';
  return agora - quando < JANELA_SAUDE_MS ? 'verde' : 'cinza';
}

/** Linhas prontas para a barra de saúde: uma por adaptador que já foi visto. */
export function linhasDeSaude(saude, agora = Date.now()) {
  return Object.entries(saude ?? {})
    .map(([cli, dados]) => ({
      cli,
      cor: corDaSaude(dados, agora),
      eventos: dados?.eventos ?? 0,
      ultimoEvento: dados?.ultimoEvento ?? null,
    }))
    .sort((a, b) => a.cli.localeCompare(b.cli));
}

/**
 * Texto e proporção dos tokens para a ficha.
 * `contexto` sem `janela` vira "12.400 (janela desconhecida)"; saída estimada ganha "≈".
 */
export function formatarTokens(tokens, i18n) {
  if (!tokens) return null;
  const temContexto = typeof tokens.contexto === 'number' && tokens.contexto > 0;
  const temJanela = typeof tokens.janela === 'number' && tokens.janela > 0;
  const contexto = !temContexto
    ? null
    : temJanela
      ? `${i18n.numero(tokens.contexto)} / ${i18n.numero(tokens.janela)}`
      : `${i18n.numero(tokens.contexto)} (${i18n.t('janelaDesconhecida')})`;
  const proporcao = temContexto && temJanela ? Math.min(1, tokens.contexto / tokens.janela) : null;
  const saida = typeof tokens.saida === 'number' && tokens.saida > 0
    ? `${tokens.saidaEstimada ? '≈ ' : ''}${i18n.numero(tokens.saida)}`
    : null;
  if (!contexto && !saida) return null;
  return { contexto, proporcao, saida };
}

/** Uma linha de balão/ficha: "Read · src/app.js" com detalhe truncado. */
export function descreverAtividade(atividade, max = 24) {
  if (!atividade || !atividade.nome) return null;
  const detalhe = atividade.detalhe ? truncar(atividade.detalhe, max) : '';
  return detalhe ? `${atividade.nome} · ${detalhe}` : atividade.nome;
}

export function estagiariosDe(estado, advogado) {
  const ids = new Set(advogado?.estagiarios ?? []);
  return (estado.estagiarios ?? []).filter((e) => ids.has(e.id));
}

/**
 * Escala do canvas para caber no que sobra da janela: sem a barra superior e, com o painel
 * aberto, sem a largura do painel. Pode ser menor que 1 (janela pequena encolhe a cena em vez
 * de cortá-la); o piso de 0,2 evita canvas de largura zero ou negativa.
 */
export function escalaDaTela({ larguraJanela, alturaJanela, painelAberto = false }) {
  const largura = larguraJanela - (painelAberto ? LARGURA_PAINEL : 0);
  const altura = alturaJanela - ALTURA_BARRA;
  const escala = Math.min(largura / LARGURA, altura / ALTURA);
  return Number.isFinite(escala) ? Math.max(0.2, escala) : 0.2;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test test/cliente-hud-util.test.js`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add public/cores.js public/hud-util.js test/cliente-hud-util.test.js
git commit -m "feat: cores num único módulo e utilitários do HUD: projetos, tokens, saúde e escala" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `public/sprites.js` — atlas e placeholders procedurais

**Files:**
- Create: `public/sprites.js`
- Test: `test/cliente-sprites.test.js`

**Interfaces:**
- Produces: `CARGOS_SPRITE`; `hashEstavel(texto)`; `variacao(id) → 'a' | 'b'`; `idPersonagem(cargo, idEntidade)`; `criarSprites({ buscar, carregarImagem, base = 'arte/', avisar }) → { carregar() → Promise<boolean>, quadro(id) → { imagem, w, h, ancora } | null, idPersonagem, temAtlas, avisos }`. (Nenhuma cor aqui: as dos placeholders vêm de `cores.js`, Task 6.)
- Consome `public/arte/atlas.json` do Plano 3: `[{ id, arquivo, categoria, w, h, ancora: { x, y }, hash }]`. Sem atlas, `quadro` devolve `null` e o render desenha o placeholder; cada aviso sai uma vez só.

- [ ] **Step 1: Escrever o teste**

`test/cliente-sprites.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarSprites, idPersonagem, variacao, hashEstavel, CARGOS_SPRITE } from '../public/sprites.js';

const ATLAS = [
  { id: 'personagem-socio-a', arquivo: 'personagem-socio-a.png', categoria: 'personagem', w: 32, h: 48, ancora: { x: 16, y: 48 }, hash: 'abc' },
  { id: 'movel-mesa', arquivo: 'movel-mesa.png', categoria: 'movel', w: 32, h: 32, ancora: { x: 16, y: 32 }, hash: 'def' },
];

function ambiente({ ok = true, corpo = ATLAS, falhaImagem = null } = {}) {
  const avisos = [];
  const pedidos = [];
  const sprites = criarSprites({
    buscar: async (url) => {
      pedidos.push(url);
      return { ok, status: ok ? 200 : 404, json: async () => corpo };
    },
    carregarImagem: async (url) => {
      pedidos.push(url);
      if (falhaImagem && url.includes(falhaImagem)) throw new Error('404');
      return { url, largura: 32 };
    },
    avisar: (m) => avisos.push(m),
  });
  return { sprites, avisos, pedidos };
}

test('ids de sprite seguem o contrato do atlas', () => {
  assert.deepEqual(CARGOS_SPRITE, ['socio', 'senior', 'associado', 'junior', 'advogado', 'estagiario']);
  for (const cargo of CARGOS_SPRITE) {
    assert.match(idPersonagem(cargo, 'claude:s1'), new RegExp(`^personagem-${cargo}-(a|b)$`));
  }
  assert.match(idPersonagem('rei', 'claude:s1'), /^personagem-advogado-(a|b)$/);
});

test('a variação a/b é estável por id e as duas aparecem', () => {
  assert.equal(variacao('claude:s1'), variacao('claude:s1'));
  assert.equal(hashEstavel('claude:s1'), hashEstavel('claude:s1'));
  const vistas = new Set();
  for (let i = 0; i < 20; i += 1) vistas.add(variacao(`claude:s${i}`));
  assert.deepEqual([...vistas].sort(), ['a', 'b']);
});

test('com atlas: carrega os PNGs e devolve o quadro com âncora', async () => {
  const { sprites, avisos, pedidos } = ambiente();
  assert.equal(await sprites.carregar(), true);
  assert.equal(sprites.temAtlas, true);
  assert.equal(pedidos[0], 'arte/atlas.json');
  assert.ok(pedidos.includes('arte/movel-mesa.png'));
  const q = sprites.quadro('personagem-socio-a');
  assert.equal(q.imagem.url, 'arte/personagem-socio-a.png');
  assert.deepEqual(q.ancora, { x: 16, y: 48 });
  assert.equal(q.h, 48);
  assert.deepEqual(avisos, []);
});

test('sem atlas (404): fica em placeholder e avisa uma única vez', async () => {
  const { sprites, avisos } = ambiente({ ok: false });
  assert.equal(await sprites.carregar(), false);
  assert.equal(sprites.temAtlas, false);
  assert.equal(sprites.quadro('personagem-socio-a'), null);
  assert.equal(sprites.quadro('movel-mesa'), null);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /sem arte em arte\//);
});

test('id que falta no atlas vira placeholder com um aviso só', async () => {
  const { sprites, avisos } = ambiente();
  await sprites.carregar();
  assert.equal(sprites.quadro('movel-impressora'), null);
  assert.equal(sprites.quadro('movel-impressora'), null);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /movel-impressora/);
});

test('PNG quebrado no meio do lote não derruba os outros', async () => {
  const { sprites, avisos } = ambiente({ falhaImagem: 'movel-mesa' });
  assert.equal(await sprites.carregar(), true);
  assert.ok(sprites.quadro('personagem-socio-a'));
  assert.equal(sprites.quadro('movel-mesa'), null);
  assert.equal(sprites.quadro('movel-mesa'), null);
  assert.match(avisos[0], /movel-mesa não carregou/);
  assert.equal(avisos.length, 2, 'um aviso do PNG que falhou e um do quadro ausente, sem repetir');
});

test('atlas com JSON que não é lista cai no placeholder', async () => {
  const { sprites, avisos } = ambiente({ corpo: { versao: 1 } });
  assert.equal(await sprites.carregar(), false);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /não é uma lista/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/cliente-sprites.test.js`
Expected: FAIL com `Cannot find module '../public/sprites.js'`.

- [ ] **Step 3: Implementar `public/sprites.js`**

```js
// Atlas de arte (Plano 3) com placeholders procedurais quando os PNGs não existem.
// Sem DOM: `buscar` (fetch) e `carregarImagem` são injetados.

export const CARGOS_SPRITE = Object.freeze(['socio', 'senior', 'associado', 'junior', 'advogado', 'estagiario']);

/** FNV-1a: mesmo id, mesma variação, em qualquer navegador. */
export function hashEstavel(texto) {
  let h = 2166136261;
  const s = String(texto ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function variacao(id) {
  return hashEstavel(id) % 2 === 0 ? 'a' : 'b';
}

export function idPersonagem(cargo, idEntidade) {
  const papel = CARGOS_SPRITE.includes(cargo) ? cargo : 'advogado';
  return `personagem-${papel}-${variacao(idEntidade)}`;
}

export function criarSprites({ buscar, carregarImagem, base = 'arte/', avisar = () => {} } = {}) {
  const quadros = new Map();
  let temAtlas = false;
  const avisados = new Set();

  function avisarUmaVez(mensagem) {
    if (avisados.has(mensagem)) return;
    avisados.add(mensagem);
    avisar(mensagem);
  }

  async function carregar() {
    try {
      const resposta = await buscar(`${base}atlas.json`);
      if (!resposta || !resposta.ok) throw new Error(`atlas.json indisponível (${resposta?.status ?? 'sem resposta'})`);
      const lista = await resposta.json();
      if (!Array.isArray(lista)) throw new Error('atlas.json não é uma lista');
      await Promise.all(lista.map(async (item) => {
        if (!item || typeof item.id !== 'string' || typeof item.arquivo !== 'string') return;
        try {
          const imagem = await carregarImagem(`${base}${item.arquivo}`);
          quadros.set(item.id, {
            id: item.id,
            categoria: item.categoria ?? 'movel',
            w: item.w ?? 32,
            h: item.h ?? 32,
            ancora: item.ancora ?? { x: Math.round((item.w ?? 32) / 2), y: item.h ?? 32 },
            imagem,
          });
        } catch (erro) {
          avisarUmaVez(`sprite ${item.id} não carregou (${erro.message}); usando placeholder`);
        }
      }));
      temAtlas = quadros.size > 0;
      if (!temAtlas) avisarUmaVez('atlas vazio; desenhando placeholders procedurais');
    } catch (erro) {
      avisarUmaVez(`sem arte em ${base} (${erro.message}); desenhando placeholders procedurais`);
    }
    return temAtlas;
  }

  /** Quadro do atlas ou null (o render desenha o placeholder). */
  function quadro(id) {
    const achado = quadros.get(id);
    if (achado) return achado;
    if (temAtlas) avisarUmaVez(`sprite ${id} não está no atlas; usando placeholder`);
    return null;
  }

  return {
    carregar,
    quadro,
    idPersonagem,
    get temAtlas() {
      return temAtlas;
    },
    get avisos() {
      return [...avisados];
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/cliente-sprites.test.js`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add public/sprites.js test/cliente-sprites.test.js
git commit -m "feat: atlas de arte com placeholders procedurais e variação estável" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `public/render.js` — desenho da cena no Canvas 2D

**Files:**
- Create: `public/render.js`
- Test: `test/cliente-render.test.js`

**Interfaces:**
- Consumes: `mundo.js`, `sprites.js`, `cores.js`, `hud-util.js`.
- Produces: `ALTURA_PERSONAGEM = 48`, `LARGURA_PERSONAGEM = 32`, `ESCALA_ESTAGIARIO = 0.75`; `desenharCena(ctx, cena)` com `cena = { atores, sprites, i18n, salas, crachas, tempo, reduzirMovimento }`; `atorEm(atores, x, y) → ator | null` (coordenadas lógicas do canvas). Cores (fundo, texto, balão, pisos, salas, cargos) vêm de `CORES` em `cores.js`.
- Desenha: pisos (sprite ou cor com quadriculado sutil), retângulo e rótulo de cada sala, móveis por posto e decoração, personagens ordenados por `y`, crachá com cor e sigla da CLI, rótulo do projeto, balão da atividade quando `trabalhando`, indicador de estado (`…`, `zzz`, `?`, `⏱`) e overlay de digitação piscando na mesa.

- [ ] **Step 1: Escrever o teste**

`test/cliente-render.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desenharCena, atorEm, LARGURA_PERSONAGEM, ALTURA_PERSONAGEM } from '../public/render.js';
import { criarElenco } from '../public/personagens.js';
import { criarI18n } from '../public/i18n.js';
import { TILE, LARGURA, ALTURA, SALAS } from '../public/mundo.js';

/** Contexto 2D falso: registra as chamadas para o teste de fumaça. */
function contextoFalso() {
  const chamadas = [];
  const alvo = {
    chamadas,
    canvas: { width: LARGURA, height: ALTURA },
    fillStyle: '', strokeStyle: '', font: '', textAlign: '', lineWidth: 1,
    textos: () => chamadas.filter((c) => c.nome === 'fillText').map((c) => c.args[0]),
    quantas: (nome) => chamadas.filter((c) => c.nome === nome).length,
  };
  for (const nome of ['clearRect', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'beginPath', 'arc', 'fill', 'stroke', 'save', 'restore', 'translate', 'scale', 'moveTo', 'lineTo', 'closePath']) {
    alvo[nome] = (...args) => {
      chamadas.push({ nome, args });
    };
  }
  return alvo;
}

const spritesVazio = { quadro: () => null, temAtlas: false };
const spritesCheio = {
  temAtlas: true,
  quadro: (id) => ({ id, imagem: { id }, w: 32, h: id.startsWith('personagem') ? 48 : 32, ancora: { x: 16, y: id.startsWith('personagem') ? 48 : 32 } }),
};

const advogado = (extra = {}) => ({
  id: 'claude:s1', cli: 'claude', cargo: 'socio', sala: 'gabinete', estado: 'trabalhando',
  projeto: 'escritorio', projetoId: '/casa/escritorio', estagiarios: [], ultimaAtividade: 1,
  atividade: { nome: 'Edit', detalhe: 'src/app.js' }, desatualizado: false, ...extra,
});

function cenaCom(estado, { sprites = spritesVazio, idioma = 'pt-BR', reduzirMovimento = false } = {}) {
  const elenco = criarElenco({ agora: () => 0, reduzirMovimento: true });
  elenco.sincronizar(estado);
  elenco.atualizar(16);
  return {
    elenco,
    cena: {
      atores: elenco.atores(),
      sprites,
      i18n: criarI18n(idioma),
      salas: [
        { id: 'recepcao', rotulo: 'Recepção' }, { id: 'biblioteca', rotulo: 'Biblioteca' },
        { id: 'gabinete', rotulo: 'Gabinete de Redação' }, { id: 'revisao', rotulo: 'Sala de Revisão' },
        { id: 'cartorio', rotulo: 'Cartório' }, { id: 'reunioes', rotulo: 'Sala de Reuniões' }, { id: 'copa', rotulo: 'Copa' },
      ],
      crachas: { clis: { claude: { cor: '#c2603e', sigla: 'CL' } }, padrao: { cor: '#8a8a8a', sigla: '??' } },
      tempo: 0,
      reduzirMovimento,
    },
  };
}

test('sem atlas desenha tudo com placeholders e rotula as sete salas', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado()], estagiarios: [] });
  desenharCena(ctx, cena);
  assert.equal(ctx.quantas('clearRect'), 1);
  assert.equal(ctx.quantas('drawImage'), 0, 'sem atlas não pode chamar drawImage');
  assert.ok(ctx.quantas('fillRect') > 30 * 18, 'deveria pintar todos os tiles');
  assert.equal(ctx.quantas('arc'), 1, 'cabeça do placeholder');
  const textos = ctx.textos();
  for (const rotulo of ['RECEPÇÃO', 'BIBLIOTECA', 'GABINETE DE REDAÇÃO', 'SALA DE REVISÃO', 'CARTÓRIO', 'SALA DE REUNIÕES', 'COPA']) {
    assert.ok(textos.includes(rotulo), `falta o rótulo ${rotulo}`);
  }
  assert.ok(textos.includes('CL'), 'crachá da CLI');
  assert.ok(textos.includes('escritorio'), 'rótulo do projeto');
  assert.ok(textos.includes('Edit · src/app.js'), 'balão da atividade');
});

test('em inglês os rótulos de sala são traduzidos por id', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado()], estagiarios: [] }, { idioma: 'en' });
  desenharCena(ctx, cena);
  const textos = ctx.textos();
  assert.ok(textos.includes('DRAFTING OFFICE'));
  assert.ok(textos.includes('BREAK ROOM'));
  assert.equal(textos.includes('GABINETE DE REDAÇÃO'), false);
});

test('com atlas usa drawImage e não desenha a silhueta', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado()], estagiarios: [] }, { sprites: spritesCheio });
  desenharCena(ctx, cena);
  assert.ok(ctx.quantas('drawImage') > 30 * 18, 'pisos, móveis e personagens pelo atlas');
  assert.equal(ctx.quantas('arc'), 0);
});

test('indicadores por estado e relógio de desatualizado', () => {
  const casos = [['pensando', '…'], ['ocioso', 'zzz'], ['aguardando', '?']];
  for (const [estado, simbolo] of casos) {
    const ctx = contextoFalso();
    const { cena } = cenaCom({ advogados: [advogado({ estado, atividade: null })], estagiarios: [] });
    desenharCena(ctx, cena);
    assert.ok(ctx.textos().includes(simbolo), `falta o indicador de ${estado}`);
  }
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado({ estado: 'trabalhando', desatualizado: true })], estagiarios: [] });
  desenharCena(ctx, cena);
  assert.ok(ctx.textos().includes('⏱'));
});

test('estagiário aparece menor e o desenho não quebra sem projeto nem atividade', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({
    advogados: [advogado({ projeto: null, atividade: null, estado: 'pensando', estagiarios: ['claude:s1:a0'] })],
    estagiarios: [{ id: 'claude:s1:a0', sessao: 's1', tipo: 'pesquisa', estado: 'pensando', sala: 'reunioes', atividade: null, ultimaAtividade: 1 }],
  });
  assert.doesNotThrow(() => desenharCena(ctx, cena));
  assert.equal(cena.atores.length, 2);
  assert.equal(ctx.quantas('arc'), 2);
  assert.equal(ctx.textos().includes('escritorio'), false);
});

test('com movimento reduzido não há balanço: as posições de desenho são inteiras', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado()], estagiarios: [] }, { reduzirMovimento: true });
  desenharCena(ctx, cena);
  const translates = ctx.chamadas.filter((c) => c.nome === 'translate');
  assert.ok(translates.length >= 2);
  for (const t of translates) assert.ok(Number.isInteger(t.args[1]), `translate em y não inteiro: ${t.args[1]}`);
});

test('atorEm acerta o retângulo do personagem e devolve null fora dele', () => {
  const { elenco } = cenaCom({ advogados: [advogado()], estagiarios: [] });
  const atores = elenco.atores();
  const ator = atores[0];
  const px = ator.x * TILE + TILE / 2;
  const py = ator.y * TILE + TILE;
  assert.equal(atorEm(atores, px, py - ALTURA_PERSONAGEM / 2)?.id, 'claude:s1');
  assert.equal(atorEm(atores, px + LARGURA_PERSONAGEM, py), null);
  assert.equal(atorEm(atores, SALAS.copa.postos[0].x * TILE, SALAS.copa.postos[0].y * TILE), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/cliente-render.test.js`
Expected: FAIL com `Cannot find module '../public/render.js'`.

- [ ] **Step 3: Implementar `public/render.js`**

```js
// Desenho do escritório no Canvas 2D. Recebe o contexto pronto: nada de DOM aqui.

import { TILE, COLUNAS, LINHAS, LARGURA, ALTURA, SALAS, ORDEM_SALAS, tipoDePiso } from './mundo.js';
import { idPersonagem } from './sprites.js';
import { CORES } from './cores.js';
import { crachaDe, descreverAtividade, truncar } from './hud-util.js';

export const ALTURA_PERSONAGEM = 48;
export const LARGURA_PERSONAGEM = 32;
export const ESCALA_ESTAGIARIO = 0.75;

const INDICADORES = Object.freeze({ pensando: '…', ocioso: 'zzz', aguardando: '?' });
const INDICADOR_DESATUALIZADO = '⏱';

function desenharPisos(ctx, sprites) {
  for (let x = 0; x < COLUNAS; x += 1) {
    for (let y = 0; y < LINHAS; y += 1) {
      const id = tipoDePiso(x, y);
      const quadro = sprites.quadro(id);
      if (quadro) {
        ctx.drawImage(quadro.imagem, x * TILE, y * TILE, TILE, TILE);
        continue;
      }
      ctx.fillStyle = CORES.piso[id] ?? CORES.piso['piso-madeira'];
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      if (id !== 'piso-parede' && (x + y) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; // quadriculado sutil
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
}

function desenharMovel(ctx, sprites, movel, sala) {
  const quadro = sprites.quadro(movel.sprite);
  if (quadro) {
    ctx.drawImage(quadro.imagem, movel.x * TILE, (movel.y + 1) * TILE - quadro.h, quadro.w, quadro.h);
    return;
  }
  ctx.fillStyle = CORES.sala[sala] ?? CORES.crachaPadrao;
  ctx.fillRect(movel.x * TILE + 4, movel.y * TILE + 8, TILE - 8, TILE - 12);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(movel.x * TILE + 4, movel.y * TILE + 8, TILE - 8, TILE - 12);
}

function desenharSalas(ctx, cena) {
  const rotulos = new Map((cena.salas ?? []).map((s) => [s.id, s.rotulo]));
  for (const id of ORDEM_SALAS) {
    const sala = SALAS[id];
    ctx.strokeStyle = CORES.sala[id];
    ctx.lineWidth = 2;
    ctx.strokeRect(sala.x0 * TILE + 1, sala.y0 * TILE + 1, (sala.x1 - sala.x0 + 1) * TILE - 2, (sala.y1 - sala.y0 + 1) * TILE - 2);
    for (const movel of sala.decoracao) desenharMovel(ctx, cena.sprites, movel, id);
    for (const posto of sala.postos) if (posto.movel) desenharMovel(ctx, cena.sprites, posto.movel, id);
    ctx.fillStyle = CORES.texto;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(cena.i18n.sala(id, rotulos.get(id)).toUpperCase(), sala.x0 * TILE + 6, sala.y0 * TILE + 14);
  }
}

function desenharPlaceholderPersonagem(ctx, ator, escala) {
  const l = LARGURA_PERSONAGEM * escala;
  const a = ALTURA_PERSONAGEM * escala;
  ctx.fillStyle = CORES.cargo[ator.cargo] ?? CORES.cargo.advogado;
  ctx.fillRect(-l / 2 + l * 0.2, -a + a * 0.35, l * 0.6, a * 0.65); // corpo
  ctx.beginPath();
  ctx.arc(0, -a + a * 0.25, l * 0.22, 0, Math.PI * 2); // cabeça
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-l / 2, -2, l, 3); // sombra
}

function desenharCracha(ctx, ator, cena, escala) {
  const cracha = crachaDe(cena.crachas, ator.cli);
  const a = ALTURA_PERSONAGEM * escala;
  ctx.fillStyle = cracha.cor;
  ctx.fillRect(-6, -a + a * 0.45, 12, 8);
  ctx.fillStyle = '#fff';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(cracha.sigla, 0, -a + a * 0.45 + 6);
}

function desenharBalao(ctx, texto, cima) {
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const largura = Math.max(24, texto.length * 5.4 + 10);
  ctx.fillStyle = CORES.balao;
  ctx.fillRect(-largura / 2, cima - 13, largura, 13);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-largura / 2, cima - 13, largura, 13);
  ctx.fillStyle = CORES.texto;
  ctx.fillText(texto, 0, cima - 3);
}

function desenharAtor(ctx, ator, cena) {
  const escala = ator.tipo === 'estagiario' ? ESCALA_ESTAGIARIO : 1;
  const balanco = cena.reduzirMovimento ? 0 : Math.sin(ator.fase / (ator.andando ? 90 : 320)) * (ator.andando ? 2 : 1);
  const px = ator.x * TILE + TILE / 2;
  const py = ator.y * TILE + TILE;

  ctx.save();
  ctx.translate(px, py + balanco);
  ctx.scale(ator.direcao < 0 ? -1 : 1, 1);
  const id = idPersonagem(ator.cargo, ator.id);
  const quadro = cena.sprites.quadro(id);
  if (quadro) {
    ctx.drawImage(quadro.imagem, -quadro.ancora.x * escala, -quadro.ancora.y * escala, quadro.w * escala, quadro.h * escala);
  } else {
    desenharPlaceholderPersonagem(ctx, ator, escala);
  }
  ctx.restore();

  // Crachá, rótulo, balão e indicador não espelham: desenhados sem a escala negativa.
  ctx.save();
  ctx.translate(px, py + balanco);
  desenharCracha(ctx, ator, cena, escala);
  const entidade = ator.entidade ?? {};
  const alturaTopo = -ALTURA_PERSONAGEM * escala;
  if (ator.tipo === 'advogado' && entidade.projeto) {
    ctx.fillStyle = 'rgba(232,226,210,0.75)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(truncar(entidade.projeto, 14), 0, 10);
  }
  if (entidade.estado === 'trabalhando') {
    const texto = descreverAtividade(entidade.atividade, 24);
    if (texto) desenharBalao(ctx, texto, alturaTopo - 4);
  }
  const indicador = entidade.desatualizado ? INDICADOR_DESATUALIZADO : INDICADORES[entidade.estado];
  if (indicador) {
    ctx.fillStyle = CORES.texto;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(indicador, 0, alturaTopo - 2);
  }
  ctx.restore();

  // Overlay de digitação: retângulo piscando na mesa do posto.
  if (entidade.estado === 'trabalhando' && ator.alvo?.movel) {
    const piscando = cena.reduzirMovimento || Math.floor(cena.tempo / 400) % 2 === 0;
    if (piscando) {
      ctx.fillStyle = 'rgba(232,226,210,0.55)';
      ctx.fillRect(ator.alvo.movel.x * TILE + 10, ator.alvo.movel.y * TILE + 10, 12, 8);
    }
  }
}

/** Desenha uma cena inteira: pisos, salas, móveis e atores ordenados por profundidade. */
export function desenharCena(ctx, cena) {
  ctx.clearRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = CORES.fundo;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  desenharPisos(ctx, cena.sprites);
  desenharSalas(ctx, cena);
  const atores = [...cena.atores].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  for (const ator of atores) desenharAtor(ctx, ator, cena);
}

/** Converte um ponto do canvas (já em coordenadas lógicas) no ator clicado, se houver. */
export function atorEm(atores, x, y) {
  const candidatos = [...atores].sort((a, b) => b.y - a.y);
  for (const ator of candidatos) {
    const escala = ator.tipo === 'estagiario' ? ESCALA_ESTAGIARIO : 1;
    const px = ator.x * TILE + TILE / 2;
    const py = ator.y * TILE + TILE;
    const l = LARGURA_PERSONAGEM * escala;
    const a = ALTURA_PERSONAGEM * escala;
    if (x >= px - l / 2 && x <= px + l / 2 && y >= py - a && y <= py) return ator;
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/cliente-render.test.js`
Expected: `# pass 7`, `# fail 0`.

Run: `npm test`
Expected: `# fail 0`, com os 54 testes do cliente (`cliente-*.test.js`: i18n 5, mundo 9, fluxo 7, personagens 9, hud-util 10, sprites 7, render 7) somados aos do Plano 1.

- [ ] **Step 5: Commit**

```bash
git add public/render.js test/cliente-render.test.js
git commit -m "feat: desenho do escritório, personagens, balões e indicadores no canvas" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `public/hud.js`, `public/estilo.css`, `public/index.html` e `public/escritorio.js`

Camada que toca no DOM: sem teste automatizado (a Task 10 verifica na tela). Todo texto do servidor entra por `textContent`; `localStorage` só em `try/catch`.

**Files:**
- Create: `public/hud.js`, `public/estilo.css`, `public/escritorio.js`
- Modify: `public/index.html` (substitui o placeholder do Plano 1)

**Interfaces:**
- Consumes: `fluxo-cliente.js`, `personagens.js`, `sprites.js`, `render.js`, `hud-util.js`, `cores.js`, `i18n.js`, `mundo.js`.
- Produces: `criarHud({ doc, raiz, i18n, painelAberto, aoTrocarIdioma, aoAlternarPainel, aoSelecionar }) → { atualizar(estado, foraDoMapa), abrirFicha(id), fecharFicha(), trocarIdioma(i18n), selecionado }`.
- Acessibilidade: as linhas do painel são `<button>`, então Tab percorre e Enter abre a ficha; `Esc` fecha; a ficha é `role="dialog"` com `aria-modal="true"` e o foco vai para o botão Fechar. A reconstrução da lista a cada delta guarda o foco (`data-id` do elemento ativo) e o devolve à mesma linha; com a ficha aberta a lista não é reconstruída (só a ficha muda), então foco e rolagem ficam parados.
- Painel: título com a contagem (`3 advogados` / `3 lawyers`, chave i18n `advogados`); sem conexão (`estado.conectado === false`) mostra `semConexao` no lugar da lista. Cores dos pontos de saúde vêm de `CORES.saude`; a do crachá vem do snapshot.
- Canvas: `ajustarTela` usa `escalaDaTela` (Task 6): desconta a barra e, com o painel aberto, a largura do painel; pode encolher abaixo de 1. `body.com-painel` (ligado pelo HUD) empurra o palco para a esquerda pela mesma largura, em `estilo.css`.

- [ ] **Step 1: Implementar `public/hud.js`**

```js
// HUD em DOM puro: barra superior, painel lateral e ficha do caso.
// Todo texto vindo do servidor entra por textContent.

import { agruparPorProjeto, contarPorCli, crachaDe, linhasDeSaude, formatarTokens, descreverAtividade, truncar, estagiariosDe } from './hud-util.js';
import { CORES } from './cores.js';

// corDaSaude (hud-util) fala em verde/cinza/vermelho; a cor de fato mora em cores.js.
const COR_DA_SAUDE = Object.freeze({ verde: CORES.saude.ok, cinza: CORES.saude.semEventos, vermelho: CORES.saude.erro });

function el(doc, tag, classe, texto) {
  const no = doc.createElement(tag);
  if (classe) no.className = classe;
  if (texto !== undefined && texto !== null) no.textContent = String(texto);
  return no;
}

export function criarHud({ doc, raiz, i18n, painelAberto = true, aoTrocarIdioma = () => {}, aoAlternarPainel = () => {}, aoSelecionar = () => {} }) {
  let lingua = i18n;
  let estadoAtual = { advogados: [], estagiarios: [], salas: [], saude: {}, crachas: null, conectado: false };
  let foraDoMapa = new Set();
  let selecionado = null;

  const barra = el(doc, 'header', 'barra');
  const titulo = el(doc, 'h1', 'titulo', lingua.t('titulo'));
  const clis = el(doc, 'div', 'clis');
  const saude = el(doc, 'div', 'saude');
  const botaoIdioma = el(doc, 'button', 'botao', lingua.t('trocarIdioma'));
  const botaoPainel = el(doc, 'button', 'botao', lingua.t(painelAberto ? 'fecharPainel' : 'abrirPainel'));
  botaoIdioma.type = 'button';
  botaoPainel.type = 'button';
  botaoPainel.setAttribute('aria-expanded', String(painelAberto));
  barra.append(titulo, clis, saude, botaoIdioma, botaoPainel);

  const painel = el(doc, 'aside', 'painel');
  painel.hidden = !painelAberto;
  const tituloPainel = el(doc, 'h2', 'painel-titulo');
  const lista = el(doc, 'div', 'projetos');
  painel.append(tituloPainel, lista);
  doc.body.classList.toggle('com-painel', painelAberto); // o palco cede a largura do painel (estilo.css)

  const ficha = el(doc, 'div', 'ficha');
  ficha.hidden = true;
  ficha.setAttribute('role', 'dialog');
  ficha.setAttribute('aria-modal', 'true');
  ficha.setAttribute('aria-label', lingua.t('fichaDoCaso'));
  const fichaCorpo = el(doc, 'div', 'ficha-corpo');
  const botaoFechar = el(doc, 'button', 'botao fechar', lingua.t('fechar'));
  botaoFechar.type = 'button';
  ficha.append(botaoFechar, fichaCorpo);

  raiz.append(barra, painel, ficha);

  botaoIdioma.addEventListener('click', () => aoTrocarIdioma(lingua.outro()));
  botaoPainel.addEventListener('click', () => {
    const abrir = painel.hidden;
    painel.hidden = !abrir;
    doc.body.classList.toggle('com-painel', abrir);
    botaoPainel.textContent = lingua.t(abrir ? 'fecharPainel' : 'abrirPainel');
    botaoPainel.setAttribute('aria-expanded', String(abrir));
    aoAlternarPainel(abrir);
  });
  botaoFechar.addEventListener('click', () => fecharFicha());
  doc.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !ficha.hidden) fecharFicha();
  });

  function desenharClis() {
    clis.replaceChildren();
    for (const { cli, quantidade } of contarPorCli(estadoAtual.advogados)) {
      const item = el(doc, 'span', 'cli');
      const ponto = el(doc, 'span', 'ponto');
      ponto.style.background = crachaDe(estadoAtual.crachas, cli).cor;
      item.append(ponto, el(doc, 'span', null, `${crachaDe(estadoAtual.crachas, cli).sigla} ${quantidade}`));
      item.title = cli;
      clis.append(item);
    }
  }

  function desenharSaude() {
    saude.replaceChildren();
    saude.append(el(doc, 'span', 'rotulo', lingua.t('saude')));
    for (const linha of linhasDeSaude(estadoAtual.saude)) {
      const item = el(doc, 'span', 'adaptador');
      const ponto = el(doc, 'span', 'ponto');
      ponto.style.background = COR_DA_SAUDE[linha.cor];
      item.append(ponto, el(doc, 'span', null, linha.cli));
      item.title = linha.ultimoEvento ?? lingua.t('semEventos');
      saude.append(item);
    }
  }

  function linhaDoAdvogado(advogado) {
    const botao = el(doc, 'button', 'linha');
    botao.type = 'button';
    botao.dataset.id = advogado.id;
    const cracha = crachaDe(estadoAtual.crachas, advogado.cli);
    const ponto = el(doc, 'span', 'ponto');
    ponto.style.background = cracha.cor;
    const nome = el(doc, 'span', 'nome', `${cracha.sigla} ${lingua.cargo(advogado.cargo)}`);
    const sala = el(doc, 'span', 'sala', lingua.sala(advogado.sala, rotuloDaSala(advogado.sala)));
    const estado = el(doc, 'span', 'estado', lingua.estado(advogado.estado));
    botao.append(ponto, nome, sala, estado);
    if (foraDoMapa.has(advogado.id)) botao.append(el(doc, 'span', 'aviso', lingua.t('foraDoMapa')));
    if (advogado.id === selecionado) botao.classList.add('selecionada');
    botao.addEventListener('click', () => aoSelecionar(advogado.id));
    return botao;
  }

  function rotuloDaSala(id) {
    return (estadoAtual.salas ?? []).find((s) => s.id === id)?.rotulo;
  }

  function desenharTituloPainel() {
    tituloPainel.textContent = `${lingua.numero(estadoAtual.advogados.length)} ${lingua.t('advogados')}`;
  }

  /**
   * Reconstrói a lista de projetos. Guarda o foco antes (Tab pelo painel não pode "cair" a cada
   * delta do fluxo) e o devolve à mesma linha depois. Com a ficha aberta, `atualizar` nem chama
   * isto: a lista fica congelada e só a ficha muda.
   */
  function desenharPainel() {
    const focoId = doc.activeElement?.dataset?.id;
    lista.replaceChildren();
    if (!estadoAtual.conectado) {
      lista.append(el(doc, 'p', 'vazio', lingua.t('semConexao')));
      return;
    }
    if (!estadoAtual.advogados.length) {
      lista.append(el(doc, 'p', 'vazio', lingua.t('semAdvogados')));
      return;
    }
    for (const grupo of agruparPorProjeto(estadoAtual.advogados)) {
      const bloco = el(doc, 'section', 'projeto');
      bloco.append(el(doc, 'h3', null, grupo.rotulo || lingua.t('semProjeto')));
      for (const advogado of grupo.advogados) bloco.append(linhaDoAdvogado(advogado));
      lista.append(bloco);
    }
    if (focoId) lista.querySelector('[data-id="' + CSS.escape(focoId) + '"]')?.focus();
  }

  function campo(rotulo, valor) {
    const linha = el(doc, 'p', 'campo');
    linha.append(el(doc, 'span', 'rotulo', rotulo), el(doc, 'span', 'valor', valor));
    return linha;
  }

  function desenharFicha() {
    fichaCorpo.replaceChildren();
    const advogado = estadoAtual.advogados.find((a) => a.id === selecionado);
    if (!advogado) {
      fecharFicha();
      return;
    }
    fichaCorpo.append(el(doc, 'h2', null, lingua.t('fichaDoCaso')));
    fichaCorpo.append(campo(lingua.t('casoAtual'), advogado.caso ?? lingua.t('semCaso')));
    fichaCorpo.append(campo(lingua.t('turno'), String(advogado.turnos ?? 0)));
    fichaCorpo.append(campo(lingua.t('cli'), advogado.cli));
    fichaCorpo.append(campo(lingua.t('modelo'), advogado.modelo ?? lingua.t('desconhecido')));
    fichaCorpo.append(campo(lingua.t('cargo'), lingua.cargo(advogado.cargo)));
    fichaCorpo.append(campo(lingua.t('sala'), `${lingua.sala(advogado.sala, rotuloDaSala(advogado.sala))} (${lingua.t('avisoSala')})`));

    fichaCorpo.append(el(doc, 'h3', null, lingua.t('acoesRecentes')));
    const acoes = el(doc, 'ul', 'acoes');
    const recentes = (advogado.acoesRecentes ?? []).slice(-8).reverse();
    if (!recentes.length) acoes.append(el(doc, 'li', null, lingua.t('semAcoes')));
    for (const acao of recentes) acoes.append(el(doc, 'li', null, descreverAtividade(acao, 48) ?? acao.nome));
    fichaCorpo.append(acoes);

    const tokens = formatarTokens(advogado.tokens, lingua);
    if (tokens) {
      fichaCorpo.append(el(doc, 'h3', null, lingua.t('tokens')));
      if (tokens.contexto) {
        fichaCorpo.append(campo(lingua.t('contexto'), tokens.contexto));
        if (tokens.proporcao !== null) {
          const barraTokens = el(doc, 'div', 'barra-tokens');
          const preenchida = el(doc, 'div', 'preenchida');
          preenchida.style.width = `${Math.round(tokens.proporcao * 100)}%`;
          barraTokens.append(preenchida);
          fichaCorpo.append(barraTokens);
        }
      }
      if (tokens.saida) fichaCorpo.append(campo(lingua.t('saida'), tokens.saida));
    }

    fichaCorpo.append(el(doc, 'h3', null, lingua.t('estagiarios')));
    const internos = estagiariosDe(estadoAtual, advogado);
    const listaInternos = el(doc, 'ul', 'estagiarios');
    if (!internos.length) listaInternos.append(el(doc, 'li', null, lingua.t('semEstagiarios')));
    for (const interno of internos) {
      const texto = `${truncar(interno.tipo ?? '', 20)} · ${lingua.sala(interno.sala, rotuloDaSala(interno.sala))} · ${lingua.estado(interno.estado)}`;
      listaInternos.append(el(doc, 'li', null, texto));
    }
    fichaCorpo.append(listaInternos);
  }

  function abrirFicha(id) {
    selecionado = id;
    desenharPainel(); // marca a linha selecionada antes de a lista congelar
    ficha.hidden = false;
    desenharFicha();
    botaoFechar.focus();
  }

  function fecharFicha() {
    selecionado = null;
    ficha.hidden = true;
    fichaCorpo.replaceChildren();
    desenharPainel();
  }

  function trocarIdioma(novo) {
    lingua = novo;
    titulo.textContent = lingua.t('titulo');
    botaoIdioma.textContent = lingua.t('trocarIdioma');
    botaoPainel.textContent = lingua.t(painel.hidden ? 'abrirPainel' : 'fecharPainel');
    ficha.setAttribute('aria-label', lingua.t('fichaDoCaso'));
    botaoFechar.textContent = lingua.t('fechar');
    desenharClis();
    desenharSaude();
    desenharTituloPainel();
    desenharPainel(); // aqui a lista é refeita mesmo com a ficha aberta: os rótulos mudam de idioma
    if (!ficha.hidden) desenharFicha();
  }

  function atualizar(estado, fora = []) {
    estadoAtual = estado;
    foraDoMapa = new Set(fora);
    desenharClis();
    desenharSaude();
    desenharTituloPainel();
    if (ficha.hidden) desenharPainel();
    else desenharFicha(); // ficha aberta: a lista fica como está (foco e rolagem parados)
  }

  desenharTituloPainel();
  desenharPainel(); // antes do primeiro snapshot: "Sem conexão com o servidor"

  return { atualizar, abrirFicha, fecharFicha, trocarIdioma, get selecionado() { return selecionado; } };
}
```

- [ ] **Step 2: Implementar `public/estilo.css`**

```css
/* Chrome do HUD: fundo da página, painel, bordas e fontes. Cores de entidades (cargo, sala, piso,
   saúde, crachá) vêm de cores.js. --altura-barra e --largura-painel espelham ALTURA_BARRA e
   LARGURA_PAINEL de hud-util.js, que o canvas usa para se escalar. */
:root {
  --fundo: #17150f;
  --painel: #201d16;
  --linha: #2e2a20;
  --texto: #e8e2d2;
  --suave: #a29a86;
  --realce: #c2603e;
  --altura-barra: 48px;
  --largura-painel: 290px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--fundo);
  color: var(--texto);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 13px;
}

.barra {
  display: flex;
  align-items: center;
  gap: 16px;
  height: var(--altura-barra);
  padding: 0 12px;
  background: var(--painel);
  border-bottom: 1px solid var(--linha);
}

.titulo { font-size: 14px; margin: 0; letter-spacing: 1px; }
.clis, .saude { display: flex; align-items: center; gap: 10px; }
.saude { margin-left: auto; color: var(--suave); }
.cli, .adaptador { display: inline-flex; align-items: center; gap: 4px; }
.ponto { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.rotulo { color: var(--suave); }

.botao {
  background: var(--linha);
  color: var(--texto);
  border: 1px solid #3c3729;
  border-radius: 3px;
  padding: 4px 8px;
  font: inherit;
  cursor: pointer;
}
.botao:focus-visible, .linha:focus-visible { outline: 2px solid var(--realce); outline-offset: 2px; }

.palco { display: flex; justify-content: center; padding: 8px 0; }
.com-painel .palco { margin-right: var(--largura-painel); } /* o canvas se centraliza no que sobra */

#tela {
  image-rendering: pixelated;
  background: #000;
  border: 1px solid var(--linha);
}

.painel {
  position: fixed;
  top: var(--altura-barra);
  right: 0;
  width: var(--largura-painel);
  height: calc(100vh - var(--altura-barra));
  overflow-y: auto;
  padding: 8px;
  background: var(--painel);
  border-left: 1px solid var(--linha);
}
.painel[hidden] { display: none; }
.painel-titulo { font-size: 12px; margin: 4px 0 10px; color: var(--suave); text-transform: uppercase; }
.projeto { margin-bottom: 12px; }
.projeto h3 { font-size: 12px; color: var(--suave); margin: 6px 0; text-transform: uppercase; }

.linha {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-bottom: 3px;
  padding: 5px 6px;
  background: transparent;
  color: var(--texto);
  border: 1px solid transparent;
  border-radius: 3px;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.linha:hover { background: var(--linha); }
.linha.selecionada { border-color: var(--realce); }
.linha .sala, .linha .estado { color: var(--suave); font-size: 11px; }
.linha .aviso { margin-left: auto; color: var(--realce); font-size: 10px; }
.vazio { color: var(--suave); }

.ficha {
  position: fixed;
  top: 64px;
  left: 16px;
  width: 340px;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  padding: 12px;
  background: var(--painel);
  border: 1px solid var(--realce);
  border-radius: 4px;
}
.ficha[hidden] { display: none; }
.ficha h2 { font-size: 13px; margin: 0 0 8px; }
.ficha h3 { font-size: 12px; margin: 12px 0 4px; color: var(--suave); }
.ficha .fechar { float: right; }
.campo { display: flex; gap: 8px; margin: 3px 0; }
.campo .rotulo { min-width: 92px; color: var(--suave); }
.campo .valor { word-break: break-word; }
.acoes, .estagiarios { margin: 0; padding-left: 16px; }
.acoes li, .estagiarios li { margin: 2px 0; }

.barra-tokens { height: 7px; background: var(--linha); border-radius: 3px; overflow: hidden; margin: 4px 0; }
.barra-tokens .preenchida { height: 100%; background: var(--realce); }

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 3: Substituir `public/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Escritório de Pixels</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="estilo.css">
</head>
<body>
<div id="hud"></div>
<main class="palco">
  <canvas id="tela" width="960" height="576" aria-label="Escritório em pixel art"></canvas>
</main>
<script type="module" src="escritorio.js"></script>
</body>
</html>
```

- [ ] **Step 4: Implementar `public/escritorio.js`**

```js
// Bootstrap: liga fluxo SSE, elenco, render e HUD. Único arquivo que toca em window.

import { criarClienteFluxo, estadoInicial } from './fluxo-cliente.js';
import { criarElenco } from './personagens.js';
import { criarSprites } from './sprites.js';
import { desenharCena, atorEm } from './render.js';
import { criarHud } from './hud.js';
import { escalaDaTela } from './hud-util.js';
import { criarI18n, idiomaDoNavegador, IDIOMAS } from './i18n.js';
import { LARGURA, ALTURA } from './mundo.js';

const CHAVE_IDIOMA = 'escritorio.idioma';
const CHAVE_PAINEL = 'escritorio.painel';

function lerPreferencia(chave, padrao) {
  try {
    const valor = window.localStorage.getItem(chave);
    return valor === null ? padrao : valor;
  } catch {
    return padrao; // navegador anônimo ou storage bloqueado
  }
}

function gravarPreferencia(chave, valor) {
  try {
    window.localStorage.setItem(chave, String(valor));
  } catch {
    /* sem persistência: a sessão segue normal */
  }
}

const tela = document.getElementById('tela');
const ctx = tela.getContext('2d');
ctx.imageSmoothingEnabled = false;

const idiomaSalvo = lerPreferencia(CHAVE_IDIOMA, null);
let i18n = criarI18n(IDIOMAS.includes(idiomaSalvo) ? idiomaSalvo : idiomaDoNavegador(navigator.languages ?? [navigator.language]));
let painelAberto = lerPreferencia(CHAVE_PAINEL, 'aberto') === 'aberto';

const consultaMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
const elenco = criarElenco({ agora: () => Date.now(), reduzirMovimento: consultaMovimento.matches });
consultaMovimento.addEventListener('change', (ev) => elenco.definirMovimentoReduzido(ev.matches));

const sprites = criarSprites({
  buscar: (url) => fetch(url),
  carregarImagem: (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`falhou ao carregar ${url}`));
    img.src = url;
  }),
  avisar: (mensagem) => console.warn(`[escritório] ${mensagem}`),
});
sprites.carregar();

/**
 * Escala o canvas ao espaço livre: sem a barra superior e, com o painel aberto, sem a largura do
 * painel. Pode encolher abaixo de 1 (janela pequena mostra o escritório inteiro, menor).
 */
function ajustarTela() {
  const escala = escalaDaTela({ larguraJanela: window.innerWidth, alturaJanela: window.innerHeight, painelAberto });
  tela.style.width = `${Math.floor(LARGURA * escala)}px`;
  tela.style.height = `${Math.floor(ALTURA * escala)}px`;
}

const hud = criarHud({
  doc: document,
  raiz: document.getElementById('hud'),
  i18n,
  painelAberto,
  aoTrocarIdioma: (novo) => {
    i18n = criarI18n(novo);
    gravarPreferencia(CHAVE_IDIOMA, novo);
    hud.trocarIdioma(i18n);
  },
  aoAlternarPainel: (aberto) => {
    painelAberto = aberto;
    gravarPreferencia(CHAVE_PAINEL, aberto ? 'aberto' : 'fechado');
    ajustarTela(); // o canvas ganha ou perde a largura do painel
  },
  aoSelecionar: (id) => hud.abrirFicha(id),
});

let estado = estadoInicial();
let foraDoMapa = [];

const cliente = criarClienteFluxo({
  criarFonte: () => new EventSource('/fluxo'),
  aoEstado: (novo) => {
    estado = novo;
    const resultado = elenco.sincronizar(estado);
    foraDoMapa = resultado.foraDoMapa;
    hud.atualizar(estado, foraDoMapa);
  },
  aoErro: (mensagem) => console.warn(`[escritório] ${mensagem}`),
});

window.addEventListener('resize', ajustarTela);
ajustarTela();

tela.addEventListener('click', (ev) => {
  const area = tela.getBoundingClientRect();
  const x = ((ev.clientX - area.left) * LARGURA) / area.width;
  const y = ((ev.clientY - area.top) * ALTURA) / area.height;
  const ator = atorEm(elenco.atores(), x, y);
  if (!ator) return;
  hud.abrirFicha(ator.tipo === 'estagiario' ? ator.dono : ator.id);
});

let anterior = performance.now();
function quadro(agora) {
  const dt = Math.min(100, agora - anterior);
  anterior = agora;
  foraDoMapa = elenco.sincronizar(estado).foraDoMapa; // aplica o debounce de sala a cada quadro
  elenco.atualizar(dt);
  desenharCena(ctx, {
    atores: elenco.atores(),
    sprites,
    i18n,
    salas: estado.salas,
    crachas: estado.crachas,
    tempo: agora,
    reduzirMovimento: elenco.movimentoReduzido,
  });
  window.requestAnimationFrame(quadro);
}
window.requestAnimationFrame(quadro);

window.addEventListener('beforeunload', () => cliente.fechar());
```

- [ ] **Step 5: Conferir que nada quebrou**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 6: Fumaça pelas rotas estáticas**

Run:
```bash
node server.mjs --demo --porta 7799 &
sleep 2
curl -s http://127.0.0.1:7799/ | head -2
curl -s -o /dev/null -w "escritorio.js %{http_code} " http://127.0.0.1:7799/escritorio.js
curl -s -o /dev/null -w "estilo.css %{http_code} " http://127.0.0.1:7799/estilo.css
curl -s -o /dev/null -w "atlas %{http_code}\n" http://127.0.0.1:7799/arte/atlas.json
kill %1
```
Expected: `<!doctype html>` na primeira linha e `escritorio.js 200 estilo.css 200 atlas 404` (o 404 do atlas é esperado até o Plano 3; o cliente cai no placeholder).

- [ ] **Step 7: Commit**

```bash
git add public/hud.js public/estilo.css public/index.html public/escritorio.js
git commit -m "feat: HUD, página e bootstrap do cliente do escritório" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Verificação visual com `--demo` e capturas

Sem framework de teste de navegador: a checagem usa o servidor em `--demo`, capturas do Chrome headless por linha de comando (geram PNG direto, sem depender de janela em primeiro plano) e, quando as ferramentas `mcp__claude-in-chrome` estiverem disponíveis, interação real (clique, teclado, idioma). Nenhuma captura pela janela do sistema (que exigiria o navegador em primeiro plano).

**Files:**
- Create: `docs/screenshots/demo-01.png` a `docs/screenshots/demo-04.png` (quatro momentos da demo) e `docs/screenshots/demo-reduzido.png` (com `prefers-reduced-motion` forçado)
- Modify: só o que a checagem revelar quebrado, pelo procedimento do Step 4 (teste que reproduz → correção mínima → `npm test` → commit `fix:` separado)

- [ ] **Step 1: Subir a demo e esperar o servidor responder**

Run:
```bash
mkdir -p docs/screenshots
node server.mjs --demo --porta 7777 &
until curl -sf http://127.0.0.1:7777/estado >/dev/null; do sleep 0.5; done
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7777/
curl -s http://127.0.0.1:7777/estado | grep -o '"advogados":\[{"id":"[^"]*"'
```
Expected: `200` e `"advogados":[{"id":"claude:demo-claude"` (a demo cria as cinco sessões, começando pela do Claude). O `&` deixa o servidor como job `%1` do shell; o `until` espera a porta abrir em vez de chutar um `sleep`.

- [ ] **Step 2: Capturas estáticas com o Chrome headless**

Run:
```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || CHROME="/Applications/Chromium.app/Contents/MacOS/Chromium"
[ -x "$CHROME" ] && echo "usando: $CHROME" || echo "sem Chrome nem Chromium: pule para o Step 3 e registre no relatório"
for n in 01 02 03 04; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 --virtual-time-budget=8000 \
    --screenshot="$PWD/docs/screenshots/demo-$n.png" http://127.0.0.1:7777
  sleep 10
done
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 --virtual-time-budget=8000 \
  --force-prefers-reduced-motion --screenshot="$PWD/docs/screenshots/demo-reduzido.png" http://127.0.0.1:7777
ls -1 docs/screenshots/
```
Expected: `demo-01.png` a `demo-04.png` e `demo-reduzido.png` listados (1280x800 cada). O `sleep 10` entre capturas dá tempo de a demo mudar as salas: quatro momentos diferentes do escritório. Se não existir nem Chrome nem Chromium, registre isso no relatório da tarefa e siga só com o Step 3.

Leia cada PNG com a ferramenta de leitura de imagem do agente e confira os itens 1 a 5, 8 e 9 da checklist do Step 3 (são visíveis numa captura parada).

- [ ] **Step 3: Checagens interativas e checklist**

Com as ferramentas `mcp__claude-in-chrome` disponíveis (carregue-as antes com uma única chamada de ToolSearch: `select:mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__javascript_tool`), abra uma aba em `http://127.0.0.1:7777` e percorra os itens 6, 7 e 10 (clique num personagem, Tab + Enter numa linha do painel, `Esc`, botão de idioma e recarga, console). A emulação de `prefers-reduced-motion` fica a cargo da captura `demo-reduzido.png` do Step 2 (flag `--force-prefers-reduced-motion`); na aba, confira com `javascript_tool` que `matchMedia('(prefers-reduced-motion: reduce)').matches` reflete a preferência do sistema e que nada dá erro.

Sem essas ferramentas:
```bash
curl -s http://127.0.0.1:7777/ | grep -c '<canvas'
```
Expected: `1`. Registre no relatório da tarefa, item por item, o que não pôde ser verificado (clique, teclado, idioma persistido, console).

Checklist:

1. As sete salas aparecem com rótulo: Recepção, Biblioteca, Gabinete de Redação, Sala de Revisão, Cartório, Sala de Reuniões e Copa.
2. Cinco advogados, um por CLI (claude, codex, grok, cursor, gemini), com crachás de cores diferentes, caminhando entre as salas pelo corredor — ninguém atravessa parede (compare as quatro capturas: posições mudam, sempre em corredor ou sala).
3. Pelo menos um estagiário orbitando o advogado e, quando ganha atividade, caminhando até a sala dela.
4. Balão com ferramenta e detalhe truncado em quem está `trabalhando`; indicadores `…`, `zzz`, `?` e `⏱` aparecem conforme o estado.
5. Painel lateral com o título `5 advogados`, agrupado por projeto, mostrando cargo, sala e estado; advogados acima de 24 apareceriam com "fora do mapa" (a demo tem 5, então só confira que o grupo e as linhas estão corretos). O canvas fica inteiro à esquerda do painel, sem parte escondida atrás dele.
6. A ficha do caso abre clicando no personagem e também com Tab até uma linha do painel + Enter; mostra caso, turno, CLI, modelo, cargo, sala, ações recentes, tokens e estagiários; `Esc` fecha. Com a ficha aberta, a lista do painel não pisca nem perde o foco a cada delta; fechada a ficha, o foco volta para a mesma linha.
7. O botão de idioma troca para en (título `5 lawyers`, rótulos "Drafting Office", "Reception"...) e o idioma continua depois de recarregar a página.
8. `demo-reduzido.png` (Chrome com `--force-prefers-reduced-motion`) renderiza as mesmas salas e personagens, sem erro. O não-balanço e a troca instantânea de sala são cobertos pelos testes de movimento reduzido em `personagens.js` e `render.js`; aqui basta a página carregar com a preferência forçada.
9. A barra mostra a saúde do adaptador `demo` em verde e a contagem de advogados por CLI.
10. O console tem no máximo um aviso, o da arte ausente (`sem arte em arte/...`), e nenhum erro. Ao matar o servidor com a aba aberta, o painel passa a mostrar "Sem conexão com o servidor" (e volta ao subir de novo).

- [ ] **Step 4: O que falhar vira teste, correção e commit próprios**

Para cada item que falhar, antes de repetir a checagem visual:

1. escreva no teste do módulo correspondente (`test/cliente-<módulo>.test.js`) um caso que reproduz o problema e falha;
2. faça a correção mínima em `public/<módulo>.js`;
3. rode `npm test` e veja tudo verde;
4. commit separado, `fix: <o que era e o que ficou>`, com o `Co-Authored-By`.

Só depois volte ao Step 2 (ou 3) para o item que falhou. Falha só na camada DOM (`hud.js`, `escritorio.js`), que não tem teste: descreva o caso no corpo do commit e, se der para mover a lógica para `hud-util.js`, mova e teste lá.

- [ ] **Step 5: Encerrar a demo e fechar o ciclo**

Run:
```bash
kill %1
npm test
```
Expected: o servidor da demo termina (`%1` é o job criado pelo `&` do Step 1; em outro shell, `pkill -f "server.mjs --demo --porta 7777"`) e `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add docs/screenshots
git commit -m "docs: capturas da verificação visual do cliente em modo demo" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Fora deste plano

- **Plano 3 (arte, docs e publicação):** `arte/manifesto.json`, `arte/paleta.png`, `arte/gerar.py` com gpt-image-2.5, `public/arte/atlas.json` e os PNGs, `docs/protocolo.md`, `docs/adaptadores.md`, `README.md`/`README.en.md`, GIF da demo e publicação no GitHub.
- Câmera, zoom, múltiplos andares, histórico e estatísticas: fora da v1 (seção 1 da spec).
- Interação com o agente pela tela (responder permissões): não objetivo da v1.

## Autorrevisão do plano

- **Cobertura da seção 8 da spec:** resolução 960x576 com `image-rendering: pixelated` (Tasks 3 e 9); layout com sete salas, portas, postos, móveis, corredor e grafo com BFS (Task 3); movimento interpolado, recálculo no meio do caminho e debounce de 1 s (Task 5); ocupação de postos e "em pé junto à porta" (Task 5); limites de 24 advogados e 6 estagiários com aviso "fora do mapa" (Tasks 5, 6 e 9); sprite por cargo, crachá por CLI, rótulo do projeto, balão, indicadores e overlay de digitação (Task 8); `prefers-reduced-motion` (Tasks 5, 8 e 9); barra com contagem por CLI, saúde por adaptador e idioma (Tasks 6 e 9); painel agrupado por projeto com desambiguação pelo diretório pai (Task 6); ficha com caso, turno, CLI, modelo, cargo, sala, ações recentes, tokens e estagiários, aberta por clique e por Enter, fechada com Esc, Tab percorrendo linhas e botões (Task 9); `textContent` em todo texto do servidor e `localStorage` em try/catch (Task 9).
- **Seções 5, 6, 12 e 13:** contrato do snapshot e dos deltas, descarte por `seq` e reconexão no salto (Task 4); estados, cargos e ids de sala exatamente como no servidor (Tasks 2, 3 e 5); arte ausente vira placeholder com aviso único (Task 7); verificação visual com `--demo` e checklist (Task 10).
- **Limites da seção 11:** o cliente respeita o teto de 8 clientes SSE mantendo **uma** conexão por aba e fechando a anterior antes de reabrir no salto de `seq` (Task 4); os limites de memória do mapa (24 e 6) estão em `personagens.js` como constantes exportadas e testadas (Task 5).
- **Varredura de placeholders:** todo passo que cria ou altera código traz o arquivo inteiro; não há "TBD", "similar à Task N" nem passo descrito sem comando. As únicas partes não automatizadas são a Task 10 (inspeção visual) e a camada DOM da Task 9, ambas com checklist e critério de aceitação explícitos.
- **Consistência de nomes entre tarefas:** `listarCrachas` (Task 1 → 6 → 8 → 9); `crachas` no snapshot (Task 1 → 4 → 8 → 9); `criarI18n`/`i18n.sala(id, rotuloDoServidor)` (Task 2 → 8 → 9); `SALAS`, `caminhoEntreNos`, `noMaisProximo`, `posicaoJuntoAPorta` (Task 3 → 5 → 8); `estadoInicial`/`aplicarMensagem`/`criarClienteFluxo` (Task 4 → 9); `criarElenco`, `sincronizar`, `atualizar`, `atores`, `movimentoReduzido` (Task 5 → 8 → 9); `crachaDe`, `descreverAtividade`, `truncar`, `formatarTokens`, `linhasDeSaude` (Task 6 → 8 → 9); `CORES` (Task 6 → 8 → 9); `escalaDaTela`, `LARGURA_PAINEL`, `ALTURA_BARRA` (Task 6 → 9); `noDaSala` (Task 3 → 5); `conectado` e a chave `semConexao` (Task 2 → 4 → 9); `criarSprites`/`quadro`/`idPersonagem` (Task 7 → 8 → 9); `desenharCena`/`atorEm` (Task 8 → 9).
- **Ordem de execução:** Task 1 é independente do resto e pode ir primeiro; 2 a 8 são incrementais e cada uma fecha com o próprio teste; 9 depende de 2 a 8; 10 depende de 9 e do `--demo` do Plano 1 (Task 16).
- **Revisão externa: 12 correções aplicadas em 2026-09-21.** B1 (o servidor já emite `saude` a cada tique com saúde suja: registrado na Task 1 sem repetir código; redutor e HUD o consomem), I1 (foco preservado na reconstrução do painel e lista congelada com a ficha aberta), I2 (`cores.js` como único lugar de cores; `sprites.js` sem cores), I3 (procedimento teste → correção → `npm test` → commit `fix:` na Task 10), I4 (demo esperada com `until curl`, capturas por Chrome headless em linha de comando, checagens interativas pelo `mcp__claude-in-chrome` ou registro do que faltou, sem captura pela janela do sistema, `kill %1` explicado), I5 (`escalaDaTela` pura em `hud-util.js`, com escala < 1 e desconto da barra e do painel), M1 (`caminhoEntreSalas` e `centroDaSala` removidos; o teste de conectividade passou a usar `caminhoEntreNos` + `noDaSala`), M2 (título do painel com `advogados`/`lawyers`), M3 (filtro de estagiários calculado uma vez; `foraDoMapa` só com advogados), M4 (rota recalculada a partir da aresta atual, sem andar para trás; teste em (14, 9.2) subindo), M5 (prosa do corredor pelos eixos `x = 14`, `7` e `21` de `NOS`), M6 (`conectado` no estado do fluxo, `semConexao` no painel e caso no teste do redutor). Testes do cliente: 54 (i18n 5, mundo 9, fluxo 7, personagens 9, hud-util 10, sprites 7, render 7); Task 1: 12 (5 de cargos e 7 de app).
