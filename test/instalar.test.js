import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIS, mesclar, remover, instalar, desinstalar, arquivoDeHooks, ehNosso } from '../src/instalar.js';
import { lerConfig } from '../src/config.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const agora = () => Date.parse('2026-09-20T12:00:00Z');
const casa = () => mkdtempSync(join(tmpdir(), 'edp-'));

test('mesclar sobre vazio bate com as amostras em adaptadores/', () => {
  for (const cli of CLIS) {
    const amostra = JSON.parse(readFileSync(join(RAIZ, 'adaptadores', `${cli}.hooks.json`), 'utf8'));
    assert.deepEqual(mesclar(cli, {}, 7777), amostra, cli);
  }
});

test('mesclar preserva hooks de terceiros, é idempotente e remover devolve o original', () => {
  const original = {
    permissions: { allow: ['Bash(npm test)'] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo oi' }] }] },
  };
  const uma = mesclar('claude', original, 7777);
  assert.deepEqual(uma.permissions, original.permissions);
  assert.equal(uma.hooks.PreToolUse.length, 2);
  assert.deepEqual(uma.hooks.PreToolUse[0], original.hooks.PreToolUse[0]);
  assert.equal(uma.hooks.PreToolUse[1].hooks[0].url, 'http://127.0.0.1:7777/hook/claude');
  const duas = mesclar('claude', uma, 7800);
  assert.equal(duas.hooks.PreToolUse.length, 2);
  assert.equal(duas.hooks.PreToolUse[1].hooks[0].url, 'http://127.0.0.1:7800/hook/claude');
  assert.deepEqual(remover('claude', duas), original);
  assert.deepEqual(remover('claude', { a: 1 }), { a: 1 });
  assert.equal(ehNosso({ type: 'http', url: 'http://127.0.0.1:1/hook/x' }), true);
  assert.equal(ehNosso({ command: 'echo /hook/' }), true);
  assert.equal(ehNosso({ command: 'echo' }), false);
});

test('cursor: entradas diretas e version preservada', () => {
  const original = { version: 1, hooks: { preToolUse: [{ command: './meu.sh' }] } };
  const m = mesclar('cursor', original, 7777);
  assert.equal(m.hooks.preToolUse.length, 2);
  assert.match(m.hooks.preToolUse[1].command, /\/hook\/cursor/);
  assert.equal(m.hooks.stop.length, 1);
  assert.deepEqual(remover('cursor', m), original);
});

test('instalar grava com backup atômico e persiste a porta; desinstalar reverte', () => {
  const home = casa();
  const arquivo = arquivoDeHooks('claude', home);
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, JSON.stringify({ model: 'opus' }));
  const r = instalar('claude', { home, porta: 7800, agora });
  assert.equal(r.alterado, true);
  assert.equal(r.arquivo, arquivo);
  assert.ok(r.backup.endsWith('.bak-2026-09-20T12-00-00-000Z'));
  assert.deepEqual(JSON.parse(readFileSync(r.backup, 'utf8')), { model: 'opus' });
  const gravado = JSON.parse(readFileSync(arquivo, 'utf8'));
  assert.equal(gravado.model, 'opus');
  assert.equal(gravado.hooks.Stop[0].hooks[0].url, 'http://127.0.0.1:7800/hook/claude');
  assert.deepEqual(lerConfig(home), { porta: 7800, portaInstalada: 7800 });
  const r2 = instalar('claude', { home, porta: 7800, agora });
  assert.equal(r2.alterado, false);
  const d = desinstalar('claude', { home, agora });
  assert.equal(d.alterado, true);
  assert.deepEqual(JSON.parse(readFileSync(arquivo, 'utf8')), { model: 'opus' });
  assert.equal(readdirSync(dirname(arquivo)).some((n) => n.includes('.tmp-')), false);
});

test('instalar recusa arquivo que não é JSON e cria o arquivo quando não existe', () => {
  const home = casa();
  const arquivo = arquivoDeHooks('codex', home);
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, '{ quebrado');
  assert.throws(() => instalar('codex', { home, porta: 7777, agora }), /não é JSON válido/);
  assert.equal(readFileSync(arquivo, 'utf8'), '{ quebrado');
  const home2 = casa();
  const r = instalar('gemini', { home: home2, porta: 7777, agora });
  assert.equal(existsSync(r.arquivo), true);
  assert.equal(r.backup, undefined);
  assert.equal(JSON.parse(readFileSync(r.arquivo, 'utf8')).hooks.BeforeTool[0].hooks[0].timeout, 2000);
});

test('grok usa arquivo próprio: desinstalar remove o arquivo com backup', () => {
  const home = casa();
  const r = instalar('grok', { home, porta: 7777, agora });
  assert.equal(r.arquivo, join(home, '.grok', 'hooks', 'escritorio.json'));
  assert.equal(JSON.parse(readFileSync(r.arquivo, 'utf8')).hooks.PreToolUse[0].hooks[0].type, 'http');
  const d = desinstalar('grok', { home, agora });
  assert.equal(existsSync(r.arquivo), false);
  assert.equal(existsSync(d.backup), true);
  assert.equal(desinstalar('grok', { home, agora }).alterado, false);
  assert.throws(() => instalar('emacs', { home, porta: 1, agora }), /cli desconhecida/);
});
