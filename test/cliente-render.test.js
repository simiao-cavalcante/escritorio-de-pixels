import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desenharCena, atorEm, LARGURA_PERSONAGEM, ALTURA_PERSONAGEM, ESCALA_ESTAGIARIO } from '../public/render.js';
import { criarElenco } from '../public/personagens.js';
import { criarI18n } from '../public/i18n.js';
import { CORES } from '../public/cores.js';
import { TILE, LARGURA, ALTURA, SALAS } from '../public/mundo.js';

/** Contexto 2D falso: registra as chamadas para o teste de fumaça. */
function contextoFalso() {
  const chamadas = [];
  const estilos = [];
  let fillStyleAtual = '';
  let strokeStyleAtual = '';
  const alvo = {
    chamadas,
    estilos,
    canvas: { width: LARGURA, height: ALTURA },
    font: '', textAlign: '', lineWidth: 1,
    textos: () => chamadas.filter((c) => c.nome === 'fillText').map((c) => c.args[0]),
    quantas: (nome) => chamadas.filter((c) => c.nome === nome).length,
  };
  Object.defineProperty(alvo, 'fillStyle', {
    get: () => fillStyleAtual,
    set: (valor) => { fillStyleAtual = valor; estilos.push(valor); },
  });
  Object.defineProperty(alvo, 'strokeStyle', {
    get: () => strokeStyleAtual,
    set: (valor) => { strokeStyleAtual = valor; estilos.push(valor); },
  });
  for (const nome of ['clearRect', 'fillRect', 'strokeRect', 'drawImage', 'fillText', 'beginPath', 'arc', 'fill', 'stroke', 'save', 'restore', 'translate', 'scale', 'moveTo', 'lineTo', 'closePath']) {
    alvo[nome] = (...args) => {
      chamadas.push({ nome, args });
    };
  }
  return alvo;
}

/** Achata CORES recursivamente (Object.values, descendo em objetos aninhados). */
function todasAsCores(valor) {
  if (valor && typeof valor === 'object') return Object.values(valor).flatMap(todasAsCores);
  return [valor];
}

const spritesVazio = { quadro: () => null, temAtlas: false };
const spritesCheio = {
  temAtlas: true,
  quadro: (id) => ({ id, imagem: { id }, w: 32, h: id.startsWith('personagem') ? 48 : 32, ancora: { x: 16, y: id.startsWith('personagem') ? 48 : 32 } }),
};

const advogado = (extra = {}) => ({
  id: 'claude:s1', cli: 'claude', cargo: 'socio', sala: 'gabinete', estado: 'trabalhando',
  projeto: 'escritorio', projetoId: '/casa/escritorio', estagiarios: [], ultimaAtividade: 1,
  atividade: { nome: 'Edit', detalhe: 'src/app.js' }, desatualizado: false, ...extra,
});

function cenaCom(estado, { sprites = spritesVazio, idioma = 'pt-BR', reduzirMovimento = false } = {}) {
  const elenco = criarElenco({ agora: () => 0, reduzirMovimento: true });
  elenco.sincronizar(estado);
  elenco.atualizar(16);
  return {
    elenco,
    cena: {
      atores: elenco.atores(),
      sprites,
      i18n: criarI18n(idioma),
      salas: [
        { id: 'recepcao', rotulo: 'Recepção' }, { id: 'biblioteca', rotulo: 'Biblioteca' },
        { id: 'gabinete', rotulo: 'Gabinete de Redação' }, { id: 'revisao', rotulo: 'Sala de Revisão' },
        { id: 'cartorio', rotulo: 'Cartório' }, { id: 'reunioes', rotulo: 'Sala de Reuniões' }, { id: 'copa', rotulo: 'Copa' },
      ],
      crachas: { clis: { claude: { cor: '#c2603e', sigla: 'CL' } }, padrao: { cor: '#8a8a8a', sigla: '??' } },
      tempo: 0,
      reduzirMovimento,
    },
  };
}

test('sem atlas desenha tudo com placeholders e rotula as sete salas', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado()], estagiarios: [] });
  desenharCena(ctx, cena);
  assert.equal(ctx.quantas('clearRect'), 1);
  assert.equal(ctx.quantas('drawImage'), 0, 'sem atlas não pode chamar drawImage');
  assert.ok(ctx.quantas('fillRect') > 30 * 18, 'deveria pintar todos os tiles');
  assert.equal(ctx.quantas('arc'), 1, 'cabeça do placeholder');
  const textos = ctx.textos();
  for (const rotulo of ['RECEPÇÃO', 'BIBLIOTECA', 'GABINETE DE REDAÇÃO', 'SALA DE REVISÃO', 'CARTÓRIO', 'SALA DE REUNIÕES', 'COPA']) {
    assert.ok(textos.includes(rotulo), `falta o rótulo ${rotulo}`);
  }
  assert.ok(textos.includes('CL'), 'crachá da CLI');
  assert.ok(textos.includes('escritorio'), 'rótulo do projeto');
  assert.ok(textos.includes('Edit · src/app.js'), 'balão da atividade');
});

test('em inglês os rótulos de sala são traduzidos por id', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado()], estagiarios: [] }, { idioma: 'en' });
  desenharCena(ctx, cena);
  const textos = ctx.textos();
  assert.ok(textos.includes('DRAFTING OFFICE'));
  assert.ok(textos.includes('BREAK ROOM'));
  assert.equal(textos.includes('GABINETE DE REDAÇÃO'), false);
});

test('com atlas usa drawImage e não desenha a silhueta', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado()], estagiarios: [] }, { sprites: spritesCheio });
  desenharCena(ctx, cena);
  assert.ok(ctx.quantas('drawImage') > 30 * 18, 'pisos, móveis e personagens pelo atlas');
  assert.equal(ctx.quantas('arc'), 0);
});

test('indicadores por estado e relógio de desatualizado', () => {
  const casos = [['pensando', '…'], ['ocioso', 'zzz'], ['aguardando', '?']];
  for (const [estado, simbolo] of casos) {
    const ctx = contextoFalso();
    const { cena } = cenaCom({ advogados: [advogado({ estado, atividade: null })], estagiarios: [] });
    desenharCena(ctx, cena);
    assert.ok(ctx.textos().includes(simbolo), `falta o indicador de ${estado}`);
  }
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado({ estado: 'trabalhando', desatualizado: true })], estagiarios: [] });
  desenharCena(ctx, cena);
  assert.ok(ctx.textos().includes('⏱'));
});

test('estagiário aparece menor e o desenho não quebra sem projeto nem atividade', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({
    advogados: [advogado({ projeto: null, atividade: null, estado: 'pensando', estagiarios: ['claude:s1:a0'] })],
    estagiarios: [{ id: 'claude:s1:a0', sessao: 's1', tipo: 'pesquisa', estado: 'pensando', sala: 'reunioes', atividade: null, ultimaAtividade: 1 }],
  });
  assert.doesNotThrow(() => desenharCena(ctx, cena));
  assert.equal(cena.atores.length, 2);
  assert.equal(ctx.quantas('arc'), 2);
  assert.equal(ctx.textos().includes('escritorio'), false);
});

test('com movimento reduzido não há balanço: as posições de desenho são inteiras', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({ advogados: [advogado()], estagiarios: [] }, { reduzirMovimento: true });
  for (const ator of cena.atores) {
    ator.fase = 50; // não múltiplo de π·90: sin(fase) seria não-nulo sem o guard
    ator.andando = true;
  }
  desenharCena(ctx, cena);
  const translates = ctx.chamadas.filter((c) => c.nome === 'translate');
  assert.ok(translates.length >= 2);
  for (const t of translates) assert.ok(Number.isInteger(t.args[1]), `translate em y não inteiro: ${t.args[1]}`);

  // Controle: mesma fase e mesmo andando, mas sem reduzirMovimento — o balanço deve aparecer.
  const ctxControle = contextoFalso();
  const { cena: cenaControle } = cenaCom({ advogados: [advogado()], estagiarios: [] }, { reduzirMovimento: false });
  for (const ator of cenaControle.atores) {
    ator.fase = 50;
    ator.andando = true;
  }
  desenharCena(ctxControle, cenaControle);
  const translatesControle = ctxControle.chamadas.filter((c) => c.nome === 'translate');
  assert.ok(
    translatesControle.some((t) => !Number.isInteger(t.args[1])),
    'sem reduzirMovimento deveria haver balanço (posição fracionária)',
  );
});

test('toda cor que o render usa vem de CORES', () => {
  const ctx = contextoFalso();
  // cli sem crachá cadastrado: cai no `padrao` do fixture, que replica CORES.crachaPadrao —
  // a cor de marca por CLI (ex.: '#c2603e' do claude) é dado de fora de render.js, não literal dele.
  const { cena } = cenaCom({ advogados: [advogado({ cli: 'desconhecido' })], estagiarios: [] });
  desenharCena(ctx, cena);
  const permitidas = new Set(todasAsCores(CORES));
  assert.ok(ctx.estilos.length > 0, 'nenhuma cor foi registrada');
  for (const estilo of ctx.estilos) assert.ok(permitidas.has(estilo), `cor fora de CORES: ${estilo}`);
});

test('móvel mais largo que um tile é ancorado pelo centro da base', () => {
  const ctx = contextoFalso();
  const sprites = {
    quadro: (id) => (id === 'movel-mesa' ? { imagem: {}, w: 64, h: 48, ancora: { x: 32, y: 48 } } : null),
  };
  const { cena } = cenaCom({ advogados: [], estagiarios: [] }, { sprites });
  desenharCena(ctx, cena);
  const esperado = [(2 + 0.5) * TILE - 32, (10 + 1) * TILE - 48, 64, 48];
  const daBiblioteca = ctx.chamadas.filter(
    (c) => c.nome === 'drawImage' && c.args.length === 5 && c.args.slice(1).every((v, i) => v === esperado[i]),
  );
  assert.equal(daBiblioteca.length, 1, 'esperava o móvel da biblioteca ancorado pelo centro da base');
});

test('atorEm acerta o retângulo do personagem e devolve null fora dele', () => {
  const { elenco } = cenaCom({ advogados: [advogado()], estagiarios: [] });
  const atores = elenco.atores();
  const ator = atores[0];
  const px = ator.x * TILE + TILE / 2;
  const py = ator.y * TILE + TILE;
  assert.equal(atorEm(atores, px, py - ALTURA_PERSONAGEM / 2)?.id, 'claude:s1');
  assert.equal(atorEm(atores, px + LARGURA_PERSONAGEM, py), null);
  assert.equal(atorEm(atores, SALAS.copa.postos[0].x * TILE, SALAS.copa.postos[0].y * TILE), null);
});

test('estagiário é desenhado com ESCALA_ESTAGIARIO', () => {
  const ctx = contextoFalso();
  const { cena } = cenaCom({
    advogados: [advogado({ estagiarios: ['claude:s1:a0'] })],
    estagiarios: [{ id: 'claude:s1:a0', sessao: 's1', tipo: 'pesquisa', estado: 'pensando', sala: 'reunioes', atividade: null, ultimaAtividade: 1 }],
  }, { sprites: spritesCheio });
  desenharCena(ctx, cena);
  const personagens = ctx.chamadas.filter(
    (c) => c.nome === 'drawImage' && String(c.args[0]?.id ?? '').startsWith('personagem-'),
  );
  assert.equal(personagens.length, 2, 'um advogado e um estagiário desenhados pelo atlas');
  const tamanhos = personagens.map((c) => `${c.args[3]}x${c.args[4]}`).sort();
  assert.deepEqual(tamanhos, [`${32 * ESCALA_ESTAGIARIO}x${48 * ESCALA_ESTAGIARIO}`, '32x48'].sort());
});
