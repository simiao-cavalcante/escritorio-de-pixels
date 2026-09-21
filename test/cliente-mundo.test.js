import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SALAS, ORDEM_SALAS, NOS, ARESTAS, COLUNAS, LINHAS, LARGURA, ALTURA,
  noDaSala, caminhoEntreNos, noMaisProximo, salaEm, ehParede, ehPorta, tipoDePiso, posicaoJuntoAPorta, postosDaSala,
} from '../public/mundo.js';

const IDS = ['recepcao', 'biblioteca', 'gabinete', 'revisao', 'cartorio', 'reunioes', 'copa'];
const POSTOS_ESPERADOS = { recepcao: 6, biblioteca: 4, gabinete: 4, revisao: 3, cartorio: 3, reunioes: 4, copa: 3 };

test('resolução lógica e as sete salas com os ids do contrato', () => {
  assert.equal(LARGURA, 960);
  assert.equal(ALTURA, 576);
  assert.equal(COLUNAS, 30);
  assert.equal(LINHAS, 18);
  assert.deepEqual([...ORDEM_SALAS].sort(), [...IDS].sort());
  assert.deepEqual(Object.keys(SALAS).sort(), [...IDS].sort());
});

test('salas cabem no grid e não se sobrepõem', () => {
  const ocupado = new Map();
  for (const s of Object.values(SALAS)) {
    assert.ok(s.x0 >= 0 && s.x1 < COLUNAS && s.y0 >= 0 && s.y1 < LINHAS, `${s.id} fora do grid`);
    assert.ok(s.x1 - s.x0 >= 3 && s.y1 - s.y0 >= 3, `${s.id} pequena demais`);
    for (let x = s.x0; x <= s.x1; x += 1) {
      for (let y = s.y0; y <= s.y1; y += 1) {
        const chave = `${x},${y}`;
        assert.equal(ocupado.has(chave), false, `${chave} em ${s.id} e ${ocupado.get(chave)}`);
        ocupado.set(chave, s.id);
      }
    }
  }
  // A recepção é a maior sala.
  const area = (s) => (s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1);
  for (const s of Object.values(SALAS)) {
    if (s.id !== 'recepcao') assert.ok(area(SALAS.recepcao) > area(s), `recepcao não é maior que ${s.id}`);
  }
});

test('postos por sala: contagem do plano, dentro do interior e sem sobrepor móveis', () => {
  for (const [id, quantidade] of Object.entries(POSTOS_ESPERADOS)) {
    const s = SALAS[id];
    assert.equal(postosDaSala(id).length, quantidade, `postos de ${id}`);
    const usados = new Set(s.decoracao.map((m) => `${m.x},${m.y}`));
    for (const p of s.postos) {
      assert.ok(p.x > s.x0 && p.x < s.x1 && p.y > s.y0 && p.y < s.y1, `posto de ${id} fora do interior`);
      assert.equal(usados.has(`${p.x},${p.y}`), false, `posto de ${id} em cima de decoração`);
      if (p.movel) {
        assert.ok(p.movel.x > s.x0 && p.movel.x < s.x1 && p.movel.y > s.y0 && p.movel.y < s.y1, `móvel de ${id} fora do interior`);
        assert.match(p.movel.sprite, /^movel-/);
      }
    }
    for (const m of s.decoracao) assert.match(m.sprite, /^movel-/);
  }
});

test('cada porta fica na parede da sala e dá para um tile de corredor', () => {
  for (const s of Object.values(SALAS)) {
    const { x, y } = s.porta;
    const naBorda = x === s.x0 || x === s.x1 || y === s.y0 || y === s.y1;
    assert.ok(naBorda, `porta de ${s.id} não está na parede`);
    assert.equal(ehPorta(x, y), true);
    assert.equal(ehParede(x, y), false);
    const fora = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]
      .filter((p) => salaEm(p.x, p.y) === null);
    assert.ok(fora.length >= 1, `porta de ${s.id} não toca o corredor`);
  }
});

test('tipoDePiso distingue parede, porta, sala e corredor', () => {
  assert.equal(tipoDePiso(0, 0), 'piso-parede');
  assert.equal(tipoDePiso(4, 6), 'piso-porta');
  assert.equal(tipoDePiso(14, 8), 'piso-madeira');
  assert.equal(tipoDePiso(2, 11), 'piso-carpete');
  assert.equal(tipoDePiso(13, 13), 'piso-tapete');
  assert.equal(salaEm(14, 8), null);
  assert.equal(salaEm(13, 13), 'recepcao');
});

test('o grafo liga todas as salas entre si e o caminho começa e termina nas portas', () => {
  for (const [a, b] of ARESTAS) {
    assert.ok(NOS[a], `nó ${a} não existe`);
    assert.ok(NOS[b], `nó ${b} não existe`);
  }
  for (const origem of IDS) {
    for (const destino of IDS) {
      const nomes = caminhoEntreNos(noDaSala(origem), noDaSala(destino));
      if (origem === destino) {
        assert.deepEqual(nomes, [noDaSala(origem)]);
        continue;
      }
      const caminho = nomes.map((n) => ({ ...NOS[n] }));
      assert.ok(caminho.length >= 2, `sem caminho de ${origem} a ${destino}`);
      assert.deepEqual(caminho[0], { ...SALAS[origem].porta });
      assert.deepEqual(caminho.at(-1), { ...SALAS[destino].porta });
      // Cada trecho é reto (só muda um eixo por vez).
      for (let i = 1; i < caminho.length; i += 1) {
        const dx = Math.abs(caminho[i].x - caminho[i - 1].x);
        const dy = Math.abs(caminho[i].y - caminho[i - 1].y);
        assert.ok(dx === 0 || dy === 0, `trecho torto de ${origem} a ${destino}`);
      }
    }
  }
});

test('caminho da biblioteca ao cartório passa pelo cruzamento central', () => {
  const nomes = caminhoEntreNos('porta-biblioteca', 'porta-cartorio');
  assert.deepEqual(nomes, ['porta-biblioteca', 'ramal-oeste', 'ramal-oeste-topo', 'cruz', 'ramal-leste-topo', 'ramal-leste', 'ramal-cartorio', 'porta-cartorio']);
  assert.deepEqual(caminhoEntreNos('cruz', 'cruz'), ['cruz']);
  assert.deepEqual(caminhoEntreNos('cruz', 'inexistente'), []);
});

test('noMaisProximo devolve a porta da própria sala para cada posto', () => {
  for (const id of IDS) {
    for (const p of postosDaSala(id)) {
      assert.equal(noMaisProximo(p.x, p.y), `porta-${id}`, `posto ${p.x},${p.y} de ${id}`);
    }
  }
  assert.equal(noMaisProximo(14, 8), 'cruz');
});

test('posicaoJuntoAPorta fica dentro da sala e varia por índice', () => {
  for (const id of IDS) {
    const s = SALAS[id];
    const vistos = new Set();
    for (let i = 0; i < 3; i += 1) {
      const p = posicaoJuntoAPorta(id, i);
      assert.ok(p.x > s.x0 && p.x < s.x1 && p.y > s.y0 && p.y < s.y1, `${id}: ${p.x},${p.y} fora do interior`);
      vistos.add(`${p.x},${p.y}`);
    }
    assert.ok(vistos.size >= 2, `${id}: posições não se deslocam por índice`);
  }
});

test('posicaoJuntoAPorta percorre só o interior livre: distinta, dentro da sala e fora de posto, móvel e decoração', () => {
  for (const id of IDS) {
    const s = SALAS[id];
    const ocupados = new Set();
    for (const p of s.postos) {
      ocupados.add(`${p.x},${p.y}`);
      if (p.movel) ocupados.add(`${p.movel.x},${p.movel.y}`);
    }
    for (const m of s.decoracao) ocupados.add(`${m.x},${m.y}`);
    const livres = (s.x1 - s.x0 - 1) * (s.y1 - s.y0 - 1) - ocupados.size;
    assert.ok(livres >= 5, `${id}: só ${livres} células livres`);

    const vistos = new Set();
    for (let i = 0; i < livres; i += 1) {
      const p = posicaoJuntoAPorta(id, i);
      const chave = `${p.x},${p.y}`;
      assert.ok(p.x > s.x0 && p.x < s.x1 && p.y > s.y0 && p.y < s.y1, `${id}: ${chave} fora do interior`);
      assert.equal(ocupados.has(chave), false, `${id}: ${chave} em cima de posto, móvel ou decoração`);
      assert.equal(vistos.has(chave), false, `${id}: ${chave} repetida no índice ${i}`);
      vistos.add(chave);
    }
    assert.deepEqual(posicaoJuntoAPorta(id, livres), posicaoJuntoAPorta(id, 0), `${id}: índice não dá a volta ao esgotar o interior livre`);
  }
});

test('móveis de 64 px (mesa, quadro) não se sobrepõem a nenhum outro móvel da sala, com os tamanhos do atlas', () => {
  const atlas = JSON.parse(readFileSync(new URL('../public/arte/atlas.json', import.meta.url), 'utf8'));
  const tamanho = new Map(atlas.map((q) => [q.id, { w: q.w, h: q.h }]));
  // Mesma âncora do render: centro da base do sprite no centro da base do tile.
  const caixa = (m) => {
    const { w, h } = tamanho.get(m.sprite);
    const x = (m.x + 0.5) * 32 - w / 2;
    const y = (m.y + 1) * 32 - h;
    return { sprite: m.sprite, x0: x, x1: x + w, y0: y, y1: y + h, w };
  };
  const cruzam = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  for (const s of Object.values(SALAS)) {
    const moveis = [...s.decoracao, ...s.postos.filter((p) => p.movel).map((p) => p.movel)].map(caixa);
    for (let i = 0; i < moveis.length; i += 1) {
      for (let j = i + 1; j < moveis.length; j += 1) {
        const a = moveis[i];
        const b = moveis[j];
        if (a.w !== 64 && b.w !== 64) continue;
        assert.equal(cruzam(a, b), false, `${s.id}: ${a.sprite} (${a.x0}..${a.x1}) sobrepõe ${b.sprite} (${b.x0}..${b.x1})`);
      }
    }
  }
});
