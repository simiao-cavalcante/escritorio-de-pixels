export const TIPOS = Object.freeze([
  'sessao.inicio', 'sessao.fim', 'prompt', 'ferramenta.inicio', 'ferramenta.fim',
  'subagente.inicio', 'subagente.fim', 'tokens', 'aguardando', 'parado',
]);

export const LIMITES = Object.freeze({
  detalhe: 120, prompt: 200, descricao: 120, sessao: 200, nome: 80,
  corpoEventos: 64 * 1024, corpoHook: 4 * 1024 * 1024,
});

const CLI_RE = /^[a-z0-9_-]{1,32}$/;

export function truncar(texto, max) {
  if (typeof texto !== 'string') return undefined;
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  return `${limpo.slice(0, max - 1)}…`;
}

function textoOpcional(v, max) {
  return typeof v === 'string' && v.length ? truncar(v, max) : undefined;
}

function numeroOpcional(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function normalizarAgente(a) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !a.id) return undefined;
  const agente = { id: truncar(a.id, 120) };
  const tipo = textoOpcional(a.tipo, 60);
  if (tipo) agente.tipo = tipo;
  const descricao = textoOpcional(a.descricao, LIMITES.descricao);
  if (descricao) agente.descricao = descricao;
  return agente;
}

export function normalizarEvento(bruto, agora = () => Date.now()) {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { ok: false, erro: 'evento deve ser um objeto' };
  if (bruto.v !== 1) return { ok: false, erro: 'v deve ser 1' };
  if (!TIPOS.includes(bruto.tipo)) return { ok: false, erro: `tipo desconhecido: ${String(bruto.tipo)}` };
  if (typeof bruto.cli !== 'string' || !CLI_RE.test(bruto.cli)) return { ok: false, erro: 'cli inválido' };
  if (typeof bruto.sessao !== 'string' || !bruto.sessao.length || bruto.sessao.length > LIMITES.sessao) return { ok: false, erro: 'sessao inválida' };

  let ts = new Date(agora()).toISOString();
  if (bruto.ts !== undefined) {
    const d = new Date(bruto.ts);
    if (Number.isNaN(d.getTime())) return { ok: false, erro: 'ts inválido' };
    ts = d.toISOString();
  }

  const evento = { v: 1, tipo: bruto.tipo, cli: bruto.cli, sessao: bruto.sessao, ts };
  if (typeof bruto.cwd === 'string' && bruto.cwd) evento.cwd = bruto.cwd;
  const projeto = textoOpcional(bruto.projeto, 80);
  if (projeto) evento.projeto = projeto;
  const modelo = textoOpcional(bruto.modelo, 80);
  if (modelo) evento.modelo = modelo;

  switch (bruto.tipo) {
    case 'sessao.inicio': {
      const origem = textoOpcional(bruto.origem, 40);
      if (origem) evento.origem = origem;
      break;
    }
    case 'prompt': {
      if (typeof bruto.prompt !== 'string') return { ok: false, erro: 'prompt exige texto' };
      evento.prompt = truncar(bruto.prompt, LIMITES.prompt) ?? '';
      break;
    }
    case 'ferramenta.inicio':
    case 'ferramenta.fim': {
      const f = bruto.ferramenta;
      if (!f || typeof f !== 'object' || typeof f.nome !== 'string' || !f.nome) return { ok: false, erro: 'ferramenta.nome obrigatório' };
      evento.ferramenta = { nome: truncar(f.nome, LIMITES.nome) };
      const detalhe = textoOpcional(f.detalhe, LIMITES.detalhe);
      if (detalhe) evento.ferramenta.detalhe = detalhe;
      const id = textoOpcional(f.id, 120);
      if (id) evento.ferramenta.id = id;
      if (typeof f.ok === 'boolean') evento.ferramenta.ok = f.ok;
      const agente = normalizarAgente(bruto.agente);
      if (agente) evento.agente = agente;
      break;
    }
    case 'subagente.inicio':
    case 'subagente.fim': {
      const agente = normalizarAgente(bruto.agente);
      if (!agente) return { ok: false, erro: 'agente.id obrigatório' };
      evento.agente = agente;
      break;
    }
    case 'tokens': {
      const t = bruto.tokens;
      if (!t || typeof t !== 'object') return { ok: false, erro: 'tokens obrigatório' };
      evento.tokens = {};
      for (const campo of ['contexto', 'janela', 'saidaTotal', 'saidaIncremento']) {
        const n = numeroOpcional(t[campo]);
        if (n !== undefined) evento.tokens[campo] = n;
      }
      if (!Object.keys(evento.tokens).length) return { ok: false, erro: 'tokens sem campos numéricos' };
      break;
    }
    case 'aguardando': {
      const motivo = textoOpcional(bruto.motivo, 40);
      if (motivo) evento.motivo = motivo;
      break;
    }
    default:
      break;
  }
  return { ok: true, evento };
}

export function normalizarLote(corpo, agora) {
  const lista = Array.isArray(corpo) ? corpo : [corpo];
  const eventos = [];
  const rejeitados = [];
  lista.forEach((bruto, indice) => {
    const r = normalizarEvento(bruto, agora);
    if (r.ok) eventos.push(r.evento);
    else rejeitados.push({ indice, erro: r.erro });
  });
  return { eventos, rejeitados };
}
