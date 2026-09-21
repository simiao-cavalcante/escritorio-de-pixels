import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, chmodSync } from 'node:fs';
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
  assert.match(uma.hooks.PreToolUse[1].hooks[0].command, /127\.0\.0\.1:7777\/hook\/claude/);
  const duas = mesclar('claude', uma, 7800);
  assert.equal(duas.hooks.PreToolUse.length, 2);
  assert.match(duas.hooks.PreToolUse[1].hooks[0].command, /127\.0\.0\.1:7800\/hook\/claude/);
  assert.deepEqual(remover('claude', duas), original);
  assert.deepEqual(remover('claude', { a: 1 }), { a: 1 });
  assert.equal(ehNosso({ type: 'http', url: 'http://127.0.0.1:1/hook/x' }, 'x'), true);
  assert.equal(ehNosso({ command: 'curl http://localhost:7777/hook/x' }, 'x'), true);
  assert.equal(ehNosso({ command: 'echo /hook/' }, 'x'), false);
  assert.equal(ehNosso({ command: 'echo' }, 'x'), false);
  assert.equal(ehNosso({ url: 'https://ci.exemplo/hook/deploy' }, 'deploy'), false);
  assert.equal(ehNosso({ url: 'http://127.0.0.1:1/hook/x' }, undefined), false);
});

test('"hooks": null é tratado como ausente em mesclar e remover', () => {
  const amostra = JSON.parse(readFileSync(join(RAIZ, 'adaptadores', 'claude.hooks.json'), 'utf8'));
  assert.deepEqual(mesclar('claude', { hooks: null }, 7777), amostra);
  assert.deepEqual(remover('claude', { hooks: null }), { hooks: null });
});

test('ehNosso exige host local: hook de terceiro com /hook/ em URL externa sobrevive a instalar e desinstalar', () => {
  const home = casa();
  const arquivo = arquivoDeHooks('claude', home);
  mkdirSync(dirname(arquivo), { recursive: true });
  const original = {
    hooks: { PreToolUse: [{ hooks: [{ type: 'http', url: 'https://ci.exemplo/hook/deploy', timeout: 5 }] }] },
  };
  writeFileSync(arquivo, JSON.stringify(original));
  instalar('claude', { home, porta: 7777, agora });
  const instalado = JSON.parse(readFileSync(arquivo, 'utf8'));
  assert.equal(instalado.hooks.PreToolUse.length, 2);
  assert.ok(instalado.hooks.PreToolUse.some((g) => g.hooks[0].url === 'https://ci.exemplo/hook/deploy'));
  // reinstalar com porta diferente ainda reconhece e substitui a nossa entrada (idempotência mantida)
  instalar('claude', { home, porta: 7800, agora });
  const reinstalado = JSON.parse(readFileSync(arquivo, 'utf8'));
  assert.equal(reinstalado.hooks.PreToolUse.length, 2);
  desinstalar('claude', { home, agora });
  assert.deepEqual(JSON.parse(readFileSync(arquivo, 'utf8')), original);
});

test('ehNosso é por CLI: hook local de outra ferramenta (/hook/outra) sobrevive a instalar e desinstalar', () => {
  const home = casa();
  const arquivo = arquivoDeHooks('claude', home);
  mkdirSync(dirname(arquivo), { recursive: true });
  const alheio = { type: 'command', command: 'curl -s http://localhost:9999/hook/observador' };
  const original = { hooks: { PreToolUse: [{ hooks: [alheio] }] } };
  writeFileSync(arquivo, JSON.stringify(original));
  instalar('claude', { home, porta: 7777, agora });
  const instalado = JSON.parse(readFileSync(arquivo, 'utf8'));
  assert.equal(instalado.hooks.PreToolUse.length, 2);
  assert.deepEqual(instalado.hooks.PreToolUse[0], { hooks: [alheio] });
  // reinstalar com outra porta continua idempotente para a nossa entrada
  instalar('claude', { home, porta: 7800, agora });
  assert.equal(JSON.parse(readFileSync(arquivo, 'utf8')).hooks.PreToolUse.length, 2);
  desinstalar('claude', { home, agora });
  assert.deepEqual(JSON.parse(readFileSync(arquivo, 'utf8')), original);
  assert.equal(ehNosso(alheio, 'claude'), false);
  assert.equal(ehNosso({ url: 'http://127.0.0.1:7777/hook/claude' }, 'claude'), true);
  assert.equal(ehNosso({ url: 'http://127.0.0.1:7777/hook/claude' }, 'grok'), false);
});

test('claude: a entrada antiga (http) é reconhecida e substituída pela nova (command async)', () => {
  const antigo = { hooks: { PreToolUse: [{ hooks: [{ type: 'http', url: 'http://127.0.0.1:7777/hook/claude', timeout: 2 }] }] } };
  const m = mesclar('claude', antigo, 7777);
  assert.equal(m.hooks.PreToolUse.length, 1, 'a forma http antiga não pode duplicar');
  const nossa = m.hooks.PreToolUse[0].hooks[0];
  assert.equal(nossa.type, 'command');
  assert.equal(nossa.async, true);
  assert.equal(nossa.timeout, undefined); // com async o Claude Code ignora timeout
  assert.equal(nossa.url, undefined);
  assert.match(nossa.command, /127\.0\.0\.1:7777\/hook\/claude/);
  assert.equal(ehNosso({ type: 'http', url: 'http://127.0.0.1:7777/hook/claude', timeout: 2 }, 'claude'), true);
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
  assert.match(gravado.hooks.Stop[0].hooks[0].command, /127\.0\.0\.1:7800\/hook\/claude/);
  assert.deepEqual(lerConfig(home), { porta: 7800, portaInstalada: 7800 });
  const antesConteudo = readFileSync(arquivo, 'utf8');
  const antesBaks = readdirSync(dirname(arquivo)).filter((n) => n.includes('.bak-'));
  const r2 = instalar('claude', { home, porta: 7800, agora });
  assert.equal(r2.alterado, false);
  assert.equal(r2.backup, undefined);
  // reinstalação idêntica não gera um segundo backup nem toca o conteúdo do alvo
  assert.deepEqual(readdirSync(dirname(arquivo)).filter((n) => n.includes('.bak-')), antesBaks);
  assert.equal(readFileSync(arquivo, 'utf8'), antesConteudo);
  const d = desinstalar('claude', { home, agora });
  assert.equal(d.alterado, true);
  assert.deepEqual(JSON.parse(readFileSync(arquivo, 'utf8')), { model: 'opus' });
  assert.equal(readdirSync(dirname(arquivo)).some((n) => n.includes('.tmp-')), false);
});

test('instalar preserva a permissão do arquivo existente (escrita atômica não rebaixa o modo)', () => {
  const home = casa();
  const arquivo = arquivoDeHooks('claude', home);
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, JSON.stringify({ model: 'opus' }));
  chmodSync(arquivo, 0o600);
  const r = instalar('claude', { home, porta: 7777, agora });
  assert.equal(statSync(arquivo).mode & 0o777, 0o600);
  assert.equal(statSync(r.backup).mode & 0o777, 0o600);
});

test('instalar recusa "hooks" que não é objeto (array ou string), sem tocar o arquivo nem gerar backup', () => {
  const home = casa();
  const arquivo = arquivoDeHooks('claude', home);
  mkdirSync(dirname(arquivo), { recursive: true });
  const conteudoOriginal = JSON.stringify({ hooks: ['não é um objeto'] });
  writeFileSync(arquivo, conteudoOriginal);
  assert.throws(() => instalar('claude', { home, porta: 7777, agora }), /hooks não é um objeto/);
  assert.equal(readFileSync(arquivo, 'utf8'), conteudoOriginal);
  assert.equal(readdirSync(dirname(arquivo)).some((n) => n.includes('.bak-')), false);

  const arquivoCodex = arquivoDeHooks('codex', home);
  mkdirSync(dirname(arquivoCodex), { recursive: true });
  const conteudoString = JSON.stringify({ hooks: 'string qualquer' });
  writeFileSync(arquivoCodex, conteudoString);
  assert.throws(() => instalar('codex', { home, porta: 7777, agora }), /hooks não é um objeto/);
  assert.equal(readFileSync(arquivoCodex, 'utf8'), conteudoString);
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
  // O Grok recusa hook http apontando para http:// (proteção SSRF): o nosso vai como command.
  const nossa = JSON.parse(readFileSync(r.arquivo, 'utf8')).hooks.PreToolUse[0].hooks[0];
  assert.equal(nossa.type, 'command');
  assert.match(nossa.command, /127\.0\.0\.1:7777\/hook\/grok/);
  assert.equal(nossa.timeout, 2);
  assert.equal(nossa.url, undefined);
  const d = desinstalar('grok', { home, agora });
  assert.equal(existsSync(r.arquivo), false);
  assert.equal(existsSync(d.backup), true);
  assert.equal(desinstalar('grok', { home, agora }).alterado, false);
  assert.throws(() => instalar('emacs', { home, porta: 1, agora }), /cli desconhecida/);
});

// Ida e volta em disco por CLI (spec §7): instalar sobre vazio, sobre arquivo com hooks de
// terceiros, reinstalar em outra porta, editar por fora e desinstalar, preservando tudo o que
// não é nosso. claude e grok já têm os seus testes acima; aqui ficam codex, cursor e gemini.
const FORMA = {
  codex: { evento: 'PreToolUse', terceiro: { type: 'command', command: 'echo codex' } },
  cursor: { evento: 'preToolUse', terceiro: { command: './meu.sh' } },
  gemini: { evento: 'BeforeTool', terceiro: { type: 'command', command: 'echo gemini' } },
};

// Entradas de hook do evento, achatando os grupos ({ hooks: [...] }) das CLIs que os usam.
const entradasDe = (cli, cfg, evento) => {
  const lista = cfg.hooks?.[evento] ?? [];
  return cli === 'cursor' ? lista : lista.flatMap((g) => g.hooks ?? []);
};

for (const [cli, { evento, terceiro }] of Object.entries(FORMA)) {
  test(`${cli}: ida e volta em disco preserva hooks de terceiros e a edição feita por fora`, () => {
    const home = casa();
    const arquivo = arquivoDeHooks(cli, home);

    // 1. instalar sobre vazio (arquivo inexistente)
    const r1 = instalar(cli, { home, porta: 7777, agora });
    assert.equal(r1.alterado, true);
    assert.equal(r1.backup, undefined);
    const vazio = JSON.parse(readFileSync(arquivo, 'utf8'));
    assert.equal(entradasDe(cli, vazio, evento).filter((h) => ehNosso(h, cli)).length, 1);

    // 2. instalar sobre arquivo com hooks de terceiros e outras chaves
    const home2 = casa();
    const arquivo2 = arquivoDeHooks(cli, home2);
    mkdirSync(dirname(arquivo2), { recursive: true });
    const original = cli === 'cursor'
      ? { version: 1, outraChave: 'preservar', hooks: { [evento]: [terceiro] } }
      : { outraChave: 'preservar', hooks: { [evento]: [{ matcher: 'X', hooks: [terceiro] }] } };
    writeFileSync(arquivo2, JSON.stringify(original));
    instalar(cli, { home: home2, porta: 7777, agora });
    const comTerceiro = JSON.parse(readFileSync(arquivo2, 'utf8'));
    assert.equal(comTerceiro.outraChave, 'preservar');
    assert.deepEqual(entradasDe(cli, comTerceiro, evento).filter((h) => !ehNosso(h, cli)), [terceiro]);
    assert.equal(entradasDe(cli, comTerceiro, evento).filter((h) => ehNosso(h, cli)).length, 1);

    // 3. reinstalar com outra porta: continua uma única entrada nossa, agora na porta nova
    instalar(cli, { home: home2, porta: 7800, agora });
    const reinstalado = JSON.parse(readFileSync(arquivo2, 'utf8'));
    const nossas = entradasDe(cli, reinstalado, evento).filter((h) => ehNosso(h, cli));
    assert.equal(nossas.length, 1);
    assert.match(JSON.stringify(nossas[0]), new RegExp(`127\\.0\\.0\\.1:7800/hook/${cli}`));
    assert.deepEqual(entradasDe(cli, reinstalado, evento).filter((h) => !ehNosso(h, cli)), [terceiro]);

    // 4. editar por fora (o usuário acrescenta um hook seu) e desinstalar
    const editado = JSON.parse(readFileSync(arquivo2, 'utf8'));
    const meu = cli === 'cursor' ? { command: './depois.sh' } : { type: 'command', command: 'echo depois' };
    editado.hooks[evento].push(cli === 'cursor' ? meu : { hooks: [meu] });
    writeFileSync(arquivo2, JSON.stringify(editado));
    const d = desinstalar(cli, { home: home2, agora });
    assert.equal(d.alterado, true);
    assert.ok(existsSync(d.backup));
    const final = JSON.parse(readFileSync(arquivo2, 'utf8'));
    assert.equal(final.outraChave, 'preservar');
    assert.deepEqual(entradasDe(cli, final, evento), [terceiro, meu]);
    assert.equal(desinstalar(cli, { home: home2, agora }).alterado, false);
  });
}
