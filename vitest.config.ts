import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [".test/**/*.test.ts"],
    exclude: ["**/*.infra.test.ts", "node_modules", "build"],
    globals: true,
  },
});
