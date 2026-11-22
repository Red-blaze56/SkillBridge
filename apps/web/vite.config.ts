import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // In development the API runs separately. Serving it under the same origin
    // keeps the sign-in cookie simple once Firebase lands.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
