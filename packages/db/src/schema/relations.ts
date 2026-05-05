/**
 * Drizzle ORM relations — required for the relational query builder (`db.query.*`).
 *
 * Add a relation here whenever a new FK is introduced and you need
 * to use `with:` in a query. Relations are pure metadata — no DB migration needed.
 */

import { relations } from "drizzle-orm";
import { services, serviceVariants } from "./services";
import { largeOrders, largeOrderPayments } from "./large-orders";
import { craftables } from "./craftables";

export const servicesRelations = relations(services, ({ many }) => ({
  variants: many(serviceVariants),
}));

export const serviceVariantsRelations = relations(serviceVariants, ({ one }) => ({
  service: one(services, {
    fields: [serviceVariants.serviceId],
    references: [services.id],
  }),
}));

export const largeOrdersRelations = relations(largeOrders, ({ many }) => ({
  payments: many(largeOrderPayments),
  craftables: many(craftables),
}));

export const largeOrderPaymentsRelations = relations(largeOrderPayments, ({ one }) => ({
  order: one(largeOrders, {
    fields: [largeOrderPayments.orderId],
    references: [largeOrders.id],
  }),
}));

export const craftablesRelations = relations(craftables, ({ one }) => ({
  largeOrder: one(largeOrders, {
    fields: [craftables.largeOrderId],
    references: [largeOrders.id],
  }),
}));
