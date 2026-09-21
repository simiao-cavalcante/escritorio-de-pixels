import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novo, ev, adv } from './ajuda-estado.js';

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
  assert.equal(esc.tique().length, 0);
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
  assert.equal(adv(esc).estado, 'ocioso');
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
  assert.equal(adv(esc, 'claude:B').estado, 'ocioso');
  const m = esc.aplicar(ev('prompt', { prompt: 'd', sessao: 'D' }));
  assert.ok(m.some((x) => x.tipo === 'remover' && x.id === 'claude:A'));
  assert.equal(esc.snapshot().advogados.length, 3);
  assert.ok(adv(esc, 'claude:C'));
  assert.equal(adv(esc, 'claude:B').estado, 'ocioso');
});

test('limite de sessões: todas em saiu → nova sessão despeja uma delas mantendo o limite', () => {
  const esc = novo({ limites: { sessoes: 3 } });
  esc.aplicar(ev('sessao.inicio', { sessao: 'A' }));
  esc.aplicar(ev('sessao.fim', { sessao: 'A' }));
  esc.avancar(1000);
  esc.aplicar(ev('sessao.inicio', { sessao: 'B' }));
  esc.aplicar(ev('sessao.fim', { sessao: 'B' }));
  esc.avancar(1000);
  esc.aplicar(ev('sessao.inicio', { sessao: 'C' }));
  esc.aplicar(ev('sessao.fim', { sessao: 'C' }));
  assert.equal(esc.snapshot().advogados.length, 3);
  const m = esc.aplicar(ev('prompt', { prompt: 'd', sessao: 'D' }));
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'advogado' && x.id === 'claude:A'));
  assert.equal(esc.snapshot().advogados.length, 3);
  assert.ok(adv(esc, 'claude:D'));
});

test('limite de sessões: A e B em saiu, C trabalhando → despeja uma das mortas e C sobrevive', () => {
  const esc = novo({ limites: { sessoes: 3 } });
  esc.aplicar(ev('sessao.inicio', { sessao: 'A' }));
  esc.aplicar(ev('sessao.fim', { sessao: 'A' }));
  esc.avancar(1000);
  esc.aplicar(ev('sessao.inicio', { sessao: 'B' }));
  esc.aplicar(ev('sessao.fim', { sessao: 'B' }));
  esc.avancar(1000);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, sessao: 'C' }));
  assert.equal(adv(esc, 'claude:C').estado, 'trabalhando');
  const m = esc.aplicar(ev('prompt', { prompt: 'd', sessao: 'D' }));
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'advogado' && x.id === 'claude:A'));
  assert.equal(esc.snapshot().advogados.length, 3);
  assert.equal(adv(esc, 'claude:C').estado, 'trabalhando');
});

test('limite de sessões: sem ocioso e sem saiu → despeja a viva mais antiga por atividade agregada', () => {
  const esc = novo({ limites: { sessoes: 3 } });
  esc.aplicar(ev('prompt', { prompt: 'a', sessao: 'A' }));
  esc.avancar(1000);
  esc.aplicar(ev('prompt', { prompt: 'b', sessao: 'B' }));
  esc.avancar(1000);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, sessao: 'C' }));
  const m = esc.aplicar(ev('prompt', { prompt: 'd', sessao: 'D' }));
  assert.ok(m.some((x) => x.tipo === 'remover' && x.entidade === 'advogado' && x.id === 'claude:A'));
  assert.equal(esc.snapshot().advogados.length, 3);
  assert.ok(adv(esc, 'claude:B'));
  assert.ok(adv(esc, 'claude:C'));
});

test('limite de sessões: a sessão despejada por limite não fica bloqueada por lápide', () => {
  const esc = novo({ limites: { sessoes: 3 } });
  esc.aplicar(ev('prompt', { prompt: 'a', sessao: 'A' }));
  esc.avancar(1000);
  esc.aplicar(ev('prompt', { prompt: 'b', sessao: 'B' }));
  esc.avancar(1000);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r' }, sessao: 'C' }));
  esc.aplicar(ev('prompt', { prompt: 'd', sessao: 'D' }));
  assert.equal(adv(esc, 'claude:A'), undefined);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'r2' }, sessao: 'A' }));
  assert.equal(adv(esc, 'claude:A').estado, 'trabalhando');
});

test('parado descarta as pendentes mesmo fora de pensando/trabalhando/aguardando (spec §5)', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', detalhe: 'npm test', id: 'b1' } }));
  esc.aplicar(ev('aguardando', { motivo: 'permissao' }));
  esc.aplicar(ev('prompt', { prompt: 'continue' }));
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).atividade.nome, 'Bash'); // a pendente do Bash sobrevive ao aguardando
  esc.avancar(2 * MIN);
  esc.tique();
  assert.equal(adv(esc).estado, 'ocioso');
  esc.aplicar(ev('parado'));
  assert.equal(adv(esc).estado, 'ocioso'); // ocioso não muda de estado com parado
  assert.equal(adv(esc).atividade, null, 'parado descarta todas as pendentes da sessão');
});
