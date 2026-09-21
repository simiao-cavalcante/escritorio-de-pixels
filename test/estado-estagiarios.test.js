import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novo, ev, adv } from './estado.test.js';

const est = (esc, id) => esc.snapshot().estagiarios.find((e) => e.id === id);

test('subagente.inicio cria estagiário na sala inicial e o liga ao advogado', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Agent', detalhe: 'Explore: buscar', id: 'a' } }));
  const m = esc.aplicar(ev('subagente.inicio', { agente: { id: 'ag1', tipo: 'Explore', descricao: 'buscar precedentes' } }));
  assert.ok(m.some((x) => x.tipo === 'estagiario'));
  const e = est(esc, 'claude:s1:ag1');
  assert.equal(e.estado, 'pensando');
  assert.equal(e.sala, 'reunioes');
  assert.equal(e.descricao, 'buscar precedentes');
  assert.deepEqual(adv(esc).estagiarios, ['claude:s1:ag1']);
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'ag2', tipo: 'code-reviewer' } }));
  assert.equal(est(esc, 'claude:s1:ag2').sala, 'revisao');
  assert.equal(adv(esc).estado, 'trabalhando');
});

test('ferramenta com agente move o estagiário e não o advogado; agente desconhecido é criado', () => {
  const esc = novo();
  esc.aplicar(ev('prompt', { prompt: 'x' }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r1' }, agente: { id: 'ag9', tipo: 'Explore' } }));
  const e = est(esc, 'claude:s1:ag9');
  assert.equal(e.estado, 'trabalhando');
  assert.equal(e.sala, 'biblioteca');
  assert.equal(e.atividade.nome, 'Read');
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).atividade, null);
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read', id: 'r1' }, agente: { id: 'ag9' } }));
  assert.equal(est(esc, 'claude:s1:ag9').estado, 'pensando');
  assert.equal(est(esc, 'claude:s1:ag9').sala, 'biblioteca');
});

test('subagente.fim remove; parado limpa pendentes dos estagiários', () => {
  const esc = novo();
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1', tipo: 'Explore' } }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'b1' }, agente: { id: 'a1' } }));
  esc.aplicar(ev('prompt', { prompt: 'x' }));
  const m = esc.aplicar(ev('parado'));
  assert.ok(m.some((x) => x.tipo === 'estagiario' && x.estagiario.estado === 'pensando'));
  assert.equal(est(esc, 'claude:s1:a1').atividade, null);
  const r = esc.aplicar(ev('subagente.fim', { agente: { id: 'a1' } }));
  assert.ok(r.some((x) => x.tipo === 'remover' && x.entidade === 'estagiario' && x.id === 'claude:s1:a1'));
  assert.equal(est(esc, 'claude:s1:a1'), undefined);
  assert.deepEqual(adv(esc).estagiarios, []);
  assert.equal(esc.aplicar(ev('subagente.fim', { agente: { id: 'nunca' } })).length, 1);
});

test('limite de 32 estagiários substitui o ocioso mais antigo', () => {
  const esc = novo();
  for (let i = 0; i < 32; i += 1) {
    esc.aplicar(ev('subagente.inicio', { agente: { id: `a${i}` } }));
    esc.avancar(10);
  }
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, agente: { id: 'a0' } }));
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'novo' } }));
  assert.equal(adv(esc).estagiarios.length, 32);
  assert.equal(est(esc, 'claude:s1:a0').estado, 'trabalhando');
  assert.equal(est(esc, 'claude:s1:a1'), undefined);
});

test('sessao.fim descarta as pendentes dos estagiários e do advogado', () => {
  const esc = novo();
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1', tipo: 'Explore' } }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'b1' }, agente: { id: 'a1' } }));
  assert.equal(est(esc, 'claude:s1:a1').estado, 'trabalhando');
  const m = esc.aplicar(ev('sessao.fim'));
  assert.ok(m.some((x) => x.tipo === 'estagiario' && x.estagiario.estado === 'pensando'));
  const e = est(esc, 'claude:s1:a1');
  assert.equal(e.estado, 'pensando');
  assert.equal(e.atividade, null);
  assert.equal(adv(esc).estado, 'saiu');
});

test('limite de 8 pendentes por estagiário; atividade é a mais recente', () => {
  const esc = novo();
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1', tipo: 'Explore' } }));
  for (let i = 0; i < 10; i += 1) {
    esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: `${i}`, id: `r${i}` }, agente: { id: 'a1' } }));
  }
  assert.equal(esc.estagiarios.get('claude:s1:a1').chamadasPendentes.size, 8);
  assert.equal(est(esc, 'claude:s1:a1').atividade.detalhe, '9');
});

test('ferramenta com agente desconhecido cria estagiário implicitamente; subagente.inicio depois não duplica e completa metadados', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'b1' }, agente: { id: 'a1' } }));
  assert.equal(esc.estagiarios.size, 1);
  let e = est(esc, 'claude:s1:a1');
  assert.equal(e.tipo, null);
  assert.equal(e.sessao, 'claude:s1');
  esc.aplicar(ev('subagente.inicio', { agente: { id: 'a1', tipo: 'Explore', descricao: 'buscar' } }));
  assert.equal(esc.estagiarios.size, 1);
  e = est(esc, 'claude:s1:a1');
  assert.equal(e.tipo, 'Explore');
  assert.equal(e.descricao, 'buscar');
  assert.equal(e.sessao, 'claude:s1');
  assert.deepEqual(adv(esc).estagiarios, ['claude:s1:a1']);
});

test('tokens: total substitui e zera estimativa; incremento soma e marca estimado', () => {
  const esc = novo();
  esc.aplicar(ev('tokens', { tokens: { contexto: 1000, janela: 200000, saidaIncremento: 50 } }));
  assert.deepEqual(adv(esc).tokens, { contexto: 1000, janela: 200000, saida: 50, saidaEstimada: true });
  esc.aplicar(ev('tokens', { tokens: { saidaIncremento: 25 } }));
  assert.equal(adv(esc).tokens.saida, 75);
  esc.aplicar(ev('tokens', { tokens: { saidaTotal: 900, contexto: 1200 } }));
  assert.deepEqual(adv(esc).tokens, { contexto: 1200, janela: 200000, saida: 900, saidaEstimada: false });
  assert.equal(adv(esc).estado, 'recepcao');
});
