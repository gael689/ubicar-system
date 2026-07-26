import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/cotizacion/',
  build: {
    outDir: 'dist-cotizador',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'cotizador.html'),
    },
  },
});
