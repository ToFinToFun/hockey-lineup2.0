import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  plugins: [react()],
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
    projects: [
      // Servertesterna delar databasen (bl.a. Lineups enda dokument) och körs därför
      // en fil i taget – parallellt kunde de skriva över varandras uppställning.
      { extends: true, test: { name: "server", include: ["server/**/*.test.ts", "server/**/*.spec.ts", "test/**/*.test.ts"], fileParallelism: false } },
      { extends: true, test: { name: "klient", include: ["client/src/**/*.test.ts", "client/src/**/*.test.tsx", "shared/**/*.test.ts"] } },
    ],
  },
});
