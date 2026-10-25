/**
 * Derived pedido status — T118 (spec §3.3.14)
 *
 * Statuses are computed from the numbers, never stored or set by a button,
 * so they cannot contradict what was made, delivered or paid. Cancellation is
 * the only manual state (cancelled_at + reason on the pedido).
 *
 *   Cancelado        cancelled_at set
 *   Pagado           client pedido, all units delivered and balance $0
 *   Entregado        client pedido, all units delivered
 *   Entrega parcial  client pedido, some units delivered
 *   Listo            approved units = ordered units (inventory pedidos end here)
 *   En producción    any unit assigned, claimed, reported or approved
 *   Pendiente        nothing assigned yet
 *
 * The returned `detail` holds the numbers the UI uses to explain the status
 * ("128 de 150 aprobadas").
 */

export type PedidoStatus =
  | "pending"
  | "in_production"
  | "ready"
  | "partially_delivered"
  | "delivered"
  | "paid"
  | "cancelled";

export type PedidoStatusInput = {
  destination: "client" | "inventory";
  cancelled: boolean;
  /** Totals across every cell of the pedido (see sumProgress) */
  progress: {
    ordered: number;
    assigned: number;
    reported: number;
    approved: number;
    delivered: number;
  };
  /** What the client still owes (computePedidoBalance().balance) */
  balance: number;
};

export type PedidoStatusResult = {
  status: PedidoStatus;
  detail: {
    ordered: number;
    approved: number;
    delivered: number;
    balance: number;
  };
};

export function derivePedidoStatus(input: PedidoStatusInput): PedidoStatusResult {
  const { ordered, assigned, reported, approved, delivered } = input.progress;
  const detail = { ordered, approved, delivered, balance: input.balance };
  const result = (status: PedidoStatus): PedidoStatusResult => ({ status, detail });

  if (input.cancelled) return result("cancelled");

  // A pedido with no units yet (all lines removed) has nothing to make.
  if (ordered <= 0) return result("pending");

  if (input.destination === "client") {
    if (delivered >= ordered) return result(input.balance <= 0 ? "paid" : "delivered");
    if (delivered > 0) return result("partially_delivered");
  }

  if (approved >= ordered) return result("ready");
  if (assigned > 0 || reported > 0 || approved > 0) return result("in_production");
  return result("pending");
}

/** Inventory pedidos are finished at Listo; client pedidos at Pagado. */
export function isFinishedPedido(destination: "client" | "inventory", status: PedidoStatus) {
  if (status === "cancelled") return true;
  return destination === "inventory" ? status === "ready" : status === "paid";
}
