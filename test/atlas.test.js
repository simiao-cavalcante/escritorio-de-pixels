import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_ARTE = join(RAIZ, 'public', 'arte');
const CAMINHO_ATLAS = join(DIR_ARTE, 'atlas.json');

const manifesto = JSON.parse(readFileSync(join(RAIZ, 'arte', 'manifesto.json'), 'utf8'));
// Sem arte gerada o projeto continua utilizável (placeholders do cliente): o teste é pulado.
const comArte = existsSync(CAMINHO_ATLAS) ? test : test.skip;

/** Largura e altura do IHDR de um PNG: assinatura nos bytes 1..4 e tamanho nos bytes 16..24. */
function dimensoesPng(caminho) {
  const bytes = readFileSync(caminho);
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', `${caminho} não é um PNG`);
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

test('manifesto da arte tem 27 assets com ids, tamanhos e âncoras válidos', () => {
  const assets = manifesto.assets;
  assert.equal(assets.length, 27);
  assert.equal(new Set(assets.map((a) => a.id)).size, 27);
  for (const a of assets) {
    assert.match(a.id, /^(personagem|movel|piso)-[a-z-]+$/, a.id);
    assert.equal(a.id.split('-')[0], a.categoria, a.id);
    assert.ok(Object.hasOwn(manifesto.preambulos, a.categoria), a.categoria);
    assert.ok(typeof a.prompt === 'string' && a.prompt.length > 20, a.id);
    assert.equal(a.w % 32, 0, a.id);
    assert.ok([32, 48, 64].includes(a.h), a.id);
    assert.equal(typeof a.ancora.x, 'number', a.id);
    assert.equal(typeof a.ancora.y, 'number', a.id);
  }
});

comArte('atlas cobre o manifesto e cada PNG bate com o tamanho declarado', () => {
  const atlas = JSON.parse(readFileSync(CAMINHO_ATLAS, 'utf8'));
  const porId = new Map(manifesto.assets.map((a) => [a.id, a]));
  assert.equal(atlas.length, manifesto.assets.length);
  assert.deepEqual(atlas.map((e) => e.id), [...atlas.map((e) => e.id)].sort());
  for (const entrada of atlas) {
    const asset = porId.get(entrada.id);
    assert.ok(asset, `id fora do manifesto: ${entrada.id}`);
    assert.equal(entrada.arquivo, `${entrada.id}.png`);
    assert.equal(entrada.categoria, asset.categoria, entrada.id);
    assert.equal(entrada.w, asset.w, entrada.id);
    assert.equal(entrada.h, asset.h, entrada.id);
    assert.deepEqual(entrada.ancora, asset.ancora, entrada.id);
    assert.match(entrada.hash, /^[0-9a-f]{12}$/, entrada.id);
    const arquivo = join(DIR_ARTE, entrada.arquivo);
    assert.ok(existsSync(arquivo), `PNG ausente: ${entrada.arquivo}`);
    assert.deepEqual(dimensoesPng(arquivo), { w: entrada.w, h: entrada.h }, entrada.id);
  }
});
