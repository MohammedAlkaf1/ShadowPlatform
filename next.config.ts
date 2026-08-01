import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `next dev` and `next build`/`next start` default to the SAME output
   * directory (`.next`). If a production build ever runs while a dev
   * server is still live (or vice versa), the dev server's in-memory
   * compiler state gets orphaned from the on-disk chunk manifest it's
   * serving from, and the browser fails with:
   *   "ChunkLoadError: Loading chunk app/<route>/layout failed."
   * for any route the dev server has to freshly (re)compile after that —
   * while already-warm routes can appear to keep working, which is exactly
   * what makes this confusing to diagnose (it looks role/route-specific,
   * but it's actually about which routes were compiled before vs after the
   * directory got clobbered).
   *
   * Giving production builds their own directory makes this class of bug
   * structurally impossible instead of relying on developers (or agents)
   * to always fully stop `next dev` before running `next build`/`next
   * start`.
   */
  distDir: process.env.NODE_ENV === "production" ? ".next-prod" : ".next",
};

export default nextConfig;
