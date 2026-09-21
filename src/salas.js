import { readFileSync, watch as fsWatch } from 'node:fs';

export const SALAS = Object.freeze(['recepcao', 'biblioteca', 'gabinete', 'revisao', 'cartorio', 'reunioes', 'copa']);
export const FERRAMENTAS_AGENTE = Object.freeze(['Agent', 'Task', 'spawn_subagent']);

export const SALAS_EMBUTIDAS = Object.freeze({
  versao: 1,
  padrao: 'recepcao',
  regras: [
    { sala: 'gabinete', skills: ['proprio-punho', 'material', 'ebook*', 'probook-progrupo'] },
    { sala: 'biblioteca', skills: ['julgado', 'informativo-*', 'find-skills'] },
    { sala: 'revisao', skills: ['code-review', 'security-review', 'simplify', 'codex:rescue'] },
    { sala: 'revisao', agentes: 'review|reviewer|verifier|checker|auditor|rescue' },
    { sala: 'biblioteca', detalhe: { ferramenta: 'Bash', regex: '\\b(rg|grep|find)\\b' } },
    { sala: 'biblioteca', ferramentas: ['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch', 'read_file', 'grep_search', 'grep', 'list_dir', 'codebase_search', 'web_search', 'google_web_search'] },
    { sala: 'gabinete', ferramentas: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch', 'write_file', 'edit_file', 'replace', 'search_replace'] },
    { sala: 'cartorio', ferramentas: ['Bash', 'shell', 'exec_command', 'run_terminal_cmd', 'run_terminal_command', 'run_shell_command'] },
    { sala: 'reunioes', ferramentas: ['Agent', 'Task', 'Workflow', 'SendMessage', 'spawn_subagent'] },
    { sala: 'biblioteca', prefixos: ['mcp__brave-search__', 'mcp__context7__'] },
    { sala: 'reunioes', prefixos: ['mcp__'] },
  ],
});

function globParaRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${esc}$`, 'i');
}

const CHAVES = ['skills', 'agentes', 'detalhe', 'ferramentas', 'prefixos'];

export function validarConfigSalas(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, erro: 'config deve ser um objeto' };
  if (obj.versao !== 1) return { ok: false, erro: 'versao deve ser 1' };
  if (!SALAS.includes(obj.padrao)) return { ok: false, erro: `padrao desconhecido: ${String(obj.padrao)}` };
  if (!Array.isArray(obj.regras)) return { ok: false, erro: 'regras deve ser uma lista' };
  const c = { padrao: obj.padrao, skills: [], agentes: [], detalhe: [], ferramentas: new Map(), prefixos: [] };
  for (const [i, r] of obj.regras.entries()) {
    const onde = `regra ${i}`;
    if (!r || typeof r !== 'object' || !SALAS.includes(r.sala)) return { ok: false, erro: `${onde}: sala inválida` };
    const chaves = CHAVES.filter((k) => r[k] !== undefined);
    if (chaves.length !== 1) return { ok: false, erro: `${onde}: use exatamente um de ${CHAVES.join(', ')}` };
    try {
      if (r.skills !== undefined) {
        if (!Array.isArray(r.skills) || !r.skills.length || !r.skills.every((s) => typeof s === 'string' && s)) throw new Error('skills deve ser lista de textos');
        for (const s of r.skills) c.skills.push({ re: globParaRegex(s), sala: r.sala });
      } else if (r.agentes !== undefined) {
        if (typeof r.agentes !== 'string' || !r.agentes) throw new Error('agentes deve ser regex em texto');
        c.agentes.push({ re: new RegExp(r.agentes, 'i'), sala: r.sala });
      } else if (r.detalhe !== undefined) {
        if (!r.detalhe || typeof r.detalhe.ferramenta !== 'string' || typeof r.detalhe.regex !== 'string') throw new Error('detalhe exige ferramenta e regex');
        c.detalhe.push({ ferramenta: r.detalhe.ferramenta, re: new RegExp(r.detalhe.regex, 'i'), sala: r.sala });
      } else if (r.ferramentas !== undefined) {
        if (!Array.isArray(r.ferramentas) || !r.ferramentas.length) throw new Error('ferramentas deve ser lista');
        for (const f of r.ferramentas) if (!c.ferramentas.has(f)) c.ferramentas.set(f, r.sala);
      } else {
        if (!Array.isArray(r.prefixos) || !r.prefixos.length) throw new Error('prefixos deve ser lista');
        for (const p of r.prefixos) c.prefixos.push({ prefixo: p, sala: r.sala });
      }
    } catch (e) {
      return { ok: false, erro: `${onde}: ${e.message}` };
    }
  }
  // Prefixo mais longo vence; sort estável mantém a ordem do arquivo entre iguais.
  c.prefixos.sort((a, b) => b.prefixo.length - a.prefixo.length);
  return { ok: true, config: c };
}

export function extrairSkill(ferramenta) {
  if (!ferramenta || ferramenta.nome !== 'Skill' || !ferramenta.detalhe) return undefined;
  return ferramenta.detalhe.split(/\s+/)[0];
}

// Regra de agentes: primeira regra de config.agentes cujo regex bate com o tipo do agente.
function salaDoAgente(config, tipo) {
  for (const r of config.agentes) if (r.re.test(tipo)) return r.sala;
  return undefined;
}

export function criarResolvedor(config) {
  function resolverSala(ferramenta) {
    const skill = extrairSkill(ferramenta);
    if (skill) for (const r of config.skills) if (r.re.test(skill)) return r.sala;
    if (FERRAMENTAS_AGENTE.includes(ferramenta.nome) && ferramenta.detalhe) {
      const tipo = ferramenta.detalhe.split(':')[0];
      const sala = salaDoAgente(config, tipo);
      if (sala) return sala;
    }
    if (ferramenta.detalhe) {
      for (const r of config.detalhe) if (r.ferramenta === ferramenta.nome && r.re.test(ferramenta.detalhe)) return r.sala;
    }
    const exata = config.ferramentas.get(ferramenta.nome);
    if (exata) return exata;
    for (const r of config.prefixos) if (ferramenta.nome.startsWith(r.prefixo)) return r.sala;
    return config.padrao;
  }
  function salaInicialEstagiario(tipo) {
    if (tipo) return salaDoAgente(config, tipo) ?? 'reunioes';
    return 'reunioes';
  }
  return { resolverSala, salaInicialEstagiario };
}

export function carregarSalas(caminho, { aoErro = () => {}, watch = true } = {}) {
  let atual = criarResolvedor(validarConfigSalas(SALAS_EMBUTIDAS).config);
  function recarregar() {
    let bruto;
    try {
      bruto = JSON.parse(readFileSync(caminho, 'utf8'));
    } catch (e) {
      aoErro(`salas.json ilegível (${e.message}); mantendo regras anteriores`);
      return false;
    }
    const v = validarConfigSalas(bruto);
    if (!v.ok) {
      aoErro(`salas.json inválido: ${v.erro}; mantendo regras anteriores`);
      return false;
    }
    atual = criarResolvedor(v.config);
    return true;
  }
  recarregar();
  let watcher;
  let timer;
  if (watch) {
    try {
      watcher = fsWatch(caminho, () => {
        clearTimeout(timer);
        timer = setTimeout(recarregar, 300);
      });
    } catch (e) {
      if (e.code !== 'ENOENT') aoErro('não foi possível observar salas.json; recarga automática desligada');
      /* arquivo ausente: segue com as regras embutidas, recarregar() já avisou */
    }
  }
  return {
    resolverSala: (f) => atual.resolverSala(f),
    salaInicialEstagiario: (t) => atual.salaInicialEstagiario(t),
    recarregar,
    fechar: () => { clearTimeout(timer); watcher?.close(); },
  };
}
