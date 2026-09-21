// Bootstrap: liga fluxo SSE, elenco, render e HUD. Único arquivo que toca em window.

import { criarClienteFluxo, estadoInicial } from './fluxo-cliente.js';
import { criarElenco } from './personagens.js';
import { criarSprites } from './sprites.js';
import { desenharCena, atorEm } from './render.js';
import { criarHud } from './hud.js';
import { escalaDaTela } from './hud-util.js';
import { criarI18n, idiomaDoNavegador, IDIOMAS } from './i18n.js';
import { LARGURA, ALTURA } from './mundo.js';

const CHAVE_IDIOMA = 'escritorio.idioma';
const CHAVE_PAINEL = 'escritorio.painel';

function lerPreferencia(chave, padrao) {
  try {
    const valor = window.localStorage.getItem(chave);
    return valor === null ? padrao : valor;
  } catch {
    return padrao; // navegador anônimo ou storage bloqueado
  }
}

function gravarPreferencia(chave, valor) {
  try {
    window.localStorage.setItem(chave, String(valor));
  } catch {
    /* sem persistência: a sessão segue normal */
  }
}

const tela = document.getElementById('tela');
const ctx = tela.getContext('2d');
ctx.imageSmoothingEnabled = false;

const idiomaSalvo = lerPreferencia(CHAVE_IDIOMA, null);
let i18n = criarI18n(IDIOMAS.includes(idiomaSalvo) ? idiomaSalvo : idiomaDoNavegador(navigator.languages ?? [navigator.language]));
let painelAberto = lerPreferencia(CHAVE_PAINEL, 'aberto') === 'aberto';

const consultaMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
const elenco = criarElenco({ agora: () => Date.now(), reduzirMovimento: consultaMovimento.matches });
consultaMovimento.addEventListener('change', (ev) => elenco.definirMovimentoReduzido(ev.matches));

const sprites = criarSprites({
  buscar: (url) => fetch(url),
  carregarImagem: (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`falhou ao carregar ${url}`));
    img.src = url;
  }),
  avisar: (mensagem) => console.warn(`[escritório] ${mensagem}`),
});
sprites.carregar();

/**
 * Escala o canvas ao espaço livre: sem a barra superior e, com o painel aberto, sem a largura do
 * painel. Pode encolher abaixo de 1 (janela pequena mostra o escritório inteiro, menor).
 */
function ajustarTela() {
  const escala = escalaDaTela({ larguraJanela: window.innerWidth, alturaJanela: window.innerHeight, painelAberto });
  tela.style.width = `${Math.floor(LARGURA * escala)}px`;
  tela.style.height = `${Math.floor(ALTURA * escala)}px`;
}

const hud = criarHud({
  doc: document,
  raiz: document.getElementById('hud'),
  i18n,
  painelAberto,
  aoTrocarIdioma: (novo) => {
    i18n = criarI18n(novo);
    gravarPreferencia(CHAVE_IDIOMA, novo);
    hud.trocarIdioma(i18n);
  },
  aoAlternarPainel: (aberto) => {
    painelAberto = aberto;
    gravarPreferencia(CHAVE_PAINEL, aberto ? 'aberto' : 'fechado');
    ajustarTela(); // o canvas ganha ou perde a largura do painel
  },
  aoSelecionar: (id) => hud.abrirFicha(id),
});

let estado = estadoInicial();
let foraDoMapa = [];

const cliente = criarClienteFluxo({
  criarFonte: () => new EventSource('/fluxo'),
  aoEstado: (novo) => {
    estado = novo;
    const resultado = elenco.sincronizar(estado);
    foraDoMapa = resultado.foraDoMapa;
    hud.atualizar(estado, foraDoMapa);
  },
  aoErro: (mensagem) => console.warn(`[escritório] ${mensagem}`),
});

window.addEventListener('resize', ajustarTela);
ajustarTela();

tela.addEventListener('click', (ev) => {
  const area = tela.getBoundingClientRect();
  const x = ((ev.clientX - area.left) * LARGURA) / area.width;
  const y = ((ev.clientY - area.top) * ALTURA) / area.height;
  const ator = atorEm(elenco.atores(), x, y);
  if (!ator) return;
  hud.abrirFicha(ator.tipo === 'estagiario' ? ator.dono : ator.id);
});

let anterior = performance.now();
function quadro(agora) {
  const dt = Math.min(100, agora - anterior);
  anterior = agora;
  foraDoMapa = elenco.sincronizar(estado).foraDoMapa; // aplica o debounce de sala a cada quadro
  elenco.atualizar(dt);
  desenharCena(ctx, {
    atores: elenco.atores(),
    sprites,
    i18n,
    salas: estado.salas,
    crachas: estado.crachas,
    tempo: agora,
    reduzirMovimento: elenco.movimentoReduzido,
  });
  window.requestAnimationFrame(quadro);
}
window.requestAnimationFrame(quadro);

window.addEventListener('beforeunload', () => cliente.fechar());
