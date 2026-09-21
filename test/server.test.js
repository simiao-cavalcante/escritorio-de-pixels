// Cobertura da leitura de argumentos do executável (server.mjs). Importar o módulo não
// sobe servidor nenhum: main() só roda quando o arquivo é o processo principal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerArgs } from '../server.mjs';

const PADRAO = { comando: undefined, cli: undefined, porta: undefined, demo: false, semTranscritos: false, ocultarPrompts: false };

test('lerArgs sem argumentos devolve os padrões', () => {
  assert.deepEqual(lerArgs([]), PADRAO);
});

test('lerArgs lê --porta, --demo, --sem-transcritos e --ocultar-prompts', () => {
  assert.deepEqual(lerArgs(['--porta', '8080', '--demo', '--sem-transcritos', '--ocultar-prompts']), {
    ...PADRAO, porta: 8080, demo: true, semTranscritos: true, ocultarPrompts: true,
  });
  // o valor de --porta é consumido: não é reinterpretado como argumento desconhecido
  assert.deepEqual(lerArgs(['--porta', '7777']), { ...PADRAO, porta: 7777 });
  assert.ok(Number.isNaN(lerArgs(['--porta', 'abc']).porta)); // main() rejeita com "Porta inválida"
});

test('lerArgs lê instalar/desinstalar <cli>, inclusive sem a cli', () => {
  assert.deepEqual(lerArgs(['instalar', 'grok']), { ...PADRAO, comando: 'instalar', cli: 'grok' });
  assert.deepEqual(lerArgs(['desinstalar', 'claude']), { ...PADRAO, comando: 'desinstalar', cli: 'claude' });
  assert.deepEqual(lerArgs(['instalar']), { ...PADRAO, comando: 'instalar', cli: undefined });
  assert.deepEqual(lerArgs(['instalar', 'claude', '--porta', '9000']), { ...PADRAO, comando: 'instalar', cli: 'claude', porta: 9000 });
});

test('lerArgs: --ajuda/-h/--help e argumento desconhecido caem na ajuda', () => {
  for (const a of ['--ajuda', '-h', '--help']) assert.equal(lerArgs([a]).comando, 'ajuda');
  // comportamento atual documentado: qualquer argumento não reconhecido imprime a ajuda
  assert.equal(lerArgs(['--nao-existe']).comando, 'ajuda');
  assert.equal(lerArgs(['fazer-cafe']).comando, 'ajuda');
  // a ajuda vence os comandos quando vem depois deles
  assert.equal(lerArgs(['instalar', 'claude', '--nao-existe']).comando, 'ajuda');
});
