// Utilitários compartilhados pelos tradutores de hooks (Tasks 9 a 13).
// Cada tradutor converte o payload nativo de um CLI em eventos v1 brutos,
// que depois passam por `normalizarLote` de `src/protocolo.js`.

import { openSync, readSync, fstatSync, closeSync, realpathSync } from 'node:fs';
import { sep } from 'node:path';

// Distingue a "grafia" do payload recebido: grok manda hookEventName (camel)
// junto com hook_event_name (snake); os demais mandam só um dos dois formatos.
export function detectarEnvelope(p) {
  if (!p || typeof p !== 'object') return 'invalido';
  if (typeof p.hookEventName === 'string') return 'grok';
  if (typeof p.hook_event_name === 'string') return 'snake';
  return 'camel';
}

// Devolve o primeiro valor definido (não undefined/null/'') dentre os nomes de campo dados.
export function campo(p, ...nomes) {
  if (!p || typeof p !== 'object') return undefined;
  for (const n of nomes) {
    const v = p[n];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

const AGENTES = ['Agent', 'Task', 'spawn_subagent'];
const CHAVES_DETALHE = ['file_path', 'filePath', 'path', 'notebook_path', 'command', 'cmd', 'query', 'pattern', 'url', 'description', 'prompt', 'skill', 'name'];

// Resume a entrada de uma ferramenta em um texto curto, para exibição.
export function resumirEntrada(nome, entrada) {
  if (typeof entrada === 'string') return entrada;
  if (!entrada || typeof entrada !== 'object') return undefined;
  const texto = (x) => (typeof x === 'string' && x ? x : undefined);
  if (nome === 'Skill') return [texto(entrada.skill), texto(entrada.args)].filter(Boolean).join(' ') || undefined;
  if (AGENTES.includes(nome)) {
    const tipo = texto(campo(entrada, 'subagent_type', 'subagentType', 'agent_type', 'type'));
    const desc = texto(campo(entrada, 'description', 'prompt'));
    return [tipo, desc].filter(Boolean).join(': ') || undefined;
  }
  for (const k of CHAVES_DETALHE) if (texto(entrada[k])) return entrada[k];
  try {
    return JSON.stringify(entrada);
  } catch {
    return undefined;
  }
}

// Monta os campos comuns de um evento v1 a partir do payload nativo do CLI.
export function base(p, cli, agora = () => Date.now()) {
  const sessaoBruta = campo(p, 'session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id');
  const sessao = sessaoBruta === undefined ? undefined : String(sessaoBruta);
  let cwd = campo(p, 'cwd', 'workspaceRoot', 'workspace_root');
  const raizes = campo(p, 'workspace_roots', 'workspaceRoots');
  if (!cwd && Array.isArray(raizes) && typeof raizes[0] === 'string') cwd = raizes[0];
  const bruto = campo(p, 'timestamp', 'ts');
  const data = bruto === undefined ? new Date(agora()) : new Date(bruto);
  const ts = Number.isNaN(data.getTime()) ? new Date(agora()).toISOString() : data.toISOString();
  const b = { v: 1, cli, sessao, ts };
  if (typeof cwd === 'string' && cwd) b.cwd = cwd;
  const modelo = campo(p, 'model', 'modelo');
  if (typeof modelo === 'string') b.modelo = modelo;
  return b;
}

// Combina a base com o tipo e os campos extras, descartando os que forem undefined.
export function evento(b, tipo, extra = {}) {
  const e = { ...b, tipo };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) e[k] = v;
  return e;
}

// Cria um filtro de deduplicação: eventos "iguais" (mesmo cli/sessão/tipo/ferramenta/agente)
// dentro da mesma janela de tempo (por ts, truncado ao segundo) são descartados.
export function criarDeduplicador({ agora = () => Date.now(), janelaMs = 2000 } = {}) {
  const vistos = new Map();
  return function inedito(ev) {
    const t = agora();
    for (const [k, v] of vistos) if (t - v > janelaMs) vistos.delete(k);
    const seg = Math.floor(new Date(ev.ts).getTime() / 1000);
    const chave = [ev.cli, ev.sessao, ev.tipo, ev.ferramenta?.id ?? ev.ferramenta?.nome ?? '', ev.agente?.id ?? '', seg].join('|');
    if (vistos.has(chave)) return false;
    vistos.set(chave, t);
    return true;
  };
}

// Confere se `caminho` está dentro de algum dos diretórios permitidos (spec §10),
// resolvendo symlinks e `..` para evitar escape do sandbox de leitura.
export function dentroDe(caminho, dirs) {
  let real;
  try {
    real = realpathSync(caminho);
  } catch {
    return false;
  }
  return dirs.some((d) => {
    let rd;
    try {
      rd = realpathSync(d);
    } catch {
      return false;
    }
    return real === rd || real.startsWith(rd + sep);
  });
}

// Lê no máximo `maxBytes` do fim do arquivo. Quando corta no meio de uma linha,
// descarta a primeira linha (parcial) do trecho lido. Nada é gravado em disco.
export function lerCauda(caminho, maxBytes) {
  let fd;
  try {
    fd = openSync(caminho, 'r');
    const { size } = fstatSync(fd);
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const texto = buf.toString('utf8');
    return len < size ? texto.slice(texto.indexOf('\n') + 1) : texto;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

// Faz parse de um texto linha a linha (JSONL), ignorando linhas vazias e inválidas.
export function linhasJson(texto) {
  const saida = [];
  for (const l of texto.split('\n')) {
    if (!l.trim()) continue;
    try {
      saida.push(JSON.parse(l));
    } catch {
      /* linha parcial ou lixo */
    }
  }
  return saida;
}
