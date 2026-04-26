"use client";

/**
 * BookAppointmentForm — T050
 *
 * Secretary / cashier_admin can book an appointment:
 * - Client selector (saved or guest)
 * - Stylist dropdown (active stylists only)
 * - Service summary (free text, optional service_variant_id unused in MVP form)
 * - Date + time picker (native inputs, displayed in America/Bogota)
 * - Duration in minutes
 *
 * Validates no overlapping appointment for the selected stylist client-side by
 * surface-displaying the server CONFLICT response.
 */

import { useState, useTransition, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { CalendarIcon, Loader2Icon, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClientSearchWidget } from "@/components/client-search-widget";
import {
  createAppointment,
  listBookingStylists,
  type StylistOption,
} from "@/app/(protected)/appointments/actions";
import type { ClientRow } from "@/app/(protected)/clients/actions";

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

export function BookAppointmentForm({ redirectPath }: { redirectPath: string }) {
  const t = useTranslations("appointments");
  const tc = useTranslations("common");
  const router = useRouter();

  const [stylists, setStylists] = useState<StylistOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoadTransition] = useTransition();

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

  useEffect(() => {
    startLoadTransition(async () => {
      const res = await listBookingStylists();
      if (!res.success) {
        setLoadError(res.error.message);
        return;
      }
      setStylists(res.data);
    });
  }, []);

  const validate = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!clientSelection) errors.client = "Selecciona un cliente o ingresa un nombre de invitado";
    if (!stylistId) errors.stylist = "Selecciona un estilista";
    if (!serviceSummary.trim())
      errors.serviceSummary = "La descripción del servicio es obligatoria";
    if (!datetimeLocal) errors.scheduledAt = "Selecciona una fecha y hora";
    if (durationMinutes < 15 || durationMinutes > 480)
      errors.durationMinutes = "Entre 15 y 480 minutos";
    return errors;
  }, [clientSelection, stylistId, serviceSummary, datetimeLocal, durationMinutes]);

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
      setTimeout(() => router.push(redirectPath), 1200);
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2Icon className="h-4 w-4 animate-spin" />
        {tc("loading")}
      </div>
    );
  }

  if (loadError) return <p className="text-sm text-destructive py-4">{loadError}</p>;
  if (stylists.length === 0)
    return <p className="text-sm text-muted-foreground py-4">{t("noStylists")}</p>;

  return (
    <div className="flex flex-col gap-5">
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
        <select
          id="apt-stylist"
          value={stylistId}
          onChange={(e) => setStylistId(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">{t("stylistPlaceholder")}</option>
          {stylists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.stylistSubtype ? ` — ${s.stylistSubtype}` : ""}
            </option>
          ))}
        </select>
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
          <CalendarIcon className="inline h-4 w-4 mr-1 align-text-top" />
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
          <ClockIcon className="inline h-4 w-4 mr-1 align-text-top" />
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
      <Button onClick={handleSubmit} disabled={isPending} className="self-start">
        {isPending && <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />}
        {t("submit")}
      </Button>
    </div>
  );
}
