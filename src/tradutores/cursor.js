// Tradutor de hooks nativos (command) do Cursor Agent para eventos v1.
// Payload em camelCase; ver seção "Cursor Agent" da spec. Os nomes exatos de campo
// serão fixados pelas fixtures reais da Task 18; até lá aceita grafias alternativas.

import { campo, resumirEntrada, base, evento } from './comum.js';

export function criarTradutorCursor({ agora = () => Date.now() } = {}) {
  return function traduzir(p) {
    if (!p || typeof p !== 'object') return null;
    const b = base(p, 'cursor', agora);
    if (!b.sessao) return null;
    const nome = campo(p, 'hook_event_name', 'hookEventName', 'event');
    const tipoSub = campo(p, 'subagent_type', 'subagentType');
    const idSubBruto = campo(p, 'subagent_id', 'subagentId', 'agent_id', 'agentId') ?? tipoSub;
    let agente;
    if (idSubBruto !== undefined) {
      agente = { id: String(idSubBruto) };
      if (typeof tipoSub === 'string') agente.tipo = tipoSub;
    }
    const nomeFerramenta = String(campo(p, 'tool_name', 'toolName', 'tool') ?? '?');
    const entrada = campo(p, 'tool_input', 'toolInput', 'input');
    const idBruto = campo(p, 'tool_use_id', 'toolUseId', 'tool_call_id', 'toolCallId');
    const idChamada = idBruto === undefined ? undefined : String(idBruto);

    switch (nome) {
      case 'sessionStart':
        return [evento(b, 'sessao.inicio')];
      case 'sessionEnd':
        return [evento(b, 'sessao.fim')];
      case 'beforeSubmitPrompt':
        return [evento(b, 'prompt', { prompt: String(campo(p, 'prompt', 'text', 'message') ?? '') })];
      case 'preToolUse': {
        const ferramenta = { nome: nomeFerramenta };
        const detalhe = resumirEntrada(nomeFerramenta, entrada);
        if (detalhe !== undefined) ferramenta.detalhe = detalhe;
        if (idChamada !== undefined) ferramenta.id = idChamada;
        return [evento(b, 'ferramenta.inicio', { ferramenta, agente })];
      }
      case 'postToolUse':
      case 'postToolUseFailure': {
        const ferramenta = { nome: nomeFerramenta };
        if (idChamada !== undefined) ferramenta.id = idChamada;
        ferramenta.ok = nome === 'postToolUse';
        return [evento(b, 'ferramenta.fim', { ferramenta, agente })];
      }
      case 'subagentStart': {
        if (!agente) return [];
        const descricao = campo(p, 'description', 'prompt');
        if (descricao !== undefined) agente.descricao = descricao;
        return [evento(b, 'subagente.inicio', { agente })];
      }
      case 'subagentStop':
        return agente ? [evento(b, 'subagente.fim', { agente: { id: agente.id } })] : [];
      case 'stop':
        return [evento(b, 'parado')];
      default:
        return null;
    }
  };
}
