import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      // Phase-1a-ii adds the first client unit test (sanitize). Tests under
      // client/** opt into the jsdom environment per-file via a
      // `// @vitest-environment jsdom` comment at the top of the file.
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
