"use client";

/**
 * CatalogAuditLog — T025 (T02R-R1)
 *
 * Collapsible audit history panel for a catalog entity.
 * Lazy-fetches on first expand; admin-only (enforced server-side).
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, ChevronRightIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import { getEntityAuditLog } from "@/app/(protected)/admin/catalog/actions/audit-log";
import type { AuditLogEntry } from "@/app/(protected)/admin/catalog/actions/audit-log";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(date);
}

function ActionBadge({ action }: { action: AuditLogEntry["action"] }) {
  const colors: Record<AuditLogEntry["action"], string> = {
    create: "bg-green-100 text-green-800",
    update: "bg-blue-100 text-blue-800",
    soft_delete: "bg-red-100 text-red-800",
    restore: "bg-amber-100 text-amber-800",
  };
  const labels: Record<AuditLogEntry["action"], string> = {
    create: "Creado",
    update: "Editado",
    soft_delete: "Desactivado",
    restore: "Restaurado",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[action]}`}>
      {labels[action]}
    </span>
  );
}

export function CatalogAuditLog({ entityId }: { entityId: string }) {
  const t = useTranslations("catalog");
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    if (!expanded && entries === null) {
      startTransition(async () => {
        const result = await getEntityAuditLog(entityId);
        if (result.success) {
          setEntries(result.data);
        } else {
          setError(result.error.message);
        }
      });
    }
    setExpanded((e) => !e);
  }

  return (
    <div className="border-t pt-3">
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronRightIcon className="size-3.5" />
        )}
        <HistoryIcon className="size-3.5" />
        {t("auditLogLabel")}
        {isPending && <Loader2Icon className="ml-1 size-3 animate-spin" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {entries !== null && entries.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("auditLogEmpty")}</p>
          )}
          {entries !== null &&
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2"
              >
                <ActionBadge action={entry.action} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{entry.changedByName}</span>
                    {" · "}
                    {formatDate(new Date(entry.changedAt))}
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
