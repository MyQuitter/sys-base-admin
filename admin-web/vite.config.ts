import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import path from 'path';

function normalizeBase(raw?: string) {
  if (!raw || raw === '/') return '/';
  const p = raw.startsWith('/') ? raw : `/${raw}`;
  return p.endsWith('/') ? p : `${p}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: normalizeBase(env.VITE_ADMIN_BASE),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3021',
          changeOrigin: true,
        },
      },
    },
  };
});
