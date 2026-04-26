import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      events: "events/"
    }
  },
  build: {
    outDir: "dist/frontend",
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/display-config": "http://127.0.0.1:3000",
      "/healthz": "http://127.0.0.1:3000",
      "/config.json": "http://127.0.0.1:3000",
      "/config.js": "http://127.0.0.1:3000",
      "/debug": "http://127.0.0.1:3000",
      "/touch": {
        target: "ws://127.0.0.1:3000",
        ws: true
      }
    }
  }
});
