import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: the browser talks to :5173 only; /api is proxied to the Express server,
// so cookies are same-origin and Origin === CLIENT_ORIGIN in server/.env.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.js', css: false },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
