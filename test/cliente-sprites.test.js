import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarSprites, idPersonagem, variacao, hashEstavel, CARGOS_SPRITE } from '../public/sprites.js';

const ATLAS = [
  { id: 'personagem-socio-a', arquivo: 'personagem-socio-a.png', categoria: 'personagem', w: 32, h: 48, ancora: { x: 16, y: 48 }, hash: 'abc' },
  { id: 'movel-mesa', arquivo: 'movel-mesa.png', categoria: 'movel', w: 32, h: 32, ancora: { x: 16, y: 32 }, hash: 'def' },
];

function ambiente({ ok = true, corpo = ATLAS, falhaImagem = null } = {}) {
  const avisos = [];
  const pedidos = [];
  const sprites = criarSprites({
    buscar: async (url) => {
      pedidos.push(url);
      return { ok, status: ok ? 200 : 404, json: async () => corpo };
    },
    carregarImagem: async (url) => {
      pedidos.push(url);
      if (falhaImagem && url.includes(falhaImagem)) throw new Error('404');
      return { url, largura: 32 };
    },
    avisar: (m) => avisos.push(m),
  });
  return { sprites, avisos, pedidos };
}

test('ids de sprite seguem o contrato do atlas', () => {
  assert.deepEqual(CARGOS_SPRITE, ['socio', 'senior', 'associado', 'junior', 'advogado', 'estagiario']);
  for (const cargo of CARGOS_SPRITE) {
    assert.match(idPersonagem(cargo, 'claude:s1'), new RegExp(`^personagem-${cargo}-(a|b)$`));
  }
  assert.match(idPersonagem('rei', 'claude:s1'), /^personagem-advogado-(a|b)$/);
});

test('a variação a/b é estável por id e as duas aparecem', () => {
  assert.equal(variacao('claude:s1'), variacao('claude:s1'));
  assert.equal(hashEstavel('claude:s1'), hashEstavel('claude:s1'));
  const vistas = new Set();
  for (let i = 0; i < 20; i += 1) vistas.add(variacao(`claude:s${i}`));
  assert.deepEqual([...vistas].sort(), ['a', 'b']);
});

test('com atlas: carrega os PNGs e devolve o quadro com âncora', async () => {
  const { sprites, avisos, pedidos } = ambiente();
  assert.equal(await sprites.carregar(), true);
  assert.equal(sprites.temAtlas, true);
  assert.equal(pedidos[0], 'arte/atlas.json');
  assert.ok(pedidos.includes('arte/movel-mesa.png'));
  const q = sprites.quadro('personagem-socio-a');
  assert.equal(q.imagem.url, 'arte/personagem-socio-a.png');
  assert.deepEqual(q.ancora, { x: 16, y: 48 });
  assert.equal(q.h, 48);
  assert.deepEqual(avisos, []);
});

test('sem atlas (404): fica em placeholder e avisa uma única vez', async () => {
  const { sprites, avisos } = ambiente({ ok: false });
  assert.equal(await sprites.carregar(), false);
  assert.equal(sprites.temAtlas, false);
  assert.equal(sprites.quadro('personagem-socio-a'), null);
  assert.equal(sprites.quadro('movel-mesa'), null);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /sem arte em arte\//);
});

test('id que falta no atlas vira placeholder com um aviso só', async () => {
  const { sprites, avisos } = ambiente();
  await sprites.carregar();
  assert.equal(sprites.quadro('movel-impressora'), null);
  assert.equal(sprites.quadro('movel-impressora'), null);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /movel-impressora/);
});

test('PNG quebrado no meio do lote não derruba os outros', async () => {
  const { sprites, avisos } = ambiente({ falhaImagem: 'movel-mesa' });
  assert.equal(await sprites.carregar(), true);
  assert.ok(sprites.quadro('personagem-socio-a'));
  assert.equal(sprites.quadro('movel-mesa'), null);
  assert.equal(sprites.quadro('movel-mesa'), null);
  assert.match(avisos[0], /movel-mesa não carregou/);
  assert.equal(avisos.length, 2, 'um aviso do PNG que falhou e um do quadro ausente, sem repetir');
});

test('atlas com JSON que não é lista cai no placeholder', async () => {
  const { sprites, avisos } = ambiente({ corpo: { versao: 1 } });
  assert.equal(await sprites.carregar(), false);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /não é uma lista/);
});
