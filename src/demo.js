/** Gerador determinístico (LCG) para a demo ser reprodutível em testes e capturas. */
export function criarRng(semente = 42) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Casos fictícios: nenhum nome real, nenhum processo real.
export const ROTEIROS = Object.freeze([
  {
    cli: 'claude', sessao: 'demo-claude', modelo: 'claude-fable-5-1', cwd: '/demo/execucao-fiscal',
    prompt: 'Minutar contestação em execução fiscal de IPTU (caso fictício)',
    passos: [['Read', 'peticao-inicial.md'], ['Grep', 'prescrição'], ['WebSearch', 'prescrição intercorrente execução fiscal STJ'], ['Agent', 'Explore: levantar precedentes do STJ'], ['Write', 'contestacao.md'], ['Edit', 'contestacao.md'], ['Bash', 'git commit -m "minuta"']],
  },
  {
    cli: 'codex', sessao: 'demo-codex', modelo: 'gpt-6-astra', cwd: '/demo/parecer-licitacao',
    prompt: 'Revisar parecer sobre dispensa de licitação (caso fictício)',
    passos: [['read_file', 'parecer.md'], ['shell', 'rg "art. 75" parecer.md'], ['apply_patch', 'parecer.md'], ['shell', 'npm test']],
  },
  {
    cli: 'grok', sessao: 'demo-grok', modelo: 'grok-4', cwd: '/demo/recurso-trabalhista',
    prompt: 'Pesquisar jurisprudência do TST sobre horas in itinere (caso fictício)',
    passos: [['web_search', 'horas in itinere TST 2026'], ['read_file', 'acordao.txt'], ['search_replace', 'recurso.md']],
  },
  {
    cli: 'cursor', sessao: 'demo-cursor', modelo: 'claude-sonnet-5', cwd: '/demo/contrato-locacao',
    prompt: 'Ajustar cláusula de reajuste do contrato (caso fictício)',
    passos: [['Read', 'contrato.md'], ['Write', 'contrato.md'], ['Shell', 'git diff']],
  },
  {
    cli: 'gemini', sessao: 'demo-gemini', modelo: 'gemini-3-pro', cwd: '/demo/mandado-seguranca',
    prompt: 'Elaborar impetração de mandado de segurança (caso fictício)',
    passos: [['google_web_search', 'prazo decadencial mandado de segurança'], ['read_file', 'ato-coator.md'], ['write_file', 'ms.md']],
  },
]);

export function iniciarDemo(ingerir, { agora = () => Date.now(), intervaloMs = 1500, rng = criarRng(7), setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  const cursores = ROTEIROS.map((roteiro, i) => ({ roteiro, fase: 'inicio', indice: 0, espera: i * 2, subagentes: 0, agente: undefined }));
  const base = (r) => ({ v: 1, cli: r.cli, sessao: r.sessao, cwd: r.cwd, modelo: r.modelo, ts: new Date(agora()).toISOString() });

  function passo() {
    const lote = [];
    for (const c of cursores) {
      if (c.espera > 0) {
        c.espera -= 1;
        continue;
      }
      const r = c.roteiro;
      const b = base(r);
      if (c.fase === 'inicio') {
        lote.push({ ...b, tipo: 'sessao.inicio', origem: 'demo' });
        c.fase = 'prompt';
      } else if (c.fase === 'prompt') {
        lote.push({ ...b, tipo: 'prompt', prompt: r.prompt });
        c.fase = 'ferramenta';
        c.indice = 0;
      } else if (c.fase === 'ferramenta') {
        const [nome, detalhe] = r.passos[c.indice];
        lote.push({ ...b, tipo: 'ferramenta.inicio', ferramenta: { nome, detalhe, id: `${r.sessao}-${c.indice}` } });
        if (nome === 'Agent') {
          c.subagentes += 1;
          const id = `${r.sessao}-ag${c.subagentes}`;
          lote.push({ ...b, tipo: 'subagente.inicio', agente: { id, tipo: 'Explore', descricao: detalhe } });
          lote.push({ ...b, tipo: 'ferramenta.inicio', ferramenta: { nome: 'Grep', detalhe: 'precedentes', id: `${id}-t` }, agente: { id } });
          c.agente = id;
        }
        c.fase = 'fim';
        c.espera = 1 + Math.floor(rng() * 3);
      } else if (c.fase === 'fim') {
        const [nome] = r.passos[c.indice];
        if (c.agente) {
          lote.push({ ...b, tipo: 'ferramenta.fim', ferramenta: { nome: 'Grep', id: `${c.agente}-t`, ok: true }, agente: { id: c.agente } });
          lote.push({ ...b, tipo: 'subagente.fim', agente: { id: c.agente } });
          c.agente = undefined;
        }
        lote.push({ ...b, tipo: 'ferramenta.fim', ferramenta: { nome, id: `${r.sessao}-${c.indice}`, ok: true } });
        c.indice += 1;
        if (c.indice >= r.passos.length) {
          lote.push({ ...b, tipo: 'tokens', tokens: { contexto: 40_000 + Math.floor(rng() * 90_000), janela: 200_000, saidaIncremento: 500 + Math.floor(rng() * 2000) } });
          lote.push({ ...b, tipo: 'parado' });
          c.fase = 'prompt';
          c.espera = 4 + Math.floor(rng() * 6);
        } else {
          c.fase = 'ferramenta';
        }
      }
    }
    if (lote.length) ingerir(lote, 'demo');
    return lote;
  }

  const timer = setIntervalFn(passo, intervaloMs);
  return { passo, parar: () => clearIntervalFn(timer) };
}
