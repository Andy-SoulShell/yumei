import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// Manus template plugins removed (M4 cleanup): vite-plugin-manus-runtime
// (injected a Manus runtime script into every page) and an in-house
// "manus-debug-collector" that shipped browser logs to /__manus__/*.
const plugins = [react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
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
