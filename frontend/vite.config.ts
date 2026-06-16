import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 42000,
    proxy: {
      '/api': {
        target: 'http://localhost:42001',
        changeOrigin: true,
      },
    },
  },
});
