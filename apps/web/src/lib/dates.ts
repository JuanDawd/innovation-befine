/**
 * T07R-R7 — Date helpers anchored to America/Bogota (UTC-5, no DST).
 *
 * All period boundaries use the business timezone so that late-night POS
 * sessions don't see "today $0" while the cashier is still on the same
 * business day. ISO weeks start on Monday (ISO 8601).
 */

const BOGOTA_TZ = "America/Bogota";

/** Today's date string in Bogota timezone (YYYY-MM-DD) */
export function todayInBogota(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BOGOTA_TZ });
}

/** Start of the current ISO week (Monday) in Bogota TZ */
export function isoWeekStartInBogota(): Date {
  const today = new Date(todayInBogota() + "T00:00:00-05:00");
  const dow = today.getDay() || 7; // Sun→7
  today.setDate(today.getDate() - (dow - 1));
  return today;
}

/** Start of the current calendar month in Bogota TZ */
export function monthStartInBogota(): Date {
  const today = new Date(todayInBogota() + "T00:00:00-05:00");
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

/** ISO week key (YYYY-Www) for a YYYY-MM-DD date string */
export function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
