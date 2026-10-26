/**
 * Drizzle ORM relations — required for the relational query builder (`db.query.*`).
 *
 * Add a relation here whenever a new FK is introduced and you need
 * to use `with:` in a query. Relations are pure metadata — no DB migration needed.
 */

import { relations } from "drizzle-orm";
import { services, serviceVariants } from "./services";
import { pedidos, pedidoLines, pedidoLineCells } from "./pedidos";

export const servicesRelations = relations(services, ({ many }) => ({
  variants: many(serviceVariants),
}));

export const serviceVariantsRelations = relations(serviceVariants, ({ one }) => ({
  service: one(services, {
    fields: [serviceVariants.serviceId],
    references: [services.id],
  }),
}));

export const pedidosRelations = relations(pedidos, ({ many }) => ({
  lines: many(pedidoLines),
}));

export const pedidoLinesRelations = relations(pedidoLines, ({ one, many }) => ({
  pedido: one(pedidos, { fields: [pedidoLines.pedidoId], references: [pedidos.id] }),
  cells: many(pedidoLineCells),
}));

export const pedidoLineCellsRelations = relations(pedidoLineCells, ({ one }) => ({
  line: one(pedidoLines, { fields: [pedidoLineCells.lineId], references: [pedidoLines.id] }),
}));
