// Redutor do fluxo SSE: snapshot + deltas numerados, com detecção de salto de seq.
// Sem DOM: a fábrica do EventSource é injetada.

export const TIPOS = Object.freeze(['snapshot', 'advogado', 'estagiario', 'remover', 'saude']);

export function estadoInicial() {
  return Object.freeze({
    seq: -1,
    advogados: [],
    estagiarios: [],
    salas: [],
    saude: {},
    crachas: null,
    temSnapshot: false,
    precisaReconectar: false,
    conectado: false, // true a partir do snapshot; false no evento error do EventSource
  });
}

function substituir(lista, entidade) {
  const i = lista.findIndex((x) => x.id === entidade.id);
  if (i === -1) return [...lista, entidade];
  const copia = [...lista];
  copia[i] = entidade;
  return copia;
}

/** Aplica uma mensagem do fluxo e devolve o novo estado (nunca muda o anterior). */
export function aplicarMensagem(estado, tipo, dados) {
  // `erro` não vem do servidor: é o evento error do EventSource. Os dados ficam (o mapa segue
  // desenhado); só `conectado` cai, para o HUD avisar. O snapshot seguinte religa.
  if (tipo === 'erro') return estado.conectado ? { ...estado, conectado: false } : estado;
  if (!dados || typeof dados !== 'object') return estado;

  if (tipo === 'snapshot') {
    return {
      seq: Number.isInteger(dados.seq) ? dados.seq : 0,
      advogados: Array.isArray(dados.advogados) ? dados.advogados : [],
      estagiarios: Array.isArray(dados.estagiarios) ? dados.estagiarios : [],
      salas: Array.isArray(dados.salas) ? dados.salas : [],
      saude: dados.saude ?? {},
      crachas: dados.crachas ?? null,
      temSnapshot: true,
      precisaReconectar: false,
      conectado: true,
    };
  }

  if (!TIPOS.includes(tipo)) return estado;
  if (!estado.temSnapshot) return estado; // delta antes do snapshot: ignora
  if (!Number.isInteger(dados.seq)) return estado;
  if (dados.seq <= estado.seq) return estado; // atrasado: descarta
  if (dados.seq > estado.seq + 1) return { ...estado, precisaReconectar: true }; // salto: pede snapshot novo

  const base = { ...estado, seq: dados.seq };
  if (tipo === 'advogado' && dados.advogado?.id) return { ...base, advogados: substituir(estado.advogados, dados.advogado) };
  if (tipo === 'estagiario' && dados.estagiario?.id) return { ...base, estagiarios: substituir(estado.estagiarios, dados.estagiario) };
  if (tipo === 'remover' && dados.id) {
    if (dados.tipo === 'advogado') return { ...base, advogados: estado.advogados.filter((a) => a.id !== dados.id) };
    if (dados.tipo === 'estagiario') return { ...base, estagiarios: estado.estagiarios.filter((e) => e.id !== dados.id) };
    return base;
  }
  if (tipo === 'saude') return { ...base, saude: dados.saude ?? {} };
  return base;
}

/**
 * Liga o redutor a um EventSource. `criarFonte` devolve algo com
 * addEventListener(tipo, fn), onerror e close() — o EventSource do navegador serve.
 */
export function criarClienteFluxo({ criarFonte, aoEstado = () => {}, aoErro = () => {} }) {
  let estado = estadoInicial();
  let fonte = null;
  let vivo = true;

  function receber(tipo, texto) {
    let dados;
    try {
      dados = JSON.parse(texto);
    } catch {
      aoErro('mensagem do fluxo com JSON inválido');
      return;
    }
    const novo = aplicarMensagem(estado, tipo, dados);
    if (novo === estado) return;
    estado = novo;
    if (estado.precisaReconectar) {
      aoErro('salto de seq no fluxo; reabrindo a conexão');
      reconectar();
      return;
    }
    aoEstado(estado);
  }

  function abrir() {
    fonte = criarFonte();
    for (const tipo of TIPOS) fonte.addEventListener(tipo, (ev) => receber(tipo, ev.data));
    fonte.addEventListener('error', () => {
      aoErro('fluxo caiu; o EventSource reconecta sozinho');
      const novo = aplicarMensagem(estado, 'erro');
      if (novo === estado) return;
      estado = novo;
      aoEstado(estado);
    });
  }

  function reconectar() {
    try {
      fonte?.close();
    } catch {
      /* já fechado */
    }
    estado = estadoInicial();
    if (vivo) abrir();
  }

  abrir();

  return {
    get estado() {
      return estado;
    },
    reconectar,
    fechar() {
      vivo = false;
      try {
        fonte?.close();
      } catch {
        /* já fechado */
      }
    },
  };
}
