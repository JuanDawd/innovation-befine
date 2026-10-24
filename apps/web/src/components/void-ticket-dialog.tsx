"use client";

/**
 * VoidTicketDialog — H-49
 *
 * Voids an unpaid ticket (client left without paying) so the business day can
 * be closed. Cashier/admin only; the reason is required and kept on the ticket.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BanIcon, Loader2Icon } from "lucide-react";
import { notifyDataChanged } from "@/lib/data-events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { voidTicket } from "@/app/(protected)/tickets/actions";

export function VoidTicketDialog({
  ticketId,
  clientName,
}: {
  ticketId: string;
  clientName: string;
}) {
  const t = useTranslations("voidTicket");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setReason("");
      setError(null);
    }
  }

  function handleSubmit() {
    if (reason.trim().length < 5) {
      setError(t("reasonTooShort"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await voidTicket({ ticketId, reason });
      if (result.success) {
        toast.success(t("success", { client: clientName }));
        notifyDataChanged("tickets");
        handleOpenChange(false);
      } else if (result.error.details) {
        setError(result.error.details[0]?.message ?? result.error.message);
      } else {
        toast.error(result.error.message);
        handleOpenChange(false);
      }
    });
  }

  const inputId = `void-reason-${ticketId}`;

  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        className="relative z-10 text-muted-foreground hover:text-destructive pointer-coarse:size-11"
        onClick={() => handleOpenChange(true)}
        aria-label={t("triggerLabel", { client: clientName })}
      >
        <BanIcon aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title", { client: clientName })}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor={inputId} className="text-sm font-medium">
              {t("reason")}
            </label>
            <Input
              id={inputId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              aria-describedby={error ? `${inputId}-error` : undefined}
              aria-invalid={!!error}
              disabled={isPending}
              maxLength={500}
            />
            {error && (
              <p id={`${inputId}-error`} className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
