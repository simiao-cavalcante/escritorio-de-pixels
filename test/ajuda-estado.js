// Ajudantes compartilhados pelos testes de estado (estado, estado-tempo, estado-estagiarios).
// Módulo sem `test()`: importar daqui não reexecuta a suíte de estado três vezes.
import { Escritorio } from '../src/estado.js';

const SALAS_FIXAS = { Read: 'biblioteca', Edit: 'gabinete', Bash: 'cartorio', Agent: 'reunioes' };

/** Escritório com relógio, salas e cargos fixos; `esc.avancar(ms)` move o relógio. */
export function novo(extra = {}) {
  let t = 1_000_000;
  const esc = new Escritorio({
    agora: () => t,
    resolverSala: (f) => SALAS_FIXAS[f.nome] ?? 'recepcao',
    salaInicialEstagiario: (tipo) => (/review/i.test(tipo ?? '') ? 'revisao' : 'reunioes'),
    cargoDoModelo: (m) => (m?.includes('opus') ? 'senior' : m ? 'associado' : 'advogado'),
    ...extra,
  });
  esc.avancar = (ms) => { t += ms; };
  return esc;
}

export const ev = (tipo, extra = {}) => ({ v: 1, tipo, cli: 'claude', sessao: 's1', ts: '2026-09-20T12:00:00.000Z', ...extra });
export const adv = (esc, id = 'claude:s1') => esc.snapshot().advogados.find((a) => a.id === id);
