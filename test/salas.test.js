import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SALAS, SALAS_EMBUTIDAS, validarConfigSalas, criarResolvedor, extrairSkill, carregarSalas } from '../src/salas.js';

const padrao = () => criarResolvedor(validarConfigSalas(SALAS_EMBUTIDAS).config);

test('regras embutidas são válidas e cobrem as ferramentas principais', () => {
  const { resolverSala } = padrao();
  assert.equal(SALAS.length, 7);
  assert.equal(resolverSala({ nome: 'Read', detalhe: 'a.md' }), 'biblioteca');
  assert.equal(resolverSala({ nome: 'WebSearch', detalhe: 'x' }), 'biblioteca');
  assert.equal(resolverSala({ nome: 'Edit', detalhe: 'a.md' }), 'gabinete');
  assert.equal(resolverSala({ nome: 'Bash', detalhe: 'npm test' }), 'cartorio');
  assert.equal(resolverSala({ nome: 'Agent', detalhe: 'Explore: achar x' }), 'reunioes');
  assert.equal(resolverSala({ nome: 'mcp__github__search' }), 'reunioes');
  assert.equal(resolverSala({ nome: 'mcp__brave-search__web' }), 'biblioteca');
  assert.equal(resolverSala({ nome: 'FerramentaNova' }), 'recepcao');
});

test('precedência: skill > agentes > detalhe > exata > prefixo', () => {
  const { resolverSala } = padrao();
  assert.equal(resolverSala({ nome: 'Skill', detalhe: 'proprio-punho minutar contestação' }), 'gabinete');
  assert.equal(resolverSala({ nome: 'Skill', detalhe: 'informativo-stj 800' }), 'biblioteca');
  assert.equal(resolverSala({ nome: 'Skill', detalhe: 'desconhecida' }), 'recepcao');
  assert.equal(resolverSala({ nome: 'Agent', detalhe: 'code-reviewer: revisar diff' }), 'revisao');
  assert.equal(resolverSala({ nome: 'Agent', detalhe: 'Explore: procurar review antigo' }), 'reunioes');
  assert.equal(resolverSala({ nome: 'Bash', detalhe: 'rg "prescrição" src/' }), 'biblioteca');
  assert.equal(extrairSkill({ nome: 'Skill', detalhe: 'julgado arq.pdf' }), 'julgado');
  assert.equal(extrairSkill({ nome: 'Read', detalhe: 'x' }), undefined);
});

test('salaInicialEstagiario usa a regra de agentes', () => {
  const { salaInicialEstagiario } = padrao();
  assert.equal(salaInicialEstagiario('security-reviewer'), 'revisao');
  assert.equal(salaInicialEstagiario('Explore'), 'reunioes');
  assert.equal(salaInicialEstagiario(undefined), 'reunioes');
});

test('validação rejeita o arquivo inteiro: sala inexistente, regex inválida, regra ambígua', () => {
  assert.equal(validarConfigSalas({ versao: 1, padrao: 'recepcao', regras: [{ sala: 'sotao', ferramentas: ['X'] }] }).ok, false);
  assert.equal(validarConfigSalas({ versao: 1, padrao: 'recepcao', regras: [{ sala: 'revisao', agentes: '(' }] }).ok, false);
  assert.equal(validarConfigSalas({ versao: 1, padrao: 'recepcao', regras: [{ sala: 'revisao', skills: ['a'], prefixos: ['b'] }] }).ok, false);
  assert.equal(validarConfigSalas({ versao: 2, padrao: 'recepcao', regras: [] }).ok, false);
  assert.equal(validarConfigSalas({ versao: 1, padrao: 'copa', regras: [] }).ok, true);
});

test('empate na mesma prioridade: primeira regra do arquivo vence; prefixo mais longo vence', () => {
  const cfg = validarConfigSalas({ versao: 1, padrao: 'recepcao', regras: [
    { sala: 'gabinete', ferramentas: ['X'] },
    { sala: 'cartorio', ferramentas: ['X'] },
    { sala: 'reunioes', prefixos: ['mcp__'] },
    { sala: 'biblioteca', prefixos: ['mcp__docs__'] },
  ] }).config;
  const { resolverSala } = criarResolvedor(cfg);
  assert.equal(resolverSala({ nome: 'X' }), 'gabinete');
  assert.equal(resolverSala({ nome: 'mcp__docs__ler' }), 'biblioteca');
});

test('carregarSalas cai nas embutidas se o arquivo é inválido e recarrega quando válido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const caminho = join(dir, 'salas.json');
  writeFileSync(caminho, '{ inválido');
  const erros = [];
  const salas = carregarSalas(caminho, { aoErro: (m) => erros.push(m), watch: false });
  assert.equal(erros.length, 1);
  assert.equal(salas.resolverSala({ nome: 'Read' }), 'biblioteca');
  writeFileSync(caminho, JSON.stringify({ versao: 1, padrao: 'copa', regras: [{ sala: 'gabinete', ferramentas: ['Read'] }] }));
  assert.equal(salas.recarregar(), true);
  assert.equal(salas.resolverSala({ nome: 'Read' }), 'gabinete');
  assert.equal(salas.resolverSala({ nome: 'Outra' }), 'copa');
  writeFileSync(caminho, JSON.stringify({ versao: 1, padrao: 'sotao', regras: [] }));
  assert.equal(salas.recarregar(), false);
  assert.equal(salas.resolverSala({ nome: 'Read' }), 'gabinete');
  salas.fechar();
});
