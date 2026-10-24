"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { updateBusinessSettings, type BusinessSettingsData } from "./actions";

interface SettingsFormProps {
  initialSettings: BusinessSettingsData;
}

type SettingKey = keyof BusinessSettingsData;

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
];

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const t = useTranslations("settings");
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<BusinessSettingsData>(initialSettings);
  // Last saved values — what "Cambios sin guardar" compares against
  const [saved, setSaved] = useState<BusinessSettingsData>(initialSettings);

  function handleToggle(key: SettingKey) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateBusinessSettings(settings);
      if (!res.success) {
        toast.error(res.error.message);
        return;
      }
      setSettings(res.data);
      setSaved(res.data);
      toast.success(t("saved"));
    });
  }

  const dirty = SECTIONS.some((section) => settings[section.key] !== saved[section.key]);

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
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty && <p className="text-sm text-muted-foreground">{t("unsaved")}</p>}
        <Button type="submit" disabled={isPending || !dirty}>
          {isPending && <Loader2Icon className="size-4 animate-spin mr-2" aria-hidden="true" />}
          {t("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
