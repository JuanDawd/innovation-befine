import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared enum for payment methods across ticket_payments (T039),
 * pedido payments (T127), and payouts (T066).
 */
export const paymentMethodEnum = pgEnum("payment_method_enum", ["cash", "card", "transfer"]);
