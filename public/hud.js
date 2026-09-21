// HUD em DOM puro: barra superior, painel lateral e ficha do caso.
// Todo texto vindo do servidor entra por textContent.

import { agruparPorProjeto, contarPorCli, crachaDe, linhasDeSaude, formatarTokens, descreverAtividade, truncar, estagiariosDe, acoesParaFicha } from './hud-util.js';
import { CORES } from './cores.js';

// corDaSaude (hud-util) fala em verde/cinza/vermelho; a cor de fato mora em cores.js.
const COR_DA_SAUDE = Object.freeze({ verde: CORES.saude.ok, cinza: CORES.saude.semEventos, vermelho: CORES.saude.erro });

function el(doc, tag, classe, texto) {
  const no = doc.createElement(tag);
  if (classe) no.className = classe;
  if (texto !== undefined && texto !== null) no.textContent = String(texto);
  return no;
}

export function criarHud({ doc, raiz, i18n, painelAberto = true, aoTrocarIdioma = () => {}, aoAlternarPainel = () => {}, aoSelecionar = () => {} }) {
  let lingua = i18n;
  let estadoAtual = { advogados: [], estagiarios: [], salas: [], saude: {}, crachas: null, conectado: false };
  let foraDoMapa = new Set();
  let selecionado = null;

  const barra = el(doc, 'header', 'barra');
  const titulo = el(doc, 'h1', 'titulo', lingua.t('titulo'));
  const clis = el(doc, 'div', 'clis');
  const saude = el(doc, 'div', 'saude');
  const botaoIdioma = el(doc, 'button', 'botao', lingua.t('trocarIdioma'));
  const botaoPainel = el(doc, 'button', 'botao', lingua.t(painelAberto ? 'fecharPainel' : 'abrirPainel'));
  botaoIdioma.type = 'button';
  botaoPainel.type = 'button';
  botaoPainel.setAttribute('aria-expanded', String(painelAberto));
  barra.append(titulo, clis, saude, botaoIdioma, botaoPainel);

  const painel = el(doc, 'aside', 'painel');
  painel.hidden = !painelAberto;
  const tituloPainel = el(doc, 'h2', 'painel-titulo');
  const lista = el(doc, 'div', 'projetos');
  painel.append(tituloPainel, lista);
  doc.body.classList.toggle('com-painel', painelAberto); // o palco cede a largura do painel (estilo.css)

  const ficha = el(doc, 'div', 'ficha');
  ficha.hidden = true;
  ficha.setAttribute('role', 'dialog');
  ficha.setAttribute('aria-modal', 'true');
  ficha.setAttribute('aria-label', lingua.t('fichaDoCaso'));
  const fichaCorpo = el(doc, 'div', 'ficha-corpo');
  const botaoFechar = el(doc, 'button', 'botao fechar', lingua.t('fechar'));
  botaoFechar.type = 'button';
  ficha.append(botaoFechar, fichaCorpo);

  raiz.append(barra, painel, ficha);

  botaoIdioma.addEventListener('click', () => aoTrocarIdioma(lingua.outro()));
  botaoPainel.addEventListener('click', () => {
    const abrir = painel.hidden;
    painel.hidden = !abrir;
    doc.body.classList.toggle('com-painel', abrir);
    botaoPainel.textContent = lingua.t(abrir ? 'fecharPainel' : 'abrirPainel');
    botaoPainel.setAttribute('aria-expanded', String(abrir));
    aoAlternarPainel(abrir);
  });
  botaoFechar.addEventListener('click', () => fecharFicha());
  doc.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !ficha.hidden) fecharFicha();
  });

  function desenharClis() {
    clis.replaceChildren();
    for (const { cli, quantidade } of contarPorCli(estadoAtual.advogados)) {
      const item = el(doc, 'span', 'cli');
      const ponto = el(doc, 'span', 'ponto');
      ponto.style.background = crachaDe(estadoAtual.crachas, cli).cor;
      item.append(ponto, el(doc, 'span', null, `${crachaDe(estadoAtual.crachas, cli).sigla} ${quantidade}`));
      item.title = cli;
      clis.append(item);
    }
  }

  function desenharSaude() {
    saude.replaceChildren();
    saude.append(el(doc, 'span', 'rotulo', lingua.t('saude')));
    for (const linha of linhasDeSaude(estadoAtual.saude)) {
      const item = el(doc, 'span', 'adaptador');
      const ponto = el(doc, 'span', 'ponto');
      ponto.style.background = COR_DA_SAUDE[linha.cor];
      item.append(ponto, el(doc, 'span', null, linha.cli));
      item.title = linha.ultimoEvento ?? lingua.t('semEventos');
      saude.append(item);
    }
  }

  function linhaDoAdvogado(advogado) {
    const botao = el(doc, 'button', 'linha');
    botao.type = 'button';
    botao.dataset.id = advogado.id;
    const cracha = crachaDe(estadoAtual.crachas, advogado.cli);
    const ponto = el(doc, 'span', 'ponto');
    ponto.style.background = cracha.cor;
    const nome = el(doc, 'span', 'nome', `${cracha.sigla} ${lingua.cargo(advogado.cargo)}`);
    const sala = el(doc, 'span', 'sala', lingua.sala(advogado.sala, rotuloDaSala(advogado.sala)));
    const estado = el(doc, 'span', 'estado', lingua.estado(advogado.estado));
    botao.append(ponto, nome, sala, estado);
    if (foraDoMapa.has(advogado.id)) botao.append(el(doc, 'span', 'aviso', lingua.t('foraDoMapa')));
    if (advogado.id === selecionado) botao.classList.add('selecionada');
    botao.addEventListener('click', () => aoSelecionar(advogado.id));
    return botao;
  }

  function rotuloDaSala(id) {
    return (estadoAtual.salas ?? []).find((s) => s.id === id)?.rotulo;
  }

  function desenharTituloPainel() {
    tituloPainel.textContent = `${lingua.numero(estadoAtual.advogados.length)} ${lingua.t('advogados')}`;
  }

  /**
   * Reconstrói a lista de projetos. Guarda o foco antes (Tab pelo painel não pode "cair" a cada
   * delta do fluxo) e o devolve à mesma linha depois. Com a ficha aberta, `atualizar` nem chama
   * isto: a lista fica congelada e só a ficha muda.
   */
  function desenharPainel() {
    const focoId = doc.activeElement?.dataset?.id;
    lista.replaceChildren();
    if (!estadoAtual.conectado) {
      lista.append(el(doc, 'p', 'vazio', lingua.t('semConexao')));
      return;
    }
    if (!estadoAtual.advogados.length) {
      lista.append(el(doc, 'p', 'vazio', lingua.t('semAdvogados')));
      return;
    }
    for (const grupo of agruparPorProjeto(estadoAtual.advogados)) {
      const bloco = el(doc, 'section', 'projeto');
      bloco.append(el(doc, 'h3', null, grupo.rotulo || lingua.t('semProjeto')));
      for (const advogado of grupo.advogados) bloco.append(linhaDoAdvogado(advogado));
      lista.append(bloco);
    }
    if (focoId) lista.querySelector('[data-id="' + CSS.escape(focoId) + '"]')?.focus();
  }

  function campo(rotulo, valor) {
    const linha = el(doc, 'p', 'campo');
    linha.append(el(doc, 'span', 'rotulo', rotulo), el(doc, 'span', 'valor', valor));
    return linha;
  }

  function desenharFicha() {
    fichaCorpo.replaceChildren();
    const advogado = estadoAtual.advogados.find((a) => a.id === selecionado);
    if (!advogado) {
      fecharFicha();
      return;
    }
    fichaCorpo.append(el(doc, 'h2', null, lingua.t('fichaDoCaso')));
    fichaCorpo.append(campo(lingua.t('casoAtual'), advogado.caso ?? lingua.t('semCaso')));
    fichaCorpo.append(campo(lingua.t('turno'), String(advogado.turnos ?? 0)));
    fichaCorpo.append(campo(lingua.t('cli'), advogado.cli));
    fichaCorpo.append(campo(lingua.t('modelo'), advogado.modelo ?? lingua.t('desconhecido')));
    fichaCorpo.append(campo(lingua.t('cargo'), lingua.cargo(advogado.cargo)));
    fichaCorpo.append(campo(lingua.t('sala'), `${lingua.sala(advogado.sala, rotuloDaSala(advogado.sala))} (${lingua.t('avisoSala')})`));

    fichaCorpo.append(el(doc, 'h3', null, lingua.t('acoesRecentes')));
    const acoes = el(doc, 'ul', 'acoes');
    const recentes = acoesParaFicha(advogado);
    if (!recentes.length) acoes.append(el(doc, 'li', null, lingua.t('semAcoes')));
    for (const acao of recentes) acoes.append(el(doc, 'li', null, descreverAtividade(acao, 48) ?? acao.nome));
    fichaCorpo.append(acoes);

    const tokens = formatarTokens(advogado.tokens, lingua);
    if (tokens) {
      fichaCorpo.append(el(doc, 'h3', null, lingua.t('tokens')));
      if (tokens.contexto) {
        fichaCorpo.append(campo(lingua.t('contexto'), tokens.contexto));
        if (tokens.proporcao !== null) {
          const barraTokens = el(doc, 'div', 'barra-tokens');
          const preenchida = el(doc, 'div', 'preenchida');
          preenchida.style.width = `${Math.round(tokens.proporcao * 100)}%`;
          barraTokens.append(preenchida);
          fichaCorpo.append(barraTokens);
        }
      }
      if (tokens.saida) fichaCorpo.append(campo(lingua.t('saida'), tokens.saida));
    }

    fichaCorpo.append(el(doc, 'h3', null, lingua.t('estagiarios')));
    const internos = estagiariosDe(estadoAtual, advogado);
    const listaInternos = el(doc, 'ul', 'estagiarios');
    if (!internos.length) listaInternos.append(el(doc, 'li', null, lingua.t('semEstagiarios')));
    for (const interno of internos) {
      const texto = `${truncar(interno.tipo ?? '', 20)} · ${lingua.sala(interno.sala, rotuloDaSala(interno.sala))} · ${lingua.estado(interno.estado)}`;
      listaInternos.append(el(doc, 'li', null, texto));
    }
    fichaCorpo.append(listaInternos);
  }

  function abrirFicha(id) {
    selecionado = id;
    desenharPainel(); // marca a linha selecionada antes de a lista congelar
    ficha.hidden = false;
    desenharFicha();
    botaoFechar.focus();
  }

  function fecharFicha() {
    const origem = selecionado; // linha que abriu a ficha: o foco volta para ela
    selecionado = null;
    ficha.hidden = true;
    fichaCorpo.replaceChildren();
    desenharPainel();
    if (origem) lista.querySelector('[data-id="' + CSS.escape(origem) + '"]')?.focus();
  }

  function trocarIdioma(novo) {
    lingua = novo;
    titulo.textContent = lingua.t('titulo');
    botaoIdioma.textContent = lingua.t('trocarIdioma');
    botaoPainel.textContent = lingua.t(painel.hidden ? 'abrirPainel' : 'fecharPainel');
    ficha.setAttribute('aria-label', lingua.t('fichaDoCaso'));
    botaoFechar.textContent = lingua.t('fechar');
    desenharClis();
    desenharSaude();
    desenharTituloPainel();
    desenharPainel(); // aqui a lista é refeita mesmo com a ficha aberta: os rótulos mudam de idioma
    if (!ficha.hidden) desenharFicha();
  }

  function atualizar(estado, fora = []) {
    estadoAtual = estado;
    foraDoMapa = new Set(fora);
    desenharClis();
    desenharSaude();
    desenharTituloPainel();
    if (ficha.hidden) desenharPainel();
    else desenharFicha(); // ficha aberta: a lista fica como está (foco e rolagem parados)
  }

  desenharTituloPainel();
  desenharPainel(); // antes do primeiro snapshot: "Sem conexão com o servidor"

  return { atualizar, abrirFicha, fecharFicha, trocarIdioma, get selecionado() { return selecionado; } };
}
