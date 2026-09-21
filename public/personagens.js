// Elenco: quem aparece no mapa, em que posto, andando por onde.
// Sem DOM: relógio injetado, posições em tiles.

import { SALAS, caminhoEntreNos, noDaSala, noMaisProximo, NOS, salaEm, posicaoJuntoAPorta } from './mundo.js';

export const LIMITE_ADVOGADOS = 24;
export const LIMITE_ESTAGIARIOS = 6;
export const VELOCIDADE_TILES_S = 3;
export const DEBOUNCE_SALA_MS = 1000;
export const RAIO_ORBITA = 1;
const LIMITE_EM_PE = 64; // busca limitada de vaga em pé: com 24 advogados nunca se esgota

export function ordenarPorAtividade(advogados) {
  return [...advogados].sort((a, b) => (b.ultimaAtividade ?? 0) - (a.ultimaAtividade ?? 0) || a.id.localeCompare(b.id));
}

/** Comprimento, em tiles, de um caminho de nós do grafo; caminho vazio (sem ligação) conta como infinito. */
function comprimento(nomes) {
  if (!nomes.length) return Infinity;
  let total = 0;
  for (let i = 1; i < nomes.length; i += 1) {
    total += Math.hypot(NOS[nomes[i]].x - NOS[nomes[i - 1]].x, NOS[nomes[i]].y - NOS[nomes[i - 1]].y);
  }
  return total;
}

export function criarElenco({ agora = () => Date.now(), reduzirMovimento = false } = {}) {
  const atores = new Map(); // id → ator
  const ocupacao = new Map(); // sala → Map(indice do posto → id do ator)
  let movimentoReduzido = reduzirMovimento;

  const mapaDaSala = (sala) => {
    if (!ocupacao.has(sala)) ocupacao.set(sala, new Map());
    return ocupacao.get(sala);
  };

  function liberarPosto(ator) {
    if (ator.sala && ator.posto !== null) {
      const mapa = mapaDaSala(ator.sala);
      if (mapa.get(ator.posto) === ator.id) mapa.delete(ator.posto);
    }
    ator.posto = null;
  }

  function ocuparPosto(ator, sala) {
    const mapa = mapaDaSala(sala);
    const postos = SALAS[sala]?.postos ?? [];
    for (let i = 0; i < postos.length; i += 1) {
      if (!mapa.has(i)) {
        mapa.set(i, ator.id);
        ator.posto = i;
        return { ...postos[i] };
      }
    }
    ator.posto = null;
    return { ...vagaEmPe(ator, sala), movel: null, emPe: true };
  }

  /** Alguém que não `ator` já reivindicou esse tile em pé nessa sala? */
  function tileEmPeOcupado(ator, sala, p) {
    for (const outro of atores.values()) {
      if (outro !== ator && outro.sala === sala && outro.posto === null && outro.alvo?.emPe
        && outro.alvo.x === p.x && outro.alvo.y === p.y) return true;
    }
    return false;
  }

  /**
   * Primeiro deslocamento junto à porta que ninguém em pé nessa sala ocupa. `ator.sala` já é a
   * sala nova quando isto roda, daí excluir o próprio ator; estagiário orbitando tem
   * `sala === null` e nunca disputa o tile.
   */
  function vagaEmPe(ator, sala) {
    let p = posicaoJuntoAPorta(sala, 0);
    for (let k = 0; k < LIMITE_EM_PE; k += 1) {
      p = posicaoJuntoAPorta(sala, k);
      if (!tileEmPeOcupado(ator, sala, p)) break;
    }
    return p;
  }

  /**
   * Nó por onde a rota nova começa. No corredor o ator está sobre uma aresta (`de` → `para`) do
   * grafo: partir do nó mais próximo em linha reta o faria voltar pela aresta. Então parte do
   * extremo que dá a caminhada mais curta até `chegada` (distância até o extremo + caminho no
   * grafo), ou de `para` se já passou da metade (sem meia-volta por pouco). Dentro de uma sala só
   * se sai pela porta; sem aresta (parado num nó, ou rota montada à mão), vale o nó mais próximo.
   */
  function noDePartida(ator, chegada) {
    const salaAtual = salaEm(ator.x, ator.y);
    if (salaAtual) return noDaSala(salaAtual);
    const { aresta } = ator;
    if (!aresta || !NOS[aresta.de] || !NOS[aresta.para]) return noMaisProximo(ator.x, ator.y);
    const de = NOS[aresta.de];
    const para = NOS[aresta.para];
    const percorrido = Math.hypot(ator.x - de.x, ator.y - de.y);
    const total = Math.hypot(para.x - de.x, para.y - de.y);
    if (percorrido >= total / 2) return aresta.para;
    const caminhada = (no) => Math.hypot(NOS[no].x - ator.x, NOS[no].y - ator.y) + comprimento(caminhoEntreNos(no, chegada));
    return caminhada(aresta.para) <= caminhada(aresta.de) ? aresta.para : aresta.de;
  }

  function definirRota(ator, salaNova) {
    liberarPosto(ator);
    ator.sala = salaNova;
    const alvo = ocuparPosto(ator, salaNova);
    ator.alvo = alvo;
    const destino = { x: alvo.x, y: alvo.y };
    if (movimentoReduzido) {
      ator.x = destino.x;
      ator.y = destino.y;
      ator.rota = [];
      ator.aresta = null;
      ator.andando = false;
      return;
    }
    if (salaEm(ator.x, ator.y) === salaNova) {
      ator.rota = [destino];
      return;
    }
    const chegada = noDaSala(salaNova);
    const nos = caminhoEntreNos(noDePartida(ator, chegada), chegada);
    const pontos = nos.length ? nos.map((n) => ({ ...NOS[n], no: n })) : [{ ...SALAS[salaNova].porta, no: chegada }];
    ator.rota = [...pontos, destino];
  }

  function criarAtor(id, tipo, entidade, indice) {
    const sala = SALAS[entidade.sala] ? entidade.sala : 'recepcao';
    const inicio = { ...SALAS[sala].porta };
    const ator = {
      id,
      tipo,
      indice,
      entidade,
      cargo: tipo === 'estagiario' ? 'estagiario' : entidade.cargo ?? 'advogado',
      cli: entidade.cli ?? null,
      x: inicio.x,
      y: inicio.y,
      direcao: 1,
      andando: false,
      fase: 0,
      sala: null,
      posto: null,
      alvo: null,
      rota: [],
      aresta: null,
      noAtual: null,
      salaPendente: null,
      desdePendente: 0,
      dono: null,
      orbitando: false,
    };
    atores.set(id, ator);
    definirRota(ator, sala);
    return ator;
  }

  function pedirSala(ator, salaDesejada) {
    const sala = SALAS[salaDesejada] ? salaDesejada : 'recepcao';
    if (sala === ator.sala) {
      ator.salaPendente = null;
      return;
    }
    if (ator.salaPendente !== sala) {
      ator.salaPendente = sala;
      ator.desdePendente = agora();
      return;
    }
    if (agora() - ator.desdePendente >= DEBOUNCE_SALA_MS) {
      ator.salaPendente = null;
      definirRota(ator, sala);
    }
  }

  function remover(id) {
    const ator = atores.get(id);
    if (!ator) return;
    liberarPosto(ator);
    atores.delete(id);
  }

  /** Reconcilia o elenco com o estado do fluxo. Devolve os advogados que ficaram fora do mapa. */
  function sincronizar(estado) {
    const ordenados = ordenarPorAtividade(estado.advogados ?? []);
    const visiveis = ordenados.slice(0, LIMITE_ADVOGADOS);
    const foraDoMapa = ordenados.slice(LIMITE_ADVOGADOS).map((a) => a.id);
    const porId = new Map((estado.estagiarios ?? []).map((e) => [e.id, e]));
    const vivos = new Set();

    visiveis.forEach((advogado, indice) => {
      vivos.add(advogado.id);
      let ator = atores.get(advogado.id);
      if (!ator) ator = criarAtor(advogado.id, 'advogado', advogado, indice);
      ator.entidade = advogado;
      ator.indice = indice;
      ator.cargo = advogado.cargo ?? 'advogado';
      ator.cli = advogado.cli ?? null;
      pedirSala(ator, advogado.sala);

      // Filtra uma vez só; quem passa do limite apenas não é desenhado (foraDoMapa lista advogados).
      const conhecidos = (advogado.estagiarios ?? []).filter((id) => porId.has(id));
      conhecidos.slice(0, LIMITE_ESTAGIARIOS).forEach((id, i) => {
        const estagiario = porId.get(id);
        vivos.add(id);
        let filho = atores.get(id);
        if (!filho) filho = criarAtor(id, 'estagiario', estagiario, i);
        filho.entidade = estagiario;
        filho.indice = i;
        filho.dono = advogado.id;
        filho.cli = advogado.cli ?? null;
        filho.orbitando = !estagiario.atividade;
        if (filho.orbitando) {
          liberarPosto(filho);
          filho.sala = null; // orbitando = sem sala reivindicada; a próxima atividade sempre dispara debounce + rota
          filho.rota = [];
          filho.aresta = null;
          filho.salaPendente = null;
        } else {
          pedirSala(filho, estagiario.sala);
        }
      });
    });

    for (const id of [...atores.keys()]) if (!vivos.has(id)) remover(id);
    return { visiveis: visiveis.map((a) => a.id), foraDoMapa };
  }

  /** Chegou num ponto da rota: se for nó do grafo, vira o nó atual; a aresta em curso acaba. */
  function chegarEm(ator, ponto) {
    ator.rota.shift();
    if (ponto.no) ator.noAtual = ponto.no;
    ator.aresta = null;
  }

  function avancar(ator, passo) {
    let restante = passo;
    ator.andando = false;
    while (restante > 0 && ator.rota.length) {
      const alvo = ator.rota[0];
      const dx = alvo.x - ator.x;
      const dy = alvo.y - ator.y;
      const distancia = Math.hypot(dx, dy);
      if (distancia <= 1e-6) {
        chegarEm(ator, alvo);
        continue;
      }
      ator.andando = true;
      if (alvo.no) ator.aresta = { de: ator.noAtual, para: alvo.no }; // aresta do grafo em curso
      if (Math.abs(dx) > 1e-6) ator.direcao = dx > 0 ? 1 : -1;
      if (distancia <= restante) {
        ator.x = alvo.x;
        ator.y = alvo.y;
        restante -= distancia;
        chegarEm(ator, alvo);
      } else {
        ator.x += (dx / distancia) * restante;
        ator.y += (dy / distancia) * restante;
        restante = 0;
      }
    }
  }

  function orbitar(ator) {
    const dono = atores.get(ator.dono);
    if (!dono) return;
    const angulo = (Math.PI * 2 * ator.indice) / LIMITE_ESTAGIARIOS;
    ator.x = dono.x + Math.cos(angulo) * RAIO_ORBITA;
    ator.y = dono.y + Math.sin(angulo) * RAIO_ORBITA * 0.6;
    ator.andando = false;
    ator.direcao = dono.direcao;
  }

  /** Avança a animação em `dtMs` milissegundos. */
  function atualizar(dtMs) {
    const passo = (VELOCIDADE_TILES_S * dtMs) / 1000;
    for (const ator of atores.values()) {
      if (ator.tipo === 'estagiario' && ator.orbitando) {
        orbitar(ator);
      } else {
        avancar(ator, passo);
      }
      ator.fase = movimentoReduzido ? 0 : (ator.fase + dtMs) % 100000;
    }
  }

  return {
    sincronizar,
    atualizar,
    atores: () => [...atores.values()],
    ator: (id) => atores.get(id) ?? null,
    postoDe: (id) => atores.get(id)?.posto ?? null,
    definirMovimentoReduzido(valor) {
      movimentoReduzido = Boolean(valor);
      if (movimentoReduzido) {
        // Deslocamento instantâneo: encerra qualquer rota em curso já no ponto final dela.
        for (const ator of atores.values()) {
          if (ator.rota.length) {
            const ultimo = ator.rota[ator.rota.length - 1];
            ator.x = ultimo.x;
            ator.y = ultimo.y;
          }
        }
        for (const ator of atores.values()) {
          ator.rota = [];
          ator.aresta = null;
          ator.andando = false;
          ator.fase = 0;
        }
      }
    },
    get movimentoReduzido() {
      return movimentoReduzido;
    },
  };
}
