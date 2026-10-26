/**
 * Readable before/after for an activity entry — T132 (spec §3.9.26)
 *
 * Flattens the JSON one level, keeps only what changed (or, for entries with
 * just one side, what is there), labels fields in Spanish and formats values:
 * money as $12.500, booleans as Sí/No, dates in Bogotá time.
 */

import { formatDateTime, formatMoney as formatPesos } from "@/i18n";
import { METHOD_ES } from "@/lib/payment-method-labels";

export type DiffRow = { key: string; label: string; before: string | null; after: string | null };

const LABELS: Record<string, string> = {
  amount: "Valor",
  total: "Total",
  price: "Precio",
  unitPrice: "Precio unitario",
  computed: "Calculado",
  prepaidAmount: "Ya pagado",
  terminationAmount: "Liquidación final",
  computedAmount: "Calculado",
  onHand: "En inventario",
  quantity: "Cantidad",
  units: "Unidades",
  status: "Estado",
  method: "Medio de pago",
  name: "Nombre",
  role: "Rol",
  stylistSubtype: "Especialidad",
  dailyRate: "Tarifa diaria",
  pieceRate: "Tarifa por pieza",
  expectedWorkDays: "Días de trabajo",
  birthday: "Cumpleaños",
  showEarnings: "Ver ganancias",
  isActive: "Activo",
  closedAt: "Cerrado",
  deactivatedAt: "Desactivado",
  scheduledAt: "Fecha de la cita",
  durationMinutes: "Duración (min)",
  type: "Tipo",
  date: "Fecha",
  approved: "Aprobadas",
  returned: "Devueltas",
  scrapped: "Descartadas",
  override: "Por debajo de 0",
  businessDayIds: "Días",
  payments: "Pagos",
  needsReview: "Por revisar",
  afterHours: "Fuera de horario",
  receivedAt: "Recibido",
  deliveredAt: "Entregado",
  estimatedDeliveryDate: "Entrega estimada",
  destination: "Destino",
  client: "Cliente",
  clothier: "Confeccionista",
  size: "Talla",
  note: "Nota",
  notes: "Notas",
  paid: "Pagado",
  cancelled: "Cancelado",
  catalogRate: "Tarifa del catálogo",
  reported: "Reportadas",
  rework: "Reproceso",
  returnCode: "Motivo de devolución",
  scrapCode: "Motivo de descarte",
  scrapPaid: "Descarte pagado",
  releasedClothiers: "Confeccionistas liberadas",
  cells: "Tallas",
  lines: "Líneas",
  enforceSubtypeServiceRestriction: "Servicios según especialidad",
  decision: "Decisión",
  clientId: "Cliente",
  reason: "Motivo",
  version: "Versión",
};

const MONEY = new Set([
  "amount",
  "total",
  "price",
  "unitPrice",
  "computed",
  "prepaidAmount",
  "terminationAmount",
  "computedAmount",
  "dailyRate",
  "pieceRate",
  "sellingPrice",
  "paid",
  "catalogRate",
]);
const METHOD: Record<string, string> = METHOD_ES;
const STATUS: Record<string, string> = {
  logged: "en proceso",
  awaiting_payment: "por cobrar",
  closed: "cobrado",
  reopened: "reabierto",
  paid_offline: "cobrado sin conexión",
  voided: "anulado",
  booked: "reservada",
  confirmed: "confirmada",
  completed: "completada",
  cancelled: "cancelada",
  no_show: "no asistió",
  rescheduled: "reprogramada",
  pending: "pendiente",
  approved: "aprobada",
  rejected: "rechazada",
};
const HIDDEN = /(^id$|Id$|Ids$|^version$|idempotencyKey)/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function fmt(key: string, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return MONEY.has(key) ? formatPesos(v) : String(v);
  if (typeof v === "string") {
    if (key === "method") return METHOD[v] ?? v;
    if (key === "status" || key === "decision") return STATUS[v] ?? v;
    if (ISO.test(v)) return formatDateTime(v);
    return v;
  }
  if (Array.isArray(v)) {
    if (key === "payments")
      return (
        v
          .map((p) => {
            const pay = p as { amount?: number; method?: string };
            return `${formatPesos(pay.amount ?? 0)} ${METHOD[pay.method ?? ""] ?? pay.method ?? ""}`.trim();
          })
          .join(" + ") || null
      );
    return v.length === 0 ? null : `${v.length}`;
  }
  return JSON.stringify(v);
}

const isObject = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);

function flat(o: unknown): Record<string, unknown> {
  return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
}

export function activityDiff(before: unknown, after: unknown): DiffRow[] {
  const b = flat(before);
  const a = flat(after);
  const both = Object.keys(b).length > 0 && Object.keys(a).length > 0;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !HIDDEN.test(k));
  const rows: DiffRow[] = [];
  for (const key of keys) {
    // Nested objects (e.g. bySource) stay out of the diff; the summary covers them.
    if (isObject(b[key]) || isObject(a[key])) continue;
    const before = fmt(key, b[key]);
    const after = fmt(key, a[key]);
    if (both && before === after) continue;
    if (before === null && after === null) continue;
    rows.push({ key, label: LABELS[key] ?? key, before: both || key in b ? before : null, after });
  }
  return rows;
}
