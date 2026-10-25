"use client";

/**
 * BookAppointmentForm — T050
 *
 * Secretary / admin can book an appointment:
 * - Client selector (saved or guest)
 * - Stylist dropdown (active stylists only)
 * - Service summary (free text, optional service_variant_id unused in MVP form)
 * - Date + time picker (native inputs, displayed in America/Bogota)
 * - Duration in minutes
 *
 * Once a stylist and date are picked, her booked times for that day show
 * under the time field and a clash is flagged there before submitting, with
 * the next free start one tap away. The server still enforces no-overlap.
 */

import { notifyDataChanged } from "@/lib/data-events";
import { useState, useTransition, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useFormatter, useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { CalendarIcon, Loader2Icon, ClockIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientSearchWidget } from "@/components/client-search-widget";
import { createAppointment } from "@/app/(protected)/appointments/actions";
import type { ClientRow } from "@/app/(protected)/clients/actions";
import { NativeSelect } from "@/components/ui/native-select";
import { fetchQuery } from "@/lib/action-query";
import { HOLDS_TIME, nextFreeStart } from "@/lib/appointment-timing";

type ClientSelection =
  | { type: "saved"; client: ClientRow }
  | { type: "guest"; guestName: string }
  | null;

/** YYYY-MM-DDTHH:mm in Bogota time, for <input type="datetime-local"> */
function toBogotaDatetimeValue(date: Date): string {
  // sv-SE formats as "YYYY-MM-DD HH:mm"
  return date
    .toLocaleString("sv-SE", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(" ", "T");
}

function localDatetimeToISO(local: string, timezoneOffset: string): string {
  // Convert "YYYY-MM-DDTHH:mm" + Bogota offset "-05:00" to ISO 8601 with offset
  return `${local}:00${timezoneOffset}`;
}

export function BookAppointmentForm({
  redirectPath,
  onClose,
}: {
  redirectPath: string;
  onClose?: () => void;
}) {
  const t = useTranslations("appointments");
  const tc = useTranslations("common");
  const tSubtype = useTranslations("stylistSubtypes");
  const format = useFormatter();
  const router = useRouter();
  const timeOf = (d: Date) =>
    format.dateTime(d, { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });

  const {
    data: stylists = [],
    isPending: isLoading,
    error: stylistsError,
  } = useQuery({
    queryKey: queryKeys.staff.bookingStylists,
    queryFn: () => fetchQuery("bookingStylists"),
    staleTime: 5 * 60_000,
  });
  const loadError = stylistsError?.message ?? null;

  const [clientSelection, setClientSelection] = useState<ClientSelection>(null);
  const [stylistId, setStylistId] = useState("");
  const [serviceSummary, setServiceSummary] = useState("");

  // Default to the next full hour, on the salon's clock (not the browser's)
  const defaultDatetime = () => {
    const d = new Date(Math.ceil((Date.now() + 1) / 3_600_000) * 3_600_000);
    return toBogotaDatetimeValue(d);
  };
  const [datetimeLocal, setDatetimeLocal] = useState(defaultDatetime);
  const [durationMinutes, setDurationMinutes] = useState(60);

  // The chosen stylist's day, to show what's taken before submitting
  const day = datetimeLocal.slice(0, 10);
  const { data: dayRows = [] } = useQuery({
    queryKey: queryKeys.appointments.byDate(day, stylistId),
    queryFn: () => fetchQuery("appointmentsForDate", { date: day, stylist: stylistId }),
    enabled: !!stylistId && /^\d{4}-\d{2}-\d{2}$/.test(day),
  });
  const busy = dayRows
    .filter((r) => HOLDS_TIME.has(r.status))
    .map((r) => ({ start: new Date(r.scheduledAt), minutes: r.durationMinutes }));
  const requested = datetimeLocal ? new Date(`${datetimeLocal}:00-05:00`) : null;
  const freeStart =
    requested && !Number.isNaN(requested.getTime()) && durationMinutes > 0
      ? nextFreeStart(busy, requested, durationMinutes)
      : null;
  const clash = !!(requested && freeStart && freeStart.getTime() !== requested.getTime());
  const noShows = clientSelection?.type === "saved" ? clientSelection.client.noShowCount : 0;

  const [isPending, startSubmitTransition] = useTransition();
  const { showToast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validate = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!clientSelection) errors.client = t("validation.clientRequired");
    if (!stylistId) errors.stylist = t("validation.stylistRequired");
    if (!serviceSummary.trim()) errors.serviceSummary = t("validation.serviceSummaryRequired");
    if (!datetimeLocal) errors.scheduledAt = t("validation.scheduledAtRequired");
    if (durationMinutes < 15 || durationMinutes > 480)
      errors.durationMinutes = t("validation.durationRange");
    return errors;
  }, [clientSelection, stylistId, serviceSummary, datetimeLocal, durationMinutes, t]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    // America/Bogota is UTC-5 (fixed, no DST)
    const scheduledAt = localDatetimeToISO(datetimeLocal, "-05:00");

    const input = {
      clientType: clientSelection!.type,
      clientId: clientSelection!.type === "saved" ? clientSelection!.client.id : undefined,
      guestName: clientSelection!.type === "guest" ? clientSelection!.guestName : undefined,
      stylistEmployeeId: stylistId,
      serviceSummary: serviceSummary.trim(),
      scheduledAt,
      durationMinutes,
    };

    startSubmitTransition(async () => {
      const result = await createAppointment(input);

      if (!result.success) {
        if (result.error.code === "CONFLICT") {
          const conflictErr = result.error as {
            code: "CONFLICT";
            message: string;
            conflict: { scheduledAt: Date; durationMinutes: number };
          };
          const conflictTime = timeOf(new Date(conflictErr.conflict.scheduledAt));
          setFieldErrors({ scheduledAt: t("conflictError", { time: conflictTime }) });
        } else {
          showToast("error", result.error.message || t("submitError"));
        }
        return;
      }

      // Read the booking back, so a phone booking can be confirmed aloud
      const stylist = stylists.find((s) => s.id === stylistId)?.name ?? "";
      const client =
        clientSelection!.type === "saved"
          ? clientSelection!.client.name
          : clientSelection!.guestName;
      showToast(
        "success",
        t("submitSuccessDetail", {
          client,
          stylist,
          when: format.dateTime(new Date(scheduledAt), {
            timeZone: "America/Bogota",
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }),
        }),
      );
      notifyDataChanged("appointments");
      router.refresh();
      if (onClose) onClose();
      else router.push(redirectPath);
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2Icon className="size-4 animate-spin" />
        {tc("loading")}
      </div>
    );
  }

  if (loadError) return <p className="text-sm text-destructive py-4">{loadError}</p>;
  if (stylists.length === 0)
    return <p className="text-sm text-muted-foreground py-4">{t("noStylists")}</p>;

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      {/* Client */}
      <div className="flex flex-col gap-1.5" role="group" aria-labelledby="apt-client-label">
        <p id="apt-client-label" className="text-sm font-medium">
          {t("client")}
        </p>
        <ClientSearchWidget value={clientSelection} onChange={setClientSelection} />
        {noShows > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-status-attention-foreground">
            <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {t("noShowsBefore", { count: noShows })}
          </p>
        )}
        {fieldErrors.client && (
          <p className="text-xs text-destructive" role="alert">
            {fieldErrors.client}
          </p>
        )}
      </div>

      {/* Stylist */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="apt-stylist">
          {t("stylist")}
        </label>
        <NativeSelect
          id="apt-stylist"
          value={stylistId}
          onChange={(e) => setStylistId(e.target.value)}
          className="w-full"
          selectClassName="h-9 text-sm"
        >
          <option value="">{t("stylistPlaceholder")}</option>
          {stylists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.stylistSubtype && tSubtype.has(s.stylistSubtype)
                ? ` — ${tSubtype(s.stylistSubtype)}`
                : ""}
            </option>
          ))}
        </NativeSelect>
        {fieldErrors.stylist && (
          <p className="text-xs text-destructive" role="alert">
            {fieldErrors.stylist}
          </p>
        )}
      </div>

      {/* Service summary */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="apt-service">
          {t("serviceSummary")}
        </label>
        <Input
          id="apt-service"
          placeholder={t("serviceSummaryPlaceholder")}
          value={serviceSummary}
          onChange={(e) => setServiceSummary(e.target.value)}
          maxLength={200}
          aria-describedby={fieldErrors.serviceSummary ? "apt-service-err" : undefined}
        />
        {fieldErrors.serviceSummary && (
          <p id="apt-service-err" className="text-xs text-destructive" role="alert">
            {fieldErrors.serviceSummary}
          </p>
        )}
      </div>

      {/* Date + time */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="apt-datetime">
          <CalendarIcon className="inline size-4 mr-1 align-text-top" />
          {t("date")} / {t("time")}
        </label>
        <Input
          id="apt-datetime"
          type="datetime-local"
          value={datetimeLocal}
          onChange={(e) => {
            setDatetimeLocal(e.target.value);
            setFieldErrors((prev) => {
              const next = { ...prev };
              delete next.scheduledAt;
              return next;
            });
          }}
          aria-invalid={clash || !!fieldErrors.scheduledAt}
          aria-describedby="apt-datetime-busy apt-datetime-err"
        />
        {stylistId && (
          <p id="apt-datetime-busy" className="text-xs text-muted-foreground tabular-nums">
            {busy.length === 0
              ? t("stylistFreeAllDay")
              : t("stylistBusy", {
                  slots: busy
                    .map(
                      (b) =>
                        `${timeOf(b.start)}–${timeOf(new Date(b.start.getTime() + b.minutes * 60_000))}`,
                    )
                    .join(", "),
                })}
          </p>
        )}
        {clash && freeStart && (
          <div
            className="flex flex-wrap items-center gap-2 text-xs text-status-attention-foreground"
            role="status"
          >
            <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {t("clashInline")}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDatetimeLocal(toBogotaDatetimeValue(freeStart))}
            >
              {t("useNextFree", { time: timeOf(freeStart) })}
            </Button>
          </div>
        )}
        {fieldErrors.scheduledAt && (
          <p id="apt-datetime-err" className="text-xs text-destructive" role="alert">
            {fieldErrors.scheduledAt}
          </p>
        )}
      </div>

      {/* Duration */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="apt-duration">
          <ClockIcon className="inline size-4 mr-1 align-text-top" />
          {t("duration")}
        </label>
        <Input
          id="apt-duration"
          type="number"
          min={15}
          max={480}
          step={5}
          placeholder={t("durationPlaceholder")}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          aria-describedby={fieldErrors.durationMinutes ? "apt-duration-err" : undefined}
        />
        {fieldErrors.durationMinutes && (
          <p id="apt-duration-err" className="text-xs text-destructive" role="alert">
            {fieldErrors.durationMinutes}
          </p>
        )}
      </div>

      {/* Actions — submit last, in thumb reach on phones */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="max-sm:w-full"
          disabled={isPending}
          onClick={() => (onClose ? onClose() : router.push(redirectPath))}
        >
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={isPending} className="max-sm:w-full">
          {isPending && <Loader2Icon className="size-4 mr-2 animate-spin" />}
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
