import { execFileSync } from 'node:child_process';
import { copyFile, chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const outfile = path.join(dist, 'AiMerc-Pedidos-Agent');
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
const postjectArgs = [
  postject,
  outfile,
  'NODE_SEA_BLOB',
  path.join(dist, 'agent.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
];

if (process.platform === 'darwin') postjectArgs.push('--macho-segment-name', 'NODE_SEA');

execFileSync(nodeBinary, postjectArgs, { cwd: root, stdio: 'inherit' });
await chmod(outfile, 0o755);

if (process.platform === 'darwin') {
  try {
    execFileSync('codesign', ['--sign', '-', '--force', '--deep', outfile], { stdio: 'inherit' });
  } catch (error) {
    console.warn('Aviso: codesign ad-hoc falhou; o macOS pode pedir liberacao manual em Privacidade e Seguranca.');
    console.warn(String(error.message || error));
  }
}

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
  `AiMerc Pedidos Agent (macOS)

1. Copie .env.example para .env na MESMA pasta deste executavel
2. Coloque o MESMO email/senha do painel web
3. Coloque PRINTER_HOST = IP da termica na rede da loja
4. No Terminal:
   cd "${dist}"
   ./AiMerc-Pedidos-Agent

O agent conecta na VPS por WebSocket e imprime pedidos novos sozinho.

Teste:
   ./AiMerc-Pedidos-Agent --test-print

Health:
   http://127.0.0.1:4177/health
`,
  'utf8'
);

console.log(`Executavel Mac criado: ${outfile}`);
