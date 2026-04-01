# Business idea — Innovation Befine operations platform

## Problem

Innovation Befine needs a single place to know **what work was done today**, **what each customer must pay**, and **how much to pay each employee**—including different pay models (percentage vs per-piece) and follow-up on **large cloth orders** and **appointments**.

## Company context

- **Name:** Innovation Befine  
- **Devices:** Desktop PCs and phones; the experience must work on both (responsive).

## User roles (summary)

### Cashier (admin)

- Defines **stylist jobs**: price, what the employee earns for that job, and **variants** when the same job has different prices (e.g. haircut by hair length).  
- Defines **cloth pieces** and what each piece pays the clothier.  
- Sees work in progress so they can **charge the customer**; records **payment method** (cash, card, bank transfer).  
- When the customer is paid, the **job is finished**.  
- Reviews **any employee’s work for the day** and **settles pay** (same night or next day).  
- Needs **analytics**: revenue by day / week / month; who did the most jobs; how much each employee earned in those periods.

### Stylists (subtype of employee)

- Paid as a **percentage of the job** they performed.  
- Subtypes: manicurist, spa manager, hairdresser, masseuse, makeup artist.  
- Can **log the service** they just completed so the cashier sees it for billing.

### Clothiers

- Paid by **how much cloth work** they did in the day: **each piece has its own cost** (to the business and/or their pay—clarify in implementation).  
- Receive work via **batches** (see Secretary).

### Secretary (helper)

- **Books appointments:** client name, service intent, assigned stylist.  
- **Confirms** appointments with clients.  
- Creates **cloth batches** (what to produce), assigns a whole batch to a clothier or **splits pieces** across clothiers.

## Core workflows

1. **Service → charge → close**  
   Employee adds a service → cashier sees it → customer pays (method recorded) → job marked finished.

2. **Payroll settlement**  
   Pay can happen **the same night or the next day**; the system must record **who was paid, when, how much**, so nothing is missed.

3. **Large cloth orders**  
   Track **what** the client ordered, **who** is doing it, **short description**, **total price**, **upfront payment**, and **amount still owed**.

4. **Scheduling and attendance**  
   Know **who should work** on a given day; distinguish **vacation**, **other absence**, and **missed work** where relevant.

## Out of scope (unless stakeholders add later)

- Full legal payroll / tax filing (the product can **track** pay; external tools or accountants may still be required).  
- Exact SMS/WhatsApp provider choice (confirming appointments implies a channel; pick when building that phase).

## Success criteria (product)

- Cashier can run checkout without manual spreadsheets for day-to-day services.  
- Management can see **daily / weekly / monthly** performance and **per-employee** contribution.  
- Employees trust that **completed work and payouts** are auditable.  
- When connectivity is poor, critical actions are not lost (see technical doc for how this is implemented).
