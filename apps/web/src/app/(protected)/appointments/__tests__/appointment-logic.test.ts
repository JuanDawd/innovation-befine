import { describe, it, expect } from "vitest";

// ─── Types mirrored from schema ───────────────────────────────────────────────

type AppointmentStatus =
  | "booked"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "no_show";

type AppointmentAction = "confirm" | "cancel" | "no_show" | "complete";

// ─── Pure status-transition logic (mirrors ALLOWED_TRANSITIONS in actions.ts) ─

const ALLOWED_TRANSITIONS: Partial<
  Record<AppointmentStatus, Partial<Record<AppointmentAction, AppointmentStatus>>>
> = {
  booked: { confirm: "confirmed", cancel: "cancelled", no_show: "no_show", complete: "completed" },
  confirmed: { cancel: "cancelled", no_show: "no_show", complete: "completed" },
};

function transition(
  current: AppointmentStatus,
  action: AppointmentAction,
): AppointmentStatus | "INVALID" {
  const next = ALLOWED_TRANSITIONS[current]?.[action];
  return next ?? "INVALID";
}

function isTerminal(status: AppointmentStatus): boolean {
  return ["completed", "cancelled", "rescheduled", "no_show"].includes(status);
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

  describe("terminal states reject all actions", () => {
    const terminals: AppointmentStatus[] = ["completed", "cancelled", "no_show", "rescheduled"];
    const actions: AppointmentAction[] = ["confirm", "cancel", "no_show", "complete"];

    for (const status of terminals) {
      for (const action of actions) {
        it(`${status} + ${action} → INVALID`, () => {
          expect(transition(status, action)).toBe("INVALID");
        });
      }
    }
  });

  describe("isTerminal", () => {
    it("marks completed as terminal", () => expect(isTerminal("completed")).toBe(true));
    it("marks cancelled as terminal", () => expect(isTerminal("cancelled")).toBe(true));
    it("marks no_show as terminal", () => expect(isTerminal("no_show")).toBe(true));
    it("marks rescheduled as terminal", () => expect(isTerminal("rescheduled")).toBe(true));
    it("marks booked as non-terminal", () => expect(isTerminal("booked")).toBe(false));
    it("marks confirmed as non-terminal", () => expect(isTerminal("confirmed")).toBe(false));
  });
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
