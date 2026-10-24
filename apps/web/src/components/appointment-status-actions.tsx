"use client";

/**
 * AppointmentStatusActions — T053
 *
 * One visible next step per appointment — "Confirmar" while booked,
 * "Completar" once it's the appointment's day — and the rest (no-show,
 * reschedule, cancel) in a "Más" menu. No-show only once the time has come,
 * with an undo toast; cancel and reschedule open an inline form.
 */

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckIcon,
  XIcon,
  UserXIcon,
  CheckCheckIcon,
  Loader2Icon,
  UndoIcon,
  CalendarClockIcon,
  EllipsisIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { transitionAppointment } from "@/app/(protected)/appointments/actions";
import { allowedNow, hasStarted } from "@/lib/appointment-timing";

type Status = "booked" | "confirmed" | "completed" | "cancelled" | "rescheduled" | "no_show";
type Action = "confirm" | "cancel" | "no_show" | "complete" | "reopen" | "reschedule";

type Props = {
  appointmentId: string;
  currentStatus: Status;
  clientName: string;
  scheduledAt: Date;
  onUpdated: (newStatus: Status) => void;
};

export function AppointmentStatusActions({
  appointmentId,
  currentStatus,
  clientName,
  scheduledAt,
  onUpdated,
}: Props) {
  const t = useTranslations("appointments");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<"cancel" | "reschedule" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  const when = format.dateTime(new Date(scheduledAt), {
    timeZone: "America/Bogota",
    hour: "numeric",
    minute: "2-digit",
  });
  const who = { client: clientName, time: when };

  const SUCCESS: Record<Action, string> = {
    confirm: t("confirmSuccess"),
    cancel: t("cancelSuccess"),
    no_show: t("noShowSuccess"),
    complete: t("completeSuccess"),
    reopen: t("reopenSuccess"),
    reschedule: t("rescheduleSuccess"),
  };

  function act(action: Action, reason?: string, newScheduledAt?: string) {
    setError(null);
    startTransition(async () => {
      const res = await transitionAppointment({
        appointmentId,
        action,
        cancellationReason: reason,
        newScheduledAt,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      onUpdated(res.data.status as Status);
      setForm(null);
      setCancelReason("");
      setNewDate("");
      setNewTime("");
      // A no-show counts against the client — make it easy to take back.
      toast.success(SUCCESS[action], {
        ...(action === "no_show" && {
          duration: 6000,
          action: { label: t("undo"), onClick: () => act("reopen") },
        }),
      });
    });
  }

  function submitReschedule() {
    if (!newDate || !newTime) {
      setError(t("rescheduleRequiredError"));
      return;
    }
    // Combine date + time into ISO 8601 with Bogota offset (-05:00)
    act("reschedule", undefined, `${newDate}T${newTime}:00-05:00`);
  }

  // Hard terminal statuses — no actions available
  if (
    currentStatus === "completed" ||
    currentStatus === "cancelled" ||
    currentStatus === "rescheduled"
  ) {
    return null;
  }

  const spinner = <Loader2Icon className="animate-spin" aria-hidden="true" />;

  // T032b: no_show can be reversed (shows only reopen)
  if (currentStatus === "no_show") {
    return (
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => act("reopen")}
          aria-label={t("reopenLabel", who)}
        >
          {isPending ? spinner : <UndoIcon aria-hidden="true" />}
          {t("reopenAction")}
        </Button>
      </div>
    );
  }

  const started = hasStarted(scheduledAt);
  const canComplete = allowedNow("complete", scheduledAt);
  const canNoShow = allowedNow("no_show", scheduledAt);
  // Once it has started the next step is finishing it; before that, confirming.
  const primary: Action | null = started
    ? "complete"
    : currentStatus === "booked"
      ? "confirm"
      : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1.5">
        {primary === "complete" && (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => act("complete")}
            aria-label={t("completeLabel", who)}
          >
            {isPending ? spinner : <CheckCheckIcon aria-hidden="true" />}
            {t("completeShort")}
          </Button>
        )}
        {primary === "confirm" && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => act("confirm")}
            aria-label={t("confirmLabel", who)}
          >
            {isPending ? spinner : <CheckIcon aria-hidden="true" />}
            {t("confirmShort")}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={isPending}
                aria-label={t("moreActions", who)}
              />
            }
          >
            <EllipsisIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {currentStatus === "booked" && primary !== "confirm" && (
              <DropdownMenuItem onClick={() => act("confirm")}>
                <CheckIcon aria-hidden="true" />
                {t("confirmAction")}
              </DropdownMenuItem>
            )}
            {/* Client arrived early */}
            {canComplete && primary !== "complete" && (
              <DropdownMenuItem onClick={() => act("complete")}>
                <CheckCheckIcon aria-hidden="true" />
                {t("completeAction")}
              </DropdownMenuItem>
            )}
            {canNoShow && (
              <DropdownMenuItem onClick={() => act("no_show")}>
                <UserXIcon aria-hidden="true" />
                {t("noShowAction")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setForm("reschedule")}>
              <CalendarClockIcon aria-hidden="true" />
              {t("rescheduleAction")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setForm("cancel")}>
              <XIcon aria-hidden="true" />
              {t("cancelAction")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {form === "cancel" && (
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Input
            className="min-w-0 flex-1 basis-48"
            placeholder={t("cancellationReasonPlaceholder")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            maxLength={500}
            aria-label={t("cancellationReason")}
          />
          <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={isPending}>
            {t("keepAppointment")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() => act("cancel", cancelReason.trim() || undefined)}
          >
            {isPending ? spinner : t("cancelAction")}
          </Button>
        </div>
      )}

      {form === "reschedule" && (
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Input
            type="date"
            className="w-auto"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            aria-label={t("rescheduleDate")}
          />
          <Input
            type="time"
            className="w-auto"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            aria-label={t("rescheduleTime")}
          />
          <Button size="sm" variant="ghost" onClick={() => setForm(null)} disabled={isPending}>
            {t("keepAppointment")}
          </Button>
          <Button size="sm" variant="outline" disabled={isPending} onClick={submitReschedule}>
            {isPending ? spinner : t("rescheduleConfirm")}
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
