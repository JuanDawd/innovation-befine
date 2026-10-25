import { businessDateOf } from "@/lib/dates";

/**
 * Appointment actions that depend on the clock. A client can't be marked
 * absent before their time; a service can be completed early (the client
 * arrived ahead of time) but not on a later day. Shared by the server action
 * and the appointment list.
 */
export function hasStarted(scheduledAt: Date | string, now: Date = new Date()): boolean {
  return new Date(scheduledAt).getTime() <= now.getTime();
}

export function allowedNow(action: string, scheduledAt: Date | string, now = new Date()): boolean {
  if (action === "no_show") return hasStarted(scheduledAt, now);
  if (action === "complete") return businessDateOf(scheduledAt) <= businessDateOf(now);
  return true;
}

export type BusySlot = { start: Date; minutes: number };

/** Statuses that still hold the stylist's time (mirrors the no-overlap constraint). */
export const HOLDS_TIME = new Set(["booked", "confirmed", "completed"]);

/**
 * The first start at or after `from` where `minutes` fit without touching a
 * busy slot — what the booking form offers when the chosen time is taken.
 */
export function nextFreeStart(busy: BusySlot[], from: Date, minutes: number): Date {
  const sorted = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  let start = from.getTime();
  for (const slot of sorted) {
    const slotStart = slot.start.getTime();
    const slotEnd = slotStart + slot.minutes * 60_000;
    if (start + minutes * 60_000 <= slotStart) break;
    if (start < slotEnd) start = slotEnd;
  }
  return new Date(start);
}
