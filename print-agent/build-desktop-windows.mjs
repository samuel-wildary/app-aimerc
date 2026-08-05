import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.join(root, 'dist-desktop');
const packager = require('electron-packager');

await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });

const appPaths = await packager({
  dir: root,
  name: 'AiMerc Pedidos Agent',
  platform: 'win32',
  arch: 'x64',
  out: outRoot,
  overwrite: true,
  prune: true,
  ignore: [/dist($|\/)/, /dist-desktop($|\/)/, /\.env$/]
});

const built = appPaths[0];
const zipName = 'AiMerc-Pedidos-Agent-Windows.zip';
const zipPath = path.join(outRoot, zipName);
const folderName = path.basename(built);

if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path "${built}" -DestinationPath "${zipPath}" -Force`],
    { stdio: 'inherit' }
  );
} else {
  execFileSync('zip', ['-r', zipName, folderName], { cwd: outRoot, stdio: 'inherit' });
}

console.log(`Pacote Windows criado: ${zipPath}`);
