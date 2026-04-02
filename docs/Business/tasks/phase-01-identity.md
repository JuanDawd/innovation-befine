# Phase 1 — Identity, employees, and business day

> Goal: admin can create employees, assign roles, open/close the business day, and mark employees as on vacation or absent.

---

## T012 — Employees table migration

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T006

### What to do
Create the `employees` table in Drizzle schema and run the migration. Fields: `id`, `user_id` (FK to auth users), `role`, `stylist_subtype` (nullable), `daily_rate` (for secretary; nullable), `show_earnings` flag, `is_active`, `hired_at`, `deactivated_at` (nullable), `created_at`.

### Acceptance criteria
- [ ] Migration runs without errors on Neon dev branch
- [ ] All fields present with correct types and constraints
- [ ] `user_id` has a unique constraint (one employee record per user)

---

## T013 — Employee account creation (admin)

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T012, T010

### What to do
Build the admin UI to create a new employee: form with name, email (becomes login), role, stylist subtype (shown only if role = stylist), and daily rate (shown only if role = secretary). On submit, create a Better Auth user and linked employee record.

### Acceptance criteria
- [ ] Admin can create users of any role from the dashboard
- [ ] The new user receives a password reset email to set their password
- [ ] Employee record is created and linked to the auth user
- [ ] Conditional fields (subtype, daily rate) show/hide correctly
- [ ] Non-admin roles cannot access this screen

---

## T014 — Employee list and profile view (admin)

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T013

### What to do
Build a list screen showing all employees with their role, subtype, status (active/inactive), and hire date. Clicking an employee opens a detail/edit view.

### Acceptance criteria
- [ ] All employees shown with name, role, subtype, status
- [ ] Filter by role and active/inactive
- [ ] Admin can edit name, role, subtype, and daily rate
- [ ] Changes are saved and reflected immediately

---

## T015 — Employee earnings visibility flag

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T014

### What to do
Add a toggle on the employee detail view to enable/disable whether the employee can see their own earnings. Enforce this flag throughout the app (Phase 7 will use it; add the check now).

### Acceptance criteria
- [ ] Admin can toggle `show_earnings` per employee
- [ ] A helper function `canSeeOwnEarnings(employeeId)` returns the correct value
- [ ] Flag state persisted immediately in DB

---

## T016 — Login page

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T007, T008

### What to do
Build the login page using Better Auth's sign-in method and Base Web UI components. After login, redirect each role to their respective placeholder home screen.

### Acceptance criteria
- [ ] Email + password login works for all seeded roles
- [ ] Wrong credentials show a clear error message
- [ ] Successful login redirects to role-appropriate screen
- [ ] Page is responsive (mobile and desktop)

---

## T017 — Password reset flow

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T016

### What to do
Implement the "forgot password" and "set new password" flows using Better Auth's built-in email verification. Use Resend to deliver the reset email.

### Acceptance criteria
- [ ] "Forgot password" link on login page
- [ ] Reset email delivered via Resend within 30 seconds
- [ ] Reset link expires after 1 hour
- [ ] New password is accepted and the user can log in

---

## T018 — Session middleware and route protection

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T010

### What to do
Add Next.js middleware that checks the Better Auth session on every request. Redirect unauthenticated users to `/login`. Redirect authenticated users to the wrong role's screen to a 403 page.

### Acceptance criteria
- [ ] Unauthenticated request to any protected route → redirected to `/login`
- [ ] Authenticated user accessing a route they don't have permission for → 403
- [ ] Public routes (`/login`, `/reset-password`) are accessible without session
- [ ] Middleware does not add measurable latency on hot paths

---

## T019 — Business day open/close

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T012

### What to do
Create the `business_days` table (migration: `id`, `opened_at`, `closed_at` nullable, `opened_by`, `closed_by` nullable). Add an "Open day" button visible to admin when no day is open, and a "Close day" button when one is open. All business-day-aware queries will join on this.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] Only one business day can be open at a time (DB constraint or app-level guard)
- [ ] Open and close timestamps recorded with the acting user's ID
- [ ] Current open business day ID is accessible in a shared server context (e.g. a helper function)
- [ ] Admin home screen shows current day status (open / closed / last closed at)

---

## T020 — Absences and vacation table migration

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T012

### What to do
Create the `employee_absences` table: `id`, `employee_id`, `type` (`vacation` | `approved_absence` | `missed`), `date`, `note` (nullable), `created_by`, `created_at`.

### Acceptance criteria
- [ ] Migration runs without errors
- [ ] Type enum enforced at DB level (Drizzle `pgEnum`)

---

## T021 — Vacation and absence management UI (admin)

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T020

### What to do
Build a UI where admin can add, edit, and delete absence records per employee. Show a monthly calendar view indicating which employees have absences.

### Acceptance criteria
- [ ] Admin can log a vacation, absence, or missed day for any employee
- [ ] Calendar view shows colored indicators per absence type
- [ ] "Who works today" query returns active employees without an absence on the current business day

---

## T022 — Employee deactivation and termination

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T014

### What to do
Add a "Deactivate employee" action on the employee detail view. The system checks if the employee has unsettled earnings; if so, block deactivation with an explanatory message. For termination, allow the admin to enter a termination payment amount which creates a final payout record before deactivating.

### Acceptance criteria
- [ ] Deactivation is blocked if employee has unsettled earnings
- [ ] Termination flow: enter amount → creates payout record → deactivates account
- [ ] Deactivated employee cannot log in
- [ ] Employee history (tickets, payouts, absences) is fully preserved and queryable by admin
- [ ] Deactivated employees are hidden from active lists but visible under a "Show inactive" filter
