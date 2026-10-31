"use client";

/**
 * Which details a product uses — T137
 *
 * For each detail: whether it applies, whether it's required, and which values
 * the product comes in.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  getProductDetails,
  saveProductDetails,
  type ProductDetailRow,
} from "@/app/(protected)/admin/catalog/actions/details";

export function ProductDetailsDialog({
  clothPieceId,
  name,
}: {
  clothPieceId: string;
  name: string;
}) {
  const t = useTranslations("catalog.details");
  const tc = useTranslations("common");
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ProductDetailRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function start() {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      const res = await getProductDetails(clothPieceId);
      if (!res.success) return setError(t("loadError"));
      setRows(res.data);
    });
  }

  const patch = (detailId: string, next: Partial<ProductDetailRow>) =>
    setRows((list) => list.map((r) => (r.detailId === detailId ? { ...r, ...next } : r)));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveProductDetails(clothPieceId, {
        details: rows
          .filter((r) => r.used)
          .map((r) => ({
            detailId: r.detailId,
            required: r.required,
            allValues: r.allValues,
            valueIds: r.allValues ? [] : r.valueIds,
          })),
      });
      if (!res.success) return setError(res.error.message);
      setOpen(false);
      showToast("success", t("productSaved"));
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={start}>
        <SlidersHorizontalIcon className="size-3.5" aria-hidden="true" />
        {t("productButton")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("productTitle", { name })}</DialogTitle>
            <DialogDescription>{t("productDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {rows.map((r) => (
              <fieldset key={r.detailId} className="space-y-2 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-semibold">{r.name}</legend>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={r.used}
                    onChange={(e) => patch(r.detailId, { used: e.target.checked })}
                  />
                  {t("uses")}
                </label>
                {r.used && (
                  <>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={r.required}
                        onChange={(e) => patch(r.detailId, { required: e.target.checked })}
                      />
                      {t("required")}
                    </label>
                    {r.builtin !== "style" && (
                      <>
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={r.allValues}
                            onChange={(e) => patch(r.detailId, { allValues: e.target.checked })}
                          />
                          {t("allValues")}
                        </label>
                        {!r.allValues && (
                          <div className="flex flex-wrap gap-x-4">
                            {r.values.map((v) => (
                              <label
                                key={v.id}
                                className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4"
                                  checked={r.valueIds.includes(v.id)}
                                  onChange={(e) =>
                                    patch(r.detailId, {
                                      valueIds: e.target.checked
                                        ? [...r.valueIds, v.id]
                                        : r.valueIds.filter((id) => id !== v.id),
                                    })
                                  }
                                />
                                {v.label}
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </fieldset>
            ))}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button disabled={isPending || rows.length === 0} onClick={save}>
              {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
