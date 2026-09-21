# Adaptador genérico: qualquer CLI sem hook dedicado

Sua ferramenta não está na lista de CLIs com adaptador próprio? Duas portas continuam
abertas, sem esperar por um tradutor novo.

## 1. Falar o protocolo v1 direto

Se a ferramenta (ou um script em volta dela) monta o JSON do
[protocolo v1](../docs/protocolo.md), poste direto em `/eventos`:

```bash
curl -s -X POST http://127.0.0.1:7777/eventos \
  -H 'content-type: application/json' \
  -d '{"v":1,"tipo":"prompt","cli":"minhacli","sessao":"abc123","prompt":"Minutar contestação"}'
```

## 2. Já emitir hooks no formato do Claude Code

Se a CLI segue de perto o payload snake_case do Claude Code (`hook_event_name`,
`session_id`, `tool_name`, `tool_input`, ...), aponte o hook para
`/hook/generico?cli=<nome>` e o servidor traduz:

```bash
curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- \
  'http://127.0.0.1:7777/hook/generico?cli=minhacli' >/dev/null 2>&1 || true
```

O `<nome>` vira o identificador do adaptador em `GET /saude` e a cor do crachá (cinza, até
existir uma regra em `cargos.json`).

Payload não mapeado não vira erro: conta como `ignorados` em `GET /saude` — é o primeiro
lugar para olhar quando um hook parece mudo.

Quer um adaptador de verdade, com tradução das particularidades da sua CLI? O roteiro está
no fim de [docs/adaptadores.md](../docs/adaptadores.md).
