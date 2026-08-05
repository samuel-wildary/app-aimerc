/** Re-export global WebSocket (Node 20+ / undici). */
export const WebSocket = globalThis.WebSocket;

if (typeof WebSocket !== 'function') {
  throw new Error('WebSocket global indisponivel. Use Node.js 20 ou superior.');
}
