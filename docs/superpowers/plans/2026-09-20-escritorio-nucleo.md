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
