import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/health": "http://localhost:8000",
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/phases": "http://localhost:8000",
      "/scan": "http://localhost:8000",
      "/targets": "http://localhost:8000",
      "/sessions": "http://localhost:8000",
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
