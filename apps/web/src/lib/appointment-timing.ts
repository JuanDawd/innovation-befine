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
