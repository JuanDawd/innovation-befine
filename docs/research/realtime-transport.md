# Research: Real-time transport

> Researched: April 2026. Context: live cashier dashboard (all open employee tickets update automatically when a stylist logs a service).

---

## The core question

Vercel serverless functions have **execution timeouts** (default 10 s, max 60 s on Pro). **WebSockets require persistent connections**, which serverless cannot maintain. This makes the choice simpler than it appears.

---

## Protocol comparison: SSE vs WebSocket

|                                   | SSE (Server-Sent Events)             | WebSocket                                 |
| --------------------------------- | ------------------------------------ | ----------------------------------------- |
| **Direction**                     | Server → client only                 | Bidirectional                             |
| **Protocol**                      | Standard HTTP/1.1                    | Custom ws/wss (requires upgrade)          |
| **Vercel support**                | Yes (via Edge Functions / Streaming) | No — persistent connections not supported |
| **Firewall / proxy friendliness** | High (regular HTTPS)                 | Medium (may be blocked)                   |
| **Auto-reconnect**                | Built-in (EventSource API)           | Must implement manually                   |
| **Browser support**               | Native — no library needed           | Requires library                          |
| **Text only**                     | Yes (JSON strings work fine)         | Binary and text                           |
| **Complexity**                    | Low                                  | Higher                                    |

### Use SSE when

- Clients only need to **receive** updates (server pushes events).
- You are on Vercel or any serverless platform.
- You want low complexity and no extra infrastructure.
- Use cases: notifications, live dashboards, activity feeds, AI streaming — covers ~80% of real-time needs.

### Use WebSocket when

- Clients need to **send** high-frequency data to the server (e.g. multiplayer game positions, real-time cursors, chat with typing indicators).
- You have a persistent server (not Vercel serverless).

### Decision for this project

The cashier dashboard needs: **server pushes a ticket update when a stylist logs a service**. The client never needs to stream data back at high frequency — actions (add service, close ticket) are normal HTTP POST calls.

**SSE is the right choice.** It covers 100% of the live dashboard requirement, works on Vercel, and needs zero additional infrastructure.

---

## Implementation options for SSE on Vercel

### Option A: Native Next.js Streaming (no extra service)

Use a Next.js Route Handler with `ReadableStream` and the `text/event-stream` content type.

**How it works:** when a stylist logs a service, the API writes to Postgres and then notifies connected cashier sessions via the stream. A lightweight in-memory pub/sub (or Postgres `LISTEN/NOTIFY`) bridges the two sides.

**Pros:**

- Zero additional vendor.
- No monthly cost beyond Vercel.
- Full control.

**Cons:**

- On Vercel's serverless runtime, each function invocation is stateless — you cannot share in-memory state across requests. You must use Postgres `LISTEN/NOTIFY` or Redis pub/sub as the backend fan-out mechanism.
- More implementation work.

### Option B: Pusher (managed WebSocket / channel service)

Pusher exposes WebSocket channels via a managed API. Your Next.js API routes call Pusher's REST API to trigger events; the browser client subscribes via the Pusher JS SDK.

|                     |                                               |
| ------------------- | --------------------------------------------- |
| **Free tier**       | 200 concurrent connections, 200K messages/day |
| **Paid**            | From $49/month (up to 500 connections)        |
| **Vercel fit**      | Excellent — no persistent server needed       |
| **Reliability**     | Battle-tested since 2010                      |
| **Message history** | No (fire-and-forget)                          |

**Pros:** Simplest to implement end-to-end; battle-tested; generous free tier for an internal tool.

**Cons:** Another vendor; no message delivery guarantee; costs scale at higher connection counts.

### Option C: Ably (managed, mission-critical)

Same model as Pusher but with message history, delivery guarantees (QoS levels), and a global edge network.

|                         |                                                          |
| ----------------------- | -------------------------------------------------------- |
| **Free tier**           | 6M messages/month                                        |
| **Paid**                | From $29/month; scales higher than Pusher per 100K users |
| **Vercel fit**          | Excellent                                                |
| **Message history**     | Yes (configurable retention)                             |
| **Delivery guarantees** | Yes (at-least-once, at-most-once options)                |

**Pros:** More reliable than Pusher; message history useful if a cashier reconnects and needs to catch up on missed events.

**Cons:** More expensive at scale; more complex SDK.

---

## Comparison summary

|                           | Native SSE + Postgres LISTEN/NOTIFY | Pusher              | Ably                |
| ------------------------- | ----------------------------------- | ------------------- | ------------------- |
| **Extra cost**            | $0                                  | Free tier → $49+/mo | Free tier → $29+/mo |
| **Vercel compatible**     | Yes (with LISTEN/NOTIFY)            | Yes                 | Yes                 |
| **Implementation effort** | Medium                              | Low                 | Low–Medium          |
| **Message history**       | Manual                              | No                  | Yes                 |
| **Delivery guarantees**   | Via Postgres                        | No                  | Yes                 |
| **Vendor dependency**     | None                                | Medium              | Medium              |

---

## Recommendation for this project

**Start with Pusher** on the free tier:

1. The internal tool will have very few concurrent connections (a handful of cashier screens + employees at most) — well within the 200-connection free tier.
2. Implementation is fast: one API call from the server side, one SDK subscription on the client.
3. If Pusher free tier becomes a cost concern later, migrate to native SSE + Postgres `LISTEN/NOTIFY` or Ably.

**Fallback / long-term:** native SSE with Postgres `LISTEN/NOTIFY` requires no paid vendor and keeps everything inside the existing Postgres instance. Build this in Phase 9 (offline hardening) if the team wants to eliminate the Pusher dependency.

WebSocket (self-hosted via Socket.io or Soketi) is **not compatible with Vercel** and should not be considered unless the hosting decision changes.

---

## Pusher-to-SSE migration: post-MVP

> Added April 2026 (M-18 resolution). Migration from Pusher to native SSE + Postgres LISTEN/NOTIFY is a **post-MVP activity**. No task is allocated in the current project plan. The real-time abstraction layer (T098) ensures that this migration, when undertaken, requires changes only in `packages/realtime/` — not in consuming code.
