// Cálculos do HUD sem tocar no DOM: agrupamento, formatação, saúde e escala do canvas.

import { LARGURA, ALTURA } from './mundo.js';
import { CORES } from './cores.js';

export const JANELA_SAUDE_MS = 5 * 60 * 1000;
export const CRACHA_PADRAO = Object.freeze({ cor: CORES.crachaPadrao, sigla: '??' });
export const LARGURA_PAINEL = 290; // estilo.css: --largura-painel
export const ALTURA_BARRA = 48; // estilo.css: --altura-barra

export function truncar(texto, max = 24) {
  const s = String(texto ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Agrupa por projetoId; rótulos repetidos ganham o diretório pai para desambiguar. */
export function agruparPorProjeto(advogados) {
  const grupos = new Map();
  for (const advogado of advogados) {
    const chave = advogado.projetoId ?? '';
    if (!grupos.has(chave)) {
      grupos.set(chave, { projetoId: advogado.projetoId ?? null, rotulo: advogado.projeto ?? '', advogados: [] });
    }
    grupos.get(chave).advogados.push(advogado);
  }
  const lista = [...grupos.values()];
  const repetidos = new Map();
  for (const g of lista) repetidos.set(g.rotulo, (repetidos.get(g.rotulo) ?? 0) + 1);
  for (const g of lista) {
    if (repetidos.get(g.rotulo) > 1 && g.projetoId) {
      const partes = g.projetoId.split('/').filter(Boolean);
      g.rotulo = partes.slice(-2).join('/');
    }
  }
  return lista;
}

export function contarPorCli(advogados) {
  const contagem = new Map();
  for (const a of advogados) contagem.set(a.cli, (contagem.get(a.cli) ?? 0) + 1);
  return [...contagem.entries()]
    .map(([cli, quantidade]) => ({ cli, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade || a.cli.localeCompare(b.cli));
}

export function crachaDe(crachas, cli) {
  return crachas?.clis?.[cli] ?? crachas?.padrao ?? CRACHA_PADRAO;
}

/** verde: evento há menos de 5 min; vermelho: rejeições ou inválidos; cinza: o resto. */
export function corDaSaude(saude, agora = Date.now()) {
  if (!saude) return 'cinza';
  if ((saude.rejeitadosPorTamanho ?? 0) > 0 || (saude.invalidos ?? 0) > 0) return 'vermelho';
  if (!saude.ultimoEvento) return 'cinza';
  const quando = Date.parse(saude.ultimoEvento);
  if (!Number.isFinite(quando)) return 'cinza';
  return agora - quando < JANELA_SAUDE_MS ? 'verde' : 'cinza';
}

/** Linhas prontas para a barra de saúde: uma por adaptador que já foi visto. */
export function linhasDeSaude(saude, agora = Date.now()) {
  return Object.entries(saude ?? {})
    .map(([cli, dados]) => ({
      cli,
      cor: corDaSaude(dados, agora),
      eventos: dados?.eventos ?? 0,
      ultimoEvento: dados?.ultimoEvento ?? null,
    }))
    .sort((a, b) => a.cli.localeCompare(b.cli));
}

/**
 * Texto e proporção dos tokens para a ficha.
 * `contexto` sem `janela` vira "12.400 (janela desconhecida)"; saída estimada ganha "≈".
 */
export function formatarTokens(tokens, i18n) {
  if (!tokens) return null;
  const temContexto = typeof tokens.contexto === 'number' && tokens.contexto > 0;
  const temJanela = typeof tokens.janela === 'number' && tokens.janela > 0;
  const contexto = !temContexto
    ? null
    : temJanela
      ? `${i18n.numero(tokens.contexto)} / ${i18n.numero(tokens.janela)}`
      : `${i18n.numero(tokens.contexto)} (${i18n.t('janelaDesconhecida')})`;
  const proporcao = temContexto && temJanela ? Math.min(1, tokens.contexto / tokens.janela) : null;
  const saida = typeof tokens.saida === 'number' && tokens.saida > 0
    ? `${tokens.saidaEstimada ? '≈ ' : ''}${i18n.numero(tokens.saida)}`
    : null;
  if (!contexto && !saida) return null;
  return { contexto, proporcao, saida };
}

/** Uma linha de balão/ficha: "Read · src/app.js" com detalhe truncado. */
export function descreverAtividade(atividade, max = 24) {
  if (!atividade || !atividade.nome) return null;
  const detalhe = atividade.detalhe ? truncar(atividade.detalhe, max) : '';
  return detalhe ? `${atividade.nome} · ${detalhe}` : atividade.nome;
}

/** Ações para a ficha: o servidor já manda a mais recente primeiro; só limita a quantidade. */
export function acoesParaFicha(advogado, max = 8) {
  return (advogado?.acoesRecentes ?? []).slice(0, max);
}

export function estagiariosDe(estado, advogado) {
  const ids = new Set(advogado?.estagiarios ?? []);
  return (estado.estagiarios ?? []).filter((e) => ids.has(e.id));
}

/**
 * Escala do canvas para caber no que sobra da janela: sem a barra superior e, com o painel
 * aberto, sem a largura do painel. Pode ser menor que 1 (janela pequena encolhe a cena em vez
 * de cortá-la); o piso de 0,2 evita canvas de largura zero ou negativa.
 */
export function escalaDaTela({ larguraJanela, alturaJanela, painelAberto = false }) {
  const largura = larguraJanela - (painelAberto ? LARGURA_PAINEL : 0);
  const altura = alturaJanela - ALTURA_BARRA;
  const escala = Math.min(largura / LARGURA, altura / ALTURA);
  return Number.isFinite(escala) ? Math.max(0.2, escala) : 0.2;
}
