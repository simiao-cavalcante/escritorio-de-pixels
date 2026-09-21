#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { lerConfig, gravarConfig } from './src/config.js';
import { criarAplicacao } from './src/app.js';
import { iniciarDemo } from './src/demo.js';
import { instalar, desinstalar, CLIS } from './src/instalar.js';

const AJUDA = `Escritório de Pixels

  node server.mjs [--porta N] [--demo] [--sem-transcritos] [--ocultar-prompts]
  node server.mjs instalar <cli>      cli: ${CLIS.join(', ')}
  node server.mjs desinstalar <cli>

  --porta N            porta local (padrão 7777; fica salva em ~/.escritorio-de-pixels/config.json)
  --demo               sessões sintéticas; recusa eventos externos
  --sem-transcritos    não lê transcritos para estimar tokens
  --ocultar-prompts    esconde o texto do caso (tela compartilhada, gravação)
`;

export function lerArgs(argv) {
  const a = { comando: undefined, cli: undefined, porta: undefined, demo: false, semTranscritos: false, ocultarPrompts: false };
  for (let i = 0; i < argv.length; i += 1) {
    const x = argv[i];
    if (x === 'instalar' || x === 'desinstalar') {
      a.comando = x;
      a.cli = argv[i + 1];
      i += 1;
    } else if (x === '--porta') {
      a.porta = Number(argv[i + 1]);
      i += 1;
    } else if (x === '--demo') a.demo = true;
    else if (x === '--sem-transcritos') a.semTranscritos = true;
    else if (x === '--ocultar-prompts') a.ocultarPrompts = true;
    else if (x === '--ajuda' || x === '-h' || x === '--help') a.comando = 'ajuda';
    else a.comando = 'ajuda';
  }
  return a;
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  if (args.comando === 'ajuda') {
    process.stdout.write(AJUDA);
    return;
  }
  const config = lerConfig();
  if (args.porta !== undefined && (!Number.isInteger(args.porta) || args.porta < 1 || args.porta > 65535)) {
    process.stderr.write('Porta inválida.\n');
    process.exit(2);
  }
  const porta = args.porta ?? config.porta;
  if (args.porta !== undefined && args.porta !== config.porta) gravarConfig({ ...config, porta });

  if (args.comando === 'instalar' || args.comando === 'desinstalar') {
    if (!CLIS.includes(args.cli)) {
      process.stderr.write(`Informe a CLI: ${CLIS.join(', ')}\n`);
      process.exit(2);
    }
    const r = args.comando === 'instalar' ? instalar(args.cli, { porta }) : desinstalar(args.cli, {});
    process.stdout.write(`${args.comando}: ${r.arquivo} ${r.alterado ? '(alterado)' : '(já estava assim)'}\n`);
    if (r.backup) process.stdout.write(`backup: ${r.backup}\n`);
    if (args.comando === 'instalar' && args.cli === 'codex') {
      process.stdout.write('Codex: na primeira execução ele pede para confiar nos hooks novos; confirme no próprio Codex.\n');
    }
    return;
  }

  const app = criarAplicacao({
    porta, demo: args.demo, semTranscritos: args.semTranscritos, ocultarPrompts: args.ocultarPrompts,
    log: (m) => process.stderr.write(`[escritorio] ${m}\n`),
  });
  try {
    await app.iniciar();
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      process.stderr.write(`Porta ${porta} ocupada. Use --porta <outra> (e rode "instalar" de novo para atualizar os hooks).\n`);
      process.exit(1);
    }
    throw e;
  }
  process.stdout.write(`Escritório de Pixels em http://127.0.0.1:${porta}${args.demo ? ' (demo)' : ''}\n`);
  if (!args.demo && config.portaInstalada !== undefined && config.portaInstalada !== porta) {
    process.stderr.write(`Aviso: os hooks foram instalados para a porta ${config.portaInstalada}; rode "node server.mjs instalar <cli>" para apontá-los à ${porta}.\n`);
  }
  let demo;
  if (args.demo) demo = iniciarDemo((lote) => app.ingerir(lote, 'demo'));
  const sair = async () => {
    demo?.parar();
    await app.fechar();
    process.exit(0);
  };
  process.on('SIGINT', sair);
  process.on('SIGTERM', sair);
}

// Compara caminhos reais (não URLs): funciona com espaços no caminho e com links simbólicos do npm.
const ehPrincipal = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (ehPrincipal) {
  main().catch((e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
