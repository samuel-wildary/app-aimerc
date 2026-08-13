import net from 'node:net';
import fs from 'node:fs';

export function sendRawToPrinter(host, port, payload, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const target = (host || '').trim();
    
    // Se for caminho de rede Windows (\\localhost\Impressora) ou porta local (COM3, LPT1)
    if (target.startsWith('\\\\') || target.startsWith('//') || /^(COM|LPT)\d+$/i.test(target)) {
      fs.writeFile(target, payload, (err) => {
        if (err) reject(new Error(`Falha ao imprimir em ${target}: ${err.message}`));
        else resolve();
      });
      return;
    }

    // Comportamento original para rede (IP/Host e Porta)
    const socket = net.createConnection({ host: target, port: Number(port) }, () => {
      socket.write(payload, error => {
        if (error) {
          socket.destroy();
          reject(error);
          return;
        }
        socket.end();
      });
    });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout ao conectar na impressora ${target}:${port}`));
    }, timeoutMs);

    socket.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });

    socket.on('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
