import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root: `${root}apps/web`,
  publicDir: `${root}public`,
  plugins: [react()],
  resolve: { alias: { '@': root } },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT || 4173),
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT || 4174}`,
        headers: {
          'x-receivables-gateway': process.env.GATEWAY_TOKEN || '',
          'x-receivables-origin': `http://127.0.0.1:${process.env.WEB_PORT || 4173}`,
        },
      },
    },
  },
  build: {
    outDir: `${root}.selfhost-build/web`,
    emptyOutDir: true,
    sourcemap: false,
  },
});
