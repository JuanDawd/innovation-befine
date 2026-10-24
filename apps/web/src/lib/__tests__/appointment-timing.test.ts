import { describe, it, expect } from "vitest";
import { allowedNow, hasStarted } from "@/lib/appointment-timing";

const at = "2026-10-24T15:00:00-05:00";
const before = new Date("2026-10-24T14:59:00-05:00");
const after = new Date("2026-10-24T15:00:00-05:00");
const dayBefore = new Date("2026-10-23T18:00:00-05:00");

describe("appointment timing", () => {
  it("counts the scheduled minute as started", () => {
    expect(hasStarted(at, before)).toBe(false);
    expect(hasStarted(at, after)).toBe(true);
  });

  it("allows no-show only once the appointment time has come", () => {
    expect(allowedNow("no_show", at, before)).toBe(false);
    expect(allowedNow("no_show", at, after)).toBe(true);
  });

  it("allows completing early the same day but not from an earlier day", () => {
    expect(allowedNow("complete", at, before)).toBe(true);
    expect(allowedNow("complete", at, dayBefore)).toBe(false);
  });

  it("uses the Bogota date, not UTC", () => {
    // 20:00 Bogota on the 23rd is already the 24th in UTC
    expect(allowedNow("complete", at, new Date("2026-10-23T20:00:00-05:00"))).toBe(false);
  });

  it.each(["confirm", "cancel", "reschedule", "reopen"])("allows %s any time", (action) => {
    expect(allowedNow(action, at, dayBefore)).toBe(true);
  });
});
