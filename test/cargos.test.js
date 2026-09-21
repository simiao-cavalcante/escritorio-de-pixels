import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CARGOS, CARGOS_EMBUTIDOS, validarConfigCargos, criarClassificador, carregarCargos } from '../src/cargos.js';

const padrao = () => criarClassificador(validarConfigCargos(CARGOS_EMBUTIDOS).config);

test('variantes pequenas vencem a família; sem regra cai no cargo neutro', () => {
  const { cargoDoModelo } = padrao();
  assert.equal(CARGOS.length, 5);
  assert.equal(cargoDoModelo('gpt-5-mini'), 'junior');
  assert.equal(cargoDoModelo('gpt-5.4'), 'senior');
  assert.equal(cargoDoModelo('gpt-5'), 'associado');
  assert.equal(cargoDoModelo('gpt-6-astra'), 'socio');
  assert.equal(cargoDoModelo('claude-fable-5-1'), 'socio');
  assert.equal(cargoDoModelo('claude-opus-5'), 'senior');
  assert.equal(cargoDoModelo('claude-sonnet-5'), 'associado');
  assert.equal(cargoDoModelo('claude-haiku-4-5-20251001'), 'junior');
  assert.equal(cargoDoModelo('gemini-3-pro'), 'senior');
  assert.equal(cargoDoModelo('gemini-3-flash'), 'associado');
  assert.equal(cargoDoModelo('gemini-2.5-flash-lite'), 'junior');
  assert.equal(cargoDoModelo('GROK-4'), 'senior');
  assert.equal(cargoDoModelo('llama-70b'), 'advogado');
  assert.equal(cargoDoModelo(undefined), 'advogado');
});

test('crachá por CLI com fallback', () => {
  const { crachaDaCli } = padrao();
  assert.deepEqual(crachaDaCli('claude'), { cor: '#c2603e', sigla: 'CL' });
  assert.deepEqual(crachaDaCli('desconhecida'), { cor: '#8a8a8a', sigla: '??' });
});

test('listarCrachas entrega o mapa inteiro para o cliente, em cópia', () => {
  const classificador = padrao();
  const crachas = classificador.listarCrachas();
  assert.deepEqual(Object.keys(crachas.clis).sort(), ['claude', 'codex', 'cursor', 'gemini', 'grok', 'opencode']);
  assert.deepEqual(crachas.clis.codex, { cor: '#2e9e5b', sigla: 'CX' });
  assert.deepEqual(crachas.padrao, { cor: '#8a8a8a', sigla: '??' });
  crachas.clis.claude.sigla = 'XX';
  assert.equal(classificador.crachaDaCli('claude').sigla, 'CL');
});

test('validação rejeita id de cargo, regex e cor inválidos', () => {
  assert.equal(validarConfigCargos({ versao: 1, padrao: 'advogado', cargos: [{ id: 'rei', padroes: ['x'] }] }).ok, false);
  assert.equal(validarConfigCargos({ versao: 1, padrao: 'advogado', cargos: [{ id: 'socio', padroes: ['('] }] }).ok, false);
  assert.equal(validarConfigCargos({ versao: 1, padrao: 'advogado', cargos: [], clis: { x: { cor: 'azul', sigla: 'X' } } }).ok, false);
  assert.equal(validarConfigCargos({ versao: 1, padrao: 'junior', cargos: [] }).ok, true);
});

test('carregarCargos cai nas embutidas quando o arquivo é inválido', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edp-'));
  const caminho = join(dir, 'cargos.json');
  writeFileSync(caminho, '{ inválido');
  const erros = [];
  const c = carregarCargos(caminho, { aoErro: (m) => erros.push(m) });
  assert.equal(erros.length, 1);
  assert.equal(c.cargoDoModelo('claude-opus-5'), 'senior');
  writeFileSync(caminho, JSON.stringify({ versao: 1, padrao: 'junior', cargos: [{ id: 'socio', padroes: ['opus'] }] }));
  const c2 = carregarCargos(caminho);
  assert.equal(c2.cargoDoModelo('claude-opus-5'), 'socio');
  assert.equal(c2.cargoDoModelo('claude-fable-5-1'), 'junior');
});
