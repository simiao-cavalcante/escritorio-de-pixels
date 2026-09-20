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
      claude.js             # payload de hook do Claude Code → evento v1
      codex.js              # notify e rollout JSONL do Codex → evento v1
      cursor.js             # stream-json do cursor-agent → evento v1
      grok.js               # active_sessions.json do Grok → presença
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
    claude.hooks.json       # trecho de hooks inserido em ~/.claude/settings.json
    codex.md                # notify + rollout
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
| Júnior | `haiku`, `mini`, `nano`, `local`, sem modelo |

Subagentes são sempre estagiários, independentemente do modelo. Crachá por CLI: claude terracota, codex verde, gemini azul, grok grafite, cursor roxo, opencode turquesa, outros cinza. Sem logos de terceiros: o crachá usa sigla e cor.

## 7. Adaptadores

A tradução de payload nativo para evento v1 fica no servidor (`POST /hook/<cli>` e subcomando `traduzir <cli>` para stdin), então o adaptador do lado da CLI é só configuração ou um wrapper de poucas linhas.

### Claude Code (confirmado na documentação de hooks)

Hooks do tipo `http` apontando para `http://127.0.0.1:7777/hook/claude`, timeout de 2 s, sem bloqueio funcional: qualquer falha do servidor é ignorada pelo Claude Code.

| Evento do hook | Evento v1 |
| --- | --- |
| `SessionStart` | `sessao.inicio` com `modelo` |
| `UserPromptSubmit` | `prompt` |
| `PreToolUse` | `ferramenta.inicio`; `detalhe` extraído de `tool_input` (`file_path`, `command`, `query`, `pattern`, `subagent_type` e `description`, `skill`, `url`, `prompt`); `agente` de `agent_id`/`agent_type` |
| `PostToolUse` / `PostToolUseFailure` | `ferramenta.fim` com `ok` |
| `SubagentStart` / `SubagentStop` | `subagente.inicio` / `subagente.fim` |
| `PermissionRequest`, `Notification` (permission_prompt, idle_prompt) | `aguardando` |
| `Stop` | `parado` |
| `SessionEnd` | `sessao.fim` |

Tokens: os hooks não trazem uso de tokens. No `Stop`, o tradutor lê as últimas 50 linhas do `transcript_path`, localiza a entrada de assistente mais recente com `message.usage` e emite `tokens` com `contexto` = `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` (tamanho atual do contexto) e `saida` = `output_tokens` dessa mensagem. Como cada `Stop` reporta só a última mensagem, não há dupla contagem. É melhor esforço: o formato do transcrito é interno ao Claude Code, então qualquer erro de leitura é silencioso e desligável com `--sem-transcritos`.

Instalação: `node server.mjs instalar claude` faz merge em `~/.claude/settings.json` preservando hooks existentes, grava backup `settings.json.bak-<timestamp>`, é idempotente (não duplica) e `desinstalar claude` remove só as entradas do Escritório.

### Codex (verificado localmente: codex-cli 0.155.1)

- `notify` em `~/.codex/config.toml` recebe `turn-ended`; o adaptador o encaminha como `parado`. Como `notify` aceita um único comando, o instalador encadeia o comando já existente em vez de substituí-lo.
- Reserva e fonte de detalhe: o servidor observa `~/.codex/sessions/<ano>/<mês>/<dia>/rollout-*.jsonl` do dia corrente. `session_meta` abre a sessão (`cwd`, `session_id`); `turn_context` traz `model`; `task_started` vira `prompt`/`pensando`; `item_completed` com item de chamada de ferramenta vira `ferramenta.inicio` + `ferramenta.fim`; `token_count` vira `tokens`; `task_complete` vira `parado`.
- Hooks nativos do Codex (flag `[features] hooks = true`) entram como melhoria posterior quando o formato do payload for fixado; o tradutor já aceita `POST /hook/codex`.

### Cursor Agent

Wrapper `adaptadores/cursor/escritorio-cursor.sh` executa `cursor-agent --print --output-format stream-json "$@"` e encaminha cada linha para `node server.mjs traduzir cursor`, que emite eventos v1. Cobre execuções por script; o modo interativo fica fora da v1.

### Grok CLI

Presença: o servidor observa `~/.grok/active_sessions.json` (`session_id`, `cwd`, `pid`, `opened_at`) e mostra o advogado na recepção enquanto a sessão existir e o processo estiver vivo. Eventos de ferramenta ficam para depois, se os logs em `~/.grok/sessions` se mostrarem estáveis.

### Gemini CLI e OpenCode

Fora da v1 (não estão instalados aqui para teste). Entram pelo protocolo genérico; `docs/adaptadores.md` traz o esqueleto e uma issue aberta no repositório convida contribuições.

### Genérico

`docs/protocolo.md` documenta os eventos com exemplos de `curl`, para qualquer script, CLI ou pipeline emitir eventos.

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

- Unitários com `node --test`: protocolo (válido, inválido, limites, truncamento), estado (todas as transições, expirações com relógio injetado, subagentes, sessão implícita), salas (precedência, regex inválida, skills, prefixo mais longo), cargos, tradutores com fixtures reais de payload do Claude Code e de linhas de rollout do Codex, instalador (merge idempotente sobre fixture de `settings.json`, backup, desinstalação limpa).
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
| Revisão independente | Codex (plugin instalado) | leitura crítica do diff antes da publicação |
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
- Escopo crescer: v1 termina quando a demo, o adaptador do Claude e o do Codex funcionam de ponta a ponta com arte gerada; o resto vira issue.
