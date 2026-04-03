# UI Library Spike — T008

**Date:** April 2026
**Decision:** shadcn/ui + Tailwind CSS v4

---

## Base Web evaluation (FAILED)

**Library:** `baseui` (Uber) + `styletron-react` + `styletron-engine-atomic`

**Findings:**

1. **No App Router / RSC support.** Base Web relies on Styletron, a CSS-in-JS runtime that injects styles at render time. Every Base Web component requires a client-side JavaScript runtime for styling. The `BaseProvider` and `StyletronProvider` wrappers are inherently client-side.

2. **Stale maintenance.** The latest Next.js version supported in the Base Web repo is Next.js 12 (PRs from 2022–2023). No evidence of App Router or React Server Components support.

3. **100% `"use client"` required.** Since Styletron is a CSS-in-JS runtime, every component that uses Base Web's styling system requires the `"use client"` directive. This exceeds the 50% threshold defined in the acceptance criteria.

4. **No Tailwind CSS integration.** Base Web uses its own theme system (Styletron overrides), which doesn't compose with Tailwind utility classes — complicating customization and design token sharing.

**Verdict:** Failed all spike criteria. Switched to fallback.

---

## shadcn/ui + Tailwind CSS (CHOSEN)

**Library:** `shadcn/ui` v4 (Nova style) + Tailwind CSS v4 + Radix UI primitives

**Findings:**

1. **Full App Router compatibility.** shadcn/ui components are source-owned (copied into the project, not imported from a library). Only interactive components use `"use client"` — layout, typography, and data display components remain server components.

2. **Tailwind CSS v4.** Uses the new `@import "tailwindcss"` syntax with CSS-first configuration. Design tokens are CSS custom properties, making dark mode and theming straightforward.

3. **Radix UI primitives** (via `@base-ui/react`). Accessible, unstyled headless components. Keyboard navigation, ARIA attributes, and focus management built in.

4. **No hydration issues.** Production build completed without warnings. Components render identically in development and production.

5. **Component quality.** Button, Input, Table, Dialog all render correctly with proper accessibility attributes.

**Verdict:** Passed all acceptance criteria. Adopted as the project's UI component library.

---

## Decision

All subsequent tasks use **shadcn/ui + Tailwind CSS v4**. Base Web is not used anywhere in the project.
