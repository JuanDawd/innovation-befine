"use client";

/**
 * Restructure a pedido — T120 (spec §3.4.17)
 *
 * RestructureDialog drafts the change; PendingRestructurePanel shows the draft,
 * and only an admin gets the buttons to approve or reject it.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, ShuffleIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useToast } from "@/hooks/use-toast";
import { notifyDataChanged } from "@/lib/data-events";
import {
  approveRestructure,
  getRestructureEditor,
  rejectRestructure,
  requestRestructure,
  type PendingRestructure,
  type RestructureEditorCell,
} from "../restructure-actions";

type Draft = { newQuantity: string; toStock: string; toScrap: string; pendingAction: string };

const toInt = (v: string) => (v === "" ? 0 : Number(v));

export function RestructureDialog({ pedidoId, version }: { pedidoId: string; version: number }) {
  const t = useTranslations("pedidos.restructure");
  const tc = useTranslations("common");
  const uid = useId();
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [cells, setCells] = useState<RestructureEditorCell[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function start() {
    setError(null);
    setReason("");
    setOpen(true);
    startTransition(async () => {
      const res = await getRestructureEditor(pedidoId);
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setCells(res.data);
      setDrafts(
        Object.fromEntries(
          res.data.map((c) => [
            c.cellId,
            { newQuantity: String(c.ordered), toStock: "0", toScrap: "0", pendingAction: "" },
          ]),
        ),
      );
    });
  }

  const set = (cellId: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [cellId]: { ...d[cellId]!, ...patch } }));

  const changed = cells.filter((c) => {
    const d = drafts[c.cellId];
    return (
      d &&
      (toInt(d.newQuantity) !== c.ordered ||
        toInt(d.toStock) > 0 ||
        toInt(d.toScrap) > 0 ||
        d.pendingAction !== "")
    );
  });

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await requestRestructure(pedidoId, {
        version,
        reason,
        cells: changed.map((c) => {
          const d = drafts[c.cellId]!;
          return {
            cellId: c.cellId,
            newQuantity: toInt(d.newQuantity),
            toStock: toInt(d.toStock),
            toScrap: toInt(d.toScrap),
            pendingAction: d.pendingAction || undefined,
          };
        }),
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setOpen(false);
      showToast("success", t("requested"));
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" onClick={start}>
        <ShuffleIcon className="size-4" aria-hidden="true" />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {cells.map((c) => {
              const d = drafts[c.cellId];
              if (!d) return null;
              return (
                <fieldset key={c.cellId} className="space-y-3 rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-semibold">
                    {c.garment} · {c.label}
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    {t("cellState", {
                      ordered: c.ordered,
                      approved: c.approved,
                      delivered: c.delivered,
                      pending: c.pending,
                    })}
                  </p>
                  {c.inRework > 0 && (
                    <p className="text-sm text-destructive">{t("inRework", { n: c.inRework })}</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(["newQuantity", "toStock", "toScrap"] as const).map((field) => (
                      <div key={field} className="space-y-1">
                        <label
                          htmlFor={`${uid}-${c.cellId}-${field}`}
                          className="text-sm font-medium"
                        >
                          {t(field)}
                        </label>
                        <Input
                          id={`${uid}-${c.cellId}-${field}`}
                          type="number"
                          inputMode="numeric"
                          min={field === "newQuantity" ? 1 : 0}
                          value={d[field]}
                          onChange={(e) => set(c.cellId, { [field]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                  {c.pending > 0 && (
                    <div className="space-y-1">
                      <label htmlFor={`${uid}-${c.cellId}-pending`} className="text-sm font-medium">
                        {t("pendingLabel", { n: c.pending })}
                      </label>
                      <NativeSelect
                        id={`${uid}-${c.cellId}-pending`}
                        value={d.pendingAction}
                        onChange={(e) => set(c.cellId, { pendingAction: e.target.value })}
                      >
                        <option value="">{t("pendingChoose")}</option>
                        <option value="approve">{t("pendingApprove")}</option>
                        <option value="reject">{t("pendingReject")}</option>
                      </NativeSelect>
                    </div>
                  )}
                </fieldset>
              );
            })}
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-reason`} className="text-sm font-medium">
                {t("reason")}
              </label>
              <textarea
                id={`${uid}-reason`}
                value={reason}
                maxLength={300}
                rows={2}
                onChange={(e) => setReason(e.target.value)}
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{tc("back")}</DialogClose>
            <Button
              onClick={submit}
              disabled={isPending || changed.length === 0 || reason.trim().length < 3}
            >
              {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PendingRestructurePanel({
  draft,
  version,
  canApprove,
}: {
  draft: PendingRestructure;
  version: number;
  canApprove: boolean;
}) {
  const t = useTranslations("pedidos.restructure");
  const uid = useId();
  const router = useRouter();
  const { showToast } = useToast();
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => ReturnType<typeof approveRestructure>, done: string) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      showToast("success", done);
      notifyDataChanged("pedidos");
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className="space-y-3 rounded-xl border border-status-attention-foreground/30 bg-status-attention/40 p-4"
    >
      <h2 id={`${uid}-title`} className="text-lg font-semibold">
        {t("pendingTitle")}
      </h2>
      <p className="text-sm">
        {t("pendingBy", { name: draft.requestedByName ?? "—", reason: draft.reason })}
      </p>
      <ul className="space-y-1 text-sm">
        {draft.cells.map((c) => (
          <li key={c.cellId}>
            {c.garment} · {c.label}:{" "}
            {t("pendingCell", {
              ordered: c.ordered,
              newQuantity: c.newQuantity,
              toStock: c.toStock,
              toScrap: c.toScrap,
            })}
            {c.pendingAction === "approve" && ` · ${t("pendingApprove")}`}
            {c.pendingAction === "reject" && ` · ${t("pendingReject")}`}
          </li>
        ))}
      </ul>
      {canApprove ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <label htmlFor={`${uid}-reject`} className="text-sm font-medium">
              {t("rejectReason")}
            </label>
            <Input
              id={`${uid}-reject`}
              value={rejectReason}
              maxLength={300}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending}
              onClick={() => run(() => approveRestructure(draft.id, { version }), t("approved"))}
            >
              {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
              {t("approve")}
            </Button>
            <Button
              variant="outline"
              disabled={isPending || rejectReason.trim().length < 3}
              onClick={() =>
                run(() => rejectRestructure(draft.id, { reason: rejectReason }), t("rejected"))
              }
            >
              {t("reject")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("waitingAdmin")}</p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
