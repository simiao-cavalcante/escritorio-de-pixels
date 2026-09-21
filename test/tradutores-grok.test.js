import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTradutorGrok } from '../src/tradutores/grok.js';
import { normalizarLote } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const comum = { sessionId: 'abc-123', cwd: '/Users/you/project', workspaceRoot: '/Users/you/project', permissionMode: 'default', timestamp: '2026-04-14T12:00:00Z' };

test('exemplo da documentação vira ferramenta.inicio com cli grok', () => {
  const t = criarTradutorGrok({ agora });
  const evs = t({ ...comum, hookEventName: 'pre_tool_use', hook_event_name: 'PreToolUse', toolName: 'run_terminal_command', toolInput: { command: 'npm test' }, toolUseId: 'tu1', promptId: 'p1' });
  assert.equal(evs[0].cli, 'grok');
  assert.equal(evs[0].ts, '2026-04-14T12:00:00.000Z');
  assert.deepEqual(evs[0].ferramenta, { nome: 'run_terminal_command', detalhe: 'npm test', id: 'tu1' });
  assert.equal(normalizarLote(evs, agora).rejeitados.length, 0);
});

test('mapa completo de eventos, com subagentes e notificações', () => {
  const t = criarTradutorGrok({ agora });
  const tipo = (h, extra = {}) => t({ ...comum, hookEventName: h, ...extra })?.[0]?.tipo;
  assert.equal(tipo('session_start', { source: 'startup' }), 'sessao.inicio');
  assert.equal(tipo('session_end'), 'sessao.fim');
  assert.equal(tipo('user_prompt_submit', { prompt: 'oi' }), 'prompt');
  assert.equal(tipo('post_tool_use', { toolName: 'read_file', toolUseId: 'x' }), 'ferramenta.fim');
  assert.equal(t({ ...comum, hookEventName: 'post_tool_use_failure', toolName: 'read_file' })[0].ferramenta.ok, false);
  assert.equal(tipo('stop'), 'parado');
  assert.equal(tipo('stop_cancelled', { reason: 'user_interrupt' }), 'parado');
  assert.equal(tipo('notification', { notificationType: 'permission_prompt' }), 'aguardando');
  assert.deepEqual(t({ ...comum, hookEventName: 'notification', notificationType: 'task_complete' }), []);
  const sub = t({ ...comum, hookEventName: 'subagent_start', subagentType: 'explore', agentId: 'sa-1' });
  assert.deepEqual(sub[0].agente, { id: 'sa-1', tipo: 'explore' });
  const subSemId = t({ ...comum, hookEventName: 'subagent_stop', subagentType: 'explore' });
  assert.deepEqual(subSemId[0].agente, { id: 'explore' });
  assert.deepEqual(t({ ...comum, hookEventName: 'session_end', subagentType: 'explore' }), []);
  assert.deepEqual(t({ ...comum, hookEventName: 'stop', subagentType: 'explore' }), []);
  const dentro = t({ ...comum, hookEventName: 'pre_tool_use', toolName: 'grep', toolInput: { pattern: 'x' }, subagentType: 'explore', agentId: 'sa-1' });
  assert.deepEqual(dentro[0].agente, { id: 'sa-1', tipo: 'explore' });
  assert.equal(t({ ...comum, hookEventName: 'pre_compact' }), null);
  assert.equal(t({ hookEventName: 'stop' }), null);
});

test('permission_denied fecha a chamada pendente com falha, e sem nome de ferramenta não emite nada', () => {
  const t = criarTradutorGrok({ agora });
  const evs = t({ ...comum, hookEventName: 'permission_denied', toolName: 'run_terminal_command', toolUseId: 'tu1' });
  assert.equal(evs[0].tipo, 'ferramenta.fim');
  assert.deepEqual(evs[0].ferramenta, { nome: 'run_terminal_command', id: 'tu1', ok: false });
  assert.equal(normalizarLote(evs, agora).rejeitados.length, 0);
  assert.deepEqual(t({ ...comum, hookEventName: 'permission_denied' }), []);
});
