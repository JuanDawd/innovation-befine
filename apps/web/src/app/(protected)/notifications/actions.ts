"use server";

/**
 * Notification server actions — T048, T04R-R2
 *
 * listNotifications: returns active (non-archived) notifications for the current employee.
 * markRead: marks one notification as read.
 * markAllRead: marks all unread notifications as read.
 *
 * createNotification and archiveOldNotifications moved to @/lib/notifications —
 * they are internal helpers, not client-callable actions (T04R-R2).
 */

import { headers } from "next/headers";
import { eq, and, desc, gte, lt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { notifications, employees } from "@befine/db/schema";
import type { ActionResult } from "@/lib/action-result";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationRow = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  isArchived: boolean;
  createdAt: Date;
};

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getEmployeeId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const db = getDb();
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, session.user.id))
    .limit(1);

  return emp?.id ?? null;
}

// ─── List notifications ───────────────────────────────────────────────────────

export async function listNotifications(opts?: {
  includeArchived?: boolean;
}): Promise<ActionResult<NotificationRow[]>> {
  const employeeId = await getEmployeeId();
  if (!employeeId)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  // Lazily archive notifications older than 7 days (fire-and-forget housekeeping)
  void archiveOldNotificationsForEmployee(employeeId);

  const db = getDb();

  // Active window: last 7 days (auto-archive boundary)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      message: notifications.message,
      link: notifications.link,
      isRead: notifications.isRead,
      isArchived: notifications.isArchived,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientEmployeeId, employeeId),
        opts?.includeArchived
          ? undefined
          : and(eq(notifications.isArchived, false), gte(notifications.createdAt, sevenDaysAgo)),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return { success: true, data: rows };
}

// ─── Mark one notification as read ───────────────────────────────────────────

export async function markRead(notificationId: string): Promise<ActionResult<void>> {
  const employeeId = await getEmployeeId();
  if (!employeeId)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const db = getDb();

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.id, notificationId), eq(notifications.recipientEmployeeId, employeeId)),
    );

  return { success: true, data: undefined };
}

// ─── Mark all as read ─────────────────────────────────────────────────────────

export async function markAllRead(): Promise<ActionResult<void>> {
  const employeeId = await getEmployeeId();
  if (!employeeId)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };

  const db = getDb();

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.recipientEmployeeId, employeeId),
        eq(notifications.isRead, false),
        eq(notifications.isArchived, false),
      ),
    );

  return { success: true, data: undefined };
}

// ─── Archive older than 7 days ───────────────────────────────────────────────

async function archiveOldNotificationsForEmployee(employeeId: string): Promise<void> {
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  await db
    .update(notifications)
    .set({ isArchived: true })
    .where(
      and(
        eq(notifications.recipientEmployeeId, employeeId),
        eq(notifications.isArchived, false),
        lt(notifications.createdAt, sevenDaysAgo),
      ),
    );
}
