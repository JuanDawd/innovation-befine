import { formatTime } from "@/i18n";

/**
 * Business days are not unique per date (a day can be closed and a new one
 * opened on the same date). Returns a suffix (" · 15:48") for days whose date
 * is shared, so the two rows can be told apart; "" otherwise.
 */
export function sameDateSuffixes(
  days: { id: string; date: string; openedAt: string }[],
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const d of days) counts.set(d.date, (counts.get(d.date) ?? 0) + 1);
  return new Map(
    days.map((d) => [d.id, (counts.get(d.date) ?? 0) > 1 ? ` · ${formatTime(d.openedAt)}` : ""]),
  );
}
