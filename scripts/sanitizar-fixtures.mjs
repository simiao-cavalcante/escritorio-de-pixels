#!/usr/bin/env node
// Anonimiza test/fixtures/brutos/<cli>/*.json em test/fixtures/<cli>/*.json:
// troca o home por /home/u, ids de sessão por valores estáveis, corta textos longos.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, userInfo } from 'node:os';

const brutos = join(process.cwd(), 'test', 'fixtures', 'brutos');
const home = homedir();
// O nome de usuário aparece fora do home também (ex.: saída de `ls -l`), e o id de sessão
// real sobrevive dentro de caminhos (transcript_path); os dois saem de qualquer texto.
const usuario = userInfo().username;
const ids = new Map();
const idEstavel = (v) => {
  if (!ids.has(v)) ids.set(v, `sessao-${ids.size + 1}`);
  return ids.get(v);
};
const CHAVES_SESSAO = new Set(['session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id', 'promptId', 'prompt_id', 'generation_id']);

function limpar(valor, chave) {
  if (typeof valor === 'string') {
    if (CHAVES_SESSAO.has(chave)) return idEstavel(valor);
    let s = valor.split(home).join('/home/u');
    if (usuario) s = s.split(usuario).join('u');
    for (const [real, apelido] of ids) s = s.split(real).join(apelido);
    if (s.length > 80) s = `${s.slice(0, 77)}...`;
    return s;
  }
  if (Array.isArray(valor)) return valor.slice(0, 5).map((v) => limpar(v, chave));
  if (valor && typeof valor === 'object') {
    const saida = {};
    for (const [k, v] of Object.entries(valor)) saida[k] = limpar(v, k);
    return saida;
  }
  return valor;
}

if (!existsSync(brutos)) {
  process.stderr.write('nada em test/fixtures/brutos\n');
  process.exit(1);
}
for (const cli of readdirSync(brutos)) {
  const destino = join(process.cwd(), 'test', 'fixtures', cli);
  mkdirSync(destino, { recursive: true });
  for (const nome of readdirSync(join(brutos, cli)).filter((n) => n.endsWith('.json'))) {
    let json;
    try {
      json = JSON.parse(readFileSync(join(brutos, cli, nome), 'utf8'));
    } catch {
      continue;
    }
    writeFileSync(join(destino, nome), `${JSON.stringify(limpar(json, ''), null, 2)}\n`);
    process.stdout.write(`${cli}/${nome}\n`);
  }
}
