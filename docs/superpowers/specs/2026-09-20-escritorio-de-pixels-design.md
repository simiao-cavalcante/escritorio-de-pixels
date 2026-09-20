# Escritório de Pixels — Design

Data: 2026-09-20
Estado: design aprovado em conversa; spec escrita aguardando revisão do autor.

## 1. Objetivo

Visualizador local, somente leitura, que mostra sessões de CLIs de agentes de IA como um escritório de advocacia em pixel art. Cada sessão é um advogado que caminha entre salas conforme a fase do trabalho jurídico (pesquisa, minuta, revisão, protocolo). Subagentes são estagiários que orbitam quem os recrutou. O prompt do usuário é o caso em andamento. O propósito é acompanhar, num segundo monitor, o trabalho dos agentes recrutados durante a pesquisa e a minuta de peças e pareceres.

Inspirado no Age of Agents (agentsmill, MIT), mas escrito do zero, leve e neutro quanto ao provedor de LLM: Claude Code, Codex, Grok CLI, Cursor Agent, Gemini CLI, OpenCode ou qualquer ferramenta que fale o protocolo.

### Não objetivos da v1

- Responder permissões ou interagir com o agente a partir da tela.
- Múltiplos andares ou cidades; a v1 tem um andar.
- Parsing de transcritos no núcleo do servidor. Adaptadores específicos podem ler logs da própria CLI (Codex, Grok) quando ela não oferece hooks.
- Persistência histórica, estatísticas acumuladas, mobile.
- Publicação no npm (fica como passo opcional após o GitHub).

## 2. Decisões tomadas

| Tema | Decisão |
| --- | --- |
| Base | Do zero, leve. Zero dependências em runtime. |
| Fonte de eventos | Protocolo próprio + adaptadores por CLI. |
| Salas | Por fase jurídica, regras em dados. |
| Arte | Gerada com gpt-image-2.5 (variante `flare` por padrão, configurável) e pós-processada; placeholders procedurais quando faltar PNG. |
| Provedores | Multi-LLM desde o início: cargo por modelo, crachá por CLI. |
| Idioma | pt-BR primário, en secundário. |
| Licença | MIT, incluindo os PNGs gerados. |

## 3. Arquitetura

```
CLI (Claude, Codex, Cursor, Grok, ...) 
  → adaptador (hook http, notify, wrapper stream-json, tail de log)
  → POST /hook/<cli>  ou  POST /eventos            (servidor normaliza)
  → estado em memória + máquina de estados + salas  (server.mjs + src/)
  → GET /fluxo (Server-Sent Events: snapshot + deltas)
  → public/ (Canvas 2D: escritório, HUD, ficha do caso)
```

O servidor decide sala, cargo e estado. O cliente só renderiza o que recebe. Isso mantém toda a lógica testável em Node sem navegador.

### Estrutura de pastas

```
escritorio-de-pixels/
  server.mjs                # entrada: http nativo, SSE, subcomandos (instalar, desinstalar, traduzir, --demo)
  src/
    protocolo.js            # validação e normalização do evento v1
    estado.js               # store de advogados, estagiários e casos; máquina de estados; expiração
    salas.js                # resolve ferramenta → sala a partir de salas.json
    cargos.js               # modelo → cargo; cli → cor e sigla do crachá
    tradutores/
      comum.js              # normalização compartilhada (snake_case, camelCase, detalhe, agente)
      claude.js             # hooks http do Claude Code → evento v1 (+ tokens do transcrito)
      codex.js              # hooks command do Codex → evento v1 (+ tokens do rollout)
      grok.js               # hooks http do Grok → evento v1
      cursor.js             # hooks command do Cursor e stream-json → evento v1
      gemini.js             # hooks command do Gemini CLI → evento v1
    demo.js                 # gerador de eventos sintéticos
    instalar.js             # merge idempotente e backup de configs de hooks
  public/
    index.html
    escritorio.js           # loop de render, câmera, entrada, SSE
    mundo.js                # layout: tiles, salas, portas, postos, grafo de waypoints
    sprites.js              # atlas.json + placeholders procedurais + animação procedural
    hud.js                  # barra superior, painel lateral, ficha do caso
    i18n.js                 # pt-BR e en
    arte/                   # PNGs gerados + atlas.json
  salas.json                # regras ferramenta → sala (dados)
  cargos.json               # regras modelo → cargo e cores por CLI (dados)
  arte/
    manifesto.json          # lista de assets, prompts e tamanhos alvo
    gerar.py                # chama gpt-image-2.5 e pós-processa com Pillow
    CREDITOS.md
  adaptadores/
    claude.hooks.json       # trecho inserido em ~/.claude/settings.json
    codex.hooks.json        # trecho inserido em ~/.codex/hooks.json
    grok.hooks.json         # gravado como ~/.grok/hooks/escritorio.json
    cursor.hooks.json       # trecho inserido em ~/.cursor/hooks.json
    gemini.hooks.json       # trecho inserido em ~/.gemini/settings.json
    cursor/escritorio-cursor.sh
    generico.md             # como emitir eventos com curl
  docs/
    protocolo.md
    adaptadores.md
    superpowers/specs/, plans/
  test/                     # node --test
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
| `cli` | string | sim | `claude`, `codex`, `gemini`, `opencode`, `grok`, `cursor` ou outro identificador curto |
| `sessao` | string | sim | id estável da sessão na CLI |
| `ts` | string ISO | não | ausente: servidor usa o relógio local |
| `cwd` | string | não | diretório de trabalho |
| `projeto` | string | não | nome legível; ausente: basename de `cwd` |
| `modelo` | string | não | id do modelo, quando a CLI informa |

Tipos e campos específicos:

| Tipo | Campos |
| --- | --- |
| `sessao.inicio` | `modelo?`, `origem?` |
| `sessao.fim` | — |
| `prompt` | `prompt` (texto) |
| `ferramenta.inicio` | `ferramenta: { nome, detalhe?, id? }`, `agente?: { id, tipo }` |
| `ferramenta.fim` | `ferramenta: { nome, id?, ok? }`, `agente?` |
| `subagente.inicio` | `agente: { id, tipo, descricao? }` |
| `subagente.fim` | `agente: { id }` |
| `tokens` | `tokens: { entrada?, saida?, contexto?, janela? }`. `entrada` e `saida` são incrementos que o servidor acumula; `contexto` e `janela` são valores absolutos que substituem o anterior |
| `aguardando` | `motivo?` (permissão, pergunta) |
| `parado` | — (turno terminou) |

Respostas: `202 { aceitos, rejeitados: [{ indice, erro }] }`. Corpo inválido: `400 { erro }`.

Limites e privacidade: corpo até 64 KB; `detalhe` truncado a 120 caracteres e `prompt` a 200 no momento da ingestão; o servidor nunca grava conteúdo em disco; sem telemetria; sem chamadas de rede de saída.

## 5. Estado e máquina de estados

Entidades em memória:

- **Advogado** (uma por sessão): `id`, `cli`, `modelo`, `cargo`, `projeto`, `cwd`, `estado`, `sala`, `ferramentaAtual`, `caso` (prompt truncado), `acoesRecentes` (até 8), `tokens`, `estagiarios[]`, `iniciadoEm`, `ultimaAtividade`.
- **Estagiário** (um por subagente): `id`, `sessao`, `tipo`, `descricao`, `estado`, `ferramentaAtual`, `sala`.

Estados do advogado e transições:

| Estado | Entra quando | Sai quando |
| --- | --- | --- |
| `recepcao` | `sessao.inicio`, ou primeiro evento de sessão desconhecida | `prompt` ou `ferramenta.inicio` |
| `pensando` | `prompt`, ou `ferramenta.fim` sem outra ferramenta ativa | `ferramenta.inicio`, `parado`, `aguardando` |
| `trabalhando` | `ferramenta.inicio` (sala resolvida por `salas.json`) | `ferramenta.fim`, `parado`, `aguardando`; sem `ferramenta.fim` há 10 min volta a `pensando` |
| `aguardando` | `aguardando` | qualquer evento da sessão |
| `ocioso` | sem eventos há 2 min a partir de `pensando` ou `recepcao` | qualquer evento da sessão |
| `saiu` | `sessao.fim`, ou sem eventos há 30 min | removido após 3 s (animação de saída) |

Estagiário: nasce em `subagente.inicio` na sala `reunioes`, ou em `revisao` se o `tipo` casar com a regra de revisão de `salas.json`; fica `trabalhando` enquanto tiver `ferramenta.inicio` pendente e caminha para a sala dessa ferramenta; `pensando` entre ferramentas, quando orbita o advogado; removido em `subagente.fim` ou quando o advogado sai. Eventos de ferramenta com `agente` presente atualizam o estagiário e não o advogado. Um `subagente.inicio` para agente desconhecido cria o estagiário implicitamente.

Eventos fora de ordem ou para sessão desconhecida criam a sessão implicitamente. Expirações usam um relógio injetável para permitir teste determinístico.

Fluxo para o cliente (`GET /fluxo`, SSE): ao conectar, evento `snapshot` com todos os advogados e estagiários e os rótulos das salas; depois `advogado`, `estagiario` e `remover` como deltas. Heartbeat a cada 15 s.

## 6. Salas e regras

Salas da v1 e função:

| Sala | Fase | Cai aqui |
| --- | --- | --- |
| `recepcao` | espera e pensamento | ocioso, pensando, ferramenta sem regra (balcão) |
| `biblioteca` | pesquisa | Read, Grep, Glob, LS, WebSearch, WebFetch, ToolSearch; `read_file`, `grep_search`, `list_dir`, `codebase_search`, `web_search`, `google_web_search`; `mcp__brave-search__*`, `mcp__context7__*`; skills `julgado`, `informativo-*`, `find-skills` |
| `gabinete` | minuta | Edit, Write, MultiEdit, NotebookEdit; `apply_patch`, `write_file`, `edit_file`, `replace`; skills `proprio-punho`, `material`, `ebook*`, `probook-progrupo` |
| `revisao` | revisão | Agent/Task cujo tipo case com `review|reviewer|verifier|checker|auditor|rescue`; skills `code-review`, `security-review`, `simplify`, `codex:rescue` |
| `cartorio` | protocolo e expediente | Bash, `shell`, `exec_command`, `run_terminal_cmd`, `run_shell_command` |
| `reunioes` | recrutamento e consultas | Agent, Task, Workflow, SendMessage; prefixo `mcp__` sem regra mais específica |
| `copa` | pausa | `aguardando` |

Precedência de resolução: skill (nome extraído do detalhe da ferramenta `Skill`) > detalhe (regex) > nome exato > prefixo mais longo > padrão (`recepcao`). Regex inválida é ignorada sem derrubar o servidor. `salas.json` é lido na partida e recarregado ao mudar (fs.watch), com validação e mensagem em caso de erro.

Cargos por família de modelo (`cargos.json`, regex sobre o id do modelo, primeira que casar):

| Cargo | Padrões iniciais |
| --- | --- |
| Sócio(a) | `fable`, `mythos`, `gpt-6`, `astra`, `ultra`, `grok-5` |
| Advogado(a) sênior | `opus`, `gpt-5\.[4-9]`, `gemini-3.*pro`, `grok-4` |
| Associado(a) | `sonnet`, `gpt-5`, `gemini.*flash`, `codex` |
| Júnior | `haiku`, `mini`, `nano`, `local` |
| Advogado(a) (neutro) | modelo ausente ou sem regra |

Subagentes são sempre estagiários, independentemente do modelo. Crachá por CLI: claude terracota, codex verde, gemini azul, grok grafite, cursor roxo, opencode turquesa, outros cinza. Sem logos de terceiros: o crachá usa sigla e cor.

## 7. Adaptadores

Princípio: a tradução do payload nativo para evento v1 fica no servidor, em `POST /hook/<cli>`. Do lado da CLI o adaptador é só um trecho de configuração de hook: tipo `http` quando a CLI oferece (Claude Code, Grok), senão tipo `command` com `curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:7777/hook/<cli>`. Nenhum hook instalado bloqueia o agente: o servidor responde `204` sem corpo, o timeout é de 2 s e uma queda do Escritório é ignorada pela CLI.

Instalação por `node server.mjs instalar <cli>` para `claude`, `codex`, `grok`, `cursor` e `gemini`: merge idempotente no arquivo de configuração da CLI, backup `<arquivo>.bak-<timestamp>`, e `desinstalar <cli>` remove apenas as entradas cuja URL ou comando contenha `127.0.0.1:<porta>/hook/`. A porta gravada nos hooks é a porta em uso na instalação.

Deduplicação: o servidor descarta um evento igual a outro (mesmo `cli`, `sessao`, `tipo`, ferramenta ou agente e `ts` arredondado ao segundo) recebido nos últimos 2 s. Isso tolera hooks instalados em dobro e a importação automática que o Grok faz dos hooks do Claude e do Cursor.

Mapeamento comum de eventos de hook para eventos v1, válido para Claude Code, Codex, Grok e Cursor, que usam os mesmos nomes com grafia diferente:

| Evento de hook | Evento v1 |
| --- | --- |
| SessionStart | `sessao.inicio` (com `modelo` quando o payload traz) |
| UserPromptSubmit, beforeSubmitPrompt | `prompt` |
| PreToolUse | `ferramenta.inicio`; `detalhe` extraído de `tool_input` (`file_path`, `command`, `query`, `pattern`, `subagent_type` e `description`, `skill`, `url`, `prompt`); `agente` de `agent_id` e `agent_type` |
| PostToolUse, PostToolUseFailure | `ferramenta.fim` com `ok` |
| SubagentStart, SubagentStop | `subagente.inicio`, `subagente.fim` |
| PermissionRequest, Notification (permission_prompt, idle_prompt) | `aguardando` |
| Stop, Interrupt, StopCancelled | `parado` |
| SessionEnd | `sessao.fim` |

### Claude Code (confirmado na documentação de hooks)

Hooks do tipo `http` para `/hook/claude`, instalados em `~/.claude/settings.json`. Payload em snake_case: `hook_event_name`, `session_id`, `transcript_path`, `cwd`, `permission_mode`, `tool_name`, `tool_input`, `tool_use_id`, `agent_id`, `agent_type`, `prompt`; `model` só em `SessionStart`.

Tokens: os hooks não trazem uso de tokens. No `Stop`, o tradutor lê as últimas 50 linhas do `transcript_path`, localiza a entrada de assistente mais recente com `message.usage` e emite `tokens` com `contexto` = `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` e `saida` = `output_tokens` dessa mensagem. Como cada `Stop` reporta só a última mensagem, não há dupla contagem. É melhor esforço: o formato do transcrito é interno ao Claude Code, então qualquer erro de leitura é silencioso e desligável com `--sem-transcritos`.

### Codex CLI (hooks nativos; `codex features list` mostra `hooks stable true` na 0.155.1)

Arquivo `~/.codex/hooks.json` com hooks `type: "command"` (JSON no stdin) e `curl` para `/hook/codex`. Eventos: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt`. Payload: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model` (em todo evento), `permission_mode`, `turn_id`, `tool_name`, `tool_input`, `tool_response`, `agent_id`, `agent_type`.

Confiança: o Codex exige confirmar a confiança em hooks novos na primeira execução (existe a flag `--dangerously-bypass-hook-trust`, que o instalador não usa nem recomenda). O instalador imprime o passo de confirmação.

Tokens: no `Stop`, o tradutor lê o fim do `transcript_path` (rollout JSONL) e usa o último `token_usage_record` (`input_tokens`, `cached_input_tokens`, `output_tokens`, `total_tokens`) para emitir `tokens` com `contexto` e `saida`. Mesma política de melhor esforço do Claude.

O mecanismo `notify` não é usado: ele só emite `agent-turn-complete`, sem modelo nem tokens, e aceita um único comando, que nesta máquina já está ocupado por outra ferramenta.

### Grok CLI (hooks nativos com `type: "http"`; documentação local em `~/.grok/docs/user-guide/10-hooks.md`)

Arquivo próprio `~/.grok/hooks/escritorio.json` com hooks `http` para `/hook/grok`. Eventos: `session_start`, `session_end`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `post_tool_use_failure`, `permission_denied`, `notification`, `subagent_start`, `subagent_stop`, `stop`, `stop_failure`, `stop_cancelled`. Envelope em camelCase: `hookEventName`, `sessionId`, `cwd`, `workspaceRoot`, `timestamp`, `permissionMode`, `promptId`, `toolName`, `toolInput`.

O Grok importa automaticamente os hooks de `~/.claude/settings.json` e `~/.cursor/hooks.json`, com alias de nomes de ferramenta (confirmado em `~/.grok/logs/hooks.log`). Por isso `/hook/claude` e `/hook/cursor` reconhecem o envelope do Grok pela chave `hookEventName` e rotulam `cli: grok`; a deduplicação elimina o evento em dobro quando o arquivo dedicado também está instalado.

Modelo e tokens: o payload não traz. Melhor esforço a partir de `~/.grok/sessions/<cwd codificado>/<sessão>/summary.json` (`current_model_id`) e `usage.json`, quando existirem; sem eles, o advogado aparece com cargo neutro.

### Cursor Agent (hooks nativos; `~/.cursor/hooks.json`, confirmado na skill local `create-hook`)

Merge em `~/.cursor/hooks.json`, hooks `type: "command"` com `curl` para `/hook/cursor`. Eventos: `sessionStart`, `sessionEnd`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart`, `subagentStop`, `stop`. Payload JSON no stdin em camelCase. O tradutor é construído sobre fixtures capturadas de uma execução real do `cursor-agent` nesta máquina. Alternativa documentada para execuções por script: wrapper com `--output-format stream-json` encaminhado a `node server.mjs traduzir cursor`.

### Gemini CLI (hooks nativos em `settings.json`; não instalado nesta máquina)

Trecho para `~/.gemini/settings.json` com hooks `type: "command"` e `curl` para `/hook/gemini`. Mapeamento: `SessionStart` e `SessionEnd` como acima; `BeforeAgent` vira `prompt`; `AfterAgent` vira `parado`; `BeforeTool` e `AfterTool` viram `ferramenta.inicio` e `ferramenta.fim`; `AfterModel` vira `tokens` e atualiza `modelo` a partir de `llm_response`; `Notification` vira `aguardando`. Payload base: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `timestamp`, mais `tool_name`, `tool_input`, `tool_response` nos eventos de ferramenta. O tradutor nasce da documentação com fixtures sintéticas e o README o marca como não testado localmente, convidando validação.

### OpenCode (v1.1)

`opencode serve` expõe um fluxo SSE em `127.0.0.1:4096/event` com sessões, mensagens, ferramentas, modelo e tokens. O adaptador será uma ponte `node server.mjs ponte opencode` que assina esse fluxo e traduz. Fica fora da v1 por não estar instalado aqui e exigir um processo a mais; entra como issue aberta.

### Genérico e outras CLIs

`POST /hook/generico?cli=<nome>` aceita payloads no formato snake_case do Claude Code, que GitHub Copilot CLI, Kimi CLI e Qwen Code seguem de perto em seus hooks. `docs/protocolo.md` documenta os eventos v1 com exemplos de `curl`, para qualquer script ou pipeline emitir eventos diretamente em `/eventos`. `docs/adaptadores.md` reúne os trechos de configuração por CLI e o esqueleto para novas contribuições.

## 8. Cliente: o escritório

- Canvas 2D com resolução lógica de 960x576 (30x18 tiles de 32 px), escalado ao tamanho da janela mantendo proporção, `image-rendering: pixelated`.
- `mundo.js` define o layout fixo: mapa de tiles (piso, parede, tapete), salas como retângulos com porta e postos (mesa, cadeira, estante) onde os personagens param, corredor central e grafo de waypoints. Caminho por busca em largura no grafo; movimento interpolado no cliente.
- Personagens: advogado (sprite do cargo, crachá da CLI, nome do projeto embaixo), estagiário (sprite menor que caminha para a sala da sua ferramenta e, sem ferramenta, orbita o advogado), balão com ferramenta e detalhe, indicador de estado (reticências para pensando, zzz para ocioso, ponto de interrogação para aguardando). Animação procedural: balanço ao andar, espelhamento pela direção, overlay de digitação ao trabalhar.
- Lotação: cada sala tem um número fixo de postos definido em `mundo.js`; quem chega sem posto livre fica em pé junto à porta. O mapa desenha até 24 advogados; os demais aparecem só no painel lateral, com aviso.
- HUD: barra superior com título, contagem de advogados por CLI e alternância de idioma; painel lateral colapsável com advogados agrupados por projeto; clique no personagem ou na lista abre a Ficha do caso: prompt, CLI, modelo e cargo, sala, ações recentes, tokens quando houver, estagiários ativos.
- Estado local: idioma e painel aberto em `localStorage`, com try/catch.
- Acessibilidade mínima: a lista do painel espelha o mapa em texto; cores com contraste e nunca como único sinal.

## 9. Arte com gpt-image-2.5

`arte/manifesto.json` lista cada asset: `id`, `prompt`, `tamanho` alvo em px, `ancora`. Conjunto inicial:

- Personagens (32x48): sócio(a), sênior, associado(a), júnior, estagiário(a), cada um com duas variações de aparência. Total 10.
- Móveis (múltiplos de 32): mesa com computador, estante, arquivo de aço, mesa de reunião, balcão de recepção, cadeira, planta, máquina de café, impressora e protocolo, quadro de avisos. Total 10.
- Piso e paredes (32x32): madeira, carpete, parede, porta, tapete. Total 5.

`arte/gerar.py` (Python 3, `openai`, Pillow) chama `images.generate` com `model` configurável (padrão `gpt-image-2.5-flare`, alternativa `gpt-image-2.5-sunburst`), `size=1024x1024`, `background=transparent`, `quality=medium` e um preâmbulo fixo de estilo: pixel art 16-bit, visão de cima em três quartos, cores chapadas, sem anti-aliasing, contorno escuro fino, fundo transparente, objeto único centralizado. Pós-processamento: recorte pela caixa de conteúdo, redução nearest-neighbor ao tamanho alvo, quantização a até 32 cores, alfa binário em 128, salvar PNG em `public/arte/` e registrar em `atlas.json`. Idempotente: pula assets já gerados, salvo `--forcar`. Falhas de API não interrompem o lote; o relatório final lista o que faltou.

Sem PNG, `sprites.js` desenha placeholders procedurais (silhueta com a cor do cargo, blocos com a cor da sala) e avisa uma vez no console. O app é utilizável antes de existir arte.

Licença dos PNGs: MIT, com `arte/CREDITOS.md` e nota no README informando geração com gpt-image-2.5 e a versão do manifesto.

## 10. Segurança e privacidade

- Escuta apenas em `127.0.0.1:7777`; `--porta` altera a porta; host não loopback só com `ESCRITORIO_PERMITIR_REMOTO=1`.
- `GET /fluxo` e `GET /estado` aceitam requisições sem `Origin` ou com `Origin` igual a `http://127.0.0.1:<porta>` ou `http://localhost:<porta>`; qualquer outra recebe 403. Isso impede que uma página maliciosa aberta no navegador leia seus prompts.
- `POST /eventos` e `/hook/*` aceitam sem `Origin` (hooks e curl) ou com `Origin` local; `Origin` externo recebe 403.
- Nada é gravado em disco; prompt e detalhe são truncados na ingestão; sem telemetria; a única chamada de rede externa do projeto é o script de arte, executado manualmente em desenvolvimento.

## 11. Tratamento de erros

- JSON inválido ou campos obrigatórios ausentes: 400 com mensagem; num array, os válidos são aceitos e os inválidos listados por índice.
- Ferramenta sem regra: sala `recepcao` (balcão), configurável em `salas.json`.
- Queda do servidor: hooks recebem erro de conexão e seguem; o agente não é afetado.
- Reconexão: `EventSource` reconecta sozinho e recebe um `snapshot` novo, descartando o estado anterior.
- Porta ocupada: mensagem clara com sugestão de `--porta`.
- Arte ausente ou corrompida: placeholder e aviso único.
- `salas.json` ou `cargos.json` inválidos: mantém a última versão válida e loga o erro.

## 12. Testes

- Unitários com `node --test`: protocolo (válido, inválido, limites, truncamento), estado (todas as transições, expirações com relógio injetado, subagentes, sessão implícita), salas (precedência, regex inválida, skills, prefixo mais longo), cargos, tradutores com fixtures reais capturadas nesta máquina para Claude Code, Codex (hooks e rollout), Grok e Cursor, e fixtures sintéticas da documentação para Gemini, mais deduplicação, instalador (merge idempotente sobre fixture de `settings.json`, backup, desinstalação limpa).
- Integração: sobe o servidor em porta efêmera, envia eventos, lê `/fluxo`, confere snapshot e deltas; `Origin` externo recebe 403.
- Visual: `node server.mjs --demo` popula o escritório com sessões sintéticas de várias CLIs; captura de tela pelo Chrome a cada revisão, com checklist no plano.
- CI: GitHub Actions rodando `node --test` em Node 20 e 22.

## 13. Processo de construção com vários modelos

| Papel | Modelo | Tarefas |
| --- | --- | --- |
| Arquitetura, spec, plano, revisão final | Fable 5.1 | esta spec, plano de implementação, integração, veredito |
| Design do mundo e da arte | Opus 5 | layout do escritório, grafo de waypoints, prompts do manifesto, tabela de regras de salas e cargos |
| Implementação por módulo | Sonnet 5 | servidor, estado, tradutores, cliente, testes, README, em paralelo por módulo com TDD |
| Verificações baratas | Haiku 4.5 | validação de manifesto e atlas, links do README, consistência i18n |
| Revisão independente | GPT-6 Astra, via Codex CLI (plugin instalado, `model = "gpt-6-astra"`) | revisão crítica da spec, do plano e do diff antes da publicação, como agente revisor separado |
| Revisão final de código | `/code-review` nível alto | correções antes do push |

## 14. Publicação

- Repositório git local com commits atômicos na `main`.
- `gh repo create simiaocavalcanteia-arch/escritorio-de-pixels --public` e push.
- README pt-BR com GIF da demo, instalação (`git clone` e `node server.mjs`, ou `npx` quando publicado), instalação de hooks por CLI, protocolo, adaptadores, créditos (Age of Agents como inspiração; gpt-image-2.5 na arte) e licença. `README.en.md` equivalente.
- `package.json` com `bin`, `files`, `engines >= 20`; publicação no npm como passo opcional posterior.
- Topics: `claude-code`, `codex`, `pixel-art`, `ai-agents`, `visualization`, `legal-tech`, `pt-br`.

## 15. Riscos e mitigação

- Formato de hooks ou rollouts muda: tradutores isolados, com fixtures, falha silenciosa e teste que quebra cedo.
- Arte inconsistente entre imagens: preâmbulo fixo, quantização comum, iteração de prompts por asset, placeholders como rede de segurança.
- Latência dos hooks http no Claude Code: timeout de 2 s; alternativa documentada com hook `command` assíncrono.
- Escopo crescer: v1 termina quando a demo e os adaptadores de Claude Code, Codex, Grok e Cursor funcionam de ponta a ponta nesta máquina com arte gerada; Gemini sai documentado e não testado; OpenCode e demais viram issues.
