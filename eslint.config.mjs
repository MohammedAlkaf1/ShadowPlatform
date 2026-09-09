import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Production build output dir (see next.config.ts distDir) — kept
    // separate from .next so `next build` can never collide with a live
    // `next dev` server's chunk manifest.
    ".next-prod/**",
    // Plain CommonJS Node entry point for hosts that require a literal
    // startup file (see docs/DEPLOYMENT.md) — intentionally require(), not
    // app source subject to the TS/ESM rules below.
    "server.js",
  ]),
]);

export default eslintConfig;
