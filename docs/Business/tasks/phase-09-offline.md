# Phase 9 — Offline / sync hardening

> Goal: service logs are not lost on flaky connections; no duplicate tickets or double charges after reconnect.
>
> **T077 (offline policy document) was moved to Phase 0** — it must be agreed before Phase 4A API routes are built so idempotency is designed in, not retrofitted. The `idempotency_key` column on the `tickets` table is already created in T033 (Phase 4A).

---

## T078 — Idempotency keys on mutating API routes

**Phase:** 9 — Offline
**Status:** pending
**Dependencies:** T033, T044

### What to do
Create an `idempotency_keys` table: `key` (text, primary key), `route`, `response_body` (jsonb), `created_at`, `expires_at`. Modify the ticket creation and piece completion API routes to:
1. Accept an `Idempotency-Key` header.
2. Check if the key already exists → return cached response.
3. Otherwise execute the operation and store the key + response in the same transaction.

### Acceptance criteria
- [ ] `idempotency_keys` migration runs without errors
- [ ] Ticket creation with the same key twice → second call returns the first response without creating a duplicate
- [ ] Keys expire after 24 hours (a cron job or lazy cleanup on lookup)
- [ ] Covered routes: ticket creation, piece mark-done

---

## T079 — IndexedDB local mutation queue

**Phase:** 9 — Offline
**Status:** pending
**Dependencies:** T078

### What to do
Using the browser's IndexedDB API (or a thin wrapper like `idb`), create a mutation queue. When the user creates a ticket or marks a piece done while offline, the action is written to the queue with a client-generated UUID (used as the idempotency key). A background process flushes the queue when the network is available.

### Acceptance criteria
- [ ] Ticket creation while offline queues the action in IndexedDB
- [ ] On reconnect, queued actions are sent in order with their idempotency keys
- [ ] Duplicate retry with the same key does not create a duplicate record (relies on T078)
- [ ] Queue persists across page reloads and browser restarts
- [ ] Queue works in the Next.js App Router client context (no SSR issues)

---

## T080 — Sync status UI

**Phase:** 9 — Offline
**Status:** pending
**Dependencies:** T079

### What to do
Show a persistent sync indicator in the app header/nav:
- **Online, synced:** neutral icon (or hidden)
- **Online, syncing:** spinner with "Syncing…"
- **Offline:** warning banner "You're offline — actions will sync when you reconnect"
- **Sync failed:** error icon with count of failed items and a "Retry" button

### Acceptance criteria
- [ ] Indicator updates within 1 second of connectivity change
- [ ] Failed items show a count (not just an icon)
- [ ] "Retry" manually triggers the flush
- [ ] Banner is non-blocking (does not cover primary content)

---

## T081 — Service worker with Workbox

**Phase:** 9 — Offline
**Status:** pending
**Dependencies:** T001

### What to do
Add a service worker using Workbox. Evaluate the wrapper library: **`@ducanh2912/next-pwa`** (actively maintained fork) or a **custom Workbox config** (no wrapper). Do **not** use the original `next-pwa` without verifying it supports the project's Next.js version — it has had maintenance gaps. Strategy:
- **App shell (JS/CSS/fonts):** Cache First
- **API GET requests (catalog, clients, schedule):** Stale While Revalidate
- **Mutating requests (POST/PUT):** NetworkOnly (handled by IndexedDB queue instead)

### Acceptance criteria
- [ ] Service worker registered on production build
- [ ] App shell loads offline (all role home screens accessible without network)
- [ ] Catalog data (services, cloth pieces) served from cache when offline
- [ ] No console errors related to caching during normal online use

---

## T082 — Web App Manifest and PWA

**Phase:** 9 — Offline
**Status:** pending
**Dependencies:** T081

### What to do
Create `app/manifest.ts` (Next.js App Router manifest) with app name, icons (at least 192×192 and 512×512), theme color, background color, and `display: "standalone"`. Add an install prompt for mobile users.

### Acceptance criteria
- [ ] Lighthouse PWA score ≥ 80 on production
- [ ] Install prompt appears on Android Chrome after first visit
- [ ] App name and icon appear correctly when installed to home screen
- [ ] Manifest passes Next.js build validation
- [ ] PWA icons use brand assets from T105 (192×192 and 512×512)
