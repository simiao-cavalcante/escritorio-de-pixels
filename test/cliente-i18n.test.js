import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarI18n, idiomaDoNavegador, IDIOMAS, TEXTOS } from '../public/i18n.js';

test('os dois idiomas têm exatamente as mesmas chaves', () => {
  assert.deepEqual(IDIOMAS, ['pt-BR', 'en']);
  assert.deepEqual(Object.keys(TEXTOS['pt-BR']).sort(), Object.keys(TEXTOS.en).sort());
});

test('t, cargo e estado traduzem e caem no pt-BR quando falta chave', () => {
  const pt = criarI18n('pt-BR');
  const en = criarI18n('en');
  assert.equal(pt.t('casoAtual'), 'Caso atual');
  assert.equal(en.t('casoAtual'), 'Current case');
  assert.equal(pt.t('semConexao'), 'Sem conexão com o servidor');
  assert.equal(en.t('semConexao'), 'No connection to the server');
  assert.equal(pt.cargo('socio'), 'Sócio(a)');
  assert.equal(en.cargo('socio'), 'Partner');
  assert.equal(en.estado('trabalhando'), 'working');
  assert.equal(en.t('naoExiste'), 'naoExiste');
  assert.equal(criarI18n('klingon').idioma, 'pt-BR');
});

test('rótulo de sala: pt-BR usa o do servidor, en traduz por id', () => {
  const pt = criarI18n('pt-BR');
  const en = criarI18n('en');
  assert.equal(pt.sala('gabinete', 'Gabinete de Redação'), 'Gabinete de Redação');
  assert.equal(en.sala('gabinete', 'Gabinete de Redação'), 'Drafting Office');
  assert.equal(en.sala('inexistente', 'Sala X'), 'Sala X');
});

test('numero usa separador de milhar por idioma', () => {
  assert.equal(criarI18n('pt-BR').numero(1234567), '1.234.567');
  assert.equal(criarI18n('en').numero(1234567), '1,234,567');
  assert.equal(criarI18n('pt-BR').numero(42), '42');
  assert.equal(criarI18n('pt-BR').numero(undefined), '—');
});

test('idiomaDoNavegador escolhe en só quando o navegador pede en', () => {
  assert.equal(idiomaDoNavegador(['en-US', 'pt-BR']), 'en');
  assert.equal(idiomaDoNavegador(['pt-BR', 'en']), 'pt-BR');
  assert.equal(idiomaDoNavegador(['fr', 'en-GB']), 'en');
  assert.equal(idiomaDoNavegador(['fr-FR']), 'pt-BR');
  assert.equal(idiomaDoNavegador([]), 'pt-BR');
  assert.equal(criarI18n('en').outro(), 'pt-BR');
});
