import { describe, it, expect } from "vitest";

// ─── Types mirrored from schema ───────────────────────────────────────────────

type AppointmentStatus =
  | "booked"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no_show";

type AppointmentAction = "confirm" | "cancel" | "no_show" | "complete" | "reopen";

// ─── Pure status-transition logic (mirrors ALLOWED_TRANSITIONS in actions.ts) ─

const ALLOWED_TRANSITIONS: Partial<
  Record<AppointmentStatus, Partial<Record<AppointmentAction, AppointmentStatus>>>
> = {
  booked: { confirm: "confirmed", cancel: "cancelled", no_show: "no_show", complete: "completed" },
  confirmed: { cancel: "cancelled", no_show: "no_show", complete: "completed" },
  // T032b: no_show can be reversed back to booked (triggers decrement of no_show_count)
  no_show: { reopen: "booked" },
};

function transition(
  current: AppointmentStatus,
  action: AppointmentAction,
): AppointmentStatus | "INVALID" {
  const next = ALLOWED_TRANSITIONS[current]?.[action];
  return next ?? "INVALID";
}

function isTerminal(status: AppointmentStatus): boolean {
  // no_show is no longer fully terminal — it can be reversed via "reopen"
  return ["completed", "cancelled", "rescheduled"].includes(status);
}

// ─── T032b — no-show count delta logic ────────────────────────────────────────

function noShowCountDelta(
  previousStatus: AppointmentStatus,
  newStatus: AppointmentStatus,
  hasClientRecord: boolean,
): number {
  if (!hasClientRecord) return 0;
  if (newStatus === "no_show" && previousStatus !== "no_show") return +1;
  if (previousStatus === "no_show" && newStatus !== "no_show") return -1;
  return 0;
}

// ─── Overlap detection (mirrors JS logic in createAppointment) ────────────────

type Slot = { scheduledAt: Date; durationMinutes: number };

function overlaps(a: Slot, b: Slot): boolean {
  const aStart = a.scheduledAt.getTime();
  const aEnd = aStart + a.durationMinutes * 60_000;
  const bStart = b.scheduledAt.getTime();
  const bEnd = bStart + b.durationMinutes * 60_000;
  return aStart < bEnd && aEnd > bStart;
}

function slot(isoStart: string, minutes: number): Slot {
  return { scheduledAt: new Date(isoStart), durationMinutes: minutes };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Appointment status transitions", () => {
  describe("booked → *", () => {
    it("allows confirm", () => expect(transition("booked", "confirm")).toBe("confirmed"));
    it("allows cancel", () => expect(transition("booked", "cancel")).toBe("cancelled"));
    it("allows no_show", () => expect(transition("booked", "no_show")).toBe("no_show"));
    it("allows complete", () => expect(transition("booked", "complete")).toBe("completed"));
  });

  describe("confirmed → *", () => {
    it("rejects confirm (already confirmed)", () =>
      expect(transition("confirmed", "confirm")).toBe("INVALID"));
    it("allows cancel", () => expect(transition("confirmed", "cancel")).toBe("cancelled"));
    it("allows no_show", () => expect(transition("confirmed", "no_show")).toBe("no_show"));
    it("allows complete", () => expect(transition("confirmed", "complete")).toBe("completed"));
  });

  describe("terminal states reject non-applicable actions", () => {
    const hardTerminals: AppointmentStatus[] = ["completed", "cancelled", "rescheduled"];
    const actions: AppointmentAction[] = ["confirm", "cancel", "no_show", "complete", "reopen"];

    for (const status of hardTerminals) {
      for (const action of actions) {
        it(`${status} + ${action} → INVALID`, () => {
          expect(transition(status, action)).toBe("INVALID");
        });
      }
    }
  });

  describe("no_show → * (T032b reversal)", () => {
    it("allows reopen (reversal)", () => expect(transition("no_show", "reopen")).toBe("booked"));
    it("rejects confirm from no_show", () =>
      expect(transition("no_show", "confirm")).toBe("INVALID"));
    it("rejects cancel from no_show", () =>
      expect(transition("no_show", "cancel")).toBe("INVALID"));
    it("rejects complete from no_show", () =>
      expect(transition("no_show", "complete")).toBe("INVALID"));
  });

  describe("isTerminal", () => {
    it("marks completed as terminal", () => expect(isTerminal("completed")).toBe(true));
    it("marks cancelled as terminal", () => expect(isTerminal("cancelled")).toBe(true));
    it("marks no_show as non-terminal (T032b — reversible)", () =>
      expect(isTerminal("no_show")).toBe(false));
    it("marks rescheduled as terminal", () => expect(isTerminal("rescheduled")).toBe(true));
    it("marks booked as non-terminal", () => expect(isTerminal("booked")).toBe(false));
    it("marks confirmed as non-terminal", () => expect(isTerminal("confirmed")).toBe(false));
  });
});

describe("T032b — no-show count delta", () => {
  it("increments when transitioning to no_show from booked", () =>
    expect(noShowCountDelta("booked", "no_show", true)).toBe(1));

  it("increments when transitioning to no_show from confirmed", () =>
    expect(noShowCountDelta("confirmed", "no_show", true)).toBe(1));

  it("does not double-increment if already no_show (idempotency)", () =>
    expect(noShowCountDelta("no_show", "no_show", true)).toBe(0));

  it("decrements when reversing from no_show to booked", () =>
    expect(noShowCountDelta("no_show", "booked", true)).toBe(-1));

  it("decrements when reversing from no_show to completed", () =>
    expect(noShowCountDelta("no_show", "completed", true)).toBe(-1));

  it("returns 0 for guests (no client record)", () =>
    expect(noShowCountDelta("booked", "no_show", false)).toBe(0));

  it("returns 0 for non-no_show transitions", () =>
    expect(noShowCountDelta("booked", "completed", true)).toBe(0));

  it("returns 0 for confirm transition", () =>
    expect(noShowCountDelta("booked", "confirmed", true)).toBe(0));
});

describe("Appointment overlap detection", () => {
  it("detects exact same slot", () => {
    const a = slot("2026-04-20T10:00:00Z", 60);
    expect(overlaps(a, a)).toBe(true);
  });

  it("detects partial overlap at start", () => {
    const existing = slot("2026-04-20T10:00:00Z", 60); // 10:00–11:00
    const newSlot = slot("2026-04-20T09:30:00Z", 60); // 09:30–10:30
    expect(overlaps(existing, newSlot)).toBe(true);
  });

  it("detects partial overlap at end", () => {
    const existing = slot("2026-04-20T10:00:00Z", 60); // 10:00–11:00
    const newSlot = slot("2026-04-20T10:30:00Z", 60); // 10:30–11:30
    expect(overlaps(existing, newSlot)).toBe(true);
  });

  it("detects fully contained slot", () => {
    const existing = slot("2026-04-20T10:00:00Z", 120); // 10:00–12:00
    const newSlot = slot("2026-04-20T10:30:00Z", 30); // 10:30–11:00
    expect(overlaps(existing, newSlot)).toBe(true);
  });

  it("allows back-to-back (no gap)", () => {
    const a = slot("2026-04-20T10:00:00Z", 60); // 10:00–11:00
    const b = slot("2026-04-20T11:00:00Z", 60); // 11:00–12:00
    expect(overlaps(a, b)).toBe(false);
  });

  it("allows slot before existing", () => {
    const existing = slot("2026-04-20T12:00:00Z", 60); // 12:00–13:00
    const newSlot = slot("2026-04-20T10:00:00Z", 60); // 10:00–11:00
    expect(overlaps(existing, newSlot)).toBe(false);
  });

  it("allows slot after existing", () => {
    const existing = slot("2026-04-20T10:00:00Z", 60); // 10:00–11:00
    const newSlot = slot("2026-04-20T12:00:00Z", 60); // 12:00–13:00
    expect(overlaps(existing, newSlot)).toBe(false);
  });

  it("handles 15-minute minimum slot duration", () => {
    const a = slot("2026-04-20T10:00:00Z", 15); // 10:00–10:15
    const b = slot("2026-04-20T10:15:00Z", 15); // 10:15–10:30
    expect(overlaps(a, b)).toBe(false);
  });

  it("detects 1-minute overlap", () => {
    const a = slot("2026-04-20T10:00:00Z", 61); // 10:00–11:01
    const b = slot("2026-04-20T11:00:00Z", 60); // 11:00–12:00
    expect(overlaps(a, b)).toBe(true);
  });
});

describe("Bogota timezone date parsing", () => {
  it("correctly converts Bogota datetime to UTC", () => {
    // America/Bogota is UTC-5
    const bogotaMidnight = new Date("2026-04-20T00:00:00-05:00");
    expect(bogotaMidnight.getUTCHours()).toBe(5);
    expect(bogotaMidnight.getUTCDate()).toBe(20);
  });

  it("correctly computes day window for Bogota date", () => {
    const dayStart = new Date("2026-04-20T00:00:00-05:00"); // UTC 05:00
    const dayEnd = new Date("2026-04-20T23:59:59.999-05:00"); // UTC 04:59:59.999 next day

    const aptInBogotaDay = new Date("2026-04-20T14:00:00-05:00"); // UTC 19:00
    expect(aptInBogotaDay >= dayStart && aptInBogotaDay <= dayEnd).toBe(true);

    const aptNextBogotaDay = new Date("2026-04-21T00:00:00-05:00"); // UTC 05:00 next day
    expect(aptNextBogotaDay >= dayStart && aptNextBogotaDay <= dayEnd).toBe(false);
  });
});
