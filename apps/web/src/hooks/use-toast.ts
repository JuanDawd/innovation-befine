import { useState, useCallback } from "react";
import * as Sentry from "@sentry/nextjs";

export type ToastState = { type: "success" | "error"; message: string } | null;

export function useToast() {
  const [toast, setToastState] = useState<ToastState>(null);

  const setToast = useCallback((next: ToastState) => {
    if (next?.type === "error") {
      Sentry.addBreadcrumb({
        category: "ui.toast",
        message: next.message,
        level: "error",
      });
    }
    setToastState(next);
  }, []);

  return { toast, setToast };
}
