// Tradutor de hooks nativos (http) do Grok CLI para eventos v1.
// Envelope em camelCase; ver seção "Grok CLI" da spec. Sem modelo/tokens (cargo neutro).

import { campo, resumirEntrada, base, evento } from './comum.js';

const PARADO = new Set(['stop', 'stop_failure', 'stop_cancelled']);

export function criarTradutorGrok({ agora = () => Date.now() } = {}) {
  return function traduzir(p) {
    if (!p || typeof p !== 'object') return null;
    const b = base(p, 'grok', agora);
    if (!b.sessao) return null;
    const nome = p.hookEventName;
    const tipoSub = campo(p, 'subagentType', 'agentType');
    const idSubBruto = campo(p, 'agentId', 'subagentId', 'agent_id');
    const agente = tipoSub !== undefined
      ? { id: String(idSubBruto ?? tipoSub), tipo: typeof tipoSub === 'string' ? tipoSub : undefined }
      : undefined;
    const nomeFerramenta = String(campo(p, 'toolName', 'tool_name') ?? '?');
    const idBruto = campo(p, 'toolUseId', 'tool_use_id');
    const idChamada = idBruto === undefined ? undefined : String(idBruto);

    switch (nome) {
      case 'session_start':
        return agente ? [] : [evento(b, 'sessao.inicio', { origem: typeof p.source === 'string' ? p.source : undefined })];
      case 'session_end':
        return agente ? [] : [evento(b, 'sessao.fim')];
      case 'user_prompt_submit':
        return [evento(b, 'prompt', { prompt: String(campo(p, 'prompt', 'userPrompt', 'text') ?? '') })];
      case 'pre_tool_use': {
        const ferramenta = { nome: nomeFerramenta };
        const detalhe = resumirEntrada(nomeFerramenta, campo(p, 'toolInput', 'tool_input'));
        if (detalhe !== undefined) ferramenta.detalhe = detalhe;
        if (idChamada !== undefined) ferramenta.id = idChamada;
        return [evento(b, 'ferramenta.inicio', { ferramenta, agente })];
      }
      case 'post_tool_use':
      case 'post_tool_use_failure':
      // permission_denied fecha a chamada pendente aberta por pre_tool_use, como falha
      // (spec §7). Sem nome de ferramenta no payload não há chamada para fechar: []
      // (evento reconhecido, nada a emitir), nunca null (não conta como inválido no /saude).
      case 'permission_denied': {
        if (nome === 'permission_denied' && campo(p, 'toolName', 'tool_name') === undefined) return [];
        const ferramenta = { nome: nomeFerramenta };
        if (idChamada !== undefined) ferramenta.id = idChamada;
        ferramenta.ok = nome === 'post_tool_use';
        return [evento(b, 'ferramenta.fim', { ferramenta, agente })];
      }
      case 'subagent_start': {
        if (!agente) return [];
        const descricao = campo(p, 'description', 'prompt');
        if (descricao !== undefined) agente.descricao = descricao;
        return [evento(b, 'subagente.inicio', { agente })];
      }
      case 'subagent_stop':
        return agente ? [evento(b, 'subagente.fim', { agente: { id: agente.id } })] : [];
      case 'notification': {
        const t = campo(p, 'notificationType', 'notification_type', 'type');
        return t === 'permission_prompt' ? [evento(b, 'aguardando', { motivo: 'permissao' })] : [];
      }
      default:
        if (PARADO.has(nome)) return agente ? [] : [evento(b, 'parado')];
        return null;
    }
  };
}
