// Cores das entidades num único lugar. Placeholders (render), pontos de saúde e crachá (HUD)
// importam daqui; estilo.css fica só com o chrome do HUD (fundo da página, bordas, fontes).

export const CORES = Object.freeze({
  cargo: Object.freeze({
    socio: '#25324f',
    senior: '#3d3f44',
    associado: '#6d6f75',
    junior: '#a8aab0',
    advogado: '#87898f',
    estagiario: '#3f7d52',
  }),
  sala: Object.freeze({
    recepcao: '#8a6f4a',
    biblioteca: '#46698c',
    gabinete: '#7b5b8c',
    revisao: '#8c5b5b',
    cartorio: '#5b8c74',
    reunioes: '#8c7b46',
    copa: '#468c83',
  }),
  piso: Object.freeze({
    'piso-madeira': '#3a3228',
    'piso-carpete': '#2f3a3a',
    'piso-parede': '#1d1b17',
    'piso-porta': '#6b563a',
    'piso-tapete': '#4a3a30',
  }),
  // Ponto de saúde na barra: corDaSaude (hud-util) devolve verde/cinza/vermelho → ok/semEventos/erro.
  saude: Object.freeze({ ok: '#3fa45b', semEventos: '#6b6b6b', erro: '#c2483e' }),
  crachaPadrao: '#8a8a8a',
  fundo: '#17150f',
  texto: '#e8e2d2',
  balao: '#26241c',
});
