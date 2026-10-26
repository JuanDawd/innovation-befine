/**
 * Shared guards and errors for the pedido server actions (T116+).
 * Not a "use server" module, and never imported by client components: these
 * helpers must not be callable as server actions.
 */

import { headers } from "next/headers";
import type { z } from "zod";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { hasRole } from "@/lib/middleware-helpers";
import { getEmployeeRef } from "@/lib/employee-ref";

export type Fail = Extract<ActionResult<never>, { success: false }>;

export async function requirePedidoRole(): Promise<
  | Fail
  | {
      user: { id: string; role?: string | null };
      employeeId: string;
      canEditPrices: boolean;
    }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { success: false, error: { code: "UNAUTHORIZED", message: "No autenticado" } };
  if (!hasRole(session.user, "admin", "cashier", "secretary"))
    return { success: false, error: { code: "FORBIDDEN", message: "Sin permisos" } };
  const emp = await getEmployeeRef(session.user.id);
  if (!emp)
    return { success: false, error: { code: "NOT_FOUND", message: "Empleado no encontrado" } };
  return {
    user: session.user,
    employeeId: emp.id,
    canEditPrices: hasRole(session.user, "admin", "cashier"),
  };
}

export function validationError(error: z.ZodError): Fail {
  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message ?? "Datos inválidos",
      details: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    },
  };
}

export const fieldError = (field: string, message: string): Fail => ({
  success: false,
  error: { code: "VALIDATION_ERROR", message, details: [{ field, message }] },
});

export class InputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export class ConflictError extends Error {
  constructor(
    readonly code: "CONFLICT" | "STALE_DATA" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

export function toFail(err: unknown): Fail | null {
  if (err instanceof InputError) return fieldError(err.field, err.message);
  if (err instanceof ConflictError)
    return { success: false, error: { code: err.code, message: err.message } };
  return null;
}
