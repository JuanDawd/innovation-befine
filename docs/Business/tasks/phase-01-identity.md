# Phase 1 — Identity, employees, and business day

> Goal: admin can create employees, assign roles, open/close the business day. Email is configured. Navigation shell exists. Vacations and deactivation guard moved to Phase 7 (when payroll is in place).

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
- [ ] The new user receives a password reset email (via Resend, depends on T054) to set their password
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
**Dependencies:** T016, T054

### What to do
Implement the "forgot password" and "set new password" flows using Better Auth's built-in email verification. Use the Resend client configured in T054 to deliver the reset email.

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
Add Next.js middleware that checks the Better Auth session on every request. Redirect unauthenticated users to `/login`. Redirect authenticated users trying to access a route they don't have permission for to a 403 page.

### Acceptance criteria
- [ ] Unauthenticated request to any protected route → redirected to `/login`
- [ ] Authenticated user accessing an unauthorized route → 403
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

## T022a — Basic employee deactivation

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T014

### What to do
Add a "Deactivate employee" action on the employee detail view. Sets `is_active = false` and `deactivated_at = now()`. The deactivated employee cannot log in. Their history is fully preserved. The earnings guard (block if unsettled) is added in T022b (Phase 7) once the payroll system exists.

### Acceptance criteria
- [ ] Admin can deactivate any employee from their profile
- [ ] Deactivated employee's session is invalidated; login attempt is blocked
- [ ] Deactivated employees are hidden from active lists but visible under a "Show inactive" filter
- [ ] All historic records (tickets, payouts, absences) remain intact and queryable by admin
- [ ] No earnings check yet (that comes in T022b, Phase 7)

---

## T054 — Resend email integration

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T003

### What to do
Install `resend` and `@react-email/components`. Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to environment variables and `.env.example`. Create a utility function `sendEmail(to, subject, reactComponent)`. This is the shared email transport used by T017 (password reset) and later T055 (appointment confirmation template).

### Acceptance criteria
- [ ] Resend API key stored securely in env (not committed)
- [ ] Utility function sends an email successfully in a test
- [ ] Failed sends log an error but do not crash the app (fire-and-forget with try/catch)
- [ ] `RESEND_API_KEY` and `RESEND_FROM_EMAIL` added to `.env.example`

---

## T090 — App navigation / layout shell

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T010

### What to do
Build the persistent app shell: top header (app name, user avatar, logout), sidebar or bottom navigation bar, and mobile hamburger drawer. Navigation items are role-aware — each role sees only the routes relevant to them. All subsequent screen-level tasks build inside this shell.

### Acceptance criteria
- [ ] Shell renders for all four roles with correct nav items
- [ ] Active route is visually highlighted in the nav
- [ ] Mobile layout uses a bottom bar or collapsible drawer (no sidebar crowding a phone screen)
- [ ] Logout action clears the session and redirects to `/login`
- [ ] Shell is responsive across all target breakpoints

---

## T091 — Employee self-service password change

**Phase:** 1 — Identity
**Status:** pending
**Dependencies:** T016

### What to do
Add a "Change password" option inside the user's profile or settings screen. The employee must enter their current password before setting a new one.

### Acceptance criteria
- [ ] Any authenticated user can access the change-password form
- [ ] Current password is verified server-side before accepting the new password
- [ ] Weak passwords (< 8 characters) are rejected with a clear message
- [ ] On success: session remains active; no logout required
