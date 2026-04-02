# Phase 0 — Foundation

> Goal: working repo, DB connected, empty role-aware shell deployed to staging. Nothing user-visible beyond a login screen.

---

## T001 — Initialize Next.js monorepo with Turborepo

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** none

### What to do

Scaffold a Turborepo monorepo with one Next.js application (`apps/web`) using the App Router. Add a `packages/` directory for shared TypeScript types and utilities.

### Acceptance criteria

- `turbo build` runs without errors
- `apps/web` starts in development mode
- `packages/types` exists and is importable from `apps/web`
- TypeScript strict mode enabled in all packages

---

## T002 — Configure code quality tooling

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do

Add ESLint (Next.js config), Prettier, and a shared config package. Add a pre-commit hook (Husky + lint-staged) that runs lint and format checks.

### Acceptance criteria

- `turbo lint` passes on a clean repo
- `turbo format` formats all files
- Pre-commit hook blocks commits with lint errors

---

## T003 — Environment variable schema

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do

Create `.env.example` with all required environment variable keys (no values). Add runtime validation using `zod` or `@t3-oss/env-nextjs` so the app fails fast on missing variables.

### Acceptance criteria

- `.env.example` lists all required vars with inline comments
- App throws a clear error on startup if a required var is missing
- `.env` and `.env*.local` are in `.gitignore`

---

## T004 — Vercel project setup

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do

Create a Vercel project connected to the git repository. Configure the build command (`turbo build --filter=web`), output directory, and staging environment (preview deployments on every PR).

### Acceptance criteria

- Push to `main` triggers a production deploy
- Pull requests get a unique preview URL
- Environment variables added in Vercel dashboard match `.env.example`

---

## T005 — Neon Postgres setup

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T004

### What to do

Create a Neon project (free tier). Add the database URL to Vercel environment variables. Create a `dev` branch in Neon for local development and a `staging` branch for preview deploys.

### Acceptance criteria

- `apps/web` can connect to Neon in local dev
- Preview deploys connect to the Neon `staging` branch
- Production connects to the Neon `main` branch
- Connection uses Neon's serverless driver (`@neondatabase/serverless`)

---

## T006 — Drizzle ORM setup and migration workflow

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T005

### What to do

Install and configure Drizzle ORM with the Neon serverless adapter. Set up `drizzle-kit` for migrations. Add a `db:migrate` script and a `db:studio` script for the Drizzle visual editor.

### Acceptance criteria

- `npm run db:migrate` applies pending migrations to the target DB
- `npm run db:studio` opens Drizzle Studio connected to the local/dev DB
- Schema files live in `packages/db/src/schema/`
- An empty initial migration runs successfully against Neon

---

## T007 — Better Auth spike and integration

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T006

### What to do

Install Better Auth and configure it with the Postgres adapter pointing to the Neon DB. Verify that the RBAC plugin works with the role model needed (cashier/admin, secretary, stylist, clothier). Create the auth tables migration.

### Acceptance criteria

- Better Auth creates its required tables via migration (users, sessions, accounts)
- RBAC plugin supports custom roles without workarounds
- A test login (admin user seeded) works end-to-end
- Session is accessible in Next.js Server Components and API routes

---

## T008 — Base UI (Base Web) spike

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do

Install Base Web (`baseui`) and its peer dependency (`styletron-react`). Render one representative component (e.g. a Button and a Table) inside the Next.js App Router. Confirm there are no SSR hydration mismatches or build errors.

### Acceptance criteria

- Base Web components render without errors in development
- No hydration mismatch warnings in the browser console
- Production build (`next build`) completes without Base Web-related errors
- Document any workarounds needed (e.g. `"use client"` boundaries) in a comment or small `docs/` note

---

## T009 — Pusher free tier spike

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T001

### What to do

Create a Pusher account (free tier). Install `pusher` (server SDK) and `pusher-js` (client). Trigger a test event from a Next.js API route and receive it in a React component. Confirm it works on Vercel preview.

### Acceptance criteria

- Server can publish an event via Pusher in a Route Handler
- Client receives the event in real time without page refresh
- Works on a Vercel preview deploy (not just local)
- Pusher keys stored in environment variables (not hardcoded)

---

## T010 — RBAC role definitions

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T007

### What to do

Define the role enum and subtype enum in the shared `packages/types` package and in the Better Auth configuration. Roles: `admin`, `secretary`, `stylist`, `clothier`. Stylist subtypes: `manicurist`, `spa_manager`, `hairdresser`, `masseuse`, `makeup_artist`.

### Acceptance criteria

- Role and stylist-subtype enums exported from `packages/types`
- Better Auth RBAC configured to use these roles
- Middleware redirects unauthenticated users to login
- Each role gets a placeholder home screen (empty, just a heading) after login

---

## T011 — Seed script for development

**Phase:** 0 — Foundation
**Status:** pending
**Dependencies:** T010

### What to do

Create a `db:seed` script that inserts one user per role into the dev DB so developers can log in as any role without manual setup.

### Acceptance criteria

- `npm run db:seed` runs without errors and is idempotent (safe to run multiple times)
- One admin, one secretary, one clothier, and one stylist (each subtype) are seeded
- Seed passwords documented in `.env.example` comments (dev-only)

