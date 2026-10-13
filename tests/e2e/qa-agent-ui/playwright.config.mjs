import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.mjs', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3019', headless: true, trace: 'retain-on-failure' },
  outputDir: '../../../artifacts/QAWEB-005/ui/playwright',
  webServer: {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3019',
    url: 'http://127.0.0.1:3019/qa', reuseExistingServer: false, timeout: 60000,
    env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54389', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-ui-test-public-key' },
  },
});
