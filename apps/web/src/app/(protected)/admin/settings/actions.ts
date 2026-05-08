"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { businessSettings, BUSINESS_SETTINGS_ID } from "@befine/db/schema";
import { hasRole } from "@/lib/middleware-helpers";
import type { ActionResult } from "@/lib/action-result";

export type BusinessSettingsData = {
  enforceSubtypeServiceRestriction: boolean;
  employeeAuthRequiresEmail: boolean;
  cashierCanAccessAdmin: boolean;
};

const updateSettingsSchema = z.object({
  enforceSubtypeServiceRestriction: z.boolean(),
  employeeAuthRequiresEmail: z.boolean(),
  cashierCanAccessAdmin: z.boolean(),
});

async function getAdminSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (!hasRole(session.user, "cashier_admin")) return null;
  return session;
}

export async function getBusinessSettings(): Promise<ActionResult<BusinessSettingsData>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "cashier_admin"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };

  const db = getDb();
  const [row] = await db
    .select({
      enforceSubtypeServiceRestriction: businessSettings.enforceSubtypeServiceRestriction,
      employeeAuthRequiresEmail: businessSettings.employeeAuthRequiresEmail,
      cashierCanAccessAdmin: businessSettings.cashierCanAccessAdmin,
    })
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
  const session = await getAdminSession();
  if (!session)
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "No autenticado o sin permisos" },
    };

  const parsed = updateSettingsSchema.safeParse(rawInput);
  if (!parsed.success)
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Datos inválidos" },
    };

  const db = getDb();
  const [updated] = await db
    .update(businessSettings)
    .set({
      enforceSubtypeServiceRestriction: parsed.data.enforceSubtypeServiceRestriction,
      employeeAuthRequiresEmail: parsed.data.employeeAuthRequiresEmail,
      cashierCanAccessAdmin: parsed.data.cashierCanAccessAdmin,
      updatedAt: new Date(),
    })
    .where(eq(businessSettings.id, BUSINESS_SETTINGS_ID))
    .returning({
      enforceSubtypeServiceRestriction: businessSettings.enforceSubtypeServiceRestriction,
      employeeAuthRequiresEmail: businessSettings.employeeAuthRequiresEmail,
      cashierCanAccessAdmin: businessSettings.cashierCanAccessAdmin,
    });

  if (!updated)
    return { success: false, error: { code: "NOT_FOUND", message: "Configuración no encontrada" } };

  revalidatePath("/admin/settings");

  return { success: true, data: updated };
}
