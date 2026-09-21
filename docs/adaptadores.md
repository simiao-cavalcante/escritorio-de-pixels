# Adaptadores por CLI

A tradução do payload nativo para o [evento v1](protocolo.md) fica **no servidor**, em
`POST /hook/<cli>`. Do lado da CLI o adaptador é só um trecho de configuração de hook. A
v1 usa `command` com `curl` para as cinco CLIs — inclusive Claude Code e Grok, que também
oferecem hooks `type: http` nativamente: o hook `http` do Claude Code deixava "hook error
ECONNREFUSED" no terminal do agente a cada chamada de ferramenta quando o Escritório
estava fora do ar, e o Grok recusa hooks `http://` por proteção contra SSRF (só aceita
`https://`). `command` roda em segundo plano, sempre com `|| true`.

Nenhum hook instalado bloqueia o agente: o servidor responde `204` sem corpo, o `curl` tem
timeout de 2 segundos embutido (`-m 2`) e o comando termina em `|| true`, então uma queda
do Escritório é ignorada pela CLI.

## Matriz de capacidades da v1

| CLI | Obrigatória na v1 | Sessão | Prompt | Ferramentas | Subagentes | Modelo | Tokens | Testada nesta máquina |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | sim | sim | sim | sim | sim | no início | estimados (transcrito) | sim |
| Codex | sim | sim | sim | sim | sim | em todo evento | totais (rollout) | sim |
| Grok | sim | sim | sim | sim | sim | não | não | sim |
| Cursor Agent | sim | sim | sim | sim | sim | conforme o payload | não | **não** (ver Pendências) |
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
  diretório + `rename`), preservando o modo do arquivo original (por exemplo `0600`);
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

Arquivo: `~/.claude/settings.json`. Hooks `command` (o payload chega no stdin), com
`async: true` e **sem** `timeout` (hooks assíncronos do Claude Code ignoram o campo).
Conteúdo de `adaptadores/claude.hooks.json` (aqui com um evento por linha para caber na
página; o arquivo é gravado expandido):

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/claude >/dev/null 2>&1 || true", "async": true }] }]
  }
}
```

Particularidades:

- O `model` só vem em `SessionStart`; o cargo é definido ali e só muda se outro evento
  trouxer modelo diferente.
- Tokens são **estimados**: no `Stop`, o tradutor lê no máximo os últimos 64 KB do
  `transcript_path`, que precisa estar dentro de `~/.claude/projects/`. Desligue com
  `node server.mjs --sem-transcritos`.
- A v1 tentou primeiro hooks `http`: funcionavam, mas com o Escritório fora do ar o Claude
  Code mostrava "hook error ECONNREFUSED" a cada chamada de ferramenta (não só no `Stop`).
  Por isso o adaptador usa `command` + `curl` (`|| true`, nunca aparece para o agente) e
  `async: true` (não espera a resposta do servidor para seguir).
- Em captura com hook `http`, `claude -p` (modo não interativo) nunca emitiu `SessionStart`
  — só `UserPromptSubmit` em diante. Com o hook `command` atual há um indício de que
  `SessionStart` passou a aparecer (a primeira sessão capturada abriu com o caso ainda
  `null`, compatível com isso), mas não foi confirmado inspecionando o payload.

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

- **Confiança nos hooks:** depois de instalar, o Codex exige que você confirme a confiança
  nos hooks novos de forma **interativa** — abra `codex` (sessão normal), aceite o prompt
  de confiança e saia; sem isso `codex exec` não carrega hooks nenhum. Existe a flag
  `--dangerously-bypass-hook-trust`, que o instalador não usa nem recomenda.
- **Diretório confiável:** além da confiança nos hooks, o Codex só carrega hooks quando o
  diretório de trabalho está marcado como confiável em `~/.codex/config.toml`
  (`[projects."<caminho>"] trust_level = "trusted"`). `codex exec` num diretório não
  confiável não dispara hooks, mesmo com a confiança já concedida globalmente.
- `model` vem em todo evento.
- Tokens são **totais**: no `Stop`, o tradutor lê os últimos 64 KB do rollout em
  `~/.codex/sessions/` ou `~/.codex/archived_sessions/` e usa o registro `token_count` mais
  recente (`total_token_usage`, ou `last_token_usage` quando o total ainda não veio).
- O mecanismo `notify` não é usado: só emite `agent-turn-complete`, sem modelo nem tokens,
  e aceita um único comando.

## Grok

Arquivo próprio: `~/.grok/hooks/escritorio.json` (o Grok lê os arquivos do diretório
`hooks/`). Hooks `command` — o Grok recusa hooks `type: http` para endereços `http://`
(proteção contra SSRF; só aceita `https://`). Conteúdo de `adaptadores/grok.hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "PermissionDenied": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "StopFailure": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }],
    "StopCancelled": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/grok >/dev/null 2>&1 || true", "timeout": 2 }] }]
  }
}
```

Particularidades:

- O Grok **importa automaticamente** os hooks de `~/.claude/settings.json` e
  `~/.cursor/hooks.json`. Por isso `/hook/claude` e `/hook/cursor` reconhecem o envelope
  camelCase do Grok (`hookEventName` com `_`, ou a presença de `hook_event_name`) e
  rotulam o evento como `cli: grok`; a deduplicação de 2 s elimina o evento em dobro quando
  o arquivo dedicado também está instalado.
- `PermissionDenied` fecha a chamada pendente aberta por `pre_tool_use` como falha
  (`ferramenta.fim` com `ok: false`), do mesmo jeito que `post_tool_use_failure`.
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

- O payload vem em camelCase (`hookEventName`, `sessionId`, `toolName`, `toolInput`).
- Modelo e tokens dependem do payload da versão instalada; quando não vêm, vale o mesmo
  que no Grok.
- **Hooks não dispararam nesta máquina** com `cursor-agent -p` (ver Pendências abaixo). O
  formato gravado pelo instalador foi conferido contra a skill oficial `create-hook` e está
  correto; o tradutor existe e está coberto por teste, mas ainda não foi validado contra um
  payload real do Cursor.

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
- `Notification` vira `aguardando` (com `motivo: "pergunta"`, fixo — confira
  `src/tradutores/gemini.js`).
- O tradutor nasceu da documentação, com fixtures sintéticas. **Não foi testado numa
  instalação real** — o Gemini CLI não está instalada nesta máquina (ver Pendências
  abaixo). Se você usa o Gemini CLI, confira `GET /saude` (campo `ignorados`) e abra uma
  issue com o payload anonimizado.

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

## Pendências

Estado real, por CLI, nesta máquina (macOS), em 2026-09-21:

- **Cursor Agent — hooks não dispararam.** Com `cursor-agent -p`, nenhum hook disparou,
  mesmo depois de conferir que `~/.cursor/hooks.json` está no formato certo (comparado
  contra a skill oficial `create-hook`, que descreve o mesmo formato que o instalador
  grava). A hipótese de o `cursor-agent` rodar comandos "sem shell" (por isso o `curl`
  nunca chegaria a executar) foi testada envolvendo o comando em `/bin/sh -c '...'` e
  descartada — o hook continuou sem disparar. `test/fixtures.test.js` mantém o caso do
  Cursor em `skip`, com o motivo registrado no próprio teste.
- **Gemini CLI — só documentado.** O tradutor foi escrito a partir da documentação oficial
  (geminicli.com/docs/hooks) e testado só com fixtures sintéticas; o Gemini CLI não está
  instalado nesta máquina, então nunca foi exercitado contra um payload real.
- **Codex — exige confiança concedida à mão.** Depois de instalar, é preciso abrir o
  `codex` interativo, aceitar o prompt de confiança nos hooks e sair — sem isso `codex
  exec` não carrega hooks nenhum. Também é preciso que o diretório de trabalho esteja
  marcado confiável em `~/.codex/config.toml`
  (`[projects."<caminho>"] trust_level = "trusted"`); `codex exec` num diretório não
  confiável ignora os hooks mesmo com a confiança já concedida globalmente.
- **Grok — recusa hooks `http://`.** A proteção contra SSRF do Grok bloqueia hooks
  `type: http` que apontem para endereços `http://` (só aceita `https://`), por isso o
  adaptador usa `command` com `curl`, como as demais CLIs.
- **Claude Code — ruído com hook `http` e `SessionStart` ausente em `-p`.** Com o hook
  `http` (testado primeiro), `claude -p` mostrava "hook error ECONNREFUSED" a cada chamada
  de ferramenta sempre que o Escritório estava fora do ar, e a captura em modo `-p` nunca
  trouxe um evento `SessionStart`. O adaptador atual usa `command` + `async: true` por
  causa do primeiro problema; sobre o segundo, a mesma captura repetida com o hook
  `command` sugere (mas não confirma, por falta de inspeção do payload) que `SessionStart`
  passou a ser emitido.

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
