"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBusinessSettings, type BusinessSettingsData } from "./actions";

interface SettingsFormProps {
  initialSettings: BusinessSettingsData;
}

type SettingKey = Exclude<keyof BusinessSettingsData, "clothierClaimLimit">;

/** One card per section; i18n keys under `settings`. */
const SECTIONS: { title: string; key: SettingKey; id: string; label: string; help: string }[] = [
  {
    title: "authSection",
    key: "employeeAuthRequiresEmail",
    id: "employee-auth-requires-email",
    label: "requireEmail",
    help: "requireEmailHelp",
  },
  {
    title: "accessSection",
    key: "cashierCanAccessAdmin",
    id: "cashier-can-access-admin",
    label: "cashierAdmin",
    help: "cashierAdminHelp",
  },
  {
    title: "subtypeSection",
    key: "enforceSubtypeServiceRestriction",
    id: "enforce-subtype-restriction",
    label: "subtypeRestriction",
    help: "subtypeRestrictionHelp",
  },
  {
    title: "pedidosSection",
    key: "secretaryCanRecordPedidoPayments",
    id: "secretary-can-record-pedido-payments",
    label: "secretaryPedidoPayments",
    help: "secretaryPedidoPaymentsHelp",
  },
  {
    title: "pedidosSection",
    key: "payScrappedUnits",
    id: "pay-scrapped-units",
    label: "payScrappedUnits",
    help: "payScrappedUnitsHelp",
  },
];

const CLAIM_LIMIT_MIN = 1;
const CLAIM_LIMIT_MAX = 10_000;

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const t = useTranslations("settings");
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<BusinessSettingsData>(initialSettings);
  // Last saved values — what "Cambios sin guardar" compares against
  const [saved, setSaved] = useState<BusinessSettingsData>(initialSettings);

  // Kept as text so the field can be cleared while typing.
  const [claimLimit, setClaimLimit] = useState(String(initialSettings.clothierClaimLimit));
  const claimLimitValue = Number(claimLimit);
  const claimLimitError =
    claimLimit.trim() === "" ||
    !Number.isInteger(claimLimitValue) ||
    claimLimitValue < CLAIM_LIMIT_MIN ||
    claimLimitValue > CLAIM_LIMIT_MAX
      ? t("claimLimitInvalid", {
          min: CLAIM_LIMIT_MIN,
          max: CLAIM_LIMIT_MAX.toLocaleString("es-CO"),
        })
      : null;

  function handleToggle(key: SettingKey) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (claimLimitError) return;
    startTransition(async () => {
      const res = await updateBusinessSettings({
        ...settings,
        clothierClaimLimit: claimLimitValue,
      });
      if (!res.success) {
        toast.error(res.error.message);
        return;
      }
      setSettings(res.data);
      setSaved(res.data);
      setClaimLimit(String(res.data.clothierClaimLimit));
      toast.success(t("saved"));
    });
  }

  const dirty =
    SECTIONS.some((section) => settings[section.key] !== saved[section.key]) ||
    claimLimitValue !== saved.clothierClaimLimit;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      <div className="divide-y rounded-xl border bg-card">
        {SECTIONS.map((section) => (
          <div key={section.key} className="flex items-start justify-between gap-6 p-5">
            <div className="space-y-1">
              <p className="text-sm font-medium" id={`${section.id}-label`}>
                {t(section.label)}
              </p>
              <p className="max-w-prose text-sm text-muted-foreground" id={`${section.id}-help`}>
                {t.rich(section.help, { strong: (chunks) => <strong>{chunks}</strong> })}
              </p>
            </div>
            <Switch
              id={section.id}
              checked={settings[section.key]}
              onCheckedChange={() => handleToggle(section.key)}
              aria-labelledby={`${section.id}-label`}
              aria-describedby={`${section.id}-help`}
            />
          </div>
        ))}
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="space-y-1">
            <label htmlFor="clothier-claim-limit" className="text-sm font-medium">
              {t("claimLimit")}
            </label>
            <p className="max-w-prose text-sm text-muted-foreground" id="clothier-claim-limit-help">
              {t("claimLimitHelp")}
            </p>
          </div>
          <div className="shrink-0 space-y-1 sm:w-32">
            <Input
              id="clothier-claim-limit"
              type="number"
              inputMode="numeric"
              min={CLAIM_LIMIT_MIN}
              max={CLAIM_LIMIT_MAX}
              step={1}
              value={claimLimit}
              onChange={(e) => setClaimLimit(e.target.value)}
              aria-invalid={!!claimLimitError}
              aria-describedby={
                claimLimitError
                  ? "clothier-claim-limit-help clothier-claim-limit-error"
                  : "clothier-claim-limit-help"
              }
              className="font-mono tabular-nums"
            />
            {claimLimitError && (
              <p id="clothier-claim-limit-error" className="text-sm text-destructive">
                {claimLimitError}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty && <p className="text-sm text-muted-foreground">{t("unsaved")}</p>}
        <Button type="submit" disabled={isPending || !dirty || !!claimLimitError}>
          {isPending && <Loader2Icon className="size-4 animate-spin mr-2" aria-hidden="true" />}
          {t("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
