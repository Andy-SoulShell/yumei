import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    // Extra host for tunnel-based testing (e.g. trycloudflare.com), set via
    // VITE_EXTRA_ALLOWED_HOST. Production serves static files and doesn't
    // consult this list.
    allowedHosts: process.env.VITE_EXTRA_ALLOWED_HOST
      ? [process.env.VITE_EXTRA_ALLOWED_HOST, "localhost", "127.0.0.1"]
      : ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
