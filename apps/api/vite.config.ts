import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig(({ mode }) => {
  const testing = mode === 'integrity-test';
  const input: Record<string, string> = testing
    ? { server: 'tests/support/node-server.ts' }
    : {
        server: 'apps/api/src/main.ts',
        admin: 'apps/api/src/admin-cli.ts',
        backup: 'apps/api/src/backup-cli.ts',
      };
  return {
    root,
    resolve: {
      alias: {
        '@': root,
        '@runtime/storage': `${root}${testing ? 'tests/support/node-storage.ts' : 'db/adapters/node.ts'}`,
        '@runtime/session': `${root}${testing ? 'lib/server/demo-session.ts' : 'apps/api/src/session.ts'}`,
      },
    },
    build: {
      ssr: true,
      target: 'node24',
      outDir: testing ? '.selfhost-build/integrity' : '.selfhost-build/api',
      sourcemap: false,
      rolldownOptions: {
        input,
        output: {
          entryFileNames: '[name].mjs',
          chunkFileNames: 'chunks/[name]-[hash].mjs',
        },
      },
    },
  };
});
