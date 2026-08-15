import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4201,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host',
        changeOrigin: true,
        secure: false,
        headers: {
          Origin: 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host',
          Referer: 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host/'
        }
      },
      '/realtime': {
        target: 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host',
        changeOrigin: true,
        secure: false,
        ws: true,
        headers: {
          Origin: 'https://wildhub-aimerc-backend-app.5mos1l.easypanel.host'
        }
      }
    }
  }
});
