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
  const t = useTranslations("businessDay");
  const tCommon = useTranslations("common");

  const [isPending, startTransition] = useTransition();

  // Reopen dialog state
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenReasonError, setReopenReasonError] = useState<string | null>(null);

  const isOpen = currentDay !== null;

  function handleOpen() {
    startTransition(async () => {
      const result = await openBusinessDay();
      if (result.success) {
        toast.success(t("openSuccess"));
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
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      {/* Status header */}
      <div className="flex items-center gap-3 mb-4">
        {isOpen ? (
          <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
            <CalendarCheckIcon
              className="size-5 text-green-600 dark:text-green-400"
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
            confirmLabel={t("close")}
            cancelLabel={tCommon("cancel")}
            onConfirm={handleClose}
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
        <DialogContent>
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
