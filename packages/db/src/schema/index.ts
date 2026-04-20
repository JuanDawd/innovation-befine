/**
 * Database schema — Innovation Befine
 *
 * Naming conventions:
 *   - Table names: snake_case plural (e.g. `employees`, `ticket_payments`)
 *   - Column names: snake_case (e.g. `created_at`, `is_active`)
 *   - Enums: {entity}_{field}_enum (e.g. `payment_method_enum`)
 *   - Indexes: idx_{table}_{columns} (e.g. `idx_employees_email`)
 *   - All timestamps: `timestamp with time zone` stored in UTC
 *   - All monetary values: integer (COP whole pesos, no cents)
 *
 * Shared enums are defined here and referenced by multiple tables
 * across migrations — never redefined independently.
 */

export { paymentMethodEnum } from "./enums";
export { users, sessions, accounts, verifications } from "./auth";
export { stylistSubtypeEnum, employees } from "./employees";
export { businessSettings, BUSINESS_SETTINGS_ID } from "./business-settings";
export { businessDays } from "./business-days";
export { services, serviceVariants } from "./services";
export { clothPieces, clothPieceVariants } from "./cloth-pieces";
export { catalogEntityTypeEnum, catalogActionEnum, catalogAuditLog } from "./catalog-audit-log";
export { clients } from "./clients";
export { ticketStatusEnum, checkoutSessions, tickets } from "./tickets";
export { ticketItems } from "./ticket-items";
export { ticketPayments } from "./ticket-payments";
export {
  servicesRelations,
  serviceVariantsRelations,
  largeOrdersRelations,
  largeOrderPaymentsRelations,
  clothBatchesRelations,
} from "./relations";
export { notificationTypeEnum, notifications } from "./notifications";
export { editRequestStatusEnum, ticketEditRequests } from "./ticket-edit-requests";
export { batchPieceStatusEnum, claimSourceEnum, clothBatches, batchPieces } from "./cloth-batches";
export { appointmentStatusEnum, appointments } from "./appointments";
export { largeOrderStatusEnum, largeOrders, largeOrderPayments } from "./large-orders";
export { absenceTypeEnum, employeeAbsences } from "./absences";
export { payouts, payoutPeriodDays, payoutTicketItems, payoutBatchPieces } from "./payouts";
export { idempotencyKeys } from "./idempotency";
