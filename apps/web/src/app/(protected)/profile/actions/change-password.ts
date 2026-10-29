"use server";

/**
 * Change password server action — T091
 *
 * Verifies the current password and sets the new one.
 * Available to any authenticated role.
 */

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { getTxDb } from "@/lib/db";
import { reportError } from "@/lib/observability";
import { actorOf, deviceOf, logActivity } from "@/lib/activity";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
    newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export async function changePassword(rawInput: unknown): Promise<ActionResult<void>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  }

  const parsed = changePasswordSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Por favor corrige los errores en el formulario.",
        details: parsed.error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      },
    };
  }

  const result = await auth.api.changePassword({
    body: {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    },
    headers: await headers(),
  });

  if (!result) {
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "No se pudo cambiar la contraseña" },
    };
  }

  // T131 — Better Auth wrote the change in its own transaction; log it right
  // after, like sign-in/out (auth-activity). Never the password itself.
  const h = await headers();
  await getTxDb()
    .transaction((tx) =>
      logActivity(tx, {
        actor: actorOf(session.user),
        action: "auth.password_change",
        entityType: "user",
        entityId: session.user.id,
        ...deviceOf(h),
      }),
    )
    .catch((err) => reportError(err, "changePassword.logActivity"));

  return { success: true, data: undefined };
}
