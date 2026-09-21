import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';

export const PORTA_PADRAO = 7777;

export function caminhoConfig(home = homedir()) {
  return join(home, '.escritorio-de-pixels', 'config.json');
}

export function lerConfig(home = homedir()) {
  try {
    const bruto = JSON.parse(readFileSync(caminhoConfig(home), 'utf8'));
    return {
      porta: Number.isInteger(bruto.porta) ? bruto.porta : PORTA_PADRAO,
      portaInstalada: Number.isInteger(bruto.portaInstalada) ? bruto.portaInstalada : undefined,
    };
  } catch {
    return { porta: PORTA_PADRAO, portaInstalada: undefined };
  }
}

export function gravarConfig(config, home = homedir()) {
  const caminho = caminhoConfig(home);
  mkdirSync(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(tmp, caminho);
}

export function urlHook(cli, porta) {
  return `http://127.0.0.1:${porta}/hook/${cli}`;
}

/** Comando para hooks do tipo command: nunca bloqueia (timeout 2 s) e nunca falha (|| true). */
export function comandoCurl(cli, porta) {
  return `curl -s -m 2 -X POST -H 'content-type: application/json' --data-binary @- ${urlHook(cli, porta)} >/dev/null 2>&1 || true`;
}

/** Diretórios de onde cada tradutor pode ler transcritos (seção 10 da spec). */
export function dirsTranscritos(home = homedir()) {
  return {
    claude: [join(home, '.claude', 'projects')],
    codex: [join(home, '.codex', 'sessions'), join(home, '.codex', 'archived_sessions')],
  };
}
