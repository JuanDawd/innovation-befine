import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared enum for payment methods across ticket_payments (T039),
 * large_order_payments (T057), and payouts (T066).
 */
export const paymentMethodEnum = pgEnum("payment_method_enum", ["cash", "card", "transfer"]);
