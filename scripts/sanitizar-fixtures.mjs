#!/usr/bin/env node
// Anonimiza test/fixtures/brutos/<cli>/*.json em test/fixtures/<cli>/*.json: troca o home e o
// nome de usuário por /home/u, os ids de sessão por apelidos estáveis por CLI (claude-1,
// grok-2), redige segredos e e-mails e corta textos longos. O que sai daqui vai para o git.
//
//   node scripts/sanitizar-fixtures.mjs
//
// São duas passadas de propósito: a 1ª coleta os ids de sessão de TODOS os brutos e dá um
// apelido a cada um (semeando pelos apelidos das fixtures já publicadas, para regerar não
// renumerar); a 2ª reescreve os arquivos trocando os ids em qualquer string. Com uma passada
// só, a troca dependia da ordem das chaves e um transcript_path anterior ao session_id saía
// com o UUID real.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';

// turn_id: o Codex manda o id do turno em todo evento, e é um UUID real como os demais.
// Nota: a garantia de apelido só vale para ids declarados sob uma destas chaves; um id que
// apareça solto no meio de um texto (sem estar guardado numa chave de sessão) não é
// reconhecido e sai sem apelido na fixture.
const CHAVES_SESSAO = new Set(['session_id', 'sessionId', 'conversation_id', 'conversationId', 'thread_id', 'promptId', 'prompt_id', 'generation_id', 'turn_id', 'turnId']);

// Padrões que forçam redação: não dá para confiar no corte por tamanho para esconder segredo.
// Lista de negação, não positiva: cobre só os formatos vistos até aqui (chave da OpenAI, da
// xAI, cabeçalho Bearer, e-mail). Token de outro formato (ghp_ do GitHub, AKIA da AWS, AIza
// do Google, bloco PEM) passa batido — a revisão humana da fixture antes do `git add` continua
// obrigatória.
const PROIBIDOS = [
  /sk-[A-Za-z0-9_-]+/g,
  /xai-[A-Za-z0-9_-]+/g,
  /Bearer\s+[^\s"']+/gi,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
];
const REDIGIDO = '[redigido]';
const MAX_TEXTO = 80;
const MAX_ITENS = 5;
// Abaixo disso o id é trocado só quando é o valor inteiro: um "abc" dentro de outra palavra
// não pode virar apelido (substituição cega estraga o resto da fixture).
const MIN_ID_EM_SUBSTRING = 8;

const arquivosJson = (dir) => {
  try {
    return readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }
};

const lerJson = (caminho) => {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return undefined;
  }
};

/** Mapa caminho → valor de cada string guardada sob uma chave de sessão, em qualquer profundidade. */
function sessoesPorCaminho(valor, chave = '', caminho = '', saida = new Map()) {
  if (typeof valor === 'string') {
    if (CHAVES_SESSAO.has(chave) && valor) saida.set(caminho, valor);
  } else if (Array.isArray(valor)) {
    valor.forEach((v, i) => sessoesPorCaminho(v, chave, `${caminho}[${i}]`, saida));
  } else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) sessoesPorCaminho(v, k, `${caminho}.${k}`, saida);
  }
  return saida;
}

// Escapa metacaracteres de regex para usar `usuario` (texto livre) dentro de um RegExp.
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function limparTexto(texto, { home, usuario, apelidos }) {
  let t = texto;
  if (home) t = t.split(home).join('/home/u');
  // O nome de usuário só sai como componente de caminho e com 3+ caracteres: um nome curto
  // ("jo") apareceria dentro de palavras comuns ("jogar").
  if (usuario && usuario.length >= 3) {
    t = t.split(`/Users/${usuario}`).join('/home/u').split(`/home/${usuario}`).join('/home/u');
  }
  // Fora de caminho o nome também vaza (ex.: `ls -l` devolve o dono do arquivo no stdout de
  // uma ferramenta). Troca por limite de palavra, com guarda maior (4+) que a do caminho:
  // um nome de 3 caracteres solto no meio do texto tem chance real de ser palavra comum.
  if (usuario && usuario.length >= 4) {
    t = t.replace(new RegExp(`\\b${escapar(usuario)}\\b`, 'g'), 'u');
  }
  for (const [real, apelido] of apelidos) {
    if (real.length >= MIN_ID_EM_SUBSTRING) t = t.split(real).join(apelido);
    else if (t === real) t = apelido;
  }
  for (const re of PROIBIDOS) t = t.replace(re, REDIGIDO);
  return t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO - 3)}...` : t;
}

function limpar(valor, ctx) {
  if (typeof valor === 'string') return limparTexto(valor, ctx);
  if (Array.isArray(valor)) return valor.slice(0, MAX_ITENS).map((v) => limpar(v, ctx));
  if (valor && typeof valor === 'object') {
    // Object.create(null): um bruto com a chave literal "__proto__" (JSON.parse cria como
    // propriedade própria) não pode, aqui, reatribuir o protótipo de `saida` nem sumir
    // silenciosamente — um `{}` comum faria as duas coisas, dependendo do valor.
    const saida = Object.create(null);
    for (const [k, v] of Object.entries(valor)) saida[k] = limpar(v, ctx);
    return saida;
  }
  return valor;
}

export function sanitizarFixtures({ raiz = process.cwd(), home = homedir(), usuario = userInfo().username, log = () => {} } = {}) {
  const baseBrutos = join(raiz, 'test', 'fixtures', 'brutos');
  const apelidos = new Map(); // id real → apelido; global, para a troca em qualquer string ser única
  const porCli = [];
  if (!existsSync(baseBrutos)) return { arquivos: [], apelidos };

  for (const cli of readdirSync(baseBrutos).sort()) {
    const dirBrutos = join(baseBrutos, cli);
    const dirFixtures = join(raiz, 'test', 'fixtures', cli);
    const brutos = arquivosJson(dirBrutos)
      .map((nome) => ({ nome, json: lerJson(join(dirBrutos, nome)) }))
      .filter((b) => b.json !== undefined);
    if (!brutos.length) continue;
    const usados = new Set();
    // semeia com o apelido que a fixture publicada já usa na mesma posição
    for (const { nome, json } of brutos) {
      const publicado = lerJson(join(dirFixtures, nome));
      if (!publicado) continue;
      const depois = sessoesPorCaminho(publicado);
      for (const [caminho, real] of sessoesPorCaminho(json)) {
        const apelido = depois.get(caminho);
        if (typeof apelido !== 'string' || !apelido || apelidos.has(real)) continue;
        apelidos.set(real, apelido);
        const m = apelido.match(/-(\d+)$/);
        if (m) usados.add(Number(m[1]));
      }
    }
    // batiza o que sobrou, na ordem dos arquivos
    for (const { json } of brutos) {
      for (const real of sessoesPorCaminho(json).values()) {
        if (apelidos.has(real)) continue;
        let n = 1;
        while (usados.has(n)) n += 1;
        usados.add(n);
        apelidos.set(real, `${cli}-${n}`);
      }
    }
    porCli.push({ cli, dirFixtures, brutos });
  }

  const arquivos = [];
  for (const { cli, dirFixtures, brutos } of porCli) {
    mkdirSync(dirFixtures, { recursive: true });
    for (const { nome, json } of brutos) {
      writeFileSync(join(dirFixtures, nome), `${JSON.stringify(limpar(json, { home, usuario, apelidos }), null, 2)}\n`);
      arquivos.push(`${cli}/${nome}`);
      log(`${cli}/${nome}`);
    }
  }
  return { arquivos, apelidos };
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
  const { arquivos } = sanitizarFixtures({ log: (m) => process.stdout.write(`${m}\n`) });
  if (!arquivos.length) {
    process.stderr.write('nada em test/fixtures/brutos\n');
    process.exit(1);
  }
}
