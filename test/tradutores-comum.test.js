import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectarEnvelope, campo, resumirEntrada, base, evento, criarDeduplicador, dentroDe, lerCauda, linhasJson } from '../src/tradutores/comum.js';

test('detectarEnvelope distingue grok, snake e camel', () => {
  assert.equal(detectarEnvelope({ hookEventName: 'pre_tool_use', hook_event_name: 'PreToolUse' }), 'grok');
  assert.equal(detectarEnvelope({ hook_event_name: 'PreToolUse' }), 'snake');
  assert.equal(detectarEnvelope({ event: 'preToolUse' }), 'camel');
  assert.equal(detectarEnvelope('x'), 'invalido');
});

test('só é envelope do Grok quando hookEventName é snake_case (camelCase é do Cursor)', () => {
  assert.equal(detectarEnvelope({ hookEventName: 'pre_tool_use' }), 'grok');
  // 'stop' é uma palavra única minúscula: EVENTO_SNAKE casa, mas isso também é camelCase
  // válido de uma única palavra — exatamente o que o Cursor manda. Sem outro sinal (um "_"
  // no valor, ou a assinatura dupla hook_event_name do Grok), não dá para saber de quem é.
  assert.equal(detectarEnvelope({ hookEventName: 'stop' }), 'camel');
  assert.equal(detectarEnvelope({ hookEventName: 'stop', hook_event_name: 'Stop' }), 'grok');
  assert.equal(detectarEnvelope({ hookEventName: 'preToolUse' }), 'camel');
  assert.equal(detectarEnvelope({ hookEventName: 'sessionStart' }), 'camel');
  // camelCase com hook_event_name junto continua sendo o envelope snake
  assert.equal(detectarEnvelope({ hookEventName: 'preToolUse', hook_event_name: 'PreToolUse' }), 'snake');
});

test('campo devolve o primeiro valor presente e ignora vazio', () => {
  assert.equal(campo({ a: '', b: null, c: 'x' }, 'a', 'b', 'c'), 'x');
  assert.equal(campo({ a: 0 }, 'a'), 0);
  assert.equal(campo(null, 'a'), undefined);
});

test('resumirEntrada prioriza campos úteis e monta Skill e Agent', () => {
  assert.equal(resumirEntrada('Edit', { file_path: '/x/a.md', old_string: '...' }), '/x/a.md');
  assert.equal(resumirEntrada('Bash', { command: 'npm test', description: 'roda testes' }), 'npm test');
  assert.equal(resumirEntrada('Skill', { skill: 'proprio-punho', args: 'contestação' }), 'proprio-punho contestação');
  assert.equal(resumirEntrada('Agent', { subagent_type: 'Explore', description: 'achar x', prompt: 'longo' }), 'Explore: achar x');
  assert.equal(resumirEntrada('Task', { description: 'só descrição' }), 'só descrição');
  assert.equal(resumirEntrada('Outra', { foo: 1 }), '{"foo":1}');
  assert.equal(resumirEntrada('Outra', 'texto'), 'texto');
  assert.equal(resumirEntrada('Outra', undefined), undefined);
});

test('base aceita várias grafias de sessão, cwd e timestamp', () => {
  const agora = () => Date.parse('2026-09-20T12:00:00Z');
  assert.deepEqual(base({ session_id: 's', cwd: '/p', model: 'm' }, 'claude', agora), { v: 1, cli: 'claude', sessao: 's', ts: '2026-09-20T12:00:00.000Z', cwd: '/p', modelo: 'm' });
  assert.equal(base({ sessionId: 7, workspaceRoot: '/w', timestamp: '2026-01-01T00:00:00Z' }, 'grok', agora).cwd, '/w');
  assert.equal(base({ conversation_id: 'c', workspace_roots: ['/r1', '/r2'] }, 'cursor', agora).cwd, '/r1');
  assert.equal(base({ session_id: 's', timestamp: 'lixo' }, 'x', agora).ts, '2026-09-20T12:00:00.000Z');
  assert.equal(base({}, 'x', agora).sessao, undefined);
});

test('evento remove campos undefined do nível superior', () => {
  const e = evento({ v: 1, cli: 'c', sessao: 's', ts: 't' }, 'parado', { motivo: undefined, prompt: 'x' });
  assert.deepEqual(e, { v: 1, cli: 'c', sessao: 's', ts: 't', tipo: 'parado', prompt: 'x' });
});

test('deduplicador descarta repetição em 2 s e aceita depois', () => {
  let t = 0;
  const novo = criarDeduplicador({ agora: () => t, janelaMs: 2000 });
  const e = { cli: 'grok', sessao: 's', tipo: 'ferramenta.inicio', ts: '2026-09-20T12:00:00.000Z', ferramenta: { nome: 'Read', id: 'a' } };
  assert.equal(novo(e), true);
  t = 500;
  assert.equal(novo({ ...e }), false);
  assert.equal(novo({ ...e, ferramenta: { nome: 'Read', id: 'b' } }), true);
  t = 3000;
  assert.equal(novo(e), true);
});

test('dentroDe, lerCauda e linhasJson', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  mkdirSync(join(dir, 'ok'));
  const arq = join(dir, 'ok', 'a.jsonl');
  writeFileSync(arq, '{"n":1}\n{"n":2}\nlixo\n{"n":3}\n');
  assert.equal(dentroDe(arq, [join(dir, 'ok')]), true);
  assert.equal(dentroDe(arq, [join(dir, 'outro')]), false);
  assert.equal(dentroDe(join(dir, 'nao-existe'), [dir]), false);
  assert.deepEqual(linhasJson(lerCauda(arq, 1_000_000)).map((o) => o.n), [1, 2, 3]);
  const cauda = lerCauda(arq, 14);
  assert.deepEqual(linhasJson(cauda).map((o) => o.n), [3]);
  assert.equal(lerCauda(join(dir, 'x'), 10), null);
});

test('deduplicador não colide quando cli/sessao contêm "|"', () => {
  let t = 0;
  const novo = criarDeduplicador({ agora: () => t, janelaMs: 2000 });
  const comum = { tipo: 'ferramenta.inicio', ts: '2026-09-20T12:00:00.000Z' };
  const e1 = { ...comum, cli: 'a', sessao: 'b|c' };
  const e2 = { ...comum, cli: 'a|b', sessao: 'c' };
  assert.equal(novo(e1), true);
  assert.equal(novo(e2), true);
});

test('linhasJson tolera null e string vazia', () => {
  assert.deepEqual(linhasJson(null), []);
  assert.deepEqual(linhasJson(''), []);
});

test('lerCauda descarta linha parcial sem "\\n" na janela cortada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const arq = join(dir, 'longa.jsonl');
  const linhaLonga = `{"n":1,"x":"${'a'.repeat(50)}"}`; // uma única linha, sem \n final
  writeFileSync(arq, linhaLonga);
  const cauda = lerCauda(arq, 10); // corta no meio da linha; a janela lida não tem \n
  assert.equal(cauda, '');
  assert.deepEqual(linhasJson(cauda), []);
});
