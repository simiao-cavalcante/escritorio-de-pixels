// Layout fixo do escritório: tiles, salas, postos, móveis e grafo de waypoints.
// Sem DOM: coordenadas em tiles (o desenho multiplica por TILE).

export const TILE = 32;
export const COLUNAS = 30;
export const LINHAS = 18;
export const LARGURA = COLUNAS * TILE; // 960
export const ALTURA = LINHAS * TILE; // 576

const posto = (x, y, sprite, mx = x, my = y - 1) => ({ x, y, movel: sprite ? { sprite, x: mx, y: my } : null });
const movel = (sprite, x, y) => ({ sprite, x, y });

export const SALAS = Object.freeze({
  reunioes: {
    id: 'reunioes', x0: 0, y0: 0, x1: 8, y1: 6, piso: 'piso-madeira', porta: { x: 4, y: 6 },
    postos: [posto(3, 3, null), posto(5, 3, null), posto(4, 2, null), posto(4, 4, null)],
    decoracao: [movel('movel-mesa-reuniao', 4, 3), movel('movel-planta', 1, 1), movel('movel-quadro', 7, 1), movel('movel-cadeira', 1, 5)],
  },
  copa: {
    id: 'copa', x0: 9, y0: 0, x1: 20, y1: 5, piso: 'piso-madeira', porta: { x: 14, y: 5 },
    postos: [posto(12, 3, null), posto(14, 3, null), posto(16, 3, null)],
    decoracao: [movel('movel-cafe', 11, 2), movel('movel-planta', 18, 2), movel('movel-planta', 18, 4), movel('movel-quadro', 10, 1)],
  },
  revisao: {
    id: 'revisao', x0: 21, y0: 0, x1: 29, y1: 6, piso: 'piso-carpete', porta: { x: 25, y: 6 },
    postos: [posto(23, 3, 'movel-mesa'), posto(25, 3, 'movel-mesa'), posto(27, 3, 'movel-mesa')],
    decoracao: [movel('movel-quadro', 22, 1), movel('movel-arquivo', 28, 1), movel('movel-planta', 28, 5)],
  },
  biblioteca: {
    id: 'biblioteca', x0: 0, y0: 9, x1: 6, y1: 17, piso: 'piso-carpete', porta: { x: 6, y: 12 },
    postos: [posto(2, 11, 'movel-mesa'), posto(4, 11, 'movel-mesa'), posto(2, 14, 'movel-mesa'), posto(4, 14, 'movel-mesa')],
    decoracao: [movel('movel-estante', 1, 10), movel('movel-estante', 5, 10), movel('movel-estante', 1, 16), movel('movel-planta', 5, 16)],
  },
  gabinete: {
    id: 'gabinete', x0: 22, y0: 9, x1: 29, y1: 13, piso: 'piso-carpete', porta: { x: 22, y: 11 },
    postos: [posto(23, 11, 'movel-mesa'), posto(24, 11, 'movel-mesa'), posto(26, 11, 'movel-mesa'), posto(27, 11, 'movel-mesa')],
    decoracao: [movel('movel-estante', 28, 10), movel('movel-planta', 28, 12), movel('movel-arquivo', 23, 12)],
  },
  recepcao: {
    id: 'recepcao', x0: 9, y0: 11, x1: 19, y1: 17, piso: 'piso-tapete', porta: { x: 14, y: 11 },
    postos: [
      posto(11, 13, 'movel-balcao'), posto(13, 13, 'movel-balcao'), posto(15, 13, 'movel-balcao'), posto(17, 13, 'movel-balcao'),
      posto(12, 15, 'movel-cadeira', 12, 16), posto(16, 15, 'movel-cadeira', 16, 16),
    ],
    decoracao: [movel('movel-planta', 10, 16), movel('movel-planta', 18, 16), movel('movel-quadro', 10, 12)],
  },
  cartorio: {
    id: 'cartorio', x0: 22, y0: 14, x1: 29, y1: 17, piso: 'piso-carpete', porta: { x: 22, y: 15 },
    postos: [posto(24, 16, 'movel-impressora'), posto(26, 16, 'movel-arquivo'), posto(28, 16, 'movel-balcao')],
    decoracao: [movel('movel-planta', 23, 16)],
  },
});

export const ORDEM_SALAS = Object.freeze(['recepcao', 'biblioteca', 'gabinete', 'revisao', 'cartorio', 'reunioes', 'copa']);

// Nós do grafo de caminhos: portas das salas e junções do corredor (em tiles).
export const NOS = Object.freeze({
  'corr-oeste': { x: 4, y: 8 },
  'ramal-oeste-topo': { x: 7, y: 8 },
  cruz: { x: 14, y: 8 },
  'ramal-leste-topo': { x: 21, y: 8 },
  'corr-leste': { x: 25, y: 8 },
  saguao: { x: 14, y: 10 },
  'ramal-oeste': { x: 7, y: 12 },
  'ramal-leste': { x: 21, y: 11 },
  'ramal-cartorio': { x: 21, y: 15 },
  'porta-reunioes': { x: 4, y: 6 },
  'porta-copa': { x: 14, y: 5 },
  'porta-revisao': { x: 25, y: 6 },
  'porta-biblioteca': { x: 6, y: 12 },
  'porta-recepcao': { x: 14, y: 11 },
  'porta-gabinete': { x: 22, y: 11 },
  'porta-cartorio': { x: 22, y: 15 },
});

export const ARESTAS = Object.freeze([
  ['corr-oeste', 'ramal-oeste-topo'],
  ['ramal-oeste-topo', 'cruz'],
  ['cruz', 'ramal-leste-topo'],
  ['ramal-leste-topo', 'corr-leste'],
  ['corr-oeste', 'porta-reunioes'],
  ['cruz', 'porta-copa'],
  ['corr-leste', 'porta-revisao'],
  ['ramal-oeste-topo', 'ramal-oeste'],
  ['ramal-oeste', 'porta-biblioteca'],
  ['cruz', 'saguao'],
  ['saguao', 'porta-recepcao'],
  ['ramal-leste-topo', 'ramal-leste'],
  ['ramal-leste', 'porta-gabinete'],
  ['ramal-leste', 'ramal-cartorio'],
  ['ramal-cartorio', 'porta-cartorio'],
]);

const VIZINHOS = (() => {
  const mapa = new Map(Object.keys(NOS).map((n) => [n, []]));
  for (const [a, b] of ARESTAS) {
    mapa.get(a).push(b);
    mapa.get(b).push(a);
  }
  return mapa;
})();

/** Nome do nó do grafo que fica na porta da sala. */
export function noDaSala(sala) {
  return `porta-${sala}`;
}

export function salaEm(x, y) {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (const sala of Object.values(SALAS)) {
    if (cx >= sala.x0 && cx <= sala.x1 && cy >= sala.y0 && cy <= sala.y1) return sala.id;
  }
  return null;
}

export function ehPorta(x, y) {
  for (const sala of Object.values(SALAS)) {
    if (sala.porta.x === x && sala.porta.y === y) return true;
  }
  return false;
}

export function ehParede(x, y) {
  const id = salaEm(x, y);
  if (!id) return false;
  const s = SALAS[id];
  const borda = x === s.x0 || x === s.x1 || y === s.y0 || y === s.y1;
  return borda && !ehPorta(x, y);
}

/** Sprite de piso do tile, usado pelo render. */
export function tipoDePiso(x, y) {
  if (ehParede(x, y)) return 'piso-parede';
  if (ehPorta(x, y)) return 'piso-porta';
  const id = salaEm(x, y);
  return id ? SALAS[id].piso : 'piso-madeira';
}

/** Busca em largura no grafo de waypoints. Devolve nomes de nós, inclusive os extremos. */
export function caminhoEntreNos(origem, destino) {
  if (!VIZINHOS.has(origem) || !VIZINHOS.has(destino)) return [];
  if (origem === destino) return [origem];
  const anterior = new Map([[origem, null]]);
  const fila = [origem];
  while (fila.length) {
    const atual = fila.shift();
    for (const vizinho of VIZINHOS.get(atual)) {
      if (anterior.has(vizinho)) continue;
      anterior.set(vizinho, atual);
      if (vizinho === destino) {
        const caminho = [];
        for (let n = destino; n !== null; n = anterior.get(n)) caminho.unshift(n);
        return caminho;
      }
      fila.push(vizinho);
    }
  }
  return [];
}

/** Nó do grafo mais próximo de uma posição livre, para recalcular rota no meio do caminho. */
export function noMaisProximo(x, y) {
  const sala = salaEm(x, y);
  if (sala) return noDaSala(sala); // de dentro da sala, sempre pela própria porta
  let melhor = null;
  let menor = Infinity;
  for (const [nome, p] of Object.entries(NOS)) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < menor) {
      menor = d;
      melhor = nome;
    }
  }
  return melhor;
}

export function postosDaSala(sala) {
  return SALAS[sala]?.postos ?? [];
}

/**
 * Posição em pé junto à porta, para quem não achou posto livre: nunca em cima de posto, móvel ou
 * decoração; percorre o interior livre a partir da porta. Índices consecutivos dão células
 * distintas, da mais perto da porta para a mais longe; esgotada a lista, o índice dá a volta.
 */
export function posicaoJuntoAPorta(sala, indice) {
  const s = SALAS[sala];
  const dentro = s.porta.y === s.y0 ? 1 : s.porta.y === s.y1 ? -1 : 0;
  const lado = dentro === 0 ? (s.porta.x === s.x0 ? 1 : -1) : 0;
  const i = Number.isFinite(indice) && indice > 0 ? Math.trunc(indice) : 0;
  const perto = (a, b, centro) => Math.abs(a - centro) - Math.abs(b - centro) || a - b;

  const ocupados = new Set();
  for (const p of s.postos) {
    ocupados.add(`${p.x},${p.y}`);
    if (p.movel) ocupados.add(`${p.movel.x},${p.movel.y}`);
  }
  for (const m of s.decoracao) ocupados.add(`${m.x},${m.y}`);

  const candidatos = [];
  if (dentro !== 0) {
    // Porta na parede de cima ou de baixo: cada fila (rumo ao fundo) percorre as colunas do interior.
    const colunas = [];
    for (let x = s.x0 + 1; x <= s.x1 - 1; x += 1) colunas.push(x);
    colunas.sort((a, b) => perto(a, b, s.porta.x));
    for (let f = 1; f <= s.y1 - s.y0 - 1; f += 1) {
      const y = s.porta.y + dentro * f;
      for (const x of colunas) if (!ocupados.has(`${x},${y}`)) candidatos.push({ x, y });
    }
  } else {
    // Porta numa parede lateral: cada fila (rumo ao fundo) percorre as linhas do interior.
    const linhas = [];
    for (let y = s.y0 + 1; y <= s.y1 - 1; y += 1) linhas.push(y);
    linhas.sort((a, b) => perto(a, b, s.porta.y));
    for (let f = 1; f <= s.x1 - s.x0 - 1; f += 1) {
      const x = s.porta.x + lado * f;
      for (const y of linhas) if (!ocupados.has(`${x},${y}`)) candidatos.push({ x, y });
    }
  }
  const { x, y } = candidatos[i % candidatos.length];
  return { x, y };
}
