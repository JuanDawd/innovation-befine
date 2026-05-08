"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { updateBusinessSettings, type BusinessSettingsData } from "./actions";

interface SettingsFormProps {
  initialSettings: BusinessSettingsData;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<BusinessSettingsData>(initialSettings);

  function handleToggle(key: keyof BusinessSettingsData) {
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
      toast.success("Configuración guardada");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      <div className="rounded-lg border bg-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Autenticación de empleados</h2>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Requerir correo electrónico</p>
            <p className="text-xs text-muted-foreground">
              Cuando está activo, los empleados deben registrarse con un correo. Al desactivarlo,
              pueden usar un nombre de usuario en su lugar.
            </p>
          </div>
          <Switch
            id="employee-auth-requires-email"
            checked={settings.employeeAuthRequiresEmail}
            onCheckedChange={() => handleToggle("employeeAuthRequiresEmail")}
            aria-label="Requerir correo electrónico al registrar empleados"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Control de acceso</h2>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Permitir al cajero acceder a rutas de administración
            </p>
            <p className="text-xs text-muted-foreground">
              Cuando está activo, los usuarios con rol <strong>cajero</strong> pueden navegar a
              secciones de administración (analítica, nómina, empleados, etc.). Solo relevante
              después de separar los roles cajero y admin.
            </p>
          </div>
          <Switch
            id="cashier-can-access-admin"
            checked={settings.cashierCanAccessAdmin}
            onCheckedChange={() => handleToggle("cashierCanAccessAdmin")}
            aria-label="Permitir al cajero acceder a rutas de administración"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-6">
        <h2 className="text-lg font-semibold">Servicios por subtipo</h2>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Restringir servicios por subtipo de estilista</p>
            <p className="text-xs text-muted-foreground">
              Cuando está activo, cada estilista solo puede registrar servicios que coincidan con su
              subtipo. Al desactivarlo, todos los servicios están disponibles para cualquier
              estilista.
            </p>
          </div>
          <Switch
            id="enforce-subtype-restriction"
            checked={settings.enforceSubtypeServiceRestriction}
            onCheckedChange={() => handleToggle("enforceSubtypeServiceRestriction")}
            aria-label="Restringir servicios al subtipo del estilista"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2Icon className="size-4 animate-spin mr-2" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
