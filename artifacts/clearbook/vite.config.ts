import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import compression from 'compression';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

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
 * The dev server sends unminified modules and the platform proxy does not compress them, so a
 * cold load of the WebGL pages moved about 13 MB. Gzip on the dev middleware cuts that to a
 * quarter. Production is served as static files by the platform, which compresses on its own.
 */
function devCompression(): Plugin {
  return {
    name: 'clearbook-dev-compression',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(compression({ threshold: 1024 }));
    },
  };
}

/** Third party code split by how often it changes and by which pages need it. */
function vendorChunk(rawId: string): string | undefined {
  // Virtual ids (the preload helper, CommonJS interop wrappers) carry a \0 prefix and a query.
  // They are grouped by the package they wrap so the entry never waits on a scene chunk.
  const id = rawId.replace(/^\0/, '').split('?')[0] ?? rawId;
  if (/vite\/(preload-helper|modulepreload-polyfill)|commonjsHelpers/.test(id)) return 'react';
  if (!id.includes('node_modules')) return undefined;
  if (/node_modules\/three\//.test(id)) return 'three';
  if (/node_modules\/(@react-three\/postprocessing|postprocessing)\//.test(id)) return 'postfx';
  if (/node_modules\/(@react-three\/(drei|fiber)|troika-[a-z-]+|three-stdlib|three-mesh-bvh|zustand|suspend-react|its-fine|@use-gesture|maath|detect-gpu|camera-controls|meshline|tunnel-rat|stats-gl|stats\.js|hls\.js|@monogrid|webgl-sdf-generator|bidi-js)\//.test(id)) return 'drei';
  if (/node_modules\/(framer-motion|motion-dom|motion-utils|lenis)\//.test(id)) return 'motion';
  if (/node_modules\/(react|react-dom|scheduler|wouter|regexparam|mitt|use-sync-external-store|@tanstack\/(react-query|query-core))\//.test(id)) return 'react';
  return undefined;
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    devCompression(),
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
    // three alone is above the default warning size. It is split into its own cached chunk.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle everything the lazy scene chunks need at startup. Otherwise Vite discovers them
    // on first use, re-optimizes and reloads the page while it is loading.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'wouter',
      '@tanstack/react-query',
      'framer-motion',
      'lenis',
      'date-fns',
      'lucide-react',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/postprocessing',
      'postprocessing',
      '@wallet-standard/app',
      'bs58',
    ],
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/pages/home.tsx',
        './src/components/three/story-scene.tsx',
        './src/components/three/strata-scene.tsx',
      ],
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
