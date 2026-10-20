/** 前端构建、开发服务器与共享路径别名配置。 */

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { getLocalAccessHosts } from "./server/_core/authOrigins";

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
    // 和认证共用本机地址白名单，额外域名可通过环境变量补充。
    allowedHosts: getLocalAccessHosts(),
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
