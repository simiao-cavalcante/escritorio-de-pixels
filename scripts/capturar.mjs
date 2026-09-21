#!/usr/bin/env node
// Servidor de captura (dev): grava cada POST em test/fixtures/brutos/<cli>/<n>-<evento>.json e responde 204.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lerConfig } from '../src/config.js';

const porta = Number(process.argv[2]) || lerConfig().porta;
const raiz = join(process.cwd(), 'test', 'fixtures', 'brutos');
const contadores = new Map();

// Retoma a numeração do maior arquivo já gravado: reiniciar o capturador não sobrescreve
// as capturas anteriores (antes o contador voltava a 001 e colidia por número + evento).
function ultimoNumero(dir) {
  try {
    return readdirSync(dir).reduce((maior, nome) => Math.max(maior, Number.parseInt(nome, 10) || 0), 0);
  } catch {
    return 0;
  }
}

createServer((req, res) => {
  const m = req.url.match(/^\/hook\/([a-z0-9_-]+)/);
  if (req.method !== 'POST' || !m) {
    res.writeHead(204);
    return res.end();
  }
  const cli = m[1];
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    let evento = 'desconhecido';
    try {
      const p = JSON.parse(corpo);
      evento = String(p.hookEventName ?? p.hook_event_name ?? p.event ?? 'desconhecido').replace(/[^A-Za-z_]/g, '');
    } catch { /* grava assim mesmo */ }
    const dir = join(raiz, cli);
    const n = (contadores.get(cli) ?? ultimoNumero(dir)) + 1;
    contadores.set(cli, n);
    mkdirSync(dir, { recursive: true });
    const arquivo = join(dir, `${String(n).padStart(3, '0')}-${evento}.json`);
    writeFileSync(arquivo, corpo);
    process.stdout.write(`${cli} ${evento} → ${arquivo}\n`);
    res.writeHead(204);
    res.end();
  });
}).listen(porta, '127.0.0.1', () => process.stdout.write(`capturando em http://127.0.0.1:${porta}/hook/<cli> (Ctrl+C para sair)\n`));
