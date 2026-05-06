"use client";

import { PackageSearch } from "lucide-react";
import { CraftableProgressBar } from "@/components/ui/craftable-progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import type { OrderItemWithProgress } from "@befine/db";

interface OrderItemProgressTableProps {
  items: OrderItemWithProgress[];
}

export function OrderItemProgressTable({ items }: OrderItemProgressTableProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Sin ítems de producción"
        description="Este pedido no tiene ítems registrados aún."
      />
    );
  }

  return (
    <div className="space-y-6">
      {items.map((item) => {
        const pct =
          item.quantity > 0
            ? Math.round(
                (item.assignments.reduce((sum, a) => sum + a.approvedQuantity, 0) / item.quantity) *
                  100,
              )
            : 0;

        return (
          <section key={item.id} aria-label={item.pieceName}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{item.pieceName}</h4>
              <span className="text-xs text-muted-foreground tabular-nums">
                {item.quantity} uds.
              </span>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Empleado</th>
                    <th className="px-3 py-2 text-right font-medium">Asignado</th>
                    <th className="hidden px-3 py-2 text-right font-medium md:table-cell">
                      Completado
                    </th>
                    <th className="hidden px-3 py-2 text-right font-medium md:table-cell">
                      Aprobado
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Progreso</th>
                  </tr>
                </thead>
                <tbody>
                  {item.assignments.map((row, idx) => {
                    const isUnassigned = row.assignmentId === null;
                    const rowPct =
                      item.quantity > 0
                        ? Math.round((row.approvedQuantity / item.quantity) * 100)
                        : 0;

                    return (
                      <tr
                        key={row.assignmentId ?? `unassigned-${idx}`}
                        className="border-b last:border-0"
                      >
                        <td
                          className={`px-3 py-2 ${isUnassigned ? "italic text-muted-foreground" : ""}`}
                        >
                          {isUnassigned ? "Sin asignar" : (row.assigneeName ?? "—")}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${isUnassigned ? "text-muted-foreground" : ""}`}
                        >
                          {row.assignedQuantity}
                        </td>
                        <td
                          className={`hidden px-3 py-2 text-right tabular-nums md:table-cell ${isUnassigned ? "text-muted-foreground" : ""}`}
                        >
                          {isUnassigned ? "—" : row.completedQuantity}
                        </td>
                        <td
                          className={`hidden px-3 py-2 text-right tabular-nums md:table-cell ${isUnassigned ? "text-muted-foreground" : ""}`}
                        >
                          {isUnassigned ? "—" : row.approvedQuantity}
                        </td>
                        <td className="px-3 py-2">
                          {isUnassigned ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <CraftableProgressBar pct={rowPct} className="min-w-[80px]" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-1 px-1">
              <CraftableProgressBar pct={pct} className="w-full" />
            </div>
          </section>
        );
      })}
    </div>
  );
}
