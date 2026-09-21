// O capturador é ferramenta de desenvolvimento, mas grava conteúdo real de sessão em disco:
// o filtro por projeto (--cwd) é o que impede sessões alheias de cair na árvore do repositório.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criarServidorDeCaptura, lerArgsCaptura } from '../scripts/capturar.mjs';

const projeto = '/tmp/projeto-de-teste';

async function subirCaptura(extra = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'edp-brutos-'));
  const servidor = criarServidorDeCaptura({ raiz, prefixoCwd: projeto, log: () => {}, ...extra });
  const porta = await new Promise((resolve) => servidor.listen(0, '127.0.0.1', () => resolve(servidor.address().port)));
  const enviar = (rota, corpo) => fetch(`http://127.0.0.1:${porta}${rota}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const arquivos = (cli) => (existsSync(join(raiz, cli)) ? readdirSync(join(raiz, cli)).sort() : []);
  return { raiz, servidor, enviar, arquivos, fechar: () => new Promise((r) => servidor.close(r)) };
}

test('capturador grava só o que vem do projeto indicado em --cwd', async () => {
  const c = await subirCaptura();
  try {
    assert.equal((await c.enviar('/hook/claude', { hook_event_name: 'PreToolUse', session_id: 's', cwd: `${projeto}/sub` })).status, 204);
    assert.deepEqual(c.arquivos('claude'), ['001-PreToolUse.json']);
    // sessão alheia do mesmo usuário: responde 204 (o hook não pode falhar) mas não grava
    assert.equal((await c.enviar('/hook/claude', { hook_event_name: 'Stop', session_id: 'outra', cwd: '/casa/outro-projeto' })).status, 204);
    assert.deepEqual(c.arquivos('claude'), ['001-PreToolUse.json']);
    // sem cwd nenhum não dá para saber de quem é: também não grava
    assert.equal((await c.enviar('/hook/claude', { hook_event_name: 'Stop', session_id: 's' })).status, 204);
    assert.deepEqual(c.arquivos('claude'), ['001-PreToolUse.json']);
    // as outras grafias de diretório contam (grok manda workspaceRoot; cursor, workspace_roots)
    assert.equal((await c.enviar('/hook/grok', { hookEventName: 'stop', sessionId: 'g', workspaceRoot: projeto })).status, 204);
    assert.equal((await c.enviar('/hook/cursor', { hookEventName: 'stop', workspace_roots: [`${projeto}/x`] })).status, 204);
    assert.deepEqual(c.arquivos('grok'), ['001-stop.json']);
    assert.deepEqual(c.arquivos('cursor'), ['001-stop.json']);
  } finally {
    await c.fechar();
  }
});

test('sem --cwd grava tudo (com aviso) e rota inválida não grava nada', async () => {
  const avisos = [];
  const c = await subirCaptura({ prefixoCwd: undefined, log: (m) => avisos.push(m) });
  try {
    assert.ok(avisos.some((m) => m.includes('--cwd')), `esperava aviso sobre --cwd; log: ${avisos.join(' | ')}`);
    assert.equal((await c.enviar('/hook/claude', { hook_event_name: 'Stop', cwd: '/qualquer' })).status, 204);
    assert.deepEqual(c.arquivos('claude'), ['001-Stop.json']);
    assert.equal((await c.enviar('/outra-rota', { hook_event_name: 'Stop' })).status, 204);
    assert.equal((await fetch(`http://127.0.0.1:${c.servidor.address().port}/hook/claude`)).status, 204);
    assert.deepEqual(c.arquivos('claude'), ['001-Stop.json']);
  } finally {
    await c.fechar();
  }
});

test('lerArgsCaptura lê --porta e --cwd', () => {
  assert.deepEqual(lerArgsCaptura(['--porta', '0', '--cwd', '/p']), { porta: 0, prefixoCwd: '/p' });
  assert.deepEqual(lerArgsCaptura([]), { porta: undefined, prefixoCwd: undefined });
  assert.deepEqual(lerArgsCaptura(['7800']), { porta: 7800, prefixoCwd: undefined });
});

test('lerArgsCaptura recusa --cwd sem valor e --porta que não é inteiro (em vez de degradar pro modo aberto)', () => {
  assert.throws(() => lerArgsCaptura(['--cwd']), /--cwd precisa de um caminho/);
  assert.throws(() => lerArgsCaptura(['--porta']), /--porta precisa de um número inteiro/);
  assert.throws(() => lerArgsCaptura(['--porta', 'abc']), /--porta precisa de um número inteiro/);
  assert.throws(() => lerArgsCaptura(['--porta', '-1']), /--porta precisa de um número inteiro/);
  // com valor válido depois, continua funcionando (a validação não pode quebrar o caminho feliz)
  assert.deepEqual(lerArgsCaptura(['--cwd', '/p', '--porta', '7777']), { porta: 7777, prefixoCwd: '/p' });
});

test('prefixo do --cwd não casa por simples prefixo textual: diretório irmão é descartado', async () => {
  const prefixo = '/tmp/edp-prefixo-teste'; // não existe em disco: exercita o ramo sem realpath
  const c = await subirCaptura({ prefixoCwd: prefixo });
  try {
    assert.equal((await c.enviar('/hook/claude', { hook_event_name: 'Stop', session_id: 's', cwd: `${prefixo}-do-vizinho` })).status, 204);
    assert.deepEqual(c.arquivos('claude'), [], 'startsWith puro deixaria "/tmp/edp-prefixo-teste-do-vizinho" passar; com separador, não');
    assert.equal((await c.enviar('/hook/claude', { hook_event_name: 'Stop', session_id: 's', cwd: `${prefixo}/sub` })).status, 204);
    assert.deepEqual(c.arquivos('claude'), ['001-Stop.json'], 'mas o próprio prefixo, com separador, continua batendo');
  } finally {
    await c.fechar();
  }
});

test('prefixo do --cwd casa por caminho real, não só textual (ex.: /tmp e /private/tmp no macOS)', async () => {
  const dirReal = mkdtempSync('/tmp/edp-cwd-real-'); // diretório de verdade: dá pro realpath resolver
  mkdirSync(join(dirReal, 'sub'));
  try {
    const outraGrafia = join(realpathSync(dirReal), 'sub'); // no macOS, resolve pra /private/tmp/...
    const c = await subirCaptura({ prefixoCwd: dirReal });
    try {
      assert.equal((await c.enviar('/hook/claude', { hook_event_name: 'Stop', session_id: 's', cwd: outraGrafia })).status, 204);
      assert.deepEqual(c.arquivos('claude'), ['001-Stop.json'], 'mesmo diretório físico, grafia de caminho diferente, ainda casa');
    } finally {
      await c.fechar();
    }
  } finally {
    rmSync(dirReal, { recursive: true, force: true });
  }
});
