import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS } from '../src/estado.js';
import { novo, ev, adv } from './ajuda-estado.js';

test('primeiro evento cria o advogado na recepção, com projeto e cargo', () => {
  const esc = novo();
  const m = esc.aplicar(ev('sessao.inicio', { cwd: '/casa/pgm-rio', modelo: 'claude-opus-5' }));
  assert.equal(m.at(-1).tipo, 'advogado');
  const a = adv(esc);
  assert.equal(a.estado, 'recepcao');
  assert.equal(a.sala, 'recepcao');
  assert.equal(a.projeto, 'pgm-rio');
  assert.equal(a.projetoId, '/casa/pgm-rio');
  assert.equal(a.cargo, 'senior');
  assert.ok(ESTADOS.includes('saiu'));
});

test('prompt abre turno e leva a pensando; ferramenta leva à sala; fim da última volta a pensando sem mudar de sala', () => {
  const esc = novo();
  esc.aplicar(ev('prompt', { prompt: 'Minutar contestação' }));
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).caso, 'Minutar contestação');
  assert.equal(adv(esc).turnos, 1);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: 'a.md', id: 't1' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).sala, 'biblioteca');
  assert.deepEqual(adv(esc).atividade, { nome: 'Read', detalhe: 'a.md' });
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read', id: 't1', ok: true } }));
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).sala, 'biblioteca');
  assert.equal(adv(esc).atividade, null);
});

test('chamadas paralelas: a mais recente define atividade e sala; fim sem pendente é ignorado', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'a' } }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Edit', id: 'b' } }));
  assert.equal(adv(esc).sala, 'gabinete');
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Edit', id: 'b' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).sala, 'biblioteca');
  assert.equal(adv(esc).atividade.nome, 'Read');
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Bash', id: 'zzz' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read' } }));
  assert.equal(adv(esc).estado, 'pensando');
});

test('sem id, o fim encerra a pendente mais antiga com o mesmo nome; pendentes limitadas a 16', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: '1' } }));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: '2' } }));
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read' } }));
  assert.equal(adv(esc).atividade.detalhe, '2');
  for (let i = 0; i < 20; i += 1) esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: `b${i}` } }));
  assert.equal(esc.advogados.get('claude:s1').chamadasPendentes.size, 16);
  assert.equal(adv(esc).acoesRecentes.length, 8);
  assert.equal(adv(esc).acoesRecentes[0].detalhe, undefined);
});

test('parado volta à recepção e descarta pendentes; na recepção é ignorado', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Edit', id: 'x' } }));
  esc.aplicar(ev('parado'));
  assert.equal(adv(esc).estado, 'recepcao');
  assert.equal(adv(esc).sala, 'recepcao');
  assert.equal(adv(esc).atividade, null);
  const antes = esc.aplicar(ev('parado'));
  assert.equal(antes.length, 1);
  assert.equal(adv(esc).estado, 'recepcao');
});

test('aguardando vai à copa e o prompt seguinte devolve à sala anterior', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'x' } }));
  esc.aplicar(ev('aguardando', { motivo: 'permissao' }));
  assert.equal(adv(esc).estado, 'aguardando');
  assert.equal(adv(esc).sala, 'copa');
  esc.aplicar(ev('prompt', { prompt: 'continue' }));
  assert.equal(adv(esc).estado, 'pensando');
  assert.equal(adv(esc).sala, 'cartorio');
  esc.aplicar(ev('aguardando'));
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'y' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).sala, 'biblioteca');
});

test('prompt durante trabalhando só troca o caso; sessao.fim leva a saiu; modelo novo troca o cargo', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Edit', id: 'x' } }));
  esc.aplicar(ev('prompt', { prompt: 'novo pedido' }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).caso, 'novo pedido');
  esc.aplicar(ev('tokens', { tokens: { contexto: 1 }, modelo: 'claude-sonnet-5' }));
  assert.equal(adv(esc).cargo, 'associado');
  esc.aplicar(ev('sessao.fim'));
  assert.equal(adv(esc).estado, 'saiu');
});

test('identidade separa CLIs e projetos com o mesmo nome guardam o cwd completo', () => {
  const esc = novo();
  esc.aplicar(ev('sessao.inicio', { cwd: '/a/x' }));
  esc.aplicar(ev('sessao.inicio', { cli: 'codex', cwd: '/b/x' }));
  const s = esc.snapshot();
  assert.equal(s.advogados.length, 2);
  assert.deepEqual(s.advogados.map((a) => a.projetoId).sort(), ['/a/x', '/b/x']);
  assert.deepEqual(s.advogados.map((a) => a.projeto), ['x', 'x']);
});

test('fim durante aguardando fecha a pendente sem mudar de estado; a pendente antiga não vaza para o próximo ciclo', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Bash', id: 'a' } }));
  esc.aplicar(ev('aguardando', { motivo: 'permissao' }));
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Bash', id: 'a' } }));
  assert.equal(adv(esc).estado, 'aguardando');
  assert.equal(adv(esc).atividade, null);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'b' } }));
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read', id: 'b' } }));
  assert.equal(adv(esc).estado, 'pensando');
});

test('fim com id desconhecido só fecha pendente sintética homônima, nunca uma com id diferente', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', id: 'a', detalhe: 'primeiro' } }));
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read', id: 'x' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).atividade.nome, 'Read');
  assert.equal(adv(esc).atividade.detalhe, 'primeiro');

  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: 'segundo' } }));
  esc.aplicar(ev('ferramenta.fim', { ferramenta: { nome: 'Read', id: 'x' } }));
  assert.equal(adv(esc).estado, 'trabalhando');
  assert.equal(adv(esc).atividade.detalhe, 'primeiro');
});

test('acoesRecentes guarda ts em ms do relógio injetado, não a string ISO do evento', () => {
  const esc = novo();
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Read', detalhe: 'a.md' } }));
  assert.equal(adv(esc).acoesRecentes[0].ts, 1_000_000);
  assert.equal(typeof adv(esc).acoesRecentes[0].ts, 'number');
  esc.avancar(500);
  esc.aplicar(ev('ferramenta.inicio', { ferramenta: { nome: 'Edit', detalhe: 'b.md' } }));
  assert.equal(adv(esc).acoesRecentes[0].ts, 1_000_500);
});
