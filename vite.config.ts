import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5177,
    // Binds all interfaces (not just loopback) so the app is reachable over
    // Tailscale — see server/index.js for why the Express API side of this
    // stays narrower than 0.0.0.0.
    host: true,
    open: true,
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT || 5178}`,
    },
  },
  preview: {
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT || 5178}`,
    },
  },
});
