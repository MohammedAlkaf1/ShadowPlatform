import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Points at the request-config module that resolves locale WITHOUT
// URL-based i18n routing — see src/i18n/request.ts for why.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// This app has zero third-party runtime resources: fonts are self-hosted
// via next/font (no fonts.gstatic.com request), there are no analytics/CDN
// scripts, and all file storage (S3/MinIO) and AI (Gemini) calls happen
// server-side only — the browser never talks to them directly (see
// src/lib/s3.ts's own comment: "no client-side presigned URLs"). That means
// a same-origin-only CSP is a real fit here, not a generic template.
const isDev = process.env.NODE_ENV !== "production";

// Next.js's own default body-size limit for Server Actions is 1MB,
// unrelated to and much smaller than this app's own upload limits
// (MAX_UPLOAD_SIZE_BYTES, default 15MB — see .env.example). The student
// web upload (src/app/student/upload/actions.ts, a Server Action) was
// silently rejecting any file over 1MB with "Body exceeded 1 MB limit"
// before this app's own size validation ever ran. 20mb gives headroom
// above the largest configured upload limit in the app.
const SERVER_ACTION_BODY_SIZE_LIMIT = "20mb";

// API-only CSP: JSON responses never execute a script, so a static
// same-origin policy (no nonce machinery needed) is sufficient here.
// Page routes get a stronger, per-request NONCE-based CSP instead — see
// middleware.ts's buildCsp, which replaces 'unsafe-inline' on script-src
// with a real per-request nonce (empirically verified against both `next
// dev` and a real `next build && next start`, after 'unsafe-inline' alone
// was proven necessary — see the git history on this file for that
// investigation). Only page routes can carry a nonce all the way from
// middleware through to Next's own script tags, so /api/* keeps this
// simpler static policy.
const API_CSP = [
  "default-src 'self'",
  isDev ? "script-src 'self' 'unsafe-eval'" : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SHARED_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No camera/mic/geolocation/payment use anywhere in this web app — the
  // voice-driven exam features are mobile-app-only (see api-auth.ts's
  // mobile-vs-web split); the browser never calls getUserMedia.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS only makes sense once the deployment is actually served over
  // HTTPS (it's a no-op, not harmful, over plain HTTP in local dev) —
  // included unconditionally since production for this app is always HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // /api/* gets its own static CSP here (middleware.ts's matcher
      // deliberately excludes /api/*, same as its auth logic — see that
      // file's own comment).
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }, ...SHARED_SECURITY_HEADERS] },
      // Everything else (pages) gets the shared non-CSP headers here; CSP
      // itself comes from middleware.ts so it can carry a per-request nonce.
      { source: "/:path*", headers: SHARED_SECURITY_HEADERS },
    ];
  },
  /**
   * Deliberately NOT overridden — stays Next.js's standard `.next`.
   *
   * This used to split production builds into a separate `.next-prod`
   * directory, to avoid a `next dev` server's in-memory compiler state
   * getting orphaned from the on-disk chunk manifest if a production build
   * ran on the same machine while `next dev` was still live (surfaces as
   * "ChunkLoadError: Loading chunk app/<route>/layout failed"). That's a
   * local single-machine workflow hazard, avoidable by just stopping
   * `next dev` before running a local production build/start.
   *
   * It broke real deployment: hosting platforms that auto-detect a Next.js
   * app's build output (Hostinger's Node.js "Deploy Web App" included) look
   * for the standard `.next` directory, not a project-specific rename —
   * the build succeeded but deployment failed with "No output directory
   * found" because output was never where the platform expected it.
   * Matching the standard convention here is what every Next.js host
   * assumes.
   */

  // ESLint is a devDependency (lint is run separately via `npm run lint`,
  // not shipped in the production install) — Hostinger's production
  // install omits devDependencies, so `next build` running ESLint by
  // default fails there with "ESLint must be installed". Build-time
  // linting isn't a build/runtime necessity; disabling it here doesn't
  // remove linting from the workflow, just from this build step.
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Root tsconfig.json's broad "**/*.ts" include also covers tests/ — needed
  // there so vite-tsconfig-paths (vitest.config.mts) can resolve the "@/*"
  // alias in test files. But that means Next's own build-time type-check
  // also type-checks tests/setup.ts, which imports vitest — a devDependency
  // Hostinger's production install omits, so the build fails resolving it.
  // tsconfig.build.json is identical except it excludes tests/, used only
  // for this build-time check; tsconfig.json itself (and vitest) are
  // untouched.
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },

  experimental: {
    serverActions: {
      bodySizeLimit: SERVER_ACTION_BODY_SIZE_LIMIT,
    },
  },
};

export default withNextIntl(nextConfig);
