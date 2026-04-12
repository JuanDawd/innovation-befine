"use client";

/**
 * NotificationBell — T048
 *
 * Bell icon with unread count badge, popover dropdown listing notifications.
 * Receives the current employee ID so the SSE listener is scoped to this user.
 * Groups same-type notifications within a 5-minute window.
 */

import { useState, useEffect, useCallback, useTransition, useRef } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { BellIcon, CheckCheckIcon, InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeEvent } from "@befine/realtime/client";
import {
  listNotifications,
  markRead,
  markAllRead,
  archiveOldNotifications,
  type NotificationRow,
} from "@/app/(protected)/notifications/actions";

// ─── Grouping logic ───────────────────────────────────────────────────────────

const GROUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

type NotificationGroup = {
  key: string;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  count: number;
  ids: string[];
  latestAt: Date;
};

function groupNotifications(rows: NotificationRow[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];

  for (const row of rows) {
    const existing = groups.find(
      (g) =>
        g.type === row.type &&
        !g.isRead &&
        !row.isRead &&
        Math.abs(g.latestAt.getTime() - row.createdAt.getTime()) < GROUP_WINDOW_MS,
    );
    if (existing) {
      existing.count++;
      existing.ids.push(row.id);
      if (row.createdAt > existing.latestAt) {
        existing.latestAt = row.createdAt;
        existing.message = row.message;
        existing.link = row.link;
      }
    } else {
      groups.push({
        key: row.id,
        type: row.type,
        message: row.message,
        link: row.link,
        isRead: row.isRead,
        count: 1,
        ids: [row.id],
        latestAt: row.createdAt,
      });
    }
  }

  return groups;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  employeeId: string;
  initialNotifications: NotificationRow[];
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell({
  employeeId,
  initialNotifications,
  className,
}: NotificationBellProps) {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>(initialNotifications);
  const [showArchived, setShowArchived] = useState(false);
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = rows.filter((r) => !r.isRead && !r.isArchived).length;
  const groups = groupNotifications(rows.filter((r) => !r.isArchived));
  const archivedCount = rows.filter((r) => r.isArchived).length;

  // ─── Refresh ──────────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    startTransition(async () => {
      // Archive stale on each refresh (lazy archival)
      await archiveOldNotifications();
      const result = await listNotifications({ includeArchived: showArchived });
      if (result.success) setRows(result.data);
    });
  }, [showArchived]);

  // Subscribe to SSE only for this employee's notifications
  useRealtimeEvent("notifications", "notification_created", {
    onData: (raw) => {
      const payload = raw as { recipientEmployeeId?: string };
      if (payload.recipientEmployeeId === employeeId) refresh();
    },
    onPoll: refresh,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Refresh when opening
  function handleToggle() {
    if (!open) refresh();
    setOpen((v) => !v);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  function handleMarkRead(ids: string[]) {
    startTransition(async () => {
      await Promise.all(ids.map((id) => markRead(id)));
      setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, isRead: true } : r)));
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllRead();
      setRows((prev) => prev.map((r) => ({ ...r, isRead: true })));
    });
  }

  function handleShowArchived() {
    setShowArchived(true);
    startTransition(async () => {
      const result = await listNotifications({ includeArchived: true });
      if (result.success) setRows(result.data);
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={cn("relative", className)}>
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-label={
          unreadCount > 0 ? t("bellLabelWithCount", { count: unreadCount }) : t("bellLabel")
        }
        aria-expanded={open}
        aria-haspopup="true"
        className="relative rounded-md p-1.5 text-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BellIcon className="size-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t("panelLabel")}
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border bg-popover shadow-lg",
            "flex flex-col overflow-hidden",
            // On mobile, anchor to viewport edge
            "max-h-[80dvh]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">{t("title")}</p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-label={t("markAllRead")}
              >
                <CheckCheckIcon className="size-3.5" aria-hidden="true" />
                {t("markAllRead")}
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto flex-1">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <InboxIcon className="size-8 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              </div>
            ) : (
              <ul>
                {groups.map((group) => (
                  <li key={group.key}>
                    <NotificationItem
                      group={group}
                      onMarkRead={() => handleMarkRead(group.ids)}
                      onClose={() => setOpen(false)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {/* Show archived */}
            {!showArchived && archivedCount > 0 && (
              <div className="border-t px-4 py-3 text-center">
                <button
                  onClick={handleShowArchived}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("showOlder", { count: archivedCount })}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single notification item ─────────────────────────────────────────────────

function NotificationItem({
  group,
  onMarkRead,
  onClose,
}: {
  group: NotificationGroup;
  onMarkRead: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("notifications");

  function handleAction() {
    if (!group.isRead) onMarkRead();
    onClose();
  }

  const content = (
    <div className="flex items-start gap-3 w-full">
      {/* Unread dot */}
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          group.isRead ? "bg-transparent" : "bg-primary",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug", !group.isRead && "font-medium")}>
          {group.count > 1
            ? t("grouped", { count: group.count, message: group.message })
            : group.message}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
          {group.latestAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      {/* Inline action */}
      {group.link && <span className="shrink-0 text-xs text-primary font-medium">{t("view")}</span>}
    </div>
  );

  const itemClass = cn(
    "w-full px-4 py-3 flex text-left transition-colors hover:bg-muted/50 border-b last:border-b-0",
    !group.isRead && "bg-primary/5",
  );

  if (group.link) {
    return (
      <Link href={group.link} onClick={handleAction} className={itemClass}>
        {content}
      </Link>
    );
  }

  return (
    <button
      onClick={() => {
        if (!group.isRead) onMarkRead();
      }}
      className={itemClass}
    >
      {content}
    </button>
  );
}
