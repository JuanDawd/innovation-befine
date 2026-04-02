# Research index

Technical research notes for open vendor/technology decisions. Each file covers one decision area: pros, cons, and a recommendation.

| File | Decision | Recommendation |
|------|----------|---------------|
| [postgres-providers.md](./postgres-providers.md) | Postgres hosting: Neon vs Supabase vs RDS | **Neon** — Vercel-native, usage-based, free in dev |
| [auth-providers.md](./auth-providers.md) | Auth: Auth.js vs Clerk vs Better Auth | **Better Auth** — free, built-in RBAC, no vendor lock-in |
| [realtime-transport.md](./realtime-transport.md) | Live dashboard: SSE vs WebSocket vs Pusher vs Ably | **Pusher free tier** to start; migrate to native SSE + Postgres LISTEN/NOTIFY later |
| [notification-channels.md](./notification-channels.md) | Appointment confirmations: email vs WhatsApp vs SMS | **Email (Resend) for MVP**; WhatsApp post-MVP |
