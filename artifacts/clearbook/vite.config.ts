import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import fs from 'fs';
import type { Plugin } from 'vite';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

/**
 * Development only. The landing scene posts what the visitor's browser rendered (see
 * src/components/three/capture-probe.tsx) and this writes it under /tmp/captures so the scene can
 * be checked on a real GPU from the workspace. Dev server middleware never ships in a build.
 */
function captureSink(base: string): Plugin {
  const route = `${base.replace(/\/$/, '')}/__capture`;
  return {
    name: 'clearbook-capture-sink',
    configureServer(server) {
      server.middlewares.use(route, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 16e6) req.destroy();
        });
        req.on('end', () => {
          try {
            const { name, meta, image } = JSON.parse(body) as { name?: string; meta?: unknown; image?: string };
            const dir = '/tmp/captures';
            fs.mkdirSync(dir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const safe = String(name ?? 'capture').replace(/[^a-z0-9-]/gi, '');
            fs.writeFileSync(`${dir}/${stamp}-${safe}.json`, JSON.stringify(meta ?? null, null, 2));
            if (typeof image === 'string' && image.startsWith('data:image/')) {
              fs.writeFileSync(`${dir}/${stamp}-${safe}.jpg`, Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'));
            }
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    captureSink(basePath),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Outside Replit there is no platform proxy in front of the two services.
    // Set API_PROXY_TARGET (for example http://localhost:8080) to forward /api calls.
    ...(process.env.API_PROXY_TARGET
      ? {
          proxy: {
            [`${basePath.replace(/\/$/, '')}/api`]: {
              target: process.env.API_PROXY_TARGET,
              changeOrigin: true,
              rewrite: (p: string) => p.replace(basePath.replace(/\/$/, ''), ''),
            },
          },
        }
      : {}),
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
