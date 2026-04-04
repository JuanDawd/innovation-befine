"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (item: T) => ReactNode;
  /** Hide this column on mobile (< md) and show as card field instead */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> extends React.ComponentProps<"div"> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (item: T) => void;
}

function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyTitle = "Sin datos",
  emptyDescription,
  onRowClick,
  className,
  ...props
}: DataTableProps<T>) {
  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const showMobileCards = columns.length >= 4;

  return (
    <div className={cn("w-full", className)} {...props}>
      {/* Desktop table */}
      <div
        className={cn(
          "relative w-full overflow-x-auto rounded-lg border",
          showMobileCards ? "hidden md:block" : "block",
        )}
      >
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-muted/50 [&_tr]:border-b">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "h-10 px-3 font-medium whitespace-nowrap text-foreground",
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left",
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={cn(
                  "border-b transition-colors hover:bg-muted/50",
                  onRowClick && "cursor-pointer",
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "p-3 align-middle whitespace-nowrap",
                      col.align === "right"
                        ? "text-right font-mono tabular-nums"
                        : col.align === "center"
                          ? "text-center"
                          : "text-left",
                    )}
                  >
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards (when 4+ columns) */}
      {showMobileCards && (
        <div className="space-y-2 md:hidden">
          {data.map((item) => (
            <div
              key={keyExtractor(item)}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                "rounded-lg border bg-card p-3 shadow-sm space-y-1.5",
                onRowClick && "cursor-pointer active:bg-muted/50",
              )}
              onClick={() => onRowClick?.(item)}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onRowClick(item);
                }
              }}
            >
              {columns.map((col) => (
                <div key={col.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground shrink-0">{col.header}</span>
                  <span
                    className={cn("truncate", col.align === "right" && "font-mono tabular-nums")}
                  >
                    {col.render(item)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { DataTable };
export type { Column, DataTableProps };
