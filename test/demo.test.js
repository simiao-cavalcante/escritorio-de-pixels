import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarDemo, criarRng, ROTEIROS } from '../src/demo.js';
import { normalizarLote } from '../src/protocolo.js';
import { Escritorio } from '../src/estado.js';

test('rng é determinístico', () => {
  const a = criarRng(7);
  const b = criarRng(7);
  assert.equal(a(), b());
  assert.ok(a() >= 0 && a() < 1);
});

test('a demo cobre as cinco CLIs, gera eventos válidos e chega a parado', () => {
  const lotes = [];
  const demo = iniciarDemo((lote) => lotes.push(lote), { setIntervalFn: () => ({}), clearIntervalFn: () => {}, rng: criarRng(1) });
  for (let i = 0; i < 80; i += 1) demo.passo();
  demo.parar();
  const eventos = lotes.flat();
  assert.equal(normalizarLote(eventos).rejeitados.length, 0);
  assert.deepEqual([...new Set(eventos.map((e) => e.cli))].sort(), ['claude', 'codex', 'cursor', 'gemini', 'grok']);
  assert.ok(eventos.some((e) => e.tipo === 'subagente.inicio'));
  assert.ok(eventos.some((e) => e.tipo === 'tokens'));
  assert.ok(eventos.filter((e) => e.tipo === 'parado').length >= 5);
  assert.ok(eventos.every((e) => !e.prompt || /fict/i.test(e.prompt)));
  const esc = new Escritorio();
  for (const e of normalizarLote(eventos).eventos) esc.aplicar(e);
  assert.equal(esc.snapshot().advogados.length, ROTEIROS.length);
});
