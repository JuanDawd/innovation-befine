/**
 * Shared ActionResult type — used by all server actions.
 *
 * All server functions return either success with data, or a structured error.
 * Error codes align with HTTP semantics but are string constants, not numbers.
 */

export type ValidationError = {
  field: string;
  message: string;
};

export type ActionError = {
  code:
    | "VALIDATION_ERROR"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "STALE_DATA"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR";
  message: string;
  details?: ValidationError[];
};

export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
