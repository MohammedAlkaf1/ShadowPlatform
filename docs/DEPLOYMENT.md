# Production deployment

## Architecture

This is a single Next.js app serving both the web UI and the `/api/*` REST
routes from one process — there is no separate "backend service". The
Flutter mobile app authenticates via Bearer JWT (`src/lib/mobile-jwt.ts`),
not cookies, so it can call the same origin cross-network with no CORS
involved.

Decision: deploy as **one origin**, `https://shadowtutor.org`, exposing
`/api/*` on that same origin. Do not split off a separate `api.shadowtutor.org`
— nothing in this codebase needs it (no CORS layer exists, and adding a
subdomain split would require building one solely to satisfy a generic
template, not an actual requirement here). If a future browser-based
third-party client needs cross-origin API access, add explicit CORS
handling at that point.

- Web: `https://shadowtutor.org`
- API: `https://shadowtutor.org/api/*`
- Flutter `PLATFORM_BASE_URL`: `https://shadowtutor.org/api`

## Hosting: Hostinger Business → Deploy Web App

Confirmed target: **Hostinger Business plan, using hPanel's "Deploy Web App"
/ Node.js application feature**, connected to this GitHub repository. That
feature runs a real persistent Node.js process (not the PHP shared-hosting
path), so no VPS is required.

In hPanel, when creating the Node.js app:

- **Repository**: connect to this GitHub repo, branch `main`.
- **Node.js version**: pick the version closest to `20.x`–`22.x` (see
  `engines.node` in `package.json` — the app was built/tested on Node 22).
- **Application root**: repo root (where this `package.json` lives).
- **Install command**: `npm ci` (falls back to `npm install` if hPanel
  doesn't support `ci`). This also runs `postinstall` → `prisma generate`
  automatically (added to `package.json`).
- **Build command**: `npm run build`
- **Startup file / start command**: use **`server.js`** — either as the
  literal startup file, or as the start command (`node server.js`) if
  hPanel's Node.js selector asks for a command instead. Required, not just
  an alternative to `npm start`: `server.js` owns graceful shutdown itself
  (guards against a double-signal restart-crash-loop — see its own comment
  for the exact bug this fixes), which plain `next start` has no hook to do.
  Do not configure `npm start`/`next start` as the actual running process.
- **Port**: leave to Hostinger's assigned `PORT` env var — do not hardcode a
  port anywhere in the app; both `next start` and `server.js` read
  `process.env.PORT`.
- **Domain**: point `shadowtutor.org` at this Node.js app in hPanel's domain
  binding for it; Hostinger issues/manages the TLS certificate for the
  bound domain.

## Build & run (what the panel executes, or to reproduce locally)

```bash
npm ci                      # installs deps, runs postinstall -> prisma generate
npm run prisma:deploy       # prisma migrate deploy — applies pending migrations
NODE_ENV=production npm run build
NODE_ENV=production npm start   # or: node server.js
```

## Required production environment variables

Set these outside git (Hostinger's environment variable panel, a systemd
`EnvironmentFile`, or equivalent secret store) — never commit real values.
See `.env.example` for the full documented list and generation commands.
At minimum for production:

- `DATABASE_URL` — production Postgres connection string (not the local
  dev one), ideally with `sslmode=require` if the provider supports it.
- `NEXTAUTH_SECRET` — a freshly generated production secret, distinct from
  any dev value.
- `NEXTAUTH_URL` — `https://shadowtutor.org`
- `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` /
  `S3_BUCKET` — a real S3-compatible bucket, not local MinIO.
- `DOCUMENT_ENCRYPTION_KEY` — a freshly generated 64-char hex key, distinct
  from any dev value (rotating this after data exists requires re-encrypting
  stored documents — generate it once, correctly, before first production
  upload).
- `GEMINI_API_KEY` — production key, server-side only (already never exposed
  to the client bundle — no `NEXT_PUBLIC_` variable exists in this codebase).
- `MAX_UPLOAD_SIZE_BYTES`, `MAX_FACULTY_RESOURCE_SIZE_BYTES`,
  `MAX_EXAM_PDF_SIZE_BYTES`, `MAX_LECTURE_KEYTERM_PDF_SIZE_BYTES` — copy
  defaults from `.env.example` unless there's a reason to change them.

`NODE_ENV=production` must be set by the process manager/host — it drives
`next.config.ts`'s CSP strictness (`script-src` drops `'unsafe-eval'`) and
build output directory.

## Reverse proxy trust

`src/auth.ts` now sets `trustHost: true` on the NextAuth config — required
because Hostinger terminates TLS in front of the app, so Next.js sees the
proxied request over plain HTTP internally. `NEXTAUTH_URL` still pins the
real production origin, so this doesn't let a client spoof the host.

## Dependency audit (informational, non-blocking)

`npm audit --omit=dev` reports 6 advisories, all in build-time-only
tooling, none in a runtime request path:

- `postcss` (bundled inside `next`'s own build pipeline — used only for
  Tailwind CSS compilation at build time, never touches a live request).
- `prisma`/`@prisma/config` → `deepmerge-ts` (used by the Prisma CLI when
  reading config, not by the generated client at runtime).
- `js-yaml` (transitive build-tool dependency).

Fixing all of them requires a forced major-version bump (`next@16`,
`prisma@6.12.0` downgrade) that wasn't safe to apply blind this pass — do
that as its own tested upgrade, not bundled into a deployment-prep commit.

## Known accepted gaps (not fixed in this pass)

- No password-reset flow exists yet (needs an email-sending provider
  decision).
- No per-account login lockout (only IP-based rate limiting exists,
  `src/lib/rate-limit.ts`, 10 req/15 min on login).
- The rate limiter is in-memory/single-process — fine for one Node
  instance, but must move to Redis (or similar) before running more than
  one instance behind a load balancer.
