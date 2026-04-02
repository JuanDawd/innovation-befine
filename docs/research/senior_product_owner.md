# Senior Product Owner Review

> Reviewed: April 2026  
> Scope: full project plan (phases 0–10, 89 tasks, business-idea.md, project-plan.md, all task files)  
> Outcome: 11 findings; 10 plan changes applied; net task count moved from 89 → 94

---

## How this review was done

Every task, dependency, acceptance criterion, and phase ordering was read as a senior product owner would before sprint planning:

- Are the right things built in the right order?
- Does each task have a clear, testable definition of done?
- Are there hidden dependencies that would block work mid-sprint?
- Is the MVP actually minimal, or is it accidentally large?
- What risks are being discovered too late?

---

## Finding 1 — Critical dependency gap: Resend needed in Phase 1, not Phase 5

**Severity: blocker**

T017 (password reset flow, Phase 1) sends a reset email via Resend. T054 (Resend integration setup) was in Phase 5 — four phases later. This means the password reset flow would have had no email transport layer for the entire build.

**Change applied:** T054 moved from Phase 5 to Phase 1. Phase 5 now only adds the appointment email template on top of the already-configured Resend client.

---

## Finding 2 — Deactivation has a circular dependency

**Severity: blocker**

T022 (Phase 1) says: "block deactivation if employee has unsettled earnings." But the payout system that computes and records earnings is Phase 7. Referencing it in Phase 1 creates a forward dependency that either silently breaks the guard or causes developers to pull Phase 7 code earlier than planned.

**Change applied:** T022 split into:

- **T022a** (Phase 1) — basic deactivation: disable login, preserve history, hide from active lists.
- **T022b** (Phase 7) — deactivation guard: block if unsettled earnings exist; termination payment shortcut.

---

## Finding 3 — Offline policy written too late

**Severity: high**

T077 (offline policy document) had `Dependencies: none` but was placed in Phase 9. If offline is a first-class feature, the policy must be written before the API routes that need to be idempotent are built (Phase 4). Retrofitting idempotency onto already-shipped routes is expensive and risky.

Additionally, T078 (idempotency keys) in Phase 9 depends on Phase 4 routes already existing — meaning it would be a retroactive change to code under production use. This is the most common offline-first mistake: treating it as a Phase N "hardening" rather than an upfront architecture decision.

**Change applied:** T077 moved to Phase 0. The offline policy is now a deliverable of the foundation phase, alongside the architecture spikes. T078 keeps its Phase 9 position but now builds on a policy that was agreed in Phase 0 — making the idempotency work a deliberate implementation of a pre-decided design, not a surprise retrofit.

---

## Finding 4 — Absence tracking needed before payroll, but placed after it

**Severity: high**

T020 and T021 (absence/vacation table and UI) were in Phase 1. This is early, but the problem is that T065 (secretary earnings = daily rate × days worked, Phase 7) depends on absence records to exclude vacation and approved-absence days. The dependency was implicit and not listed.

The deeper issue: placing T020/T021 in Phase 1 inflates Phase 1 to 11 tasks with a feature (absence calendar) that provides no user-visible value until Phase 7. Users have to wait through phases 2–6 before the absence data is ever used.

**Change applied:** T020 and T021 moved to Phase 7 (before T065, which depends on them). T065's dependencies updated to include T020 explicitly.

---

## Finding 5 — Phase 4 is too large and mixes two independent domains

**Severity: medium**

Phase 4 had 16 tasks covering two completely independent domains:

1. **Ticket lifecycle and cashier checkout** (core POS flow)
2. **Cloth batch creation and piece approval** (production management)

These share only the business day concept and the cloth piece catalog. A developer finishing ticket checkout has nothing blocking them on cloth batches, and vice versa. Keeping them in one phase creates false sequencing, makes sprint planning harder, and produces a phase that cannot be marked "done" until both domains are fully complete.

**Change applied:** Phase 4 split into:

- **Phase 4A** — Tickets and checkout (T033–T043, T048): the core POS loop.
- **Phase 4B** — Cloth batches (T044–T047): production management. Can run in parallel with Phase 5 (Appointments) once Phase 4A is done.

---

## Finding 6 — Missing: App navigation / layout shell

**Severity: medium**

There is no task for building the persistent app shell: sidebar or bottom navigation, header, mobile hamburger menu, role-appropriate nav items. Without this, every screen-level task assumes navigation already exists. In practice developers would build ad-hoc navigation per screen, creating inconsistency that then requires cleanup in Phase 10.

**Change applied:** T090 (App navigation shell) added to Phase 1. It depends on T010 (RBAC role definitions) so nav items can be role-aware from the start.

---

## Finding 7 — Missing: Employee self-service password change

**Severity: medium**

T017 covers "forgot password" (unauthenticated reset email flow). But there is no task for an authenticated employee changing their own password from inside the app. This is standard expected auth behaviour; its absence would generate immediate support requests from staff.

**Change applied:** T091 (Employee self-service password change) added to Phase 1, depending on T016 (login page).

---

## Finding 8 — Missing: Admin day summary / ticket history view

**Severity: medium**

The cashier dashboard (T036) shows only **open** tickets. The analytics dashboard (T071–T074, Phase 8) answers aggregate questions (total revenue, jobs per employee). But there is no task for **"show me all closed tickets from today"** or **"show me ticket #47 from last Tuesday"** — the operational lookup a cashier needs when a customer disputes a charge, or an admin needs to reconcile the day before paying employees.

This is not analytics; it is a basic operational view. Placing it in Phase 8 (analytics) would delay it by several phases.

**Changes applied:**

- **T092** (Closed ticket history view) added to Phase 4A: admin can view all closed tickets for any business day, with search by client name.
- **T093** (Admin home / day-at-a-glance) added to Phase 4A: landing page for admin showing today's open tickets count, total revenue so far, and quick links. Distinct from the full analytics dashboard.

---

## Finding 9 — T009 (Pusher spike) missing dependency on T004

**Severity: low**

T009 tests that Pusher events work "on a Vercel preview deploy." But T009's dependency was listed as only T001 (monorepo scaffold). To deploy to Vercel preview, T004 (Vercel project setup) must be complete first.

**Change applied:** T009 dependency updated to include T004.

---

## Finding 10 — Acceptance criteria format inconsistency in Phase 0

**Severity: low**

Phase 0 task files used `- text` format for acceptance criteria while Phase 1+ used `- [ ] text` (checkboxes). Reviewers checking a PR against a task file in Phase 0 had no checkboxes to tick.

**Change applied:** All Phase 0 acceptance criteria updated to `- [ ]` format.

---

## Finding 11 — T043 (walk-in flow) is not a real task

**Severity: low**

T043 says "confirm that the ticket creation flow (T035) supports walk-in customers." It is a verification, not a distinct unit of work. Its acceptance criteria ("ticket can be created without linking to any appointment") are already captured in T035's criteria. Keeping it as a separate task inflates the count and creates confusion about what "done" means.

**Change applied:** T043 merged into T035's acceptance criteria. T043 ID retired (not reused).

---

## Summary of all changes


| #   | Change                                                   | Affected files                                                  |
| --- | -------------------------------------------------------- | --------------------------------------------------------------- |
| F1  | Move T054 (Resend setup) Phase 5 → Phase 1               | phase-01, phase-05                                              |
| F2  | Split T022 → T022a (Phase 1) + T022b (Phase 7)           | phase-01, phase-07                                              |
| F3  | Move T077 (offline policy) Phase 9 → Phase 0             | phase-00, phase-09                                              |
| F4  | Move T020, T021 (absences) Phase 1 → Phase 7             | phase-01, phase-07                                              |
| F5  | Split Phase 4 → 4A (tickets) + 4B (cloth batches)        | phase-04-daily-operations deleted; phase-04a, phase-04b created |
| F6  | Add T090 (app nav shell) → Phase 1                       | phase-01                                                        |
| F7  | Add T091 (self-service password change) → Phase 1        | phase-01                                                        |
| F8  | Add T092 (ticket history) + T093 (admin home) → Phase 4A | phase-04a                                                       |
| F9  | Fix T009 dependency: add T004                            | phase-00                                                        |
| F10 | Fix Phase 0 acceptance criteria format                   | phase-00                                                        |
| F11 | Merge T043 into T035                                     | phase-04a                                                       |


**Task count delta:** 89 → 94 (+T022b, +T090, +T091, +T092, +T093; −T043 retired)

---

## Updated phase breakdown (post-changes)


| Phase                     | Tasks  | Notes                                                                 |
| ------------------------- | ------ | --------------------------------------------------------------------- |
| 0 — Foundation            | 12     | +T077                                                                 |
| 1 — Identity              | 12     | +T054, +T090, +T091, +T022a; −T022, −T020, −T021                      |
| 2 — Catalog               | 6      | unchanged                                                             |
| 3 — Clients               | 4      | unchanged                                                             |
| 4A — Tickets and checkout | 13     | split from old Phase 4; +T092, +T093; T043 retired (merged into T035) |
| 4B — Cloth batches        | 4      | split from old Phase 4                                                |
| 5 — Appointments          | 7      | −T054 (moved to Phase 1)                                              |
| 6 — Large orders          | 6      | unchanged                                                             |
| 7 — Payroll               | 11     | +T020, +T021, +T022b                                                  |
| 8 — Analytics             | 6      | unchanged                                                             |
| 9 — Offline               | 5      | −T077 (moved to Phase 0)                                              |
| 10 — Polish               | 7      | unchanged                                                             |
| **Total**                 | **94** |                                                                       |


---

## What is still not answered (open risk register)

These are risks or gaps the plan acknowledges but that require a business decision before they can be designed:


| Risk                                                                   | Impact                                           | When to resolve                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Concurrent checkout: two cashiers close the same ticket simultaneously | Data integrity — double charge possible          | Phase 4A design session; add optimistic lock to T038                                            |
| New app version deployed while cashier has an old tab open             | Cashier uses stale code; Pusher events may break | Phase 10 (add version header + "please refresh" banner)                                         |
| Rate limiting on auth endpoints (brute force login)                    | Security                                         | Phase 1 spike: verify Better Auth's built-in rate limiting covers this                          |
| Input validation coverage                                              | Silent data corruption                           | Should be a standard in T002 (code standards): define Zod schema validation policy              |
| Multi-day payroll period confusion: business day IDs vs calendar dates | Payroll errors                                   | Phase 7 design session: add a UI helper that shows calendar date alongside each business day ID |


