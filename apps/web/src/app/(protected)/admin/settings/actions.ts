"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getDb, getTxDb } from "@/lib/db";
import { businessSettings, BUSINESS_SETTINGS_ID } from "@befine/db/schema";
import { hasRole } from "@/lib/middleware-helpers";
import type { ActionResult } from "@/lib/action-result";
import { actorOf, logActivity } from "@/lib/activity";

export type BusinessSettingsData = {
  enforceSubtypeServiceRestriction: boolean;
  employeeAuthRequiresEmail: boolean;
  cashierCanAccessAdmin: boolean;
  /** T115 */
  secretaryCanRecordPedidoPayments: boolean;
  clothierClaimLimit: number;
  payScrappedUnits: boolean;
};

const updateSettingsSchema = z.object({
  enforceSubtypeServiceRestriction: z.boolean(),
  employeeAuthRequiresEmail: z.boolean(),
  cashierCanAccessAdmin: z.boolean(),
  secretaryCanRecordPedidoPayments: z.boolean(),
  clothierClaimLimit: z
    .number("Escribe un número")
    .int("Debe ser un número entero")
    .min(1, "Mínimo 1 unidad")
    .max(10_000, "Máximo 10.000 unidades"),
  payScrappedUnits: z.boolean(),
});

/** Spanish names for the activity log summary (T114/T115). */
const SETTING_LABEL: Record<keyof BusinessSettingsData, string> = {
  enforceSubtypeServiceRestriction: "restringir servicios por especialidad",
  employeeAuthRequiresEmail: "exigir correo a los empleados",
  cashierCanAccessAdmin: "cajero con acceso de administrador",
  secretaryCanRecordPedidoPayments: "secretaria puede registrar pagos de pedidos",
  clothierClaimLimit: "límite de unidades por confeccionista",
  payScrappedUnits: "pagar unidades descartadas",
};

const SETTINGS_COLUMNS = {
  enforceSubtypeServiceRestriction: businessSettings.enforceSubtypeServiceRestriction,
  employeeAuthRequiresEmail: businessSettings.employeeAuthRequiresEmail,
  cashierCanAccessAdmin: businessSettings.cashierCanAccessAdmin,
  secretaryCanRecordPedidoPayments: businessSettings.secretaryCanRecordPedidoPayments,
  clothierClaimLimit: businessSettings.clothierClaimLimit,
  payScrappedUnits: businessSettings.payScrappedUnits,
};

function describe(value: boolean | number): string {
  if (typeof value === "number") return String(value);
  return value ? "activado" : "desactivado";
}

export async function getBusinessSettings(): Promise<ActionResult<BusinessSettingsData>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const [row] = await db
    .select(SETTINGS_COLUMNS)
    .from(businessSettings)
    .where(eq(businessSettings.id, BUSINESS_SETTINGS_ID))
    .limit(1);

  if (!row)
    return { success: false, error: { code: "NOT_FOUND", message: "Configuración no encontrada" } };

  return { success: true, data: row };
}

export async function updateBusinessSettings(
  rawInput: unknown,
): Promise<ActionResult<BusinessSettingsData>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const parsed = updateSettingsSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Datos inválidos",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    };

  const updated = await getTxDb().transaction(async (tx) => {
    const [current] = await tx
      .select(SETTINGS_COLUMNS)
      .from(businessSettings)
      .where(eq(businessSettings.id, BUSINESS_SETTINGS_ID))
      .for("update");
    if (!current) return null;

    const [row] = await tx
      .update(businessSettings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(businessSettings.id, BUSINESS_SETTINGS_ID))
      .returning(SETTINGS_COLUMNS);

    // One entry per changed setting, so Actividad reads "Cambió la configuración: …".
    for (const key of Object.keys(SETTING_LABEL) as (keyof BusinessSettingsData)[]) {
      if (current[key] === row[key]) continue;
      await logActivity(tx, {
        actor: actorOf(session.user),
        action: "settings.update",
        entityType: "business_settings",
        entityId: BUSINESS_SETTINGS_ID,
        data: {
          setting: `${SETTING_LABEL[key]} (${describe(current[key])} → ${describe(row[key])})`,
        },
        before: { [key]: current[key] },
        after: { [key]: row[key] },
      });
    }
    return row;
  });

  if (!updated)
    return { success: false, error: { code: "NOT_FOUND", message: "Configuración no encontrada" } };

  revalidatePath("/admin/settings");

  return { success: true, data: updated };
}
