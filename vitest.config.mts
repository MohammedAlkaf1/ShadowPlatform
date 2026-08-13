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
    // next-auth is left as an externalized Node import by default, so its
    // internal `import ... from "next/server"` (no extension) hits Node's
    // strict ESM resolver directly and fails ("Cannot find module") even
    // though the file exists as next/server.js — Next's own webpack/
    // Turbopack tooling resolves this transparently, Vitest's default
    // Node-native resolution for externals doesn't. Inlining next-auth
    // routes it through Vite's own resolver instead, which handles this
    // correctly. Only route handlers that transitively import "@/auth"
    // (the real NextAuth instance, via src/lib/session.ts) hit this at
    // module-load time, regardless of which auth path a given test
    // actually exercises.
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
    // Permission/isolation tests hit a real local Postgres + MinIO and share
    // seeded rows — keep them sequential to avoid interleaving audit-log
    // assertions across test files.
    fileParallelism: false,
  },
});
