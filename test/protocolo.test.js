import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarEvento, normalizarLote, truncar, TIPOS, LIMITES } from '../src/protocolo.js';

const agora = () => Date.parse('2026-09-20T12:00:00Z');
const base = { v: 1, cli: 'claude', sessao: 's1' };

test('truncar colapsa espaços e corta com reticência', () => {
  assert.equal(truncar('  a   b  ', 10), 'a b');
  assert.equal(truncar('x'.repeat(130), 120).length, 120);
  assert.equal(truncar('x'.repeat(130), 120).at(-1), '…');
  assert.equal(truncar(42, 10), undefined);
});

test('rejeita evento sem v, tipo, cli ou sessao válidos', () => {
  assert.equal(normalizarEvento(null).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'parado', v: 2 }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'voar' }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'parado', cli: 'Claude Code' }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'parado', sessao: '' }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'parado', ts: 'ontem' }).ok, false);
});

test('preenche ts com o relógio quando ausente e normaliza quando presente', () => {
  const r = normalizarEvento({ ...base, tipo: 'parado' }, agora);
  assert.equal(r.ok, true);
  assert.equal(r.evento.ts, '2026-09-20T12:00:00.000Z');
  const r2 = normalizarEvento({ ...base, tipo: 'parado', ts: '2026-09-20T09:00:00-03:00' }, agora);
  assert.equal(r2.evento.ts, '2026-09-20T12:00:00.000Z');
});

test('prompt exige texto e é truncado a 200', () => {
  assert.equal(normalizarEvento({ ...base, tipo: 'prompt' }).ok, false);
  const r = normalizarEvento({ ...base, tipo: 'prompt', prompt: 'p'.repeat(300) }, agora);
  assert.equal(r.evento.prompt.length, LIMITES.prompt);
});

test('ferramenta exige nome; detalhe truncado; agente opcional', () => {
  assert.equal(normalizarEvento({ ...base, tipo: 'ferramenta.inicio', ferramenta: {} }).ok, false);
  const r = normalizarEvento({
    ...base, tipo: 'ferramenta.inicio',
    ferramenta: { nome: 'Edit', detalhe: 'd'.repeat(200), id: 't1' },
    agente: { id: 'a1', tipo: 'Explore' },
  }, agora);
  assert.equal(r.ok, true);
  assert.equal(r.evento.ferramenta.detalhe.length, LIMITES.detalhe);
  assert.deepEqual(r.evento.agente, { id: 'a1', tipo: 'Explore' });
  const semAgente = normalizarEvento({ ...base, tipo: 'ferramenta.fim', ferramenta: { nome: 'Edit', ok: false }, agente: { tipo: 'x' } }, agora);
  assert.equal(semAgente.evento.agente, undefined);
  assert.equal(semAgente.evento.ferramenta.ok, false);
});

test('subagente exige agente.id; tokens exige ao menos um número', () => {
  assert.equal(normalizarEvento({ ...base, tipo: 'subagente.inicio', agente: { tipo: 'x' } }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'tokens', tokens: {} }).ok, false);
  assert.equal(normalizarEvento({ ...base, tipo: 'tokens', tokens: { contexto: -1 } }).ok, false);
  const r = normalizarEvento({ ...base, tipo: 'tokens', tokens: { contexto: 10, saidaIncremento: 3, lixo: 1 } }, agora);
  assert.deepEqual(r.evento.tokens, { contexto: 10, saidaIncremento: 3 });
});

test('campos comuns opcionais: cwd, projeto, modelo, origem, motivo', () => {
  const r = normalizarEvento({ ...base, tipo: 'sessao.inicio', cwd: '/x/y', modelo: 'claude-opus-5', origem: 'startup' }, agora);
  assert.equal(r.evento.cwd, '/x/y');
  assert.equal(r.evento.modelo, 'claude-opus-5');
  assert.equal(r.evento.origem, 'startup');
  const a = normalizarEvento({ ...base, tipo: 'aguardando', motivo: 'permissao' }, agora);
  assert.equal(a.evento.motivo, 'permissao');
});

test('normalizarLote aceita objeto ou array e separa rejeitados por índice', () => {
  const r = normalizarLote([{ ...base, tipo: 'parado' }, { ...base, tipo: 'nada' }, { ...base, tipo: 'prompt', prompt: 'oi' }], agora);
  assert.equal(r.eventos.length, 2);
  assert.deepEqual(r.rejeitados.map((x) => x.indice), [1]);
  assert.equal(normalizarLote({ ...base, tipo: 'parado' }, agora).eventos.length, 1);
  assert.equal(TIPOS.length, 10);
});

test('cwd é cortado em 256 caracteres sem colapsar espaços internos (é identidade, não texto livre)', () => {
  const longo = `/x/${'a'.repeat(400)}`;
  const r = normalizarEvento({ ...base, tipo: 'sessao.inicio', cwd: longo }, agora);
  assert.equal(r.ok, true);
  assert.equal(r.evento.cwd.length, 256);
  assert.equal(r.evento.cwd, longo.slice(0, 256)); // corte cru, sem "…" (cwd não é exibido)
  assert.equal(normalizarEvento({ ...base, tipo: 'sessao.inicio', cwd: '   ' }, agora).evento.cwd, undefined);
  // dois espaços consecutivos são parte do caminho: `truncar` colapsaria para um só e dois
  // diretórios diferentes ("/x/a  b" e "/x/a b") ficariam com o mesmo cwd.
  assert.equal(normalizarEvento({ ...base, tipo: 'sessao.inicio', cwd: '/x/a  b' }, agora).evento.cwd, '/x/a  b');
});
