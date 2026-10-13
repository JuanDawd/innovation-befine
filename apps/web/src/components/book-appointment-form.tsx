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
 * Validates no overlapping appointment for the selected stylist client-side by
 * surface-displaying the server CONFLICT response.
 */

import { notifyDataChanged } from "@/lib/data-events";
import { useState, useTransition, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { CalendarIcon, Loader2Icon, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientSearchWidget } from "@/components/client-search-widget";
import { createAppointment } from "@/app/(protected)/appointments/actions";
import type { ClientRow } from "@/app/(protected)/clients/actions";
import { NativeSelect } from "@/components/ui/native-select";
import { fetchQuery } from "@/lib/action-query";

type ClientSelection =
  | { type: "saved"; client: ClientRow }
  | { type: "guest"; guestName: string }
  | null;

function toLocalDatetimeValue(date: Date): string {
  // Format as YYYY-MM-DDTHH:mm for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  const router = useRouter();

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

  // Default to next hour, rounded up
  const defaultDatetime = () => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalDatetimeValue(d);
  };
  const [datetimeLocal, setDatetimeLocal] = useState(defaultDatetime);
  const [durationMinutes, setDurationMinutes] = useState(60);

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

  function handleSubmit() {
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
          const conflictTime = new Date(conflictErr.conflict.scheduledAt).toLocaleTimeString(
            "es-CO",
            {
              timeZone: "America/Bogota",
              hour: "2-digit",
              minute: "2-digit",
            },
          );
          showToast("error", t("conflictError", { time: conflictTime }));
        } else {
          showToast("error", result.error.message || t("submitError"));
        }
        return;
      }

      showToast("success", t("submitSuccess"));
      notifyDataChanged("appointments");
      router.refresh();
      if (onClose) {
        setTimeout(() => onClose(), 1200);
      } else {
        setTimeout(() => router.push(redirectPath), 1200);
      }
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
    <div className="flex flex-col gap-5 ">
      {/* Client */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">{t("client")}</label>
        <ClientSearchWidget value={clientSelection} onChange={setClientSelection} />
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
          onChange={(e) => setDatetimeLocal(e.target.value)}
          aria-describedby={fieldErrors.scheduledAt ? "apt-datetime-err" : undefined}
        />
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

      {/* Submit */}
      <Button onClick={handleSubmit} disabled={isPending} className="self-end">
        {isPending && <Loader2Icon className="size-4 mr-2 animate-spin" />}
        {t("submit")}
      </Button>
    </div>
  );
}
