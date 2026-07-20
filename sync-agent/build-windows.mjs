import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const installer = path.join(dist, 'AiMerc-Agent-Setup.exe');
const installerScript = await readFile(path.join(root, 'installer', 'configure.ps1'), 'utf8');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await build({
  entryPoints: [path.join(root, 'src', 'index.js')],
  outfile: path.join(dist, 'agent.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  define: { __AIMERC_INSTALLER_SCRIPT__: JSON.stringify(installerScript) }
});

execFileSync(process.execPath, ['--experimental-sea-config', path.join(root, 'sea-config.json')], { cwd: root, stdio: 'inherit' });
await copyFile(process.execPath, installer);
const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js');
execFileSync(process.execPath, [
  postject,
  installer,
  'NODE_SEA_BLOB',
  path.join(dist, 'agent.blob'),
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
], { cwd: root, stdio: 'inherit' });

// Mark the packaged agent as a Windows GUI application so double-clicking it
// does not create a console window behind the configuration form.
const executable = await open(installer, 'r+');
try {
  const dosHeader = Buffer.alloc(64);
  await executable.read(dosHeader, 0, dosHeader.length, 0);
  const peHeaderOffset = dosHeader.readUInt32LE(0x3c);
  const subsystemOffset = peHeaderOffset + 24 + 68;
  const windowsGuiSubsystem = Buffer.alloc(2);
  windowsGuiSubsystem.writeUInt16LE(2, 0);
  await executable.write(windowsGuiSubsystem, 0, 2, subsystemOffset);
} finally {
  await executable.close();
}

console.log(`Instalador criado: ${installer}`);
