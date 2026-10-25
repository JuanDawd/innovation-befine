import { describe, it, expect } from "vitest";
import { allowedNow, hasStarted, nextFreeStart } from "@/lib/appointment-timing";

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

describe("nextFreeStart", () => {
  const t = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00-05:00`);
  const busy = [
    { start: t("15:00"), minutes: 90 }, // 15:00–16:30
    { start: t("16:30"), minutes: 60 }, // 16:30–17:30
    { start: t("18:00"), minutes: 60 }, // 18:00–19:00
  ];

  it("keeps a time that is already free", () => {
    expect(nextFreeStart(busy, t("13:00"), 60)).toEqual(t("13:00"));
  });

  it("skips back-to-back appointments to the first gap that fits", () => {
    expect(nextFreeStart(busy, t("15:30"), 30)).toEqual(t("17:30"));
  });

  it("jumps past a gap too short for the duration", () => {
    expect(nextFreeStart(busy, t("15:30"), 60)).toEqual(t("19:00"));
  });

  it("does not collide with a slot that starts right when this one ends", () => {
    expect(nextFreeStart(busy, t("14:00"), 60)).toEqual(t("14:00"));
  });

  it("works with no appointments", () => {
    expect(nextFreeStart([], t("10:00"), 45)).toEqual(t("10:00"));
  });
});
