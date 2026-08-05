import net from 'node:net';

export function sendRawToPrinter(host, port, payload, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) }, () => {
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
      reject(new Error(`Timeout ao conectar na impressora ${host}:${port}`));
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
