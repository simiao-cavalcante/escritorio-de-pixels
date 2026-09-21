// Roda cada tradutor sobre as fixtures reais capturadas da sua CLI (Task 18).
// As fixtures são anonimizadas por scripts/sanitizar-fixtures.mjs; os brutos não vão para o git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizarLote } from '../src/protocolo.js';
import { detectarEnvelope } from '../src/tradutores/comum.js';
import { criarTradutorClaude } from '../src/tradutores/claude.js';
import { criarTradutorCodex } from '../src/tradutores/codex.js';
import { criarTradutorGrok } from '../src/tradutores/grok.js';
import { criarTradutorCursor } from '../src/tradutores/cursor.js';
import { criarTradutorGemini } from '../src/tradutores/gemini.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const agora = () => Date.parse('2026-09-20T12:00:00Z');
const TRADUTORES = {
  claude: criarTradutorClaude({ agora, semTranscritos: true }),
  codex: criarTradutorCodex({ agora, semTranscritos: true }),
  grok: criarTradutorGrok({ agora }),
  cursor: criarTradutorCursor({ agora }),
  gemini: criarTradutorGemini({ agora }),
};
const ESSENCIAIS = ['sessao.inicio', 'prompt', 'ferramenta.inicio', 'ferramenta.fim', 'parado'];
// O Claude Code só emite SessionStart em sessão interativa: `claude -p` vai direto de
// UserPromptSubmit a Stop/SessionEnd (Task 18). A tradução de SessionStart continua
// coberta por test/tradutores-claude.test.js.
const ESSENCIAIS_POR_CLI = { claude: ESSENCIAIS.filter((tipo) => tipo !== 'sessao.inicio') };
// Motivo do skip quando a CLI está instalada mas não produziu captura.
const SEM_CAPTURA = {
  codex: 'Codex exige confiança interativa nos hooks; fixtures reais pendentes',
  cursor: 'hooks do Cursor não dispararam nesta máquina (formato confere com a skill oficial create-hook; hipótese de shell descartada)',
};

// Fixtures anonimizadas de uma CLI, em ordem estável; pasta ausente ou vazia devolve [].
function fixturesDe(cli) {
  const pasta = join(DIR, cli);
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).filter((n) => n.endsWith('.json')).sort().map((n) => join(pasta, n));
}

// O Gemini CLI não está instalado nesta máquina (nada a capturar): só entra no laço
// se alguém trouxer fixtures dele de outra máquina.
const CLIS = Object.keys(TRADUTORES).filter((cli) => cli !== 'gemini' || fixturesDe(cli).length > 0);

for (const cli of CLIS) {
  test(`fixtures reais de ${cli} traduzem sem rejeições e cobrem os eventos essenciais`, (t) => {
    const arquivos = fixturesDe(cli);
    // Sem captura ainda: o teste fica em skip em vez de passar em silêncio.
    if (arquivos.length === 0) return t.skip(SEM_CAPTURA[cli] ?? `sem fixtures de ${cli}`);
    const tipos = new Set();
    for (const arquivo of arquivos) {
      const payload = JSON.parse(readFileSync(arquivo, 'utf8'));
      const tradutor = detectarEnvelope(payload) === 'grok' ? TRADUTORES.grok : TRADUTORES[cli];
      const eventos = tradutor(payload);
      if (eventos === null) continue;
      const r = normalizarLote(eventos, agora);
      assert.deepEqual(r.rejeitados, [], `${cli}/${basename(arquivo)}`);
      for (const e of r.eventos) tipos.add(e.tipo);
    }
    for (const tipo of ESSENCIAIS_POR_CLI[cli] ?? ESSENCIAIS) assert.ok(tipos.has(tipo), `${cli}: falta ${tipo} nas fixtures (${[...tipos].join(', ')})`);
  });
}
