import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";
import { getBusinessSettings } from "./actions";

export default async function AdminSettingsPage() {
  const res = await getBusinessSettings();

  if (!res.success) {
    if (res.error.code === "UNAUTHORIZED" || res.error.code === "FORBIDDEN") {
      redirect("/403");
    }
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{res.error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ajustes de comportamiento del sistema para el negocio.
        </p>
      </div>
      <SettingsForm initialSettings={res.data} />
    </div>
  );
}
