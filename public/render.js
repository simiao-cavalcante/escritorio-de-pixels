// Desenho do escritório no Canvas 2D. Recebe o contexto pronto: nada de DOM aqui.

import { TILE, COLUNAS, LINHAS, LARGURA, ALTURA, SALAS, ORDEM_SALAS, tipoDePiso } from './mundo.js';
import { idPersonagem } from './sprites.js';
import { CORES } from './cores.js';
import { crachaDe, descreverAtividade, truncar } from './hud-util.js';

export const ALTURA_PERSONAGEM = 48;
export const LARGURA_PERSONAGEM = 32;
export const ESCALA_ESTAGIARIO = 0.75;

const INDICADORES = Object.freeze({ pensando: '…', ocioso: 'zzz', aguardando: '?' });
const INDICADOR_DESATUALIZADO = '⏱';

function desenharPisos(ctx, sprites) {
  for (let x = 0; x < COLUNAS; x += 1) {
    for (let y = 0; y < LINHAS; y += 1) {
      const id = tipoDePiso(x, y);
      const quadro = sprites.quadro(id);
      if (quadro) {
        ctx.drawImage(quadro.imagem, x * TILE, y * TILE, TILE, TILE);
        continue;
      }
      ctx.fillStyle = CORES.piso[id] ?? CORES.piso['piso-madeira'];
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      if (id !== 'piso-parede' && (x + y) % 2 === 0) {
        ctx.fillStyle = CORES.quadriculado; // quadriculado sutil
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
}

function desenharMovel(ctx, sprites, movel, sala) {
  const quadro = sprites.quadro(movel.sprite);
  if (quadro) {
    // Ancorado pelo centro da base: bate com a âncora do quadro no centro-base da tile.
    const x = (movel.x + 0.5) * TILE - quadro.ancora.x;
    const y = (movel.y + 1) * TILE - quadro.ancora.y;
    ctx.drawImage(quadro.imagem, x, y, quadro.w, quadro.h);
    return;
  }
  ctx.fillStyle = CORES.sala[sala] ?? CORES.crachaPadrao;
  ctx.fillRect(movel.x * TILE + 4, movel.y * TILE + 8, TILE - 8, TILE - 12);
  ctx.strokeStyle = CORES.contornoMovel;
  ctx.strokeRect(movel.x * TILE + 4, movel.y * TILE + 8, TILE - 8, TILE - 12);
}

function desenharSalas(ctx, cena) {
  const rotulos = new Map((cena.salas ?? []).map((s) => [s.id, s.rotulo]));
  for (const id of ORDEM_SALAS) {
    const sala = SALAS[id];
    ctx.strokeStyle = CORES.sala[id];
    ctx.lineWidth = 2;
    ctx.strokeRect(sala.x0 * TILE + 1, sala.y0 * TILE + 1, (sala.x1 - sala.x0 + 1) * TILE - 2, (sala.y1 - sala.y0 + 1) * TILE - 2);
    for (const movel of sala.decoracao) desenharMovel(ctx, cena.sprites, movel, id);
    for (const posto of sala.postos) if (posto.movel) desenharMovel(ctx, cena.sprites, posto.movel, id);
    ctx.fillStyle = CORES.texto;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(cena.i18n.sala(id, rotulos.get(id)).toUpperCase(), sala.x0 * TILE + 6, sala.y0 * TILE + 14);
  }
}

function desenharPlaceholderPersonagem(ctx, ator, escala) {
  const l = LARGURA_PERSONAGEM * escala;
  const a = ALTURA_PERSONAGEM * escala;
  ctx.fillStyle = CORES.cargo[ator.cargo] ?? CORES.cargo.advogado;
  ctx.fillRect(-l / 2 + l * 0.2, -a + a * 0.35, l * 0.6, a * 0.65); // corpo
  ctx.beginPath();
  ctx.arc(0, -a + a * 0.25, l * 0.22, 0, Math.PI * 2); // cabeça
  ctx.fill();
  ctx.fillStyle = CORES.sombra;
  ctx.fillRect(-l / 2, -2, l, 3); // sombra
}

function desenharCracha(ctx, ator, cena, escala) {
  const cracha = crachaDe(cena.crachas, ator.cli);
  const a = ALTURA_PERSONAGEM * escala;
  ctx.fillStyle = cracha.cor;
  ctx.fillRect(-6, -a + a * 0.45, 12, 8);
  ctx.fillStyle = CORES.crachaTexto;
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(cracha.sigla, 0, -a + a * 0.45 + 6);
}

function desenharBalao(ctx, texto, cima) {
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const largura = Math.max(24, texto.length * 5.4 + 10);
  ctx.fillStyle = CORES.balao;
  ctx.fillRect(-largura / 2, cima - 13, largura, 13);
  ctx.strokeStyle = CORES.contornoBalao;
  ctx.lineWidth = 1;
  ctx.strokeRect(-largura / 2, cima - 13, largura, 13);
  ctx.fillStyle = CORES.texto;
  ctx.fillText(texto, 0, cima - 3);
}

function desenharAtor(ctx, ator, cena) {
  const escala = ator.tipo === 'estagiario' ? ESCALA_ESTAGIARIO : 1;
  const balanco = cena.reduzirMovimento ? 0 : Math.sin(ator.fase / (ator.andando ? 90 : 320)) * (ator.andando ? 2 : 1);
  const px = ator.x * TILE + TILE / 2;
  const py = ator.y * TILE + TILE;

  ctx.save();
  ctx.translate(px, py + balanco);
  ctx.scale(ator.direcao < 0 ? -1 : 1, 1);
  const id = idPersonagem(ator.cargo, ator.id);
  const quadro = cena.sprites.quadro(id);
  if (quadro) {
    ctx.drawImage(quadro.imagem, -quadro.ancora.x * escala, -quadro.ancora.y * escala, quadro.w * escala, quadro.h * escala);
  } else {
    desenharPlaceholderPersonagem(ctx, ator, escala);
  }
  ctx.restore();

  // Crachá, rótulo, balão e indicador não espelham: desenhados sem a escala negativa.
  ctx.save();
  ctx.translate(px, py + balanco);
  desenharCracha(ctx, ator, cena, escala);
  const entidade = ator.entidade ?? {};
  const alturaTopo = -ALTURA_PERSONAGEM * escala;
  if (ator.tipo === 'advogado' && entidade.projeto) {
    ctx.fillStyle = CORES.rotuloProjeto;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(truncar(entidade.projeto, 14), 0, 10);
  }
  if (entidade.estado === 'trabalhando') {
    const texto = descreverAtividade(entidade.atividade, 24);
    if (texto) desenharBalao(ctx, texto, alturaTopo - 4);
  }
  const indicador = entidade.desatualizado ? INDICADOR_DESATUALIZADO : INDICADORES[entidade.estado];
  if (indicador) {
    ctx.fillStyle = CORES.texto;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(indicador, 0, alturaTopo - 2);
  }
  ctx.restore();

  // Overlay de digitação: retângulo piscando na mesa do posto.
  if (entidade.estado === 'trabalhando' && ator.alvo?.movel) {
    const piscando = cena.reduzirMovimento || Math.floor(cena.tempo / 400) % 2 === 0;
    if (piscando) {
      ctx.fillStyle = CORES.digitacao;
      ctx.fillRect(ator.alvo.movel.x * TILE + 10, ator.alvo.movel.y * TILE + 10, 12, 8);
    }
  }
}

/** Desenha uma cena inteira: pisos, salas, móveis e atores ordenados por profundidade. */
export function desenharCena(ctx, cena) {
  ctx.clearRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = CORES.fundo;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  desenharPisos(ctx, cena.sprites);
  desenharSalas(ctx, cena);
  const atores = [...cena.atores].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  for (const ator of atores) desenharAtor(ctx, ator, cena);
}

/** Converte um ponto do canvas (já em coordenadas lógicas) no ator clicado, se houver. */
export function atorEm(atores, x, y) {
  const candidatos = [...atores].sort((a, b) => b.y - a.y);
  for (const ator of candidatos) {
    const escala = ator.tipo === 'estagiario' ? ESCALA_ESTAGIARIO : 1;
    const px = ator.x * TILE + TILE / 2;
    const py = ator.y * TILE + TILE;
    const l = LARGURA_PERSONAGEM * escala;
    const a = ALTURA_PERSONAGEM * escala;
    if (x >= px - l / 2 && x <= px + l / 2 && y >= py - a && y <= py) return ator;
  }
  return null;
}
