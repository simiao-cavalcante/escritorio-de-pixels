# Escritório de Pixels — Design

Data: 2026-09-20
Estado: design aprovado em conversa; spec revisada por GPT-6 Astra (Codex) e por autorrevisão; aguardando leitura do autor.

## 1. Objetivo

Visualizador local, somente leitura, que mostra sessões de CLIs de agentes de IA como um escritório de advocacia em pixel art. Cada sessão é um advogado que caminha entre salas conforme a fase provável do trabalho jurídico (pesquisa, minuta, revisão, protocolo). Subagentes são estagiários que orbitam quem os recrutou. O último prompt do usuário é o caso em andamento. O propósito é acompanhar, num segundo monitor, o trabalho dos agentes recrutados durante a pesquisa e a minuta de peças e pareceres.

Inspirado no Age of Agents (agentsmill, MIT), mas escrito do zero, leve e neutro quanto ao provedor de LLM: Claude Code, Codex, Grok CLI, Cursor Agent, Gemini CLI, OpenCode ou qualquer ferramenta que fale o protocolo.

As salas são uma aproximação: o servidor infere a fase a partir da ferramenta usada, e a interface diz isso ("sala indica a fase provável").

### Não objetivos da v1

- Responder permissões ou interagir com o agente a partir da tela.
- Múltiplos andares ou cidades; a v1 tem um andar.
- Parsing de transcritos no núcleo do servidor. Adaptadores específicos podem ler um trecho limitado do log da própria CLI para tokens.
- Acesso remoto (fora de loopback). Fica para depois, com autenticação própria.
- Persistência histórica, estatísticas acumuladas, mobile, Windows (não testado).
- Publicação no npm (passo opcional após o GitHub).

## 2. Decisões tomadas

| Tema | Decisão |
| --- | --- |
| Base | Do zero, leve. Zero dependências em runtime. |
| Fonte de eventos | Protocolo próprio + adaptadores por hooks nativos de cada CLI. |
| Salas | Por fase jurídica inferida da ferramenta, regras em dados. |
| Arte | Gerada com gpt-image-2.5 (variante `flare` por padrão, configurável) e pós-processada; placeholders procedurais quando faltar PNG. |
| Provedores | Multi-LLM desde o início: cargo por modelo, crachá por CLI. |
| Idioma | pt-BR primário, en secundário. |
| Licença | MIT, incluindo os PNGs gerados. |
| Revisão | Agente GPT-6 Astra via Codex como revisor independente de spec, plano e diff. |

## 3. Arquitetura

```
CLI (Claude, Codex, Grok, Cursor, Gemini)
  → hook nativo (http ou command+curl)
  → POST /hook/<cli>  ou  POST /eventos            (servidor normaliza e deduplica)
  → estado em memória + máquina de estados + salas  (server.mjs + src/)
  → GET /fluxo (Server-Sent Events: snapshot + deltas numerados)
  → public/ (Canvas 2D: escritório, HUD, ficha do caso)
```

Divisão de responsabilidade: o servidor decide **o quê** (estado, sala, cargo, atividade exibida). O cliente decide **onde e como** (posto dentro da sala, trajeto, animação). Toda a lógica do servidor é testável em Node sem navegador.

### Estrutura de pastas

```
escritorio-de-pixels/
  server.mjs                # entrada: http nativo, SSE, subcomandos (instalar, desinstalar, --demo, --porta)
  src/
    config.js               # porta e caminhos; lê/grava ~/.escritorio-de-pixels/config.json
    protocolo.js            # validação e normalização do evento v1; limites e truncamento
    estado.js               # store de advogados, estagiários e chamadas pendentes; máquina de estados; expiração; limites
    salas.js                # carrega e valida salas.json; resolve ferramenta → sala
    cargos.js               # carrega cargos.json; modelo → cargo; cli → cor e sigla
    fluxo.js                # SSE: snapshot, deltas com seq, heartbeat, consumidores lentos
    tradutores/
      comum.js              # normalização compartilhada (snake_case e camelCase, detalhe, agente, deduplicação)
      claude.js             # hooks http do Claude Code → evento v1 (+ tokens do transcrito)
      codex.js              # hooks command do Codex → evento v1 (+ tokens do rollout)
      grok.js               # hooks http do Grok → evento v1
      cursor.js             # hooks command do Cursor → evento v1
      gemini.js             # hooks command do Gemini CLI → evento v1
    demo.js                 # gerador de eventos sintéticos
    instalar.js             # merge idempotente, escrita atômica e backup das configs de hooks
  public/
    index.html
    escritorio.js           # loop de render, câmera, entrada, cliente SSE
    mundo.js                # layout: tiles, salas, portas, postos, grafo de waypoints
    sprites.js              # atlas.json + placeholders procedurais + animação procedural
    hud.js                  # barra superior, painel lateral, ficha do caso, saúde dos adaptadores
    i18n.js                 # pt-BR e en
    arte/                   # PNGs gerados + atlas.json
  salas.json                # regras ferramenta → sala (dados)
  cargos.json               # regras modelo → cargo e cores por CLI (dados)
  arte/
    manifesto.json          # assets, prompts por categoria, tamanhos alvo, âncoras
    paleta.png              # paleta comum de 32 cores
    gerar.py                # chama gpt-image-2.5 e pós-processa com Pillow
    CREDITOS.md
  adaptadores/
    claude.hooks.json       # trecho inserido em ~/.claude/settings.json
    codex.hooks.json        # trecho inserido em ~/.codex/hooks.json
    grok.hooks.json         # gravado como ~/.grok/hooks/escritorio.json
    cursor.hooks.json       # trecho inserido em ~/.cursor/hooks.json
    gemini.hooks.json       # trecho inserido em ~/.gemini/settings.json
    generico.md             # como emitir eventos com curl
  docs/
    protocolo.md
    adaptadores.md
    superpowers/specs/, plans/
  test/                     # node --test, com fixtures/ por CLI
  .github/workflows/ci.yml
  README.md (pt-BR), README.en.md, LICENSE, package.json (bin, engines >= 20)
```

## 4. Protocolo de eventos v1

Endpoint `POST /eventos`, `Content-Type: application/json`, corpo com um evento ou um array de eventos.

Campos comuns:

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `v` | número | sim | sempre `1` |
| `tipo` | string | sim | um dos tipos abaixo |
| `cli` | string | sim | `claude`, `codex`, `gemini`, `opencode`, `grok`, `cursor` ou outro identificador curto em minúsculas |
| `sessao` | string | sim | id da sessão na CLI; a identidade interna é `cli:sessao` |
| `ts` | string ISO | não | informativo (ficha e ações recentes); o estado usa o relógio do servidor na chegada |
| `cwd` | string | não | diretório de trabalho; identidade do projeto |
| `projeto` | string | não | rótulo legível; ausente: basename de `cwd` |
| `modelo` | string | não | id do modelo, quando a CLI informa; atualiza o cargo se mudar |

Tipos e campos específicos:

| Tipo | Campos |
| --- | --- |
| `sessao.inicio` | `modelo?`, `origem?` |
| `sessao.fim` | — |
| `prompt` | `prompt` (texto); abre um turno novo |
| `ferramenta.inicio` | `ferramenta: { nome, detalhe?, id? }`, `agente?: { id, tipo }` |
| `ferramenta.fim` | `ferramenta: { nome, id?, ok? }`, `agente?` |
| `subagente.inicio` | `agente: { id, tipo, descricao? }` |
| `subagente.fim` | `agente: { id }` |
| `tokens` | `tokens: { contexto?, janela?, saidaTotal?, saidaIncremento? }` (semântica na seção 5) |
| `aguardando` | `motivo?` (`permissao`, `pergunta`, `outro`) |
| `parado` | — (turno terminou) |

Respostas: `202 { aceitos, rejeitados: [{ indice, erro }] }`; corpo inválido `400 { erro }`; corpo grande demais `413`.

Limites de entrada: `/eventos` até 64 KB por requisição; `/hook/*` até 4 MB, porque payloads nativos trazem `tool_input` e `tool_response` completos antes da tradução. Acima disso o servidor responde 413 sem processar e incrementa o contador `rejeitadosPorTamanho` do adaptador (visível em `/saude`). Após a normalização, `detalhe` é truncado a 120 caracteres, `prompt` a 200 e `descricao` a 120; só esses resumos ficam em memória.

Deduplicação: o servidor calcula uma chave (`cli`, `sessao`, `tipo`, `ferramenta.id` ou `ferramenta.nome`, `agente.id`, `ts` arredondado ao segundo) e descarta repetições recebidas nos últimos 2 s. Isso cobre hooks instalados em dobro e a importação automática que o Grok faz dos hooks do Claude e do Cursor.

## 5. Estado e máquina de estados

### Entidades

- **Advogado** (uma por `cli:sessao`): `id`, `cli`, `modelo`, `cargo`, `projetoId` (`cwd`), `projeto` (rótulo), `estado`, `sala`, `atividade` (a chamada pendente mais recente: nome e detalhe), `chamadasPendentes` (mapa por id, até 16; excedente descarta a mais antiga), `caso` (último prompt truncado), `turnos` (contagem), `acoesRecentes` (até 8, contínuas entre turnos), `tokens` (`contexto`, `janela`, `saida`, `saidaEstimada: bool`), `estagiarios` (ids), `desatualizado: bool`, `iniciadoEm`, `ultimaAtividade`, `ultimaAtividadeAgregada`.
- **Estagiário** (um por `cli:sessao:agente.id`): `id`, `sessao`, `tipo`, `descricao`, `estado`, `sala`, `atividade`, `chamadasPendentes` (até 8), `ultimaAtividade`.

### Correlação de chamadas

`ferramenta.inicio` cria uma chamada pendente com chave `ferramenta.id`; sem id, a chave é `nome#n` e `ferramenta.fim` sem id encerra a pendente mais antiga com o mesmo nome. Um `ferramenta.fim` sem pendente correspondente é ignorado. A atividade exibida e a sala vêm sempre da pendente mais recente. `parado` e `sessao.fim` descartam todas as pendentes da sessão e dos seus estagiários.

### Matriz evento × estado do advogado

| Evento | Em `recepcao` | Em `pensando` | Em `trabalhando` | Em `aguardando` | Em `ocioso` |
| --- | --- | --- | --- | --- | --- |
| `sessao.inicio` | atualiza modelo | idem | idem | idem | → `recepcao` |
| `prompt` | → `pensando` | fica; novo caso | fica; novo caso | → `pensando` | → `pensando` |
| `ferramenta.inicio` | → `trabalhando` | → `trabalhando` | fica; nova atividade | → `trabalhando` | → `trabalhando` |
| `ferramenta.fim` | ignora | ignora | sem pendentes → `pensando`; senão fica | ignora | ignora |
| `aguardando` | → `aguardando` | → `aguardando` | → `aguardando` | fica | → `aguardando` |
| `parado` | fica | → `recepcao` | → `recepcao` | → `recepcao` | fica |
| `sessao.fim` | → `saiu` | → `saiu` | → `saiu` | → `saiu` | → `saiu` |
| `tokens`, `subagente.*` | só metadados | idem | idem | idem | → estado anterior não muda; atualiza atividade |

Todo evento da sessão atualiza `ultimaAtividade`. Eventos de estagiário atualizam `ultimaAtividadeAgregada` do advogado e nunca o estado próprio dele.

Temporizações (relógio injetável para teste):

- `pensando` ou `recepcao` sem eventos há 2 min → `ocioso`.
- `trabalhando` sem eventos há 10 min → continua `trabalhando` com `desatualizado: true` (a ferramenta pode ser longa); a flag some no próximo evento.
- `aguardando` sem eventos há 60 min, ou qualquer outro estado sem eventos próprios nem agregados há 30 min → `saiu`.
- `saiu` → removido do snapshot após 3 s; a identidade fica numa lápide por 60 s: nesse período só `sessao.inicio` e `prompt` recriam a sessão, os demais eventos são descartados. Depois da lápide, qualquer evento cria a sessão implicitamente.

Posição em `pensando`: o advogado permanece na sala em que estava (recepção se nunca trabalhou). Só `parado`, `ocioso` e `aguardando` o movem: `parado` para a recepção, `ocioso` para a recepção, `aguardando` para a copa. Isso evita idas e vindas a cada chamada de ferramenta.

### Estagiário

Nasce em `subagente.inicio` na sala `reunioes`, ou em `revisao` se o `tipo` casar com a regra de revisão de `salas.json`. Um evento de ferramenta com `agente` desconhecido cria o estagiário implicitamente. Fica `trabalhando` enquanto tiver pendentes e caminha para a sala da pendente mais recente; sem pendentes fica `pensando` e orbita o advogado. Sai em `subagente.fim`, quando o advogado sai, ou após 15 min sem eventos próprios. Subagentes aninhados (um estagiário que recruta outro) são achatados: todos pertencem à sessão. Limite de 32 estagiários por sessão; o excedente substitui o mais antigo ocioso.

### Tokens

- `contexto` e `janela` são absolutos e substituem o valor anterior.
- `saidaTotal` é absoluto (fonte que informa acumulado, como o rollout do Codex) e substitui; `saidaIncremento` soma ao acumulado e marca `saidaEstimada: true` quando a fonte não cobre tudo (caso do Claude, seção 7).
- A ficha mostra "contexto" com a janela quando conhecida, e "saída" com prefixo "≈" quando estimada. Janela desconhecida aparece como desconhecida, sem barra.

### Caso, turno e projeto

Cada `prompt` inicia um turno e vira o `caso` atual; `acoesRecentes` e `tokens` são da sessão inteira e não zeram. A ficha mostra "Caso atual" e "Turno n". A identidade do projeto é o `cwd` completo; o rótulo é o basename e, quando dois projetos visíveis têm o mesmo basename, o rótulo inclui o diretório pai.

### Fluxo para o cliente

`GET /fluxo` (SSE). Ao conectar: `snapshot { seq, advogados: Advogado[], estagiarios: Estagiario[], salas: [{ id, rotulo }], saude }`. Depois, deltas numerados com `seq` crescente: `advogado { seq, advogado }` (entidade inteira, substitui), `estagiario { seq, estagiario }` (idem), `remover { seq, tipo: 'advogado' | 'estagiario', id }`, `saude { seq, saude }`. Estagiários não são embutidos no advogado; `advogado.estagiarios` contém só ids. O cliente descarta deltas com `seq` menor ou igual ao do último snapshot e pede snapshot novo (reconectando) se detectar salto. Heartbeat a cada 15 s. `GET /estado` devolve o mesmo objeto do snapshot em JSON, para depuração. `GET /saude` devolve, por adaptador: `ultimoEvento`, `eventos`, `rejeitadosPorTamanho`, `invalidos`.

## 6. Salas e regras

Salas da v1 (ids fixos, também conhecidos pelo cliente):

| Sala | Fase | Cai aqui |
| --- | --- | --- |
| `recepcao` | espera e pensamento | ocioso, entre turnos, ferramenta sem regra (balcão) |
| `biblioteca` | pesquisa | Read, Grep, Glob, LS, WebSearch, WebFetch, ToolSearch; `read_file`, `grep_search`, `list_dir`, `codebase_search`, `web_search`, `google_web_search`; prefixos `mcp__brave-search__`, `mcp__context7__`; skills `julgado`, `informativo-*`, `find-skills` |
| `gabinete` | minuta | Edit, Write, MultiEdit, NotebookEdit; `apply_patch`, `write_file`, `edit_file`, `replace`; skills `proprio-punho`, `material`, `ebook*`, `probook-progrupo` |
| `revisao` | revisão | Agent/Task cujo `subagent_type` case com `review|reviewer|verifier|checker|auditor|rescue`; skills `code-review`, `security-review`, `simplify`, `codex:rescue` |
| `cartorio` | protocolo e expediente | Bash, `shell`, `exec_command`, `run_terminal_cmd`, `run_shell_command` |
| `reunioes` | recrutamento e consultas | Agent, Task, Workflow, SendMessage; prefixo `mcp__` sem regra mais específica |
| `copa` | pausa | `aguardando` |

### Schema de `salas.json`

```json
{
  "versao": 1,
  "padrao": "recepcao",
  "regras": [
    { "sala": "gabinete",   "skills": ["proprio-punho", "material", "ebook*"] },
    { "sala": "revisao",    "agentes": "review|reviewer|verifier|checker|auditor|rescue" },
    { "sala": "biblioteca", "detalhe": { "ferramenta": "Bash", "regex": "\\b(rg|grep|find)\\b" } },
    { "sala": "biblioteca", "ferramentas": ["Read", "Grep", "Glob"] },
    { "sala": "biblioteca", "prefixos": ["mcp__brave-search__"] },
    { "sala": "reunioes",   "prefixos": ["mcp__"] }
  ]
}
```

Precedência: `skills` (glob sobre o nome da skill extraído do detalhe da ferramenta `Skill`) > `agentes` (regex sobre `subagent_type`) > `detalhe` (regex sobre o detalhe de uma ferramenta) > `ferramentas` (nome exato) > `prefixos` (o mais longo) > `padrao`. Dentro da mesma prioridade, vence a primeira regra na ordem do arquivo.

Validação atômica: `sala` fora da lista fixa, regex inválida ou glob vazio rejeitam o arquivo inteiro. Na partida, arquivo inválido ou ausente cai nas regras embutidas (iguais ao `salas.json` distribuído) com aviso. Recarga por `fs.watch` com debounce de 300 ms: aplica só se válido, mantém a versão anterior se não, e afeta apenas eventos futuros (não reclassifica pendentes).

### Cargos (`cargos.json`)

Normalização: id do modelo em minúsculas. Ordem de avaliação: primeiro as variantes pequenas, depois as famílias, para `gpt-5-mini` não virar associado.

| Ordem | Cargo | Padrões iniciais |
| --- | --- | --- |
| 1 | Júnior | `haiku`, `mini`, `nano`, `flash-lite`, `local` |
| 2 | Sócio(a) | `fable`, `mythos`, `gpt-6`, `astra`, `ultra`, `grok-5` |
| 3 | Advogado(a) sênior | `opus`, `gpt-5\.[4-9]`, `gemini-3.*pro`, `grok-4` |
| 4 | Associado(a) | `sonnet`, `gpt-5`, `gemini.*flash`, `codex` |
| 5 | Advogado(a) (neutro) | modelo ausente ou sem regra |

Mudança de modelo durante a sessão (evento com `modelo` diferente) troca o cargo e o sprite. Subagentes são sempre estagiários. Crachá por CLI: claude terracota, codex verde, gemini azul, grok grafite, cursor roxo, opencode turquesa, outros cinza; sigla em texto, sem logos de terceiros.

## 7. Adaptadores

Princípio: a tradução do payload nativo para evento v1 fica no servidor, em `POST /hook/<cli>`. Do lado da CLI o adaptador é só um trecho de configuração de hook: tipo `http` quando a CLI oferece (Claude Code, Grok), senão tipo `command` com `curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:<porta>/hook/<cli>`. Nenhum hook instalado bloqueia o agente: o servidor responde `204` sem corpo, o timeout é de 2 s e uma queda do Escritório é ignorada pela CLI.

### Matriz de capacidades da v1

| CLI | Obrigatório na v1 | Sessão | Prompt | Ferramentas em tempo real | Subagentes | Modelo | Tokens | Testado nesta máquina |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Code | sim | sim | sim | sim | sim | no início | estimado (transcrito) | sim |
| Codex | sim | sim | sim | sim | sim | em todo evento | total (rollout) | sim |
| Grok | sim | sim | sim | sim | sim | não | não | sim |
| Cursor Agent | sim | sim | sim | sim | sim | conforme payload | não | sim |
| Gemini CLI | não (documentado) | sim | sim | sim | não | em `AfterModel` | em `AfterModel` | não |
| OpenCode | não (v1.1) | — | — | — | — | — | — | não |

### Instalação

`node server.mjs instalar <cli>` para `claude`, `codex`, `grok`, `cursor` e `gemini`. Contrato comum:

- Lê o arquivo alvo; se não for JSON válido, aborta sem tocar nele. Arquivo ausente é criado.
- Insere as entradas do Escritório sem alterar as demais; idempotente (reconhece as suas por URL ou comando contendo `/hook/`).
- Grava backup `<arquivo>.bak-<timestamp>` e escreve de forma atômica (arquivo temporário no mesmo diretório + rename).
- `desinstalar <cli>` remove só as entradas do Escritório, também com backup e escrita atômica.
- A porta gravada é a de `~/.escritorio-de-pixels/config.json` (`--porta` a persiste). Na partida, se a porta em uso for diferente da última instalada, o servidor avisa e sugere `instalar` de novo.
- Testes de ida e volta por CLI: instalar sobre fixture vazia, sobre fixture com hooks de terceiros, reinstalar, editar por fora, desinstalar; o resultado deve preservar tudo o que não é do Escritório.

Mapeamento comum de eventos de hook para eventos v1, válido para Claude Code, Codex, Grok e Cursor, que usam os mesmos nomes com grafia diferente:

| Evento de hook | Evento v1 |
| --- | --- |
| SessionStart | `sessao.inicio` (com `modelo` quando o payload traz) |
| UserPromptSubmit, beforeSubmitPrompt | `prompt` |
| PreToolUse | `ferramenta.inicio`; `id` = `tool_use_id` quando existir; `detalhe` extraído de `tool_input` (`file_path`, `command`, `query`, `pattern`, `subagent_type` e `description`, `skill`, `url`, `prompt`); `agente` de `agent_id` e `agent_type` |
| PostToolUse, PostToolUseFailure | `ferramenta.fim` com `ok` e o mesmo `id` |
| SubagentStart, SubagentStop | `subagente.inicio`, `subagente.fim` |
| PermissionRequest, Notification (permission_prompt, idle_prompt) | `aguardando` |
| Stop, Interrupt, StopCancelled | `parado` |
| SessionEnd | `sessao.fim` |

Payload nativo desconhecido (evento não mapeado) é contado em `/saude` como `ignorados` e não gera erro.

### Claude Code (confirmado na documentação de hooks)

Hooks do tipo `http` para `/hook/claude`, instalados em `~/.claude/settings.json`. Payload em snake_case: `hook_event_name`, `session_id`, `transcript_path`, `cwd`, `permission_mode`, `tool_name`, `tool_input`, `tool_use_id`, `agent_id`, `agent_type`, `prompt`; `model` só em `SessionStart`.

Tokens (melhor esforço, desligável com `--sem-transcritos`): no `Stop`, o tradutor lê no máximo os últimos 64 KB do `transcript_path`, que precisa estar dentro de `~/.claude/projects/`; percorre as entradas de assistente com `message.usage` e `uuid`, ignora as já processadas nesta sessão (guarda o último `uuid` visto) e emite `tokens` com `contexto` = `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` da entrada mais recente e `saidaIncremento` = soma de `output_tokens` das entradas novas. Se a janela de 64 KB não alcançar o último `uuid` processado, a soma é parcial e continua marcada como estimada. O formato do transcrito é interno ao Claude Code: qualquer erro de leitura é silencioso.

### Codex CLI (hooks nativos; `codex features list` mostra `hooks stable true` na 0.155.1)

Arquivo `~/.codex/hooks.json` com hooks `type: "command"` (JSON no stdin) e `curl` para `/hook/codex`. Eventos: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`. Payload: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model` (em todo evento), `permission_mode`, `turn_id`, `tool_name`, `tool_input`, `tool_response`, `agent_id`, `agent_type`.

Confiança: o Codex exige confirmar a confiança em hooks novos na primeira execução (existe a flag `--dangerously-bypass-hook-trust`, que o instalador não usa nem recomenda). O instalador imprime o passo de confirmação.

Tokens: no `Stop`, o tradutor lê no máximo os últimos 64 KB do `transcript_path` (rollout JSONL, obrigatoriamente dentro de `~/.codex/sessions/` ou `~/.codex/archived_sessions/`), pega o último `token_usage_record` e emite `tokens` com `contexto` = `input_tokens` do último turno, `saidaTotal` = `output_tokens` acumulado da sessão quando o registro traz o acumulado, senão `saidaIncremento` do turno. As fixtures da 0.155.1 fixam qual campo é qual antes da implementação.

O mecanismo `notify` não é usado: só emite `agent-turn-complete`, sem modelo nem tokens, e aceita um único comando, que nesta máquina já está ocupado por outra ferramenta.

### Grok CLI (hooks nativos com `type: "http"`; documentação local em `~/.grok/docs/user-guide/10-hooks.md`)

Arquivo próprio `~/.grok/hooks/escritorio.json` com hooks `http` para `/hook/grok`. Eventos: `session_start`, `session_end`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `post_tool_use_failure`, `permission_denied`, `notification`, `subagent_start`, `subagent_stop`, `stop`, `stop_failure`, `stop_cancelled`. Envelope em camelCase: `hookEventName`, `sessionId`, `cwd`, `workspaceRoot`, `timestamp`, `permissionMode`, `promptId`, `toolName`, `toolInput`.

O Grok importa automaticamente os hooks de `~/.claude/settings.json` e `~/.cursor/hooks.json`, com alias de nomes de ferramenta (confirmado em `~/.grok/logs/hooks.log`). Por isso `/hook/claude` e `/hook/cursor` reconhecem o envelope do Grok pela chave `hookEventName` e rotulam `cli: grok`; a deduplicação elimina o evento em dobro quando o arquivo dedicado também está instalado.

Modelo e tokens: o payload não traz; o advogado aparece com cargo neutro. Leitura de `~/.grok/sessions` fica fora da v1.

### Cursor Agent (hooks nativos; `~/.cursor/hooks.json`, confirmado na skill local `create-hook`)

Merge em `~/.cursor/hooks.json`, hooks `type: "command"` com `curl` para `/hook/cursor`. Eventos: `sessionStart`, `sessionEnd`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart`, `subagentStop`, `stop`. Payload JSON no stdin em camelCase; o tradutor é construído sobre fixtures capturadas de uma execução real do `cursor-agent` nesta máquina, que fixam os nomes de campo. Os hooks cobrem o modo interativo e o modo `--print`, então não há wrapper.

### Gemini CLI (hooks nativos em `settings.json`; não instalado nesta máquina)

Trecho para `~/.gemini/settings.json` com hooks `type: "command"` e `curl` para `/hook/gemini`. Mapeamento: `SessionStart` e `SessionEnd` como acima; `BeforeAgent` vira `prompt`; `AfterAgent` vira `parado`; `BeforeTool` e `AfterTool` viram `ferramenta.inicio` e `ferramenta.fim`; `AfterModel` vira `tokens` e atualiza `modelo` a partir de `llm_response`; `Notification` vira `aguardando`. Payload base: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `timestamp`, mais `tool_name`, `tool_input`, `tool_response` nos eventos de ferramenta. O tradutor nasce da documentação com fixtures sintéticas e o README o marca como não testado localmente, convidando validação.

### OpenCode (v1.1)

`opencode serve` expõe um fluxo SSE em `127.0.0.1:4096/event` com sessões, mensagens, ferramentas, modelo e tokens. O adaptador será uma ponte `node server.mjs ponte opencode` que assina esse fluxo e traduz. Fica fora da v1 por não estar instalado aqui e exigir um processo a mais; entra como issue aberta.

### Genérico e outras CLIs

`POST /hook/generico?cli=<nome>` aceita payloads no formato snake_case do Claude Code, que GitHub Copilot CLI, Kimi CLI e Qwen Code seguem de perto em seus hooks. `docs/protocolo.md` documenta os eventos v1 com exemplos de `curl`, para qualquer script ou pipeline emitir eventos diretamente em `/eventos`. `docs/adaptadores.md` reúne os trechos de configuração por CLI e o esqueleto para novas contribuições.

## 8. Cliente: o escritório

- Canvas 2D com resolução lógica de 960x576 (30x18 tiles de 32 px), escalado ao tamanho da janela mantendo proporção, `image-rendering: pixelated`.
- `mundo.js` define o layout fixo: mapa de tiles (piso, parede, tapete), as sete salas como retângulos com porta e postos (mesa, cadeira, estante), corredor central e grafo de waypoints. Caminho por busca em largura no grafo; movimento interpolado. Mudança de destino no meio do caminho recalcula a partir da posição atual. Troca de sala é aplicada com debounce de 1 s para não reagir a chamadas de ferramenta muito curtas.
- Postos: cada sala tem um número fixo; ao entrar o personagem ocupa o primeiro livre e o libera ao sair; sem posto livre fica em pé junto à porta, com deslocamento para não sobrepor. O mapa desenha até 24 advogados (os de atividade mais recente) e até 6 estagiários por advogado; os demais aparecem só no painel lateral, com aviso.
- Personagens: advogado (sprite do cargo, crachá da CLI, rótulo do projeto embaixo), estagiário (sprite menor que caminha para a sala da sua atividade e, sem atividade, orbita o advogado), balão com ferramenta e detalhe, indicador de estado (reticências para pensando, zzz para ocioso, ponto de interrogação para aguardando, relógio para desatualizado). Animação procedural: balanço ao andar, espelhamento pela direção, overlay de digitação ao trabalhar. Com `prefers-reduced-motion`, sem balanço e deslocamento instantâneo.
- HUD: barra superior com título, contagem de advogados por CLI, indicador de saúde por adaptador (verde: evento há menos de 5 min; cinza: sem eventos; vermelho: rejeições) e alternância de idioma. Painel lateral colapsável com advogados agrupados por projeto. Clique no personagem ou na lista, ou Enter na lista, abre a Ficha do caso: caso atual, turno, CLI, modelo e cargo, sala, ações recentes, tokens quando houver, estagiários ativos. Esc fecha; Tab percorre lista e botões.
- Texto vindo do servidor é sempre inserido como texto (`textContent`), nunca como HTML.
- Estado local: idioma e painel aberto em `localStorage`, com try/catch.

## 9. Arte com gpt-image-2.5

`arte/manifesto.json` lista cada asset: `id`, `categoria` (`personagem`, `movel`, `piso`), `prompt`, `tamanho` alvo em px, `ancora`. Conjunto inicial:

- Personagens (32x48): sócio(a), sênior, associado(a), júnior, neutro, estagiário(a), cada um com duas variações de aparência. Total 12.
- Móveis (múltiplos de 32): mesa com computador, estante, arquivo de aço, mesa de reunião, balcão de recepção, cadeira, planta, máquina de café, impressora e protocolo, quadro de avisos. Total 10.
- Piso e paredes (32x32, repetíveis): madeira, carpete, parede, porta, tapete. Total 5.

`arte/gerar.py` (Python 3, `openai`, Pillow) chama `images.generate` com `model` configurável (padrão `gpt-image-2.5-flare`, alternativa `gpt-image-2.5-sunburst`), `size=1024x1024`, `quality=medium`, e um preâmbulo por categoria:

- personagem e móvel: pixel art 16-bit, visão de cima em três quartos, cores chapadas, sem anti-aliasing, contorno escuro fino, objeto único centralizado, `background=transparent`;
- piso: textura pixel art repetível sem emendas, opaca, sem objetos.

Pós-processamento: personagem e móvel são recortados pela caixa de conteúdo, reduzidos com nearest-neighbor preservando proporção para caber no tamanho alvo, e completados com transparência com âncora na base central; piso é reduzido ao tamanho exato. Todos são quantizados à paleta comum `arte/paleta.png` (32 cores, gerada uma vez e commitada) com alfa binário em 128. Saída em `public/arte/` e `atlas.json` com `{ id, arquivo, categoria, w, h, ancora: { x, y }, hash }`, onde `hash` cobre prompt, tamanho, modelo e preâmbulo; o script regenera quando o hash muda, pula quando é igual e `--forcar` regenera tudo. Falhas de API não interrompem o lote; o relatório final lista o que faltou.

Sem PNG, `sprites.js` desenha placeholders procedurais (silhueta com a cor do cargo, blocos com a cor da sala) e avisa uma vez no console. O app é utilizável antes de existir arte.

Licença dos PNGs: MIT, com `arte/CREDITOS.md` e nota no README informando geração com gpt-image-2.5 e a versão do manifesto.

## 10. Segurança e privacidade

Modelo de ameaça da v1: uma página maliciosa aberta no navegador do próprio usuário tentando ler o fluxo (inclusive por DNS rebinding) ou injetar eventos. Outros usuários na mesma máquina e processos locais estão fora do escopo.

- Escuta apenas em `127.0.0.1`, porta configurável. Sem modo remoto na v1.
- Toda requisição precisa de `Host` igual a `127.0.0.1:<porta>`, `localhost:<porta>` ou `[::1]:<porta>`; caso contrário 421. Isso fecha DNS rebinding, em que o navegador não envia `Origin` em GET de mesma origem.
- `GET /fluxo`, `/estado` e `/saude` aceitam requisições sem `Origin` ou com `Origin` local; qualquer outra recebe 403.
- `POST /eventos` e `/hook/*` aceitam sem `Origin` (hooks e curl) ou com `Origin` local; `Origin` externo recebe 403.
- `transcript_path` recebido num hook só é aberto se estiver dentro do diretório permitido para aquela CLI (seção 7) e a leitura é limitada a 64 KB.
- Conteúdo observado nunca é gravado em disco; prompt, detalhe e descrição são truncados na ingestão. As gravações previstas são só as de configuração: `~/.escritorio-de-pixels/config.json`, arquivos de hooks e seus backups, e preferências em `localStorage`.
- `--ocultar-prompts` substitui o texto do caso por "Caso em andamento (n caracteres)" para uso em tela compartilhada ou gravação.
- Sem telemetria; a única chamada de rede externa do projeto é o script de arte, executado manualmente em desenvolvimento.

## 11. Limites de recursos

| Recurso | Limite | Ao exceder |
| --- | --- | --- |
| Sessões em memória | 64 | remove a ociosa mais antiga |
| Estagiários por sessão | 32 | substitui o ocioso mais antigo |
| Chamadas pendentes | 16 por advogado, 8 por estagiário | descarta a mais antiga |
| Ações recentes | 8 | fila circular |
| Clientes SSE | 8 | recusa com 503 |
| Buffer de escrita por cliente SSE | 1 MB | fecha o cliente lento |
| Leitura de transcrito | 64 KB por `Stop` | lê só o final |
| Corpo de requisição | 64 KB em `/eventos`, 4 MB em `/hook/*` | 413 e contador em `/saude` |

## 12. Tratamento de erros

- JSON inválido ou campos obrigatórios ausentes: 400 com mensagem; num array, os válidos são aceitos e os inválidos listados por índice.
- Ferramenta sem regra: sala `padrao` de `salas.json` (recepção por padrão).
- Queda do servidor: hooks recebem erro de conexão e seguem; o agente não é afetado.
- Reconexão: `EventSource` reconecta sozinho e recebe um `snapshot` novo, descartando o estado anterior.
- Porta ocupada: mensagem clara com sugestão de `--porta`.
- Arte ausente ou corrompida: placeholder e aviso único.
- `salas.json` ou `cargos.json` inválidos: mantém a última versão válida (ou as regras embutidas na partida) e loga o erro.
- Modo `--demo`: usa a porta configurada, gera sessões sintéticas de várias CLIs e responde 503 em `/eventos` e `/hook/*`, para capturas e GIFs conterem só dados sintéticos.

## 13. Testes

- Unitários com `node --test`:
  - protocolo: válido, inválido, limites, truncamento, deduplicação;
  - estado: toda a matriz evento × estado, chamadas paralelas (`inicio(A)`, `inicio(B)`, `fim(A)`), fim sem início, início atrasado, `parado` com pendentes, lápide e ressurreição, expirações com relógio injetado, estagiário implícito, fim de subagente perdido, atividade agregada segurando a expiração do advogado, limites de recursos;
  - salas: precedência, empate por ordem, regex inválida rejeitando o arquivo, sala inexistente, recarga atômica;
  - cargos: ordem variante antes de família, modelo sem regra, troca de modelo;
  - tradutores: fixtures reais capturadas nesta máquina para Claude Code, Codex (hooks e rollout), Grok (inclusive envelope importado chegando em `/hook/claude`) e Cursor, e fixtures sintéticas da documentação para Gemini; payload desconhecido contado como ignorado;
  - instalador: ida e volta por CLI conforme a seção 7, escrita atômica, recusa de arquivo inválido;
  - fluxo: snapshot, deltas com `seq`, consumidor lento fechado, limite de clientes.
- Integração: sobe o servidor em porta efêmera, envia eventos, lê `/fluxo`, confere snapshot e deltas; `Origin` externo recebe 403; `Host` estranho recebe 421; corpo de 5 MB em `/hook/claude` recebe 413 e aparece em `/saude`.
- Aceite com CLIs reais: roteiro manual no plano para Claude Code, Codex, Grok e Cursor nesta máquina, verificando em `/saude` o último evento e na tela o advogado correto; eventos capturados viram fixtures sanitizadas.
- Visual: `--demo` com captura de tela pelo Chrome a cada revisão, checklist no plano (salas, balões, ficha, painel, idioma, reduced motion).
- CI: GitHub Actions rodando `node --test` em Node 20 e 22.

## 14. Processo de construção com vários modelos

| Papel | Modelo | Tarefas |
| --- | --- | --- |
| Arquitetura, spec, plano, revisão final | Fable 5.1 | esta spec, plano de implementação, integração, veredito |
| Design do mundo e da arte | Opus 5 | layout do escritório, grafo de waypoints, prompts do manifesto, tabela de regras de salas e cargos |
| Implementação por módulo | Sonnet 5 | servidor, estado, tradutores, cliente, testes, README, em paralelo por módulo com TDD |
| Verificações baratas | Haiku 4.5 | validação de manifesto e atlas, links do README, consistência i18n |
| Revisão independente | GPT-6 Astra, via Codex CLI (plugin instalado, `model = "gpt-6-astra"`) | revisão crítica da spec, do plano e do diff antes da publicação, como agente revisor separado |
| Revisão final de código | `/code-review` nível alto | correções antes do push |

Ordem de execução do plano: (1) fixtures reais dos payloads de Claude, Codex, Grok e Cursor; (2) protocolo, estado e salas com testes; (3) servidor, fluxo e tradutores; (4) cliente com placeholders até a demo rodar de ponta a ponta; (5) instaladores e aceite com CLIs reais; (6) arte; (7) README, CI e publicação.

## 15. Publicação

- Repositório git local com commits atômicos na `main`.
- `gh repo create simiaocavalcanteia-arch/escritorio-de-pixels --public` e push.
- README pt-BR com GIF da demo, instalação (`git clone` e `node server.mjs`, ou `npx` quando publicado), instalação de hooks por CLI, protocolo, adaptadores, créditos (Age of Agents como inspiração; gpt-image-2.5 na arte) e licença. `README.en.md` equivalente.
- `package.json` com `bin`, `files`, `engines >= 20`; publicação no npm como passo opcional posterior.
- Topics: `claude-code`, `codex`, `pixel-art`, `ai-agents`, `visualization`, `legal-tech`, `pt-br`.

## 16. Riscos e mitigação

- Formato de hooks muda: tradutores isolados, com fixtures, falha silenciosa contada em `/saude` e teste que quebra cedo.
- Arte inconsistente entre imagens: preâmbulo por categoria, paleta comum, hash por asset, placeholders como rede de segurança.
- Latência dos hooks http no Claude Code: timeout de 2 s; alternativa documentada com hook `command` assíncrono.
- Escopo crescer: v1 termina quando a demo e os adaptadores de Claude Code, Codex, Grok e Cursor funcionam de ponta a ponta nesta máquina com arte gerada; Gemini sai documentado e não testado; OpenCode e demais viram issues.

## Anexo: triagem da revisão do GPT-6 Astra

Revisão feita sobre a versão anterior à reescrita dos adaptadores. Dos 24 achados: adotados 1, 2, 3, 6, 7, 8, 9, 10, 11, 13, 15, 16, 17, 18, 19, 20, 21, 22, 24 e parte de 12, 14 e 23; 4 e 5 já estavam resolvidos pela troca do Codex para hooks nativos. Não adotados: sinal explícito de fase jurídica (12), porque a decisão do autor é inferir a fase da ferramenta e a interface declara a aproximação; verificação de processo vivo e estados de observabilidade além de `desatualizado` (14) e orçamento medido de CPU e memória (19), por excederem o porte de uma v1 leve; navegação por teclado além de lista, ficha e fechamento (23).
