// Textos da interface em pt-BR e en. Sem DOM: só dados e funções puras.

export const IDIOMAS = Object.freeze(['pt-BR', 'en']);
export const IDIOMA_PADRAO = 'pt-BR';

export const TEXTOS = Object.freeze({
  'pt-BR': {
    titulo: 'Escritório de Pixels',
    abrirPainel: 'Abrir painel',
    fecharPainel: 'Fechar painel',
    fechar: 'Fechar',
    trocarIdioma: 'English',
    advogado: 'advogado',
    advogados: 'advogados',
    foraDoMapa: 'fora do mapa',
    semAdvogados: 'Nenhuma sessão ativa. Instale os hooks e rode uma CLI.',
    semConexao: 'Sem conexão com o servidor',
    fichaDoCaso: 'Ficha do caso',
    casoAtual: 'Caso atual',
    semCaso: 'sem caso',
    turno: 'Turno',
    cli: 'CLI',
    modelo: 'Modelo',
    cargo: 'Cargo',
    sala: 'Sala',
    avisoSala: 'a sala indica a fase provável',
    acoesRecentes: 'Ações recentes',
    semAcoes: 'sem ações',
    tokens: 'Tokens',
    contexto: 'Contexto',
    janelaDesconhecida: 'janela desconhecida',
    saida: 'Saída',
    estagiarios: 'Estagiários',
    semEstagiarios: 'nenhum estagiário ativo',
    saude: 'Saúde dos adaptadores',
    semEventos: 'sem eventos',
    desconhecido: 'desconhecido',
    semProjeto: 'sem projeto',
  },
  en: {
    titulo: 'Pixel Law Office',
    abrirPainel: 'Open panel',
    fecharPainel: 'Close panel',
    fechar: 'Close',
    trocarIdioma: 'Português',
    advogado: 'lawyer',
    advogados: 'lawyers',
    foraDoMapa: 'off the map',
    semAdvogados: 'No active session. Install the hooks and run a CLI.',
    semConexao: 'No connection to the server',
    fichaDoCaso: 'Case file',
    casoAtual: 'Current case',
    semCaso: 'no case',
    turno: 'Turn',
    cli: 'CLI',
    modelo: 'Model',
    cargo: 'Role',
    sala: 'Room',
    avisoSala: 'the room shows the likely phase',
    acoesRecentes: 'Recent actions',
    semAcoes: 'no actions',
    tokens: 'Tokens',
    contexto: 'Context',
    janelaDesconhecida: 'unknown window',
    saida: 'Output',
    estagiarios: 'Interns',
    semEstagiarios: 'no active intern',
    saude: 'Adapter health',
    semEventos: 'no events',
    desconhecido: 'unknown',
    semProjeto: 'no project',
  },
});

export const CARGOS_TEXTO = Object.freeze({
  'pt-BR': { socio: 'Sócio(a)', senior: 'Advogado(a) sênior', associado: 'Associado(a)', junior: 'Júnior', advogado: 'Advogado(a)', estagiario: 'Estagiário(a)' },
  en: { socio: 'Partner', senior: 'Senior lawyer', associado: 'Associate', junior: 'Junior', advogado: 'Lawyer', estagiario: 'Intern' },
});

export const ESTADOS_TEXTO = Object.freeze({
  'pt-BR': { recepcao: 'na recepção', pensando: 'pensando', trabalhando: 'trabalhando', aguardando: 'aguardando', ocioso: 'ocioso', saiu: 'saiu' },
  en: { recepcao: 'at reception', pensando: 'thinking', trabalhando: 'working', aguardando: 'waiting', ocioso: 'idle', saiu: 'left' },
});

// O servidor manda os rótulos em pt-BR no snapshot; em en traduzimos por id.
export const SALAS_TEXTO = Object.freeze({
  en: { recepcao: 'Reception', biblioteca: 'Library', gabinete: 'Drafting Office', revisao: 'Review Room', cartorio: 'Registry', reunioes: 'Meeting Room', copa: 'Break Room' },
});

export function idiomaDoNavegador(idiomas = []) {
  for (const bruto of idiomas) {
    const lingua = String(bruto ?? '').toLowerCase();
    if (lingua.startsWith('en')) return 'en';
    if (lingua.startsWith('pt')) return IDIOMA_PADRAO;
  }
  return IDIOMA_PADRAO;
}

export function criarI18n(idioma = IDIOMA_PADRAO) {
  const lingua = IDIOMAS.includes(idioma) ? idioma : IDIOMA_PADRAO;
  return {
    idioma: lingua,
    t(chave) {
      return TEXTOS[lingua][chave] ?? TEXTOS[IDIOMA_PADRAO][chave] ?? chave;
    },
    cargo(id) {
      return CARGOS_TEXTO[lingua][id] ?? CARGOS_TEXTO[IDIOMA_PADRAO][id] ?? id;
    },
    estado(id) {
      return ESTADOS_TEXTO[lingua][id] ?? ESTADOS_TEXTO[IDIOMA_PADRAO][id] ?? id;
    },
    sala(id, rotuloDoServidor) {
      if (lingua === 'en') return SALAS_TEXTO.en[id] ?? rotuloDoServidor ?? id;
      return rotuloDoServidor ?? id;
    },
    numero(valor) {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
      const separador = lingua === 'en' ? ',' : '.';
      return Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, separador);
    },
    outro() {
      return lingua === 'en' ? IDIOMA_PADRAO : 'en';
    },
  };
}
