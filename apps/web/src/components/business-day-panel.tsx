"use client";

/**
 * BusinessDayPanel — T019
 *
 * Shows the current business day status (open/closed) with actions:
 * - Open day (when closed)
 * - Close day (when open, requires confirmation)
 * - Reopen last closed day (when closed, requires confirmation + reason)
 *
 * This is a client component driven by server data (passed as props).
 * After each mutation the server revalidates and Next.js re-renders the page.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { notifyDataChanged } from "@/lib/data-events";
import { listOpenTickets } from "@/app/(protected)/tickets/actions";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarCheckIcon, CalendarXIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { BusinessDay } from "@/lib/business-day";
import {
  openBusinessDay,
  closeBusinessDay,
  reopenBusinessDay,
} from "@/app/(protected)/cashier/actions/business-day";

interface BusinessDayPanelProps {
  currentDay: BusinessDay | null;
  lastClosedDay: BusinessDay | null;
}

export function BusinessDayPanel({ currentDay, lastClosedDay }: BusinessDayPanelProps) {
  const router = useRouter();
  const t = useTranslations("businessDay");
  const tCommon = useTranslations("common");

  const [isPending, startTransition] = useTransition();

  // Reopen dialog state
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenReasonError, setReopenReasonError] = useState<string | null>(null);

  const isOpen = currentDay !== null;

  // H-49: surface unpaid tickets before the cashier confirms closing the day.
  const [closeOpen, setCloseOpen] = useState(false);
  const [openTicketCount, setOpenTicketCount] = useState(0);

  function handleCloseOpenChange(next: boolean) {
    setCloseOpen(next);
    if (!next) return;
    setOpenTicketCount(0);
    listOpenTickets().then((res) => {
      if (res.success) setOpenTicketCount(res.data.length);
    });
  }

  function handleOpen() {
    startTransition(async () => {
      const result = await openBusinessDay();
      if (result.success) {
        toast.success(t("openSuccess"));
        notifyDataChanged("businessDay", "tickets");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleClose() {
    if (!currentDay) return;
    startTransition(async () => {
      const result = await closeBusinessDay(currentDay.id);
      if (result.success) {
        toast.success(t("closeSuccess"));
        notifyDataChanged("businessDay", "tickets");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleReopenSubmit() {
    if (reopenReason.trim().length < 5) {
      setReopenReasonError("El motivo debe tener al menos 5 caracteres");
      return;
    }
    setReopenReasonError(null);
    startTransition(async () => {
      const result = await reopenBusinessDay({ reason: reopenReason });
      if (result.success) {
        toast.success(t("reopenSuccess"));
        notifyDataChanged("businessDay", "tickets");
        router.refresh();
        setReopenOpen(false);
        setReopenReason("");
      } else {
        if (result.error.details) {
          setReopenReasonError(result.error.details[0]?.message ?? result.error.message);
        } else {
          toast.error(result.error.message);
          setReopenOpen(false);
        }
      }
    });
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm flex-1">
      {/* Status header */}
      <div className="flex items-center gap-3 mb-4">
        {isOpen ? (
          <div className="rounded-full bg-status-success p-2">
            <CalendarCheckIcon
              className="size-5 text-status-success-foreground"
              aria-hidden="true"
            />
          </div>
        ) : (
          <div className="rounded-full bg-muted p-2">
            <CalendarXIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <div>
          <p className="font-semibold text-sm">{isOpen ? t("dayOpen") : t("dayClosed")}</p>
          {isOpen && currentDay && (
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              {t("openedAt", {
                time: new Date(currentDay.openedAt).toLocaleTimeString("es-CO", {
                  timeZone: "America/Bogota",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </p>
          )}
          {!isOpen && lastClosedDay?.closedAt && (
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              {t("lastClosedAt", {
                date: new Date(lastClosedDay.closedAt).toLocaleString("es-CO", {
                  timeZone: "America/Bogota",
                  dateStyle: "short",
                  timeStyle: "short",
                }),
              })}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {!isOpen && (
          <Button onClick={handleOpen} disabled={isPending} className="flex-1">
            {isPending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarCheckIcon className="mr-2 size-4" aria-hidden="true" />
            )}
            {t("open")}
          </Button>
        )}

        {isOpen && (
          <ConfirmationDialog
            trigger={
              <Button variant="outline" disabled={isPending} className="flex-1">
                {isPending ? (
                  <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CalendarXIcon className="mr-2 size-4" aria-hidden="true" />
                )}
                {t("close")}
              </Button>
            }
            title={t("confirmClose")}
            description={t("confirmCloseDescription")}
            warning={
              openTicketCount > 0
                ? t("closeOpenTicketsWarning", { count: openTicketCount })
                : undefined
            }
            variant={openTicketCount > 0 ? "destructive" : "default"}
            confirmLabel={t("close")}
            cancelLabel={tCommon("cancel")}
            onConfirm={handleClose}
            open={closeOpen}
            onOpenChange={handleCloseOpenChange}
          />
        )}

        {!isOpen && lastClosedDay && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReopenOpen(true)}
            disabled={isPending}
            className="flex-1 text-muted-foreground"
          >
            <RotateCcwIcon className="mr-2 size-4" aria-hidden="true" />
            {t("reopen")}
          </Button>
        )}

        {!isOpen && !lastClosedDay && (
          <p className="text-xs text-muted-foreground mt-1">{t("noPreviousDay")}</p>
        )}
      </div>

      {/* Reopen dialog with reason field */}
      <Dialog
        open={reopenOpen}
        onOpenChange={(open) => {
          setReopenOpen(open);
          if (!open) {
            setReopenReason("");
            setReopenReasonError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirmReopen")}</DialogTitle>
            <DialogDescription>{t("confirmReopenDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor="reopen-reason" className="text-sm font-medium">
              {t("reopenReason")}
            </label>
            <Input
              id="reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder={t("reopenReasonPlaceholder")}
              aria-describedby={reopenReasonError ? "reopen-reason-error" : undefined}
              aria-invalid={!!reopenReasonError}
              disabled={isPending}
            />
            {reopenReasonError && (
              <p id="reopen-reason-error" className="text-sm text-destructive">
                {reopenReasonError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleReopenSubmit} disabled={isPending}>
              {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden="true" />}
              {t("reopen")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
