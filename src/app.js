import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { homedir } from 'node:os';
import { LIMITES, normalizarLote } from './protocolo.js';
import { carregarSalas } from './salas.js';
import { carregarCargos } from './cargos.js';
import { Escritorio } from './estado.js';
import { criarFluxo } from './fluxo.js';
import { criarDeduplicador, detectarEnvelope } from './tradutores/comum.js';
import { criarTradutorClaude } from './tradutores/claude.js';
import { criarTradutorCodex } from './tradutores/codex.js';
import { criarTradutorGrok } from './tradutores/grok.js';
import { criarTradutorCursor } from './tradutores/cursor.js';
import { criarTradutorGemini } from './tradutores/gemini.js';
import { dirsTranscritos } from './config.js';

const RAIZ_PADRAO = join(dirname(fileURLToPath(import.meta.url)), '..');

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

export const SALAS_ROTULOS = Object.freeze({
  recepcao: 'Recepção', biblioteca: 'Biblioteca', gabinete: 'Gabinete de Redação', revisao: 'Sala de Revisão',
  cartorio: 'Cartório', reunioes: 'Sala de Reuniões', copa: 'Copa',
});

function responder(res, status, json) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(json));
}

/**
 * Lê o corpo até `max` bytes. Acima disso continua drenando e devolve { erro: 413 } para poder
 * responder; se o content-length já declarado exceder o limite, resolve 413 de imediato (sem
 * esperar o upload inteiro); se a requisição fechar no meio do envio, resolve { erro: 400 } em
 * vez de ficar pendente para sempre.
 */
function lerCorpo(req, max) {
  return new Promise((resolve) => {
    let resolvido = false;
    const concluir = (valor) => {
      if (resolvido) return;
      resolvido = true;
      resolve(valor);
    };
    const declarado = Number(req.headers['content-length']);
    let estourou = Number.isFinite(declarado) && declarado > max;
    if (estourou) concluir({ erro: 413 });
    const partes = [];
    let total = 0;
    req.on('data', (c) => {
      if (estourou) return;
      total += c.length;
      if (total > max) {
        estourou = true;
        partes.length = 0;
      } else {
        partes.push(c);
      }
    });
    req.on('end', () => concluir(estourou ? { erro: 413 } : { texto: Buffer.concat(partes).toString('utf8') }));
    req.on('error', () => concluir({ erro: 400 }));
    req.on('close', () => concluir({ erro: 400 }));
  });
}

function limparCli(nome) {
  return String(nome ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'generico';
}

export function criarAplicacao({
  porta = 7777, home = homedir(), raiz = RAIZ_PADRAO, agora = () => Date.now(),
  demo = false, semTranscritos = false, ocultarPrompts = false, log = () => {}, watch = true, tiqueMs = 1000,
} = {}) {
  const salas = carregarSalas(join(raiz, 'salas.json'), { aoErro: log, watch });
  const cargos = carregarCargos(join(raiz, 'cargos.json'), { aoErro: log });
  const escritorio = new Escritorio({
    agora, resolverSala: salas.resolverSala, salaInicialEstagiario: salas.salaInicialEstagiario, cargoDoModelo: cargos.cargoDoModelo,
  });
  const fluxo = criarFluxo();
  const inedito = criarDeduplicador({ agora });
  const dirs = dirsTranscritos(home);
  const tradutores = {
    claude: criarTradutorClaude({ agora, dirsPermitidos: dirs.claude, semTranscritos }),
    codex: criarTradutorCodex({ agora, dirsPermitidos: dirs.codex, semTranscritos }),
    grok: criarTradutorGrok({ agora }),
    cursor: criarTradutorCursor({ agora }),
    gemini: criarTradutorGemini({ agora }),
  };
  const genericos = new Map();
  // Sem protótipo: nomes de CLI vêm do usuário (rota /hook/<cli>) e não podem poluir Object.prototype
  // nem herdar chaves como __proto__/constructor/toString.
  const saude = Object.create(null);
  const saudeDe = (cli) => (saude[cli] ??= { ultimoEvento: null, eventos: 0, ignorados: 0, invalidos: 0, rejeitadosPorTamanho: 0 });
  const dirPublico = join(raiz, 'public');
  let hostsOk = new Set();
  let origensOk = new Set();
  let timerTique;
  let saudeSuja = false;

  function snapshot() {
    return {
      ...escritorio.snapshot(),
      salas: Object.entries(SALAS_ROTULOS).map(([id, rotulo]) => ({ id, rotulo })),
      saude,
    };
  }

  function transmitirMudancas(mudancas) {
    for (const m of mudancas) {
      if (m.tipo === 'advogado') fluxo.transmitir('advogado', { advogado: m.advogado });
      else if (m.tipo === 'estagiario') fluxo.transmitir('estagiario', { estagiario: m.estagiario });
      else if (m.tipo === 'remover') fluxo.transmitir('remover', { tipo: m.entidade, id: m.id });
    }
  }

  /** Único ponto de entrada de eventos (v1 brutos): oculta prompts, valida, deduplica, aplica e transmite. */
  function ingerir(brutos, origem) {
    let lista = Array.isArray(brutos) ? brutos : [brutos];
    if (ocultarPrompts) {
      lista = lista.map((b) => (b && b.tipo === 'prompt' && typeof b.prompt === 'string'
        ? { ...b, prompt: `Caso em andamento (${b.prompt.length} caracteres)` }
        : b));
    }
    const { eventos, rejeitados } = normalizarLote(lista, agora);
    const s = saudeDe(origem);
    s.invalidos += rejeitados.length;
    saudeSuja = true;
    let aceitos = 0;
    for (const ev of eventos) {
      if (!inedito(ev)) continue;
      transmitirMudancas(escritorio.aplicar(ev));
      aceitos += 1;
      s.eventos += 1;
      s.ultimoEvento = new Date(agora()).toISOString();
    }
    return { aceitos, rejeitados };
  }

  function traduzir(cliRota, payload) {
    if (detectarEnvelope(payload) === 'grok') return { cli: 'grok', eventos: tradutores.grok(payload) };
    // Object.hasOwn (não `tradutores[cliRota]`): cliRota vem do usuário e um objeto literal
    // responde truthy para __proto__ (Object.prototype) e constructor (Object), o que tratava
    // essas rotas como tradutor conhecido e explodia (Object.prototype não é função) ou chamava
    // Object(payload) por engano.
    if (Object.hasOwn(tradutores, cliRota)) return { cli: cliRota, eventos: tradutores[cliRota](payload) };
    let t = genericos.get(cliRota);
    if (!t) {
      t = criarTradutorClaude({ agora, cli: cliRota, semTranscritos: true });
      genericos.set(cliRota, t);
    }
    return { cli: cliRota, eventos: t(payload) };
  }

  async function servirEstatico(caminho, res) {
    const rel = caminho === '/' ? '/index.html' : caminho;
    const alvo = normalize(join(dirPublico, rel));
    if (!alvo.startsWith(dirPublico + sep)) return responder(res, 404, { erro: 'não encontrado' });
    try {
      const dados = await readFile(alvo);
      res.writeHead(200, { 'content-type': TIPOS_MIME[extname(alvo)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(dados);
    } catch {
      responder(res, 404, { erro: 'não encontrado' });
    }
    return undefined;
  }

  async function tratar(req, res) {
    const url = new URL(req.url, 'http://local');
    if (!hostsOk.has(req.headers.host ?? '')) return responder(res, 421, { erro: 'host não permitido' });
    const origem = req.headers.origin;
    if (origem !== undefined && !origensOk.has(origem)) return responder(res, 403, { erro: 'origem não permitida' });

    if (req.method === 'GET') {
      if (url.pathname === '/fluxo') return fluxo.conectar(req, res, snapshot());
      if (url.pathname === '/estado') return responder(res, 200, { seq: fluxo.seq, ...snapshot() });
      if (url.pathname === '/saude') return responder(res, 200, saude);
      return servirEstatico(url.pathname, res);
    }

    if (req.method === 'POST') {
      if (url.pathname === '/eventos') {
        if (demo) return responder(res, 503, { erro: 'modo demo não aceita eventos externos' });
        const corpo = await lerCorpo(req, LIMITES.corpoEventos);
        if (corpo.erro) {
          if (corpo.erro === 413) saudeDe('eventos').rejeitadosPorTamanho += 1;
          return responder(res, corpo.erro, { erro: corpo.erro === 413 ? 'corpo excede 64 KB' : 'corpo inválido' });
        }
        let json;
        try {
          json = JSON.parse(corpo.texto);
        } catch {
          return responder(res, 400, { erro: 'JSON inválido' });
        }
        return responder(res, 202, ingerir(json, 'eventos'));
      }
      const m = url.pathname.match(/^\/hook\/([a-z0-9_-]{1,32})$/);
      if (m) {
        if (demo) return responder(res, 503, { erro: 'modo demo não aceita eventos externos' });
        const cliRota = m[1] === 'generico' ? limparCli(url.searchParams.get('cli')) : m[1];
        const corpo = await lerCorpo(req, LIMITES.corpoHook);
        if (corpo.erro) {
          if (corpo.erro === 413) saudeDe(cliRota).rejeitadosPorTamanho += 1;
          res.writeHead(corpo.erro);
          return res.end();
        }
        let payload;
        try {
          payload = JSON.parse(corpo.texto);
        } catch {
          saudeDe(cliRota).invalidos += 1;
          res.writeHead(204);
          return res.end();
        }
        const { cli, eventos } = traduzir(cliRota, payload);
        if (eventos === null) saudeDe(cli).ignorados += 1;
        else ingerir(eventos, cli);
        res.writeHead(204);
        return res.end();
      }
    }
    return responder(res, 404, { erro: 'rota desconhecida' });
  }

  const servidor = createServer((req, res) => {
    tratar(req, res).catch((e) => {
      log(`erro ao tratar ${req.method} ${req.url}: ${e.message}`);
      if (!res.headersSent) responder(res, 500, { erro: 'erro interno' });
      else res.end();
    });
  });

  function iniciar() {
    return new Promise((resolve, reject) => {
      servidor.once('error', reject);
      servidor.listen(porta, '127.0.0.1', () => {
        const real = servidor.address().port;
        hostsOk = new Set([`127.0.0.1:${real}`, `localhost:${real}`, `[::1]:${real}`]);
        origensOk = new Set([...hostsOk].map((h) => `http://${h}`));
        timerTique = setInterval(() => {
          transmitirMudancas(escritorio.tique());
          if (saudeSuja) {
            fluxo.transmitir('saude', { saude });
            saudeSuja = false;
          }
        }, tiqueMs);
        timerTique.unref();
        resolve(real);
      });
    });
  }

  function fechar() {
    clearInterval(timerTique);
    fluxo.fechar();
    salas.fechar();
    return new Promise((resolve) => {
      servidor.closeAllConnections?.();
      servidor.close(() => resolve());
    });
  }

  return { servidor, escritorio, fluxo, saude, snapshot, ingerir, iniciar, fechar };
}
