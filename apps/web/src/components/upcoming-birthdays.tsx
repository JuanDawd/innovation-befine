"use client";

/**
 * UpcomingBirthdays — 5R.9
 *
 * Compact widget showing clients whose birthday falls within the next 14 days
 * (Bogota timezone). Fetched server-side by the parent page; this component
 * is a pure presenter so no client-side data fetching is needed.
 */

import { useTranslations } from "next-intl";
import { CakeIcon } from "lucide-react";
import type { UpcomingBirthdayRow } from "@/app/(protected)/clients/actions";

function ClientInitials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}

function DaysBadge({ daysUntil }: { daysUntil: number }) {
  const t = useTranslations("clients");

  if (daysUntil === 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        <CakeIcon className="size-3" aria-hidden="true" />
        {t("birthdayToday")}
      </span>
    );

  if (daysUntil === 1)
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
        {t("birthdayTomorrow")}
      </span>
    );

  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {t("birthdayInDays", { days: daysUntil })}
    </span>
  );
}

function formatBirthdayDate(birthday: string) {
  const [, month, day] = birthday.split("-");
  return `${day}/${month}`;
}

export function UpcomingBirthdays({ birthdays }: { birthdays: UpcomingBirthdayRow[] }) {
  const t = useTranslations("clients");

  return (
    <section aria-label={t("upcomingBirthdaysTitle")}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <CakeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        {t("upcomingBirthdaysTitle")}
      </h2>

      {birthdays.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("upcomingBirthdaysEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {birthdays.map((client) => (
            <li
              key={client.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
            >
              <ClientInitials name={client.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBirthdayDate(client.birthday)}
                </p>
              </div>
              <DaysBadge daysUntil={client.daysUntil} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
