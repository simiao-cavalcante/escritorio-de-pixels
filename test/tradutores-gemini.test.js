import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarTradutorGemini } from '../src/tradutores/gemini.js';
import { normalizarLote } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const comum = { session_id: 'g-1', transcript_path: '/t', cwd: '/proj', timestamp: '2026-09-20T11:00:00Z' };

test('eventos do Gemini CLI viram eventos v1', () => {
  const t = criarTradutorGemini({ agora });
  const tipo = (h, extra = {}) => t({ ...comum, hook_event_name: h, ...extra })?.[0]?.tipo;
  assert.equal(tipo('SessionStart'), 'sessao.inicio');
  assert.equal(tipo('SessionEnd'), 'sessao.fim');
  assert.equal(t({ ...comum, hook_event_name: 'BeforeAgent', prompt: 'Pesquisar' })[0].prompt, 'Pesquisar');
  assert.equal(tipo('AfterAgent'), 'parado');
  const pre = t({ ...comum, hook_event_name: 'BeforeTool', tool_name: 'read_file', tool_input: { path: '/a' }, tool_call_id: 'c1' });
  assert.deepEqual(pre[0].ferramenta, { nome: 'read_file', detalhe: '/a', id: 'c1' });
  assert.equal(t({ ...comum, hook_event_name: 'AfterTool', tool_name: 'read_file', tool_call_id: 'c1', tool_response: {} })[0].ferramenta.ok, true);
  assert.equal(t({ ...comum, hook_event_name: 'AfterTool', tool_name: 'read_file', error: 'x' })[0].ferramenta.ok, false);
  const modelo = t({ ...comum, hook_event_name: 'AfterModel', llm_request: { model: 'gemini-3-pro' }, llm_response: { usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80 } } });
  assert.equal(modelo[0].tipo, 'tokens');
  assert.deepEqual(modelo[0].tokens, { contexto: 1200, saidaIncremento: 80 });
  assert.equal(modelo[0].modelo, 'gemini-3-pro');
  const soModelo = t({ ...comum, hook_event_name: 'AfterModel', llm_response: { model: 'gemini-3-flash' } });
  assert.deepEqual([soModelo[0].tipo, soModelo[0].modelo], ['sessao.inicio', 'gemini-3-flash']);
  assert.deepEqual(t({ ...comum, hook_event_name: 'AfterModel', llm_response: {} }), []);
  assert.equal(tipo('Notification'), 'aguardando');
  assert.equal(t({ ...comum, hook_event_name: 'PreCompress' }), null);
  assert.equal(normalizarLote([...pre, ...modelo, ...soModelo], agora).rejeitados.length, 0);
});
