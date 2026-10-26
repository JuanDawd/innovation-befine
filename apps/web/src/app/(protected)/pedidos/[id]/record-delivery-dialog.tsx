"use client";

/**
 * Registrar entrega — T121 (spec §3.3.15)
 *
 * Units per size, only from approved units not yet delivered. Prefilled with
 * everything deliverable, so a small pedido is open → confirm.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, PackageCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { recordDelivery } from "../actions";

export type DeliverableLine = {
  id: string;
  title: string;
  cells: { id: string; label: string; ready: number }[];
};

function todayInBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function RecordDeliveryDialog({
  pedidoId,
  lines,
}: {
  pedidoId: string;
  lines: DeliverableLine[];
}) {
  const t = useTranslations("pedidos.delivery");
  const tc = useTranslations("common");
  const uid = useId();
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [isPending, startTransition] = useTransition();

  const allCells = lines.flatMap((l) => l.cells);
  const total = allCells.reduce((n, c) => n + (Number(qty[c.id]) || 0), 0);
  const over = allCells.find((c) => (Number(qty[c.id]) || 0) > c.ready);

  function openDialog() {
    setQty(Object.fromEntries(allCells.map((c) => [c.id, String(c.ready)])));
    setDate(todayInBogota());
    setNote("");
    setError(null);
    // One key per attempt: a double tap on "Registrar" records one delivery.
    setKey(crypto.randomUUID());
    setOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordDelivery(pedidoId, {
        idempotencyKey: key,
        deliveredOn: date || undefined,
        note,
        cells: allCells.map((c) => ({ cellId: c.id, quantity: Number(qty[c.id]) || 0 })),
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setOpen(false);
      showToast("success", t("done", { count: res.data.units }));
      notifyDataChanged("pedidos");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={openDialog}>
        <PackageCheckIcon className="size-4" aria-hidden="true" />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {lines.map((line) => (
              <fieldset key={line.id} className="space-y-2">
                <legend className="text-sm font-medium">{line.title}</legend>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {line.cells.map((c) => (
                    <div key={c.id} className="space-y-1">
                      <label
                        htmlFor={`${uid}-${c.id}`}
                        className="block text-center text-xs font-medium text-muted-foreground"
                      >
                        {c.label}
                      </label>
                      <Input
                        id={`${uid}-${c.id}`}
                        inputMode="numeric"
                        value={qty[c.id] ?? ""}
                        onChange={(e) =>
                          setQty((q) => ({
                            ...q,
                            [c.id]: e.target.value.replace(/\D/g, "").slice(0, 5),
                          }))
                        }
                        aria-invalid={(Number(qty[c.id]) || 0) > c.ready}
                        aria-describedby={`${uid}-${c.id}-ready`}
                        className="text-center font-mono tabular-nums"
                      />
                      <p
                        id={`${uid}-${c.id}-ready`}
                        className="text-center text-[0.6875rem] text-muted-foreground"
                      >
                        {t("ready", { n: c.ready })}
                      </p>
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-date`} className="text-sm font-medium">
                  {t("date")}
                </label>
                <Input
                  id={`${uid}-date`}
                  type="date"
                  value={date}
                  max={todayInBogota()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-note`} className="text-sm font-medium">
                  {t("note")} <span className="text-muted-foreground">{tc("optional")}</span>
                </label>
                <Input
                  id={`${uid}-note`}
                  value={note}
                  maxLength={300}
                  placeholder={t("notePlaceholder")}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>
            {over && (
              <p className="text-sm text-destructive" role="alert">
                {t("tooMany", { size: over.label, n: over.ready })}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
            <Button onClick={submit} disabled={isPending || total === 0 || !!over}>
              {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {t("confirm", { count: total })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
