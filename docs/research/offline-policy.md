# Offline policy — Innovation Befine

> **Status:** Approved
> **Date:** April 2026
> **Stakeholder sign-off:** Business owner (April 2026, stakeholder decision session)

---

## Overview

Innovation Befine is used on mobile phones (stylists, clothiers) and desktop PCs (cashier, admin, secretary) inside a business location with Wi-Fi. Internet connectivity is generally available but not guaranteed — the Wi-Fi router may drop, Neon may have cold starts, or Vercel may experience transient issues.

This document classifies every user-initiated action as **offline-capable** or **online-only**. Actions classified as offline-capable are queued locally (IndexedDB) and replayed when connectivity returns. Online-only actions show a clear error message when attempted offline.

---

## Design principles

1. **No data loss:** any action a user performs must either succeed immediately or be safely queued for later.
2. **No silent failures:** if an action cannot be queued (online-only), the user sees an immediate, clear message.
3. **No duplicate operations:** every queued mutation carries an idempotency key. The server ignores replays of already-processed mutations.
4. **Financial safety:** actions involving money (checkout, payments, payouts) are never queued — they require real-time server confirmation to prevent double-charging or incorrect amounts.

---

## Action classification

### Offline-capable actions

These actions are queued in IndexedDB and replayed in order when connectivity returns. Each carries a client-generated `idempotency_key` (UUID v4).

| Action                                               | Role(s)            | Queued data                  | Idempotency scope                          |
| ---------------------------------------------------- | ------------------ | ---------------------------- | ------------------------------------------ |
| **Log a service (create ticket in `logged` status)** | Stylist, Secretary | Full ticket creation payload | `idempotency_key` on `tickets` table       |
| **Mark cloth piece as done**                         | Clothier           | `batch_piece_id` + timestamp | `idempotency_key` on `batch_pieces` update |
| **Add ticket item**                                  | Stylist, Secretary | Ticket ID + item payload     | Deduplicated via `idempotency_key`         |

### Online-only actions

These actions require real-time server confirmation and must NOT be queued.

| Action                                | Role(s)            | Reason                                                           |
| ------------------------------------- | ------------------ | ---------------------------------------------------------------- |
| **Checkout / close ticket**           | Cashier            | Financial — must confirm payment recorded, prevent double-charge |
| **Record payment**                    | Cashier            | Financial — requires server-side balance validation              |
| **Split payment**                     | Cashier            | Financial — requires atomic multi-payment insert                 |
| **Price override**                    | Cashier            | Financial — requires audit trail in real-time                    |
| **Record payout**                     | Admin              | Financial — requires double-pay prevention check                 |
| **Open business day**                 | Admin              | Shared state — all users depend on the open day                  |
| **Close business day**                | Admin              | Shared state — must verify no pending tickets                    |
| **Reopen business day**               | Admin              | Shared state — must verify it's the most recent closed day       |
| **Create / edit service catalog**     | Admin              | Shared data — all roles read catalog for ticket creation         |
| **Create / edit cloth piece catalog** | Admin              | Shared data — clothiers read catalog for batches                 |
| **Create / edit employee**            | Admin              | Shared data — affects RBAC and assignments                       |
| **Deactivate employee**               | Admin              | Shared state — affects payroll guard                             |
| **Create appointment**                | Secretary, Cashier | Requires double-booking prevention (DB constraint)               |
| **Cancel / confirm appointment**      | Secretary          | Status transition requires server validation                     |
| **Approve cloth pieces**              | Secretary, Admin   | Affects clothier earnings — requires immediate audit trail       |
| **Create cloth batch**                | Secretary, Admin   | Assigns pieces to clothiers — requires current catalog           |
| **Create / edit large order**         | Admin, Secretary   | Financial — deposit and balance tracking                         |
| **Record large order payment**        | Admin, Secretary   | Financial                                                        |
| **Send confirmation email**           | Secretary          | Requires Resend API (network)                                    |
| **Password reset**                    | Any                | Requires email delivery                                          |
| **Login / logout**                    | Any                | Requires authentication server                                   |
| **Analytics queries**                 | Admin              | Requires database aggregation                                    |
| **CSV export**                        | Admin              | Requires server-side data                                        |

---

## Offline queue behaviour

### Queue structure (IndexedDB)

```typescript
interface QueuedMutation {
  id: string; // local UUID
  idempotencyKey: string; // sent to server for dedup
  action: string; // e.g. "createTicket", "markPieceDone"
  payload: unknown; // serialized action parameters
  createdAt: string; // ISO timestamp
  status: "pending" | "syncing" | "synced" | "failed";
  retryCount: number;
  lastError?: string;
}
```

### Replay rules

1. Queue is processed **FIFO** (first-in, first-out).
2. Each mutation is attempted **once per sync cycle**.
3. On HTTP 409 (idempotency conflict — already processed), mark as `synced` and continue.
4. On HTTP 4xx (validation error), mark as `failed` and skip — do not retry. Show error to user.
5. On HTTP 5xx or network error, mark as `pending` and retry on next cycle.
6. Maximum **5 retries** per mutation. After 5 failures, mark as `failed` and alert the user.
7. Sync cycle triggers on: `navigator.onLine` event, visibility change (tab focus), and every 30 seconds while online.

### Conflict resolution

When a queued ticket creation arrives at the server but the business day has since been closed:

- The server **rejects** the mutation with error code `BUSINESS_DAY_CLOSED`.
- The queued mutation is marked as `failed`.
- The user sees a notification: "El día de trabajo se cerró mientras estabas sin conexión. El servicio '{service name}' no pudo ser registrado. Contacta al administrador."
- The admin can reopen the day and the user can retry, or the mutation can be discarded.

---

## User feedback

### Sync status indicator

A persistent indicator in the app header shows connectivity state:

| State   | Visual                      | Meaning                                        |
| ------- | --------------------------- | ---------------------------------------------- |
| Online  | Green dot                   | Connected, all synced                          |
| Syncing | Blue spinner                | Replaying queued mutations                     |
| Offline | Orange dot + "Sin conexión" | Not connected, actions may be queued           |
| Error   | Red dot + count             | One or more mutations failed after max retries |

### Action-level feedback

- **Offline-capable action while offline:** toast "Guardado localmente. Se enviará cuando haya conexión." + the action appears with a "pending sync" indicator.
- **Online-only action while offline:** toast "Esta acción requiere conexión a internet." + the action button is disabled with a tooltip.

---

## Implementation phases

| Phase    | What                                                        | Tasks                        |
| -------- | ----------------------------------------------------------- | ---------------------------- |
| Phase 0  | This policy document (T077)                                 | —                            |
| Phase 4A | Add `idempotency_key` column to `tickets` table (T033)      | T033                         |
| Phase 9  | Full IndexedDB queue, sync logic, service worker, status UI | T078, T079, T080, T081, T082 |

Until Phase 9, the app is **online-only**. All actions require connectivity. The `idempotency_key` column exists from Phase 4A to ensure the schema is ready when offline support is built.

---

## Related documents

- `docs/standards-api.md` — error response format (used by offline queue for error handling)
- `docs/testing/concurrency-test-plan.md` — race conditions relevant to offline replay
- `docs/Business/tasks/phase-09-offline.md` — implementation tasks
