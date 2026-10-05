import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // The API the dev proxy forwards to. VITE_API_URL keeps its meaning: it says
  // where the API is, and the browser never talks to it directly in dev.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env.VITE_API_URL || 'http://localhost:3000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': new URL('./src', import.meta.url).pathname },
    },
    // strictPort: without it Vite quietly hops to 5174 when 5173 is taken, and
    // the API's CORS (WEB_ORIGIN, default http://localhost:5173) then rejects
    // every request. Failing loudly is better than a half-working app.
    // Requests to /api/* are forwarded to the API and the prefix is stripped, so
    // the browser only ever sees the 5173 origin: same-origin, no CORS.
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    preview: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
  };
});
