import { basename } from 'node:path';

export const ESTADOS = Object.freeze(['recepcao', 'pensando', 'trabalhando', 'aguardando', 'ocioso', 'saiu']);

export const LIMITES_ESTADO = Object.freeze({
  sessoes: 64,
  estagiariosPorSessao: 32,
  pendentesAdvogado: 16,
  pendentesEstagiario: 8,
  acoesRecentes: 8,
  ociosoMs: 2 * 60_000,
  desatualizadoMs: 10 * 60_000,
  saidaMs: 30 * 60_000,
  saidaAguardandoMs: 60 * 60_000,
  estagiarioMs: 15 * 60_000,
  removerMs: 3_000,
  lapideMs: 60_000,
});

export class Escritorio {
  constructor({ agora = () => Date.now(), resolverSala, salaInicialEstagiario, cargoDoModelo, limites = {} } = {}) {
    this.agora = agora;
    this.resolverSala = resolverSala ?? (() => 'recepcao');
    this.salaInicialEstagiario = salaInicialEstagiario ?? (() => 'reunioes');
    this.cargoDoModelo = cargoDoModelo ?? (() => 'advogado');
    this.limites = { ...LIMITES_ESTADO, ...limites };
    this.advogados = new Map();
    this.estagiarios = new Map();
    this.lapides = new Map();
    this.contadorChamadas = 0;
  }

  // ---------- API ----------

  aplicar(ev) {
    const mudancas = [];
    const id = `${ev.cli}:${ev.sessao}`;
    const agora = this.agora();
    let adv = this.advogados.get(id);
    if (!adv) adv = this._criarAdvogado(id, ev, agora, mudancas);
    this._atualizarMetadados(adv, ev);

    adv.ultimaAtividade = agora;
    adv.ultimaAtividadeAgregada = agora;
    adv.desatualizado = false;
    switch (ev.tipo) {
      case 'sessao.inicio':
        if (adv.estado === 'ocioso') this._mudar(adv, 'recepcao', 'recepcao');
        break;
      case 'prompt':
        adv.caso = ev.prompt;
        adv.turnos += 1;
        if (adv.estado !== 'trabalhando') this._mudar(adv, 'pensando', this._salaAoVoltar(adv));
        break;
      case 'ferramenta.inicio':
        this._abrirChamada(adv, ev.ferramenta, this.limites.pendentesAdvogado);
        this._registrarAcao(adv, ev);
        this._mudar(adv, 'trabalhando', this.resolverSala(ev.ferramenta));
        break;
      case 'ferramenta.fim': {
        if (adv.estado !== 'trabalhando') break;
        this._fecharChamada(adv, ev.ferramenta);
        const atual = this._ultimaChamada(adv);
        if (atual) adv.sala = this.resolverSala(atual);
        else this._mudar(adv, 'pensando', adv.sala);
        break;
      }
      case 'aguardando':
        if (adv.estado !== 'aguardando') {
          adv.salaAnterior = adv.sala;
          this._mudar(adv, 'aguardando', 'copa');
        }
        break;
      case 'parado':
        if (adv.estado === 'pensando' || adv.estado === 'trabalhando' || adv.estado === 'aguardando') {
          this._limparChamadas(adv, mudancas);
          this._mudar(adv, 'recepcao', 'recepcao');
        }
        break;
      case 'sessao.fim':
        this._sair(adv, agora);
        break;
      default:
        break;
    }
    mudancas.push(this._deltaAdvogado(adv));
    return mudancas;
  }

  snapshot() {
    return {
      advogados: [...this.advogados.values()].map((a) => this._serializarAdvogado(a)),
      estagiarios: [...this.estagiarios.values()].map((e) => this._serializarEstagiario(e)),
    };
  }

  // ---------- advogado ----------

  _criarAdvogado(id, ev, agora) {
    const adv = {
      id, cli: ev.cli, sessao: ev.sessao, modelo: undefined, cargo: this.cargoDoModelo(undefined),
      cwd: undefined, projetoId: undefined, projeto: undefined,
      estado: 'recepcao', sala: 'recepcao', salaAnterior: undefined,
      chamadasPendentes: new Map(), caso: undefined, turnos: 0, acoesRecentes: [],
      tokens: { contexto: undefined, janela: undefined, saida: 0, saidaEstimada: false },
      estagiarios: new Set(), desatualizado: false,
      iniciadoEm: agora, ultimaAtividade: agora, ultimaAtividadeAgregada: agora, saiuEm: undefined,
    };
    this.advogados.set(id, adv);
    return adv;
  }

  _atualizarMetadados(adv, ev) {
    if (ev.cwd) {
      adv.cwd = ev.cwd;
      adv.projetoId = ev.cwd;
      if (!ev.projeto) adv.projeto = basename(ev.cwd) || ev.cwd;
    }
    if (ev.projeto) adv.projeto = ev.projeto;
    if (ev.modelo && ev.modelo !== adv.modelo) {
      adv.modelo = ev.modelo;
      adv.cargo = this.cargoDoModelo(ev.modelo);
    }
  }

  _mudar(adv, estado, sala) {
    adv.estado = estado;
    adv.sala = sala;
  }

  _sair(adv, agora) {
    adv.estado = 'saiu';
    adv.saiuEm = agora;
    adv.chamadasPendentes.clear();
  }

  _salaAoVoltar(adv) {
    return adv.estado === 'aguardando' ? (adv.salaAnterior ?? 'recepcao') : adv.sala;
  }

  _registrarAcao(adv, ev) {
    adv.acoesRecentes.unshift({ nome: ev.ferramenta.nome, detalhe: ev.ferramenta.detalhe, ts: ev.ts });
    if (adv.acoesRecentes.length > this.limites.acoesRecentes) adv.acoesRecentes.length = this.limites.acoesRecentes;
  }

  // ---------- chamadas pendentes (advogado ou estagiário) ----------

  _abrirChamada(ent, f, max) {
    const chave = f.id ?? `${f.nome}#${++this.contadorChamadas}`;
    if (ent.chamadasPendentes.size >= max) ent.chamadasPendentes.delete(ent.chamadasPendentes.keys().next().value);
    ent.chamadasPendentes.delete(chave);
    ent.chamadasPendentes.set(chave, { nome: f.nome, detalhe: f.detalhe });
  }

  _fecharChamada(ent, f) {
    if (f.id && ent.chamadasPendentes.delete(f.id)) return true;
    for (const [k, v] of ent.chamadasPendentes) {
      if (v.nome === f.nome) {
        ent.chamadasPendentes.delete(k);
        return true;
      }
    }
    return false;
  }

  _ultimaChamada(ent) {
    let ultima = null;
    for (const v of ent.chamadasPendentes.values()) ultima = v;
    return ultima;
  }

  _limparChamadas(adv) {
    adv.chamadasPendentes.clear();
  }

  // ---------- serialização ----------

  _serializarAdvogado(a) {
    const atividade = this._ultimaChamada(a);
    return {
      id: a.id, cli: a.cli, sessao: a.sessao, modelo: a.modelo ?? null, cargo: a.cargo,
      projetoId: a.projetoId ?? null, projeto: a.projeto ?? null,
      estado: a.estado, sala: a.sala,
      atividade: atividade ? { nome: atividade.nome, detalhe: atividade.detalhe } : null,
      caso: a.caso ?? null, turnos: a.turnos,
      acoesRecentes: a.acoesRecentes.map((x) => ({ ...x })),
      tokens: { contexto: a.tokens.contexto ?? null, janela: a.tokens.janela ?? null, saida: a.tokens.saida, saidaEstimada: a.tokens.saidaEstimada },
      estagiarios: [...a.estagiarios], desatualizado: a.desatualizado,
      iniciadoEm: a.iniciadoEm, ultimaAtividade: a.ultimaAtividade,
    };
  }

  _serializarEstagiario(e) {
    const atividade = this._ultimaChamada(e);
    return {
      id: e.id, sessao: e.sessao, tipo: e.tipo ?? null, descricao: e.descricao ?? null,
      estado: e.estado, sala: e.sala,
      atividade: atividade ? { nome: atividade.nome, detalhe: atividade.detalhe } : null,
      ultimaAtividade: e.ultimaAtividade,
    };
  }

  _deltaAdvogado(a) {
    return { tipo: 'advogado', advogado: this._serializarAdvogado(a) };
  }

  _deltaEstagiario(e) {
    return { tipo: 'estagiario', estagiario: this._serializarEstagiario(e) };
  }
}
