#!/usr/bin/env node
// Servidor de captura (dev): grava cada POST em test/fixtures/brutos/<cli>/<n>-<evento>.json
// e responde 204. Depois passe os brutos por scripts/sanitizar-fixtures.mjs.
//
//   node scripts/capturar.mjs --cwd "$PWD/../projeto-de-teste" [--porta 7777]
//
// ATENÇÃO (privacidade): os brutos são conteúdo REAL de sessão (prompts, caminhos, saídas de
// ferramenta) e nunca vão para o git. ESVAZIE test/fixtures/brutos/<cli>/ antes e depois de
// cada rodada. Use sempre --cwd com a raiz do projeto de teste: payloads de qualquer outra
// sessão sua (outro projeto aberto na mesma CLI) são descartados em vez de gravados.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerConfig } from '../src/config.js';

const CHAVES_CWD = ['cwd', 'workspaceRoot', 'workspace_root'];

export function lerArgsCaptura(argv) {
  const a = { porta: undefined, prefixoCwd: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--porta') {
      a.porta = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--cwd') {
      a.prefixoCwd = argv[i + 1];
      i += 1;
    } else if (/^\d+$/.test(argv[i])) {
      a.porta = Number(argv[i]); // forma antiga: `capturar.mjs 7777`
    }
  }
  return a;
}

// Diretório de trabalho declarado pelo payload, nas grafias das CLIs suportadas.
function cwdDo(p) {
  if (!p || typeof p !== 'object') return undefined;
  for (const k of CHAVES_CWD) if (typeof p[k] === 'string' && p[k]) return p[k];
  const raizes = p.workspace_roots ?? p.workspaceRoots;
  return Array.isArray(raizes) && typeof raizes[0] === 'string' ? raizes[0] : undefined;
}

// Retoma a numeração do maior arquivo já gravado: reiniciar o capturador não sobrescreve
// as capturas anteriores (antes o contador voltava a 001 e colidia por número + evento).
function ultimoNumero(dir) {
  try {
    return readdirSync(dir).reduce((maior, nome) => Math.max(maior, Number.parseInt(nome, 10) || 0), 0);
  } catch {
    return 0;
  }
}

export function criarServidorDeCaptura({ raiz, prefixoCwd, log = (m) => process.stdout.write(`${m}\n`) } = {}) {
  const contadores = new Map();
  if (!prefixoCwd) log('aviso: sem --cwd <prefixo>, TODA sessão que chegar é gravada, inclusive de outros projetos seus');
  return createServer((req, res) => {
    const fim = () => { res.writeHead(204); res.end(); };
    const m = req.url.match(/^\/hook\/([a-z0-9_-]+)/);
    if (req.method !== 'POST' || !m) return fim();
    const cli = m[1];
    let corpo = '';
    req.setEncoding('utf8');
    req.on('error', (e) => log(`erro lendo ${cli}: ${e.message}`));
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      let evento = 'desconhecido';
      let payload;
      try {
        payload = JSON.parse(corpo);
        evento = String(payload.hookEventName ?? payload.hook_event_name ?? payload.event ?? 'desconhecido').replace(/[^A-Za-z_]/g, '');
      } catch { /* grava assim mesmo */ }
      const cwd = cwdDo(payload);
      if (prefixoCwd && !(cwd ?? '').startsWith(prefixoCwd)) {
        log(`${cli} ${evento} descartado (cwd ${cwd ?? 'ausente'} fora de ${prefixoCwd})`);
        return fim();
      }
      const dir = join(raiz, cli);
      const n = (contadores.get(cli) ?? ultimoNumero(dir)) + 1;
      contadores.set(cli, n);
      mkdirSync(dir, { recursive: true });
      const arquivo = join(dir, `${String(n).padStart(3, '0')}-${evento}.json`);
      writeFileSync(arquivo, corpo);
      log(`${cli} ${evento} → ${arquivo}`);
      return fim();
    });
    return undefined;
  });
}

// Compara caminhos reais (não URLs): funciona com espaços no caminho e com links simbólicos.
const ehPrincipal = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (ehPrincipal) {
  const args = lerArgsCaptura(process.argv.slice(2));
  const porta = args.porta ?? lerConfig().porta;
  const raiz = join(process.cwd(), 'test', 'fixtures', 'brutos');
  criarServidorDeCaptura({ raiz, prefixoCwd: args.prefixoCwd })
    .listen(porta, '127.0.0.1', function aoSubir() {
      process.stdout.write(`capturando em http://127.0.0.1:${this.address().port}/hook/<cli> (Ctrl+C para sair)\n`);
      process.stdout.write(`brutos em ${raiz} — esvazie a pasta ao terminar\n`);
    });
}
