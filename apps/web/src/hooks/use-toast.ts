import { useCallback } from "react";
import { toast as sonner } from "sonner";
import * as Sentry from "@sentry/nextjs";

/** Thin wrapper so callers use a consistent API and get Sentry breadcrumbs on errors. */
export function useToast() {
  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (type === "error") {
      Sentry.addBreadcrumb({ category: "ui.toast", message, level: "error" });
      sonner.error(message, { duration: 6000 });
    } else {
      sonner.success(message, { duration: 4000 });
    }
  }, []);

  return { showToast };
}
