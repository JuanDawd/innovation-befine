"use client";

/**
 * RequestEditDialog — T041
 *
 * Secretary / stylist: button that opens a dialog to request a service variant change.
 * On submit calls requestEdit() server action.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  requestEdit,
  listActiveServiceVariants,
  type ActiveServiceVariant,
} from "@/app/(protected)/tickets/edit-requests/actions";

interface Props {
  ticketItemId: string;
  currentServiceName: string;
  currentVariantName: string;
  currentVariantId: string;
  /** Called after a successful request so the parent can update hasPendingRequest */
  onSuccess?: () => void;
}

export function RequestEditDialog({
  ticketItemId,
  currentServiceName,
  currentVariantName,
  currentVariantId,
  onSuccess,
}: Props) {
  const t = useTranslations("editRequests");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<ActiveServiceVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleOpen() {
    setSelectedVariantId("");
    setError(null);
    setSuccess(false);
    setLoading(true);
    setOpen(true);
    const result = await listActiveServiceVariants();
    setLoading(false);
    if (result.success) {
      setVariants(result.data.filter((v) => v.id !== currentVariantId));
    }
  }

  function handleDialogChange(nextOpen: boolean) {
    if (!nextOpen) {
      setOpen(false);
      setSelectedVariantId("");
      setError(null);
      setSuccess(false);
    }
  }

  function handleSubmit() {
    if (!selectedVariantId) return;
    if (selectedVariantId === currentVariantId) {
      setError(t("sameVariantError"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await requestEdit(ticketItemId, selectedVariantId);
      if (!result.success) {
        setError(t("requestError"));
        return;
      }
      setSuccess(true);
      onSuccess?.();
      setTimeout(() => setOpen(false), 1500);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleOpen}>
        <PencilIcon className="size-3" aria-hidden="true" />
        {t("requestEdit")}
      </Button>

      <Dialog open={open} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">{t("currentVariant")}</p>
              <p className="rounded bg-muted px-2.5 py-1.5 text-sm">
                {currentServiceName} — {currentVariantName}
              </p>
            </div>

            <div>
              <label
                htmlFor="new-variant-select"
                className="mb-1 block text-xs text-muted-foreground"
              >
                {t("newVariant")}
              </label>
              {loading ? (
                <div className="h-9 rounded-md border bg-muted animate-pulse" />
              ) : (
                <select
                  id="new-variant-select"
                  value={selectedVariantId}
                  onChange={(e) => {
                    setSelectedVariantId(e.target.value);
                    setError(null);
                  }}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-required="true"
                >
                  <option value="">{t("variantPlaceholder")}</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.serviceName} — {v.name} (${v.customerPrice.toLocaleString("es-CO")})
                    </option>
                  ))}
                </select>
              )}
              {error && (
                <p className="mt-1 text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
              {success && (
                <p className="mt-1 text-xs text-green-600" role="status">
                  {t("requestSent")}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              {tc("cancel")}
            </DialogClose>
            <Button
              size="sm"
              disabled={!selectedVariantId || isPending || success}
              onClick={handleSubmit}
            >
              {t("submitRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
