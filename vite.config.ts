import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    // Ignora el VITE_API_URL del .env local para que los tests no dependan de la máquina.
    env: { VITE_API_URL: '/api' },
    // Cada worker de jsdom consume bastante memoria: con un worker por núcleo la suite
    // se queda sin RAM en máquinas de 8 GB (WSL) y aparecen timeouts intermitentes.
    maxWorkers: 4,
    // Los specs de Playwright (e2e/**/*.spec.ts) corren con `npm run test:e2e`, no con vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
