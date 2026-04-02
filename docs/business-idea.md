# Business idea — Innovation Befine operations platform

## Problem

Innovation Befine needs a single place to know **what work was done today**, **what each customer must pay**, and **how much to pay each employee**—including different pay models (percentage vs per-piece) and follow-up on **large cloth orders** and **appointments**.

## Company context

- **Name:** Innovation Befine
- **Devices:** Desktop PCs and phones; the experience must work on both (responsive).

---

## User roles

### Cashier (admin)

- Defines **stylist jobs**: customer price, commission the employee earns for that specific job, and **variants** when the same job has different prices (e.g. haircut by hair length). Each service has its own commission %; there is no per-stylist-subtype flat rate.
- Defines **cloth pieces** and what each piece pays the clothier.
- **Opens and closes the business day** (explicit open/close action — a day can span e.g. 6 AM to 2 AM the following calendar day; services belong to the open business day, not the clock date).
- Has a **dashboard view** showing every employee's open/in-progress tickets at a glance.
- Charges the customer and **closes the ticket**; records payment method. Can also **split payment** across methods (rare, but supported).
- Can **log services on behalf of any employee**.
- Can **edit any logged service directly**; edits by secretary or stylist require cashier approval before taking effect.
- Can **override a service price** at checkout (requires a written reason stored in the DB; not surfaced in the frontend UI for regular users).
- Can **reopen a closed ticket** if there is an error; employee earnings are recomputed on reopen.
- Reviews any employee's work for the day and **settles employee pay** (same night or next day), recording **amount and payment method**.
- Controls an **employee visibility flag** that, when revoked, hides the employee's own earnings from them.
- **Creates and manages employee accounts**; can deactivate an employee (preserving all history). Before deactivation: all pay must be settled; for termination cases, the admin can enter a single **termination payment** to close out the record.
- Needs **analytics**: revenue and comparison totals by day/week/month (current period + comparison with the previous equivalent period); jobs count and earnings per employee for those periods.

### Stylists (subtype of employee)

- Pay model: **percentage of each job they perform**; the percentage is set per service in the catalog — not per stylist subtype.
- Subtypes: manicurist, spa manager, hairdresser, masseuse, makeup artist.
- Can **log a service** they just completed; this creates a ticket in the cashier's dashboard.
- Can **move their own ticket to "awaiting payment"** status — signalling the cashier — but cannot close it themselves.
- Can view their own earnings (subject to admin visibility flag).

### Clothiers

- Pay model: **fixed pay per piece**, set per piece type in the catalog.
- Receive work via **cloth batches** created by the secretary or admin.
- Can **mark a piece as done**; completion requires **approval from secretary or admin** before it is counted.
- Cannot partially complete a piece or reassign it mid-batch.
- Receive an **in-app notification** when a batch or piece is assigned to them.

### Secretary (helper)

- Pay model: **fixed daily amount** (rate set by admin).
- Can **log a service on behalf of a stylist** (same as cashier log; cashier must approve any subsequent edits).
- **Books appointments**: client (saved or guest), service summary, assigned stylist, specific date and time. The system prevents double-booking the same stylist in overlapping time slots.
- **Confirms appointments** with clients (channel: manual / in-app flag for MVP; external channel defined later).
- Marks appointments as **cancelled**, **rescheduled**, or **no-show**. No-show events are recorded against the client's profile if they are a saved (non-guest) client.
- Creates **cloth batches**: assigns the whole batch to one clothier or assigns individual pieces to different clothiers.
- **Approves cloth piece completions** submitted by clothiers (or marks pieces done directly).
- Updates **large cloth order status**.
- Receives an **in-app notification** when an appointment is booked for one of their assisted stylists.
- **No access to financial data**: cannot see revenue, employee pay, settlement records, or analytics.

---

## Client / customer model

| Type | How stored | History |
|------|------------|---------|
| **Frequent / saved client** | Name + ID + contact info (phone/email) | Full history: appointments, tickets, cloth orders, no-show count |
| **Guest** | Name string only | No persistent record; ticket references name only |

- The cashier or secretary chooses at ticket/appointment creation whether to link a saved client or use a guest name.
- The same saved client can appear across multiple appointments, tickets, and large cloth orders.

---

## Ticket model

- A ticket is **tied to one employee first**, then optionally to a client (saved or guest).
- **One service performed by one stylist = one ticket**. If a customer has a haircut and a manicure, those are two separate tickets (two stylists, two commissions, two checkout events).
- **Ticket lifecycle:**

```
logged (by stylist / secretary / cashier)
  → awaiting payment (stylist or secretary moves it; cashier sees it highlighted)
  → closed (cashier collects payment, records method, ticket is done)
  → [reopened by cashier if error → back to awaiting payment]
```

- The **cashier dashboard** shows all open/in-progress tickets per employee in real time (live updates via WebSocket or server-sent events — not manual refresh).

---

## Core workflows

### 1. Service → charge → close

1. Customer arrives (walk-in or from an appointment).
2. Stylist, secretary, or cashier **logs the service** on the system.
3. Ticket appears live on the cashier dashboard.
4. Stylist (or secretary) marks it **awaiting payment** when finished.
5. Cashier collects payment (cash / card / bank transfer — or a combination), records method(s), and **closes the ticket**.

### 2. Payroll settlement

- Admin reviews each employee's completed tickets for the period.
- System computes: stylist → sum of commissions; clothier → sum of piece pays; secretary → daily fixed rate.
- Admin records **payout: amount, date, period covered, payment method**.
- Settled earnings are marked paid; unsettled are flagged.

### 3. Cloth batches and large orders (linked)

- A **large cloth order** from a client (100 pieces across multiple days, for example) is tracked as a single order record with status, pricing, and deposit.
- The secretary/admin creates one or more **cloth batches** linked to that order, assigns pieces to clothiers.
- As batches complete, the **order status** updates; cashier and management can see progress and give the client an ETA.
- Order statuses: `pending → in production → ready → delivered → paid in full` (secretary/admin updates).
- Batches can also exist independently of a large client order (regular daily production).

### 4. Scheduling and attendance

- The system knows which employees are expected to work on a given day (vacation / absence records).
- An employee can be on vacation, on an approved absence, or have missed a day of work — each tracked separately.

### 5. Employee deactivation

- **Normal departure:** all pay must be settled before deactivation.
- **Termination:** admin enters a single termination payment value to close out the record; account is deactivated immediately after.
- History (tickets, batches, payouts) is preserved regardless.

---

## Business day

The business day is **not tied to the calendar date**. The admin/cashier:
- Presses **"Open day"** to start accepting services.
- Presses **"Close day"** to end the day.

All services, tickets, and clothier pieces created between Open and Close belong to **that business day**, even if it spans past midnight.

---

## What is explicitly out of scope (for now)

| Item | Reason |
|------|--------|
| Tips | Given directly employee-to-employee/customer; not tracked by the company |
| Promotions / loyalty / seasonal discounts | May be added later |
| Full legal payroll / tax filing | System tracks pay; external accountant handles legal payroll |
| SMS/WhatsApp appointment reminders | External channel chosen when building that phase |
| Multi-branch / multi-location | Single location for MVP; decision deferred |

---

## Success criteria

- Cashier can run checkout and view all employee activity without manual spreadsheets.
- Management can see daily/weekly/monthly performance and per-employee contribution, with comparison to the prior period.
- Employees trust their completed work and payouts are auditable (and can see their own earnings unless revoked by admin).
- Flaky connectivity does not lose work (offline strategy defined in technical doc).
