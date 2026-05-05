import { describe, expect, it } from "vitest";
import { parseRoadmap } from "../roadmap";

const SAMPLE_LEGACY = `# Post-MVP Roadmap

> Planning document.

---

## Phase 1: UI / UX redesign

Intro about the UI redesign.

### Task 1.1: Icon audit

- **Description:** Lucide only, aria labels on icon-only buttons.
- **Acceptance Criteria:**
  - All icons are Lucide.
- **Testing Steps:**
  - Audit each screen visually.
- **Dependencies:** None.

---

### Task 1.2: Responsive layout

- **Description:** Some text about responsive.
- **Acceptance Criteria:**
  - No horizontal scroll at 360px.
- **Testing Steps:**
  - Test at 360px width.
- **Dependencies:** Task 1.1.

---

## Phase 2: Feature additions

### Task 2.1: Push notifications

- **Description:** Stretch goal.
- **Acceptance Criteria:**
  - Push delivered within 5s.
- **Testing Steps:**
  - Open in two tabs, verify push.
- **Dependencies:** T081.

### Task 2.7: Appointment confirmation emails

- **Description:** Deferred from MVP T055.
- **Acceptance Criteria:**
  - Email delivered.
- **Testing Steps:**
  - Trigger send, verify inbox.
- **Dependencies:** T055.

---
`;

const SAMPLE_NEW = `# Post-MVP Roadmap

> Enhancements after MVP.

---

## Phase A: Communication and Notifications

---

### Task A.1: Push notifications — cashier and clothier alerts

- **Description:** Cashier receives a browser push when a new ticket is logged.
- **Acceptance Criteria:**
  - Subscriptions stored per employee.
- **Testing Steps:**
  - Open cashier dashboard → log a ticket → push received.
- **Dependencies:** T081.

---

### Task A.2: Appointment reminders via WhatsApp / SMS

- **Description:** Send reminders 24h before appointment.
- **Acceptance Criteria:**
  - Reminders sent only to consenting clients.
- **Testing Steps:**
  - Set consent true → cron fires → log entry created.
- **Dependencies:** T049.

---

## Phase B: Client-Facing Booking App

---

### Task B.1: Schema additions for client booking

- **Description:** Add booking-related columns.
- **Acceptance Criteria:**
  - Migration runs without errors.
- **Testing Steps:**
  - Run migration → verify columns.
- **Dependencies:** None.

---
`;

describe("parseRoadmap — legacy phase format", () => {
  it("parses phases with numeric IDs", () => {
    const roadmap = parseRoadmap("post-mvp", SAMPLE_LEGACY);
    expect(roadmap.phases.map((p) => p.id)).toEqual(["1", "2"]);
    expect(roadmap.phases[0].title).toBe("UI / UX redesign");
  });

  it("groups tasks under their phase", () => {
    const roadmap = parseRoadmap("post-mvp", SAMPLE_LEGACY);
    expect(roadmap.phases[0].tasks.map((t) => t.id)).toEqual(["1.1", "1.2"]);
    expect(roadmap.phases[1].tasks.map((t) => t.id)).toEqual(["2.1", "2.7"]);
  });

  it("totals task count across all phases", () => {
    const roadmap = parseRoadmap("post-mvp", SAMPLE_LEGACY);
    expect(roadmap.total).toBe(4);
  });

  it("defaults to plan status when no Status field", () => {
    const roadmap = parseRoadmap("post-mvp", SAMPLE_LEGACY);
    expect(roadmap.phases[0].tasks[0].status).toBe("plan");
  });
});

describe("parseRoadmap — new Phase letter format", () => {
  it("parses Phase X letter categories", () => {
    const roadmap = parseRoadmap("post-mvp", SAMPLE_NEW);
    expect(roadmap.phases.map((p) => p.id)).toEqual(["A", "B"]);
    expect(roadmap.phases[0].title).toBe("Communication and Notifications");
  });

  it("groups Task X.Y items correctly", () => {
    const roadmap = parseRoadmap("post-mvp", SAMPLE_NEW);
    expect(roadmap.phases[0].tasks.map((t) => t.id)).toEqual(["A.1", "A.2"]);
    expect(roadmap.phases[1].tasks.map((t) => t.id)).toEqual(["B.1"]);
  });

  it("totals item count across all phases", () => {
    const roadmap = parseRoadmap("post-mvp", SAMPLE_NEW);
    expect(roadmap.total).toBe(3);
  });
});
