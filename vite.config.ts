import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import bedrockVerificationPlugin from './scripts/bedrock-verification-plugin.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), bedrockVerificationPlugin()],
    server: { host: '127.0.0.1' },
    preview: { host: '127.0.0.1' },
    test: { include: ['src/**/*.{test,spec}.{ts,tsx}'] },
  };
});
