import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
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

test('gravarConfig usa temporário por processo: não atropela o de outro processo', () => {
  const home = mkdtempSync(join(tmpdir(), 'edp-'));
  const alvo = caminhoConfig(home);
  mkdirSync(dirname(alvo), { recursive: true });
  // temporário deixado por outro processo (ou por uma gravação concorrente)
  const alheio = `${alvo}.tmp`;
  writeFileSync(alheio, 'de outro processo');
  gravarConfig({ porta: 7900, portaInstalada: undefined }, home);
  assert.equal(existsSync(alheio), true, 'o temporário de outro processo não pode ser usado nem renomeado');
  assert.equal(readFileSync(alheio, 'utf8'), 'de outro processo');
  assert.deepEqual(lerConfig(home), { porta: 7900, portaInstalada: undefined });
  // e o nosso temporário não fica para trás
  assert.deepEqual(readdirSync(dirname(alvo)).filter((n) => n.includes(`.tmp-${process.pid}`)), []);
});
