/**
 * Centralised channel and event type literals — T098
 *
 * Only two screens use SSE push:
 *   cashier  — ticket status changes (Phase 4A)
 *   clothier — batch/piece assignments (Phase 4B)
 *
 * All other screens are refresh-on-demand.
 */

/** Logical channels. Each channel maps to one SSE route: /api/realtime/:channel */
export type RealtimeChannel = "cashier" | "clothier";

/** Named events per channel */
export type CashierEvent = "ticket_updated" | "ticket_created" | "connected";
export type ClothierEvent = "piece_assigned" | "piece_updated" | "connected";
export type RealtimeEvent = CashierEvent | ClothierEvent;

/** Shape of data payloads by event type */
export type EventPayload = {
  ticket_updated: { ticketId: string; status: string };
  ticket_created: { ticketId: string };
  piece_assigned: { pieceId: string; batchId: string; clothierId: string };
  piece_updated: { pieceId: string; status: string };
  connected: { channel: RealtimeChannel; timestamp: number };
};
