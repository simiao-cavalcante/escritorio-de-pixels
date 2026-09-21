import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarAplicacao } from '../src/app.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

async function subir(extra = {}) {
  const app = criarAplicacao({ porta: 0, home: mkdtempSync(join(tmpdir(), 'edp-')), raiz: RAIZ, watch: false, ...extra });
  const porta = await app.iniciar();
  const url = (p) => `http://127.0.0.1:${porta}${p}`;
  return { app, porta, url };
}

function bruto({ porta, metodo = 'GET', caminho = '/', headers = {}, corpo }) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: porta, method: metodo, path: caminho, headers }, (res) => {
      let dados = '';
      res.on('data', (c) => { dados += c; });
      res.on('end', () => resolve({ status: res.statusCode, dados }));
    });
    req.on('error', reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

const ev = (extra) => ({ v: 1, cli: 'claude', sessao: 's1', ...extra });

/**
 * Conecta ao /fluxo (via `request` cru, não `fetch`, para casar com `bruto`) e devolve
 * `esperar(tipo)`: resolve com o payload já decodificado do PRÓXIMO evento SSE desse tipo.
 *
 * Um único listener de `data`, registrado uma vez na conexão, acumula tudo num buffer
 * (decodificado com TextDecoder `{ stream: true }`, para não partir um caractere multibyte
 * no meio — ex. o "ç" de "Recepção" cortado entre dois chunks). `esperar` nunca desliga esse
 * listener: se o tipo pedido já está no buffer, resolve na hora; senão, entra numa fila de
 * resolvers pendentes atendida assim que o bloco chegar. Isso evita a janela onde um evento
 * que chega entre duas chamadas de `esperar` (por exemplo durante um `await` de outra
 * requisição) seria descartado e travaria o teste para sempre.
 */
function conectarFluxo(porta) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: porta, method: 'GET', path: '/fluxo', headers: { host: `127.0.0.1:${porta}` } });
    req.on('error', reject);
    req.on('response', (res) => {
      let buffer = '';
      const dec = new TextDecoder();
      const pendentes = [];

      function extrair(tipo) {
        const i = buffer.indexOf(`event: ${tipo}\n`);
        if (i < 0) return undefined;
        const fim = buffer.indexOf('\n\n', i);
        if (fim < 0) return undefined;
        const bloco = buffer.slice(i, fim);
        buffer = buffer.slice(fim + 2);
        return JSON.parse(bloco.split('\ndata: ')[1]);
      }

      function atenderPendentes() {
        for (let i = 0; i < pendentes.length; i += 1) {
          const valor = extrair(pendentes[i].tipo);
          if (valor === undefined) continue;
          const { resolve: resolverPendente } = pendentes[i];
          pendentes.splice(i, 1);
          resolverPendente(valor);
          atenderPendentes(); // buffer pode ter mais de um bloco completo após um chunk
          return;
        }
      }

      res.on('data', (chunk) => {
        buffer += dec.decode(chunk, { stream: true });
        atenderPendentes();
      });

      function esperar(tipo) {
        const pronto = extrair(tipo);
        if (pronto !== undefined) return Promise.resolve(pronto);
        return new Promise((resolverPendente) => pendentes.push({ tipo, resolve: resolverPendente }));
      }

      resolve({ res, esperar });
    });
    req.end();
  });
}

test('POST /eventos aplica e GET /estado reflete; Host estranho recebe 421; Origin externo 403', async () => {
  const { app, porta, url } = await subir();
  try {
    const r = await fetch(url('/eventos'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([ev({ tipo: 'prompt', prompt: 'Minutar' }), { v: 1, tipo: 'x' }]) });
    assert.equal(r.status, 202);
    assert.deepEqual(await r.json(), { aceitos: 1, rejeitados: [{ indice: 1, erro: 'tipo desconhecido: x' }] });
    const estado = await (await fetch(url('/estado'))).json();
    assert.equal(estado.advogados[0].estado, 'pensando');
    assert.equal(estado.salas.length, 7);
    assert.equal(estado.saude.eventos.eventos, 1);
    assert.equal(estado.saude.eventos.invalidos, 1);
    assert.equal((await bruto({ porta, caminho: '/estado', headers: { host: 'evil.com:80' } })).status, 421);
    assert.equal((await fetch(url('/estado'), { headers: { origin: 'https://evil.com' } })).status, 403);
    assert.equal((await fetch(url('/estado'), { headers: { origin: `http://localhost:${porta}` } })).status, 200);
    assert.equal((await fetch(url('/nada'))).status, 404);
    // fetch() normaliza `/../package.json` para `/package.json` antes de enviar, então nunca
    // exercitava a travessia de verdade; `bruto` manda os bytes crus no path da requisição.
    // Mesmo assim, o 404 abaixo não vem do guard `startsWith(dirPublico + sep)`: o parser de
    // URL do Node já resolve o `..` do pathname antes de chegar em `servirEstatico`, então
    // `/../package.json` vira pedido de `public/package.json`, que não existe (o package.json
    // real está na raiz do repo, fora de `public/`) — o 404 é do `readFile` falhar (ENOENT),
    // não do guard. `%2e%2e` nem chega a virar `..` (o parser não decodifica o path), então cai
    // no mesmo ENOENT por outro motivo. O guard é defesa em profundidade e não é exercitado por
    // este teste.
    assert.equal((await bruto({ porta, caminho: '/../package.json', headers: { host: `127.0.0.1:${porta}` } })).status, 404);
    assert.equal((await bruto({ porta, caminho: '/%2e%2e/package.json', headers: { host: `127.0.0.1:${porta}` } })).status, 404);
  } finally {
    await app.fechar();
  }
});

test('hooks: payload do Claude vira advogado; envelope do Grok em /hook/claude vira cli grok; desconhecido é contado', async () => {
  const { app, url } = await subir();
  try {
    const post = (rota, corpo) => fetch(url(rota), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    assert.equal((await post('/hook/claude', { hook_event_name: 'PreToolUse', session_id: 'c1', cwd: '/p', tool_name: 'Edit', tool_input: { file_path: 'a.md' }, tool_use_id: 't1' })).status, 204);
    assert.equal((await post('/hook/claude', { hookEventName: 'pre_tool_use', hook_event_name: 'PreToolUse', sessionId: 'g1', cwd: '/g', toolName: 'read_file', toolInput: { path: 'x' }, toolUseId: 'u1' })).status, 204);
    assert.equal((await post('/hook/claude', { hook_event_name: 'PreCompact', session_id: 'c1' })).status, 204);
    assert.equal((await post('/hook/generico?cli=copilot', { hook_event_name: 'UserPromptSubmit', session_id: 'k1', prompt: 'oi' })).status, 204);
    assert.equal((await fetch(url('/hook/codex'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' })).status, 204);
    const estado = await (await fetch(url('/estado'))).json();
    const ids = estado.advogados.map((a) => a.id).sort();
    assert.deepEqual(ids, ['claude:c1', 'copilot:k1', 'grok:g1']);
    assert.equal(estado.advogados.find((a) => a.id === 'claude:c1').sala, 'gabinete');
    assert.equal(estado.saude.claude.ignorados, 1);
    assert.equal(estado.saude.grok.eventos, 1);
    assert.equal(estado.saude.codex.invalidos, 1);
  } finally {
    await app.fechar();
  }
});

test('corpo acima do limite recebe 413 e conta em /saude', async () => {
  const { app, porta } = await subir();
  try {
    const grande = JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 'c1', tool_name: 'Read', tool_response: 'x'.repeat(4 * 1024 * 1024 + 10) });
    const r = await bruto({ porta, metodo: 'POST', caminho: '/hook/claude', headers: { host: `127.0.0.1:${porta}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(grande) }, corpo: grande });
    assert.equal(r.status, 413);
    const medio = JSON.stringify(ev({ tipo: 'prompt', prompt: 'x'.repeat(70 * 1024) }));
    const r2 = await bruto({ porta, metodo: 'POST', caminho: '/eventos', headers: { host: `127.0.0.1:${porta}`, 'content-type': 'application/json' }, corpo: medio });
    assert.equal(r2.status, 413);
    const saude = await (await fetch(`http://127.0.0.1:${porta}/saude`)).json();
    assert.equal(saude.claude.rejeitadosPorTamanho, 1);
    assert.equal(saude.eventos.rejeitadosPorTamanho, 1);
  } finally {
    await app.fechar();
  }
});

test('GET /fluxo entrega snapshot e depois deltas numerados', async () => {
  const { app, url } = await subir();
  try {
    const ctrl = new AbortController();
    const resp = await fetch(url('/fluxo'), { signal: ctrl.signal });
    const leitor = resp.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    async function proximo(tipo) {
      for (;;) {
        const i = buffer.indexOf(`event: ${tipo}\n`);
        if (i >= 0) {
          const fim = buffer.indexOf('\n\n', i);
          if (fim >= 0) {
            const bloco = buffer.slice(i, fim);
            buffer = buffer.slice(fim + 2);
            return JSON.parse(bloco.split('\ndata: ')[1]);
          }
        }
        const { value, done } = await leitor.read();
        if (done) throw new Error('fluxo encerrado');
        buffer += dec.decode(value, { stream: true });
      }
    }
    const snap = await proximo('snapshot');
    assert.equal(snap.seq, 0);
    assert.deepEqual(snap.advogados, []);
    await fetch(url('/eventos'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ev({ tipo: 'ferramenta.inicio', ferramenta: { nome: 'Read', id: 'r' } })) });
    const delta = await proximo('advogado');
    assert.equal(delta.seq, 1);
    assert.equal(delta.advogado.sala, 'biblioteca');
    ctrl.abort();
  } finally {
    await app.fechar();
  }
});

test('modo demo recusa eventos externos com 503 e --ocultar-prompts esconde o texto', async () => {
  const demo = await subir({ demo: true });
  try {
    const r = await fetch(demo.url('/eventos'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 503);
  } finally {
    await demo.app.fechar();
  }
  const oculto = await subir({ ocultarPrompts: true });
  try {
    oculto.app.ingerir([ev({ tipo: 'prompt', prompt: 'Nome do cliente e segredo' })], 'teste');
    assert.equal(oculto.app.snapshot().advogados[0].caso, 'Caso em andamento (25 caracteres)');
  } finally {
    await oculto.app.fechar();
  }
});

test('nomes de CLI hostis (__proto__, constructor) não poluem Object.prototype nem derrubam o servidor', async () => {
  const { app, url } = await subir();
  try {
    const payload = { hook_event_name: 'UserPromptSubmit', session_id: 'p1', prompt: 'oi' };
    const post = (rota) => fetch(url(rota), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal((await post('/hook/__proto__')).status, 204);
    assert.equal((await post('/hook/constructor')).status, 204);
    assert.equal((await post('/hook/generico?cli=__proto__')).status, 204);
    // O bug gravava `invalidos = NaN` direto em Object.prototype: qualquer objeto literal do
    // processo passava a "herdar" isso. Um objeto novo, sem relação com o servidor, prova que
    // o protótipo global ficou intacto.
    assert.equal(({}).invalidos, undefined);
    const saude = await (await fetch(url('/saude'))).json();
    for (const chave of Object.keys(saude)) {
      assert.equal(Number.isNaN(saude[chave].invalidos), false, `${chave}.invalidos não pode ser NaN`);
    }
    // Não basta não quebrar: o caminho genérico precisa ter de fato funcionado para um nome
    // hostil, não só devolvido 204 em silêncio sem processar nada.
    assert.equal(saude.constructor.eventos, 1);
    const estado = await (await fetch(url('/estado'))).json();
    assert.ok(estado.advogados.some((a) => a.cli === 'constructor'), 'esperava advogado do cli "constructor" em /estado');
  } finally {
    await app.fechar();
  }
});

test('tique com saúde suja emite delta saude no SSE, com seq maior que o do snapshot', async () => {
  const { app, porta } = await subir({ tiqueMs: 20 });
  try {
    const { res, esperar } = await conectarFluxo(porta);
    const snap = await esperar('snapshot');
    await bruto({
      porta, metodo: 'POST', caminho: '/eventos',
      headers: { host: `127.0.0.1:${porta}`, 'content-type': 'application/json' },
      corpo: JSON.stringify(ev({ tipo: 'prompt', prompt: 'oi' })),
    });
    const delta = await esperar('saude');
    assert.ok(delta.seq > snap.seq, `esperava seq(saude)=${delta.seq} > seq(snapshot)=${snap.seq}`);
    res.destroy();
  } finally {
    await app.fechar();
  }
});

test('POST /hook/claude com JSON inválido soma invalidos do claude e emite delta saude no SSE', async () => {
  const { app, porta } = await subir({ tiqueMs: 20 });
  try {
    const { res, esperar } = await conectarFluxo(porta);
    await esperar('snapshot');
    await bruto({
      porta, metodo: 'POST', caminho: '/hook/claude',
      headers: { host: `127.0.0.1:${porta}`, 'content-type': 'application/json' },
      corpo: '{nope',
    });
    const delta = await esperar('saude');
    assert.equal(delta.saude.claude.invalidos, 1);
    res.destroy();
  } finally {
    await app.fechar();
  }
});

test('sessao.fim seguido de tique emite delta remover no SSE', async () => {
  const { app, porta } = await subir({ tiqueMs: 20 });
  try {
    // a lápide entra depois; aqui só interessa a remoção logo após o "saiu"
    app.escritorio.limites.removerMs = 0;
    const { res, esperar } = await conectarFluxo(porta);
    await esperar('snapshot');
    const enviar = (corpo) => bruto({
      porta, metodo: 'POST', caminho: '/eventos',
      headers: { host: `127.0.0.1:${porta}`, 'content-type': 'application/json' },
      corpo: JSON.stringify(corpo),
    });
    await enviar(ev({ tipo: 'prompt', prompt: 'oi' }));
    await esperar('advogado');
    await enviar(ev({ tipo: 'sessao.fim' }));
    const saida = await esperar('remover');
    assert.deepEqual({ tipo: saida.tipo, id: saida.id }, { tipo: 'advogado', id: 'claude:s1' });
    assert.deepEqual((await (await fetch(`http://127.0.0.1:${porta}/estado`)).json()).advogados, []);
    res.destroy();
  } finally {
    await app.fechar();
  }
});

test('erro do servidor depois do listen vai para o log (o reject do iniciar não fica órfão)', async () => {
  const erros = [];
  const { app } = await subir({ log: (m) => erros.push(m) });
  try {
    app.servidor.emit('error', new Error('boom'));
    assert.ok(erros.some((m) => m.includes('boom')), `esperava o erro no log; log: ${erros.join(' | ')}`);
  } finally {
    await app.fechar();
  }
});
