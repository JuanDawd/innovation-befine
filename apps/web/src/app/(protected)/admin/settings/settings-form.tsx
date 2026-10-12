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
      toast.success(t("saved"));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {SECTIONS.map((section) => (
        <div key={section.key} className="rounded-lg border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold">{t(section.title)}</h2>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium" id={`${section.id}-label`}>
                {t(section.label)}
              </p>
              <p className="text-xs text-muted-foreground" id={`${section.id}-help`}>
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
        </div>
      ))}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2Icon className="size-4 animate-spin mr-2" aria-hidden="true" />}
          {t("saveChanges")}
        </Button>
      </div>
    </form>
  );
}
