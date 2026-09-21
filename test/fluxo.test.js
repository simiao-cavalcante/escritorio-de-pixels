import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { criarFluxo } from '../src/fluxo.js';

function cliente() {
  const req = new EventEmitter();
  const res = { escritos: [], cabecalho: null, destroyed: false, writableLength: 0, fechado: false,
    writeHead(status, headers) { this.cabecalho = { status, headers }; },
    write(t) { this.escritos.push(t); },
    end(t) { if (t) this.escritos.push(t); this.fechado = true; } };
  return { req, res };
}
const eventos = (res) => res.escritos.filter((t) => t.startsWith('event:')).map((t) => {
  const [, tipo] = t.match(/^event: (\S+)/);
  return { tipo, dados: JSON.parse(t.match(/data: (.*)\n\n$/s)[1]) };
});

test('conectar envia snapshot com seq atual; transmitir numera deltas', () => {
  const timers = [];
  const fluxo = criarFluxo({ setIntervalFn: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; }, clearIntervalFn: () => {} });
  const { req, res } = cliente();
  assert.equal(fluxo.conectar(req, res, { advogados: [], estagiarios: [] }), true);
  assert.equal(res.cabecalho.status, 200);
  assert.equal(res.cabecalho.headers['content-type'], 'text/event-stream');
  assert.deepEqual(eventos(res)[0], { tipo: 'snapshot', dados: { seq: 0, advogados: [], estagiarios: [] } });
  assert.equal(fluxo.transmitir('advogado', { advogado: { id: 'a' } }), 1);
  assert.equal(fluxo.transmitir('remover', { tipo: 'advogado', id: 'a' }), 2);
  const evs = eventos(res);
  assert.deepEqual(evs[1], { tipo: 'advogado', dados: { seq: 1, advogado: { id: 'a' } } });
  assert.deepEqual(evs[2].dados, { seq: 2, tipo: 'advogado', id: 'a' });
  assert.equal(timers[0].ms, 15000);
  timers[0].fn();
  assert.equal(res.escritos.at(-1), ': ping\n\n');
  req.emit('close');
  assert.equal(fluxo.clientes, 0);
  fluxo.fechar();
});

test('limite de clientes responde 503 e consumidor lento é fechado', () => {
  const fluxo = criarFluxo({ maxClientes: 1, maxBuffer: 10, setIntervalFn: () => ({ unref() {} }), clearIntervalFn: () => {} });
  const a = cliente();
  const b = cliente();
  fluxo.conectar(a.req, a.res, {});
  assert.equal(fluxo.conectar(b.req, b.res, {}), false);
  assert.equal(b.res.cabecalho.status, 503);
  a.res.writableLength = 11;
  fluxo.transmitir('advogado', { advogado: {} });
  assert.equal(a.res.fechado, true);
  assert.equal(fluxo.clientes, 0);
  fluxo.fechar();
});
