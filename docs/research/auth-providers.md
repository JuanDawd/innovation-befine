# Research: Authentication providers

> Researched: April 2026. Options evaluated: **Auth.js (NextAuth v5)**, **Clerk**, **Better Auth**.

---

## Summary table

| | Auth.js (NextAuth v5) | Clerk | Better Auth |
|--|----------------------|-------|------------|
| **Type** | Self-hosted library | Managed SaaS | Self-hosted library |
| **Cost** | Free | Free up to 10K MAU, then ~$0.02/MAU | Free |
| **Setup speed** | 30–60 min (DB setup required) | 5–30 min (managed) | 20–40 min |
| **Vendor lock-in** | None | High | None |
| **Built-in 2FA** | No | Yes | Yes |
| **Built-in RBAC** | No | Yes (organizations) | Yes |
| **Passkeys** | No | Yes | Yes |
| **Pre-built UI** | No (you build) | Yes (styled components) | No (you build) |
| **Weekly downloads** | ~2.5M | ~1M | Growing rapidly |
| **Maturity** | Very mature (v1 since 2020) | Mature | New (2024–2025) |

---

## Auth.js (NextAuth v5)

### Pros
- **Most adopted**: ~2.5M weekly downloads; huge community, tons of examples.
- **80+ OAuth providers** (Google, GitHub, Facebook, Apple, etc.) out of the box.
- **Works with standard Postgres** (or any DB); full data ownership.
- **Open source and free forever**.
- Very well documented for Next.js.

### Cons
- **Limited features**: no built-in 2FA, passkeys, RBAC, or impersonation — you build these yourself.
- **v5 migration pain**: breaking changes from v4; some community resources are still on v4.
- **You own the UI**: login page, password reset, profile — all custom.
- Requires more boilerplate for complex permission systems (which this app needs).

---

## Clerk

### Pros
- **Fastest to ship**: pre-built `<SignIn />`, `<UserButton />`, `<UserProfile />` components; minimal code.
- **Feature-rich managed**: MFA, passkeys, magic links, social OAuth, session management, device tracking — all included.
- **Multi-tenancy / organizations built-in**: close to the role model this app needs.
- **Fraud prevention**: disposable email blocking, bot detection.
- **SOC 2 Type 2 certified** and CCPA compliant.
- No database setup for auth.

### Cons
- **Pricing scales**: free up to 10K MAU; then ~$0.02/MAU. An internal tool with few users stays free; if the product expands, cost grows.
- **Vendor lock-in**: user records (passwords, sessions) live on Clerk's servers. Migrating away later is painful.
- **Less customizable UI**: pre-built components are styled by Clerk; matching a custom design requires overriding styles.
- **Data sovereignty**: passwords and auth data are off your infrastructure. Regulatory concern for some regions.
- **No custom RBAC** beyond their organization model without workarounds.

---

## Better Auth

### Pros
- **Best feature-to-cost ratio**: 2FA, passkeys, magic links, RBAC, organizations, impersonation — all built-in and free.
- **No vendor lock-in**: fully self-hosted; all data stays in your Postgres DB.
- **TypeScript-native**: great DX, strong typing.
- **Plugin system**: extend with custom logic without forking.
- **Framework-agnostic**: works with Next.js App Router, Nuxt, Node.js.
- Data sovereignty: credentials and sessions in your own DB.

### Cons
- **Newest of the three** (2024–2025): smaller community, fewer production references, fewer StackOverflow answers.
- **No pre-built UI**: you design and build every auth screen.
- **Self-managed security updates**: you must apply library updates when vulnerabilities are patched.
- Smaller ecosystem means fewer tutorials and ready-made examples.

---

## Recommendation for this project

This app has a **non-trivial role system** (admin, secretary, stylists by subtype, clothier) and is **internal** (not a public SaaS with thousands of MAUs).

| Criterion | Weight for this project |
|-----------|------------------------|
| Cost | Medium — few users, but internal tool budget matters |
| RBAC | High — multiple roles with different screens and permissions |
| Data ownership | Medium — internal company data |
| Time to ship | High — MVP should come fast |
| Vendor lock-in | Medium — small team, limited migration risk |

**Better Auth** is the recommended choice:
- Provides the RBAC model this app needs natively.
- Free forever regardless of how many internal staff log in.
- Data stays in the project's own Postgres instance (same DB as everything else).
- No vendor lock-in.

If build speed is the top constraint, **Clerk** is the fastest path to a working auth system; just accept the lock-in and that pricing will need reviewing if the product ever goes public. **Auth.js** is the fallback if Better Auth proves immature during the Phase 0 spike — but you would need to build RBAC manually.

**Proposed action:** spike Better Auth in Phase 0 for 1–2 hours; if RBAC integration feels clean, commit to it.
