import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Permission/isolation tests hit a real local Postgres + MinIO and share
    // seeded rows — keep them sequential to avoid interleaving audit-log
    // assertions across test files.
    fileParallelism: false,
  },
});
