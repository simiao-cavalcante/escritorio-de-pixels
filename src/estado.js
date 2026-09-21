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

    const deEstagiario = Boolean(ev.agente) && (ev.tipo === 'ferramenta.inicio' || ev.tipo === 'ferramenta.fim');
    if (deEstagiario) {
      adv.ultimaAtividadeAgregada = agora;
      this._aplicarEstagiario(adv, ev, agora, mudancas);
      mudancas.push(this._deltaAdvogado(adv));
      return mudancas;
    }

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
        this._registrarAcao(adv, ev, agora);
        this._mudar(adv, 'trabalhando', this.resolverSala(ev.ferramenta));
        break;
      case 'ferramenta.fim': {
        const fechou = this._fecharChamada(adv, ev.ferramenta);
        if (!fechou || adv.estado !== 'trabalhando') break;
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
        this._sair(adv, agora, mudancas);
        break;
      case 'tokens':
        this._aplicarTokens(adv, ev.tokens);
        break;
      case 'subagente.inicio':
        this._criarEstagiario(adv, ev.agente, agora, mudancas);
        break;
      case 'subagente.fim':
        this._removerEstagiario(adv, `${adv.id}:${ev.agente.id}`, mudancas);
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

  _sair(adv, agora, mudancas) {
    adv.estado = 'saiu';
    adv.saiuEm = agora;
    this._limparChamadas(adv, mudancas);
  }

  _salaAoVoltar(adv) {
    return adv.estado === 'aguardando' ? (adv.salaAnterior ?? 'recepcao') : adv.sala;
  }

  _registrarAcao(adv, ev, agora) {
    adv.acoesRecentes.unshift({ nome: ev.ferramenta.nome, detalhe: ev.ferramenta.detalhe, ts: agora });
    if (adv.acoesRecentes.length > this.limites.acoesRecentes) adv.acoesRecentes.length = this.limites.acoesRecentes;
  }

  // ---------- chamadas pendentes (advogado ou estagiário) ----------

  _abrirChamada(ent, f, max) {
    const chave = f.id ?? `${f.nome}#${++this.contadorChamadas}`;
    ent.chamadasPendentes.delete(chave);
    if (ent.chamadasPendentes.size >= max) ent.chamadasPendentes.delete(ent.chamadasPendentes.keys().next().value);
    ent.chamadasPendentes.set(chave, { nome: f.nome, detalhe: f.detalhe });
  }

  // Chave é ferramenta.id; sem id, a chave sintética é `nome#n`. Um `fim` com id
  // desconhecido só pode encerrar pendentes sintéticas homônimas (abertas sem id) —
  // nunca outra pendente com id diferente. `fim` sem correspondente é ignorado.
  _fecharChamada(ent, f) {
    if (f.id && ent.chamadasPendentes.delete(f.id)) return true;
    for (const [k, v] of ent.chamadasPendentes) {
      if (v.nome !== f.nome) continue;
      if (f.id && !k.startsWith(`${f.nome}#`)) continue;
      ent.chamadasPendentes.delete(k);
      return true;
    }
    return false;
  }

  _ultimaChamada(ent) {
    let ultima = null;
    for (const v of ent.chamadasPendentes.values()) ultima = v;
    return ultima;
  }

  _limparChamadas(adv, mudancas) {
    adv.chamadasPendentes.clear();
    for (const eid of adv.estagiarios) {
      const est = this.estagiarios.get(eid);
      if (est && est.chamadasPendentes.size) {
        est.chamadasPendentes.clear();
        est.estado = 'pensando';
        mudancas.push(this._deltaEstagiario(est));
      }
    }
  }

  // ---------- estagiários ----------

  _criarEstagiario(adv, agente, agora, mudancas) {
    const id = `${adv.id}:${agente.id}`;
    let est = this.estagiarios.get(id);
    if (!est) {
      if (adv.estagiarios.size >= this.limites.estagiariosPorSessao) {
        const vitima = [...adv.estagiarios]
          .map((i) => this.estagiarios.get(i))
          .filter(Boolean)
          .sort((a, b) => {
            const pa = a.estado === 'pensando' ? 0 : 1;
            const pb = b.estado === 'pensando' ? 0 : 1;
            return pa - pb || a.ultimaAtividade - b.ultimaAtividade;
          })[0];
        if (vitima) this._removerEstagiario(adv, vitima.id, mudancas);
      }
      est = {
        // sessao é o id do advogado (cli:sessao): é o que o cliente usa para achar o dono
        id, sessao: adv.id, tipo: agente.tipo, descricao: agente.descricao,
        estado: 'pensando', sala: this.salaInicialEstagiario(agente.tipo),
        chamadasPendentes: new Map(), ultimaAtividade: agora,
      };
      this.estagiarios.set(id, est);
      adv.estagiarios.add(id);
    } else {
      if (agente.tipo) est.tipo = agente.tipo;
      if (agente.descricao) est.descricao = agente.descricao;
      est.ultimaAtividade = agora;
    }
    mudancas.push(this._deltaEstagiario(est));
    return est;
  }

  _aplicarEstagiario(adv, ev, agora, mudancas) {
    const id = `${adv.id}:${ev.agente.id}`;
    const est = this.estagiarios.get(id) ?? this._criarEstagiario(adv, ev.agente, agora, mudancas);
    if (ev.tipo === 'ferramenta.inicio') {
      est.ultimaAtividade = agora;
      this._abrirChamada(est, ev.ferramenta, this.limites.pendentesEstagiario);
      est.estado = 'trabalhando';
      est.sala = this.resolverSala(ev.ferramenta);
    } else {
      const fechou = this._fecharChamada(est, ev.ferramenta);
      if (!fechou) return;
      est.ultimaAtividade = agora;
      const atual = this._ultimaChamada(est);
      if (atual) est.sala = this.resolverSala(atual);
      else est.estado = 'pensando';
    }
    mudancas.push(this._deltaEstagiario(est));
  }

  _removerEstagiario(adv, id, mudancas) {
    if (!this.estagiarios.delete(id)) {
      adv.estagiarios.delete(id);
      return;
    }
    adv.estagiarios.delete(id);
    mudancas.push({ tipo: 'remover', entidade: 'estagiario', id });
  }

  // ---------- tokens ----------

  _aplicarTokens(adv, t) {
    if (t.contexto !== undefined) adv.tokens.contexto = t.contexto;
    if (t.janela !== undefined) adv.tokens.janela = t.janela;
    if (t.saidaTotal !== undefined) {
      adv.tokens.saida = t.saidaTotal;
      adv.tokens.saidaEstimada = false;
    }
    if (t.saidaIncremento !== undefined) {
      adv.tokens.saida += t.saidaIncremento;
      adv.tokens.saidaEstimada = true;
    }
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
