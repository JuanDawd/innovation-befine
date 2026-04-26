"use client";

/**
 * ClosedTicketHistory — T092
 *
 * Client component: day selector, client search, ticket list, detail sheet.
 * Roles: cashier_admin only.
 */

import { useState, useTransition, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  ReceiptIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TriangleAlertIcon,
  XIcon,
  RotateCcwIcon,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listClosedTickets,
  getClosedTicketDetail,
  reopenTicket,
  type BusinessDayOption,
  type ClosedTicketRow,
  type ClosedTicketDetail,
} from "@/app/(protected)/admin/tickets/history/actions";

// ─── Payment method label ─────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
};

function methodLabel(m: string) {
  return METHOD_LABELS[m] ?? m;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClosedTicketHistoryProps {
  businessDays: BusinessDayOption[];
  initialDayId: string;
  initialTickets: ClosedTicketRow[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClosedTicketHistory({
  businessDays,
  initialDayId,
  initialTickets,
}: ClosedTicketHistoryProps) {
  const t = useTranslations("ticketHistory");

  const [selectedDayId, setSelectedDayId] = useState(initialDayId);
  const [tickets, setTickets] = useState<ClosedTicketRow[]>(initialTickets);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  // Detail sheet
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClosedTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const currentDayIndex = businessDays.findIndex((d) => d.id === selectedDayId);
  const currentDay = businessDays[currentDayIndex];

  // ─── Day navigation ─────────────────────────────────────────────────────────

  function loadDay(dayId: string, currentSearch: string) {
    startTransition(async () => {
      const result = await listClosedTickets(dayId, currentSearch || undefined);
      setTickets(result.success ? result.data : []);
    });
  }

  function goToPrevDay() {
    const prev = businessDays[currentDayIndex + 1];
    if (!prev) return;
    setSelectedDayId(prev.id);
    loadDay(prev.id, search);
  }

  function goToNextDay() {
    const next = businessDays[currentDayIndex - 1];
    if (!next) return;
    setSelectedDayId(next.id);
    loadDay(next.id, search);
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      startTransition(async () => {
        const result = await listClosedTickets(selectedDayId, value || undefined);
        setTickets(result.success ? result.data : []);
      });
    },
    [selectedDayId],
  );

  function clearSearch() {
    handleSearch("");
  }

  // ─── Detail sheet ───────────────────────────────────────────────────────────

  async function openDetail(ticketId: string) {
    setSelectedTicketId(ticketId);
    setDetail(null);
    setDetailLoading(true);
    setReopenError(null);
    const result = await getClosedTicketDetail(ticketId);
    setDetail(result.success ? result.data : null);
    setDetailLoading(false);
  }

  function closeDetail() {
    setSelectedTicketId(null);
    setDetail(null);
    setReopenError(null);
  }

  async function handleReopen() {
    if (!selectedTicketId) return;
    setReopening(true);
    setReopenError(null);
    const result = await reopenTicket(selectedTicketId);
    if (result.success) {
      // Remove the ticket from the current list and close dialog
      setTickets((prev) => prev.filter((t) => t.id !== selectedTicketId));
      closeDetail();
    } else {
      setReopenError(result.error.message);
    }
    setReopening(false);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Day navigator */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPrevDay}
          disabled={currentDayIndex >= businessDays.length - 1 || isPending}
          aria-label={t("prevDay")}
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
        </Button>

        <div className="flex-1 min-w-[160px] text-center">
          {currentDay ? (
            <span className="text-sm font-medium" suppressHydrationWarning>
              {new Date(currentDay.openedAt).toLocaleDateString("es-CO", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t("noDay")}</span>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={goToNextDay}
          disabled={currentDayIndex <= 0 || isPending}
          aria-label={t("nextDay")}
        >
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-8 pr-8"
          aria-label={t("searchPlaceholder")}
        />
        {search && (
          <button
            onClick={clearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Limpiar búsqueda"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Loading overlay */}
      {isPending && (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      )}

      {/* Ticket list */}
      {!isPending && tickets.length === 0 && (
        <EmptyState icon={ReceiptIcon} title={search ? t("emptySearch") : t("emptyDay")} />
      )}

      {!isPending && tickets.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          {/* Desktop table */}
          <table className="w-full text-sm hidden md:table">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  {t("colClient")}
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  {t("colEmployee")}
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  {t("colService")}
                </th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                  {t("colPayment")}
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                  {t("colTotal")}
                </th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                  {t("colClosedAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => openDetail(ticket.id)}
                >
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-1.5">
                      {ticket.clientName}
                      {ticket.hasOverride && (
                        <TriangleAlertIcon
                          className="size-3.5 text-amber-500"
                          aria-label={t("hasOverride")}
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ticket.employeeName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{ticket.serviceSummary}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {ticket.paymentMethods.map((m) => (
                        <span
                          key={m}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {methodLabel(m)}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    ${ticket.total.toLocaleString("es-CO")}
                  </td>
                  <td
                    className="px-4 py-3 text-right text-muted-foreground"
                    suppressHydrationWarning
                  >
                    {ticket.closedAt
                      ? new Date(ticket.closedAt).toLocaleTimeString("es-CO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile card list */}
          <ul className="divide-y md:hidden">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => openDetail(ticket.id)}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate flex items-center gap-1.5">
                      {ticket.clientName}
                      {ticket.hasOverride && (
                        <TriangleAlertIcon className="size-3.5 shrink-0 text-amber-500" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{ticket.employeeName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ticket.serviceSummary}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ticket.paymentMethods.map((m) => (
                        <span
                          key={m}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {methodLabel(m)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono tabular-nums text-sm">
                      ${ticket.total.toLocaleString("es-CO")}
                    </p>
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {ticket.closedAt
                        ? new Date(ticket.closedAt).toLocaleTimeString("es-CO", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={selectedTicketId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("detailTitle")}</DialogTitle>
            <DialogDescription>{t("detailDescription")}</DialogDescription>
          </DialogHeader>

          {detailLoading && (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          )}

          {!detailLoading && detail && (
            <div className="mt-6 space-y-6">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("detailClient")}</p>
                  <p className="font-medium">{detail.clientName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("detailEmployee")}</p>
                  <p className="font-medium">{detail.employeeName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("detailClosedBy")}</p>
                  <p className="font-medium">{detail.closedByName}</p>
                </div>
                <div suppressHydrationWarning>
                  <p className="text-xs text-muted-foreground">{t("detailClosedAt")}</p>
                  <p className="font-medium">
                    {detail.closedAt
                      ? new Date(detail.closedAt).toLocaleString("es-CO", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Line items */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {t("detailItems")}
                </p>
                <div className="rounded-lg border divide-y text-sm">
                  {detail.lineItems.map((item) => (
                    <div key={item.id} className="px-3 py-2.5">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">
                          {item.serviceName}
                          {item.variantName !== "Estándar" && (
                            <span className="text-muted-foreground"> — {item.variantName}</span>
                          )}
                        </span>
                        <span className="font-mono tabular-nums shrink-0">
                          ${(item.effectivePrice * item.quantity).toLocaleString("es-CO")}
                        </span>
                      </div>
                      {item.quantity > 1 && (
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × ${item.effectivePrice.toLocaleString("es-CO")}
                        </p>
                      )}
                      {item.overridePrice !== null && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                          <TriangleAlertIcon className="size-3.5 shrink-0 mt-0.5" />
                          <span>
                            {t("overrideNote", {
                              original: item.unitPrice.toLocaleString("es-CO"),
                            })}
                            {item.overrideReason && (
                              <span className="text-muted-foreground">
                                {" "}
                                — {item.overrideReason}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment breakdown */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {t("detailPayments")}
                </p>
                <div className="rounded-lg border divide-y text-sm">
                  {detail.payments.map((p, i) => (
                    <div key={i} className="px-3 py-2.5 flex justify-between">
                      <span>{methodLabel(p.method)}</span>
                      <span className="font-mono tabular-nums">
                        ${p.amount.toLocaleString("es-CO")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-center border-t pt-3 font-semibold">
                <span>{t("detailTotal")}</span>
                <span className="font-mono tabular-nums text-lg">
                  ${detail.total.toLocaleString("es-CO")}
                </span>
              </div>

              {/* Reopen action */}
              <div className="border-t pt-4">
                {reopenError && (
                  <p className="text-sm text-destructive mb-3" role="alert">
                    {reopenError}
                  </p>
                )}
                <Button
                  variant="outline"
                  onClick={handleReopen}
                  disabled={reopening}
                  className="w-full"
                >
                  {reopening ? (
                    <Loader2Icon className="size-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCcwIcon className="size-4 mr-2" aria-hidden="true" />
                  )}
                  {t("reopenAction")}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">{t("reopenHint")}</p>
              </div>
            </div>
          )}

          {!detailLoading && !detail && (
            <p className="mt-6 text-sm text-muted-foreground">{t("detailError")}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
