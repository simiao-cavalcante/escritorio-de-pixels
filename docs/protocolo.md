# Protocolo de eventos v1

O Escritório de Pixels só escuta em `127.0.0.1`. Qualquer ferramenta capaz de fazer um
`POST` local pode alimentá-lo.

| Rota | Para quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /eventos` | qualquer script, pipeline ou CLI que fale este protocolo | um evento v1 ou um array de eventos | `202 { aceitos, rejeitados }` |
| `POST /hook/<cli>` | hooks nativos de `claude`, `codex`, `grok`, `cursor`, `gemini` | payload nativo da CLI (o servidor traduz) | `204`, sem corpo |
| `POST /hook/generico?cli=<nome>` | CLIs que seguem o formato snake_case do Claude Code | payload nativo | `204`, sem corpo |

O Grok **importa automaticamente** os hooks de `claude` e `cursor`, então `/hook/claude` e
`/hook/cursor` também reconhecem o envelope do Grok: `hookEventName` em snake_case com `_`
(por exemplo `pre_tool_use`) ou a presença simultânea de `hook_event_name` (assinatura
dupla). Sem essa distinção, um evento de uma palavra só como `stop` do Cursor seria
mal-interpretado como Grok. Quando detectado, o evento é roteado ao tradutor do Grok e
contado como `cli: grok` em `GET /saude`; a deduplicação de 2 s (ver abaixo) elimina a
cópia recebida em dobro quando o arquivo dedicado do Grok também está instalado.

## Leitura em tempo real

- `GET /fluxo` é Server-Sent Events. A primeira mensagem é `event: snapshot` com
  `{ seq, advogados, estagiarios, salas, saude }` — o estado inteiro. Depois vêm deltas
  numerados (cada mensagem carrega o `seq` crescente da mudança):
  - `advogado` — `{ seq, advogado }`, advogado novo ou atualizado (mesmo formato do snapshot);
  - `estagiario` — `{ seq, estagiario }`;
  - `remover` — `{ seq, tipo, id }`, com `tipo` igual a `"advogado"` ou `"estagiario"`;
  - `saude` — `{ seq, saude }`, no máximo um por segundo: o servidor agrupa as mudanças de
    `GET /saude` no tique de 1 s e só emite quando algum contador de fato mudou.
  - A cada 15 s sem tráfego, um comentário SSE (`: ping`) mantém a conexão viva.
  - No máximo 8 clientes simultâneos; o nono recebe `503`.
- `GET /estado` devolve o mesmo objeto do snapshot inicial, **incluindo o `seq` atual** —
  útil para depuração e para conferir se um cliente ficou para trás.
- `GET /saude` devolve só os contadores por adaptador (o mesmo objeto que viaja dentro do
  snapshot e do delta `saude`).

## Campos comuns

| Campo | Tipo | Obrigatório | Observação |
| --- | --- | --- | --- |
| `v` | número | sim | sempre `1` |
| `tipo` | string | sim | um dos dez tipos abaixo |
| `cli` | string | sim | `[a-z0-9_-]{1,32}`; `claude`, `codex`, `gemini`, `opencode`, `grok`, `cursor` ou outro identificador curto |
| `sessao` | string | sim | id da sessão na CLI; a identidade interna é `cli:sessao` |
| `ts` | string ISO | não | informativo (ficha e ações recentes); o estado usa o relógio do servidor na chegada |
| `cwd` | string | não | diretório de trabalho; é a identidade do projeto |
| `projeto` | string | não | rótulo legível; ausente, usa-se o basename de `cwd` |
| `modelo` | string | não | id do modelo; muda o cargo (e o sprite) se mudar no meio da sessão |

`cwd` é cortado em 256 caracteres **sem colapsar espaços internos** — ao contrário de
`prompt`/`detalhe`/`descricao`, que normalizam espaços em sequência. Ele é a identidade do
projeto, não texto para exibição: dois diretórios que só diferem por espaços consecutivos
não podem colidir no mesmo `cwd`.

## Os dez tipos

| Tipo | Campos próprios | Efeito no escritório |
| --- | --- | --- |
| `sessao.inicio` | `modelo?`, `origem?` | cria ou atualiza o advogado; quem estava ocioso volta à recepção |
| `sessao.fim` | — | o advogado sai (some do mapa em 3 s) |
| `prompt` | `prompt` (texto) | abre um turno novo e vira o "caso atual" |
| `ferramenta.inicio` | `ferramenta: { nome, detalhe?, id? }`, `agente?: { id, tipo }` | advogado fica `trabalhando` e caminha para a sala da ferramenta |
| `ferramenta.fim` | `ferramenta: { nome, id?, ok? }`, `agente?` | fecha a chamada pendente; sem pendentes, volta a `pensando` |
| `subagente.inicio` | `agente: { id, tipo, descricao? }` | cria um estagiário (sala `reunioes`, ou `revisao` se o tipo casar com a regra) |
| `subagente.fim` | `agente: { id }` | o estagiário sai |
| `tokens` | `tokens: { contexto?, janela?, saidaTotal?, saidaIncremento? }` | só metadados na ficha do caso |
| `aguardando` | `motivo?` (`permissao`, `pergunta`, `outro`) | o advogado vai para a copa com "?" na cabeça |
| `parado` | — | o turno terminou; o advogado volta à recepção |

Semântica de `tokens`: `contexto` e `janela` são absolutos e substituem o valor anterior;
`saidaTotal` é um acumulado da sessão e substitui; `saidaIncremento` soma ao acumulado e
marca a saída como estimada (a ficha mostra "≈"). Cada CLI manda o que tem: o Codex, por
exemplo, manda `saidaTotal` quando o rollout já traz o acumulado da sessão e cai para
`saidaIncremento` só quando o registro mais recente só tem o delta do turno.

Identidade do estagiário: o `agente.id` de `subagente.*`/`ferramenta.*` é relativo à
sessão; internamente o estagiário ganha o id `<cli:sessao>:<agente.id>`. O campo `sessao`
que ele carrega em `GET /estado` é o **id do advogado dono** (`cli:sessao`), não um
identificador de sessão próprio do subagente — é assim que o cliente sabe a quem o
estagiário pertence.

Quem envia `ferramenta.inicio` deve enviar o `ferramenta.fim` correspondente com o mesmo
`ferramenta.id`. Sem `id` nos dois lados, o servidor casa pelo nome e fecha a pendente mais
antiga com aquele nome (chave sintética `nome#n`). Um `ferramenta.fim` com `id`
desconhecido só fecha uma pendente sintética homônima — nunca uma pendente aberta com outro
`id` real; se nada casar, o evento é ignorado. O fechamento em si acontece **em qualquer
estado** do advogado; só a transição de sala depende dele: se o advogado estava
`trabalhando`, ele volta para `pensando` (sem outras pendentes) ou segue na sala da próxima
pendente; em qualquer outro estado — por exemplo `aguardando`, logo depois de uma permissão
concedida — a pendente fecha, mas o advogado só muda de sala no próximo evento. `parado` ou
`sessao.fim` descartam todas as pendentes da sessão e dos seus estagiários, também em
qualquer estado.

## Limites

| O quê | Limite | Ao exceder |
| --- | --- | --- |
| Corpo de `/eventos` | 64 KB | `413` e `rejeitadosPorTamanho` em `/saude` |
| Corpo de `/hook/*` | 4 MB | `413` e `rejeitadosPorTamanho` em `/saude` |
| `prompt` | 200 caracteres | truncado com `…` |
| `ferramenta.detalhe` | 120 caracteres | truncado com `…` |
| `agente.descricao` | 120 caracteres | truncado com `…` |
| `ferramenta.nome` | 80 caracteres | truncado |
| `sessao` | 200 caracteres | evento rejeitado |
| Sessões simultâneas | 64 | despeja a sessão mais antiga, na ordem `saiu` → `ocioso` → viva qualquer (ver nota) |
| Estagiários por sessão | 32 | substitui o mais antigo entre os que não estão trabalhando (senão, o mais antigo mesmo trabalhando) |
| Clientes de `/fluxo` | 8 | `503` |

O despejo por limite de sessões escolhe a vítima nessa ordem de prioridade — sessões já
saídas primeiro, depois as ociosas, depois qualquer sessão viva —, sempre a mais antiga por
última atividade. Ao contrário da saída natural (`sessao.fim`, ou os tempos de inatividade
do próprio servidor), esse despejo **não deixa lápide**: uma sessão viva despejada por
pressão de memória pode ser recriada por um evento atrasado da mesma CLI sem ficar
bloqueada por 60 s.

## Respostas e erros

- `202 { "aceitos": n, "rejeitados": [{ "indice": i, "erro": "..." }] }` em `/eventos`:
  num array, os eventos válidos são aplicados e os inválidos voltam listados por índice.
- `400 { "erro": "JSON inválido" }` quando o corpo não é JSON.
- `413` quando o corpo passa do limite; o evento não é processado.
- `421` quando o `Host` não é `127.0.0.1:<porta>`, `localhost:<porta>` ou `[::1]:<porta>`.
- `403` quando há `Origin` e ele não é local.
- `503` em `/eventos` e `/hook/*` quando o servidor está em `--demo`.
- `/hook/*` responde `204` sempre que o corpo cabe no limite, inclusive para payloads que
  não sabe traduzir (contados como `ignorados` em `/saude`). Um hook nunca deve atrapalhar
  o agente.

## Exemplos com curl

Um evento:

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '{"v":1,"tipo":"sessao.inicio","cli":"meucli","sessao":"abc123","modelo":"gpt-5.4","cwd":"/caminho/do/projeto"}'
```

```json
{"aceitos":1,"rejeitados":[]}
```

Um lote (prompt e início de ferramenta):

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '[
    {"v":1,"tipo":"prompt","cli":"meucli","sessao":"abc123","prompt":"Minutar contestação"},
    {"v":1,"tipo":"ferramenta.inicio","cli":"meucli","sessao":"abc123","ferramenta":{"nome":"Read","detalhe":"peticao-inicial.md","id":"t-1"}}
  ]'
```

```json
{"aceitos":2,"rejeitados":[]}
```

Lote com um evento inválido:

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '[{"v":1,"tipo":"parado","cli":"meucli","sessao":"abc123"},{"v":1,"tipo":"xpto"}]'
```

```json
{"aceitos":1,"rejeitados":[{"indice":1,"erro":"tipo desconhecido: xpto"}]}
```

Payload nativo no formato do Claude Code, de uma CLI qualquer:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST 'http://127.0.0.1:7777/hook/generico?cli=copilot' \
  -H 'content-type: application/json' \
  -d '{"hook_event_name":"PreToolUse","session_id":"s-1","cwd":"/caminho/do/projeto","tool_name":"Read","tool_input":{"file_path":"/caminho/do/projeto/peticao.md"},"tool_use_id":"t-1"}'
```

```
204
```

Conferir o que chegou:

```bash
curl -s http://127.0.0.1:7777/saude
curl -s http://127.0.0.1:7777/estado
```

Acompanhar o fluxo:

```bash
curl -N http://127.0.0.1:7777/fluxo
```

## Deduplicação

O servidor calcula uma chave com `cli`, `sessao`, `tipo`, `ferramenta.id` (ou
`ferramenta.nome`), `agente.id` e `ts` arredondado ao segundo, e descarta repetições
recebidas nos últimos 2 s. Isso cobre hooks instalados em dobro e a importação automática
que o Grok faz dos hooks do Claude e do Cursor.

## Privacidade

- Nada do conteúdo observado vai para disco: `prompt`, `detalhe` e `descricao` são
  truncados na ingestão e só esses resumos ficam em memória.
- Rode com `--ocultar-prompts` para trocar o texto do caso por
  "Caso em andamento (n caracteres)" em tela compartilhada ou gravação.
- Não há telemetria. A única chamada de rede externa do projeto é o gerador de arte,
  rodado à mão em desenvolvimento.

## Versão

Este é o protocolo v1 (`"v": 1`). Campos desconhecidos são ignorados, o que permite
acrescentar campos opcionais sem quebrar clientes antigos. Tipo novo ou mudança de
semântica exigem `v: 2`.
