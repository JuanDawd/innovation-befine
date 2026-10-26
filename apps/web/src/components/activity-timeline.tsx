"use client";

/**
 * ActivityTimeline — T132
 *
 * Activity entries newest first, grouped by Bogotá day: time, who (and role),
 * the Spanish summary, the reason, and "Ver cambios" with the before/after
 * diff. Used by Actividad and every Historial.
 */

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import type { ActivityRow } from "@befine/db";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { activityDiff } from "@/lib/activity-diff";
import { formatDate, formatTime } from "@/i18n";
import { cn } from "@/lib/utils";

function Entry({ row, showRecordLink }: { row: ActivityRow; showRecordLink: boolean }) {
  const t = useTranslations("activity");
  const [open, setOpen] = useState(false);
  const diff = activityDiff(row.before, row.after);
  const role = row.actorRole ? t(`roles.${row.actorRole}` as "roles.admin") : null;

  return (
    <li className="flex gap-3 py-3">
      <time
        dateTime={new Date(row.createdAt).toISOString()}
        className="w-12 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums"
      >
        {formatTime(row.createdAt)}
      </time>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          <span className="font-medium">{row.actorName ?? t("system")}</span>
          {role && <span className="text-muted-foreground"> · {role}</span>}
        </p>
        <p className="text-sm break-words">{row.summary}</p>
        {row.reason && (
          <p className="text-xs text-muted-foreground">
            {t("reason")}: {row.reason}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {showRecordLink && row.entityType === "pedido" && row.entityId && (
            <Link
              href={`/pedidos/${row.entityId}`}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {t("openPedido")}
            </Link>
          )}
          {diff.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex min-h-8 items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronDownIcon
                className={cn("size-3.5 transition-transform", open && "rotate-180")}
                aria-hidden="true"
              />
              {open ? t("hideChanges") : t("showChanges", { count: diff.length })}
            </button>
          )}
        </div>
        {open && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <caption className="sr-only">{t("changesCaption")}</caption>
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    {t("field")}
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    {t("before")}
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    {t("after")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {diff.map((d) => (
                  <tr key={d.key}>
                    <th scope="row" className="px-2 py-1.5 text-left font-medium">
                      {d.label}
                    </th>
                    <td className="px-2 py-1.5 text-muted-foreground line-through decoration-muted-foreground/50">
                      {d.before ?? "—"}
                    </td>
                    <td className="px-2 py-1.5">{d.after ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </li>
  );
}

export function ActivityTimeline({
  rows,
  hasMore,
  loadingMore,
  onLoadMore,
  showRecordLink = true,
  emptyTitle,
  emptyDescription,
}: {
  rows: ActivityRow[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  showRecordLink?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const t = useTranslations("activity");
  if (rows.length === 0)
    return (
      <EmptyState
        icon={HistoryIcon}
        title={emptyTitle ?? t("emptyTitle")}
        description={emptyDescription ?? t("emptyDescription")}
      />
    );

  const days: { day: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const day = formatDate(row.createdAt, "es", "EEEE d 'de' MMMM yyyy");
    if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
    days.at(-1)!.rows.push(row);
  }

  return (
    <div className="space-y-4">
      {days.map((d) => (
        <section key={d.day} aria-label={d.day}>
          <h3 className="sticky top-0 z-10 bg-background/95 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
            {d.day}
          </h3>
          <ul className="divide-y">
            {d.rows.map((row) => (
              <Entry key={row.id} row={row} showRecordLink={showRecordLink} />
            ))}
          </ul>
        </section>
      ))}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
