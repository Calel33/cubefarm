import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.SWARM_PORT ?? 4317);
// strictPort: a second office must fail loudly, not quietly take the next port while proxying to this SWARM_PORT.
const clientPort = Number(process.env.SWARM_CLIENT_PORT || 5317);

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    // Deterministic loopback: cloudflared on this machine reaches Vite at 127.0.0.1:clientPort.
    // Does NOT expose the dev server to the LAN.
    host: '127.0.0.1',
    // Narrow allow for the per-start Quick Tunnel hostname (*.trycloudflare.com). Never true (GHSA-vg6x-rcgg-rjx6).
    allowedHosts: ['.trycloudflare.com'],
    port: clientPort,
    strictPort: true,
    proxy: {
      '/api': `http://localhost:${serverPort}`,
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
