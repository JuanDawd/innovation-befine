/**
 * Internal notification helpers — T04R-R2
 *
 * NOT a "use server" module. These functions are imported directly by server
 * actions that need to create notifications. They must never be called from
 * client components or exposed as Next.js server actions.
 */

import { getDb } from "./db";
import { notifications } from "@befine/db/schema";
import { publishEvent } from "@befine/realtime/server";

/**
 * Insert a notification row and fire an SSE event to the recipient.
 * Call this from server actions only — never import in client components.
 */
export async function createNotification(payload: {
  recipientEmployeeId: string;
  type: (typeof notifications.$inferInsert)["type"];
  message: string;
  link?: string;
}): Promise<void> {
  const db = getDb();

  const [row] = await db
    .insert(notifications)
    .values({
      recipientEmployeeId: payload.recipientEmployeeId,
      type: payload.type,
      message: payload.message,
      link: payload.link ?? null,
    })
    .returning({ id: notifications.id });

  if (row) {
    publishEvent("notifications", "notification_created", {
      notificationId: row.id,
      recipientEmployeeId: payload.recipientEmployeeId,
    });
  }
}
