// Fluxo SSE (Server-Sent Events) para /fluxo: snapshot com seq, deltas numerados,
// heartbeat periódico e limites de clientes/buffer por cliente lento.
export function criarFluxo({ maxClientes = 8, maxBuffer = 1024 * 1024, heartbeatMs = 15_000, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  const clientes = new Set();
  let seq = 0;

  const formatar = (tipo, dados) => `event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`;

  function fecharCliente(res) {
    clientes.delete(res);
    try {
      res.end();
    } catch {
      /* já fechado */
    }
  }

  function escrever(res, texto) {
    if (res.destroyed || res.writableLength > maxBuffer) {
      fecharCliente(res);
      return;
    }
    res.write(texto);
  }

  const timer = setIntervalFn(() => {
    for (const res of [...clientes]) escrever(res, ': ping\n\n');
  }, heartbeatMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  function conectar(req, res, snapshot) {
    if (clientes.size >= maxClientes) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ erro: 'limite de clientes do fluxo' }));
      return false;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    clientes.add(res);
    res.write(formatar('snapshot', { seq, ...snapshot }));
    req.on('close', () => clientes.delete(res));
    return true;
  }

  function transmitir(tipo, dados) {
    seq += 1;
    const msg = formatar(tipo, { seq, ...dados });
    for (const res of [...clientes]) escrever(res, msg);
    return seq;
  }

  return {
    conectar,
    transmitir,
    formatar,
    get seq() { return seq; },
    get clientes() { return clientes.size; },
    fechar() {
      clearIntervalFn(timer);
      for (const r of [...clientes]) fecharCliente(r);
    },
  };
}
