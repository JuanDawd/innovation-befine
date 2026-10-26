"use client";

/**
 * Cancel a pedido — T119 (spec §3.4.18)
 *
 * Reason required; when payments were recorded the person must confirm they
 * will handle the refund. The server refuses while units are approved or
 * waiting for review.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, XCircleIcon } from "lucide-react";
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
import { notifyDataChanged } from "@/lib/data-events";
import { formatMoney } from "@/i18n";
import { cancelPedido } from "../actions";

export function CancelPedidoDialog({
  pedidoId,
  number,
  version,
  paid,
}: {
  pedidoId: string;
  number: string;
  version: number;
  paid: number;
}) {
  const t = useTranslations("pedidos.cancel");
  const tc = useTranslations("common");
  const uid = useId();
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const needsAck = paid !== 0;
  const canSubmit = reason.trim().length >= 3 && (!needsAck || acknowledged);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await cancelPedido(pedidoId, {
        version,
        reason,
        acknowledgePayments: needsAck ? acknowledged : undefined,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setOpen(false);
      showToast("success", t("done", { number }));
      notifyDataChanged("pedidos");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-destructive">
        <XCircleIcon className="size-4" aria-hidden="true" />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t("title", { number })}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-reason`} className="text-sm font-medium">
                {t("reason")}
              </label>
              <textarea
                id={`${uid}-reason`}
                value={reason}
                maxLength={300}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
            </div>
            {needsAck && (
              <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border border-status-attention-foreground/30 bg-status-attention/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                {t("acknowledge", { amount: formatMoney(paid) })}
              </label>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("back")}</DialogClose>
            <Button variant="destructive" onClick={submit} disabled={!canSubmit || isPending}>
              {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
