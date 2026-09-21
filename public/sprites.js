// Atlas de arte (Plano 3) com placeholders procedurais quando os PNGs não existem.
// Sem DOM: `buscar` (fetch) e `carregarImagem` são injetados.

export const CARGOS_SPRITE = Object.freeze(['socio', 'senior', 'associado', 'junior', 'advogado', 'estagiario']);

/** FNV-1a: mesmo id, mesma variação, em qualquer navegador. */
export function hashEstavel(texto) {
  let h = 2166136261;
  const s = String(texto ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function variacao(id) {
  return hashEstavel(id) % 2 === 0 ? 'a' : 'b';
}

export function idPersonagem(cargo, idEntidade) {
  const papel = CARGOS_SPRITE.includes(cargo) ? cargo : 'advogado';
  return `personagem-${papel}-${variacao(idEntidade)}`;
}

export function criarSprites({ buscar, carregarImagem, base = 'arte/', avisar = () => {} } = {}) {
  const quadros = new Map();
  let temAtlas = false;
  const avisados = new Set();

  function avisarUmaVez(mensagem) {
    if (avisados.has(mensagem)) return;
    avisados.add(mensagem);
    avisar(mensagem);
  }

  async function carregar() {
    try {
      const resposta = await buscar(`${base}atlas.json`);
      if (!resposta || !resposta.ok) throw new Error(`atlas.json indisponível (${resposta?.status ?? 'sem resposta'})`);
      const lista = await resposta.json();
      if (!Array.isArray(lista)) throw new Error('atlas.json não é uma lista');
      await Promise.all(lista.map(async (item) => {
        if (!item || typeof item.id !== 'string' || typeof item.arquivo !== 'string') return;
        try {
          const imagem = await carregarImagem(`${base}${item.arquivo}`);
          quadros.set(item.id, {
            id: item.id,
            categoria: item.categoria ?? 'movel',
            w: item.w ?? 32,
            h: item.h ?? 32,
            ancora: item.ancora ?? { x: Math.round((item.w ?? 32) / 2), y: item.h ?? 32 },
            imagem,
          });
        } catch (erro) {
          avisarUmaVez(`sprite ${item.id} não carregou (${erro.message}); usando placeholder`);
        }
      }));
      temAtlas = quadros.size > 0;
      if (!temAtlas) avisarUmaVez('atlas vazio; desenhando placeholders procedurais');
    } catch (erro) {
      avisarUmaVez(`sem arte em ${base} (${erro.message}); desenhando placeholders procedurais`);
    }
    return temAtlas;
  }

  /** Quadro do atlas ou null (o render desenha o placeholder). */
  function quadro(id) {
    const achado = quadros.get(id);
    if (achado) return achado;
    if (temAtlas) avisarUmaVez(`sprite ${id} não está no atlas; usando placeholder`);
    return null;
  }

  return {
    carregar,
    quadro,
    idPersonagem,
    get temAtlas() {
      return temAtlas;
    },
    get avisos() {
      return [...avisados];
    },
  };
}
