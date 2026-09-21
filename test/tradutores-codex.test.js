import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarTradutorCodex, lerTokensCodex } from '../src/tradutores/codex.js';
import { normalizarLote } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const comum = { session_id: '01a0', transcript_path: '/r.jsonl', cwd: '/proj', model: 'gpt-6-astra', permission_mode: 'default', turn_id: 't1' };

test('eventos do Codex viram eventos v1 com cli codex e modelo em todo evento', () => {
  const t = criarTradutorCodex({ agora, semTranscritos: true });
  const pre = t({ ...comum, hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command: 'rg foo' }, tool_use_id: 'c1' });
  assert.equal(pre[0].cli, 'codex');
  assert.equal(pre[0].modelo, 'gpt-6-astra');
  assert.deepEqual(pre[0].ferramenta, { nome: 'shell', detalhe: 'rg foo', id: 'c1' });
  const interrupt = t({ ...comum, hook_event_name: 'Interrupt' });
  assert.equal(interrupt[0].tipo, 'parado');
  assert.equal(interrupt[0].modelo, 'gpt-6-astra');
  const subagenteInicio = t({ ...comum, hook_event_name: 'SubagentStart', agent_id: 'sa1', agent_type: 'gsd-planner' });
  assert.equal(subagenteInicio[0].tipo, 'subagente.inicio');
  assert.equal(subagenteInicio[0].modelo, 'gpt-6-astra');
  assert.equal(normalizarLote(pre, agora).rejeitados.length, 0);
});

test('lerTokensCodex usa o último token_count e o modelo do turn_context', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const arq = join(dir, 'rollout.jsonl');
  const linhas = [
    { timestamp: 'x', ordinal: 1, type: 'session_meta', payload: { id: '01a0', cwd: '/proj' } },
    { timestamp: 'x', ordinal: 2, type: 'turn_context', payload: { model: 'gpt-6-astra', cwd: '/proj' } },
    { timestamp: 'x', ordinal: 3, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 10, total_tokens: 110 }, last_token_usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 10, total_tokens: 110 }, model_context_window: 400000 }, rate_limits: null } },
    { timestamp: 'x', ordinal: 4, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 20418, cached_input_tokens: 0, output_tokens: 153, total_tokens: 20571 }, last_token_usage: { input_tokens: 20418, cached_input_tokens: 0, output_tokens: 143, total_tokens: 20561 }, model_context_window: 400000 }, rate_limits: null } },
    { timestamp: 'x', ordinal: 5, type: 'event_msg', payload: { type: 'task_complete', turn_id: 't1' } },
  ];
  writeFileSync(arq, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const r = lerTokensCodex(arq, undefined, { dirsPermitidos: [dir] });
  assert.deepEqual(r.tokens, { contexto: 20418, janela: 400000, saidaTotal: 153 });
  assert.equal(r.modelo, 'gpt-6-astra');
  assert.equal(lerTokensCodex(arq, undefined, { dirsPermitidos: [join(dir, 'x')] }), null);
  writeFileSync(join(dir, 'vazio.jsonl'), '{"type":"session_meta","payload":{}}\n');
  assert.equal(lerTokensCodex(join(dir, 'vazio.jsonl'), undefined, { dirsPermitidos: [dir] }), null);
});

test('lerTokensCodex sem total_token_usage.output_tokens cai para saidaIncremento', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const arq = join(dir, 'rollout.jsonl');
  const linhas = [
    { timestamp: 'x', ordinal: 1, type: 'turn_context', payload: { model: 'gpt-6-astra', cwd: '/proj' } },
    { timestamp: 'x', ordinal: 2, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100 }, last_token_usage: { input_tokens: 100, output_tokens: 42 }, model_context_window: 400000 }, rate_limits: null } },
  ];
  writeFileSync(arq, linhas.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const r = lerTokensCodex(arq, undefined, { dirsPermitidos: [dir] });
  assert.deepEqual(r.tokens, { contexto: 100, janela: 400000, saidaIncremento: 42 });
  assert.equal('saidaTotal' in r.tokens, false);
  const t = criarTradutorCodex({ agora, dirsPermitidos: [dir] });
  const evs = t({ ...comum, transcript_path: arq, hook_event_name: 'Stop' });
  assert.equal(normalizarLote(evs, agora).rejeitados.length, 0);
});

test('Stop do Codex emite parado e tokens totais', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const arq = join(dir, 'rollout.jsonl');
  writeFileSync(arq, JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { output_tokens: 9 }, last_token_usage: { input_tokens: 5 } } } }) + '\n');
  const t = criarTradutorCodex({ agora, dirsPermitidos: [dir] });
  const evs = t({ ...comum, transcript_path: arq, hook_event_name: 'Stop' });
  assert.deepEqual(evs.map((e) => e.tipo), ['parado', 'tokens']);
  assert.deepEqual(evs[1].tokens, { contexto: 5, saidaTotal: 9 });
  assert.equal(normalizarLote(evs, agora).rejeitados.length, 0);
});
