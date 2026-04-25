# Stabilization Phase 2 — Source of Truth

> Second stabilization wave. Same time frame as Stabilization-1 but tracked as
> a separate phase. One task = one responsibility = one commit.

**Phase**: Stabilization-2
**Started**: 2026-04-25
**Tracker route**: `/admin/roadmap` (internal) · `/roadmap` (public)

---

## Task: Annotate hardest steps in role training guides

Status: pending
Type: ux

Scope:

- Each of the four training guides (cashier_admin, secretary, stylist, clothier) lacks screenshots on its 2–3 hardest steps. Trainees cannot follow text-only instructions for non-obvious flows.

Steps:

1. Identify the 2–3 hardest steps in each role's guide where staff have asked questions during dry-runs.
2. Capture annotated screenshots (callouts on the relevant button or field).
3. Embed under the matching step section in each guide markdown file.

Acceptance Criteria:

- Each role guide has at least 2 annotated screenshots on its hardest steps.
- Screenshots use a consistent annotation style (red outline + numbered callout).
- Image paths are relative under `docs/training/` so the guides remain portable.

Test:

- Hand a guide to a staff member who has not used the system; they complete the highlighted step without asking for clarification.
