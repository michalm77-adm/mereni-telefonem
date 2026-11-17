import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base so the same build works on GitHub Pages (/<repo>/) and locally.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    // Allow the phone to open the dev server via the PC's LAN IP.
    allowedHosts: true,
    watch: { usePolling: true, interval: 1000 },
    proxy: {
      // Dev only: forward the PeerJS signalling (HTTP + WebSocket) to the local peer server.
      "/peerjs": {
        target: process.env.PEER_SERVER_URL ?? "http://localhost:9000",
        ws: true,
      },
    },
  },
});
