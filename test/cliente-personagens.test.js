import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarElenco, ordenarPorAtividade, LIMITE_ADVOGADOS, LIMITE_ESTAGIARIOS, DEBOUNCE_SALA_MS, RAIO_ORBITA } from '../public/personagens.js';
import { SALAS, salaEm } from '../public/mundo.js';

const advogado = (id, extra = {}) => ({
  id, cli: 'claude', sessao: id, cargo: 'senior', sala: 'recepcao', estado: 'pensando',
  estagiarios: [], ultimaAtividade: 1000, atividade: null, ...extra,
});
const estagiario = (id, extra = {}) => ({ id, sessao: 's1', tipo: 'pesquisa', estado: 'pensando', sala: 'reunioes', atividade: null, ultimaAtividade: 1000, ...extra });

function relogio(inicio = 0) {
  let t = inicio;
  return { agora: () => t, avancar: (ms) => { t += ms; } };
}

test('o mapa mostra 24 advogados, os de atividade mais recente; o resto fica fora do mapa', () => {
  const advogados = [];
  for (let i = 0; i < 30; i += 1) advogados.push(advogado(`claude:s${i}`, { ultimaAtividade: i }));
  const elenco = criarElenco({ agora: () => 0 });
  const { visiveis, foraDoMapa } = elenco.sincronizar({ advogados, estagiarios: [] });
  assert.equal(visiveis.length, LIMITE_ADVOGADOS);
  assert.equal(foraDoMapa.length, 6);
  assert.equal(visiveis[0], 'claude:s29');
  assert.deepEqual(foraDoMapa.sort(), ['claude:s0', 'claude:s1', 'claude:s2', 'claude:s3', 'claude:s4', 'claude:s5']);
  assert.equal(elenco.atores().length, LIMITE_ADVOGADOS);
  assert.deepEqual(ordenarPorAtividade(advogados)[0].id, 'claude:s29');
});

test('no máximo 6 estagiários por advogado entram no mapa', () => {
  const ids = [];
  const estagiarios = [];
  for (let i = 0; i < 8; i += 1) {
    ids.push(`claude:s1:a${i}`);
    estagiarios.push(estagiario(`claude:s1:a${i}`));
  }
  const elenco = criarElenco({ agora: () => 0 });
  const { foraDoMapa } = elenco.sincronizar({ advogados: [advogado('claude:s1', { estagiarios: ids })], estagiarios });
  const noMapa = elenco.atores().filter((a) => a.tipo === 'estagiario');
  assert.equal(noMapa.length, LIMITE_ESTAGIARIOS);
  assert.deepEqual(noMapa.map((a) => a.id).sort(), ['claude:s1:a0', 'claude:s1:a1', 'claude:s1:a2', 'claude:s1:a3', 'claude:s1:a4', 'claude:s1:a5']);
  assert.deepEqual(foraDoMapa, [], 'foraDoMapa lista só advogados: estagiário além do limite apenas não é desenhado');
});

test('postos: cada um pega o primeiro livre e libera ao sair; sem posto fica em pé na sala', () => {
  const elenco = criarElenco({ agora: () => 0, reduzirMovimento: true });
  const advogados = [];
  for (let i = 0; i < 4; i += 1) advogados.push(advogado(`claude:s${i}`, { sala: 'cartorio', ultimaAtividade: 100 - i }));
  elenco.sincronizar({ advogados, estagiarios: [] });
  const postos = advogados.map((a) => elenco.postoDe(a.id));
  assert.deepEqual(postos.slice(0, 3), [0, 1, 2]);
  assert.equal(postos[3], null, 'o quarto não tem posto no cartório (só 3)');
  const emPe = elenco.ator('claude:s3');
  assert.equal(salaEm(emPe.x, emPe.y), 'cartorio');

  // o primeiro sai: o posto 0 volta a ficar livre para quem chegar depois
  elenco.sincronizar({ advogados: advogados.slice(1), estagiarios: [] });
  elenco.sincronizar({ advogados: [...advogados.slice(1), advogado('claude:s9', { sala: 'cartorio', ultimaAtividade: 1 })], estagiarios: [] });
  assert.equal(elenco.postoDe('claude:s9'), 0);
});

test('troca de sala só vale depois de 1 s estável (debounce)', () => {
  const r = relogio(10_000);
  const elenco = criarElenco({ agora: r.agora, reduzirMovimento: true });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'recepcao' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'recepcao');

  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'recepcao', 'não muda na primeira leitura');
  r.avancar(DEBOUNCE_SALA_MS - 100);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'recepcao', 'ainda dentro do debounce');
  r.avancar(200);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'biblioteca');

  // chamada curtíssima: volta antes de 1 s e nada acontece
  r.avancar(100);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'cartorio' })], estagiarios: [] });
  r.avancar(100);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  r.avancar(2000);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'biblioteca' })], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1').sala, 'biblioteca');
});

test('movimento a 3 tiles por segundo, com espelhamento pela direção', () => {
  const r = relogio(0);
  const elenco = criarElenco({ agora: r.agora });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'recepcao' })], estagiarios: [] });
  const ator = elenco.ator('claude:s1');
  ator.x = 10;
  ator.y = 13;
  ator.rota = [{ x: 16, y: 13 }];
  elenco.atualizar(500);
  assert.ok(Math.abs(ator.x - 11.5) < 1e-9, `andou ${ator.x - 10} tiles em 0,5 s`);
  assert.equal(ator.andando, true);
  assert.equal(ator.direcao, 1);
  ator.rota = [{ x: 10, y: 13 }];
  elenco.atualizar(500);
  assert.equal(ator.direcao, -1);
  elenco.atualizar(10_000);
  assert.equal(ator.andando, false);
  assert.deepEqual([ator.x, ator.y], [10, 13]);
});

test('mudança de destino no meio do caminho recalcula da posição atual sem andar para trás', () => {
  const r = relogio(0);
  const elenco = criarElenco({ agora: r.agora });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'recepcao' })], estagiarios: [] });
  const ator = elenco.ator('claude:s1');
  elenco.atualizar(5000); // chega no posto da recepção

  r.avancar(1);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'revisao' })], estagiarios: [] });
  r.avancar(DEBOUNCE_SALA_MS);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'revisao' })], estagiarios: [] });
  elenco.atualizar(1800); // sai da recepção, passa pelo saguão (14,10) e sobe o eixo central rumo ao cruzamento (14,8)
  const meio = { x: ator.x, y: ator.y };
  assert.equal(salaEm(meio.x, meio.y), null, 'deveria estar no corredor');
  assert.ok(Math.abs(meio.x - 14) < 1e-9 && Math.abs(meio.y - 9.2) < 0.02, `esperava (14, 9.2), veio (${meio.x}, ${meio.y})`);
  assert.deepEqual(ator.aresta, { de: 'saguao', para: 'cruz' });

  r.avancar(1);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'cartorio' })], estagiarios: [] });
  r.avancar(DEBOUNCE_SALA_MS);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'cartorio' })], estagiarios: [] });
  assert.deepEqual({ x: ator.x, y: ator.y }, meio, 'não pode teleportar ao recalcular');
  assert.equal(ator.sala, 'cartorio');
  // O nó mais próximo em linha reta é o saguão (14,10), atrás dele; a rota nova parte do cruzamento (14,8), à frente.
  assert.equal(ator.rota[0].no, 'cruz');
  elenco.atualizar(100);
  assert.ok(ator.y < meio.y, `deveria seguir subindo, mas foi de y=${meio.y} para y=${ator.y}`);
  elenco.atualizar(30_000);
  assert.equal(salaEm(ator.x, ator.y), 'cartorio');
  assert.deepEqual({ x: ator.x, y: ator.y }, { x: SALAS.cartorio.postos[0].x, y: SALAS.cartorio.postos[0].y });
});

test('com movimento reduzido o deslocamento é instantâneo e sem balanço', () => {
  const elenco = criarElenco({ agora: () => 0, reduzirMovimento: true });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'gabinete' })], estagiarios: [] });
  const ator = elenco.ator('claude:s1');
  assert.deepEqual({ x: ator.x, y: ator.y }, { x: SALAS.gabinete.postos[0].x, y: SALAS.gabinete.postos[0].y });
  elenco.atualizar(16);
  assert.equal(ator.fase, 0);
  assert.equal(ator.andando, false);
});

test('estagiário sem atividade orbita o advogado; com atividade caminha para a sala dela', () => {
  const r = relogio(0);
  const elenco = criarElenco({ agora: r.agora, reduzirMovimento: true });
  const estado = {
    advogados: [advogado('claude:s1', { sala: 'gabinete', estagiarios: ['claude:s1:a0', 'claude:s1:a1'] })],
    estagiarios: [estagiario('claude:s1:a0'), estagiario('claude:s1:a1')],
  };
  elenco.sincronizar(estado);
  elenco.atualizar(16);
  const dono = elenco.ator('claude:s1');
  for (const id of ['claude:s1:a0', 'claude:s1:a1']) {
    const filho = elenco.ator(id);
    const d = Math.hypot(filho.x - dono.x, (filho.y - dono.y) / 0.6);
    assert.ok(Math.abs(d - RAIO_ORBITA) < 1e-9, `${id} deveria orbitar a 1 tile`);
  }
  assert.notDeepEqual(
    { x: elenco.ator('claude:s1:a0').x, y: elenco.ator('claude:s1:a0').y },
    { x: elenco.ator('claude:s1:a1').x, y: elenco.ator('claude:s1:a1').y },
  );

  const comAtividade = {
    advogados: estado.advogados,
    estagiarios: [estagiario('claude:s1:a0', { sala: 'biblioteca', atividade: { nome: 'Grep', detalhe: 'reclamação' } }), estado.estagiarios[1]],
  };
  r.avancar(1);
  elenco.sincronizar(comAtividade);
  r.avancar(DEBOUNCE_SALA_MS);
  elenco.sincronizar(comAtividade);
  elenco.atualizar(16);
  const andarilho = elenco.ator('claude:s1:a0');
  assert.equal(andarilho.orbitando, false);
  assert.equal(salaEm(andarilho.x, andarilho.y), 'biblioteca');
});

test('advogado que some do estado sai do elenco e devolve o posto', () => {
  const elenco = criarElenco({ agora: () => 0, reduzirMovimento: true });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'revisao' })], estagiarios: [] });
  assert.equal(elenco.postoDe('claude:s1'), 0);
  elenco.sincronizar({ advogados: [], estagiarios: [] });
  assert.equal(elenco.ator('claude:s1'), null);
  elenco.sincronizar({ advogados: [advogado('codex:s2', { sala: 'revisao' })], estagiarios: [] });
  assert.equal(elenco.postoDe('codex:s2'), 0);
});

test('estagiário orbitando que ganha atividade na sala em que já estava marcado caminha até o posto', () => {
  const r = relogio(0);
  const elenco = criarElenco({ agora: r.agora, reduzirMovimento: true });
  const id = 'claude:s1:a0';
  const estado = {
    advogados: [advogado('claude:s1', { sala: 'gabinete', estagiarios: [id] })],
    estagiarios: [estagiario(id, { sala: 'reunioes', atividade: null })],
  };
  elenco.sincronizar(estado);
  elenco.atualizar(16);
  assert.equal(elenco.ator(id).orbitando, true);
  assert.equal(elenco.postoDe(id), null);

  const comAtividade = {
    advogados: estado.advogados,
    estagiarios: [estagiario(id, { sala: 'reunioes', atividade: { nome: 'Agent', detalhe: 'pesquisa' } })],
  };
  elenco.sincronizar(comAtividade);
  r.avancar(DEBOUNCE_SALA_MS + 1);
  elenco.sincronizar(comAtividade);
  elenco.atualizar(16);
  const filho = elenco.ator(id);
  assert.equal(filho.orbitando, false);
  assert.equal(elenco.postoDe(id), 0);
  assert.equal(salaEm(filho.x, filho.y), 'reunioes');
  assert.deepEqual({ x: filho.x, y: filho.y }, { x: SALAS.reunioes.postos[0].x, y: SALAS.reunioes.postos[0].y });
});

test('definirMovimentoReduzido(true) encerra as rotas em curso na hora e zera a fase', () => {
  const r = relogio(0);
  const elenco = criarElenco({ agora: r.agora });
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'recepcao' })], estagiarios: [] });
  const ator = elenco.ator('claude:s1');
  elenco.atualizar(5000); // chega no posto da recepção

  r.avancar(1);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'revisao' })], estagiarios: [] });
  r.avancar(DEBOUNCE_SALA_MS + 1);
  elenco.sincronizar({ advogados: [advogado('claude:s1', { sala: 'revisao' })], estagiarios: [] });
  elenco.atualizar(300);
  assert.equal(ator.andando, true);
  assert.ok(ator.rota.length > 0);

  elenco.definirMovimentoReduzido(true);
  assert.equal(elenco.movimentoReduzido, true);
  assert.equal(ator.andando, false);
  assert.deepEqual(ator.rota, []);
  assert.equal(ator.aresta, null);
  assert.deepEqual({ x: ator.x, y: ator.y }, { x: SALAS.revisao.postos[0].x, y: SALAS.revisao.postos[0].y });

  elenco.atualizar(16);
  assert.equal(ator.fase, 0);

  elenco.definirMovimentoReduzido(false);
  assert.equal(elenco.movimentoReduzido, false);
});
