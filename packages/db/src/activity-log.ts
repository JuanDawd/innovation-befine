/**
 * logActivity — T114 (spec §3.9)
 *
 * The only write path into activity_log. It takes a transaction, not a
 * database handle, so the entry commits or rolls back with the action it
 * describes. There is no update or delete helper, and a DB trigger rejects
 * both.
 *
 * The summary is generated in Spanish from the action and its data unless the
 * caller passes one. Business day defaults to the one currently open.
 */

import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { activityLog, businessDays } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any driver's transaction
export type ActivityTx = PgTransaction<any, any, any>;

export type ActivityEntityType =
  | "user"
  | "service"
  | "service_variant"
  | "cloth_piece"
  | "cloth_piece_variant"
  | "garment_size"
  | "garment_color"
  | "business_settings"
  | "client"
  | "pedido";

export type ActivityAction =
  | "auth.sign_in"
  | "auth.sign_out"
  | "auth.sign_in_failed"
  | "catalog.create"
  | "catalog.update"
  | "catalog.deactivate"
  | "catalog.restore"
  | "catalog.reorder"
  | "settings.update"
  | "client.create"
  | "client.update"
  | "pedido.create"
  | "pedido.update"
  | "pedido.cancel"
  | "pedido.deliver"
  | "production.assign"
  | "production.rate_change"
  | "production.release"
  | "production.claim"
  | "production.report";

export type ActivityEntry = {
  actor: { userId: string | null; role: string | null };
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId?: string | null;
  /** Values for the Spanish summary, e.g. { name: "Corte" } */
  data?: Record<string, unknown>;
  /** Overrides the generated summary */
  summary?: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  /** Defaults to the business day open at the time; pass null to force none */
  businessDayId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

/** $12.500 — whole COP, dot thousands separator. */
export function formatPesos(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.trunc(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

const ENTITY_NOUN: Record<ActivityEntityType, string> = {
  user: "el usuario",
  service: "el servicio",
  service_variant: "la variante de servicio",
  cloth_piece: "la prenda",
  cloth_piece_variant: "la variante de prenda",
  garment_size: "la talla",
  garment_color: "el color",
  business_settings: "la configuración",
  client: "el cliente",
  pedido: "el pedido",
};

function named(entityType: ActivityEntityType, data: Record<string, unknown>): string {
  const name = typeof data.name === "string" && data.name ? ` «${data.name}»` : "";
  return `${ENTITY_NOUN[entityType]}${name}`;
}

/** Spanish one-line summary for an entry. */
export function activitySummary(
  action: ActivityAction,
  entityType: ActivityEntityType,
  data: Record<string, unknown> = {},
): string {
  switch (action) {
    case "auth.sign_in":
      return "Inició sesión";
    case "auth.sign_out":
      return "Cerró sesión";
    case "auth.sign_in_failed":
      return typeof data.email === "string" && data.email
        ? `Intento fallido de inicio de sesión con ${data.email}`
        : "Intento fallido de inicio de sesión";
    case "catalog.create":
      return `Creó ${named(entityType, data)}`;
    case "catalog.update":
      return `Editó ${named(entityType, data)}`;
    case "catalog.deactivate":
      return `Desactivó ${named(entityType, data)}`;
    case "catalog.restore":
      return `Restauró ${named(entityType, data)}`;
    case "catalog.reorder":
      return `Cambió el orden de ${named(entityType, data)}`;
    case "client.create":
      return `Creó ${named(entityType, data)}`;
    case "client.update":
      return `Editó ${named(entityType, data)}`;
    case "pedido.create":
      return `Creó el pedido ${data.number ?? ""}`.trim();
    case "pedido.update":
      return `Editó el pedido ${data.number ?? ""}`.trim();
    case "pedido.cancel":
      return `Canceló el pedido ${data.number ?? ""}`.trim();
    case "production.assign":
      return `Asignó ${data.units ?? ""} unidades del pedido ${data.number ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
    case "production.rate_change":
      return `Cambió la tarifa de una asignación del pedido ${data.number ?? ""}`.trim();
    case "production.release":
      return `Liberó ${data.units ?? ""} unidades del pedido ${data.number ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
    case "production.claim":
      return `Tomó ${data.units ?? ""} unidades del pedido ${data.number ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
    case "production.report":
      return `Reportó ${data.units ?? ""} unidades terminadas del pedido ${data.number ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
    case "pedido.deliver":
      return `Entregó ${data.units ?? ""} unidades del pedido ${data.number ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
    case "settings.update":
      return typeof data.setting === "string" && data.setting
        ? `Cambió la configuración: ${data.setting}`
        : "Cambió la configuración";
  }
}

export async function logActivity(tx: ActivityTx, entry: ActivityEntry): Promise<void> {
  const businessDayId =
    entry.businessDayId !== undefined
      ? entry.businessDayId
      : sql`(SELECT ${businessDays.id} FROM ${businessDays} WHERE ${businessDays.closedAt} IS NULL ORDER BY ${businessDays.openedAt} DESC LIMIT 1)`;
  await tx.insert(activityLog).values({
    actorUserId: entry.actor.userId,
    actorRole: entry.actor.role,
    businessDayId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary ?? activitySummary(entry.action, entry.entityType, entry.data),
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
  });
}
