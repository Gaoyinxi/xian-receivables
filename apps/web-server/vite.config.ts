import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root,
  ssr: { noExternal: ['zod'] },
  build: {
    ssr: 'apps/web-server/server.ts',
    target: 'node24',
    outDir: `${process.env.RECEIVABLES_BUILD_DIR || '.selfhost-build'}/gateway`,
    rolldownOptions: { output: { entryFileNames: 'server.mjs' } },
  },
});
