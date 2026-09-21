import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncar, agruparPorProjeto, contarPorCli, crachaDe, corDaSaude, linhasDeSaude, formatarTokens, descreverAtividade, estagiariosDe, escalaDaTela, acoesParaFicha, CRACHA_PADRAO, LARGURA_PAINEL, ALTURA_BARRA } from '../public/hud-util.js';
import { CORES } from '../public/cores.js';
import { criarI18n } from '../public/i18n.js';

const i18n = criarI18n('pt-BR');

test('truncar corta com reticências e respeita o limite', () => {
  assert.equal(truncar('curto'), 'curto');
  assert.equal(truncar('a'.repeat(30)), `${'a'.repeat(23)}…`);
  assert.equal(truncar('a'.repeat(30)).length, 24);
  assert.equal(truncar(null), '');
  assert.equal(truncar('abcdef', 3), 'ab…');
});

test('agruparPorProjeto junta por projetoId e desambigua rótulos iguais com o diretório pai', () => {
  const grupos = agruparPorProjeto([
    { id: 'a', projetoId: '/casa/dev/site', projeto: 'site' },
    { id: 'b', projetoId: '/casa/dev/site', projeto: 'site' },
    { id: 'c', projetoId: '/trabalho/cliente/site', projeto: 'site' },
    { id: 'd', projetoId: '/casa/dev/escritorio', projeto: 'escritorio' },
  ]);
  assert.equal(grupos.length, 3);
  assert.deepEqual(grupos.map((g) => g.rotulo), ['dev/site', 'cliente/site', 'escritorio']);
  assert.deepEqual(grupos[0].advogados.map((a) => a.id), ['a', 'b']);
});

test('contarPorCli ordena por quantidade e depois por nome', () => {
  assert.deepEqual(
    contarPorCli([{ cli: 'codex' }, { cli: 'claude' }, { cli: 'claude' }, { cli: 'grok' }]),
    [{ cli: 'claude', quantidade: 2 }, { cli: 'codex', quantidade: 1 }, { cli: 'grok', quantidade: 1 }],
  );
});

test('crachaDe usa o mapa do snapshot e cai no padrão', () => {
  const crachas = { clis: { claude: { cor: '#c2603e', sigla: 'CL' } }, padrao: { cor: '#8a8a8a', sigla: '??' } };
  assert.deepEqual(crachaDe(crachas, 'claude'), { cor: '#c2603e', sigla: 'CL' });
  assert.deepEqual(crachaDe(crachas, 'copilot'), { cor: '#8a8a8a', sigla: '??' });
  assert.deepEqual(crachaDe(null, 'claude'), CRACHA_PADRAO);
});

test('corDaSaude: verde recente, cinza sem eventos ou antigo, vermelho com rejeição', () => {
  const agora = Date.parse('2026-09-21T12:00:00.000Z');
  const iso = (msAtras) => new Date(agora - msAtras).toISOString();
  assert.equal(corDaSaude({ ultimoEvento: iso(60_000), eventos: 3 }, agora), 'verde');
  assert.equal(corDaSaude({ ultimoEvento: iso(10 * 60_000), eventos: 3 }, agora), 'cinza');
  assert.equal(corDaSaude({ ultimoEvento: null, eventos: 0 }, agora), 'cinza');
  assert.equal(corDaSaude({ ultimoEvento: iso(1000), eventos: 3, invalidos: 1 }, agora), 'vermelho');
  assert.equal(corDaSaude({ ultimoEvento: iso(1000), eventos: 3, rejeitadosPorTamanho: 2 }, agora), 'vermelho');
  assert.equal(corDaSaude(undefined, agora), 'cinza');
  const linhas = linhasDeSaude({ grok: { ultimoEvento: null, eventos: 0 }, claude: { ultimoEvento: iso(1000), eventos: 5 } }, agora);
  assert.deepEqual(linhas.map((l) => [l.cli, l.cor]), [['claude', 'verde'], ['grok', 'cinza']]);
});

test('formatarTokens mostra janela, proporção e saída estimada', () => {
  assert.deepEqual(formatarTokens({ contexto: 12400, janela: 200000, saida: 3200, saidaEstimada: true }, i18n), {
    contexto: '12.400 / 200.000', proporcao: 0.062, saida: '≈ 3.200',
  });
  assert.deepEqual(formatarTokens({ contexto: 900, janela: null, saida: 0, saidaEstimada: false }, i18n), {
    contexto: '900 (janela desconhecida)', proporcao: null, saida: null,
  });
  assert.equal(formatarTokens({ contexto: null, janela: null, saida: 0, saidaEstimada: false }, i18n), null);
  assert.equal(formatarTokens(null, i18n), null);
});

test('descreverAtividade junta nome e detalhe truncado', () => {
  assert.equal(descreverAtividade({ nome: 'Read', detalhe: 'src/app.js' }), 'Read · src/app.js');
  assert.equal(descreverAtividade({ nome: 'Bash', detalhe: 'x'.repeat(40) }), `Bash · ${'x'.repeat(23)}…`);
  assert.equal(descreverAtividade({ nome: 'Write', detalhe: null }), 'Write');
  assert.equal(descreverAtividade(null), null);
});

test('estagiariosDe filtra pelos ids do advogado', () => {
  const estado = { estagiarios: [{ id: 'a1' }, { id: 'a2' }, { id: 'b1' }] };
  assert.deepEqual(estagiariosDe(estado, { estagiarios: ['a1', 'b1'] }).map((e) => e.id), ['a1', 'b1']);
  assert.deepEqual(estagiariosDe(estado, { estagiarios: [] }), []);
  assert.deepEqual(estagiariosDe({}, undefined), []);
});

test('acoesParaFicha mantém a ordem do servidor (mais recente primeiro) e limita a 8', () => {
  const a = { acoesRecentes: Array.from({ length: 10 }, (_, i) => ({ nome: `T${i}` })) };
  assert.deepEqual(acoesParaFicha(a).map((x) => x.nome), ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
  assert.deepEqual(acoesParaFicha({ acoesRecentes: [] }), []);
  assert.deepEqual(acoesParaFicha({}), []);
  assert.deepEqual(acoesParaFicha(undefined), []);
  assert.equal(acoesParaFicha(a, 3).length, 3);
});

test('cores.js: todo cargo, sala, piso e estado de saúde tem cor hexadecimal, e nada muda em runtime', () => {
  const hex = /^#[0-9a-f]{6}$/;
  for (const cargo of ['socio', 'senior', 'associado', 'junior', 'advogado', 'estagiario']) assert.match(CORES.cargo[cargo] ?? '', hex, `cargo ${cargo}`);
  for (const sala of ['recepcao', 'biblioteca', 'gabinete', 'revisao', 'cartorio', 'reunioes', 'copa']) assert.match(CORES.sala[sala] ?? '', hex, `sala ${sala}`);
  for (const piso of ['piso-madeira', 'piso-carpete', 'piso-parede', 'piso-porta', 'piso-tapete']) assert.match(CORES.piso[piso] ?? '', hex, `piso ${piso}`);
  for (const estado of ['ok', 'semEventos', 'erro']) assert.match(CORES.saude[estado] ?? '', hex, `saúde ${estado}`);
  for (const chave of ['crachaPadrao', 'fundo', 'texto', 'balao']) assert.match(CORES[chave] ?? '', hex, chave);
  assert.equal(CRACHA_PADRAO.cor, CORES.crachaPadrao);
  assert.ok(Object.isFrozen(CORES) && Object.isFrozen(CORES.cargo) && Object.isFrozen(CORES.saude));
});

test('escalaDaTela desconta a barra e o painel aberto e aceita escala menor que 1', () => {
  assert.equal(LARGURA_PAINEL, 290);
  assert.equal(ALTURA_BARRA, 48);
  assert.equal(escalaDaTela({ larguraJanela: 1920, alturaJanela: 1200, painelAberto: false }), 2);
  assert.equal(escalaDaTela({ larguraJanela: 1250, alturaJanela: 1000, painelAberto: true }), 1);
  assert.equal(escalaDaTela({ larguraJanela: 800, alturaJanela: 700, painelAberto: false }), 800 / 960);
  assert.ok(escalaDaTela({ larguraJanela: 800, alturaJanela: 700, painelAberto: true }) < 800 / 960, 'painel aberto tira largura do canvas');
  assert.equal(escalaDaTela({ larguraJanela: 1000, alturaJanela: 336, painelAberto: false }), 0.5);
  assert.equal(escalaDaTela({ larguraJanela: 100, alturaJanela: 100, painelAberto: true }), 0.2, 'janela minúscula não zera nem inverte o canvas');
});
