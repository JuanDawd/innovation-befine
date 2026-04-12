/**
 * Centralised channel and event type literals — T098, T048
 *
 * SSE channels:
 *   cashier       — ticket status changes (Phase 4A)
 *   clothier      — batch/piece assignments (Phase 4B)
 *   notifications — per-employee in-app notifications (T048)
 *
 * All other screens are refresh-on-demand.
 */

/** Logical channels. Each channel maps to one SSE route: /api/realtime/:channel */
export type RealtimeChannel = "cashier" | "clothier" | "notifications";

/** Named events per channel */
export type CashierEvent = "ticket_updated" | "ticket_created" | "connected";
export type ClothierEvent = "piece_assigned" | "piece_updated" | "connected";
export type NotificationsEvent = "notification_created" | "connected";
export type RealtimeEvent = CashierEvent | ClothierEvent | NotificationsEvent;

/** Shape of data payloads by event type */
export type EventPayload = {
  ticket_updated: { ticketId: string; status: string };
  ticket_created: { ticketId: string };
  piece_assigned: { pieceId: string; batchId: string; clothierId: string };
  piece_updated: { pieceId: string; status: string };
  notification_created: { notificationId: string; recipientEmployeeId: string };
  connected: { channel: RealtimeChannel; timestamp: number };
};
