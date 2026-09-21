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
