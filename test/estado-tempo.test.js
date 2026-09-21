import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novo, ev, adv } from './estado.test.js';

const MIN = 60_000;

test('ocioso após 2 min parado ou pensando; evento novo reativa', () => {
  const esc = novo();
  esc.aplicar(ev('prompt', { prompt: 'x' }));
  esc.avancar(2 * MIN - 1);
  assert.equal(esc.tique().length, 0);
  esc.avancar(1);
  const m = esc.tique();
  assert.equal(m.at(-1).advogado.estado, 'ocioso');
  assert.equal(adv(esc).sala, 'recepcao');
  esc.aplicar(ev('sessao.inicio'));
  assert.equal(adv(esc).estado, 'recepcao');
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
});

test('trabalhando há 10 min fica desatualizado, sem mudar de estado; some no próximo evento', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'b' } }));
  esc.avancar(10 * MIN);
  esc.tique();
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).desatualizado, true);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' } }));
  assert.equal(adv(esc).desatualizado, false);
});

test('sai após 30 min sem eventos (60 min se aguardando); atividade de estagiário segura a saída', () => {
  const esc = novo();
  esc.aplicar(ev('prompt', { prompt: 'x' }));
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1' } }));
  esc.avancar(25 * MIN);
  esc.tique();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, agente: { id: 'a1' } }));
  esc.avancar(10 * MIN);
  esc.tique();
  assert.notEqual(adv(esc).estado, 'saiu');
  esc.avancar(20 * MIN + 1);
  esc.tique();
  assert.equal(adv(esc).estado, 'saiu');

  const esc2 = novo();
  esc2.aplicar(ev('aguardando'));
  esc2.avancar(59 * MIN);
  esc2.tique();
  assert.equal(adv(esc2).estado, 'aguardando');
  esc2.avancar(MIN);
  esc2.tique();
  assert.equal(adv(esc2).estado, 'saiu');
});

test('estagiário expira sozinho após 15 min sem eventos', () => {
  const esc = novo();
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1' } }));
  esc.avancar(15 * MIN);
  const m = esc.tique();
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'estagiario'));
  assert.deepEqual(adv(esc).estagiarios, []);
});

test('saiu é removido após 3 s; lápide bloqueia ferramenta por 60 s mas prompt ressuscita', () => {
  const esc = novo();
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1' } }));
  esc.aplicar(ev('sessao.fim'));
  esc.avancar(3000);
  const m = esc.tique();
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'advogado' && x.id === 'claude:s1'));
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'estagiario'));
  assert.equal(esc.snapshot().advogados.length, 0);
  assert.equal(esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read' } })).length, 0);
  assert.equal(esc.snapshot().advogados.length, 0);
  esc.aplicar(ev('prompt', { prompt: 'de novo' }));
  assert.equal(adv(esc).estado, 'pensando');
  const esc2 = novo();
  esc2.aplicar(ev('sessao.fim'));
  esc2.avancar(3000);
  esc2.tique();
  esc2.avancar(60_000);
  esc2.tique();
  esc2.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' } }));
  assert.equal(adv(esc2).estado, 'trabalhando');
});

test('limite de sessões remove a ociosa mais antiga', () => {
  const esc = novo({ limites: { sessoes: 3 } });
  esc.aplicar(ev('prompt', { prompt: 'a', sessao: 'A' }));
  esc.avancar(1000);
  esc.aplicar(ev('prompt', { prompt: 'b', sessao: 'B' }));
  esc.avancar(1000);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, sessao: 'C' }));
  esc.avancar(3 * MIN);
  esc.tique();
  assert.equal(adv(esc, 'claude:A').estado, 'ocioso');
  const m = esc.aplicar(ev('prompt', { prompt: 'd', sessao: 'D' }));
  assert.ok(m.some((x) => x.tipo === 'remover' && x.id === 'claude:A'));
  assert.equal(esc.snapshot().advogados.length, 3);
  assert.ok(adv(esc, 'claude:C'));
});
