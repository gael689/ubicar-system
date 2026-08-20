import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Configuración de tests.
 *
 * **Va aparte de `vite.config.ts`** y no como una clave `test` adentro suyo:
 * ese archivo lo consume el build de producción, y meterle la config de tests
 * obliga a que `vitest` sea una dependencia del build. Separarlos deja el
 * build exactamente como estaba.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Sólo los tests propios: `node_modules` tiene miles de archivos `.test.`
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
