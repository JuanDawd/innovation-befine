# Research: Front-end libraries

> Researched: April 2026. Documents the rationale for each front-end library accepted into the tech stack during senior reviews.

---

## TanStack Query (React Query)

**Role:** Server state management — caching, revalidation, optimistic updates.

|                        | TanStack Query                                 | SWR                 |
| ---------------------- | ---------------------------------------------- | ------------------- |
| **Cache invalidation** | Fine-grained (`queryClient.invalidateQueries`) | Global or key-based |
| **Optimistic updates** | Built-in `onMutate` / `onError` rollback       | Manual              |
| **DevTools**           | Yes (dedicated panel)                          | Community extension |
| **Pagination**         | `useInfiniteQuery` built-in                    | Manual              |
| **Mutation handling**  | `useMutation` with retry, rollback             | Manual              |
| **Offline support**    | `networkMode` options                          | Limited             |
| **Bundle size**        | ~13 KB gzipped                                 | ~4 KB gzipped       |

**Why TanStack Query:** This app has complex mutation flows (ticket creation, checkout, payout recording) where optimistic updates and automatic cache invalidation after mutations are critical for UX. The built-in mutation lifecycle (`onMutate` → `onSuccess` → `onError`) maps directly to the optimistic UI pattern required in T084. SWR is lighter but requires manual orchestration for these patterns.

---

## Zustand

**Role:** Ephemeral client-side state — offline queue count, notification count, sidebar state, active filters.

|                       | Zustand                             | Jotai           | Redux Toolkit               |
| --------------------- | ----------------------------------- | --------------- | --------------------------- |
| **API complexity**    | Minimal (one `create` call)         | Minimal (atoms) | Moderate (slices, reducers) |
| **Provider required** | No                                  | No              | Yes                         |
| **DevTools**          | Yes (Redux DevTools compatible)     | Yes             | Yes                         |
| **Bundle size**       | ~1 KB gzipped                       | ~2 KB gzipped   | ~12 KB gzipped              |
| **Middleware**        | Built-in (persist, immer, devtools) | External        | Built-in (thunk, saga)      |
| **Learning curve**    | Very low                            | Low             | Moderate                    |

**Why Zustand:** The app needs very little client-side state (most state is server-derived via TanStack Query). Zustand handles the few ephemeral concerns (offline queue count, notification badge count, sidebar open/close) without a provider wrapper or boilerplate. Redux is overkill; Jotai is comparable but Zustand's store pattern is more intuitive for the small state surface.

---

## React Hook Form + Zod

**Role:** Form state management and validation — all forms across the app.

|                       | React Hook Form + Zod                | Formik + Yup                         |
| --------------------- | ------------------------------------ | ------------------------------------ |
| **Re-renders**        | Minimal (uncontrolled by default)    | Every keystroke (controlled)         |
| **Validation**        | Zod schemas (shared client ↔ server) | Yup schemas (client only, typically) |
| **Bundle size**       | ~9 KB (RHF) + ~13 KB (Zod)           | ~13 KB (Formik) + ~16 KB (Yup)       |
| **TypeScript DX**     | Excellent (Zod infers types)         | Good (Yup inference weaker)          |
| **Server-side reuse** | Same Zod schema validates API inputs | Requires duplicating Yup schemas     |

**Why RHF + Zod:** The project's T002 standards mandate that all server-side inputs are validated with Zod. Using Zod on the client (via `@hookform/resolvers/zod`) means a single schema definition validates both the form and the server action — no duplication. RHF's uncontrolled approach also avoids unnecessary re-renders on complex forms (checkout, payout recording).

---

## date-fns

**Role:** Date manipulation, formatting, and comparison.

|                    | date-fns                             | Day.js                   | Luxon                  |
| ------------------ | ------------------------------------ | ------------------------ | ---------------------- |
| **Tree-shakeable** | Yes (import only what you use)       | No (monolith + plugins)  | No (monolith)          |
| **Immutable**      | Yes (pure functions)                 | Yes (via clone)          | Yes                    |
| **Locale support** | 60+ locales (including Spanish)      | Plugin-based             | Built-in               |
| **Timezone**       | Via `date-fns-tz`                    | Via plugin               | Built-in               |
| **Bundle impact**  | Only imported functions              | Full library (~2 KB min) | ~20 KB min             |
| **API style**      | Functional (`format(date, pattern)`) | OOP (`dayjs().format()`) | OOP (`DateTime.now()`) |

**Why date-fns:** Tree-shaking is the primary advantage — the app uses dates extensively (business days, appointments, payroll periods, analytics) but only needs a subset of functions. Spanish locale support (`es` locale) is critical since the primary UI language is Spanish. The functional API fits the project's preference for pure functions and composability.

---

## Recharts

**Role:** Data visualization for analytics dashboards (Phase 8).

|                   | Recharts                                      | Nivo                               | Victory                       |
| ----------------- | --------------------------------------------- | ---------------------------------- | ----------------------------- |
| **Built on**      | React + D3                                    | React + D3                         | React + D3                    |
| **API style**     | Declarative JSX components                    | Declarative + config objects       | Declarative JSX               |
| **Chart types**   | Bar, Line, Area, Pie, Radar, Scatter, Treemap | 25+ types including heatmap, chord | Bar, Line, Area, Pie, Scatter |
| **Responsive**    | `<ResponsiveContainer>` built-in              | Built-in                           | Built-in                      |
| **Animation**     | Built-in (spring-based)                       | Built-in                           | Built-in                      |
| **Bundle size**   | ~50 KB gzipped                                | ~70 KB gzipped                     | ~60 KB gzipped                |
| **Documentation** | Good, many examples                           | Excellent interactive docs         | Good                          |

**Why Recharts:** The analytics dashboards (T072–T074) need bar charts, line charts, and sparklines — all well-covered by Recharts. Its JSX-first API is the most intuitive for React developers. Nivo has more chart types but the app doesn't need heatmaps or chord diagrams. Recharts' `<ResponsiveContainer>` makes responsive charts trivial.

---

## Lucide Icons

**Role:** Consistent iconography across all UI screens.

|                       | Lucide                          | Heroicons          | Phosphor                |
| --------------------- | ------------------------------- | ------------------ | ----------------------- |
| **Icon count**        | 1,500+                          | 300+               | 7,000+                  |
| **Style**             | Stroke-based, consistent weight | Solid + outline    | 6 weights               |
| **Tree-shakeable**    | Yes (individual imports)        | Yes                | Yes                     |
| **React package**     | `lucide-react`                  | `@heroicons/react` | `@phosphor-icons/react` |
| **shadcn/ui default** | Yes                             | No                 | No                      |
| **Bundle per icon**   | ~1 KB                           | ~1 KB              | ~1 KB                   |

**Why Lucide:** If shadcn/ui is chosen as the UI library (T008 fallback), Lucide is the default icon set — all shadcn components use Lucide internally. Using a different icon library would create visual inconsistency. Even if Base Web is chosen, Lucide's consistent stroke weight and large icon set make it the best standalone choice. Phosphor has more icons but the multiple weight variants add decision overhead without clear benefit.
