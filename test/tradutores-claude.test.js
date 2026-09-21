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
  assert.equal(si[0].tipo, 'subagente.inicio');
  assert.deepEqual(si[0].agente, { id: 'ag1', tipo: 'Explore' });
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
