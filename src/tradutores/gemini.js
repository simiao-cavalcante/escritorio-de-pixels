// Tradutor de hooks nativos (command) do Gemini CLI para eventos v1.
// Payload snake_case; ver seção "Gemini CLI" da spec. O Gemini CLI não está instalado
// nesta máquina: o tradutor nasce da documentação (geminicli.com/docs/hooks) com
// fixtures sintéticas. Não testado localmente — ver README (Task 18).

import { campo, resumirEntrada, base, evento } from './comum.js';

export function criarTradutorGemini({ agora = () => Date.now() } = {}) {
  return function traduzir(p) {
    if (!p || typeof p !== 'object') return null;
    const b = base(p, 'gemini', agora);
    if (!b.sessao) return null;
    const nome = p.hook_event_name;
    const nomeFerramenta = String(campo(p, 'tool_name') ?? '?');
    const idBruto = campo(p, 'tool_call_id', 'tool_use_id', 'call_id');
    const idChamada = idBruto === undefined ? undefined : String(idBruto);

    switch (nome) {
      case 'SessionStart':
        return [evento(b, 'sessao.inicio')];
      case 'SessionEnd':
        return [evento(b, 'sessao.fim')];
      case 'BeforeAgent':
        return [evento(b, 'prompt', { prompt: String(campo(p, 'prompt', 'user_prompt', 'message') ?? '') })];
      case 'AfterAgent':
        return [evento(b, 'parado')];
      case 'BeforeTool': {
        const ferramenta = { nome: nomeFerramenta };
        const detalhe = resumirEntrada(nomeFerramenta, p.tool_input);
        if (detalhe !== undefined) ferramenta.detalhe = detalhe;
        if (idChamada !== undefined) ferramenta.id = idChamada;
        return [evento(b, 'ferramenta.inicio', { ferramenta })];
      }
      case 'AfterTool': {
        const ferramenta = { nome: nomeFerramenta, ok: !p.error };
        if (idChamada !== undefined) ferramenta.id = idChamada;
        return [evento(b, 'ferramenta.fim', { ferramenta })];
      }
      case 'AfterModel': {
        const resp = p.llm_response ?? {};
        const req = p.llm_request ?? {};
        const uso = resp.usageMetadata ?? resp.usage_metadata ?? resp.usage ?? {};
        const tokens = {};
        const entrada = campo(uso, 'promptTokenCount', 'prompt_token_count', 'input_tokens');
        const saida = campo(uso, 'candidatesTokenCount', 'candidates_token_count', 'output_tokens');
        if (typeof entrada === 'number') tokens.contexto = entrada;
        if (typeof saida === 'number') tokens.saidaIncremento = saida;
        const modelo = campo(resp, 'model', 'modelVersion') ?? campo(req, 'model');
        if (Object.keys(tokens).length) return [evento(b, 'tokens', { tokens, modelo })];
        if (typeof modelo === 'string') return [evento(b, 'sessao.inicio', { modelo })];
        return [];
      }
      case 'Notification':
        return [evento(b, 'aguardando', { motivo: 'pergunta' })];
      default:
        return null;
    }
  };
}
