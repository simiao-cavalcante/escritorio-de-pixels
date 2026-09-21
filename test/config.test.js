import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PORTA_PADRAO, lerConfig, gravarConfig, urlHook, comandoCurl, dirsTranscritos, caminhoConfig } from '../src/config.js';

test('lerConfig devolve a porta padrão quando não há arquivo', () => {
  const home = mkdtempSync(join(tmpdir(), 'edp-'));
  assert.deepEqual(lerConfig(home), { porta: PORTA_PADRAO, portaInstalada: undefined });
});

test('gravarConfig e lerConfig fazem ida e volta', () => {
  const home = mkdtempSync(join(tmpdir(), 'edp-'));
  gravarConfig({ porta: 7800, portaInstalada: 7800 }, home);
  assert.deepEqual(lerConfig(home), { porta: 7800, portaInstalada: 7800 });
  assert.equal(caminhoConfig(home), join(home, '.escritorio-de-pixels', 'config.json'));
});

test('urlHook e comandoCurl apontam para o servidor local', () => {
  assert.equal(urlHook('claude', 7777), 'http://127.0.0.1:7777/hook/claude');
  const cmd = comandoCurl('codex', 7800);
  assert.match(cmd, /^curl -s -m 2 /);
  assert.match(cmd, /http:\/\/127\.0\.0\.1:7800\/hook\/codex/);
  assert.match(cmd, /\|\| true$/);
});

test('dirsTranscritos usa o home informado', () => {
  const d = dirsTranscritos('/casa');
  assert.deepEqual(d.claude, ['/casa/.claude/projects']);
  assert.deepEqual(d.codex, ['/casa/.codex/sessions', '/casa/.codex/archived_sessions']);
});
