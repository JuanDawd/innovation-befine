/**
 * Query keys. The first segment is always a `DataScope` (lib/data-events.ts),
 * so `notifyDataChanged("tickets")` invalidates every `["tickets", …]` query.
 */
export const queryKeys = {
  tickets: {
    open: ["tickets", "open"] as const,
    awaitingPayment: ["tickets", "awaitingPayment"] as const,
    mine: ["tickets", "mine"] as const,
  },
  editRequests: {
    pending: ["editRequests", "pending"] as const,
    mine: ["editRequests", "mine"] as const,
  },
  businessDay: {
    stats: ["businessDay", "stats"] as const,
  },
  appointments: {
    byDate: (date: string, stylistId: string) => ["appointments", date, stylistId] as const,
  },
  products: {
    dashboard: ["products", "dashboard"] as const,
    approvals: ["products", "approvals"] as const,
    clothierBoard: ["products", "clothierBoard"] as const,
  },
  // Reference data — changes rarely; invalidated by catalog edits.
  catalog: {
    services: ["catalog", "services"] as const,
    sellableStock: ["catalog", "sellableStock"] as const,
    clothPieceOptions: ["catalog", "clothPieceOptions"] as const,
  },
  staff: {
    activeStylists: ["staff", "activeStylists"] as const,
    bookingStylists: ["staff", "bookingStylists"] as const,
    activeClothiers: ["staff", "activeClothiers"] as const,
  },
  clients: {
    options: ["clients", "options"] as const,
  },
  pedidos: {
    myWork: ["pedidos", "myWork"] as const,
    productionBoard: ["pedidos", "productionBoard"] as const,
    clothiersWithoutClosing: ["pedidos", "clothiersWithoutClosing"] as const,
  },
} as const;
