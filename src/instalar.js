import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync, unlinkSync, statSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { comandoCurl, lerConfig, gravarConfig } from './config.js';

export const CLIS = Object.freeze(['claude', 'codex', 'grok', 'cursor', 'gemini']);
const MARCA = '/hook/';

export const EVENTOS_POR_CLI = Object.freeze({
  claude: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'PermissionRequest', 'Notification', 'Stop', 'SessionEnd'],
  codex: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'SubagentStart', 'SubagentStop', 'Stop', 'Interrupt'],
  grok: ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionDenied', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'StopFailure', 'StopCancelled'],
  cursor: ['sessionStart', 'sessionEnd', 'beforeSubmitPrompt', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'subagentStart', 'subagentStop', 'stop'],
  gemini: ['SessionStart', 'SessionEnd', 'BeforeAgent', 'AfterAgent', 'BeforeTool', 'AfterTool', 'AfterModel', 'Notification'],
});

function exigirCli(cli) {
  if (!CLIS.includes(cli)) throw new Error(`cli desconhecida: ${cli} (use ${CLIS.join(', ')})`);
}

export function arquivoDeHooks(cli, home = homedir()) {
  exigirCli(cli);
  switch (cli) {
    case 'claude': return join(home, '.claude', 'settings.json');
    case 'codex': return join(home, '.codex', 'hooks.json');
    case 'grok': return join(home, '.grok', 'hooks', 'escritorio.json');
    case 'cursor': return join(home, '.cursor', 'hooks.json');
    default: return join(home, '.gemini', 'settings.json');
  }
}

function entrada(cli, porta) {
  switch (cli) {
    // command + async: fire-and-forget. Com hook http e o servidor fora do ar, o Claude Code
    // mostra "hook error ECONNREFUSED" a cada chamada de ferramenta. (async ignora timeout.)
    case 'claude': return { type: 'command', command: comandoCurl('claude', porta), async: true };
    // Grok 1.0.34 bloqueia hooks http para http:// (SSRF); usamos command.
    case 'grok': return { type: 'command', command: comandoCurl('grok', porta), timeout: 2 };
    case 'codex': return { type: 'command', command: comandoCurl('codex', porta), timeout: 2 };
    case 'cursor': return { command: comandoCurl('cursor', porta), timeout: 2 };
    default: return { type: 'command', command: comandoCurl('gemini', porta), timeout: 2000 };
  }
}

// só reconhecemos como nosso um hook cuja url/command aponte para o /hook/<cli> local (127.0.0.1
// ou localhost) DESTA cli; um hook de terceiro com "/hook/" numa URL externa, ou local mas de
// outra ferramenta (/hook/observador), não é apagado. A porta não entra na comparação: reinstalar
// em outra porta precisa reconhecer e substituir a entrada anterior (idempotência). Tanto a forma
// antiga (`url`, hook http) quanto a atual (`command`, curl) são reconhecidas.
const LOCAL = /127\.0\.0\.1|localhost/;

export function ehNosso(h, cli) {
  if (!h || typeof h !== 'object' || typeof cli !== 'string' || !cli) return false;
  const marca = `${MARCA}${cli}`;
  const nosso = (s) => typeof s === 'string' && s.includes(marca) && LOCAL.test(s);
  return nosso(h.url) || nosso(h.command);
}

const objeto = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const ehObjetoSimples = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function semNossosGrupos(grupos, cli) {
  return grupos
    .map((g) => (g && Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !ehNosso(h, cli)) } : g))
    .filter((g) => !(g && Array.isArray(g.hooks) && g.hooks.length === 0));
}

export function mesclar(cli, atual, porta) {
  exigirCli(cli);
  const cfg = structuredClone(objeto(atual));
  // "hooks": null é tratado como ausente (o arquivo pode ter sido limpo à mão).
  if (cfg.hooks !== undefined && cfg.hooks !== null && !ehObjetoSimples(cfg.hooks)) {
    throw new Error('hooks não é um objeto; nada foi alterado');
  }
  const nossa = entrada(cli, porta);
  if (cli === 'cursor') cfg.version ??= 1; // antes de "hooks" para a amostra sair { version, hooks }
  cfg.hooks = objeto(cfg.hooks);
  if (cli === 'cursor') {
    for (const ev of EVENTOS_POR_CLI.cursor) {
      const lista = Array.isArray(cfg.hooks[ev]) ? cfg.hooks[ev].filter((h) => !ehNosso(h, cli)) : [];
      lista.push(nossa);
      cfg.hooks[ev] = lista;
    }
    return cfg;
  }
  for (const ev of EVENTOS_POR_CLI[cli]) {
    const grupos = semNossosGrupos(Array.isArray(cfg.hooks[ev]) ? cfg.hooks[ev] : [], cli);
    grupos.push({ hooks: [nossa] });
    cfg.hooks[ev] = grupos;
  }
  return cfg;
}

export function remover(cli, atual) {
  exigirCli(cli);
  const cfg = structuredClone(objeto(atual));
  if (cfg.hooks === undefined || cfg.hooks === null) return cfg;
  if (!ehObjetoSimples(cfg.hooks)) {
    throw new Error('hooks não é um objeto; nada foi alterado');
  }
  for (const ev of Object.keys(cfg.hooks)) {
    const lista = cfg.hooks[ev];
    if (!Array.isArray(lista)) continue;
    const resto = cli === 'cursor' ? lista.filter((h) => !ehNosso(h, cli)) : semNossosGrupos(lista, cli);
    if (resto.length) cfg.hooks[ev] = resto;
    else delete cfg.hooks[ev];
  }
  if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
  return cfg;
}

const carimbo = (agora) => new Date(agora()).toISOString().replace(/[:.]/g, '-');

function lerJson(arquivo) {
  if (!existsSync(arquivo)) return { existe: false, json: {} };
  const texto = readFileSync(arquivo, 'utf8');
  if (!texto.trim()) return { existe: true, json: {} };
  try {
    return { existe: true, json: JSON.parse(texto) };
  } catch {
    throw new Error(`${arquivo} não é JSON válido; nada foi alterado`);
  }
}

function gravarAtomico(arquivo, json, existe, agora) {
  mkdirSync(dirname(arquivo), { recursive: true });
  let backup;
  // preserva o modo do arquivo existente (ex.: settings.json real em 0600); sem isso o
  // temporário sai com a umask padrão (0644) e o renameSync rebaixa a permissão do alvo.
  const modo = existe ? statSync(arquivo).mode & 0o777 : undefined;
  if (existe) {
    backup = `${arquivo}.bak-${carimbo(agora)}`;
    copyFileSync(arquivo, backup);
    chmodSync(backup, modo);
  }
  const tmp = `${arquivo}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(json, null, 2)}\n`, modo !== undefined ? { mode: modo } : undefined);
  if (modo !== undefined) chmodSync(tmp, modo); // vence a umask, writeFileSync sozinho não garante
  renameSync(tmp, arquivo);
  return backup;
}

export function instalar(cli, { home = homedir(), porta, agora = () => Date.now() } = {}) {
  exigirCli(cli);
  const cfg = lerConfig(home);
  const portaFinal = porta ?? cfg.porta;
  const arquivo = arquivoDeHooks(cli, home);
  const { existe, json } = lerJson(arquivo);
  const novo = mesclar(cli, json, portaFinal);
  const alterado = JSON.stringify(novo) !== JSON.stringify(json);
  const backup = alterado ? gravarAtomico(arquivo, novo, existe, agora) : undefined;
  gravarConfig({ ...cfg, porta: portaFinal, portaInstalada: portaFinal }, home);
  return { arquivo, backup, alterado, porta: portaFinal };
}

export function desinstalar(cli, { home = homedir(), agora = () => Date.now() } = {}) {
  exigirCli(cli);
  const arquivo = arquivoDeHooks(cli, home);
  const { existe, json } = lerJson(arquivo);
  if (!existe) return { arquivo, backup: undefined, alterado: false };
  if (cli === 'grok') {
    const backup = `${arquivo}.bak-${carimbo(agora)}`;
    copyFileSync(arquivo, backup);
    unlinkSync(arquivo);
    return { arquivo, backup, alterado: true };
  }
  const novo = remover(cli, json);
  const alterado = JSON.stringify(novo) !== JSON.stringify(json);
  const backup = alterado ? gravarAtomico(arquivo, novo, true, agora) : undefined;
  return { arquivo, backup, alterado };
}
