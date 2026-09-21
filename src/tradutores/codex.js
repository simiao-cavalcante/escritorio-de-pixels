// Tradutor de hooks do Codex CLI para eventos v1; ver seção "Codex CLI" da spec.
// O payload nativo usa o mesmo snake_case do Claude Code, por isso reusa criarTradutorClaude;
// o que muda é a leitura de tokens (rollout JSONL) e os diretórios permitidos.

import { criarTradutorClaude } from './claude.js';
import { dentroDe, lerCauda, linhasJson } from './comum.js';

export const MAX_BYTES_ROLLOUT = 64 * 1024;

/** Lê o fim do rollout JSONL do Codex: último token_count (acumulado) e modelo do turn_context. */
export function lerTokensCodex(caminho, _ultimo, { dirsPermitidos = [], maxBytes = MAX_BYTES_ROLLOUT } = {}) {
  if (typeof caminho !== 'string' || !caminho) return null;
  if (dirsPermitidos.length && !dentroDe(caminho, dirsPermitidos)) return null;
  const texto = lerCauda(caminho, maxBytes);
  if (!texto) return null;
  let info = null;
  let modelo;
  for (const o of linhasJson(texto)) {
    if (o?.type === 'event_msg' && o.payload?.type === 'token_count' && o.payload.info) info = o.payload.info;
    if (o?.type === 'turn_context' && typeof o.payload?.model === 'string') modelo = o.payload.model;
  }
  if (!info) return null;
  const ultimo = info.last_token_usage ?? {};
  const total = info.total_token_usage ?? {};
  const tokens = { contexto: ultimo.input_tokens ?? 0 };
  if (typeof info.model_context_window === 'number') tokens.janela = info.model_context_window;
  if (typeof total.output_tokens === 'number') tokens.saidaTotal = total.output_tokens;
  else if (typeof ultimo.output_tokens === 'number') tokens.saidaIncremento = ultimo.output_tokens;
  return { tokens, ultimoUuid: undefined, parcial: false, modelo };
}

/** Os hooks do Codex usam os mesmos nomes e campos snake_case do Claude Code, com `model` em todo evento. */
export function criarTradutorCodex(opts = {}) {
  return criarTradutorClaude({ cli: 'codex', lerTokens: lerTokensCodex, ...opts });
}
