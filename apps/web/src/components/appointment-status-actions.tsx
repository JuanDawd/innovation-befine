"use client";

/**
 * AppointmentStatusActions — T053
 *
 * Inline action buttons (confirm, cancel, no-show, complete) for a single
 * appointment row in the list. Cancel prompts for a reason via a small inline form.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, XIcon, UserXIcon, CheckCheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transitionAppointment } from "@/app/(protected)/appointments/actions";

type Status = "booked" | "confirmed" | "completed" | "cancelled" | "rescheduled" | "no_show";

type Props = {
  appointmentId: string;
  currentStatus: Status;
  onUpdated: (newStatus: Status) => void;
};

export function AppointmentStatusActions({ appointmentId, currentStatus, onUpdated }: Props) {
  const t = useTranslations("appointments");
  const [isPending, startTransition] = useTransition();
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function act(action: "confirm" | "cancel" | "no_show" | "complete", reason?: string) {
    setError(null);
    startTransition(async () => {
      const res = await transitionAppointment({
        appointmentId,
        action,
        cancellationReason: reason,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      onUpdated(res.data.status as Status);
      setShowCancelForm(false);
      setCancelReason("");
    });
  }

  // Terminal statuses — no actions available
  if (
    currentStatus === "completed" ||
    currentStatus === "cancelled" ||
    currentStatus === "no_show" ||
    currentStatus === "rescheduled"
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {currentStatus === "booked" && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => act("confirm")}
            aria-label={t("confirmAction")}
          >
            {isPending ? (
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckIcon className="h-3.5 w-3.5" />
            )}
            <span className="ml-1 hidden sm:inline">{t("confirmAction")}</span>
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => act("complete")}
          aria-label={t("completeAction")}
        >
          {isPending ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCheckIcon className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 hidden sm:inline">{t("completeAction")}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => act("no_show")}
          aria-label={t("noShowAction")}
        >
          {isPending ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserXIcon className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 hidden sm:inline">{t("noShowAction")}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setShowCancelForm((v) => !v)}
          aria-label={t("cancelAction")}
          className="text-destructive hover:text-destructive"
        >
          <XIcon className="h-3.5 w-3.5" />
          <span className="ml-1 hidden sm:inline">{t("cancelAction")}</span>
        </Button>
      </div>

      {showCancelForm && (
        <div className="flex gap-2 items-start mt-1">
          <input
            className="flex-1 h-8 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:border-ring"
            placeholder={t("cancellationReasonPlaceholder")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            maxLength={500}
            aria-label={t("cancellationReason")}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => act("cancel", cancelReason.trim() || undefined)}
          >
            {isPending ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : t("cancelAction")}
          </Button>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
