import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

if (process.platform !== 'win32') {
  console.error('build:windows precisa rodar em um Windows (usa o node.exe local).');
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const outfile = path.join(dist, 'AiMerc-Pedidos-Agent.exe');
const nodeBinary = process.execPath;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'index.js')],
  outfile: path.join(dist, 'agent.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: false
});

execFileSync(nodeBinary, ['--experimental-sea-config', path.join(root, 'sea-config.json')], {
  cwd: root,
  stdio: 'inherit'
});

await copyFile(nodeBinary, outfile);

const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js');
execFileSync(nodeBinary, [
  postject,
  outfile,
  'NODE_SEA_BLOB',
  path.join(dist, 'agent.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
], { cwd: root, stdio: 'inherit' });

await writeFile(
  path.join(dist, '.env.example'),
  `AIMERC_API_URL=https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/api
AIMERC_EMAIL=gestor@sua-loja.com
AIMERC_PASSWORD=sua_senha
PRINTER_HOST=192.168.1.50
PRINTER_PORT=9100
HEALTH_PORT=4177
`,
  'utf8'
);

await writeFile(
  path.join(dist, 'LEIA-ME.txt'),
  `AiMerc Pedidos Agent (Windows)

1. Copie .env.example para .env na MESMA pasta do AiMerc-Pedidos-Agent.exe
2. Coloque o MESMO email/senha do painel web
3. Coloque PRINTER_HOST = IP da termica na rede da loja
4. Execute AiMerc-Pedidos-Agent.exe

Teste:
  AiMerc-Pedidos-Agent.exe --test-print

Health:
  http://127.0.0.1:4177/health
`,
  'utf8'
);

console.log(`Executavel Windows criado: ${outfile}`);
