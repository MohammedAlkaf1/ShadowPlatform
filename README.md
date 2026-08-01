# منصة شادو — Shadow Platform

Web portal for managing disability-support services in Saudi universities.
Students register and upload medical documents, a specialist classifies them
and builds a support plan, faculty see only approved accommodations, and
admins manage users/roles/assignments. A separate Flutter mobile app reads
the approved plan through the `/api/*` endpoints in this repo and adapts
itself accordingly.

Phase 1 of a 3-phase plan (Phase 0 planning already approved).

## Tech stack

Next.js 15 (App Router, TypeScript strict) · PostgreSQL + Prisma ORM ·
NextAuth.js v5 (Credentials + JWT) · S3-compatible storage (MinIO locally) ·
Tailwind CSS + shadcn/ui · Zod.

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start Postgres + MinIO

```bash
docker compose up -d
```

This starts Postgres on `localhost:5433` and MinIO on `localhost:9000`
(console on `:9001`), and auto-creates the `shadow-documents` bucket.

> If you don't have Docker, run a local PostgreSQL 16+ instance and a local
> MinIO binary instead, matching the credentials in `.env.example`
> (`shadow_admin` / `shadow_dev_pw` on port 5433 for Postgres,
> `shadow_minio_admin` / `shadow_minio_secret` on port 9000 for MinIO), and
> create a `shadow-documents` bucket with the MinIO client (`mc mb
> local/shadow-documents`).

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Then fill in `NEXTAUTH_SECRET` and `DOCUMENT_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # NEXTAUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"       # DOCUMENT_ENCRYPTION_KEY (must be 64 hex chars)
```

Prisma's CLI (`migrate`, `db seed`, `validate`) only reads a plain `.env`
file, not `.env.local` — also copy `DATABASE_URL` into a `.env` file at the
project root (this file is git-ignored):

```bash
echo 'DATABASE_URL="postgresql://shadow_admin:shadow_dev_pw@localhost:5433/shadow_platform"' > .env
```

### 4. Run migrations and seed demo data

```bash
npx prisma migrate dev
npx prisma db seed
```

### 5. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

## Demo login credentials

All demo accounts use the password **`Password123!`**.

| Role       | Email                          |
|------------|---------------------------------|
| Student    | `student@demo.shadow.sa`        |
| Faculty    | `faculty@demo.shadow.sa`        |
| Specialist | `specialist@demo.shadow.sa`     |
| Admin      | `admin@demo.shadow.sa`          |

A second, unassigned student (`student2@demo.shadow.sa`, same password) is
also seeded to demonstrate that specialist assignment is manual — this
student does **not** show up in the demo specialist's queue until an admin
assigns them from `/admin/users`.

## Project structure (high-level)

```
prisma/
  schema.prisma         # full data model (see below)
  seed.ts                # demo tenant, users, taxonomy, plan, alerts
src/
  auth.ts                 # NextAuth v5 config (Credentials + JWT)
  middleware.ts            # route-level auth + RBAC gate for page routes
  lib/
    prisma.ts               # Prisma client singleton
    tenant-db.ts             # tenant-scoping Prisma Client Extension
    audit.ts                 # AuditLog write path + actor-only read helper
    session.ts               # server-side session/role helpers
    specialist-access.ts     # enforces manual specialist<->student assignment
    encryption.ts            # AES-256-GCM document encryption
    s3.ts                    # MinIO/S3 client
    mobile-jwt.ts             # access/refresh JWT for the Flutter app
    api-auth.ts               # Bearer-token auth guard for /api/*
    tool-codes.ts             # fixed ToolCode catalogue shared with the app
  app/
    login/, register/          # auth pages
    student/{status,documents}
    specialist/{queue,students/[id]/assess,students/[id]/plan}
    faculty/students
    admin/users
    api/
      auth/{login,refresh}       # mobile JWT issuance
      student/{profile,support-plan}
      events                     # usage event ingestion
      documents/{upload,[id]}    # encrypted upload / specialist download
docker-compose.yml         # Postgres + MinIO for local dev
```

## Data model

See `prisma/schema.prisma` for the full ERD. Every domain table carries a
`tenantId` and is queried through `getTenantScopedPrisma(tenantId)`
(`src/lib/tenant-db.ts`), a Prisma Client Extension that injects `tenantId`
into every query automatically — the closest equivalent to row-level
security available without deeper Postgres-level RLS setup. `tenantId`
always comes from the authenticated session, never from client input.

One model was added beyond the originally specified ERD:
**`SpecialistAssignment`** (`specialistUserId`, `studentProfileId`,
`assignedByUserId`) — see "Judgment calls" below.

## Permission model (the important part)

- **student**: own request status + enabled tool list only. Never sees
  category, support level, specialist notes, or document contents — not on
  any page, and not via the API either (see judgment call below).
- **faculty**: only students linked via `FacultyCourseLink`, and only the
  `approvedAccommodations` JSON. Never sees medical reports or
  diagnosis/level.
- **specialist**: only students an admin has manually linked via
  `SpecialistAssignment`. Opens documents, classifies, sets level, builds
  and approves the support plan, can revise the level later.
- **admin**: everything, plus user/role management and manual specialist
  assignment.

Every read of a student's record (profile, document, assessment, plan)
writes an `AuditLog` row via `src/lib/audit.ts`. Non-admin audit-log queries
are filtered to the requesting user's own `actorUserId` in the query layer,
not just hidden in the UI.

## Judgment calls made during the build

1. **`GET /api/student/profile` withholds category/supportLevel.** The spec
   says students never see their classification anywhere, including
   implicitly via the app. I applied that literally: the endpoint returns
   only basic profile fields + the enabled tool list, never
   category/condition/supportLevel/notes. If the Flutter team finds they
   genuinely need richer state to drive UI, that should be a deliberate,
   separate product decision — not something baked in silently here.

2. **`SpecialistAssignment` is a new model, not in the original ERD.** The
   spec is explicit that "specialist sees only students assigned/referred to
   them, and assignment is manual by admin" — but the given ERD had no table
   to represent that assignment. Without it, that central rule is
   unimplementable. I added a minimal join table
   (`specialistUserId`/`studentProfileId`/`assignedByUserId`) rather than
   ask mid-build, and manage it from a section on `/admin/users`.

3. **Self-signup tenant/`verified` resolution.** `Tenant.selfSignupEnabled`
   and `emailDomain` exist, but nothing specified how registration actually
   picks a tenant. I resolve it by matching the student's email domain
   against `Tenant.emailDomain` (only tenants with `selfSignupEnabled`); a
   domain match sets `verified: true` (proof of institutional email), a
   fallback to any open tenant without a domain match sets `verified: false`
   pending manual admin confirmation. Admin-created student accounts are
   marked `verified: true` directly.

4. **Soft-delete cascade scope.** "Mark related Assessment/SupportPlan as no
   longer active" — `SupportPlan` has a status enum so deactivating a
   student sets any non-expired plan to `expired`. `Assessment` has no
   analogous status field in the given schema (it's modeled as an immutable
   historical record), so it's left untouched; access to it is already
   gated by the student's own `deletedAt` and by `SpecialistAssignment`.

5. **Login resolves tenant by email alone**, not tenant+email. `User.email`
   is only unique per-tenant in the schema, so a genuine multi-tenant
   rollout with overlapping emails across universities would need a tenant
   selector at login. With a single demo tenant seeded this doesn't come up,
   but it's a real gap for tenant #2.

6. **NextAuth v5 (beta)** was used instead of v4 — v4's App Router support is
   weaker, and v5 is the maintained path for Credentials + JWT under App
   Router. Still "NextAuth.js" per the approved stack, just the current
   major version of it.

7. **Prisma pinned to v6.19** rather than the newest v7 that `prisma init`
   defaulted to, for stability/familiarity with the classic
   `prisma-client-js` generator rather than v7's newer client generator.

## Troubleshooting: `ChunkLoadError: Loading chunk app/<route>/layout failed`

If you ever see this in the browser, it's almost never a bug in the route
itself. `next dev` and `next build`/`next start` both defaulted to the same
`.next` output directory — if a production build (or `next start`) ever runs
while a `next dev` server is still alive, the dev server's in-memory
compiler state gets orphaned from the on-disk chunk manifest it's serving,
and any route it has to freshly (re)compile after that fails to load its
chunk in the browser. Routes that were already warm in memory can keep
working, which is what makes it look route/role-specific rather than what it
actually is.

This repo now prevents it structurally: `next.config.ts` sends production
builds to `.next-prod` instead of `.next`, so the two can no longer collide.
If you still hit it (e.g. from a build against an even older checkout):

```bash
# Stop every next dev/build/start process for this project first — not just
# rm -rf .next — a stale second process is the usual actual cause.
npm run clean       # removes .next and .next-prod
npm run dev          # start exactly one fresh dev server
```

## Verification performed

- `npx tsc --noEmit` — passes clean.
- `npx prisma validate` — schema valid.
- `npm run dev` and `npm run build` — both succeed; production build
  smoke-tested on a second port (auth redirect, login, and mobile API all
  verified working).
- End-to-end manual verification via curl: web login (NextAuth
  credentials + CSRF), mobile `/api/auth/login`, document upload → AES-256-GCM
  encrypt → MinIO → specialist decrypt/download round-trip (byte-identical),
  cross-role access denials (faculty blocked from document download,
  student blocked from `/admin/users`, unauthenticated requests 401/redirect),
  and `AuditLog` rows written for uploads/views.
