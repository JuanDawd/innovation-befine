# Design system — Innovation Befine

> Defined in T103. All UI components must follow these conventions.

---

## Design tokens

All tokens are defined via CSS custom properties in `apps/web/src/app/globals.css` with dark mode variants. They are consumed via Tailwind utility classes.

### Colour palette

| Token group                          | Purpose                          | Example classes                              |
| ------------------------------------ | -------------------------------- | -------------------------------------------- |
| `primary` / `primary-foreground`     | Main brand action colour         | `bg-primary text-primary-foreground`         |
| `secondary` / `secondary-foreground` | Secondary actions                | `bg-secondary`                               |
| `muted` / `muted-foreground`         | Subdued backgrounds, helper text | `bg-muted text-muted-foreground`             |
| `destructive`                        | Danger actions (delete, cancel)  | `bg-destructive text-destructive-foreground` |
| `accent` / `accent-foreground`       | Hover states, highlights         | `bg-accent`                                  |
| `success` / `success-foreground`     | Positive feedback                | `bg-success`                                 |
| `warning` / `warning-foreground`     | Caution feedback                 | `bg-warning`                                 |
| `info` / `info-foreground`           | Informational feedback           | `bg-info`                                    |

### Status colour mapping

Used by the `StatusBadge` component. Maps entity statuses to visual categories:

| Category            | Colour                | Entity statuses                                      |
| ------------------- | --------------------- | ---------------------------------------------------- |
| `initial` (grey)    | `bg-status-initial`   | logged, pending, booked                              |
| `progress` (blue)   | `bg-status-progress`  | awaiting_payment, in_production, confirmed           |
| `attention` (amber) | `bg-status-attention` | reopened, done_pending_approval, rescheduled         |
| `success` (green)   | `bg-status-success`   | closed, approved, delivered, paid_in_full, completed |
| `negative` (red)    | `bg-status-negative`  | cancelled, no_show                                   |

### Typography scale

| Level | Class                                   | Usage                         |
| ----- | --------------------------------------- | ----------------------------- |
| H1    | `text-4xl font-bold tracking-tight`     | Page titles                   |
| H2    | `text-2xl font-semibold tracking-tight` | Section headings              |
| H3    | `text-lg font-semibold`                 | Card headers, sub-sections    |
| H4    | `text-base font-medium`                 | Dialog titles, group labels   |
| Body  | `text-sm` (default)                     | Regular content               |
| Small | `text-xs`                               | Badges, captions, helper text |
| Mono  | `font-mono tabular-nums`                | Monetary amounts, IDs         |

Font family: **Geist** (variable `--font-sans`).
Monospace: system monospace stack (`--font-mono`).

### Spacing scale

Base unit: **4px** (Tailwind default). Use the standard Tailwind spacing classes:
`gap-1` (4px), `gap-2` (8px), `gap-3` (12px), `gap-4` (16px), `gap-6` (24px), `gap-8` (32px).

Consistent margin/padding values:

- Component internal padding: `p-3` or `p-4`
- Section gaps: `gap-6` or `space-y-6`
- Page padding: `p-6` (desktop), `p-4` (mobile)

### Border radius scale

| Token          | Size    | Usage                       |
| -------------- | ------- | --------------------------- |
| `rounded-sm`   | ~3.75px | Inputs, small elements      |
| `rounded-md`   | ~5px    | Cards, containers           |
| `rounded-lg`   | ~6.25px | Buttons, modals             |
| `rounded-xl`   | ~8.75px | Large cards, dialog content |
| `rounded-full` | 9999px  | Avatars, badges, pills      |

### Shadow / elevation levels

| Level  | Class       | Usage                        |
| ------ | ----------- | ---------------------------- |
| None   | (no class)  | Inline elements              |
| Small  | `shadow-sm` | Cards, elevated sections     |
| Medium | `shadow-md` | Dropdowns, floating elements |
| Large  | `shadow-lg` | Modals, overlays             |

### Dark mode readiness

All colours are defined via CSS custom properties with `:root` (light) and `.dark` (dark) variants. Switching themes requires only toggling the `dark` class on `<html>` — no component refactoring.

---

## Icon library

**Lucide Icons** (`lucide-react`) is the single icon source. Import icons individually:

```tsx
import { PlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
```

### Commonly used icons

| Action             | Icon                | Import         |
| ------------------ | ------------------- | -------------- |
| Add / Create       | `PlusIcon`          | `lucide-react` |
| Edit               | `PencilIcon`        | `lucide-react` |
| Delete             | `Trash2Icon`        | `lucide-react` |
| Search             | `SearchIcon`        | `lucide-react` |
| Filter             | `FilterIcon`        | `lucide-react` |
| Close              | `XIcon`             | `lucide-react` |
| Confirm / Check    | `CheckIcon`         | `lucide-react` |
| Alert / Warning    | `AlertTriangleIcon` | `lucide-react` |
| Navigate (chevron) | `ChevronRightIcon`  | `lucide-react` |
| Calendar           | `CalendarIcon`      | `lucide-react` |
| Notifications      | `BellIcon`          | `lucide-react` |
| User / Profile     | `UserIcon`          | `lucide-react` |
| Settings           | `SettingsIcon`      | `lucide-react` |
| Logout             | `LogOutIcon`        | `lucide-react` |
| Loading            | `Loader2Icon`       | `lucide-react` |
| Empty state        | `InboxIcon`         | `lucide-react` |
| Money              | `DollarSignIcon`    | `lucide-react` |
| Clock / Time       | `ClockIcon`         | `lucide-react` |

---

## Component patterns

All components live in `apps/web/src/components/ui/`.

### `EmptyState`

Icon + message + optional CTA. Used on all list/dashboard screens when no data exists.

```tsx
<EmptyState
  icon={UsersIcon}
  title="No hay empleados"
  description="Agrega tu primer empleado para comenzar."
  action={{ label: "Agregar empleado", onClick: handleAdd }}
/>
```

### `ConfirmationDialog`

Two variants:

- **Standard** (`variant="default"`): Cancel + Confirm for reversible actions.
- **Destructive** (`variant="destructive"`): Red-highlighted with warning icon for financial/permanent actions (payout, deactivation, close day).

```tsx
<ConfirmationDialog
  trigger={<Button variant="destructive">Cerrar día</Button>}
  title="¿Cerrar el día de trabajo?"
  description="Esta acción cerrará las operaciones del día. Los tickets pendientes no podrán completarse."
  confirmLabel="Cerrar día"
  onConfirm={handleCloseDay}
  variant="destructive"
/>
```

### `SearchFilter`

Search bar (debounced 300ms, clear button) + horizontal filter chips + active filter indicators.

```tsx
<SearchFilter
  placeholder="Buscar clientes…"
  onValueChange={setSearch}
  filters={[
    { id: "active", label: "Activos" },
    { id: "inactive", label: "Inactivos" },
  ]}
  onFilterChange={setActiveFilters}
/>
```

### `LoadingSkeleton`

Multiple variants:

- `Skeleton`: base animated placeholder block
- `Spinner`: centred loader icon with accessible label
- `PageSkeleton`: full page loading skeleton matching common layouts
- `CardSkeleton`: card-shaped loading skeleton

```tsx
<PageSkeleton />
<Spinner size="lg" />
<Skeleton className="h-8 w-48" />
```

### `StatusBadge`

Pill-shaped badge using the status colour mapping. Pass any entity status string and it resolves to the correct colour category.

```tsx
<StatusBadge status="awaiting_payment" />
<StatusBadge status="completed" label="Completado" />
```

### `DataTable`

Fixed header, vertical scroll, numbers right-aligned, text left-aligned, row hover. Transforms to mobile cards when 4+ columns.

```tsx
<DataTable
  columns={[
    { key: "name", header: "Nombre", render: (e) => e.name },
    { key: "role", header: "Rol", render: (e) => <StatusBadge status={e.role} /> },
    { key: "salary", header: "Salario", align: "right", render: (e) => formatMoney(e.salary) },
  ]}
  data={employees}
  keyExtractor={(e) => e.id}
  onRowClick={(e) => router.push(`/employees/${e.id}`)}
/>
```

### `NumericBadge`

Three variants:

- **Default**: red circle with count (for notification bell, unsettled alerts)
- **Dot**: small coloured dot indicator
- **Pill**: coloured pill with text

```tsx
<NumericBadge count={3} />
<NumericBadge count={0} variant="dot" color="success" />
<NumericBadge count={5} variant="pill" color="warning" label="5 pendientes" />
```

---

## Real-time update animations

CSS classes and patterns for real-time UI updates:

| Animation     | Duration      | Usage                       | Implementation                                                           |
| ------------- | ------------- | --------------------------- | ------------------------------------------------------------------------ |
| New item      | 2s highlight  | Ticket appears in dashboard | `animate-in fade-in-0` + 2s `bg-status-progress/20` highlight that fades |
| Status change | 300ms         | Badge colour transition     | `transition-colors duration-300` (already on `StatusBadge`)              |
| Item removal  | 500ms         | Ticket moves out of view    | `animate-out fade-out-0 duration-500`                                    |
| Bulk updates  | 100ms stagger | Multiple items refresh      | Apply 100ms `transition-delay` incrementally per item                    |

### Implementation pattern

```tsx
// New item highlight
<div className={cn("transition-colors duration-2000", isNew && "bg-status-progress/20")}>
  {/* content */}
</div>;

// Staggered entrance
{
  items.map((item, i) => (
    <div key={item.id} className="animate-in fade-in-0" style={{ animationDelay: `${i * 100}ms` }}>
      {/* content */}
    </div>
  ));
}
```
