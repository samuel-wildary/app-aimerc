import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const intervalMs = Number(process.env.QUEIROZ_SYNC_INTERVAL_MS || 5 * 60 * 1_000);
const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sync-queiroz.js');
let running = false;

async function synchronize() {
  if (running) return;
  running = true;
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] Iniciando sincronizacao Queiroz`);

  await new Promise(resolve => {
    const child = spawn(process.execPath, [scriptPath], { env: process.env, stdio: 'inherit' });
    child.on('error', error => console.error('Falha ao iniciar sincronizacao:', error));
    child.on('exit', code => {
      if (code !== 0) console.error(`Sincronizacao finalizada com codigo ${code}`);
      resolve();
    });
  });

  running = false;
}

await synchronize();
setInterval(synchronize, intervalMs);
console.log(`Sincronizacao automatica ativa a cada ${Math.round(intervalMs / 60_000)} minutos.`);
