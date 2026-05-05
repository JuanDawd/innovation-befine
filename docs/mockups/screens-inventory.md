# Befine — Screens Inventory

All application screens organised by role. Each entry maps to a route in `apps/web/src/app/(protected)/`.

**Status values:**

- `remaining` — not yet designed
- `designed` — mockup file exists
- `reviewed` — mockup reviewed and accepted by stakeholders
- `finished` — implemented and production-ready

---

## Cashier / Admin (`/cashier`, `/admin`)

> Desktop-first. Sidebar navigation. Cashier and admin share `befine-admin-secretary-portal.html` with a role toggle.

| Screen               | Route                       | Status     | Mockup file                          |
| -------------------- | --------------------------- | ---------- | ------------------------------------ |
| Dashboard (tablero)  | `/cashier`                  | `designed` | `befine-admin-secretary-portal.html` |
| Checkout (caja)      | `/cashier/checkout`         | `designed` | `befine-admin-secretary-portal.html` |
| Ticket history       | `/cashier/tickets/history`  | `designed` | `befine-admin-secretary-portal.html` |
| New ticket           | `/cashier/tickets/new`      | `designed` | `cashier/new-ticket.html`            |
| Appointments (citas) | `/cashier/appointments`     | `designed` | `befine-admin-secretary-portal.html` |
| New appointment      | `/cashier/appointments/new` | `designed` | `cashier/new-appointment.html`       |
| Clients              | `/cashier/clients`          | `designed` | `cashier/clients.html`               |

---

## Admin-only (`/admin`)

| Screen                 | Route                    | Status     | Mockup file                          |
| ---------------------- | ------------------------ | ---------- | ------------------------------------ |
| Employees (empleados)  | `/admin/employees`       | `designed` | `befine-admin-secretary-portal.html` |
| New employee modal     | `/admin/employees/new`   | `designed` | `admin/employees-new.html`           |
| Payroll / Nómina       | `/admin/payroll`         | `designed` | `befine-admin-secretary-portal.html` |
| Catalogue (catálogo)   | `/admin/catalog`         | `designed` | `befine-admin-secretary-portal.html` |
| Absences (ausencias)   | `/admin/absences`        | `designed` | `admin/absences.html`                |
| Analytics              | `/admin/analytics`       | `designed` | `befine-admin-secretary-portal.html` |
| Ticket history (admin) | `/admin/tickets/history` | `designed` | `befine-admin-secretary-portal.html` |
| Large orders           | `/large-orders`          | `designed` | `befine-admin-secretary-portal.html` |
| Large order detail     | `/large-orders/[id]`     | `designed` | `befine-admin-secretary-portal.html` |
| New large order modal  | `/large-orders/new`      | `designed` | `befine-admin-secretary-portal.html` |
| Batches (lotes)        | `/admin/batches`         | `designed` | `befine-admin-secretary-portal.html` |
| New batch modal        | `/admin/batches/new`     | `designed` | `admin/batches-new.html`             |
| Roadmap                | `/admin/roadmap`         | `designed` | `admin/roadmap.html`                 |

---

## Secretary (`/secretary`)

| Screen               | Route                         | Status     | Mockup file                                          |
| -------------------- | ----------------------------- | ---------- | ---------------------------------------------------- |
| Dashboard (inicio)   | `/secretary`                  | `designed` | `befine-admin-secretary-portal.html`                 |
| Appointments (citas) | `/secretary/appointments`     | `designed` | `befine-admin-secretary-portal.html`                 |
| New appointment      | `/secretary/appointments/new` | `designed` | `cashier/new-appointment.html` (shared, view toggle) |
| Batches (lotes)      | `/secretary/batches`          | `designed` | `befine-admin-secretary-portal.html`                 |
| New batch modal      | `/secretary/batches/new`      | `designed` | `admin/batches-new.html` (shared)                    |
| Large orders         | `/large-orders`               | `designed` | `befine-admin-secretary-portal.html`                 |
| New ticket           | `/secretary/tickets/new`      | `designed` | `cashier/new-ticket.html` (secretary role toggle)    |
| Clients              | `/secretary/clients`          | `designed` | `cashier/clients.html` (shared)                      |
| My earnings          | `/secretary/earnings`         | `designed` | `stylist/earnings.html` (secretary role toggle)      |

---

## Stylist (`/stylist`)

> Mobile-first phone shell.

| Screen        | Route                    | Status     | Mockup file                                     |
| ------------- | ------------------------ | ---------- | ----------------------------------------------- |
| Home (inicio) | `/stylist`               | `designed` | `befine-employee-portal.html`                   |
| Tickets list  | `/stylist/tickets`       | `designed` | `befine-employee-portal.html`                   |
| New ticket    | `/stylist/tickets/new`   | `designed` | `cashier/new-ticket.html` (stylist role toggle) |
| Edit requests | `/stylist/edit-requests` | `designed` | `befine-employee-portal.html`                   |
| Profile       | `/profile`               | `designed` | `befine-employee-portal.html`                   |
| My earnings   | `/stylist/earnings`      | `designed` | `stylist/earnings.html`                         |

---

## Clothier (`/clothier`)

> Mobile-first phone shell.

| Screen        | Route                | Status     | Mockup file                   |
| ------------- | -------------------- | ---------- | ----------------------------- |
| Home (inicio) | `/clothier`          | `designed` | `befine-employee-portal.html` |
| Earnings      | `/clothier/earnings` | `designed` | `clothier/earnings.html`      |

---

## Shared / Auth

| Screen         | Route             | Status     | Mockup file                   |
| -------------- | ----------------- | ---------- | ----------------------------- |
| Login          | `/login`          | `designed` | `auth/login.html`             |
| Reset password | `/reset-password` | `designed` | `auth/reset-password.html`    |
| Profile        | `/profile`        | `designed` | `befine-employee-portal.html` |

---

## Folder structure

```
docs/mockups/
├── screens-inventory.md          ← this file
├── befine-admin-secretary-portal.html  ← cashier / admin / secretary (multi-screen)
├── befine-employee-portal.html         ← stylist / clothier (multi-screen)
├── befine-admin-dashboard.html         ← admin analytics hero (standalone)
│
├── auth/
│   ├── login.html
│   └── reset-password.html
│
├── cashier/
│   ├── new-ticket.html           ← role toggle: cashier / secretary / stylist
│   ├── new-appointment.html      ← view toggle: modal (desktop) / full-page (mobile)
│   └── clients.html              ← shared by cashier + secretary
│
├── admin/
│   ├── employees-new.html        ← new employee modal
│   ├── absences.html             ← calendar + day detail panel
│   ├── batches-new.html          ← new batch modal (shared by admin + secretary)
│   └── roadmap.html              ← phase-grouped task progress
│
├── secretary/                    ← (reuses cashier/ and admin/ files via role toggles)
│
├── stylist/
│   └── earnings.html             ← role toggle: estilista (commission) / secretaria (daily)
│
└── clothier/
    └── earnings.html             ← piece-rate earnings by batch
```

---

## Screen descriptions

### Cashier / Admin

**New ticket** (`cashier/new-ticket.html`)
4-step wizard: (1) client lookup with saved-client search + walk-in toggle; (2) stylist grid select; (3) service catalogue with checkboxes and running total; (4) summary + confirm. Role toggle switches between cashier (full access), secretary (no override, hands off to cashier), and stylist (simplified, mobile-friendly). Success state shows ticket number.

**New appointment** (`cashier/new-appointment.html`)
Single form: client search + walk-in toggle, stylist selector, service variant, date input, quick time-slot grid (busy slots greyed out), overlap conflict warning, optional note. View toggle switches between desktop modal and full-page mobile/tablet layout.

**Clients** (`cashier/clients.html`)
Searchable table (name, phone, last visit, visit count, status badge). Filter by active/archived. Row hover reveals edit + archive icon buttons. "+ Nuevo cliente" opens a right slide-over with name, phone, email, notes. Empty state with CTA shown when search has no results.

### Admin-only

**New employee** (`admin/employees-new.html`)
Modal form: name, email, role selection cards (Estilista → commission %, Confeccionista → piece rate COP, Secretaria/Cajero → daily rate COP), temporary password, 4-digit PIN with auto-advance inputs.

**Absences** (`admin/absences.html`)
Full-screen split: left = month calendar grid (each cell shows mini avatars of present employees, red badge for absences); right = day detail panel with present/absent count, per-employee toggle buttons. Month navigation in topbar.

**New batch** (`admin/batches-new.html`)
Modal: client search dropdown, cloth type + garment type selectors, piece count counter with ±buttons, description textarea, clothier multi-select checkboxes with per-clothier piece rate.

**Roadmap** (`admin/roadmap.html`)
Split layout: left = phase list with progress dots and percentage; right = selected phase detail showing progress bar and task checklist (done ✓ / active pulse / pending). Read-only; phases 0A–7 populated with real task IDs.

### Shared earnings

**Stylist/Secretary earnings** (`stylist/earnings.html`)
Phone shell. Hero card: period label, total amount, commission rate (stylist) or daily rate (secretary). Role toggle switches content: stylist shows per-ticket commission rows; secretary shows per-day worked rows. Period tabs for quincenal history. Payout history section at bottom.

**Clothier earnings** (`clothier/earnings.html`)
Phone shell. Hero card: total, pieces count, piece rate, batch count. Per-batch accordion cards (client, fabric type, pieces approved × rate = subtotal). Payout history section.

### Auth

**Login** (`auth/login.html`)
Centred card on dark/ivory canvas. Brand diamond logo + Fraunces italic name. Email + password with show/hide toggle. "Iniciar sesión" button with spinner loading state. "¿Olvidaste tu contraseña?" link. Footer note: access created by admin. Animated pink glow blob in background. Light/dark toggle.

**Reset password** (`auth/reset-password.html`)
Same card shell as login. 3-step flow with dot progress indicator: (1) enter email → send link button; (2) set new password + confirm with show/hide; (3) success state with green check icon and link back to login. Steps animate in with slide-up fade.
