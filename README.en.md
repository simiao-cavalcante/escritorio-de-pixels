# Pixel Office (Escritório de Pixels)

![The Pixel Office in demo mode: pixel-art lawyers walking between rooms](docs/demo.gif)

A local, read-only visualizer that shows your AI agent CLI sessions as a pixel-art law
office. Each session is a lawyer who walks between rooms according to the likely phase of
the work; subagents are interns orbiting whoever hired them; the latest prompt is the case
at hand.

Built to sit on a second monitor while agents research and draft legal documents.

- Local Node server with **zero runtime dependencies**.
- Listens on `127.0.0.1` only; nothing it observes is ever written to disk.
- Works with **Claude Code, Codex and Grok CLI** (tested on this machine, with real
  fixtures and an end-to-end pass), **Cursor Agent** (installer ready and format confirmed
  against the official skill, but hooks never fired on this machine — not validated
  end-to-end), **Gemini CLI** (documented from the official docs, no local test) and
  anything that speaks the [v1 protocol](docs/protocolo.md).
- The room shows the **likely phase** of the work, inferred from the tool in use — an
  approximation, not an oracle.

## How it works

```
CLI (Claude, Codex, Grok, Cursor, Gemini)
  -> native hook (command + curl)
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
git clone https://github.com/simiao-cavalcante/escritorio-de-pixels.git
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
| Cursor Agent | yes | yes | yes | yes | payload dependent | no | no ([see "Pendências"](docs/adaptadores.md#pendências)) |
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
| `biblioteca` (library) | research | `Read`, `Grep`, `Glob`, `WebSearch`, `WebFetch`, general search |
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
  `~/.codex/sessions/`, `~/.codex/archived_sessions/`), at most the last 64 KB, and only to
  estimate tokens. Turn it off with `--sem-transcritos`.
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
