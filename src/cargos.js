import { readFileSync } from 'node:fs';

export const CARGOS = Object.freeze(['junior', 'socio', 'senior', 'associado', 'advogado']);

// Ordem importa: variantes pequenas (junior) antes das famílias, para gpt-5-mini não virar associado.
export const CARGOS_EMBUTIDOS = Object.freeze({
  versao: 1,
  padrao: 'advogado',
  cargos: [
    // 'mini' usa fronteira de palavra: sem isso, 'gemini' bate como substring e vira junior por engano.
    { id: 'junior', padroes: ['haiku', '\\bmini\\b', 'nano', 'flash-lite', 'local'] },
    { id: 'socio', padroes: ['fable', 'mythos', 'gpt-6', 'astra', 'ultra', 'grok-5'] },
    { id: 'senior', padroes: ['opus', 'gpt-5\\.[4-9]', 'gemini-3.*pro', 'grok-4'] },
    { id: 'associado', padroes: ['sonnet', 'gpt-5', 'gemini.*flash', 'codex'] },
  ],
  clis: {
    claude: { cor: '#c2603e', sigla: 'CL' },
    codex: { cor: '#2e9e5b', sigla: 'CX' },
    gemini: { cor: '#3b7dd8', sigla: 'GM' },
    grok: { cor: '#4a4a4a', sigla: 'GK' },
    cursor: { cor: '#7c4dff', sigla: 'CR' },
    opencode: { cor: '#1fa8a0', sigla: 'OC' },
  },
  cliPadrao: { cor: '#8a8a8a', sigla: '??' },
});

const COR_RE = /^#[0-9a-f]{6}$/i;

export function validarConfigCargos(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, erro: 'config deve ser um objeto' };
  if (obj.versao !== 1) return { ok: false, erro: 'versao deve ser 1' };
  if (!CARGOS.includes(obj.padrao)) return { ok: false, erro: `padrao desconhecido: ${String(obj.padrao)}` };
  if (!Array.isArray(obj.cargos)) return { ok: false, erro: 'cargos deve ser uma lista' };
  const regras = [];
  for (const [i, c] of obj.cargos.entries()) {
    if (!c || !CARGOS.includes(c.id)) return { ok: false, erro: `cargo ${i}: id inválido` };
    if (!Array.isArray(c.padroes) || !c.padroes.length) return { ok: false, erro: `cargo ${i}: padroes vazio` };
    try {
      for (const p of c.padroes) regras.push({ re: new RegExp(p, 'i'), cargo: c.id });
    } catch (e) {
      return { ok: false, erro: `cargo ${i}: regex inválida (${e.message})` };
    }
  }
  // Sem protótipo: os nomes de CLI vêm de fora (config do usuário, rota /hook/<cli>) e não
  // podem alcançar chaves herdadas como constructor ou toString.
  const clis = Object.create(null);
  for (const [nome, v] of Object.entries(obj.clis ?? {})) {
    if (!v || !COR_RE.test(v.cor) || typeof v.sigla !== 'string') return { ok: false, erro: `cli ${nome}: cor ou sigla inválida` };
    clis[nome] = { cor: v.cor, sigla: v.sigla.slice(0, 3) };
  }
  const cliPadrao = obj.cliPadrao && COR_RE.test(obj.cliPadrao.cor)
    ? { cor: obj.cliPadrao.cor, sigla: String(obj.cliPadrao.sigla ?? '??').slice(0, 3) }
    : { cor: '#8a8a8a', sigla: '??' };
  return { ok: true, config: { padrao: obj.padrao, regras, clis, cliPadrao } };
}

export function criarClassificador(config) {
  return {
    cargoDoModelo(modelo) {
      if (typeof modelo !== 'string' || !modelo) return config.padrao;
      const m = modelo.toLowerCase();
      for (const r of config.regras) if (r.re.test(m)) return r.cargo;
      return config.padrao;
    },
    crachaDaCli(cli) {
      return Object.hasOwn(config.clis, cli) ? config.clis[cli] : config.cliPadrao;
    },
    /** Mapa de crachás para o snapshot; cópia, para o cliente não mexer na config. */
    listarCrachas() {
      const clis = {};
      for (const [nome, cracha] of Object.entries(config.clis)) clis[nome] = { ...cracha };
      return { clis, padrao: { ...config.cliPadrao } };
    },
  };
}

export function carregarCargos(caminho, { aoErro = () => {} } = {}) {
  let cfg = validarConfigCargos(CARGOS_EMBUTIDOS).config;
  try {
    const v = validarConfigCargos(JSON.parse(readFileSync(caminho, 'utf8')));
    if (v.ok) cfg = v.config;
    else aoErro(`cargos.json inválido: ${v.erro}; usando regras embutidas`);
  } catch (e) {
    aoErro(`cargos.json ilegível (${e.message}); usando regras embutidas`);
  }
  return criarClassificador(cfg);
}
