// Tradutor de hooks do Claude Code (e, via `cli: 'codex'`, do Codex CLI) para eventos v1.
// Payload nativo em snake_case; ver seção "Claude Code" da spec.

import { campo, resumirEntrada, base, evento, dentroDe, lerCauda, linhasJson } from './comum.js';

export const MAX_BYTES_TRANSCRITO = 64 * 1024;

const NOTIFICACOES_ESPERA = {
  permission_prompt: 'permissao',
  idle_prompt: 'pergunta',
  agent_needs_input: 'pergunta',
  elicitation_dialog: 'pergunta',
};

/**
 * Lê o fim do transcrito JSONL do Claude Code (formato interno, melhor esforço).
 * contexto = tamanho do contexto da última mensagem de assistente;
 * saidaIncremento = soma de output_tokens das mensagens após `ultimoUuid`.
 */
export function lerTokensClaude(caminho, ultimoUuid, { dirsPermitidos = [], maxBytes = MAX_BYTES_TRANSCRITO } = {}) {
  if (typeof caminho !== 'string' || !caminho) return null;
  if (dirsPermitidos.length && !dentroDe(caminho, dirsPermitidos)) return null;
  const texto = lerCauda(caminho, maxBytes);
  if (!texto) return null;
  const entradas = linhasJson(texto).filter((o) => o?.type === 'assistant' && o.message?.usage && typeof o.uuid === 'string');
  if (!entradas.length) return null;
  const idx = ultimoUuid ? entradas.findIndex((e) => e.uuid === ultimoUuid) : -1;
  const novas = entradas.slice(idx + 1);
  const ultima = entradas.at(-1);
  const u = ultima.message.usage;
  const contexto = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  const saidaIncremento = novas.reduce((s, e) => s + (e.message.usage.output_tokens ?? 0), 0);
  return {
    tokens: { contexto, saidaIncremento },
    ultimoUuid: ultima.uuid,
    parcial: Boolean(ultimoUuid) && idx === -1,
    modelo: typeof ultima.message.model === 'string' ? ultima.message.model : undefined,
  };
}

export function criarTradutorClaude({ cli = 'claude', agora = () => Date.now(), lerTokens = lerTokensClaude, dirsPermitidos = [], semTranscritos = false } = {}) {
  const ultimos = new Map();
  return function traduzir(p) {
    if (!p || typeof p !== 'object') return null;
    const b = base(p, cli, agora);
    if (!b.sessao) return null;
    const nome = p.hook_event_name;
    const idAgente = campo(p, 'agent_id', 'agentId');
    const tipoAgente = campo(p, 'agent_type', 'agentType');
    const agente = idAgente !== undefined ? { id: String(idAgente) } : undefined;
    if (agente && typeof tipoAgente === 'string') agente.tipo = tipoAgente;
    const nomeFerramenta = String(campo(p, 'tool_name') ?? '?');
    const idBruto = campo(p, 'tool_use_id', 'toolUseId', 'call_id');
    const idChamada = idBruto === undefined ? undefined : String(idBruto);

    switch (nome) {
      case 'SessionStart':
        return agente ? [] : [evento(b, 'sessao.inicio', { origem: typeof p.source === 'string' ? p.source : undefined })];
      case 'SessionEnd':
        return agente ? [] : [evento(b, 'sessao.fim')];
      case 'UserPromptSubmit':
        return [evento(b, 'prompt', { prompt: typeof p.prompt === 'string' ? p.prompt : '' })];
      case 'PreToolUse':
        return [evento(b, 'ferramenta.inicio', {
          ferramenta: { nome: nomeFerramenta, detalhe: resumirEntrada(nomeFerramenta, p.tool_input), id: idChamada },
          agente,
        })];
      case 'PostToolUse':
      case 'PostToolUseFailure':
        return [evento(b, 'ferramenta.fim', { ferramenta: { nome: nomeFerramenta, id: idChamada, ok: nome === 'PostToolUse' }, agente })];
      case 'SubagentStart': {
        if (!agente) return [];
        const descricao = typeof p.description === 'string' ? p.description : undefined;
        if (descricao !== undefined) agente.descricao = descricao;
        return [evento(b, 'subagente.inicio', { agente })];
      }
      case 'SubagentStop':
        return agente ? [evento(b, 'subagente.fim', { agente: { id: agente.id } })] : [];
      case 'PermissionRequest':
        return [evento(b, 'aguardando', { motivo: 'permissao' })];
      case 'Notification': {
        const t = campo(p, 'notification_type', 'type');
        return NOTIFICACOES_ESPERA[t] ? [evento(b, 'aguardando', { motivo: NOTIFICACOES_ESPERA[t] })] : [];
      }
      case 'Stop':
      case 'StopFailure':
      case 'Interrupt':
      case 'StopCancelled': {
        if (agente) return [];
        const saida = [evento(b, 'parado')];
        if (!semTranscritos && typeof p.transcript_path === 'string') {
          let r = null;
          try {
            r = lerTokens(p.transcript_path, ultimos.get(b.sessao), { dirsPermitidos });
          } catch {
            r = null;
          }
          if (r) {
            ultimos.set(b.sessao, r.ultimoUuid);
            saida.push(evento(b, 'tokens', { tokens: r.tokens, modelo: r.modelo }));
          }
        }
        return saida;
      }
      default:
        return null;
    }
  };
}
