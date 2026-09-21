import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarDemo, criarRng, ROTEIROS } from '../src/demo.js';
import { normalizarLote } from '../src/protocolo.js';
import { Escritorio } from '../src/estado.js';
import { SALAS, SALAS_EMBUTIDAS, validarConfigSalas, criarResolvedor } from '../src/salas.js';

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
  // A demo precisa alcançar a copa (evento `aguardando`) e a revisão (subagente
  // cujo tipo case com a regra de revisão embutida em salas.js).
  assert.ok(eventos.some((e) => e.tipo === 'aguardando'));
  assert.ok(eventos.some((e) => e.tipo === 'subagente.inicio' && /review|reviewer|verifier|checker|auditor|rescue/i.test(e.agente?.tipo ?? '')));
  const esc = new Escritorio();
  for (const e of normalizarLote(eventos).eventos) esc.aplicar(e);
  assert.equal(esc.snapshot().advogados.length, ROTEIROS.length);
});

test('duas execuções com o mesmo rng e o mesmo relógio produzem a mesma sequência de eventos', () => {
  const rodar = () => {
    const lotes = [];
    const demo = iniciarDemo((lote) => lotes.push(lote), {
      setIntervalFn: () => ({}), clearIntervalFn: () => {},
      rng: criarRng(7), agora: () => 1_700_000_000_000,
    });
    for (let i = 0; i < 80; i += 1) demo.passo();
    demo.parar();
    return lotes.flat();
  };
  assert.deepEqual(rodar(), rodar());
});

test('ao longo do tempo a demo passa pelas 7 salas (advogados e estagiários)', () => {
  const { resolverSala, salaInicialEstagiario } = criarResolvedor(validarConfigSalas(SALAS_EMBUTIDAS).config);
  const esc = new Escritorio({ resolverSala, salaInicialEstagiario });
  const demo = iniciarDemo((lote) => {
    const { eventos } = normalizarLote(lote);
    for (const e of eventos) esc.aplicar(e);
  }, { setIntervalFn: () => ({}), clearIntervalFn: () => {}, rng: criarRng(3) });
  const visitadas = new Set();
  for (let i = 0; i < 200; i += 1) {
    demo.passo();
    const snap = esc.snapshot();
    for (const a of snap.advogados) visitadas.add(a.sala);
    for (const e of snap.estagiarios) visitadas.add(e.sala);
  }
  demo.parar();
  assert.deepEqual([...visitadas].sort(), [...SALAS].sort());
});
