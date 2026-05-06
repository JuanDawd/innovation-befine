"use client";

import { useState, useTransition } from "react";
import { PackageSearch, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { CraftableProgressBar } from "@/components/ui/craftable-progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { OrderItemWithProgress } from "@befine/db";
import type { ClothierOption } from "@/app/(protected)/large-orders/assignment-actions";

interface OrderItemProgressTableProps {
  items: OrderItemWithProgress[];
  canAssign?: boolean;
  clothiers?: ClothierOption[];
  onAssign?: (
    orderItemId: string,
    craftablePieceId: string,
    assigneeId: string,
    assignedQuantity: number,
  ) => Promise<{ success: boolean; error?: { message: string } }>;
  onRefresh?: () => void;
}

export function OrderItemProgressTable({
  items,
  canAssign = false,
  clothiers = [],
  onAssign,
  onRefresh,
}: OrderItemProgressTableProps) {
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

        const unassigned =
          item.assignments.find((a) => a.assignmentId === null)?.assignedQuantity ?? 0;

        return (
          <ItemSection
            key={item.id}
            item={item}
            pct={pct}
            unassigned={unassigned}
            canAssign={canAssign}
            clothiers={clothiers}
            onAssign={onAssign}
            onRefresh={onRefresh}
          />
        );
      })}
    </div>
  );
}

interface ItemSectionProps {
  item: OrderItemWithProgress;
  pct: number;
  unassigned: number;
  canAssign: boolean;
  clothiers: ClothierOption[];
  onAssign?: OrderItemProgressTableProps["onAssign"];
  onRefresh?: () => void;
}

function ItemSection({
  item,
  pct,
  unassigned,
  canAssign,
  clothiers,
  onAssign,
  onRefresh,
}: ItemSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();

  function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!onAssign) return;
    startTransition(async () => {
      const res = await onAssign(item.id, item.clothPieceId, assigneeId, quantity);
      if (!res.success) {
        toast.error(res.error?.message ?? "Error al asignar");
        return;
      }
      toast.success("Asignación creada");
      setShowForm(false);
      setAssigneeId("");
      setQuantity(1);
      onRefresh?.();
    });
  }

  return (
    <section aria-label={item.pieceName}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{item.pieceName}</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{item.quantity} uds.</span>
          {canAssign && unassigned > 0 && !showForm && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => setShowForm(true)}
            >
              <PlusIcon className="size-3 mr-1" />
              Asignar
            </Button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={submitAssign} className="mb-3 rounded-md border bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Disponible para asignar: <strong>{unassigned}</strong> uds.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor={`assignee-${item.id}`}>
                Confeccionista
              </label>
              <select
                id={`assignee-${item.id}`}
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                required
                className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:border-ring"
              >
                <option value="">Seleccionar…</option>
                {clothiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor={`qty-${item.id}`}>
                Cantidad
              </label>
              <input
                id={`qty-${item.id}`}
                type="number"
                min={1}
                max={unassigned}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
                className="w-full h-8 rounded-md border border-input bg-transparent px-2 text-sm font-mono focus-visible:outline-none focus-visible:border-ring"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isPending}>
              {isPending ? "Guardando…" : "Crear asignación"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setShowForm(false);
                setAssigneeId("");
                setQuantity(1);
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Empleado</th>
              <th className="px-3 py-2 text-right font-medium">Asignado</th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Completado</th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Aprobado</th>
              <th className="px-3 py-2 text-left font-medium">Progreso</th>
            </tr>
          </thead>
          <tbody>
            {item.assignments.map((row, idx) => {
              const isUnassigned = row.assignmentId === null;
              const rowPct =
                item.quantity > 0 ? Math.round((row.approvedQuantity / item.quantity) * 100) : 0;

              return (
                <tr
                  key={row.assignmentId ?? `unassigned-${idx}`}
                  className="border-b last:border-0"
                >
                  <td className={`px-3 py-2 ${isUnassigned ? "italic text-muted-foreground" : ""}`}>
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
}
