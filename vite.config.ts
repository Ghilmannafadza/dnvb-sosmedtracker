import path from 'node:path';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Saat `npm run dev`, endpoint di folder /api (Vercel Serverless Functions) dijalankan langsung
 * oleh Vite, sehingga cukup satu perintah untuk frontend + backend. Di Vercel, folder /api
 * otomatis menjadi serverless functions.
 */
function devApi(): Plugin {
  return {
    name: 'dnvb-sosmedtracker-dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const name = req.url.slice(5).split('?')[0].replace(/\/$/, '');
        if (!/^[a-z-]+$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          await mod.default(req, res);
        } catch (e) {
          server.config.logger.error(String((e as Error)?.stack || e));
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String((e as Error)?.message || e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Muat .env / .env.local ke process.env agar handler API bisa membaca kunci
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  return {
    plugins: [react(), tailwindcss(), devApi()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          dashboard: path.resolve(__dirname, 'dashboard.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
