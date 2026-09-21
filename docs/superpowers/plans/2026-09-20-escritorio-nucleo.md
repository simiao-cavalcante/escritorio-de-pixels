# Escritório de Pixels — Plano 1: Núcleo (servidor, protocolo, estado, tradutores, instaladores)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servidor local sem dependências que recebe eventos de várias CLIs de agentes (Claude Code, Codex, Grok, Cursor, Gemini), mantém o estado do escritório (advogados, estagiários, salas) e o transmite por SSE, com instaladores de hooks e modo demo.

**Architecture:** Hooks nativos de cada CLI fazem POST em `/hook/<cli>`; tradutores convertem o payload nativo em eventos v1; `protocolo.js` valida e trunca; `estado.js` aplica a máquina de estados e resolve salas e cargos a partir de `salas.json` e `cargos.json`; `fluxo.js` transmite snapshot e deltas numerados por Server-Sent Events. O cliente Canvas (Plano 2) e a arte (Plano 3) consomem só o contrato SSE e o `atlas.json`.

**Tech Stack:** Node.js >= 20, ESM, `node:http`, `node:test` + `node:assert/strict`. Zero dependências em runtime.

Spec: `docs/superpowers/specs/2026-09-20-escritorio-de-pixels-design.md` (seções 3 a 7 e 10 a 13).

## Global Constraints

- Node `>= 20`; `"type": "module"`; nenhuma dependência de runtime em `package.json`.
- Servidor escuta só em `127.0.0.1`; porta padrão `7777`; sem modo remoto.
- `Host` aceito: `127.0.0.1:<porta>`, `localhost:<porta>`, `[::1]:<porta>`; outro → `421`. `Origin` ausente ou local; externo → `403`.
- Limites: corpo `64 KB` em `/eventos`, `4 MB` em `/hook/*` (→ `413`); `detalhe` 120, `prompt` 200, `descricao` 120 caracteres; leitura de transcrito `64 KB`.
- Identidade do advogado: `cli:sessao`; do estagiário: `cli:sessao:agente.id`.
- Salas fixas: `recepcao`, `biblioteca`, `gabinete`, `revisao`, `cartorio`, `reunioes`, `copa`. Cargos: `junior`, `socio`, `senior`, `associado`, `advogado`.
- Nada do conteúdo observado é gravado em disco. Instaladores só tocam arquivos de hooks (com backup e escrita atômica) e `~/.escritorio-de-pixels/config.json`.
- Identificadores de domínio em português (advogado, estagiario, sala, cargo, caso); comentários curtos em português.
- Cada tarefa termina com `npm test` verde e um commit.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `package.json`, `.gitignore`, `LICENSE`, `.github/workflows/ci.yml` | pacote, ignorados, MIT, CI |
| `src/config.js` | porta, caminhos, URL e comando `curl` dos hooks, diretórios permitidos de transcritos |
| `src/protocolo.js` | `normalizarEvento`, `normalizarLote`, `truncar`, `TIPOS`, `LIMITES` |
| `src/salas.js` + `salas.json` | `validarConfigSalas`, `criarResolvedor`, `carregarSalas`, `SALAS`, `SALAS_EMBUTIDAS` |
| `src/cargos.js` + `cargos.json` | `validarConfigCargos`, `criarClassificador`, `carregarCargos`, `CARGOS_EMBUTIDOS` |
| `src/estado.js` | classe `Escritorio`: `aplicar(evento)`, `tique()`, `snapshot()`; limites e temporizações |
| `src/tradutores/comum.js` | `detectarEnvelope`, `campo`, `resumirEntrada`, `base`, `evento`, `criarDeduplicador`, `lerCauda`, `dentroDe` |
| `src/tradutores/claude.js` | `criarTradutorClaude` (payload snake_case → eventos v1) e `lerTokensClaude` |
| `src/tradutores/codex.js` | `criarTradutorCodex` (reusa o do Claude) e `lerTokensCodex` |
| `src/tradutores/grok.js` | `criarTradutorGrok` (envelope camelCase com nomes snake_case) |
| `src/tradutores/cursor.js` | `criarTradutorCursor` (eventos camelCase) |
| `src/tradutores/gemini.js` | `criarTradutorGemini` |
| `src/fluxo.js` | `criarFluxo`: SSE com `seq`, heartbeat, limite de clientes e de buffer |
| `src/app.js` | `criarAplicacao`: servidor http, rotas, checagens de `Host`/`Origin`, limites, `/saude`, estáticos |
| `server.mjs` | CLI: `instalar`, `desinstalar`, `--porta`, `--demo`, `--sem-transcritos`, `--ocultar-prompts` |
| `src/demo.js` | `iniciarDemo`: sessões sintéticas determinísticas |
| `src/instalar.js` + `adaptadores/*.hooks.json` | `mesclar`, `remover`, `instalar`, `desinstalar` por CLI; amostras geradas |
| `scripts/capturar.mjs`, `scripts/sanitizar-fixtures.mjs` | captura de payloads reais e anonimização |
| `test/*.test.js`, `test/fixtures/<cli>/*.json` | testes e fixtures |

---

### Task 1: Scaffold do pacote e `src/config.js`

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE`, `.github/workflows/ci.yml`, `src/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: `PORTA_PADRAO = 7777`; `caminhoConfig(home)`; `lerConfig(home) → { porta, portaInstalada }`; `gravarConfig(config, home)`; `urlHook(cli, porta) → string`; `comandoCurl(cli, porta) → string`; `dirsTranscritos(home) → { claude: string[], codex: string[] }`.

- [ ] **Step 1: Criar `package.json`, `.gitignore`, `LICENSE` e CI**

`package.json`:

```json
{
  "name": "escritorio-de-pixels",
  "version": "0.1.0",
  "description": "Escritório de advocacia em pixel art que mostra, em tempo real, o trabalho de agentes de IA (Claude Code, Codex, Grok, Cursor, Gemini).",
  "type": "module",
  "bin": { "escritorio-de-pixels": "./server.mjs" },
  "files": ["server.mjs", "src/", "public/", "salas.json", "cargos.json", "adaptadores/", "docs/protocolo.md", "docs/adaptadores.md", "README.md", "README.en.md", "LICENSE"],
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "node server.mjs",
    "demo": "node server.mjs --demo",
    "test": "node --test test/"
  },
  "license": "MIT"
}
```

`.gitignore`:

```
node_modules/
.DS_Store
*.log
.env
/tmp/
test/fixtures/brutos/
```

`LICENSE`: texto MIT padrão com `Copyright (c) 2026 Simião Cavalcante`.

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
```

- [ ] **Step 2: Escrever o teste de `config.js`**

`test/config.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PORTA_PADRAO, lerConfig, gravarConfig, urlHook, comandoCurl, dirsTranscritos, caminhoConfig } from '../src/config.js';

test('lerConfig devolve a porta padrão quando não há arquivo', () => {
  const home = mkdtempSync(join(tmpdir(), 'edp-'));
  assert.deepEqual(lerConfig(home), { porta: PORTA_PADRAO, portaInstalada: undefined });
});

test('gravarConfig e lerConfig fazem ida e volta', () => {
  const home = mkdtempSync(join(tmpdir(), 'edp-'));
  gravarConfig({ porta: 7800, portaInstalada: 7800 }, home);
  assert.deepEqual(lerConfig(home), { porta: 7800, portaInstalada: 7800 });
  assert.equal(caminhoConfig(home), join(home, '.escritorio-de-pixels', 'config.json'));
});

test('urlHook e comandoCurl apontam para o servidor local', () => {
  assert.equal(urlHook('claude', 7777), 'http://127.0.0.1:7777/hook/claude');
  const cmd = comandoCurl('codex', 7800);
  assert.match(cmd, /^curl -s -m 2 /);
  assert.match(cmd, /http:\/\/127\.0\.0\.1:7800\/hook\/codex/);
  assert.match(cmd, /\|\| true$/);
});

test('dirsTranscritos usa o home informado', () => {
  const d = dirsTranscritos('/casa');
  assert.deepEqual(d.claude, ['/casa/.claude/projects']);
  assert.deepEqual(d.codex, ['/casa/.codex/sessions', '/casa/.codex/archived_sessions']);
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npm test`
Expected: FAIL com `Cannot find module '../src/config.js'`.

- [ ] **Step 4: Implementar `src/config.js`**

```js
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';

export const PORTA_PADRAO = 7777;

export function caminhoConfig(home = homedir()) {
  return join(home, '.escritorio-de-pixels', 'config.json');
}

export function lerConfig(home = homedir()) {
  try {
    const bruto = JSON.parse(readFileSync(caminhoConfig(home), 'utf8'));
    return {
      porta: Number.isInteger(bruto.porta) ? bruto.porta : PORTA_PADRAO,
      portaInstalada: Number.isInteger(bruto.portaInstalada) ? bruto.portaInstalada : undefined,
    };
  } catch {
    return { porta: PORTA_PADRAO, portaInstalada: undefined };
  }
}

export function gravarConfig(config, home = homedir()) {
  const caminho = caminhoConfig(home);
  mkdirSync(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(tmp, caminho);
}

export function urlHook(cli, porta) {
  return `http://127.0.0.1:${porta}/hook/${cli}`;
}

/** Comando para hooks do tipo command: nunca bloqueia (timeout 2 s) e nunca falha (|| true). */
export function comandoCurl(cli, porta) {
  return `curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- ${urlHook(cli, porta)} >/dev/null 2>&1 || true`;
}

/** Diretórios de onde cada tradutor pode ler transcritos (seção 10 da spec). */
export function dirsTranscritos(home = homedir()) {
  return {
    claude: [join(home, '.claude', 'projects')],
    codex: [join(home, '.codex', 'sessions'), join(home, '.codex', 'archived_sessions')],
  };
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npm test`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore LICENSE .github/workflows/ci.yml src/config.js test/config.test.js
git commit -m "feat: scaffold do pacote e configuração local"
```

---

### Task 2: `src/protocolo.js` — validação e normalização do evento v1

**Files:**
- Create: `src/protocolo.js`
- Test: `test/protocolo.test.js`

**Interfaces:**
- Produces: `TIPOS` (array congelado dos 10 tipos); `LIMITES` (`{ detalhe: 120, prompt: 200, descricao: 120, sessao: 200, nome: 80, corpoEventos: 65536, corpoHook: 4194304 }`); `truncar(texto, max) → string | undefined`; `normalizarEvento(bruto, agora?) → { ok: true, evento } | { ok: false, erro }`; `normalizarLote(corpo, agora?) → { eventos, rejeitados: [{ indice, erro }] }`.
- Evento normalizado: `{ v: 1, tipo, cli, sessao, ts (ISO), cwd?, projeto?, modelo?, origem?, prompt?, ferramenta?: { nome, detalhe?, id?, ok? }, agente?: { id, tipo?, descricao? }, tokens?: { contexto?, janela?, saidaTotal?, saidaIncremento? }, motivo? }`.

- [ ] **Step 1: Escrever os testes**

`test/protocolo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEvento, normalizarLote, truncar, TIPOS, LIMITES } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const base = { v: 1, cli: 'claude', sessao: 's1' };

test('truncar colapsa espaços e corta com reticência', () => {
  assert.equal(truncar('  a   b  ', 10), 'a b');
  assert.equal(truncar('x'.repeat(130), 120).length, 120);
  assert.equal(truncar('x'.repeat(130), 120).at(-1), '…');
  assert.equal(truncar(42, 10), undefined);
});

test('rejeita evento sem v, tipo, cli ou sessao válidos', () => {
  assert.equal(normalizarEvento(null).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'parado', v: 2 }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'voar' }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'parado', cli: 'Claude Code' }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'parado', sessao: '' }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'parado', ts: 'ontem' }).ok, false);
});

test('preenche ts com o relógio quando ausente e normaliza quando presente', () => {
  const r = normalizarEvento({ ...base, tipo: 'parado' }, agora);
  assert.equal(r.ok, true);
  assert.equal(r.evento.ts, '2026-09-20T12:00:00.000Z');
  const r2 = normalizarEvento({ ...base, tipo: 'parado', ts: '2026-09-20T09:00:00-03:00' }, agora);
  assert.equal(r2.evento.ts, '2026-09-20T12:00:00.000Z');
});

test('prompt exige texto e é truncado a 200', () => {
  assert.equal(normalizarEvento({ ...base, tipo: 'prompt' }).ok, false);
  const r = normalizarEvento({ ...base, tipo: 'prompt', prompt: 'p'.repeat(300) }, agora);
  assert.equal(r.evento.prompt.length, LIMITES.prompt);
});

test('ferramenta exige nome; detalhe truncado; agente opcional', () => {
  assert.equal(normalizarEvento({ ...base, tipo: 'ferramenta.inicio', ferramenta: {} }).ok, false);
  const r = normalizarEvento({
    ...base, tipo: 'ferramenta.inicio',
    ferramenta: { nome: 'Edit', detalhe: 'd'.repeat(200), id: 't1' },
    agente: { id: 'a1', tipo: 'Explore' },
  }, agora);
  assert.equal(r.ok, true);
  assert.equal(r.evento.ferramenta.detalhe.length, LIMITES.detalhe);
  assert.deepEqual(r.evento.agente, { id: 'a1', tipo: 'Explore' });
  const semAgente = normalizarEvento({ ...base, tipo: 'ferramenta.fim', ferramenta: { nome: 'Edit', ok: false }, agente: { tipo: 'x' } }, agora);
  assert.equal(semAgente.evento.agente, undefined);
  assert.equal(semAgente.evento.ferramenta.ok, false);
});

test('subagente exige agente.id; tokens exige ao menos um número', () => {
  assert.equal(normalizarEvento({ ...base, tipo: 'subagente.inicio', agente: { tipo: 'x' } }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'tokens', tokens: {} }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'tokens', tokens: { contexto: -1 } }).ok, false);
  const r = normalizarEvento({ ...base, tipo: 'tokens', tokens: { contexto: 10, saidaIncremento: 3, lixo: 1 } }, agora);
  assert.deepEqual(r.evento.tokens, { contexto: 10, saidaIncremento: 3 });
});

test('campos comuns opcionais: cwd, projeto, modelo, origem, motivo', () => {
  const r = normalizarEvento({ ...base, tipo: 'sessao.inicio', cwd: '/x/y', modelo: 'claude-opus-5', origem: 'startup' }, agora);
  assert.equal(r.evento.cwd, '/x/y');
  assert.equal(r.evento.modelo, 'claude-opus-5');
  assert.equal(r.evento.origem, 'startup');
  const a = normalizarEvento({ ...base, tipo: 'aguardando', motivo: 'permissao' }, agora);
  assert.equal(a.evento.motivo, 'permissao');
});

test('normalizarLote aceita objeto ou array e separa rejeitados por índice', () => {
  const r = normalizarLote([{ ...base, tipo: 'parado' }, { ...base, tipo: 'nada' }, { ...base, tipo: 'prompt', prompt: 'oi' }], agora);
  assert.equal(r.eventos.length, 2);
  assert.deepEqual(r.rejeitados.map((x) => x.indice), [1]);
  assert.equal(normalizarLote({ ...base, tipo: 'parado' }, agora).eventos.length, 1);
  assert.equal(TIPOS.length, 10);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/protocolo.test.js`
Expected: FAIL com `Cannot find module '../src/protocolo.js'`.

- [ ] **Step 3: Implementar `src/protocolo.js`**

```js
export const TIPOS = Object.freeze([
  'sessao.inicio', 'sessao.fim', 'prompt', 'ferramenta.inicio', 'ferramenta.fim',
  'subagente.inicio', 'subagente.fim', 'tokens', 'aguardando', 'parado',
]);

export const LIMITES = Object.freeze({
  detalhe: 120, prompt: 200, descricao: 120, sessao: 200, nome: 80,
  corpoEventos: 64 * 1024, corpoHook: 4 * 1024 * 1024,
});

const CLI_RE = /^[a-z0-9_-]{1,32}$/;

export function truncar(texto, max) {
  if (typeof texto !== 'string') return undefined;
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  return `${limpo.slice(0, max - 1)}…`;
}

function textoOpcional(v, max) {
  return typeof v === 'string' && v.length ? truncar(v, max) : undefined;
}

function numeroOpcional(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function normalizarAgente(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id) return undefined;
  const agente = { id: truncar(a.id, 120) };
  const tipo = textoOpcional(a.tipo, 60);
  if (tipo) agente.tipo = tipo;
  const descricao = textoOpcional(a.descricao, LIMITES.descricao);
  if (descricao) agente.descricao = descricao;
  return agente;
}

export function normalizarEvento(bruto, agora = () => Date.now()) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { ok: false, erro: 'evento deve ser um objeto' };
  if (bruto.v !== 1) return { ok: false, erro: 'v deve ser 1' };
  if (!TIPOS.includes(bruto.tipo)) return { ok: false, erro: `tipo desconhecido: ${String(bruto.tipo)}` };
  if (typeof bruto.cli !== 'string' || !CLI_RE.test(bruto.cli)) return { ok: false, erro: 'cli inválido' };
  if (typeof bruto.sessao !== 'string' || !bruto.sessao.length || bruto.sessao.length > LIMITES.sessao) return { ok: false, erro: 'sessao inválida' };

  let ts = new Date(agora()).toISOString();
  if (bruto.ts !== undefined) {
    const d = new Date(bruto.ts);
    if (Number.isNaN(d.getTime())) return { ok: false, erro: 'ts inválido' };
    ts = d.toISOString();
  }

  const evento = { v: 1, tipo: bruto.tipo, cli: bruto.cli, sessao: bruto.sessao, ts };
  if (typeof bruto.cwd === 'string' && bruto.cwd) evento.cwd = bruto.cwd;
  const projeto = textoOpcional(bruto.projeto, 80);
  if (projeto) evento.projeto = projeto;
  const modelo = textoOpcional(bruto.modelo, 80);
  if (modelo) evento.modelo = modelo;

  switch (bruto.tipo) {
    case 'sessao.inicio': {
      const origem = textoOpcional(bruto.origem, 40);
      if (origem) evento.origem = origem;
      break;
    }
    case 'prompt': {
      if (typeof bruto.prompt !== 'string') return { ok: false, erro: 'prompt exige texto' };
      evento.prompt = truncar(bruto.prompt, LIMITES.prompt) ?? '';
      break;
    }
    case 'ferramenta.inicio':
    case 'ferramenta.fim': {
      const f = bruto.ferramenta;
      if (!f || typeof f !== 'object' || typeof f.nome !== 'string' || !f.nome) return { ok: false, erro: 'ferramenta.nome obrigatório' };
      evento.ferramenta = { nome: truncar(f.nome, LIMITES.nome) };
      const detalhe = textoOpcional(f.detalhe, LIMITES.detalhe);
      if (detalhe) evento.ferramenta.detalhe = detalhe;
      const id = textoOpcional(f.id, 120);
      if (id) evento.ferramenta.id = id;
      if (typeof f.ok === 'boolean') evento.ferramenta.ok = f.ok;
      const agente = normalizarAgente(bruto.agente);
      if (agente) evento.agente = agente;
      break;
    }
    case 'subagente.inicio':
    case 'subagente.fim': {
      const agente = normalizarAgente(bruto.agente);
      if (!agente) return { ok: false, erro: 'agente.id obrigatório' };
      evento.agente = agente;
      break;
    }
    case 'tokens': {
      const t = bruto.tokens;
      if (!t || typeof t !== 'object') return { ok: false, erro: 'tokens obrigatório' };
      evento.tokens = {};
      for (const campo of ['contexto', 'janela', 'saidaTotal', 'saidaIncremento']) {
        const n = numeroOpcional(t[campo]);
        if (n !== undefined) evento.tokens[campo] = n;
      }
      if (!Object.keys(evento.tokens).length) return { ok: false, erro: 'tokens sem campos numéricos' };
      break;
    }
    case 'aguardando': {
      const motivo = textoOpcional(bruto.motivo, 40);
      if (motivo) evento.motivo = motivo;
      break;
    }
    default:
      break;
  }
  return { ok: true, evento };
}

export function normalizarLote(corpo, agora) {
  const lista = Array.isArray(corpo) ? corpo : [corpo];
  const eventos = [];
  const rejeitados = [];
  lista.forEach((bruto, indice) => {
    const r = normalizarEvento(bruto, agora);
    if (r.ok) eventos.push(r.evento);
    else rejeitados.push({ indice, erro: r.erro });
  });
  return { eventos, rejeitados };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/protocolo.test.js`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/protocolo.js test/protocolo.test.js
git commit -m "feat: protocolo de eventos v1 com validação e truncamento"
```

---

### Task 3: `src/salas.js` e `salas.json` — regras ferramenta → sala

**Files:**
- Create: `src/salas.js`, `salas.json`
- Test: `test/salas.test.js`

**Interfaces:**
- Produces: `SALAS` (array congelado dos 7 ids); `FERRAMENTAS_AGENTE = ['Agent', 'Task', 'spawn_subagent']`; `SALAS_EMBUTIDAS` (objeto igual ao `salas.json`); `validarConfigSalas(obj) → { ok: true, config } | { ok: false, erro }`; `extrairSkill(ferramenta) → string | undefined`; `criarResolvedor(config) → { resolverSala(ferramenta), salaInicialEstagiario(tipo) }`; `carregarSalas(caminho, { aoErro, watch }) → { resolverSala, salaInicialEstagiario, recarregar, fechar }`.
- `ferramenta` tem a forma `{ nome, detalhe? }` do evento normalizado. Para `Agent`/`Task`, o tradutor monta `detalhe = "<subagent_type>: <description>"`; para `Skill`, `detalhe = "<skill> <args>"`.

- [ ] **Step 1: Escrever os testes**

`test/salas.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SALAS, SALAS_EMBUTIDAS, validarConfigSalas, criarResolvedor, extrairSkill, carregarSalas } from '../src/salas.js';

const padrao = () => criarResolvedor(validarConfigSalas(SALAS_EMBUTIDAS).config);

test('regras embutidas são válidas e cobrem as ferramentas principais', () => {
  const { resolverSala } = padrao();
  assert.equal(SALAS.length, 7);
  assert.equal(resolverSala({ nome: 'Read', detalhe: 'a.md' }), 'biblioteca');
  assert.equal(resolverSala({ nome: 'WebSearch', detalhe: 'x' }), 'biblioteca');
  assert.equal(resolverSala({ nome: 'Edit', detalhe: 'a.md' }), 'gabinete');
  assert.equal(resolverSala({ nome: 'Bash', detalhe: 'npm test' }), 'cartorio');
  assert.equal(resolverSala({ nome: 'Agent', detalhe: 'Explore: achar x' }), 'reunioes');
  assert.equal(resolverSala({ nome: 'mcp__github__search' }), 'reunioes');
  assert.equal(resolverSala({ nome: 'mcp__brave-search__web' }), 'biblioteca');
  assert.equal(resolverSala({ nome: 'FerramentaNova' }), 'recepcao');
});

test('precedência: skill > agentes > detalhe > exata > prefixo', () => {
  const { resolverSala } = padrao();
  assert.equal(resolverSala({ nome: 'Skill', detalhe: 'proprio-punho minutar contestação' }), 'gabinete');
  assert.equal(resolverSala({ nome: 'Skill', detalhe: 'informativo-stj 800' }), 'biblioteca');
  assert.equal(resolverSala({ nome: 'Skill', detalhe: 'desconhecida' }), 'recepcao');
  assert.equal(resolverSala({ nome: 'Agent', detalhe: 'code-reviewer: revisar diff' }), 'revisao');
  assert.equal(resolverSala({ nome: 'Agent', detalhe: 'Explore: procurar review antigo' }), 'reunioes');
  assert.equal(resolverSala({ nome: 'Bash', detalhe: 'rg "prescrição" src/' }), 'biblioteca');
  assert.equal(extrairSkill({ nome: 'Skill', detalhe: 'julgado arq.pdf' }), 'julgado');
  assert.equal(extrairSkill({ nome: 'Read', detalhe: 'x' }), undefined);
});

test('salaInicialEstagiario usa a regra de agentes', () => {
  const { salaInicialEstagiario } = padrao();
  assert.equal(salaInicialEstagiario('security-reviewer'), 'revisao');
  assert.equal(salaInicialEstagiario('Explore'), 'reunioes');
  assert.equal(salaInicialEstagiario(undefined), 'reunioes');
});

test('validação rejeita o arquivo inteiro: sala inexistente, regex inválida, regra ambígua', () => {
  assert.equal(validarConfigSalas({ versao: 1, padrao: 'recepcao', regras: [{ sala: 'sotao', ferramentas: ['X'] }] }).ok, false);
  assert.equal(validarConfigSalas({ versao: 1, padrao: 'recepcao', regras: [{ sala: 'revisao', agentes: '(' }] }).ok, false);
  assert.equal(validarConfigSalas({ versao: 1, padrao: 'recepcao', regras: [{ sala: 'revisao', skills: ['a'], prefixos: ['b'] }] }).ok, false);
  assert.equal(validarConfigSalas({ versao: 2, padrao: 'recepcao', regras: [] }).ok, false);
  assert.equal(validarConfigSalas({ versao: 1, padrao: 'copa', regras: [] }).ok, true);
});

test('empate na mesma prioridade: primeira regra do arquivo vence; prefixo mais longo vence', () => {
  const cfg = validarConfigSalas({ versao: 1, padrao: 'recepcao', regras: [
    { sala: 'gabinete', ferramentas: ['X'] },
    { sala: 'cartorio', ferramentas: ['X'] },
    { sala: 'reunioes', prefixos: ['mcp__'] },
    { sala: 'biblioteca', prefixos: ['mcp__docs__'] },
  ] }).config;
  const { resolverSala } = criarResolvedor(cfg);
  assert.equal(resolverSala({ nome: 'X' }), 'gabinete');
  assert.equal(resolverSala({ nome: 'mcp__docs__ler' }), 'biblioteca');
});

test('carregarSalas cai nas embutidas se o arquivo é inválido e recarrega quando válido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const caminho = join(dir, 'salas.json');
  writeFileSync(caminho, '{ inválido');
  const erros = [];
  const salas = carregarSalas(caminho, { aoErro: (m) => erros.push(m), watch: false });
  assert.equal(erros.length, 1);
  assert.equal(salas.resolverSala({ nome: 'Read' }), 'biblioteca');
  writeFileSync(caminho, JSON.stringify({ versao: 1, padrao: 'copa', regras: [{ sala: 'gabinete', ferramentas: ['Read'] }] }));
  assert.equal(salas.recarregar(), true);
  assert.equal(salas.resolverSala({ nome: 'Read' }), 'gabinete');
  assert.equal(salas.resolverSala({ nome: 'Outra' }), 'copa');
  writeFileSync(caminho, JSON.stringify({ versao: 1, padrao: 'sotao', regras: [] }));
  assert.equal(salas.recarregar(), false);
  assert.equal(salas.resolverSala({ nome: 'Read' }), 'gabinete');
  salas.fechar();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/salas.test.js`
Expected: FAIL com `Cannot find module '../src/salas.js'`.

- [ ] **Step 3: Implementar `src/salas.js`**

```js
import { readFileSync, watch as fsWatch } from 'node:fs';

export const SALAS = Object.freeze(['recepcao', 'biblioteca', 'gabinete', 'revisao', 'cartorio', 'reunioes', 'copa']);
export const FERRAMENTAS_AGENTE = Object.freeze(['Agent', 'Task', 'spawn_subagent']);

export const SALAS_EMBUTIDAS = Object.freeze({
  versao: 1,
  padrao: 'recepcao',
  regras: [
    { sala: 'gabinete', skills: ['proprio-punho', 'material', 'ebook*', 'probook-progrupo'] },
    { sala: 'biblioteca', skills: ['julgado', 'informativo-*', 'find-skills'] },
    { sala: 'revisao', skills: ['code-review', 'security-review', 'simplify', 'codex:rescue'] },
    { sala: 'revisao', agentes: 'review|reviewer|verifier|checker|auditor|rescue' },
    { sala: 'biblioteca', detalhe: { ferramenta: 'Bash', regex: '\\b(rg|grep|find)\\b' } },
    { sala: 'biblioteca', ferramentas: ['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch', 'read_file', 'grep_search', 'grep', 'list_dir', 'codebase_search', 'web_search', 'google_web_search'] },
    { sala: 'gabinete', ferramentas: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch', 'write_file', 'edit_file', 'replace', 'search_replace'] },
    { sala: 'cartorio', ferramentas: ['Bash', 'shell', 'exec_command', 'run_terminal_cmd', 'run_terminal_command', 'run_shell_command'] },
    { sala: 'reunioes', ferramentas: ['Agent', 'Task', 'Workflow', 'SendMessage', 'spawn_subagent'] },
    { sala: 'biblioteca', prefixos: ['mcp__brave-search__', 'mcp__context7__'] },
    { sala: 'reunioes', prefixos: ['mcp__'] },
  ],
});

function globParaRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

const CHAVES = ['skills', 'agentes', 'detalhe', 'ferramentas', 'prefixos'];

export function validarConfigSalas(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, erro: 'config deve ser um objeto' };
  if (obj.versao !== 1) return { ok: false, erro: 'versao deve ser 1' };
  if (!SALAS.includes(obj.padrao)) return { ok: false, erro: `padrao desconhecido: ${String(obj.padrao)}` };
  if (!Array.isArray(obj.regras)) return { ok: false, erro: 'regras deve ser uma lista' };
  const c = { padrao: obj.padrao, skills: [], agentes: [], detalhe: [], ferramentas: new Map(), prefixos: [] };
  for (const [i, r] of obj.regras.entries()) {
    const onde = `regra ${i}`;
    if (!r || typeof r !== 'object' || !SALAS.includes(r.sala)) return { ok: false, erro: `${onde}: sala inválida` };
    const chaves = CHAVES.filter((k) => r[k] !== undefined);
    if (chaves.length !== 1) return { ok: false, erro: `${onde}: use exatamente um de ${CHAVES.join(', ')}` };
    try {
      if (r.skills !== undefined) {
        if (!Array.isArray(r.skills) || !r.skills.length || !r.skills.every((s) => typeof s === 'string' && s)) throw new Error('skills deve ser lista de textos');
        for (const s of r.skills) c.skills.push({ re: globParaRegex(s), sala: r.sala });
      } else if (r.agentes !== undefined) {
        if (typeof r.agentes !== 'string' || !r.agentes) throw new Error('agentes deve ser regex em texto');
        c.agentes.push({ re: new RegExp(r.agentes, 'i'), sala: r.sala });
      } else if (r.detalhe !== undefined) {
        if (!r.detalhe || typeof r.detalhe.ferramenta !== 'string' || typeof r.detalhe.regex !== 'string') throw new Error('detalhe exige ferramenta e regex');
        c.detalhe.push({ ferramenta: r.detalhe.ferramenta, re: new RegExp(r.detalhe.regex, 'i'), sala: r.sala });
      } else if (r.ferramentas !== undefined) {
        if (!Array.isArray(r.ferramentas) || !r.ferramentas.length) throw new Error('ferramentas deve ser lista');
        for (const f of r.ferramentas) if (!c.ferramentas.has(f)) c.ferramentas.set(f, r.sala);
      } else {
        if (!Array.isArray(r.prefixos) || !r.prefixos.length) throw new Error('prefixos deve ser lista');
        for (const p of r.prefixos) c.prefixos.push({ prefixo: p, sala: r.sala });
      }
    } catch (e) {
      return { ok: false, erro: `${onde}: ${e.message}` };
    }
  }
  // Prefixo mais longo vence; sort estável mantém a ordem do arquivo entre iguais.
  c.prefixos.sort((a, b) => b.prefixo.length - a.prefixo.length);
  return { ok: true, config: c };
}

export function extrairSkill(ferramenta) {
  if (!ferramenta || ferramenta.nome !== 'Skill' || !ferramenta.detalhe) return undefined;
  return ferramenta.detalhe.split(/\s+/)[0];
}

export function criarResolvedor(config) {
  function resolverSala(ferramenta) {
    const skill = extrairSkill(ferramenta);
    if (skill) for (const r of config.skills) if (r.re.test(skill)) return r.sala;
    if (FERRAMENTAS_AGENTE.includes(ferramenta.nome) && ferramenta.detalhe) {
      const tipo = ferramenta.detalhe.split(':')[0];
      for (const r of config.agentes) if (r.re.test(tipo)) return r.sala;
    }
    if (ferramenta.detalhe) {
      for (const r of config.detalhe) if (r.ferramenta === ferramenta.nome && r.re.test(ferramenta.detalhe)) return r.sala;
    }
    const exata = config.ferramentas.get(ferramenta.nome);
    if (exata) return exata;
    for (const r of config.prefixos) if (ferramenta.nome.startsWith(r.prefixo)) return r.sala;
    return config.padrao;
  }
  function salaInicialEstagiario(tipo) {
    if (tipo) for (const r of config.agentes) if (r.re.test(tipo)) return r.sala;
    return 'reunioes';
  }
  return { resolverSala, salaInicialEstagiario };
}

export function carregarSalas(caminho, { aoErro = () => {}, watch = true } = {}) {
  let atual = criarResolvedor(validarConfigSalas(SALAS_EMBUTIDAS).config);
  function recarregar() {
    let bruto;
    try {
      bruto = JSON.parse(readFileSync(caminho, 'utf8'));
    } catch (e) {
      aoErro(`salas.json ilegível (${e.message}); mantendo regras anteriores`);
      return false;
    }
    const v = validarConfigSalas(bruto);
    if (!v.ok) {
      aoErro(`salas.json inválido: ${v.erro}; mantendo regras anteriores`);
      return false;
    }
    atual = criarResolvedor(v.config);
    return true;
  }
  recarregar();
  let watcher;
  let timer;
  if (watch) {
    try {
      watcher = fsWatch(caminho, () => {
        clearTimeout(timer);
        timer = setTimeout(recarregar, 300);
      });
    } catch {
      /* arquivo ausente: segue com as regras embutidas */
    }
  }
  return {
    resolverSala: (f) => atual.resolverSala(f),
    salaInicialEstagiario: (t) => atual.salaInicialEstagiario(t),
    recarregar,
    fechar: () => { clearTimeout(timer); watcher?.close(); },
  };
}
```

- [ ] **Step 4: Gerar `salas.json` a partir das embutidas**

Run: `node -e "import('./src/salas.js').then(m => require('fs').writeFileSync('salas.json', JSON.stringify(m.SALAS_EMBUTIDAS, null, 2) + '\n'))"`
Expected: arquivo `salas.json` criado, começando por `{ "versao": 1, "padrao": "recepcao", "regras": [`.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test test/salas.test.js`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/salas.js salas.json test/salas.test.js
git commit -m "feat: regras de salas por fase jurídica com validação atômica e recarga"
```

---

### Task 4: `src/cargos.js` e `cargos.json` — modelo → cargo, CLI → crachá

**Files:**
- Create: `src/cargos.js`, `cargos.json`
- Test: `test/cargos.test.js`

**Interfaces:**
- Produces: `CARGOS = ['junior', 'socio', 'senior', 'associado', 'advogado']`; `CARGOS_EMBUTIDOS`; `validarConfigCargos(obj) → { ok, config | erro }`; `criarClassificador(config) → { cargoDoModelo(modelo) → string, crachaDaCli(cli) → { cor, sigla } }`; `carregarCargos(caminho, { aoErro }) → classificador`.

- [ ] **Step 1: Escrever os testes**

`test/cargos.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CARGOS, CARGOS_EMBUTIDOS, validarConfigCargos, criarClassificador, carregarCargos } from '../src/cargos.js';

const padrao = () => criarClassificador(validarConfigCargos(CARGOS_EMBUTIDOS).config);

test('variantes pequenas vencem a família; sem regra cai no cargo neutro', () => {
  const { cargoDoModelo } = padrao();
  assert.equal(CARGOS.length, 5);
  assert.equal(cargoDoModelo('gpt-5-mini'), 'junior');
  assert.equal(cargoDoModelo('gpt-5.4'), 'senior');
  assert.equal(cargoDoModelo('gpt-5'), 'associado');
  assert.equal(cargoDoModelo('gpt-6-astra'), 'socio');
  assert.equal(cargoDoModelo('claude-fable-5-1'), 'socio');
  assert.equal(cargoDoModelo('claude-opus-5'), 'senior');
  assert.equal(cargoDoModelo('claude-sonnet-5'), 'associado');
  assert.equal(cargoDoModelo('claude-haiku-4-5-20251001'), 'junior');
  assert.equal(cargoDoModelo('gemini-3-pro'), 'senior');
  assert.equal(cargoDoModelo('gemini-3-flash'), 'associado');
  assert.equal(cargoDoModelo('gemini-2.5-flash-lite'), 'junior');
  assert.equal(cargoDoModelo('GROK-4'), 'senior');
  assert.equal(cargoDoModelo('llama-70b'), 'advogado');
  assert.equal(cargoDoModelo(undefined), 'advogado');
});

test('crachá por CLI com fallback', () => {
  const { crachaDaCli } = padrao();
  assert.deepEqual(crachaDaCli('claude'), { cor: '#c2603e', sigla: 'CL' });
  assert.deepEqual(crachaDaCli('desconhecida'), { cor: '#8a8a8a', sigla: '??' });
});

test('validação rejeita id de cargo, regex e cor inválidos', () => {
  assert.equal(validarConfigCargos({ versao: 1, padrao: 'advogado', cargos: [{ id: 'rei', padroes: ['x'] }] }).ok, false);
  assert.equal(validarConfigCargos({ versao: 1, padrao: 'advogado', cargos: [{ id: 'socio', padroes: ['('] }] }).ok, false);
  assert.equal(validarConfigCargos({ versao: 1, padrao: 'advogado', cargos: [], clis: { x: { cor: 'azul', sigla: 'X' } } }).ok, false);
  assert.equal(validarConfigCargos({ versao: 1, padrao: 'junior', cargos: [] }).ok, true);
});

test('carregarCargos cai nas embutidas quando o arquivo é inválido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const caminho = join(dir, 'cargos.json');
  writeFileSync(caminho, '{ inválido');
  const erros = [];
  const c = carregarCargos(caminho, { aoErro: (m) => erros.push(m) });
  assert.equal(erros.length, 1);
  assert.equal(c.cargoDoModelo('claude-opus-5'), 'senior');
  writeFileSync(caminho, JSON.stringify({ versao: 1, padrao: 'junior', cargos: [{ id: 'socio', padroes: ['opus'] }] }));
  const c2 = carregarCargos(caminho);
  assert.equal(c2.cargoDoModelo('claude-opus-5'), 'socio');
  assert.equal(c2.cargoDoModelo('claude-fable-5-1'), 'junior');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/cargos.test.js`
Expected: FAIL com `Cannot find module '../src/cargos.js'`.

- [ ] **Step 3: Implementar `src/cargos.js`**

```js
import { readFileSync } from 'node:fs';

export const CARGOS = Object.freeze(['junior', 'socio', 'senior', 'associado', 'advogado']);

// Ordem importa: variantes pequenas (junior) antes das famílias, para gpt-5-mini não virar associado.
export const CARGOS_EMBUTIDOS = Object.freeze({
  versao: 1,
  padrao: 'advogado',
  cargos: [
    { id: 'junior', padroes: ['haiku', 'mini', 'nano', 'flash-lite', 'local'] },
    { id: 'socio', padroes: ['fable', 'mythos', 'gpt-6', 'astra', 'ultra', 'grok-5'] },
    { id: 'senior', padroes: ['opus', 'gpt-5\\.[4-9]', 'gemini-3.*pro', 'grok-4'] },
    { id: 'associado', padroes: ['sonnet', 'gpt-5', 'gemini.*flash', 'codex'] },
  ],
  clis: {
    claude: { cor: '#c2603e', sigla: 'CL' },
    codex: { cor: '#2e9e5b', sigla: 'CX' },
    gemini: { cor: '#3b7dd8', sigla: 'GM' },
    grok: { cor: '#4a4a4a', sigla: 'GK' },
    cursor: { cor: '#7c4dff', sigla: 'CU' },
    opencode: { cor: '#1fa8a0', sigla: 'OC' },
  },
  cliPadrao: { cor: '#8a8a8a', sigla: '??' },
});

const COR_RE = /^#[0-9a-f]{6}$/i;

export function validarConfigCargos(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, erro: 'config deve ser um objeto' };
  if (obj.versao !== 1) return { ok: false, erro: 'versao deve ser 1' };
  if (!CARGOS.includes(obj.padrao)) return { ok: false, erro: `padrao desconhecido: ${String(obj.padrao)}` };
  if (!Array.isArray(obj.cargos)) return { ok: false, erro: 'cargos deve ser uma lista' };
  const regras = [];
  for (const [i, c] of obj.cargos.entries()) {
    if (!c || !CARGOS.includes(c.id)) return { ok: false, erro: `cargo ${i}: id inválido` };
    if (!Array.isArray(c.padroes) || !c.padroes.length) return { ok: false, erro: `cargo ${i}: padroes vazio` };
    try {
      for (const p of c.padroes) regras.push({ re: new RegExp(p, 'i'), cargo: c.id });
    } catch (e) {
      return { ok: false, erro: `cargo ${i}: regex inválida (${e.message})` };
    }
  }
  const clis = {};
  for (const [nome, v] of Object.entries(obj.clis ?? {})) {
    if (!v || !COR_RE.test(v.cor) || typeof v.sigla !== 'string') return { ok: false, erro: `cli ${nome}: cor ou sigla inválida` };
    clis[nome] = { cor: v.cor, sigla: v.sigla.slice(0, 3) };
  }
  const cliPadrao = obj.cliPadrao && COR_RE.test(obj.cliPadrao.cor)
    ? { cor: obj.cliPadrao.cor, sigla: String(obj.cliPadrao.sigla ?? '??').slice(0, 3) }
    : { cor: '#8a8a8a', sigla: '??' };
  return { ok: true, config: { padrao: obj.padrao, regras, clis, cliPadrao } };
}

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
  };
}

export function carregarCargos(caminho, { aoErro = () => {} } = {}) {
  let cfg = validarConfigCargos(CARGOS_EMBUTIDOS).config;
  try {
    const v = validarConfigCargos(JSON.parse(readFileSync(caminho, 'utf8')));
    if (v.ok) cfg = v.config;
    else aoErro(`cargos.json inválido: ${v.erro}; usando regras embutidas`);
  } catch (e) {
    aoErro(`cargos.json ilegível (${e.message}); usando regras embutidas`);
  }
  return criarClassificador(cfg);
}
```

- [ ] **Step 4: Gerar `cargos.json`**

Run: `node -e "import('./src/cargos.js').then(m => require('fs').writeFileSync('cargos.json', JSON.stringify(m.CARGOS_EMBUTIDOS, null, 2) + '\n'))"`
Expected: `cargos.json` criado com `"padrao": "advogado"`.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test test/cargos.test.js`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/cargos.js cargos.json test/cargos.test.js
git commit -m "feat: cargos por modelo e crachás por CLI"
```

---

### Task 5: `src/estado.js` — advogados, matriz de transições e chamadas paralelas

**Files:**
- Create: `src/estado.js`
- Test: `test/estado.test.js`

**Interfaces:**
- Produces: `ESTADOS`; `LIMITES_ESTADO`; `class Escritorio` com `constructor({ agora, resolverSala, salaInicialEstagiario, cargoDoModelo, limites })`, `aplicar(evento) → mudancas[]`, `snapshot() → { advogados, estagiarios }`. Mudanças: `{ tipo: 'advogado', advogado }`, `{ tipo: 'estagiario', estagiario }`, `{ tipo: 'remover', entidade: 'advogado' | 'estagiario', id }`.
- Advogado serializado: `{ id, cli, sessao, modelo, cargo, projetoId, projeto, estado, sala, atividade: { nome, detalhe } | null, caso, turnos, acoesRecentes: [{ nome, detalhe, ts }], tokens: { contexto, janela, saida, saidaEstimada }, estagiarios: string[], desatualizado, iniciadoEm, ultimaAtividade }` (timestamps em ms).
- Estagiário serializado: `{ id, sessao, tipo, descricao, estado, sala, atividade, ultimaAtividade }`.
- Nesta tarefa, `subagente.*`, `tokens`, eventos de ferramenta com `agente` e `tique()` ainda não existem (Tasks 6 e 7).

- [ ] **Step 1: Escrever os testes**

`test/estado.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Escritorio, ESTADOS } from '../src/estado.js';

const SALAS_FIXAS = { Read: 'biblioteca', Edit: 'gabinete', Bash: 'cartorio', Agent: 'reunioes' };
export function novo(extra = {}) {
  let t = 1_000_000;
  const esc = new Escritorio({
    agora: () => t,
    resolverSala: (f) => SALAS_FIXAS[f.nome] ?? 'recepcao',
    salaInicialEstagiario: (tipo) => (/review/i.test(tipo ?? '') ? 'revisao' : 'reunioes'),
    cargoDoModelo: (m) => (m?.includes('opus') ? 'senior' : m ? 'associado' : 'advogado'),
    ...extra,
  });
  esc.avancar = (ms) => { t += ms; };
  return esc;
}
export const ev = (tipo, extra = {}) => ({ v: 1, tipo, cli: 'claude', sessao: 's1', ts: '2026-09-20T12:00:00.000Z', ...extra });
export const adv = (esc, id = 'claude:s1') => esc.snapshot().advogados.find((a) => a.id === id);

test('primeiro evento cria o advogado na recepção, com projeto e cargo', () => {
  const esc = novo();
  const m = esc.aplicar(ev('sessao.inicio', { cwd: '/casa/pgm-rio', modelo: 'claude-opus-5' }));
  assert.equal(m.at(-1).tipo, 'advogado');
  const a = adv(esc);
  assert.equal(a.estado, 'recepcao');
  assert.equal(a.sala, 'recepcao');
  assert.equal(a.projeto, 'pgm-rio');
  assert.equal(a.projetoId, '/casa/pgm-rio');
  assert.equal(a.cargo, 'senior');
  assert.ok(ESTADOS.includes('saiu'));
});

test('prompt abre turno e leva a pensando; ferramenta leva à sala; fim da última volta a pensando sem mudar de sala', () => {
  const esc = novo();
  esc.aplicar(ev('prompt', { prompt: 'Minutar contestação' }));
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).caso, 'Minutar contestação');
  assert.equal(adv(esc).turnos, 1);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: 'a.md', id: 't1' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).sala, 'biblioteca');
  assert.deepEqual(adv(esc).atividade, { nome: 'Read', detalhe: 'a.md' });
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read', id: 't1', ok: true } }));
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).sala, 'biblioteca');
  assert.equal(adv(esc).atividade, null);
});

test('chamadas paralelas: a mais recente define atividade e sala; fim sem pendente é ignorado', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'a' } }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Edit', id: 'b' } }));
  assert.equal(adv(esc).sala, 'gabinete');
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Edit', id: 'b' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).sala, 'biblioteca');
  assert.equal(adv(esc).atividade.nome, 'Read');
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Bash', id: 'zzz' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read' } }));
  assert.equal(adv(esc).estado, 'pensando');
});

test('sem id, o fim encerra a pendente mais antiga com o mesmo nome; pendentes limitadas a 16', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: '1' } }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: '2' } }));
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read' } }));
  assert.equal(adv(esc).atividade.detalhe, '2');
  for (let i = 0; i < 20; i += 1) esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: `b${i}` } }));
  assert.equal(esc.advogados.get('claude:s1').chamadasPendentes.size, 16);
  assert.equal(adv(esc).acoesRecentes.length, 8);
  assert.equal(adv(esc).acoesRecentes[0].detalhe, undefined);
});

test('parado volta à recepção e descarta pendentes; na recepção é ignorado', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Edit', id: 'x' } }));
  esc.aplicar(ev('parado'));
  assert.equal(adv(esc).estado, 'recepcao');
  assert.equal(adv(esc).sala, 'recepcao');
  assert.equal(adv(esc).atividade, null);
  const antes = esc.aplicar(ev('parado'));
  assert.equal(antes.length, 1);
  assert.equal(adv(esc).estado, 'recepcao');
});

test('aguardando vai à copa e o prompt seguinte devolve à sala anterior', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'x' } }));
  esc.aplicar(ev('aguardando', { motivo: 'permissao' }));
  assert.equal(adv(esc).estado, 'aguardando');
  assert.equal(adv(esc).sala, 'copa');
  esc.aplicar(ev('prompt', { prompt: 'continue' }));
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).sala, 'cartorio');
  esc.aplicar(ev('aguardando'));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'y' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).sala, 'biblioteca');
});

test('prompt durante trabalhando só troca o caso; sessao.fim leva a saiu; modelo novo troca o cargo', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Edit', id: 'x' } }));
  esc.aplicar(ev('prompt', { prompt: 'novo pedido' }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).caso, 'novo pedido');
  esc.aplicar(ev('tokens', { tokens: { contexto: 1 }, modelo: 'claude-sonnet-5' }));
  assert.equal(adv(esc).cargo, 'associado');
  esc.aplicar(ev('sessao.fim'));
  assert.equal(adv(esc).estado, 'saiu');
});

test('identidade separa CLIs e projetos com o mesmo nome guardam o cwd completo', () => {
  const esc = novo();
  esc.aplicar(ev('sessao.inicio', { cwd: '/a/x' }));
  esc.aplicar(ev('sessao.inicio', { cli: 'codex', cwd: '/b/x' }));
  const s = esc.snapshot();
  assert.equal(s.advogados.length, 2);
  assert.deepEqual(s.advogados.map((a) => a.projetoId).sort(), ['/a/x', '/b/x']);
  assert.deepEqual(s.advogados.map((a) => a.projeto), ['x', 'x']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/estado.test.js`
Expected: FAIL com `Cannot find module '../src/estado.js'`.

- [ ] **Step 3: Implementar `src/estado.js`**

```js
import { basename } from 'node:path';

export const ESTADOS = Object.freeze(['recepcao', 'pensando', 'trabalhando', 'aguardando', 'ocioso', 'saiu']);

export const LIMITES_ESTADO = Object.freeze({
  sessoes: 64,
  estagiariosPorSessao: 32,
  pendentesAdvogado: 16,
  pendentesEstagiario: 8,
  acoesRecentes: 8,
  ociosoMs: 2 * 60_000,
  desatualizadoMs: 10 * 60_000,
  saidaMs: 30 * 60_000,
  saidaAguardandoMs: 60 * 60_000,
  estagiarioMs: 15 * 60_000,
  removerMs: 3_000,
  lapideMs: 60_000,
});

export class Escritorio {
  constructor({ agora = () => Date.now(), resolverSala, salaInicialEstagiario, cargoDoModelo, limites = {} } = {}) {
    this.agora = agora;
    this.resolverSala = resolverSala ?? (() => 'recepcao');
    this.salaInicialEstagiario = salaInicialEstagiario ?? (() => 'reunioes');
    this.cargoDoModelo = cargoDoModelo ?? (() => 'advogado');
    this.limites = { ...LIMITES_ESTADO, ...limites };
    this.advogados = new Map();
    this.estagiarios = new Map();
    this.lapides = new Map();
    this.contadorChamadas = 0;
  }

  // ---------- API ----------

  aplicar(ev) {
    const mudancas = [];
    const id = `${ev.cli}:${ev.sessao}`;
    const agora = this.agora();
    let adv = this.advogados.get(id);
    if (!adv) adv = this._criarAdvogado(id, ev, agora, mudancas);
    this._atualizarMetadados(adv, ev);

    adv.ultimaAtividade = agora;
    adv.ultimaAtividadeAgregada = agora;
    adv.desatualizado = false;
    switch (ev.tipo) {
      case 'sessao.inicio':
        if (adv.estado === 'ocioso') this._mudar(adv, 'recepcao', 'recepcao');
        break;
      case 'prompt':
        adv.caso = ev.prompt;
        adv.turnos += 1;
        if (adv.estado !== 'trabalhando') this._mudar(adv, 'pensando', this._salaAoVoltar(adv));
        break;
      case 'ferramenta.inicio':
        this._abrirChamada(adv, ev.ferramenta, this.limites.pendentesAdvogado);
        this._registrarAcao(adv, ev);
        this._mudar(adv, 'trabalhando', this.resolverSala(ev.ferramenta));
        break;
      case 'ferramenta.fim': {
        if (adv.estado !== 'trabalhando') break;
        this._fecharChamada(adv, ev.ferramenta);
        const atual = this._ultimaChamada(adv);
        if (atual) adv.sala = this.resolverSala(atual);
        else this._mudar(adv, 'pensando', adv.sala);
        break;
      }
      case 'aguardando':
        if (adv.estado !== 'aguardando') {
          adv.salaAnterior = adv.sala;
          this._mudar(adv, 'aguardando', 'copa');
        }
        break;
      case 'parado':
        if (adv.estado === 'pensando' || adv.estado === 'trabalhando' || adv.estado === 'aguardando') {
          this._limparChamadas(adv, mudancas);
          this._mudar(adv, 'recepcao', 'recepcao');
        }
        break;
      case 'sessao.fim':
        this._sair(adv, agora);
        break;
      default:
        break;
    }
    mudancas.push(this._deltaAdvogado(adv));
    return mudancas;
  }

  snapshot() {
    return {
      advogados: [...this.advogados.values()].map((a) => this._serializarAdvogado(a)),
      estagiarios: [...this.estagiarios.values()].map((e) => this._serializarEstagiario(e)),
    };
  }

  // ---------- advogado ----------

  _criarAdvogado(id, ev, agora) {
    const adv = {
      id, cli: ev.cli, sessao: ev.sessao, modelo: undefined, cargo: this.cargoDoModelo(undefined),
      cwd: undefined, projetoId: undefined, projeto: undefined,
      estado: 'recepcao', sala: 'recepcao', salaAnterior: undefined,
      chamadasPendentes: new Map(), caso: undefined, turnos: 0, acoesRecentes: [],
      tokens: { contexto: undefined, janela: undefined, saida: 0, saidaEstimada: false },
      estagiarios: new Set(), desatualizado: false,
      iniciadoEm: agora, ultimaAtividade: agora, ultimaAtividadeAgregada: agora, saiuEm: undefined,
    };
    this.advogados.set(id, adv);
    return adv;
  }

  _atualizarMetadados(adv, ev) {
    if (ev.cwd) {
      adv.cwd = ev.cwd;
      adv.projetoId = ev.cwd;
      if (!ev.projeto) adv.projeto = basename(ev.cwd) || ev.cwd;
    }
    if (ev.projeto) adv.projeto = ev.projeto;
    if (ev.modelo && ev.modelo !== adv.modelo) {
      adv.modelo = ev.modelo;
      adv.cargo = this.cargoDoModelo(ev.modelo);
    }
  }

  _mudar(adv, estado, sala) {
    adv.estado = estado;
    adv.sala = sala;
  }

  _sair(adv, agora) {
    adv.estado = 'saiu';
    adv.saiuEm = agora;
    adv.chamadasPendentes.clear();
  }

  _salaAoVoltar(adv) {
    return adv.estado === 'aguardando' ? (adv.salaAnterior ?? 'recepcao') : adv.sala;
  }

  _registrarAcao(adv, ev) {
    adv.acoesRecentes.unshift({ nome: ev.ferramenta.nome, detalhe: ev.ferramenta.detalhe, ts: ev.ts });
    if (adv.acoesRecentes.length > this.limites.acoesRecentes) adv.acoesRecentes.length = this.limites.acoesRecentes;
  }

  // ---------- chamadas pendentes (advogado ou estagiário) ----------

  _abrirChamada(ent, f, max) {
    const chave = f.id ?? `${f.nome}#${++this.contadorChamadas}`;
    if (ent.chamadasPendentes.size >= max) ent.chamadasPendentes.delete(ent.chamadasPendentes.keys().next().value);
    ent.chamadasPendentes.delete(chave);
    ent.chamadasPendentes.set(chave, { nome: f.nome, detalhe: f.detalhe });
  }

  _fecharChamada(ent, f) {
    if (f.id && ent.chamadasPendentes.delete(f.id)) return true;
    for (const [k, v] of ent.chamadasPendentes) {
      if (v.nome === f.nome) {
        ent.chamadasPendentes.delete(k);
        return true;
      }
    }
    return false;
  }

  _ultimaChamada(ent) {
    let ultima = null;
    for (const v of ent.chamadasPendentes.values()) ultima = v;
    return ultima;
  }

  _limparChamadas(adv) {
    adv.chamadasPendentes.clear();
  }

  // ---------- serialização ----------

  _serializarAdvogado(a) {
    const atividade = this._ultimaChamada(a);
    return {
      id: a.id, cli: a.cli, sessao: a.sessao, modelo: a.modelo ?? null, cargo: a.cargo,
      projetoId: a.projetoId ?? null, projeto: a.projeto ?? null,
      estado: a.estado, sala: a.sala,
      atividade: atividade ? { nome: atividade.nome, detalhe: atividade.detalhe } : null,
      caso: a.caso ?? null, turnos: a.turnos,
      acoesRecentes: a.acoesRecentes.map((x) => ({ ...x })),
      tokens: { contexto: a.tokens.contexto ?? null, janela: a.tokens.janela ?? null, saida: a.tokens.saida, saidaEstimada: a.tokens.saidaEstimada },
      estagiarios: [...a.estagiarios], desatualizado: a.desatualizado,
      iniciadoEm: a.iniciadoEm, ultimaAtividade: a.ultimaAtividade,
    };
  }

  _serializarEstagiario(e) {
    const atividade = this._ultimaChamada(e);
    return {
      id: e.id, sessao: e.sessao, tipo: e.tipo ?? null, descricao: e.descricao ?? null,
      estado: e.estado, sala: e.sala,
      atividade: atividade ? { nome: atividade.nome, detalhe: atividade.detalhe } : null,
      ultimaAtividade: e.ultimaAtividade,
    };
  }

  _deltaAdvogado(a) {
    return { tipo: 'advogado', advogado: this._serializarAdvogado(a) };
  }

  _deltaEstagiario(e) {
    return { tipo: 'estagiario', estagiario: this._serializarEstagiario(e) };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/estado.test.js`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/estado.js test/estado.test.js
git commit -m "feat: máquina de estados do advogado com chamadas paralelas"
```

---

### Task 6: `src/estado.js` — estagiários e tokens

**Files:**
- Modify: `src/estado.js` (método `aplicar` e novos métodos)
- Test: `test/estado-estagiarios.test.js`

**Interfaces:**
- Consumes: `novo`, `ev`, `adv` exportados por `test/estado.test.js`.
- Produces: eventos `subagente.inicio`, `subagente.fim`, `tokens` e eventos de ferramenta com `agente` passam a ser tratados; `_criarEstagiario`, `_aplicarEstagiario`, `_removerEstagiario`, `_aplicarTokens`.

- [ ] **Step 1: Escrever os testes**

`test/estado-estagiarios.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novo, ev, adv } from './estado.test.js';

const est = (esc, id) => esc.snapshot().estagiarios.find((e) => e.id === id);

test('subagente.inicio cria estagiário na sala inicial e o liga ao advogado', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Agent', detalhe: 'Explore: buscar', id: 'a' } }));
  const m = esc.aplicar(ev('subagente.inicio', { agente: { id: 'ag1', tipo: 'Explore', descricao: 'buscar precedentes' } }));
  assert.ok(m.some((x) => x.tipo === 'estagiario'));
  const e = est(esc, 'claude:s1:ag1');
  assert.equal(e.estado, 'pensando');
  assert.equal(e.sala, 'reunioes');
  assert.equal(e.descricao, 'buscar precedentes');
  assert.deepEqual(adv(esc).estagiarios, ['claude:s1:ag1']);
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'ag2', tipo: 'code-reviewer' } }));
  assert.equal(est(esc, 'claude:s1:ag2').sala, 'revisao');
  assert.equal(adv(esc).estado, 'trabalhando');
});

test('ferramenta com agente move o estagiário e não o advogado; agente desconhecido é criado', () => {
  const esc = novo();
  esc.aplicar(ev('prompt', { prompt: 'x' }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r1' }, agente: { id: 'ag9', tipo: 'Explore' } }));
  const e = est(esc, 'claude:s1:ag9');
  assert.equal(e.estado, 'trabalhando');
  assert.equal(e.sala, 'biblioteca');
  assert.equal(e.atividade.nome, 'Read');
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).atividade, null);
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read', id: 'r1' }, agente: { id: 'ag9' } }));
  assert.equal(est(esc, 'claude:s1:ag9').estado, 'pensando');
  assert.equal(est(esc, 'claude:s1:ag9').sala, 'biblioteca');
});

test('subagente.fim remove; parado limpa pendentes dos estagiários', () => {
  const esc = novo();
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1', tipo: 'Explore' } }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'b1' }, agente: { id: 'a1' } }));
  esc.aplicar(ev('prompt', { prompt: 'x' }));
  const m = esc.aplicar(ev('parado'));
  assert.ok(m.some((x) => x.tipo === 'estagiario' && x.estagiario.estado === 'pensando'));
  assert.equal(est(esc, 'claude:s1:a1').atividade, null);
  const r = esc.aplicar(ev('subagente.fim', { agente: { id: 'a1' } }));
  assert.ok(r.some((x) => x.tipo === 'remover' && x.entidade === 'estagiario' && x.id === 'claude:s1:a1'));
  assert.equal(est(esc, 'claude:s1:a1'), undefined);
  assert.deepEqual(adv(esc).estagiarios, []);
  assert.equal(esc.aplicar(ev('subagente.fim', { agente: { id: 'nunca' } })).length, 1);
});

test('limite de 32 estagiários substitui o ocioso mais antigo', () => {
  const esc = novo();
  for (let i = 0; i < 32; i += 1) {
    esc.aplicar(ev('subagente.inicio', { agente: { id: `a${i}` } }));
    esc.avancar(10);
  }
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, agente: { id: 'a0' } }));
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'novo' } }));
  assert.equal(adv(esc).estagiarios.length, 32);
  assert.equal(est(esc, 'claude:s1:a0').estado, 'trabalhando');
  assert.equal(est(esc, 'claude:s1:a1'), undefined);
});

test('tokens: total substitui e zera estimativa; incremento soma e marca estimado', () => {
  const esc = novo();
  esc.aplicar(ev('tokens', { tokens: { contexto: 1000, janela: 200000, saidaIncremento: 50 } }));
  assert.deepEqual(adv(esc).tokens, { contexto: 1000, janela: 200000, saida: 50, saidaEstimada: true });
  esc.aplicar(ev('tokens', { tokens: { saidaIncremento: 25 } }));
  assert.equal(adv(esc).tokens.saida, 75);
  esc.aplicar(ev('tokens', { tokens: { saidaTotal: 900, contexto: 1200 } }));
  assert.deepEqual(adv(esc).tokens, { contexto: 1200, janela: 200000, saida: 900, saidaEstimada: false });
  assert.equal(adv(esc).estado, 'recepcao');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/estado-estagiarios.test.js`
Expected: FAIL (estagiários não são criados; `est(...)` devolve `undefined`).

- [ ] **Step 3: Alterar `aplicar` e acrescentar os métodos**

Em `src/estado.js`, dentro de `aplicar`, substituir o bloco entre `this._atualizarMetadados(adv, ev);` e `adv.ultimaAtividade = agora;` por:

```js
    this._atualizarMetadados(adv, ev);

    const deEstagiario = Boolean(ev.agente) && (ev.tipo === 'ferramenta.inicio' || ev.tipo === 'ferramenta.fim');
    if (deEstagiario) {
      adv.ultimaAtividadeAgregada = agora;
      this._aplicarEstagiario(adv, ev, agora, mudancas);
      mudancas.push(this._deltaAdvogado(adv));
      return mudancas;
    }

    adv.ultimaAtividade = agora;
```

No `switch` de `aplicar`, acrescentar antes de `default:`:

```js
      case 'tokens':
        this._aplicarTokens(adv, ev.tokens);
        break;
      case 'subagente.inicio':
        this._criarEstagiario(adv, ev.agente, agora, mudancas);
        break;
      case 'subagente.fim':
        this._removerEstagiario(adv, `${adv.id}:${ev.agente.id}`, mudancas);
        break;
```

Substituir `_limparChamadas` por:

```js
  _limparChamadas(adv, mudancas) {
    adv.chamadasPendentes.clear();
    for (const eid of adv.estagiarios) {
      const est = this.estagiarios.get(eid);
      if (est && est.chamadasPendentes.size) {
        est.chamadasPendentes.clear();
        est.estado = 'pensando';
        mudancas.push(this._deltaEstagiario(est));
      }
    }
  }
```

Acrescentar, antes de `// ---------- serialização ----------`:

```js
  // ---------- estagiários ----------

  _criarEstagiario(adv, agente, agora, mudancas) {
    const id = `${adv.id}:${agente.id}`;
    let est = this.estagiarios.get(id);
    if (!est) {
      if (adv.estagiarios.size >= this.limites.estagiariosPorSessao) {
        const vitima = [...adv.estagiarios]
          .map((i) => this.estagiarios.get(i))
          .filter(Boolean)
          .sort((a, b) => {
            const pa = a.estado === 'pensando' ? 0 : 1;
            const pb = b.estado === 'pensando' ? 0 : 1;
            return pa - pb || a.ultimaAtividade - b.ultimaAtividade;
          })[0];
        if (vitima) this._removerEstagiario(adv, vitima.id, mudancas);
      }
      est = {
        id, sessao: adv.id, tipo: agente.tipo, descricao: agente.descricao,
        estado: 'pensando', sala: this.salaInicialEstagiario(agente.tipo),
        chamadasPendentes: new Map(), ultimaAtividade: agora,
      };
      this.estagiarios.set(id, est);
      adv.estagiarios.add(id);
    } else {
      if (agente.tipo) est.tipo = agente.tipo;
      if (agente.descricao) est.descricao = agente.descricao;
      est.ultimaAtividade = agora;
    }
    mudancas.push(this._deltaEstagiario(est));
    return est;
  }

  _aplicarEstagiario(adv, ev, agora, mudancas) {
    const id = `${adv.id}:${ev.agente.id}`;
    const est = this.estagiarios.get(id) ?? this._criarEstagiario(adv, ev.agente, agora, mudancas);
    est.ultimaAtividade = agora;
    if (ev.tipo === 'ferramenta.inicio') {
      this._abrirChamada(est, ev.ferramenta, this.limites.pendentesEstagiario);
      est.estado = 'trabalhando';
      est.sala = this.resolverSala(ev.ferramenta);
    } else {
      this._fecharChamada(est, ev.ferramenta);
      const atual = this._ultimaChamada(est);
      if (atual) est.sala = this.resolverSala(atual);
      else est.estado = 'pensando';
    }
    mudancas.push(this._deltaEstagiario(est));
  }

  _removerEstagiario(adv, id, mudancas) {
    if (!this.estagiarios.delete(id)) return;
    adv.estagiarios.delete(id);
    mudancas.push({ tipo: 'remover', entidade: 'estagiario', id });
  }

  // ---------- tokens ----------

  _aplicarTokens(adv, t) {
    if (t.contexto !== undefined) adv.tokens.contexto = t.contexto;
    if (t.janela !== undefined) adv.tokens.janela = t.janela;
    if (t.saidaTotal !== undefined) {
      adv.tokens.saida = t.saidaTotal;
      adv.tokens.saidaEstimada = false;
    }
    if (t.saidaIncremento !== undefined) {
      adv.tokens.saida += t.saidaIncremento;
      adv.tokens.saidaEstimada = true;
    }
  }
```

- [ ] **Step 4: Rodar todos os testes de estado e ver passar**

Run: `node --test test/estado.test.js test/estado-estagiarios.test.js`
Expected: `# pass 13`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/estado.js test/estado-estagiarios.test.js
git commit -m "feat: estagiários (subagentes) e contabilização de tokens"
```

---

### Task 7: `src/estado.js` — `tique()`: expirações, lápides e limite de sessões

**Files:**
- Modify: `src/estado.js`
- Test: `test/estado-tempo.test.js`

**Interfaces:**
- Produces: `tique() → mudancas[]` (chamado a cada segundo pelo servidor); lápides bloqueiam eventos por 60 s após a remoção, exceto `sessao.inicio` e `prompt`; `_remover(adv, agora, mudancas)`.

- [ ] **Step 1: Escrever os testes**

`test/estado-tempo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novo, ev, adv } from './estado.test.js';

const MIN = 60_000;

test('ocioso após 2 min parado ou pensando; evento novo reativa', () => {
  const esc = novo();
  esc.aplicar(ev('prompt', { prompt: 'x' }));
  esc.avancar(2 * MIN - 1);
  assert.equal(esc.tique().length, 0);
  esc.avancar(1);
  const m = esc.tique();
  assert.equal(m.at(-1).advogado.estado, 'ocioso');
  assert.equal(adv(esc).sala, 'recepcao');
  esc.aplicar(ev('sessao.inicio'));
  assert.equal(adv(esc).estado, 'recepcao');
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
});

test('trabalhando há 10 min fica desatualizado, sem mudar de estado; some no próximo evento', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'b' } }));
  esc.avancar(10 * MIN);
  esc.tique();
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).desatualizado, true);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' } }));
  assert.equal(adv(esc).desatualizado, false);
});

test('sai após 30 min sem eventos (60 min se aguardando); atividade de estagiário segura a saída', () => {
  const esc = novo();
  esc.aplicar(ev('prompt', { prompt: 'x' }));
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1' } }));
  esc.avancar(25 * MIN);
  esc.tique();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, agente: { id: 'a1' } }));
  esc.avancar(10 * MIN);
  esc.tique();
  assert.notEqual(adv(esc).estado, 'saiu');
  esc.avancar(20 * MIN + 1);
  esc.tique();
  assert.equal(adv(esc).estado, 'saiu');

  const esc2 = novo();
  esc2.aplicar(ev('aguardando'));
  esc2.avancar(59 * MIN);
  esc2.tique();
  assert.equal(adv(esc2).estado, 'aguardando');
  esc2.avancar(MIN);
  esc2.tique();
  assert.equal(adv(esc2).estado, 'saiu');
});

test('estagiário expira sozinho após 15 min sem eventos', () => {
  const esc = novo();
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1' } }));
  esc.avancar(15 * MIN);
  const m = esc.tique();
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'estagiario'));
  assert.deepEqual(adv(esc).estagiarios, []);
});

test('saiu é removido após 3 s; lápide bloqueia ferramenta por 60 s mas prompt ressuscita', () => {
  const esc = novo();
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1' } }));
  esc.aplicar(ev('sessao.fim'));
  esc.avancar(3000);
  const m = esc.tique();
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'advogado' && x.id === 'claude:s1'));
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'estagiario'));
  assert.equal(esc.snapshot().advogados.length, 0);
  assert.equal(esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read' } })).length, 0);
  assert.equal(esc.snapshot().advogados.length, 0);
  esc.aplicar(ev('prompt', { prompt: 'de novo' }));
  assert.equal(adv(esc).estado, 'pensando');
  const esc2 = novo();
  esc2.aplicar(ev('sessao.fim'));
  esc2.avancar(3000);
  esc2.tique();
  esc2.avancar(60_000);
  esc2.tique();
  esc2.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' } }));
  assert.equal(adv(esc2).estado, 'trabalhando');
});

test('limite de sessões remove a ociosa mais antiga', () => {
  const esc = novo({ limites: { sessoes: 3 } });
  esc.aplicar(ev('prompt', { prompt: 'a', sessao: 'A' }));
  esc.avancar(1000);
  esc.aplicar(ev('prompt', { prompt: 'b', sessao: 'B' }));
  esc.avancar(1000);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, sessao: 'C' }));
  esc.avancar(3 * MIN);
  esc.tique();
  assert.equal(adv(esc, 'claude:A').estado, 'ocioso');
  const m = esc.aplicar(ev('prompt', { prompt: 'd', sessao: 'D' }));
  assert.ok(m.some((x) => x.tipo === 'remover' && x.id === 'claude:A'));
  assert.equal(esc.snapshot().advogados.length, 3);
  assert.ok(adv(esc, 'claude:C'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/estado-tempo.test.js`
Expected: FAIL com `esc.tique is not a function`.

- [ ] **Step 3: Acrescentar lápides, `tique()`, `_remover` e o limite de sessões**

Em `aplicar`, logo após `const agora = this.agora();`, inserir:

```js
    const lapide = this.lapides.get(id);
    if (lapide !== undefined) {
      if (lapide > agora && ev.tipo !== 'sessao.inicio' && ev.tipo !== 'prompt') return mudancas;
      this.lapides.delete(id);
    }
```

Substituir a assinatura e o início de `_criarAdvogado` por:

```js
  _criarAdvogado(id, ev, agora, mudancas) {
    if (this.advogados.size >= this.limites.sessoes) {
      const vivos = [...this.advogados.values()].filter((a) => a.estado !== 'saiu');
      const ociosos = vivos.filter((a) => a.estado === 'ocioso');
      const pool = ociosos.length ? ociosos : vivos;
      const vitima = pool.sort((a, b) => a.ultimaAtividadeAgregada - b.ultimaAtividadeAgregada)[0];
      if (vitima) this._remover(vitima, agora, mudancas);
    }
    const adv = {
```

Acrescentar após `snapshot()`:

```js
  tique() {
    const mudancas = [];
    const agora = this.agora();
    const L = this.limites;
    for (const adv of [...this.advogados.values()]) {
      if (adv.estado === 'saiu') {
        if (agora - adv.saiuEm >= L.removerMs) this._remover(adv, agora, mudancas);
        continue;
      }
      const semProprios = agora - adv.ultimaAtividade;
      const semTudo = agora - Math.max(adv.ultimaAtividade, adv.ultimaAtividadeAgregada);
      let mudou = false;
      const limiteSaida = adv.estado === 'aguardando' ? L.saidaAguardandoMs : L.saidaMs;
      if (semTudo >= limiteSaida) {
        this._sair(adv, agora);
        mudou = true;
      } else if ((adv.estado === 'pensando' || adv.estado === 'recepcao') && semTudo >= L.ociosoMs) {
        this._mudar(adv, 'ocioso', 'recepcao');
        mudou = true;
      } else if (adv.estado === 'trabalhando' && !adv.desatualizado && semProprios >= L.desatualizadoMs) {
        adv.desatualizado = true;
        mudou = true;
      }
      for (const eid of [...adv.estagiarios]) {
        const est = this.estagiarios.get(eid);
        if (est && agora - est.ultimaAtividade >= L.estagiarioMs) {
          this._removerEstagiario(adv, eid, mudancas);
          mudou = true;
        }
      }
      if (mudou) mudancas.push(this._deltaAdvogado(adv));
    }
    for (const [id, ate] of this.lapides) if (ate <= agora) this.lapides.delete(id);
    return mudancas;
  }
```

Acrescentar após `_sair`:

```js
  _remover(adv, agora, mudancas) {
    for (const eid of [...adv.estagiarios]) this._removerEstagiario(adv, eid, mudancas);
    this.advogados.delete(adv.id);
    this.lapides.set(adv.id, agora + this.limites.lapideMs);
    mudancas.push({ tipo: 'remover', entidade: 'advogado', id: adv.id });
  }
```

- [ ] **Step 4: Rodar todos os testes e ver passar**

Run: `npm test`
Expected: `# fail 0` (config 4, protocolo 8, salas 6, cargos 4, estado 8 + 5 + 6).

- [ ] **Step 5: Commit**

```bash
git add src/estado.js test/estado-tempo.test.js
git commit -m "feat: expirações, lápides e limite de sessões no estado"
```

---

### Task 8: `src/tradutores/comum.js` — utilitários compartilhados dos tradutores

**Files:**
- Create: `src/tradutores/comum.js`
- Test: `test/tradutores-comum.test.js`

**Interfaces:**
- Produces: `detectarEnvelope(p) → 'grok' | 'snake' | 'camel' | 'invalido'`; `campo(p, ...nomes) → primeiro valor definido`; `resumirEntrada(nomeFerramenta, toolInput) → string | undefined`; `base(p, cli, agora) → { v: 1, cli, sessao, ts, cwd?, modelo? }`; `evento(base, tipo, extra) → evento bruto (campos undefined removidos)`; `criarDeduplicador({ agora, janelaMs }) → (evento) => boolean` (true = inédito); `dentroDe(caminho, dirs) → boolean`; `lerCauda(caminho, maxBytes) → string | null` (descarta a primeira linha quando cortou); `linhasJson(texto) → object[]`.
- Convenção dos tradutores (Tasks 9 a 13): `traduzir(payload)` devolve `null` para payload inválido ou evento desconhecido (o servidor conta como `ignorados`) e um array (possivelmente vazio) de eventos brutos que passam por `normalizarLote`.

- [ ] **Step 1: Escrever os testes**

`test/tradutores-comum.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectarEnvelope, campo, resumirEntrada, base, evento, criarDeduplicador, dentroDe, lerCauda, linhasJson } from '../src/tradutores/comum.js';

test('detectarEnvelope distingue grok, snake e camel', () => {
  assert.equal(detectarEnvelope({ hookEventName: 'pre_tool_use', hook_event_name: 'PreToolUse' }), 'grok');
  assert.equal(detectarEnvelope({ hook_event_name: 'PreToolUse' }), 'snake');
  assert.equal(detectarEnvelope({ event: 'preToolUse' }), 'camel');
  assert.equal(detectarEnvelope('x'), 'invalido');
});

test('campo devolve o primeiro valor presente e ignora vazio', () => {
  assert.equal(campo({ a: '', b: null, c: 'x' }, 'a', 'b', 'c'), 'x');
  assert.equal(campo({ a: 0 }, 'a'), 0);
  assert.equal(campo(null, 'a'), undefined);
});

test('resumirEntrada prioriza campos úteis e monta Skill e Agent', () => {
  assert.equal(resumirEntrada('Edit', { file_path: '/x/a.md', old_string: '...' }), '/x/a.md');
  assert.equal(resumirEntrada('Bash', { command: 'npm test', description: 'roda testes' }), 'npm test');
  assert.equal(resumirEntrada('Skill', { skill: 'proprio-punho', args: 'contestação' }), 'proprio-punho contestação');
  assert.equal(resumirEntrada('Agent', { subagent_type: 'Explore', description: 'achar x', prompt: 'longo' }), 'Explore: achar x');
  assert.equal(resumirEntrada('Task', { description: 'só descrição' }), 'só descrição');
  assert.equal(resumirEntrada('Outra', { foo: 1 }), '{"foo":1}');
  assert.equal(resumirEntrada('Outra', 'texto'), 'texto');
  assert.equal(resumirEntrada('Outra', undefined), undefined);
});

test('base aceita várias grafias de sessão, cwd e timestamp', () => {
  const agora = () => Date.parse('2026-09-20T12:00:00Z');
  assert.deepEqual(base({ session_id: 's', cwd: '/p', model: 'm' }, 'claude', agora), { v: 1, cli: 'claude', sessao: 's', ts: '2026-09-20T12:00:00.000Z', cwd: '/p', modelo: 'm' });
  assert.equal(base({ sessionId: 7, workspaceRoot: '/w', timestamp: '2026-01-01T00:00:00Z' }, 'grok', agora).cwd, '/w');
  assert.equal(base({ conversation_id: 'c', workspace_roots: ['/r1', '/r2'] }, 'cursor', agora).cwd, '/r1');
  assert.equal(base({ session_id: 's', timestamp: 'lixo' }, 'x', agora).ts, '2026-09-20T12:00:00.000Z');
  assert.equal(base({}, 'x', agora).sessao, undefined);
});

test('evento remove campos undefined do nível superior', () => {
  const e = evento({ v: 1, cli: 'c', sessao: 's', ts: 't' }, 'parado', { motivo: undefined, prompt: 'x' });
  assert.deepEqual(e, { v: 1, cli: 'c', sessao: 's', ts: 't', tipo: 'parado', prompt: 'x' });
});

test('deduplicador descarta repetição em 2 s e aceita depois', () => {
  let t = 0;
  const novo = criarDeduplicador({ agora: () => t, janelaMs: 2000 });
  const e = { cli: 'grok', sessao: 's', tipo: 'ferramenta.inicio', ts: '2026-09-20T12:00:00.000Z', ferramenta: { nome: 'Read', id: 'a' } };
  assert.equal(novo(e), true);
  t = 500;
  assert.equal(novo({ ...e }), false);
  assert.equal(novo({ ...e, ferramenta: { nome: 'Read', id: 'b' } }), true);
  t = 3000;
  assert.equal(novo(e), true);
});

test('dentroDe, lerCauda e linhasJson', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  mkdirSync(join(dir, 'ok'));
  const arq = join(dir, 'ok', 'a.jsonl');
  writeFileSync(arq, '{"n":1}\n{"n":2}\nlixo\n{"n":3}\n');
  assert.equal(dentroDe(arq, [join(dir, 'ok')]), true);
  assert.equal(dentroDe(arq, [join(dir, 'outro')]), false);
  assert.equal(dentroDe(join(dir, 'nao-existe'), [dir]), false);
  assert.deepEqual(linhasJson(lerCauda(arq, 1_000_000)).map((o) => o.n), [1, 2, 3]);
  const cauda = lerCauda(arq, 14);
  assert.deepEqual(linhasJson(cauda).map((o) => o.n), [3]);
  assert.equal(lerCauda(join(dir, 'x'), 10), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/tradutores-comum.test.js`
Expected: FAIL com `Cannot find module '../src/tradutores/comum.js'`.

- [ ] **Step 3: Implementar `src/tradutores/comum.js`**

```js
import { openSync, readSync, fstatSync, closeSync, realpathSync } from 'node:fs';
import { sep } from 'node:path';

export function detectarEnvelope(p) {
  if (!p || typeof p !== 'object') return 'invalido';
  if (typeof p.hookEventName === 'string') return 'grok';
  if (typeof p.hook_event_name === 'string') return 'snake';
  return 'camel';
}

export function campo(p, ...nomes) {
  if (!p || typeof p !== 'object') return undefined;
  for (const n of nomes) {
    const v = p[n];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

const AGENTES = ['Agent', 'Task', 'spawn_subagent'];
const CHAVES_DETALHE = ['file_path', 'filePath', 'path', 'notebook_path', 'command', 'cmd', 'query', 'pattern', 'url', 'description', 'prompt', 'skill', 'name'];

export function resumirEntrada(nome, entrada) {
  if (typeof entrada === 'string') return entrada;
  if (!entrada || typeof entrada !== 'object') return undefined;
  const texto = (x) => (typeof x === 'string' && x ? x : undefined);
  if (nome === 'Skill') return [texto(entrada.skill), texto(entrada.args)].filter(Boolean).join(' ') || undefined;
  if (AGENTES.includes(nome)) {
    const tipo = texto(campo(entrada, 'subagent_type', 'subagentType', 'agent_type', 'type'));
    const desc = texto(campo(entrada, 'description', 'prompt'));
    return [tipo, desc].filter(Boolean).join(': ') || undefined;
  }
  for (const k of CHAVES_DETALHE) if (texto(entrada[k])) return entrada[k];
  try {
    return JSON.stringify(entrada);
  } catch {
    return undefined;
  }
}

export function base(p, cli, agora = () => Date.now()) {
  const sessaoBruta = campo(p, 'session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id');
  const sessao = sessaoBruta === undefined ? undefined : String(sessaoBruta);
  let cwd = campo(p, 'cwd', 'workspaceRoot', 'workspace_root');
  const raizes = campo(p, 'workspace_roots', 'workspaceRoots');
  if (!cwd && Array.isArray(raizes) && typeof raizes[0] === 'string') cwd = raizes[0];
  const bruto = campo(p, 'timestamp', 'ts');
  const data = bruto === undefined ? new Date(agora()) : new Date(bruto);
  const ts = Number.isNaN(data.getTime()) ? new Date(agora()).toISOString() : data.toISOString();
  const b = { v: 1, cli, sessao, ts };
  if (typeof cwd === 'string' && cwd) b.cwd = cwd;
  const modelo = campo(p, 'model', 'modelo');
  if (typeof modelo === 'string') b.modelo = modelo;
  return b;
}

export function evento(b, tipo, extra = {}) {
  const e = { ...b, tipo };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) e[k] = v;
  return e;
}

export function criarDeduplicador({ agora = () => Date.now(), janelaMs = 2000 } = {}) {
  const vistos = new Map();
  return function inedito(ev) {
    const t = agora();
    for (const [k, v] of vistos) if (t - v > janelaMs) vistos.delete(k);
    const seg = Math.floor(new Date(ev.ts).getTime() / 1000);
    const chave = [ev.cli, ev.sessao, ev.tipo, ev.ferramenta?.id ?? ev.ferramenta?.nome ?? '', ev.agente?.id ?? '', seg].join('|');
    if (vistos.has(chave)) return false;
    vistos.set(chave, t);
    return true;
  };
}

export function dentroDe(caminho, dirs) {
  let real;
  try {
    real = realpathSync(caminho);
  } catch {
    return false;
  }
  return dirs.some((d) => {
    let rd;
    try {
      rd = realpathSync(d);
    } catch {
      return false;
    }
    return real === rd || real.startsWith(rd + sep);
  });
}

export function lerCauda(caminho, maxBytes) {
  let fd;
  try {
    fd = openSync(caminho, 'r');
    const { size } = fstatSync(fd);
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const texto = buf.toString('utf8');
    return len < size ? texto.slice(texto.indexOf('\n') + 1) : texto;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function linhasJson(texto) {
  const saida = [];
  for (const l of texto.split('\n')) {
    if (!l.trim()) continue;
    try {
      saida.push(JSON.parse(l));
    } catch {
      /* linha parcial ou lixo */
    }
  }
  return saida;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/tradutores-comum.test.js`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tradutores/comum.js test/tradutores-comum.test.js
git commit -m "feat: utilitários comuns dos tradutores e deduplicação"
```

---

### Task 9: `src/tradutores/claude.js` — hooks do Claude Code e tokens do transcrito

**Files:**
- Create: `src/tradutores/claude.js`
- Test: `test/tradutores-claude.test.js`

**Interfaces:**
- Produces: `MAX_BYTES_TRANSCRITO = 65536`; `lerTokensClaude(caminho, ultimoUuid, { dirsPermitidos, maxBytes }) → { tokens: { contexto, saidaIncremento }, ultimoUuid, parcial, modelo } | null`; `criarTradutorClaude({ cli = 'claude', agora, lerTokens, dirsPermitidos, semTranscritos }) → traduzir(payload)`.
- Reusado pela Task 10 com `cli: 'codex'` e outro `lerTokens`.

- [ ] **Step 1: Escrever os testes**

`test/tradutores-claude.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarTradutorClaude, lerTokensClaude } from '../src/tradutores/claude.js';
import { normalizarLote } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const comum = { session_id: 'abc', transcript_path: '/t.jsonl', cwd: '/proj', permission_mode: 'default' };
const validos = (evs) => assert.equal(normalizarLote(evs, agora).rejeitados.length, 0);

test('SessionStart, prompt, ferramentas, subagentes, permissões e fim', () => {
  const t = criarTradutorClaude({ agora, semTranscritos: true });
  const inicio = t({ ...comum, hook_event_name: 'SessionStart', source: 'startup', model: 'claude-opus-5' });
  assert.equal(inicio[0].tipo, 'sessao.inicio');
  assert.equal(inicio[0].modelo, 'claude-opus-5');
  assert.equal(inicio[0].origem, 'startup');
  assert.equal(inicio[0].cwd, '/proj');
  const prompt = t({ ...comum, hook_event_name: 'UserPromptSubmit', prompt: 'Minutar' });
  assert.deepEqual([prompt[0].tipo, prompt[0].prompt], ['prompt', 'Minutar']);
  const pre = t({ ...comum, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/proj/a.md' }, tool_use_id: 'toolu_1' });
  assert.deepEqual(pre[0].ferramenta, { nome: 'Edit', detalhe: '/proj/a.md', id: 'toolu_1' });
  const pos = t({ ...comum, hook_event_name: 'PostToolUseFailure', tool_name: 'Edit', tool_use_id: 'toolu_1', error: 'x' });
  assert.deepEqual(pos[0].ferramenta, { nome: 'Edit', id: 'toolu_1', ok: false });
  const sub = t({ ...comum, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'b' }, tool_use_id: 't2', agent_id: 'ag1', agent_type: 'Explore' });
  assert.deepEqual(sub[0].agente, { id: 'ag1', tipo: 'Explore' });
  const si = t({ ...comum, hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'Explore' });
  assert.deepEqual(si[0], { ...si[0], tipo: 'subagente.inicio', agente: { id: 'ag1', tipo: 'Explore' } });
  assert.equal(t({ ...comum, hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'Explore' })[0].tipo, 'subagente.fim');
  assert.equal(t({ ...comum, hook_event_name: 'PermissionRequest', tool_name: 'Bash' })[0].motivo, 'permissao');
  assert.equal(t({ ...comum, hook_event_name: 'Notification', notification_type: 'permission_prompt' })[0].tipo, 'aguardando');
  assert.deepEqual(t({ ...comum, hook_event_name: 'Notification', notification_type: 'auth_success' }), []);
  assert.equal(t({ ...comum, hook_event_name: 'Stop', stop_hook_active: false })[0].tipo, 'parado');
  assert.equal(t({ ...comum, hook_event_name: 'SessionEnd', reason: 'exit' })[0].tipo, 'sessao.fim');
  assert.equal(t({ ...comum, hook_event_name: 'PreCompact' }), null);
  assert.equal(t({ hook_event_name: 'Stop' }), null);
  assert.equal(t('lixo'), null);
  validos([...inicio, ...prompt, ...pre, ...pos, ...sub, ...si]);
});

test('Stop dentro de subagente não gera parado; SessionStart de subagente é ignorado', () => {
  const t = criarTradutorClaude({ agora, semTranscritos: true });
  assert.deepEqual(t({ ...comum, hook_event_name: 'Stop', agent_id: 'ag1', agent_type: 'Explore' }), []);
  assert.deepEqual(t({ ...comum, hook_event_name: 'SessionStart', agent_id: 'ag1', agent_type: 'Explore' }), []);
});

function transcrito(dir, linhas) {
  const arq = join(dir, 's.jsonl');
  writeFileSync(arq, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return arq;
}
const assistente = (uuid, usage, model = 'claude-fable-5-1') => ({ type: 'assistant', uuid, message: { model, usage, content: [] } });

test('lerTokensClaude soma só as mensagens novas e informa contexto da última', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const arq = transcrito(dir, [
    { type: 'user', uuid: 'u1', message: { role: 'user' } },
    assistente('a1', { input_tokens: 2, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: 50 }),
    assistente('a2', { input_tokens: 3, cache_read_input_tokens: 200, cache_creation_input_tokens: 0, output_tokens: 70 }),
  ]);
  const r1 = lerTokensClaude(arq, undefined, { dirsPermitidos: [dir] });
  assert.deepEqual(r1.tokens, { contexto: 203, saidaIncremento: 120 });
  assert.equal(r1.ultimoUuid, 'a2');
  assert.equal(r1.modelo, 'claude-fable-5-1');
  assert.equal(r1.parcial, false);
  writeFileSync(arq, JSON.stringify(assistente('a3', { input_tokens: 1, cache_read_input_tokens: 300, cache_creation_input_tokens: 0, output_tokens: 5 })) + '\n', { flag: 'a' });
  const r2 = lerTokensClaude(arq, 'a2', { dirsPermitidos: [dir] });
  assert.deepEqual(r2.tokens, { contexto: 301, saidaIncremento: 5 });
  const r3 = lerTokensClaude(arq, 'inexistente', { dirsPermitidos: [dir] });
  assert.equal(r3.parcial, true);
  assert.equal(lerTokensClaude(arq, undefined, { dirsPermitidos: [join(dir, 'outro')] }), null);
  assert.equal(lerTokensClaude(join(dir, 'nada.jsonl'), undefined, { dirsPermitidos: [dir] }), null);
});

test('Stop emite tokens a partir do leitor injetado e guarda o último uuid por sessão', () => {
  const chamadas = [];
  const lerTokens = (caminho, ultimo) => {
    chamadas.push([caminho, ultimo]);
    return { tokens: { contexto: 10, saidaIncremento: 4 }, ultimoUuid: 'u9', parcial: false, modelo: 'claude-sonnet-5' };
  };
  const t = criarTradutorClaude({ agora, lerTokens });
  const evs = t({ ...comum, hook_event_name: 'Stop' });
  assert.deepEqual(evs.map((e) => e.tipo), ['parado', 'tokens']);
  assert.equal(evs[1].modelo, 'claude-sonnet-5');
  t({ ...comum, hook_event_name: 'Stop' });
  assert.deepEqual(chamadas, [['/t.jsonl', undefined], ['/t.jsonl', 'u9']]);
  validos(evs);
  const quebra = criarTradutorClaude({ agora, lerTokens: () => { throw new Error('boom'); } });
  assert.deepEqual(quebra({ ...comum, hook_event_name: 'Stop' }).map((e) => e.tipo), ['parado']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/tradutores-claude.test.js`
Expected: FAIL com `Cannot find module '../src/tradutores/claude.js'`.

- [ ] **Step 3: Implementar `src/tradutores/claude.js`**

```js
import { campo, resumirEntrada, base, evento, dentroDe, lerCauda, linhasJson } from './comum.js';

export const MAX_BYTES_TRANSCRITO = 64 * 1024;

const NOTIFICACOES_ESPERA = {
  permission_prompt: 'permissao',
  idle_prompt: 'pergunta',
  agent_needs_input: 'pergunta',
  elicitation_dialog: 'pergunta',
};

/**
 * Lê o fim do transcrito JSONL do Claude Code (formato interno, melhor esforço).
 * contexto = tamanho do contexto da última mensagem de assistente;
 * saidaIncremento = soma de output_tokens das mensagens após `ultimoUuid`.
 */
export function lerTokensClaude(caminho, ultimoUuid, { dirsPermitidos = [], maxBytes = MAX_BYTES_TRANSCRITO } = {}) {
  if (typeof caminho !== 'string' || !caminho) return null;
  if (dirsPermitidos.length && !dentroDe(caminho, dirsPermitidos)) return null;
  const texto = lerCauda(caminho, maxBytes);
  if (!texto) return null;
  const entradas = linhasJson(texto).filter((o) => o?.type === 'assistant' && o.message?.usage && typeof o.uuid === 'string');
  if (!entradas.length) return null;
  const idx = ultimoUuid ? entradas.findIndex((e) => e.uuid === ultimoUuid) : -1;
  const novas = entradas.slice(idx + 1);
  const ultima = entradas.at(-1);
  const u = ultima.message.usage;
  const contexto = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  const saidaIncremento = novas.reduce((s, e) => s + (e.message.usage.output_tokens ?? 0), 0);
  return {
    tokens: { contexto, saidaIncremento },
    ultimoUuid: ultima.uuid,
    parcial: Boolean(ultimoUuid) && idx === -1,
    modelo: typeof ultima.message.model === 'string' ? ultima.message.model : undefined,
  };
}

export function criarTradutorClaude({ cli = 'claude', agora = () => Date.now(), lerTokens = lerTokensClaude, dirsPermitidos = [], semTranscritos = false } = {}) {
  const ultimos = new Map();
  return function traduzir(p) {
    if (!p || typeof p !== 'object') return null;
    const b = base(p, cli, agora);
    if (!b.sessao) return null;
    const nome = p.hook_event_name;
    const idAgente = campo(p, 'agent_id', 'agentId');
    const tipoAgente = campo(p, 'agent_type', 'agentType');
    const agente = idAgente !== undefined
      ? { id: String(idAgente), tipo: typeof tipoAgente === 'string' ? tipoAgente : undefined }
      : undefined;
    const nomeFerramenta = String(campo(p, 'tool_name') ?? '?');
    const idBruto = campo(p, 'tool_use_id', 'toolUseId', 'call_id');
    const idChamada = idBruto === undefined ? undefined : String(idBruto);

    switch (nome) {
      case 'SessionStart':
        return agente ? [] : [evento(b, 'sessao.inicio', { origem: typeof p.source === 'string' ? p.source : undefined })];
      case 'SessionEnd':
        return agente ? [] : [evento(b, 'sessao.fim')];
      case 'UserPromptSubmit':
        return [evento(b, 'prompt', { prompt: typeof p.prompt === 'string' ? p.prompt : '' })];
      case 'PreToolUse':
        return [evento(b, 'ferramenta.inicio', {
          ferramenta: { nome: nomeFerramenta, detalhe: resumirEntrada(nomeFerramenta, p.tool_input), id: idChamada },
          agente,
        })];
      case 'PostToolUse':
      case 'PostToolUseFailure':
        return [evento(b, 'ferramenta.fim', { ferramenta: { nome: nomeFerramenta, id: idChamada, ok: nome === 'PostToolUse' }, agente })];
      case 'SubagentStart':
        return agente
          ? [evento(b, 'subagente.inicio', { agente: { id: agente.id, tipo: agente.tipo, descricao: typeof p.description === 'string' ? p.description : undefined } })]
          : [];
      case 'SubagentStop':
        return agente ? [evento(b, 'subagente.fim', { agente: { id: agente.id } })] : [];
      case 'PermissionRequest':
        return [evento(b, 'aguardando', { motivo: 'permissao' })];
      case 'Notification': {
        const t = campo(p, 'notification_type', 'type');
        return NOTIFICACOES_ESPERA[t] ? [evento(b, 'aguardando', { motivo: NOTIFICACOES_ESPERA[t] })] : [];
      }
      case 'Stop':
      case 'StopFailure':
      case 'Interrupt':
      case 'StopCancelled': {
        if (agente) return [];
        const saida = [evento(b, 'parado')];
        if (!semTranscritos && typeof p.transcript_path === 'string') {
          let r = null;
          try {
            r = lerTokens(p.transcript_path, ultimos.get(b.sessao), { dirsPermitidos });
          } catch {
            r = null;
          }
          if (r) {
            ultimos.set(b.sessao, r.ultimoUuid);
            saida.push(evento(b, 'tokens', { tokens: r.tokens, modelo: r.modelo }));
          }
        }
        return saida;
      }
      default:
        return null;
    }
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/tradutores-claude.test.js`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tradutores/claude.js test/tradutores-claude.test.js
git commit -m "feat: tradutor dos hooks do Claude Code com tokens do transcrito"
```

---

### Task 10: `src/tradutores/codex.js` — hooks do Codex e tokens do rollout

**Files:**
- Create: `src/tradutores/codex.js`
- Test: `test/tradutores-codex.test.js`

**Interfaces:**
- Consumes: `criarTradutorClaude` (Task 9), `dentroDe`, `lerCauda`, `linhasJson` (Task 8).
- Produces: `MAX_BYTES_ROLLOUT = 65536`; `lerTokensCodex(caminho, _ultimo, { dirsPermitidos, maxBytes }) → { tokens: { contexto, janela?, saidaTotal? }, ultimoUuid: undefined, parcial: false, modelo? } | null`; `criarTradutorCodex(opts) → traduzir(payload)`.
- Formato do rollout verificado nesta máquina (codex-cli 0.155.1): linhas `{ timestamp, ordinal, type, payload }`; `type: 'turn_context'` com `payload.model`; `type: 'event_msg'` com `payload.type: 'token_count'` e `payload.info: { total_token_usage: { input_tokens, cached_input_tokens, output_tokens, total_tokens }, last_token_usage: {...}, model_context_window }`.

- [ ] **Step 1: Escrever os testes**

`test/tradutores-codex.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarTradutorCodex, lerTokensCodex } from '../src/tradutores/codex.js';
import { normalizarLote } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const comum = { session_id: '01a0', transcript_path: '/r.jsonl', cwd: '/proj', model: 'gpt-6-astra', permission_mode: 'default', turn_id: 't1' };

test('eventos do Codex viram eventos v1 com cli codex e modelo em todo evento', () => {
  const t = criarTradutorCodex({ agora, semTranscritos: true });
  const pre = t({ ...comum, hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command: 'rg foo' }, tool_use_id: 'c1' });
  assert.equal(pre[0].cli, 'codex');
  assert.equal(pre[0].modelo, 'gpt-6-astra');
  assert.deepEqual(pre[0].ferramenta, { nome: 'shell', detalhe: 'rg foo', id: 'c1' });
  assert.equal(t({ ...comum, hook_event_name: 'Interrupt' })[0].tipo, 'parado');
  assert.equal(t({ ...comum, hook_event_name: 'SubagentStart', agent_id: 'sa1', agent_type: 'gsd-planner' })[0].tipo, 'subagente.inicio');
  assert.equal(normalizarLote(pre, agora).rejeitados.length, 0);
});

test('lerTokensCodex usa o último token_count e o modelo do turn_context', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const arq = join(dir, 'rollout.jsonl');
  const linhas = [
    { timestamp: 'x', ordinal: 1, type: 'session_meta', payload: { id: '01a0', cwd: '/proj' } },
    { timestamp: 'x', ordinal: 2, type: 'turn_context', payload: { model: 'gpt-6-astra', cwd: '/proj' } },
    { timestamp: 'x', ordinal: 3, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 10, total_tokens: 110 }, last_token_usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 10, total_tokens: 110 }, model_context_window: 400000 }, rate_limits: null } },
    { timestamp: 'x', ordinal: 4, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 20418, cached_input_tokens: 0, output_tokens: 153, total_tokens: 20571 }, last_token_usage: { input_tokens: 20418, cached_input_tokens: 0, output_tokens: 143, total_tokens: 20561 }, model_context_window: 400000 }, rate_limits: null } },
    { timestamp: 'x', ordinal: 5, type: 'event_msg', payload: { type: 'task_complete', turn_id: 't1' } },
  ];
  writeFileSync(arq, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const r = lerTokensCodex(arq, undefined, { dirsPermitidos: [dir] });
  assert.deepEqual(r.tokens, { contexto: 20418, janela: 400000, saidaTotal: 153 });
  assert.equal(r.modelo, 'gpt-6-astra');
  assert.equal(lerTokensCodex(arq, undefined, { dirsPermitidos: [join(dir, 'x')] }), null);
  writeFileSync(join(dir, 'vazio.jsonl'), '{"type":"session_meta","payload":{}}\n');
  assert.equal(lerTokensCodex(join(dir, 'vazio.jsonl'), undefined, { dirsPermitidos: [dir] }), null);
});

test('Stop do Codex emite parado e tokens totais', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const arq = join(dir, 'rollout.jsonl');
  writeFileSync(arq, JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { output_tokens: 9 }, last_token_usage: { input_tokens: 5 } } } }) + '\n');
  const t = criarTradutorCodex({ agora, dirsPermitidos: [dir] });
  const evs = t({ ...comum, transcript_path: arq, hook_event_name: 'Stop' });
  assert.deepEqual(evs.map((e) => e.tipo), ['parado', 'tokens']);
  assert.deepEqual(evs[1].tokens, { contexto: 5, saidaTotal: 9 });
  assert.equal(normalizarLote(evs, agora).rejeitados.length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/tradutores-codex.test.js`
Expected: FAIL com `Cannot find module '../src/tradutores/codex.js'`.

- [ ] **Step 3: Implementar `src/tradutores/codex.js`**

```js
import { criarTradutorClaude } from './claude.js';
import { dentroDe, lerCauda, linhasJson } from './comum.js';

export const MAX_BYTES_ROLLOUT = 64 * 1024;

/** Lê o fim do rollout JSONL do Codex: último token_count (acumulado) e modelo do turn_context. */
export function lerTokensCodex(caminho, _ultimo, { dirsPermitidos = [], maxBytes = MAX_BYTES_ROLLOUT } = {}) {
  if (typeof caminho !== 'string' || !caminho) return null;
  if (dirsPermitidos.length && !dentroDe(caminho, dirsPermitidos)) return null;
  const texto = lerCauda(caminho, maxBytes);
  if (!texto) return null;
  let info = null;
  let modelo;
  for (const o of linhasJson(texto)) {
    if (o?.type === 'event_msg' && o.payload?.type === 'token_count' && o.payload.info) info = o.payload.info;
    if (o?.type === 'turn_context' && typeof o.payload?.model === 'string') modelo = o.payload.model;
  }
  if (!info) return null;
  const ultimo = info.last_token_usage ?? {};
  const total = info.total_token_usage ?? {};
  const tokens = { contexto: ultimo.input_tokens ?? 0 };
  if (typeof info.model_context_window === 'number') tokens.janela = info.model_context_window;
  if (typeof total.output_tokens === 'number') tokens.saidaTotal = total.output_tokens;
  return { tokens, ultimoUuid: undefined, parcial: false, modelo };
}

/** Os hooks do Codex usam os mesmos nomes e campos snake_case do Claude Code, com `model` em todo evento. */
export function criarTradutorCodex(opts = {}) {
  return criarTradutorClaude({ cli: 'codex', lerTokens: lerTokensCodex, ...opts });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/tradutores-codex.test.js`
Expected: `# pass 3`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tradutores/codex.js test/tradutores-codex.test.js
git commit -m "feat: tradutor dos hooks do Codex com tokens do rollout"
```

---

### Task 11: `src/tradutores/grok.js` — envelope camelCase do Grok

**Files:**
- Create: `src/tradutores/grok.js`
- Test: `test/tradutores-grok.test.js`

**Interfaces:**
- Produces: `criarTradutorGrok({ agora }) → traduzir(payload)`.
- Envelope (documentação local `~/.grok/docs/user-guide/10-hooks.md`): `hookEventName` (snake_case), `hook_event_name` (PascalCase), `sessionId`, `cwd`, `workspaceRoot`, `timestamp`, `permissionMode`, `promptId`, `toolName`, `toolInput`, `toolUseId`, `toolInputTruncated`; `subagentType` presente nos eventos disparados dentro de um subagente.

- [ ] **Step 1: Escrever os testes**

`test/tradutores-grok.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTradutorGrok } from '../src/tradutores/grok.js';
import { normalizarLote } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const comum = { sessionId: 'abc-123', cwd: '/Users/you/project', workspaceRoot: '/Users/you/project', permissionMode: 'default', timestamp: '2026-04-14T12:00:00Z' };

test('exemplo da documentação vira ferramenta.inicio com cli grok', () => {
  const t = criarTradutorGrok({ agora });
  const evs = t({ ...comum, hookEventName: 'pre_tool_use', hook_event_name: 'PreToolUse', toolName: 'run_terminal_command', toolInput: { command: 'npm test' }, toolUseId: 'tu1', promptId: 'p1' });
  assert.equal(evs[0].cli, 'grok');
  assert.equal(evs[0].ts, '2026-04-14T12:00:00.000Z');
  assert.deepEqual(evs[0].ferramenta, { nome: 'run_terminal_command', detalhe: 'npm test', id: 'tu1' });
  assert.equal(normalizarLote(evs, agora).rejeitados.length, 0);
});

test('mapa completo de eventos, com subagentes e notificações', () => {
  const t = criarTradutorGrok({ agora });
  const tipo = (h, extra = {}) => t({ ...comum, hookEventName: h, ...extra })?.[0]?.tipo;
  assert.equal(tipo('session_start', { source: 'startup' }), 'sessao.inicio');
  assert.equal(tipo('session_end'), 'sessao.fim');
  assert.equal(tipo('user_prompt_submit', { prompt: 'oi' }), 'prompt');
  assert.equal(tipo('post_tool_use', { toolName: 'read_file', toolUseId: 'x' }), 'ferramenta.fim');
  assert.equal(t({ ...comum, hookEventName: 'post_tool_use_failure', toolName: 'read_file' })[0].ferramenta.ok, false);
  assert.equal(tipo('stop'), 'parado');
  assert.equal(tipo('stop_cancelled', { reason: 'user_interrupt' }), 'parado');
  assert.equal(tipo('notification', { notificationType: 'permission_prompt' }), 'aguardando');
  assert.deepEqual(t({ ...comum, hookEventName: 'notification', notificationType: 'task_complete' }), []);
  const sub = t({ ...comum, hookEventName: 'subagent_start', subagentType: 'explore', agentId: 'sa-1' });
  assert.deepEqual(sub[0].agente, { id: 'sa-1', tipo: 'explore' });
  const subSemId = t({ ...comum, hookEventName: 'subagent_stop', subagentType: 'explore' });
  assert.deepEqual(subSemId[0].agente, { id: 'explore' });
  assert.deepEqual(t({ ...comum, hookEventName: 'session_end', subagentType: 'explore' }), []);
  assert.deepEqual(t({ ...comum, hookEventName: 'stop', subagentType: 'explore' }), []);
  const dentro = t({ ...comum, hookEventName: 'pre_tool_use', toolName: 'grep', toolInput: { pattern: 'x' }, subagentType: 'explore', agentId: 'sa-1' });
  assert.deepEqual(dentro[0].agente, { id: 'sa-1', tipo: 'explore' });
  assert.equal(t({ ...comum, hookEventName: 'pre_compact' }), null);
  assert.equal(t({ hookEventName: 'stop' }), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/tradutores-grok.test.js`
Expected: FAIL com `Cannot find module '../src/tradutores/grok.js'`.

- [ ] **Step 3: Implementar `src/tradutores/grok.js`**

```js
import { campo, resumirEntrada, base, evento } from './comum.js';

const PARADO = new Set(['stop', 'stop_failure', 'stop_cancelled']);

export function criarTradutorGrok({ agora = () => Date.now() } = {}) {
  return function traduzir(p) {
    if (!p || typeof p !== 'object') return null;
    const b = base(p, 'grok', agora);
    if (!b.sessao) return null;
    const nome = p.hookEventName;
    const tipoSub = campo(p, 'subagentType', 'agentType');
    const idSubBruto = campo(p, 'agentId', 'subagentId', 'agent_id');
    const agente = tipoSub !== undefined
      ? { id: String(idSubBruto ?? tipoSub), tipo: typeof tipoSub === 'string' ? tipoSub : undefined }
      : undefined;
    const nomeFerramenta = String(campo(p, 'toolName', 'tool_name') ?? '?');
    const idBruto = campo(p, 'toolUseId', 'tool_use_id');
    const idChamada = idBruto === undefined ? undefined : String(idBruto);

    switch (nome) {
      case 'session_start':
        return agente ? [] : [evento(b, 'sessao.inicio', { origem: typeof p.source === 'string' ? p.source : undefined })];
      case 'session_end':
        return agente ? [] : [evento(b, 'sessao.fim')];
      case 'user_prompt_submit':
        return [evento(b, 'prompt', { prompt: String(campo(p, 'prompt', 'userPrompt', 'text') ?? '') })];
      case 'pre_tool_use':
        return [evento(b, 'ferramenta.inicio', {
          ferramenta: { nome: nomeFerramenta, detalhe: resumirEntrada(nomeFerramenta, campo(p, 'toolInput', 'tool_input')), id: idChamada },
          agente,
        })];
      case 'post_tool_use':
      case 'post_tool_use_failure':
        return [evento(b, 'ferramenta.fim', { ferramenta: { nome: nomeFerramenta, id: idChamada, ok: nome === 'post_tool_use' }, agente })];
      case 'subagent_start':
        return agente ? [evento(b, 'subagente.inicio', { agente: { id: agente.id, tipo: agente.tipo, descricao: campo(p, 'description', 'prompt') } })] : [];
      case 'subagent_stop':
        return agente ? [evento(b, 'subagente.fim', { agente: { id: agente.id } })] : [];
      case 'notification': {
        const t = campo(p, 'notificationType', 'notification_type', 'type');
        return t === 'permission_prompt' ? [evento(b, 'aguardando', { motivo: 'permissao' })] : [];
      }
      default:
        if (PARADO.has(nome)) return agente ? [] : [evento(b, 'parado')];
        return null;
    }
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/tradutores-grok.test.js`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tradutores/grok.js test/tradutores-grok.test.js
git commit -m "feat: tradutor dos hooks http do Grok CLI"
```

---

### Task 12: `src/tradutores/cursor.js` — hooks camelCase do Cursor Agent

**Files:**
- Create: `src/tradutores/cursor.js`
- Test: `test/tradutores-cursor.test.js`

**Interfaces:**
- Produces: `criarTradutorCursor({ agora }) → traduzir(payload)`.
- Os nomes exatos dos campos do payload do Cursor são fixados pelas fixtures reais da Task 18; até lá o tradutor aceita as grafias `conversation_id | session_id | sessionId`, `tool_name | toolName | tool`, `tool_input | toolInput | input`, `tool_use_id | toolUseId | tool_call_id`, `prompt | text | message`, `subagent_type | subagentType`, `subagent_id | subagentId | agent_id`, `workspace_roots | cwd`.

- [ ] **Step 1: Escrever os testes**

`test/tradutores-cursor.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTradutorCursor } from '../src/tradutores/cursor.js';
import { normalizarLote } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const comum = { conversation_id: 'conv-1', generation_id: 'g1', workspace_roots: ['/w/proj'] };

test('eventos camelCase do Cursor viram eventos v1', () => {
  const t = criarTradutorCursor({ agora });
  const tipo = (h, extra = {}) => t({ ...comum, hook_event_name: h, ...extra })?.[0]?.tipo;
  assert.equal(tipo('sessionStart'), 'sessao.inicio');
  assert.equal(t({ ...comum, hook_event_name: 'sessionStart' })[0].cwd, '/w/proj');
  assert.equal(tipo('sessionEnd'), 'sessao.fim');
  assert.equal(t({ ...comum, hook_event_name: 'beforeSubmitPrompt', prompt: 'Revisar' })[0].prompt, 'Revisar');
  const pre = t({ ...comum, hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: { command: 'ls' }, tool_call_id: 'k1' });
  assert.deepEqual(pre[0].ferramenta, { nome: 'Shell', detalhe: 'ls', id: 'k1' });
  assert.equal(t({ ...comum, hook_event_name: 'postToolUseFailure', tool_name: 'Shell', tool_call_id: 'k1' })[0].ferramenta.ok, false);
  const sub = t({ ...comum, hook_event_name: 'subagentStart', subagent_type: 'explore', subagent_id: 'sa9', prompt: 'olhar' });
  assert.deepEqual(sub[0].agente, { id: 'sa9', tipo: 'explore', descricao: 'olhar' });
  assert.equal(tipo('subagentStop', { subagent_type: 'explore' }), 'subagente.fim');
  assert.equal(tipo('stop'), 'parado');
  assert.equal(t({ ...comum, hook_event_name: 'afterFileEdit' }), null);
  assert.equal(t({ hook_event_name: 'stop' }), null);
  assert.equal(normalizarLote([...pre, ...sub], agora).rejeitados.length, 0);
});

test('aceita grafias camelCase alternativas', () => {
  const t = criarTradutorCursor({ agora });
  const evs = t({ sessionId: 'c2', hookEventName: 'preToolUse', toolName: 'Read', toolInput: { path: '/a' }, toolUseId: 'u' });
  assert.deepEqual(evs[0].ferramenta, { nome: 'Read', detalhe: '/a', id: 'u' });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/tradutores-cursor.test.js`
Expected: FAIL com `Cannot find module '../src/tradutores/cursor.js'`.

- [ ] **Step 3: Implementar `src/tradutores/cursor.js`**

```js
import { campo, resumirEntrada, base, evento } from './comum.js';

export function criarTradutorCursor({ agora = () => Date.now() } = {}) {
  return function traduzir(p) {
    if (!p || typeof p !== 'object') return null;
    const b = base(p, 'cursor', agora);
    if (!b.sessao) return null;
    const nome = campo(p, 'hook_event_name', 'hookEventName', 'event');
    const tipoSub = campo(p, 'subagent_type', 'subagentType');
    const idSubBruto = campo(p, 'subagent_id', 'subagentId', 'agent_id', 'agentId') ?? tipoSub;
    const agente = idSubBruto !== undefined
      ? { id: String(idSubBruto), tipo: typeof tipoSub === 'string' ? tipoSub : undefined }
      : undefined;
    const nomeFerramenta = String(campo(p, 'tool_name', 'toolName', 'tool') ?? '?');
    const entrada = campo(p, 'tool_input', 'toolInput', 'input');
    const idBruto = campo(p, 'tool_use_id', 'toolUseId', 'tool_call_id', 'toolCallId');
    const idChamada = idBruto === undefined ? undefined : String(idBruto);

    switch (nome) {
      case 'sessionStart':
        return [evento(b, 'sessao.inicio')];
      case 'sessionEnd':
        return [evento(b, 'sessao.fim')];
      case 'beforeSubmitPrompt':
        return [evento(b, 'prompt', { prompt: String(campo(p, 'prompt', 'text', 'message') ?? '') })];
      case 'preToolUse':
        return [evento(b, 'ferramenta.inicio', { ferramenta: { nome: nomeFerramenta, detalhe: resumirEntrada(nomeFerramenta, entrada), id: idChamada }, agente })];
      case 'postToolUse':
      case 'postToolUseFailure':
        return [evento(b, 'ferramenta.fim', { ferramenta: { nome: nomeFerramenta, id: idChamada, ok: nome === 'postToolUse' }, agente })];
      case 'subagentStart':
        return agente ? [evento(b, 'subagente.inicio', { agente: { id: agente.id, tipo: agente.tipo, descricao: campo(p, 'description', 'prompt') } })] : [];
      case 'subagentStop':
        return agente ? [evento(b, 'subagente.fim', { agente: { id: agente.id } })] : [];
      case 'stop':
        return [evento(b, 'parado')];
      default:
        return null;
    }
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/tradutores-cursor.test.js`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tradutores/cursor.js test/tradutores-cursor.test.js
git commit -m "feat: tradutor dos hooks do Cursor Agent"
```

---

### Task 13: `src/tradutores/gemini.js` — hooks do Gemini CLI (documentado, sem teste local)

**Files:**
- Create: `src/tradutores/gemini.js`
- Test: `test/tradutores-gemini.test.js`

**Interfaces:**
- Produces: `criarTradutorGemini({ agora }) → traduzir(payload)`.
- Payload conforme a documentação (geminicli.com/docs/hooks): `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `timestamp`; `tool_name`, `tool_input`, `tool_response` nos eventos de ferramenta; `llm_request`/`llm_response` em `BeforeModel`/`AfterModel`.

- [ ] **Step 1: Escrever os testes**

`test/tradutores-gemini.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTradutorGemini } from '../src/tradutores/gemini.js';
import { normalizarLote } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const comum = { session_id: 'g-1', transcript_path: '/t', cwd: '/proj', timestamp: '2026-09-20T11:00:00Z' };

test('eventos do Gemini CLI viram eventos v1', () => {
  const t = criarTradutorGemini({ agora });
  const tipo = (h, extra = {}) => t({ ...comum, hook_event_name: h, ...extra })?.[0]?.tipo;
  assert.equal(tipo('SessionStart'), 'sessao.inicio');
  assert.equal(tipo('SessionEnd'), 'sessao.fim');
  assert.equal(t({ ...comum, hook_event_name: 'BeforeAgent', prompt: 'Pesquisar' })[0].prompt, 'Pesquisar');
  assert.equal(tipo('AfterAgent'), 'parado');
  const pre = t({ ...comum, hook_event_name: 'BeforeTool', tool_name: 'read_file', tool_input: { path: '/a' }, tool_call_id: 'c1' });
  assert.deepEqual(pre[0].ferramenta, { nome: 'read_file', detalhe: '/a', id: 'c1' });
  assert.equal(t({ ...comum, hook_event_name: 'AfterTool', tool_name: 'read_file', tool_call_id: 'c1', tool_response: {} })[0].ferramenta.ok, true);
  assert.equal(t({ ...comum, hook_event_name: 'AfterTool', tool_name: 'read_file', error: 'x' })[0].ferramenta.ok, false);
  const modelo = t({ ...comum, hook_event_name: 'AfterModel', llm_request: { model: 'gemini-3-pro' }, llm_response: { usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80 } } });
  assert.equal(modelo[0].tipo, 'tokens');
  assert.deepEqual(modelo[0].tokens, { contexto: 1200, saidaIncremento: 80 });
  assert.equal(modelo[0].modelo, 'gemini-3-pro');
  const soModelo = t({ ...comum, hook_event_name: 'AfterModel', llm_response: { model: 'gemini-3-flash' } });
  assert.deepEqual([soModelo[0].tipo, soModelo[0].modelo], ['sessao.inicio', 'gemini-3-flash']);
  assert.deepEqual(t({ ...comum, hook_event_name: 'AfterModel', llm_response: {} }), []);
  assert.equal(tipo('Notification'), 'aguardando');
  assert.equal(t({ ...comum, hook_event_name: 'PreCompress' }), null);
  assert.equal(normalizarLote([...pre, ...modelo, ...soModelo], agora).rejeitados.length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/tradutores-gemini.test.js`
Expected: FAIL com `Cannot find module '../src/tradutores/gemini.js'`.

- [ ] **Step 3: Implementar `src/tradutores/gemini.js`**

```js
import { campo, resumirEntrada, base, evento } from './comum.js';

export function criarTradutorGemini({ agora = () => Date.now() } = {}) {
  return function traduzir(p) {
    if (!p || typeof p !== 'object') return null;
    const b = base(p, 'gemini', agora);
    if (!b.sessao) return null;
    const nome = p.hook_event_name;
    const nomeFerramenta = String(campo(p, 'tool_name') ?? '?');
    const idBruto = campo(p, 'tool_call_id', 'tool_use_id', 'call_id');
    const idChamada = idBruto === undefined ? undefined : String(idBruto);

    switch (nome) {
      case 'SessionStart':
        return [evento(b, 'sessao.inicio')];
      case 'SessionEnd':
        return [evento(b, 'sessao.fim')];
      case 'BeforeAgent':
        return [evento(b, 'prompt', { prompt: String(campo(p, 'prompt', 'user_prompt', 'message') ?? '') })];
      case 'AfterAgent':
        return [evento(b, 'parado')];
      case 'BeforeTool':
        return [evento(b, 'ferramenta.inicio', { ferramenta: { nome: nomeFerramenta, detalhe: resumirEntrada(nomeFerramenta, p.tool_input), id: idChamada } })];
      case 'AfterTool':
        return [evento(b, 'ferramenta.fim', { ferramenta: { nome: nomeFerramenta, id: idChamada, ok: !p.error } })];
      case 'AfterModel': {
        const resp = p.llm_response ?? {};
        const req = p.llm_request ?? {};
        const uso = resp.usageMetadata ?? resp.usage_metadata ?? resp.usage ?? {};
        const tokens = {};
        const entrada = campo(uso, 'promptTokenCount', 'prompt_token_count', 'input_tokens');
        const saida = campo(uso, 'candidatesTokenCount', 'candidates_token_count', 'output_tokens');
        if (typeof entrada === 'number') tokens.contexto = entrada;
        if (typeof saida === 'number') tokens.saidaIncremento = saida;
        const modelo = campo(resp, 'model', 'modelVersion') ?? campo(req, 'model');
        if (Object.keys(tokens).length) return [evento(b, 'tokens', { tokens, modelo })];
        if (typeof modelo === 'string') return [evento(b, 'sessao.inicio', { modelo })];
        return [];
      }
      case 'Notification':
        return [evento(b, 'aguardando', { motivo: 'pergunta' })];
      default:
        return null;
    }
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/tradutores-gemini.test.js`
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/tradutores/gemini.js test/tradutores-gemini.test.js
git commit -m "feat: tradutor documental dos hooks do Gemini CLI"
```

---

### Task 14: `src/fluxo.js` — Server-Sent Events com `seq`, heartbeat e limites

**Files:**
- Create: `src/fluxo.js`
- Test: `test/fluxo.test.js`

**Interfaces:**
- Produces: `criarFluxo({ maxClientes = 8, maxBuffer = 1048576, heartbeatMs = 15000, setIntervalFn, clearIntervalFn }) → { conectar(req, res, snapshot) → boolean, transmitir(tipo, dados) → seq, formatar(tipo, dados) → string, seq, clientes, fechar() }`.
- Formato de cada mensagem: `event: <tipo>\ndata: <json>\n\n`. `snapshot` leva `{ seq, ...snapshot }`; cada delta leva `{ seq, ...dados }` com `seq` crescente.

- [ ] **Step 1: Escrever os testes**

`test/fluxo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { criarFluxo } from '../src/fluxo.js';

function cliente() {
  const req = new EventEmitter();
  const res = { escritos: [], cabecalho: null, destroyed: false, writableLength: 0, fechado: false,
    writeHead(status, headers) { this.cabecalho = { status, headers }; },
    write(t) { this.escritos.push(t); },
    end(t) { if (t) this.escritos.push(t); this.fechado = true; } };
  return { req, res };
}
const eventos = (res) => res.escritos.filter((t) => t.startsWith('event:')).map((t) => {
  const [, tipo] = t.match(/^event: (\S+)/);
  return { tipo, dados: JSON.parse(t.match(/data: (.*)\n\n$/s)[1]) };
});

test('conectar envia snapshot com seq atual; transmitir numera deltas', () => {
  const timers = [];
  const fluxo = criarFluxo({ setIntervalFn: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; }, clearIntervalFn: () => {} });
  const { req, res } = cliente();
  assert.equal(fluxo.conectar(req, res, { advogados: [], estagiarios: [] }), true);
  assert.equal(res.cabecalho.status, 200);
  assert.equal(res.cabecalho.headers['content-type'], 'text/event-stream');
  assert.deepEqual(eventos(res)[0], { tipo: 'snapshot', dados: { seq: 0, advogados: [], estagiarios: [] } });
  assert.equal(fluxo.transmitir('advogado', { advogado: { id: 'a' } }), 1);
  assert.equal(fluxo.transmitir('remover', { tipo: 'advogado', id: 'a' }), 2);
  const evs = eventos(res);
  assert.deepEqual(evs[1], { tipo: 'advogado', dados: { seq: 1, advogado: { id: 'a' } } });
  assert.deepEqual(evs[2].dados, { seq: 2, tipo: 'advogado', id: 'a' });
  assert.equal(timers[0].ms, 15000);
  timers[0].fn();
  assert.equal(res.escritos.at(-1), ': ping\n\n');
  req.emit('close');
  assert.equal(fluxo.clientes, 0);
  fluxo.fechar();
});

test('limite de clientes responde 503 e consumidor lento é fechado', () => {
  const fluxo = criarFluxo({ maxClientes: 1, maxBuffer: 10, setIntervalFn: () => ({ unref() {} }), clearIntervalFn: () => {} });
  const a = cliente();
  const b = cliente();
  fluxo.conectar(a.req, a.res, {});
  assert.equal(fluxo.conectar(b.req, b.res, {}), false);
  assert.equal(b.res.cabecalho.status, 503);
  a.res.writableLength = 11;
  fluxo.transmitir('advogado', { advogado: {} });
  assert.equal(a.res.fechado, true);
  assert.equal(fluxo.clientes, 0);
  fluxo.fechar();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/fluxo.test.js`
Expected: FAIL com `Cannot find module '../src/fluxo.js'`.

- [ ] **Step 3: Implementar `src/fluxo.js`**

```js
export function criarFluxo({ maxClientes = 8, maxBuffer = 1024 * 1024, heartbeatMs = 15_000, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  const clientes = new Set();
  let seq = 0;

  const formatar = (tipo, dados) => `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;

  function fecharCliente(res) {
    clientes.delete(res);
    try {
      res.end();
    } catch {
      /* já fechado */
    }
  }

  function escrever(res, texto) {
    if (res.destroyed || res.writableLength > maxBuffer) {
      fecharCliente(res);
      return;
    }
    res.write(texto);
  }

  const timer = setIntervalFn(() => {
    for (const res of [...clientes]) escrever(res, ': ping\n\n');
  }, heartbeatMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  function conectar(req, res, snapshot) {
    if (clientes.size >= maxClientes) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ erro: 'limite de clientes do fluxo' }));
      return false;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    clientes.add(res);
    res.write(formatar('snapshot', { seq, ...snapshot }));
    req.on('close', () => clientes.delete(res));
    return true;
  }

  function transmitir(tipo, dados) {
    seq += 1;
    const msg = formatar(tipo, { seq, ...dados });
    for (const res of [...clientes]) escrever(res, msg);
    return seq;
  }

  return {
    conectar,
    transmitir,
    formatar,
    get seq() { return seq; },
    get clientes() { return clientes.size; },
    fechar() {
      clearIntervalFn(timer);
      for (const r of [...clientes]) fecharCliente(r);
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/fluxo.test.js`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/fluxo.js test/fluxo.test.js
git commit -m "feat: fluxo SSE com sequência, heartbeat e limites"
```

---

### Task 15: `src/app.js` e `server.mjs` — servidor HTTP, rotas, segurança e CLI

**Files:**
- Create: `src/app.js`, `server.mjs`, `public/index.html` (placeholder até o Plano 2)
- Test: `test/app.test.js`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 14.
- Produces: `criarAplicacao({ porta, home, raiz, agora, demo, semTranscritos, ocultarPrompts, log, watch }) → { servidor, escritorio, fluxo, saude, snapshot(), ingerir(brutos, origem) → { aceitos, rejeitados }, iniciar() → Promise<portaReal>, fechar() → Promise<void> }`.
- Rotas: `GET /` e estáticos de `public/`; `GET /fluxo` (SSE); `GET /estado`; `GET /saude`; `POST /eventos`; `POST /hook/<cli>`; `POST /hook/generico?cli=<nome>`.
- Snapshot enviado ao cliente: `{ seq, advogados, estagiarios, salas: [{ id, rotulo }], saude }`. `saude[cli] = { ultimoEvento, eventos, ignorados, invalidos, rejeitadosPorTamanho }`.
- `server.mjs`: `node server.mjs [--porta N] [--demo] [--sem-transcritos] [--ocultar-prompts]`, `node server.mjs instalar <cli>`, `node server.mjs desinstalar <cli>` (Task 17 fornece `instalar`/`desinstalar`; até lá o `server.mjs` importa de `./src/instalar.js`, então esta tarefa cria um `src/instalar.js` mínimo que só exporta `CLIS` e lança "ainda não implementado" — a Task 17 o substitui).

- [ ] **Step 1: Escrever os testes**

`test/app.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarAplicacao } from '../src/app.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

async function subir(extra = {}) {
  const app = criarAplicacao({ porta: 0, home: mkdtempSync(join(tmpdir(), 'edp-')), raiz: RAIZ, watch: false, ...extra });
  const porta = await app.iniciar();
  const url = (p) => `http://127.0.0.1:${porta}${p}`;
  return { app, porta, url };
}

function bruto({ porta, metodo = 'GET', caminho = '/', headers = {}, corpo }) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho, headers }, (res) => {
      let dados = '';
      res.on('data', (c) => { dados += c; });
      res.on('end', () => resolve({ status: res.statusCode, dados }));
    });
    req.on('error', reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

const ev = (extra) => ({ v: 1, cli: 'claude', sessao: 's1', ...extra });

test('POST /eventos aplica e GET /estado reflete; Host estranho recebe 421; Origin externo 403', async () => {
  const { app, porta, url } = await subir();
  try {
    const r = await fetch(url('/eventos'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([ev({ tipo: 'prompt', prompt: 'Minutar' }), { v: 1, tipo: 'x' }]) });
    assert.equal(r.status, 202);
    assert.deepEqual(await r.json(), { aceitos: 1, rejeitados: [{ indice: 1, erro: 'tipo desconhecido: x' }] });
    const estado = await (await fetch(url('/estado'))).json();
    assert.equal(estado.advogados[0].estado, 'pensando');
    assert.equal(estado.salas.length, 7);
    assert.equal(estado.saude.eventos.eventos, 1);
    assert.equal(estado.saude.eventos.invalidos, 1);
    assert.equal((await bruto({ porta, caminho: '/estado', headers: { host: 'evil.com:80' } })).status, 421);
    assert.equal((await fetch(url('/estado'), { headers: { origin: 'https://evil.com' } })).status, 403);
    assert.equal((await fetch(url('/estado'), { headers: { origin: `http://localhost:${porta}` } })).status, 200);
    assert.equal((await fetch(url('/nada'))).status, 404);
    assert.equal((await fetch(url('/../package.json'))).status, 404);
  } finally {
    await app.fechar();
  }
});

test('hooks: payload do Claude vira advogado; envelope do Grok em /hook/claude vira cli grok; desconhecido é contado', async () => {
  const { app, url } = await subir();
  try {
    const post = (rota, corpo) => fetch(url(rota), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    assert.equal((await post('/hook/claude', { hook_event_name: 'PreToolUse', session_id: 'c1', cwd: '/p', tool_name: 'Edit', tool_input: { file_path: 'a.md' }, tool_use_id: 't1' })).status, 204);
    assert.equal((await post('/hook/claude', { hookEventName: 'pre_tool_use', hook_event_name: 'PreToolUse', sessionId: 'g1', cwd: '/g', toolName: 'read_file', toolInput: { path: 'x' }, toolUseId: 'u1' })).status, 204);
    assert.equal((await post('/hook/claude', { hook_event_name: 'PreCompact', session_id: 'c1' })).status, 204);
    assert.equal((await post('/hook/generico?cli=copilot', { hook_event_name: 'UserPromptSubmit', session_id: 'k1', prompt: 'oi' })).status, 204);
    assert.equal((await fetch(url('/hook/codex'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' })).status, 204);
    const estado = await (await fetch(url('/estado'))).json();
    const ids = estado.advogados.map((a) => a.id).sort();
    assert.deepEqual(ids, ['claude:c1', 'copilot:k1', 'grok:g1']);
    assert.equal(estado.advogados.find((a) => a.id === 'claude:c1').sala, 'gabinete');
    assert.equal(estado.saude.claude.ignorados, 1);
    assert.equal(estado.saude.grok.eventos, 1);
    assert.equal(estado.saude.codex.invalidos, 1);
  } finally {
    await app.fechar();
  }
});

test('corpo acima do limite recebe 413 e conta em /saude', async () => {
  const { app, porta } = await subir();
  try {
    const grande = JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 'c1', tool_name: 'Read', tool_response: 'x'.repeat(4 * 1024 * 1024 + 10) });
    const r = await bruto({ porta, metodo: 'POST', caminho: '/hook/claude', headers: { host: `127.0.0.1:${porta}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(grande) }, corpo: grande });
    assert.equal(r.status, 413);
    const medio = JSON.stringify(ev({ tipo: 'prompt', prompt: 'x'.repeat(70 * 1024) }));
    const r2 = await bruto({ porta, metodo: 'POST', caminho: '/eventos', headers: { host: `127.0.0.1:${porta}`, 'content-type': 'application/json' }, corpo: medio });
    assert.equal(r2.status, 413);
    const saude = await (await fetch(`http://127.0.0.1:${porta}/saude`)).json();
    assert.equal(saude.claude.rejeitadosPorTamanho, 1);
    assert.equal(saude.eventos.rejeitadosPorTamanho, 1);
  } finally {
    await app.fechar();
  }
});

test('GET /fluxo entrega snapshot e depois deltas numerados', async () => {
  const { app, url } = await subir();
  try {
    const ctrl = new AbortController();
    const resp = await fetch(url('/fluxo'), { signal: ctrl.signal });
    const leitor = resp.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    async function proximo(tipo) {
      for (;;) {
        const i = buffer.indexOf(`event: ${tipo}\n`);
        if (i >= 0) {
          const fim = buffer.indexOf('\n\n', i);
          if (fim >= 0) {
            const bloco = buffer.slice(i, fim);
            buffer = buffer.slice(fim + 2);
            return JSON.parse(bloco.split('\ndata: ')[1]);
          }
        }
        const { value, done } = await leitor.read();
        if (done) throw new Error('fluxo encerrado');
        buffer += dec.decode(value, { stream: true });
      }
    }
    const snap = await proximo('snapshot');
    assert.equal(snap.seq, 0);
    assert.deepEqual(snap.advogados, []);
    await fetch(url('/eventos'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev({ tipo: 'ferramenta.inicio', ferramenta: { nome: 'Read', id: 'r' } })) });
    const delta = await proximo('advogado');
    assert.equal(delta.seq, 1);
    assert.equal(delta.advogado.sala, 'biblioteca');
    ctrl.abort();
  } finally {
    await app.fechar();
  }
});

test('modo demo recusa eventos externos com 503 e --ocultar-prompts esconde o texto', async () => {
  const demo = await subir({ demo: true });
  try {
    const r = await fetch(demo.url('/eventos'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 503);
  } finally {
    await demo.app.fechar();
  }
  const oculto = await subir({ ocultarPrompts: true });
  try {
    oculto.app.ingerir([ev({ tipo: 'prompt', prompt: 'Nome do cliente e segredo' })], 'teste');
    assert.equal(oculto.app.snapshot().advogados[0].caso, 'Caso em andamento (25 caracteres)');
  } finally {
    await oculto.app.fechar();
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/app.test.js`
Expected: FAIL com `Cannot find module '../src/app.js'`.

- [ ] **Step 3: Criar o `src/instalar.js` provisório e o `public/index.html`**

`src/instalar.js` (provisório; a Task 17 substitui):

```js
export const CLIS = Object.freeze(['claude', 'codex', 'grok', 'cursor', 'gemini']);
export function instalar() { throw new Error('instalar ainda não implementado'); }
export function desinstalar() { throw new Error('desinstalar ainda não implementado'); }
```

`public/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Escritório de Pixels</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#1b1a17;color:#e8e2d2;margin:0;padding:32px 16px;max-width:720px}code{background:#2b2924;padding:2px 6px;border-radius:4px}</style>
</head>
<body>
<h1>Escritório de Pixels</h1>
<p>O servidor está no ar. O cliente em pixel art chega no Plano 2.</p>
<p>Enquanto isso: <code>GET /estado</code> mostra o escritório em JSON, <code>GET /saude</code> mostra os adaptadores e <code>GET /fluxo</code> é o fluxo SSE.</p>
</body>
</html>
```

- [ ] **Step 4: Implementar `src/app.js`**

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { homedir } from 'node:os';
import { LIMITES, normalizarLote } from './protocolo.js';
import { carregarSalas } from './salas.js';
import { carregarCargos } from './cargos.js';
import { Escritorio } from './estado.js';
import { criarFluxo } from './fluxo.js';
import { criarDeduplicador, detectarEnvelope } from './tradutores/comum.js';
import { criarTradutorClaude } from './tradutores/claude.js';
import { criarTradutorCodex } from './tradutores/codex.js';
import { criarTradutorGrok } from './tradutores/grok.js';
import { criarTradutorCursor } from './tradutores/cursor.js';
import { criarTradutorGemini } from './tradutores/gemini.js';
import { dirsTranscritos } from './config.js';

const RAIZ_PADRAO = join(dirname(fileURLToPath(import.meta.url)), '..');

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

export const SALAS_ROTULOS = Object.freeze({
  recepcao: 'Recepção', biblioteca: 'Biblioteca', gabinete: 'Gabinete de Redação', revisao: 'Sala de Revisão',
  cartorio: 'Cartório', reunioes: 'Sala de Reuniões', copa: 'Copa',
});

function responder(res, status, json) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(json));
}

/** Lê o corpo até `max` bytes. Acima disso continua drenando e devolve { erro: 413 } para poder responder. */
function lerCorpo(req, max) {
  return new Promise((resolve) => {
    const declarado = Number(req.headers['content-length']);
    let estourou = Number.isFinite(declarado) && declarado > max;
    const partes = [];
    let total = 0;
    req.on('data', (c) => {
      if (estourou) return;
      total += c.length;
      if (total > max) {
        estourou = true;
        partes.length = 0;
      } else {
        partes.push(c);
      }
    });
    req.on('end', () => resolve(estourou ? { erro: 413 } : { texto: Buffer.concat(partes).toString('utf8') }));
    req.on('error', () => resolve({ erro: 400 }));
  });
}

function limparCli(nome) {
  return String(nome ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'generico';
}

export function criarAplicacao({
  porta = 7777, home = homedir(), raiz = RAIZ_PADRAO, agora = () => Date.now(),
  demo = false, semTranscritos = false, ocultarPrompts = false, log = () => {}, watch = true,
} = {}) {
  const salas = carregarSalas(join(raiz, 'salas.json'), { aoErro: log, watch });
  const cargos = carregarCargos(join(raiz, 'cargos.json'), { aoErro: log });
  const escritorio = new Escritorio({
    agora, resolverSala: salas.resolverSala, salaInicialEstagiario: salas.salaInicialEstagiario, cargoDoModelo: cargos.cargoDoModelo,
  });
  const fluxo = criarFluxo();
  const inedito = criarDeduplicador({ agora });
  const dirs = dirsTranscritos(home);
  const tradutores = {
    claude: criarTradutorClaude({ agora, dirsPermitidos: dirs.claude, semTranscritos }),
    codex: criarTradutorCodex({ agora, dirsPermitidos: dirs.codex, semTranscritos }),
    grok: criarTradutorGrok({ agora }),
    cursor: criarTradutorCursor({ agora }),
    gemini: criarTradutorGemini({ agora }),
  };
  const genericos = new Map();
  const saude = {};
  const saudeDe = (cli) => (saude[cli] ??= { ultimoEvento: null, eventos: 0, ignorados: 0, invalidos: 0, rejeitadosPorTamanho: 0 });
  const dirPublico = join(raiz, 'public');
  let hostsOk = new Set();
  let origensOk = new Set();
  let timerTique;

  function snapshot() {
    return {
      ...escritorio.snapshot(),
      salas: Object.entries(SALAS_ROTULOS).map(([id, rotulo]) => ({ id, rotulo })),
      saude,
    };
  }

  function transmitirMudancas(mudancas) {
    for (const m of mudancas) {
      if (m.tipo === 'advogado') fluxo.transmitir('advogado', { advogado: m.advogado });
      else if (m.tipo === 'estagiario') fluxo.transmitir('estagiario', { estagiario: m.estagiario });
      else if (m.tipo === 'remover') fluxo.transmitir('remover', { tipo: m.entidade, id: m.id });
    }
  }

  /** Único ponto de entrada de eventos (v1 brutos): oculta prompts, valida, deduplica, aplica e transmite. */
  function ingerir(brutos, origem) {
    let lista = Array.isArray(brutos) ? brutos : [brutos];
    if (ocultarPrompts) {
      lista = lista.map((b) => (b && b.tipo === 'prompt' && typeof b.prompt === 'string'
        ? { ...b, prompt: `Caso em andamento (${b.prompt.length} caracteres)` }
        : b));
    }
    const { eventos, rejeitados } = normalizarLote(lista, agora);
    const s = saudeDe(origem);
    s.invalidos += rejeitados.length;
    let aceitos = 0;
    for (const ev of eventos) {
      if (!inedito(ev)) continue;
      transmitirMudancas(escritorio.aplicar(ev));
      aceitos += 1;
      s.eventos += 1;
      s.ultimoEvento = new Date(agora()).toISOString();
    }
    return { aceitos, rejeitados };
  }

  function traduzir(cliRota, payload) {
    if (detectarEnvelope(payload) === 'grok') return { cli: 'grok', eventos: tradutores.grok(payload) };
    if (tradutores[cliRota]) return { cli: cliRota, eventos: tradutores[cliRota](payload) };
    let t = genericos.get(cliRota);
    if (!t) {
      t = criarTradutorClaude({ agora, cli: cliRota, semTranscritos: true });
      genericos.set(cliRota, t);
    }
    return { cli: cliRota, eventos: t(payload) };
  }

  async function servirEstatico(caminho, res) {
    const rel = caminho === '/' ? '/index.html' : caminho;
    const alvo = normalize(join(dirPublico, rel));
    if (!alvo.startsWith(dirPublico + sep)) return responder(res, 404, { erro: 'não encontrado' });
    try {
      const dados = await readFile(alvo);
      res.writeHead(200, { 'content-type': TIPOS_MIME[extname(alvo)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(dados);
    } catch {
      responder(res, 404, { erro: 'não encontrado' });
    }
    return undefined;
  }

  async function tratar(req, res) {
    const url = new URL(req.url, 'http://local');
    if (!hostsOk.has(req.headers.host ?? '')) return responder(res, 421, { erro: 'host não permitido' });
    const origem = req.headers.origin;
    if (origem !== undefined && !origensOk.has(origem)) return responder(res, 403, { erro: 'origem não permitida' });

    if (req.method === 'GET') {
      if (url.pathname === '/fluxo') return fluxo.conectar(req, res, snapshot());
      if (url.pathname === '/estado') return responder(res, 200, snapshot());
      if (url.pathname === '/saude') return responder(res, 200, saude);
      return servirEstatico(url.pathname, res);
    }

    if (req.method === 'POST') {
      if (demo) return responder(res, 503, { erro: 'modo demo não aceita eventos externos' });
      if (url.pathname === '/eventos') {
        const corpo = await lerCorpo(req, LIMITES.corpoEventos);
        if (corpo.erro) {
          if (corpo.erro === 413) saudeDe('eventos').rejeitadosPorTamanho += 1;
          return responder(res, corpo.erro, { erro: corpo.erro === 413 ? 'corpo excede 64 KB' : 'corpo inválido' });
        }
        let json;
        try {
          json = JSON.parse(corpo.texto);
        } catch {
          return responder(res, 400, { erro: 'JSON inválido' });
        }
        return responder(res, 202, ingerir(json, 'eventos'));
      }
      const m = url.pathname.match(/^\/hook\/([a-z0-9_-]{1,32})$/);
      if (m) {
        const cliRota = m[1] === 'generico' ? limparCli(url.searchParams.get('cli')) : m[1];
        const corpo = await lerCorpo(req, LIMITES.corpoHook);
        if (corpo.erro) {
          if (corpo.erro === 413) saudeDe(cliRota).rejeitadosPorTamanho += 1;
          res.writeHead(corpo.erro);
          return res.end();
        }
        let payload;
        try {
          payload = JSON.parse(corpo.texto);
        } catch {
          saudeDe(cliRota).invalidos += 1;
          res.writeHead(204);
          return res.end();
        }
        const { cli, eventos } = traduzir(cliRota, payload);
        if (eventos === null) saudeDe(cli).ignorados += 1;
        else ingerir(eventos, cli);
        res.writeHead(204);
        return res.end();
      }
    }
    return responder(res, 404, { erro: 'rota desconhecida' });
  }

  const servidor = createServer((req, res) => {
    tratar(req, res).catch((e) => {
      log(`erro ao tratar ${req.method} ${req.url}: ${e.message}`);
      if (!res.headersSent) responder(res, 500, { erro: 'erro interno' });
      else res.end();
    });
  });

  function iniciar() {
    return new Promise((resolve, reject) => {
      servidor.once('error', reject);
      servidor.listen(porta, '127.0.0.1', () => {
        const real = servidor.address().port;
        hostsOk = new Set([`127.0.0.1:${real}`, `localhost:${real}`, `[::1]:${real}`]);
        origensOk = new Set([...hostsOk].map((h) => `http://${h}`));
        timerTique = setInterval(() => transmitirMudancas(escritorio.tique()), 1000);
        timerTique.unref();
        resolve(real);
      });
    });
  }

  function fechar() {
    clearInterval(timerTique);
    fluxo.fechar();
    salas.fechar();
    return new Promise((resolve) => {
      servidor.closeAllConnections?.();
      servidor.close(() => resolve());
    });
  }

  return { servidor, escritorio, fluxo, saude, snapshot, ingerir, iniciar, fechar };
}
```

- [ ] **Step 5: Implementar `server.mjs`**

```js
#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { lerConfig, gravarConfig } from './src/config.js';
import { criarAplicacao } from './src/app.js';
import { iniciarDemo } from './src/demo.js';
import { instalar, desinstalar, CLIS } from './src/instalar.js';

const AJUDA = `Escritório de Pixels

  node server.mjs [--porta N] [--demo] [--sem-transcritos] [--ocultar-prompts]
  node server.mjs instalar <cli>      cli: ${CLIS.join(', ')}
  node server.mjs desinstalar <cli>

  --porta N            porta local (padrão 7777; fica salva em ~/.escritorio-de-pixels/config.json)
  --demo               sessões sintéticas; recusa eventos externos
  --sem-transcritos    não lê transcritos para estimar tokens
  --ocultar-prompts    esconde o texto do caso (tela compartilhada, gravação)
`;

export function lerArgs(argv) {
  const a = { comando: undefined, cli: undefined, porta: undefined, demo: false, semTranscritos: false, ocultarPrompts: false };
  for (let i = 0; i < argv.length; i += 1) {
    const x = argv[i];
    if (x === 'instalar' || x === 'desinstalar') {
      a.comando = x;
      a.cli = argv[i + 1];
      i += 1;
    } else if (x === '--porta') {
      a.porta = Number(argv[i + 1]);
      i += 1;
    } else if (x === '--demo') a.demo = true;
    else if (x === '--sem-transcritos') a.semTranscritos = true;
    else if (x === '--ocultar-prompts') a.ocultarPrompts = true;
    else if (x === '--ajuda' || x === '-h' || x === '--help') a.comando = 'ajuda';
    else a.comando = 'ajuda';
  }
  return a;
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  if (args.comando === 'ajuda') {
    process.stdout.write(AJUDA);
    return;
  }
  const config = lerConfig();
  if (args.porta !== undefined && (!Number.isInteger(args.porta) || args.porta < 1 || args.porta > 65535)) {
    process.stderr.write('Porta inválida.\n');
    process.exit(2);
  }
  const porta = args.porta ?? config.porta;
  if (args.porta !== undefined && args.porta !== config.porta) gravarConfig({ ...config, porta });

  if (args.comando === 'instalar' || args.comando === 'desinstalar') {
    if (!CLIS.includes(args.cli)) {
      process.stderr.write(`Informe a CLI: ${CLIS.join(', ')}\n`);
      process.exit(2);
    }
    const r = args.comando === 'instalar' ? instalar(args.cli, { porta }) : desinstalar(args.cli, {});
    process.stdout.write(`${args.comando}: ${r.arquivo} ${r.alterado ? '(alterado)' : '(já estava assim)'}\n`);
    if (r.backup) process.stdout.write(`backup: ${r.backup}\n`);
    if (args.comando === 'instalar' && args.cli === 'codex') {
      process.stdout.write('Codex: na primeira execução ele pede para confiar nos hooks novos; confirme no próprio Codex.\n');
    }
    return;
  }

  const app = criarAplicacao({
    porta, demo: args.demo, semTranscritos: args.semTranscritos, ocultarPrompts: args.ocultarPrompts,
    log: (m) => process.stderr.write(`[escritorio] ${m}\n`),
  });
  try {
    await app.iniciar();
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      process.stderr.write(`Porta ${porta} ocupada. Use --porta <outra> (e rode "instalar" de novo para atualizar os hooks).\n`);
      process.exit(1);
    }
    throw e;
  }
  process.stdout.write(`Escritório de Pixels em http://127.0.0.1:${porta}${args.demo ? ' (demo)' : ''}\n`);
  if (!args.demo && config.portaInstalada !== undefined && config.portaInstalada !== porta) {
    process.stderr.write(`Aviso: os hooks foram instalados para a porta ${config.portaInstalada}; rode "node server.mjs instalar <cli>" para apontá-los à ${porta}.\n`);
  }
  let demo;
  if (args.demo) demo = iniciarDemo((lote) => app.ingerir(lote, 'demo'));
  const sair = async () => {
    demo?.parar();
    await app.fechar();
    process.exit(0);
  };
  process.on('SIGINT', sair);
  process.on('SIGTERM', sair);
}

// Compara caminhos reais (não URLs): funciona com espaços no caminho e com links simbólicos do npm.
const ehPrincipal = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (ehPrincipal) {
  main().catch((e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
```

Até a Task 16 existir, crie `src/demo.js` provisório com `export function iniciarDemo() { return { parar() {} }; }`.

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test test/app.test.js`
Expected: `# pass 5`, `# fail 0`.

Run também: `node server.mjs --porta 7799 & sleep 1; curl -s http://127.0.0.1:7799/estado | head -c 200; kill %1`
Expected: JSON começando por `{"advogados":[],"estagiarios":[],"salas":[`.

- [ ] **Step 7: Commit**

```bash
git add src/app.js server.mjs src/instalar.js src/demo.js public/index.html test/app.test.js
git commit -m "feat: servidor http com rotas de hooks, eventos, fluxo SSE, saúde e checagens de Host/Origin"
```

---

### Task 16: `src/demo.js` — sessões sintéticas determinísticas

**Files:**
- Create: `src/demo.js` (substitui o provisório)
- Test: `test/demo.test.js`

**Interfaces:**
- Produces: `criarRng(semente) → () => number`; `ROTEIROS` (5 sessões, uma por CLI); `iniciarDemo(ingerir, { agora, intervaloMs = 1500, rng, setIntervalFn, clearIntervalFn }) → { passo() → eventos[], parar() }`. `ingerir(lote, 'demo')` é o `ingerir` da aplicação.

- [ ] **Step 1: Escrever os testes**

`test/demo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarDemo, criarRng, ROTEIROS } from '../src/demo.js';
import { normalizarLote } from '../src/protocolo.js';
import { Escritorio } from '../src/estado.js';

test('rng é determinístico', () => {
  const a = criarRng(7);
  const b = criarRng(7);
  assert.equal(a(), b());
  assert.ok(a() >= 0 && a() < 1);
});

test('a demo cobre as cinco CLIs, gera eventos válidos e chega a parado', () => {
  const lotes = [];
  const demo = iniciarDemo((lote) => lotes.push(lote), { setIntervalFn: () => ({}), clearIntervalFn: () => {}, rng: criarRng(1) });
  for (let i = 0; i < 80; i += 1) demo.passo();
  demo.parar();
  const eventos = lotes.flat();
  assert.equal(normalizarLote(eventos).rejeitados.length, 0);
  assert.deepEqual([...new Set(eventos.map((e) => e.cli))].sort(), ['claude', 'codex', 'cursor', 'gemini', 'grok']);
  assert.ok(eventos.some((e) => e.tipo === 'subagente.inicio'));
  assert.ok(eventos.some((e) => e.tipo === 'tokens'));
  assert.ok(eventos.filter((e) => e.tipo === 'parado').length >= 5);
  assert.ok(eventos.every((e) => !e.prompt || /fict/i.test(e.prompt)));
  const esc = new Escritorio();
  for (const e of normalizarLote(eventos).eventos) esc.aplicar(e);
  assert.equal(esc.snapshot().advogados.length, ROTEIROS.length);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demo.test.js`
Expected: FAIL (`criarRng` não exportado pelo provisório).

- [ ] **Step 3: Implementar `src/demo.js`**

```js
/** Gerador determinístico (LCG) para a demo ser reprodutível em testes e capturas. */
export function criarRng(semente = 42) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Casos fictícios: nenhum nome real, nenhum processo real.
export const ROTEIROS = Object.freeze([
  {
    cli: 'claude', sessao: 'demo-claude', modelo: 'claude-fable-5-1', cwd: '/demo/execucao-fiscal',
    prompt: 'Minutar contestação em execução fiscal de IPTU (caso fictício)',
    passos: [['Read', 'peticao-inicial.md'], ['Grep', 'prescrição'], ['WebSearch', 'prescrição intercorrente execução fiscal STJ'], ['Agent', 'Explore: levantar precedentes do STJ'], ['Write', 'contestacao.md'], ['Edit', 'contestacao.md'], ['Bash', 'git commit -m "minuta"']],
  },
  {
    cli: 'codex', sessao: 'demo-codex', modelo: 'gpt-6-astra', cwd: '/demo/parecer-licitacao',
    prompt: 'Revisar parecer sobre dispensa de licitação (caso fictício)',
    passos: [['read_file', 'parecer.md'], ['shell', 'rg "art. 75" parecer.md'], ['apply_patch', 'parecer.md'], ['shell', 'npm test']],
  },
  {
    cli: 'grok', sessao: 'demo-grok', modelo: 'grok-4', cwd: '/demo/recurso-trabalhista',
    prompt: 'Pesquisar jurisprudência do TST sobre horas in itinere (caso fictício)',
    passos: [['web_search', 'horas in itinere TST 2026'], ['read_file', 'acordao.txt'], ['search_replace', 'recurso.md']],
  },
  {
    cli: 'cursor', sessao: 'demo-cursor', modelo: 'claude-sonnet-5', cwd: '/demo/contrato-locacao',
    prompt: 'Ajustar cláusula de reajuste do contrato (caso fictício)',
    passos: [['Read', 'contrato.md'], ['Write', 'contrato.md'], ['Shell', 'git diff']],
  },
  {
    cli: 'gemini', sessao: 'demo-gemini', modelo: 'gemini-3-pro', cwd: '/demo/mandado-seguranca',
    prompt: 'Elaborar impetração de mandado de segurança (caso fictício)',
    passos: [['google_web_search', 'prazo decadencial mandado de segurança'], ['read_file', 'ato-coator.md'], ['write_file', 'ms.md']],
  },
]);

export function iniciarDemo(ingerir, { agora = () => Date.now(), intervaloMs = 1500, rng = criarRng(7), setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  const cursores = ROTEIROS.map((roteiro, i) => ({ roteiro, fase: 'inicio', indice: 0, espera: i * 2, subagentes: 0, agente: undefined }));
  const base = (r) => ({ v: 1, cli: r.cli, sessao: r.sessao, cwd: r.cwd, modelo: r.modelo, ts: new Date(agora()).toISOString() });

  function passo() {
    const lote = [];
    for (const c of cursores) {
      if (c.espera > 0) {
        c.espera -= 1;
        continue;
      }
      const r = c.roteiro;
      const b = base(r);
      if (c.fase === 'inicio') {
        lote.push({ ...b, tipo: 'sessao.inicio', origem: 'demo' });
        c.fase = 'prompt';
      } else if (c.fase === 'prompt') {
        lote.push({ ...b, tipo: 'prompt', prompt: r.prompt });
        c.fase = 'ferramenta';
        c.indice = 0;
      } else if (c.fase === 'ferramenta') {
        const [nome, detalhe] = r.passos[c.indice];
        lote.push({ ...b, tipo: 'ferramenta.inicio', ferramenta: { nome, detalhe, id: `${r.sessao}-${c.indice}` } });
        if (nome === 'Agent') {
          c.subagentes += 1;
          const id = `${r.sessao}-ag${c.subagentes}`;
          lote.push({ ...b, tipo: 'subagente.inicio', agente: { id, tipo: 'Explore', descricao: detalhe } });
          lote.push({ ...b, tipo: 'ferramenta.inicio', ferramenta: { nome: 'Grep', detalhe: 'precedentes', id: `${id}-t` }, agente: { id } });
          c.agente = id;
        }
        c.fase = 'fim';
        c.espera = 1 + Math.floor(rng() * 3);
      } else if (c.fase === 'fim') {
        const [nome] = r.passos[c.indice];
        if (c.agente) {
          lote.push({ ...b, tipo: 'ferramenta.fim', ferramenta: { nome: 'Grep', id: `${c.agente}-t`, ok: true }, agente: { id: c.agente } });
          lote.push({ ...b, tipo: 'subagente.fim', agente: { id: c.agente } });
          c.agente = undefined;
        }
        lote.push({ ...b, tipo: 'ferramenta.fim', ferramenta: { nome, id: `${r.sessao}-${c.indice}`, ok: true } });
        c.indice += 1;
        if (c.indice >= r.passos.length) {
          lote.push({ ...b, tipo: 'tokens', tokens: { contexto: 40_000 + Math.floor(rng() * 90_000), janela: 200_000, saidaIncremento: 500 + Math.floor(rng() * 2000) } });
          lote.push({ ...b, tipo: 'parado' });
          c.fase = 'prompt';
          c.espera = 4 + Math.floor(rng() * 6);
        } else {
          c.fase = 'ferramenta';
        }
      }
    }
    if (lote.length) ingerir(lote, 'demo');
    return lote;
  }

  const timer = setIntervalFn(passo, intervaloMs);
  return { passo, parar: () => clearIntervalFn(timer) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/demo.test.js && node server.mjs --demo --porta 7799 & sleep 6; curl -s http://127.0.0.1:7799/estado | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.advogados.map(a=>a.cli+':'+a.estado+':'+a.sala).join(' | '))})"; kill %1`
Expected: testes `# pass 2`; a linha mostra até cinco advogados com estados variados.

- [ ] **Step 5: Commit**

```bash
git add src/demo.js test/demo.test.js
git commit -m "feat: modo demo com sessões sintéticas de cinco CLIs"
```

---

### Task 17: `src/instalar.js` e `adaptadores/*.hooks.json` — instaladores por CLI

**Files:**
- Create: `src/instalar.js` (substitui o provisório), `adaptadores/claude.hooks.json`, `adaptadores/codex.hooks.json`, `adaptadores/grok.hooks.json`, `adaptadores/cursor.hooks.json`, `adaptadores/gemini.hooks.json`
- Test: `test/instalar.test.js`

**Interfaces:**
- Consumes: `urlHook`, `comandoCurl`, `lerConfig`, `gravarConfig` (Task 1).
- Produces: `CLIS`; `EVENTOS_POR_CLI`; `arquivoDeHooks(cli, home) → string`; `ehNosso(hook) → boolean`; `mesclar(cli, configAtual, porta) → novaConfig`; `remover(cli, configAtual) → novaConfig`; `instalar(cli, { home, porta, agora }) → { arquivo, backup, alterado, porta }`; `desinstalar(cli, { home, agora }) → { arquivo, backup, alterado }`.
- Formatos: Claude, Codex, Grok e Gemini usam `{ hooks: { <Evento>: [ { hooks: [ entrada ] } ] } }`; Cursor usa `{ version: 1, hooks: { <evento>: [ entrada ] } }`. Entradas: Claude e Grok `{ type: 'http', url, timeout: 2 }`; Codex `{ type: 'command', command, timeout: 2 }`; Cursor `{ command, timeout: 2 }`; Gemini `{ type: 'command', command, timeout: 2000 }` (ms).

- [ ] **Step 1: Escrever os testes**

`test/instalar.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIS, mesclar, remover, instalar, desinstalar, arquivoDeHooks, ehNosso } from '../src/instalar.js';
import { lerConfig } from '../src/config.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const agora = () => Date.parse('2026-09-20T12:00:00Z');
const casa = () => mkdtempSync(join(tmpdir(), 'edp-'));

test('mesclar sobre vazio bate com as amostras em adaptadores/', () => {
  for (const cli of CLIS) {
    const amostra = JSON.parse(readFileSync(join(RAIZ, 'adaptadores', `${cli}.hooks.json`), 'utf8'));
    assert.deepEqual(mesclar(cli, {}, 7777), amostra, cli);
  }
});

test('mesclar preserva hooks de terceiros, é idempotente e remover devolve o original', () => {
  const original = {
    permissions: { allow: ['Bash(npm test)'] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo oi' }] }] },
  };
  const uma = mesclar('claude', original, 7777);
  assert.deepEqual(uma.permissions, original.permissions);
  assert.equal(uma.hooks.PreToolUse.length, 2);
  assert.deepEqual(uma.hooks.PreToolUse[0], original.hooks.PreToolUse[0]);
  assert.equal(uma.hooks.PreToolUse[1].hooks[0].url, 'http://127.0.0.1:7777/hook/claude');
  const duas = mesclar('claude', uma, 7800);
  assert.equal(duas.hooks.PreToolUse.length, 2);
  assert.equal(duas.hooks.PreToolUse[1].hooks[0].url, 'http://127.0.0.1:7800/hook/claude');
  assert.deepEqual(remover('claude', duas), original);
  assert.deepEqual(remover('claude', { a: 1 }), { a: 1 });
  assert.equal(ehNosso({ type: 'http', url: 'http://127.0.0.1:1/hook/x' }), true);
  assert.equal(ehNosso({ command: 'echo /hook/' }), true);
  assert.equal(ehNosso({ command: 'echo' }), false);
});

test('cursor: entradas diretas e version preservada', () => {
  const original = { version: 1, hooks: { preToolUse: [{ command: './meu.sh' }] } };
  const m = mesclar('cursor', original, 7777);
  assert.equal(m.hooks.preToolUse.length, 2);
  assert.match(m.hooks.preToolUse[1].command, /\/hook\/cursor/);
  assert.equal(m.hooks.stop.length, 1);
  assert.deepEqual(remover('cursor', m), original);
});

test('instalar grava com backup atômico e persiste a porta; desinstalar reverte', () => {
  const home = casa();
  const arquivo = arquivoDeHooks('claude', home);
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, JSON.stringify({ model: 'opus' }));
  const r = instalar('claude', { home, porta: 7800, agora });
  assert.equal(r.alterado, true);
  assert.equal(r.arquivo, arquivo);
  assert.ok(r.backup.endsWith('.bak-2026-09-20T12-00-00-000Z'));
  assert.deepEqual(JSON.parse(readFileSync(r.backup, 'utf8')), { model: 'opus' });
  const gravado = JSON.parse(readFileSync(arquivo, 'utf8'));
  assert.equal(gravado.model, 'opus');
  assert.equal(gravado.hooks.Stop[0].hooks[0].url, 'http://127.0.0.1:7800/hook/claude');
  assert.deepEqual(lerConfig(home), { porta: 7800, portaInstalada: 7800 });
  const r2 = instalar('claude', { home, porta: 7800, agora });
  assert.equal(r2.alterado, false);
  const d = desinstalar('claude', { home, agora });
  assert.equal(d.alterado, true);
  assert.deepEqual(JSON.parse(readFileSync(arquivo, 'utf8')), { model: 'opus' });
  assert.equal(readdirSync(dirname(arquivo)).some((n) => n.includes('.tmp-')), false);
});

test('instalar recusa arquivo que não é JSON e cria o arquivo quando não existe', () => {
  const home = casa();
  const arquivo = arquivoDeHooks('codex', home);
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, '{ quebrado');
  assert.throws(() => instalar('codex', { home, porta: 7777, agora }), /não é JSON válido/);
  assert.equal(readFileSync(arquivo, 'utf8'), '{ quebrado');
  const home2 = casa();
  const r = instalar('gemini', { home: home2, porta: 7777, agora });
  assert.equal(existsSync(r.arquivo), true);
  assert.equal(r.backup, undefined);
  assert.equal(JSON.parse(readFileSync(r.arquivo, 'utf8')).hooks.BeforeTool[0].hooks[0].timeout, 2000);
});

test('grok usa arquivo próprio: desinstalar remove o arquivo com backup', () => {
  const home = casa();
  const r = instalar('grok', { home, porta: 7777, agora });
  assert.equal(r.arquivo, join(home, '.grok', 'hooks', 'escritorio.json'));
  assert.equal(JSON.parse(readFileSync(r.arquivo, 'utf8')).hooks.PreToolUse[0].hooks[0].type, 'http');
  const d = desinstalar('grok', { home, agora });
  assert.equal(existsSync(r.arquivo), false);
  assert.equal(existsSync(d.backup), true);
  assert.equal(desinstalar('grok', { home, agora }).alterado, false);
  assert.throws(() => instalar('emacs', { home, porta: 1, agora }), /cli desconhecida/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/instalar.test.js`
Expected: FAIL (`mesclar` não exportado pelo provisório).

- [ ] **Step 3: Implementar `src/instalar.js`**

```js
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { urlHook, comandoCurl, lerConfig, gravarConfig } from './config.js';

export const CLIS = Object.freeze(['claude', 'codex', 'grok', 'cursor', 'gemini']);
const MARCA = '/hook/';

export const EVENTOS_POR_CLI = Object.freeze({
  claude: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'PermissionRequest', 'Notification', 'Stop', 'SessionEnd'],
  codex: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStart', 'SubagentStop', 'Stop', 'Interrupt'],
  grok: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'StopFailure', 'StopCancelled'],
  cursor: ['sessionStart', 'sessionEnd', 'beforeSubmitPrompt', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'subagentStart', 'subagentStop', 'stop'],
  gemini: ['SessionStart', 'SessionEnd', 'BeforeAgent', 'AfterAgent', 'BeforeTool', 'AfterTool', 'AfterModel', 'Notification'],
});

function exigirCli(cli) {
  if (!CLIS.includes(cli)) throw new Error(`cli desconhecida: ${cli} (use ${CLIS.join(', ')})`);
}

export function arquivoDeHooks(cli, home = homedir()) {
  exigirCli(cli);
  switch (cli) {
    case 'claude': return join(home, '.claude', 'settings.json');
    case 'codex': return join(home, '.codex', 'hooks.json');
    case 'grok': return join(home, '.grok', 'hooks', 'escritorio.json');
    case 'cursor': return join(home, '.cursor', 'hooks.json');
    default: return join(home, '.gemini', 'settings.json');
  }
}

function entrada(cli, porta) {
  switch (cli) {
    case 'claude': return { type: 'http', url: urlHook('claude', porta), timeout: 2 };
    case 'grok': return { type: 'http', url: urlHook('grok', porta), timeout: 2 };
    case 'codex': return { type: 'command', command: comandoCurl('codex', porta), timeout: 2 };
    case 'cursor': return { command: comandoCurl('cursor', porta), timeout: 2 };
    default: return { type: 'command', command: comandoCurl('gemini', porta), timeout: 2000 };
  }
}

export function ehNosso(h) {
  if (!h || typeof h !== 'object') return false;
  return (typeof h.url === 'string' && h.url.includes(MARCA)) || (typeof h.command === 'string' && h.command.includes(MARCA));
}

const objeto = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

function semNossosGrupos(grupos) {
  return grupos
    .map((g) => (g && Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !ehNosso(h)) } : g))
    .filter((g) => !(g && Array.isArray(g.hooks) && g.hooks.length === 0));
}

export function mesclar(cli, atual, porta) {
  exigirCli(cli);
  const cfg = structuredClone(objeto(atual));
  const nossa = entrada(cli, porta);
  cfg.hooks = objeto(cfg.hooks);
  if (cli === 'cursor') {
    cfg.version ??= 1;
    for (const ev of EVENTOS_POR_CLI.cursor) {
      const lista = Array.isArray(cfg.hooks[ev]) ? cfg.hooks[ev].filter((h) => !ehNosso(h)) : [];
      lista.push(nossa);
      cfg.hooks[ev] = lista;
    }
    return cfg;
  }
  for (const ev of EVENTOS_POR_CLI[cli]) {
    const grupos = semNossosGrupos(Array.isArray(cfg.hooks[ev]) ? cfg.hooks[ev] : []);
    grupos.push({ hooks: [nossa] });
    cfg.hooks[ev] = grupos;
  }
  return cfg;
}

export function remover(cli, atual) {
  exigirCli(cli);
  const cfg = structuredClone(objeto(atual));
  if (!cfg.hooks || typeof cfg.hooks !== 'object') return cfg;
  for (const ev of Object.keys(cfg.hooks)) {
    const lista = cfg.hooks[ev];
    if (!Array.isArray(lista)) continue;
    const resto = cli === 'cursor' ? lista.filter((h) => !ehNosso(h)) : semNossosGrupos(lista);
    if (resto.length) cfg.hooks[ev] = resto;
    else delete cfg.hooks[ev];
  }
  if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
  return cfg;
}

const carimbo = (agora) => new Date(agora()).toISOString().replace(/[:.]/g, '-');

function lerJson(arquivo) {
  if (!existsSync(arquivo)) return { existe: false, json: {} };
  const texto = readFileSync(arquivo, 'utf8');
  if (!texto.trim()) return { existe: true, json: {} };
  try {
    return { existe: true, json: JSON.parse(texto) };
  } catch {
    throw new Error(`${arquivo} não é JSON válido; nada foi alterado`);
  }
}

function gravarAtomico(arquivo, json, existe, agora) {
  mkdirSync(dirname(arquivo), { recursive: true });
  let backup;
  if (existe) {
    backup = `${arquivo}.bak-${carimbo(agora)}`;
    copyFileSync(arquivo, backup);
  }
  const tmp = `${arquivo}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(json, null, 2)}\n`);
  renameSync(tmp, arquivo);
  return backup;
}

export function instalar(cli, { home = homedir(), porta, agora = () => Date.now() } = {}) {
  exigirCli(cli);
  const cfg = lerConfig(home);
  const portaFinal = porta ?? cfg.porta;
  const arquivo = arquivoDeHooks(cli, home);
  const { existe, json } = lerJson(arquivo);
  const novo = mesclar(cli, json, portaFinal);
  const alterado = JSON.stringify(novo) !== JSON.stringify(json);
  const backup = alterado ? gravarAtomico(arquivo, novo, existe, agora) : undefined;
  gravarConfig({ ...cfg, porta: portaFinal, portaInstalada: portaFinal }, home);
  return { arquivo, backup, alterado, porta: portaFinal };
}

export function desinstalar(cli, { home = homedir(), agora = () => Date.now() } = {}) {
  exigirCli(cli);
  const arquivo = arquivoDeHooks(cli, home);
  const { existe, json } = lerJson(arquivo);
  if (!existe) return { arquivo, backup: undefined, alterado: false };
  if (cli === 'grok') {
    const backup = `${arquivo}.bak-${carimbo(agora)}`;
    copyFileSync(arquivo, backup);
    unlinkSync(arquivo);
    return { arquivo, backup, alterado: true };
  }
  const novo = remover(cli, json);
  const alterado = JSON.stringify(novo) !== JSON.stringify(json);
  const backup = alterado ? gravarAtomico(arquivo, novo, true, agora) : undefined;
  return { arquivo, backup, alterado };
}
```

- [ ] **Step 4: Gerar as amostras em `adaptadores/`**

Run:

```bash
mkdir -p adaptadores && node -e "
import('./src/instalar.js').then(({ CLIS, mesclar }) => {
  const fs = require('fs');
  for (const cli of CLIS) fs.writeFileSync('adaptadores/' + cli + '.hooks.json', JSON.stringify(mesclar(cli, {}, 7777), null, 2) + '\n');
})"
ls adaptadores
```

Expected: `claude.hooks.json codex.hooks.json cursor.hooks.json gemini.hooks.json grok.hooks.json`.

- [ ] **Step 5: Rodar tudo e ver passar**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/instalar.js adaptadores test/instalar.test.js
git commit -m "feat: instaladores de hooks por CLI com backup e escrita atômica"
```

---

### Task 18: Fixtures reais das CLIs instaladas e aceite de ponta a ponta

**Files:**
- Create: `scripts/capturar.mjs`, `scripts/sanitizar-fixtures.mjs`, `test/fixtures/<cli>/*.json` (claude, codex, grok, cursor), `test/fixtures.test.js`
- Modify (se as capturas exigirem): `src/tradutores/cursor.js`, `src/tradutores/grok.js`, `src/tradutores/claude.js` e seus testes

**Interfaces:**
- Consumes: `instalar` (Task 17), tradutores (Tasks 9 a 12), `normalizarLote` (Task 2).
- Produces: fixtures anonimizadas commitadas e um teste que roda todos os tradutores sobre elas.

Esta tarefa roda nesta máquina, onde Claude Code, Codex 0.155.1, Grok CLI 1.0.34 e Cursor Agent 2026.09.18 estão instalados. Ela usa os instaladores reais (os hooks precisam existir de qualquer forma) e um servidor de captura no lugar do servidor do Escritório.

- [ ] **Step 1: Escrever `scripts/capturar.mjs`**

```js
#!/usr/bin/env node
// Servidor de captura (dev): grava cada POST em test/fixtures/brutos/<cli>/<n>-<evento>.json e responde 204.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerConfig } from '../src/config.js';

const porta = Number(process.argv[2]) || lerConfig().porta;
const raiz = join(process.cwd(), 'test', 'fixtures', 'brutos');
const contadores = new Map();

createServer((req, res) => {
  const m = req.url.match(/^\/hook\/([a-z0-9_-]+)/);
  if (req.method !== 'POST' || !m) {
    res.writeHead(204);
    return res.end();
  }
  const cli = m[1];
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let evento = 'desconhecido';
    try {
      const p = JSON.parse(corpo);
      evento = String(p.hookEventName ?? p.hook_event_name ?? p.event ?? 'desconhecido').replace(/[^A-Za-z_]/g, '');
    } catch { /* grava assim mesmo */ }
    const n = (contadores.get(cli) ?? 0) + 1;
    contadores.set(cli, n);
    const dir = join(raiz, cli);
    mkdirSync(dir, { recursive: true });
    const arquivo = join(dir, `${String(n).padStart(3, '0')}-${evento}.json`);
    writeFileSync(arquivo, corpo);
    process.stdout.write(`${cli} ${evento} → ${arquivo}\n`);
    res.writeHead(204);
    res.end();
  });
}).listen(porta, '127.0.0.1', () => process.stdout.write(`capturando em http://127.0.0.1:${porta}/hook/<cli> (Ctrl+C para sair)\n`));
```

- [ ] **Step 2: Escrever `scripts/sanitizar-fixtures.mjs`**

```js
#!/usr/bin/env node
// Anonimiza test/fixtures/brutos/<cli>/*.json em test/fixtures/<cli>/*.json:
// troca o home por /home/u, ids de sessão por valores estáveis, corta textos longos.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const brutos = join(process.cwd(), 'test', 'fixtures', 'brutos');
const home = homedir();
const ids = new Map();
const idEstavel = (v) => {
  if (!ids.has(v)) ids.set(v, `sessao-${ids.size + 1}`);
  return ids.get(v);
};
const CHAVES_SESSAO = new Set(['session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id', 'promptId', 'prompt_id', 'generation_id']);

function limpar(valor, chave) {
  if (typeof valor === 'string') {
    if (CHAVES_SESSAO.has(chave)) return idEstavel(valor);
    let s = valor.split(home).join('/home/u');
    if (s.length > 80) s = `${s.slice(0, 77)}...`;
    return s;
  }
  if (Array.isArray(valor)) return valor.slice(0, 5).map((v) => limpar(v, chave));
  if (valor && typeof valor === 'object') {
    const saida = {};
    for (const [k, v] of Object.entries(valor)) saida[k] = limpar(v, k);
    return saida;
  }
  return valor;
}

if (!existsSync(brutos)) {
  process.stderr.write('nada em test/fixtures/brutos\n');
  process.exit(1);
}
for (const cli of readdirSync(brutos)) {
  const destino = join(process.cwd(), 'test', 'fixtures', cli);
  mkdirSync(destino, { recursive: true });
  for (const nome of readdirSync(join(brutos, cli)).filter((n) => n.endsWith('.json'))) {
    let json;
    try {
      json = JSON.parse(readFileSync(join(brutos, cli, nome), 'utf8'));
    } catch {
      continue;
    }
    writeFileSync(join(destino, nome), `${JSON.stringify(limpar(json, ''), null, 2)}\n`);
    process.stdout.write(`${cli}/${nome}\n`);
  }
}
```

- [ ] **Step 3: Escrever `test/fixtures.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizarLote } from '../src/protocolo.js';
import { detectarEnvelope } from '../src/tradutores/comum.js';
import { criarTradutorClaude } from '../src/tradutores/claude.js';
import { criarTradutorCodex } from '../src/tradutores/codex.js';
import { criarTradutorGrok } from '../src/tradutores/grok.js';
import { criarTradutorCursor } from '../src/tradutores/cursor.js';
import { criarTradutorGemini } from '../src/tradutores/gemini.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const agora = () => Date.parse('2026-09-20T12:00:00Z');
const TRADUTORES = {
  claude: criarTradutorClaude({ agora, semTranscritos: true }),
  codex: criarTradutorCodex({ agora, semTranscritos: true }),
  grok: criarTradutorGrok({ agora }),
  cursor: criarTradutorCursor({ agora }),
  gemini: criarTradutorGemini({ agora }),
};
const ESSENCIAIS = ['sessao.inicio', 'prompt', 'ferramenta.inicio', 'ferramenta.fim', 'parado'];

for (const cli of Object.keys(TRADUTORES)) {
  const pasta = join(DIR, cli);
  if (!existsSync(pasta)) continue;
  test(`fixtures reais de ${cli} traduzem sem rejeições e cobrem os eventos essenciais`, () => {
    const tipos = new Set();
    for (const nome of readdirSync(pasta).filter((n) => n.endsWith('.json'))) {
      const payload = JSON.parse(readFileSync(join(pasta, nome), 'utf8'));
      const tradutor = detectarEnvelope(payload) === 'grok' ? TRADUTORES.grok : TRADUTORES[cli];
      const eventos = tradutor(payload);
      if (eventos === null) continue;
      const r = normalizarLote(eventos, agora);
      assert.deepEqual(r.rejeitados, [], `${cli}/${nome}`);
      for (const e of r.eventos) tipos.add(e.tipo);
    }
    for (const t of ESSENCIAIS) assert.ok(tipos.has(t), `${cli}: falta ${t} nas fixtures (${[...tipos].join(', ')})`);
  });
}
```

- [ ] **Step 4: Instalar os hooks reais e capturar cada CLI**

Terminal 1 (fica aberto):

```bash
for cli in claude codex grok cursor; do node server.mjs instalar $cli; done
node scripts/capturar.mjs
```

Terminal 2, um bloco por CLI, num diretório descartável:

```bash
cd "$(mktemp -d)" && printf 'Art. 1º Texto de teste.\n' > a.txt
# Claude Code (dispara Read, Write, Agent, Stop):
claude -p "Leia a.txt, crie b.txt com o mesmo conteúdo e use o subagente Explore para listar os arquivos desta pasta." --permission-mode acceptEdits
# Codex (na primeira vez o Codex pede para confiar nos hooks: abra `codex` interativo, aceite e saia; depois):
codex exec "Leia a.txt e crie b.txt com o mesmo conteúdo."
# Grok (confira `grok --help` para o modo não interativo; se não houver, abra `grok`, envie o prompt e saia):
grok "Leia a.txt e crie b.txt com o mesmo conteúdo."
# Cursor Agent:
cursor-agent -p "Leia a.txt e crie b.txt com o mesmo conteúdo." --output-format text
```

Expected: o Terminal 1 imprime uma linha por evento para cada CLI, incluindo `SessionStart`/`session_start`/`sessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` e `SessionEnd`. Se uma CLI não produzir nada, verifique o arquivo de hooks dela (Task 17), o passo de confiança (Codex) e que a porta de captura é a instalada.

- [ ] **Step 5: Anonimizar e rodar o teste das fixtures**

Run: `node scripts/sanitizar-fixtures.mjs && node --test test/fixtures.test.js`
Expected: `# pass 4` (claude, codex, grok, cursor). Se falhar por `falta <tipo>` ou por rejeição:

1. Abra a fixture citada e compare os nomes de campo com os que o tradutor lê (`campo(p, ...)`).
2. Acrescente a grafia real como mais um alias na chamada de `campo` correspondente (por exemplo, o id de sessão do Cursor ou o id de subagente do Grok), sem remover os aliases existentes.
3. Atualize o teste unitário daquele tradutor com um caso que use a grafia real.
4. Rode `npm test` até ficar verde.

- [ ] **Step 6: Aceite de ponta a ponta com o servidor real**

```bash
node server.mjs &
sleep 1
cd "$(mktemp -d)" && printf 'Art. 1º Texto de teste.\n' > a.txt
claude -p "Leia a.txt e resuma em uma frase." --permission-mode acceptEdits
codex exec "Leia a.txt e resuma em uma frase."
curl -s http://127.0.0.1:7777/saude
curl -s http://127.0.0.1:7777/estado | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const a of JSON.parse(s).advogados)console.log(a.cli,a.cargo,a.estado,a.sala,a.caso)})"
kill %1
```

Expected: `/saude` mostra `claude` e `codex` com `eventos > 0` e `ultimoEvento` recente; a lista mostra `claude socio recepcao recepcao Leia a.txt...` e `codex socio recepcao recepcao ...` (o cargo do Codex vem de `gpt-6-astra`). Repita com `grok` e `cursor-agent` e confira as duas linhas correspondentes.

- [ ] **Step 7: Commit**

```bash
git add scripts test/fixtures test/fixtures.test.js src/tradutores test
git commit -m "test: fixtures reais de Claude, Codex, Grok e Cursor com aceite de ponta a ponta"
```

---

## Fora deste plano

- **Plano 2 (cliente):** `public/` com Canvas 2D, `mundo.js`, `sprites.js` com placeholders, `hud.js`, `i18n.js`, consumo do SSE (`snapshot`, `advogado`, `estagiario`, `remover`, `saude`, descarte por `seq`), captura de tela pelo Chrome.
- **Plano 3 (arte, docs e publicação):** `arte/manifesto.json`, `arte/paleta.png`, `arte/gerar.py` com gpt-image-2.5, `atlas.json`, `docs/protocolo.md`, `docs/adaptadores.md`, `README.md`/`README.en.md`, GIF da demo, `gh repo create`.

## Autorrevisão do plano

- Cobertura da spec (seções 3 a 7 e 10 a 13): protocolo e limites (Task 2, 15), deduplicação (8, 15), matriz de estados, chamadas paralelas, lápides, temporizações e limites de recursos (5 a 7, 14), salas com schema e recarga atômica (3), cargos com ordem de variantes (4), tradutores de Claude, Codex, Grok, Cursor, Gemini e genérico (9 a 13, 15), tokens de transcrito e rollout com diretórios permitidos (9, 10), `Host` 421 e `Origin` 403 (15), `/saude` (15), demo isolada (15, 16), `--ocultar-prompts` e `--sem-transcritos` (15), instaladores com backup, escrita atômica e porta persistida (17), aviso de porta divergente (15), CI (1), fixtures reais e aceite (18).
- Sem placeholders: cada passo traz código ou comando; a única parte exploratória é a captura de payloads reais (Task 18), com procedimento e critério de correção definidos.
- Consistência de nomes: `resolverSala`/`salaInicialEstagiario` (3 → 5 → 15), `cargoDoModelo` (4 → 5 → 15), mudanças `{ tipo, advogado | estagiario | entidade, id }` (5 a 7 → 15), `ingerir(lote, origem)` (15 → 16 → server.mjs), `criarTradutorClaude({ cli, lerTokens, ... })` (9 → 10 → 15), `mesclar/remover/instalar/desinstalar` (17 → server.mjs, 18).
