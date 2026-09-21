// O sanitizador é o que separa um payload real de uma fixture publicável: o que passar por
// ele vai para o git. Os testes usam brutos sintéticos numa raiz temporária.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizarFixtures } from '../scripts/sanitizar-fixtures.mjs';

const raizNova = () => mkdtempSync(join(tmpdir(), 'edp-sanit-'));
const escrever = (dir, nome, obj) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, nome), JSON.stringify(obj));
};
const brutosDe = (raiz, cli) => join(raiz, 'test', 'fixtures', 'brutos', cli);
const fixturesDe = (raiz, cli) => join(raiz, 'test', 'fixtures', cli);
const lerFixture = (raiz, cli, nome) => JSON.parse(readFileSync(join(fixturesDe(raiz, cli), nome), 'utf8'));

test('o id de sessão sai de qualquer string, mesmo em chave anterior à de sessão', () => {
  const raiz = raizNova();
  const real = '3f1c2b9a-0000-4444-8888-aaaabbbbcccc';
  // transcript_path vem ANTES de session_id: na versão antiga saía com o UUID real
  escrever(brutosDe(raiz, 'claude'), '001-Stop.json', {
    transcript_path: `/Users/fulano/.claude/p/${real}.jsonl`,
    session_id: real,
  });
  sanitizarFixtures({ raiz, home: '/Users/fulano', usuario: 'fulano' });
  const saida = lerFixture(raiz, 'claude', '001-Stop.json');
  assert.equal(saida.session_id, 'claude-1');
  assert.equal(saida.transcript_path, '/home/u/.claude/p/claude-1.jsonl');
  assert.ok(!JSON.stringify(saida).includes(real), 'o UUID real não pode sobrar em lugar nenhum');
  assert.ok(!JSON.stringify(saida).includes('fulano'));
});

test('segredos e e-mails são redigidos, não apenas cortados pelo limite de tamanho', () => {
  const raiz = raizNova();
  escrever(brutosDe(raiz, 'grok'), '001-pre_tool_use.json', {
    sessionId: 'abc',
    toolInput: {
      command: 'export K=sk-Ab12Cd34Ef',
      chave: 'xai-9Zz8Yy7Xx',
      cabecalho: 'Bearer zzz111aaa',
      contato: 'joao.silva@exemplo.com',
      inocente: 'abacaxi e abóbora',
    },
  });
  sanitizarFixtures({ raiz, home: '/Users/fulano', usuario: 'fulano' });
  const saida = lerFixture(raiz, 'grok', '001-pre_tool_use.json');
  assert.equal(saida.toolInput.command, 'export K=[redigido]');
  assert.equal(saida.toolInput.chave, '[redigido]');
  assert.equal(saida.toolInput.cabecalho, '[redigido]');
  assert.equal(saida.toolInput.contato, '[redigido]');
  // id curto ('abc') só é trocado quando é o valor inteiro: nada de substituição cega
  assert.equal(saida.sessionId, 'grok-1');
  assert.equal(saida.toolInput.inocente, 'abacaxi e abóbora');
});

test('o nome de usuário só sai como componente de caminho e com 3+ caracteres', () => {
  const raiz = raizNova();
  escrever(brutosDe(raiz, 'claude'), '001-Stop.json', {
    session_id: 'sessao-unica-aqui',
    cwd: '/home/jo/projeto',
    saida: 'jogar bola no jornal',
  });
  sanitizarFixtures({ raiz, home: '/nada', usuario: 'jo' });
  const curto = lerFixture(raiz, 'claude', '001-Stop.json');
  assert.equal(curto.saida, 'jogar bola no jornal');
  assert.equal(curto.cwd, '/home/jo/projeto');

  const raiz2 = raizNova();
  escrever(brutosDe(raiz2, 'claude'), '001-Stop.json', {
    session_id: 'sessao-unica-aqui',
    cwd: '/home/fulano/projeto',
    outro: '/Users/fulano/x',
    saida: 'fulanos e fulanas',
  });
  sanitizarFixtures({ raiz: raiz2, home: '/nada', usuario: 'fulano' });
  const longo = lerFixture(raiz2, 'claude', '001-Stop.json');
  assert.equal(longo.cwd, '/home/u/projeto');
  assert.equal(longo.outro, '/home/u/x');
  assert.equal(longo.saida, 'fulanos e fulanas', 'fora de caminho o nome não é apagado às cegas');
});

test('apelidos são prefixados pela CLI e semeados pelas fixtures já publicadas', () => {
  const raiz = raizNova();
  const realA = 'aaaa1111-2222-3333-4444-555566667777';
  const realB = 'bbbb1111-2222-3333-4444-555566667777';
  escrever(brutosDe(raiz, 'claude'), '001-Stop.json', { session_id: realA });
  escrever(brutosDe(raiz, 'claude'), '002-Stop.json', { session_id: realB });
  escrever(brutosDe(raiz, 'grok'), '001-stop.json', { sessionId: 'cccc1111-2222-3333-4444-555566667777' });
  // fixture já publicada com o mesmo nome: o apelido dela manda (regerar não renumera)
  escrever(fixturesDe(raiz, 'claude'), '001-Stop.json', { session_id: 'claude-7' });
  sanitizarFixtures({ raiz, home: '/nada', usuario: 'fulano' });
  assert.equal(lerFixture(raiz, 'claude', '001-Stop.json').session_id, 'claude-7');
  assert.equal(lerFixture(raiz, 'claude', '002-Stop.json').session_id, 'claude-1');
  assert.equal(lerFixture(raiz, 'grok', '001-stop.json').sessionId, 'grok-1');
});

test('raiz sem brutos não escreve nada', () => {
  const raiz = raizNova();
  assert.deepEqual(sanitizarFixtures({ raiz, home: '/nada', usuario: 'fulano' }).arquivos, []);
});
