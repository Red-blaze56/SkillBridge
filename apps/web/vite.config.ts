import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // In development the API runs separately. Serving it under the same origin
    // keeps the httpOnly session cookie first-party.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
