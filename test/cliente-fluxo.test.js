import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoInicial, aplicarMensagem, criarClienteFluxo } from '../public/fluxo-cliente.js';

const snap = (seq = 0, extra = {}) => ({
  seq,
  advogados: [{ id: 'claude:s1', sala: 'recepcao', ultimaAtividade: 1 }],
  estagiarios: [],
  salas: [{ id: 'recepcao', rotulo: 'Recepção' }],
  saude: { claude: { eventos: 1 } },
  crachas: { clis: { claude: { cor: '#c2603e', sigla: 'CL' } }, padrao: { cor: '#8a8a8a', sigla: '??' } },
  ...extra,
});

test('snapshot substitui todo o estado', () => {
  const e = aplicarMensagem(estadoInicial(), 'snapshot', snap(7));
  assert.equal(e.seq, 7);
  assert.equal(e.temSnapshot, true);
  assert.equal(e.advogados.length, 1);
  assert.equal(e.crachas.clis.claude.sigla, 'CL');
  assert.equal(e.salas[0].rotulo, 'Recepção');
  const e2 = aplicarMensagem(e, 'snapshot', { seq: 9, advogados: [], estagiarios: [], salas: [], saude: {}, crachas: null });
  assert.equal(e2.seq, 9);
  assert.deepEqual(e2.advogados, []);
});

test('deltas substituem a entidade inteira e removem por id', () => {
  let e = aplicarMensagem(estadoInicial(), 'snapshot', snap(0));
  e = aplicarMensagem(e, 'advogado', { seq: 1, advogado: { id: 'claude:s1', sala: 'gabinete', ultimaAtividade: 2 } });
  assert.equal(e.seq, 1);
  assert.equal(e.advogados.length, 1);
  assert.equal(e.advogados[0].sala, 'gabinete');
  e = aplicarMensagem(e, 'advogado', { seq: 2, advogado: { id: 'codex:s2', sala: 'cartorio' } });
  assert.equal(e.advogados.length, 2);
  e = aplicarMensagem(e, 'estagiario', { seq: 3, estagiario: { id: 'claude:s1:a1', sala: 'reunioes' } });
  assert.equal(e.estagiarios.length, 1);
  e = aplicarMensagem(e, 'remover', { seq: 4, tipo: 'estagiario', id: 'claude:s1:a1' });
  assert.deepEqual(e.estagiarios, []);
  e = aplicarMensagem(e, 'remover', { seq: 5, tipo: 'advogado', id: 'claude:s1' });
  assert.deepEqual(e.advogados.map((a) => a.id), ['codex:s2']);
  e = aplicarMensagem(e, 'saude', { seq: 6, saude: { codex: { eventos: 3 } } });
  assert.deepEqual(e.saude, { codex: { eventos: 3 } });
  assert.equal(e.seq, 6);
});

test('delta atrasado é descartado e o estado não muda de identidade', () => {
  const base = aplicarMensagem(estadoInicial(), 'snapshot', snap(5));
  const igual = aplicarMensagem(base, 'advogado', { seq: 5, advogado: { id: 'x' } });
  assert.equal(igual, base);
  assert.equal(aplicarMensagem(base, 'advogado', { seq: 3, advogado: { id: 'x' } }), base);
  assert.equal(aplicarMensagem(base, 'tipoEstranho', { seq: 6 }), base);
  assert.equal(aplicarMensagem(estadoInicial(), 'advogado', { seq: 1, advogado: { id: 'x' } }).temSnapshot, false);
});

test('salto de seq marca precisaReconectar sem aplicar o delta', () => {
  const base = aplicarMensagem(estadoInicial(), 'snapshot', snap(5));
  const e = aplicarMensagem(base, 'advogado', { seq: 8, advogado: { id: 'codex:s9' } });
  assert.equal(e.precisaReconectar, true);
  assert.equal(e.seq, 5);
  assert.equal(e.advogados.length, 1);
});

test('erro de conexão põe conectado=false sem perder os dados; o snapshot seguinte religa', () => {
  assert.equal(estadoInicial().conectado, false);
  const base = aplicarMensagem(estadoInicial(), 'snapshot', snap(5));
  assert.equal(base.conectado, true);
  const caido = aplicarMensagem(base, 'erro');
  assert.equal(caido.conectado, false);
  assert.equal(caido.seq, 5);
  assert.equal(caido.advogados.length, 1, 'os dados ficam para o mapa continuar desenhado');
  assert.equal(aplicarMensagem(caido, 'erro'), caido, 'erro repetido não muda a identidade do estado');
  assert.equal(aplicarMensagem(caido, 'snapshot', snap(6)).conectado, true);
});

function fonteFalsa() {
  const ouvintes = new Map();
  return {
    fechada: false,
    addEventListener(tipo, fn) {
      ouvintes.set(tipo, fn);
    },
    close() {
      this.fechada = true;
    },
    emitir(tipo, dados) {
      ouvintes.get(tipo)?.({ data: JSON.stringify(dados) });
    },
    emitirBruto(tipo, texto) {
      ouvintes.get(tipo)?.({ data: texto });
    },
  };
}

test('cliente aplica mensagens, avisa a cada mudança e reabre a fonte no salto', () => {
  const fontes = [];
  const estados = [];
  const erros = [];
  const cliente = criarClienteFluxo({
    criarFonte: () => {
      const f = fonteFalsa();
      fontes.push(f);
      return f;
    },
    aoEstado: (e) => estados.push(e),
    aoErro: (m) => erros.push(m),
  });
  fontes[0].emitir('snapshot', snap(0));
  fontes[0].emitir('advogado', { seq: 1, advogado: { id: 'claude:s1', sala: 'biblioteca' } });
  assert.equal(estados.length, 2);
  assert.equal(cliente.estado.advogados[0].sala, 'biblioteca');
  assert.equal(cliente.estado.conectado, true);

  fontes[0].emitir('error');
  assert.equal(estados.length, 3, 'a queda é uma mudança de estado: o HUD precisa mostrar "sem conexão"');
  assert.equal(cliente.estado.conectado, false);
  assert.equal(cliente.estado.advogados.length, 1, 'os dados ficam até chegar o snapshot novo');
  assert.deepEqual(erros, ['fluxo caiu; o EventSource reconecta sozinho']);
  fontes[0].emitir('snapshot', snap(1)); // o EventSource reconectou sozinho e o servidor mandou snapshot novo
  assert.equal(cliente.estado.conectado, true);

  fontes[0].emitir('advogado', { seq: 9, advogado: { id: 'claude:s1', sala: 'copa' } });
  assert.equal(fontes.length, 2, 'deveria ter reaberto o EventSource');
  assert.equal(fontes[0].fechada, true);
  assert.equal(cliente.estado.temSnapshot, false);
  assert.equal(erros.length, 2);

  fontes[1].emitir('snapshot', snap(20));
  assert.equal(cliente.estado.seq, 20);
  cliente.fechar();
  assert.equal(fontes[1].fechada, true);
});

test('JSON inválido no fluxo vira aviso, não exceção', () => {
  const erros = [];
  let fonte;
  const cliente = criarClienteFluxo({
    criarFonte: () => {
      fonte = fonteFalsa();
      return fonte;
    },
    aoErro: (m) => erros.push(m),
  });
  assert.doesNotThrow(() => fonte.emitirBruto('snapshot', '{nope'));
  assert.deepEqual(erros, ['mensagem do fluxo com JSON inválido']);
  assert.equal(cliente.estado.temSnapshot, false);
  cliente.fechar();
});
