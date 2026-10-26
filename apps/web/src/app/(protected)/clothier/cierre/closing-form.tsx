"use client";

/**
 * Cerrar mi jornada — T125 (spec §3.2.11)
 *
 * "¿Cuántas terminaste hoy?" per assignment, prefilled with today's reports.
 * A day with 0 units must be confirmed. After approval the numbers are
 * read-only and show any correction staff made.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2Icon, Loader2Icon, MinusIcon, PlusIcon } from "lucide-react";
import type { ClosingLine } from "@befine/db";
import { formatPedidoNumber } from "@befine/db/pedido-totals";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { newUuid } from "@/lib/uuid";
import { notifyDataChanged } from "@/lib/data-events";
import { submitMyClosing, type MyClosing } from "../work-actions";

export function ClosingForm({ data }: { data: MyClosing }) {
  const t = useTranslations("cierre");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmZero, setConfirmZero] = useState(false);
  const previous = new Map(
    (data.closing?.lines ?? []).map((l) => [l.assignmentId, l.corrected ?? l.submitted]),
  );
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      data.lines.map((l) => [l.assignmentId, previous.get(l.assignmentId) ?? l.reportedToday]),
    ),
  );

  if (!data.dayOpen)
    return <p className="rounded-xl border bg-status-attention/40 p-4 text-sm">{t("dayClosed")}</p>;

  const approved = !!data.closing?.approvedAt;
  if (approved && data.closing)
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 rounded-xl border border-status-success-foreground/30 bg-status-success/40 p-4 text-sm font-medium">
          <CheckCircle2Icon className="size-5" aria-hidden="true" />
          {t("approved", { name: data.closing.approvedByName ?? "" })}
        </p>
        {data.closing.correctionReason && (
          <p className="text-sm">
            {t("correctedReason", { reason: data.closing.correctionReason })}
          </p>
        )}
        <ul className="divide-y rounded-2xl border bg-card">
          {data.closing.lines.map((l) => (
            <li
              key={l.assignmentId}
              className="flex items-center justify-between gap-3 p-4 text-sm"
            >
              <span>
                <span className="font-medium">{l.garment}</span>
                <span className="block text-muted-foreground">
                  {t("size")} {l.size} · {formatPedidoNumber(l.pedidoNumber)}
                </span>
              </span>
              <span className="text-right font-mono text-lg tabular-nums">
                {l.corrected !== null ? (
                  <>
                    <s className="text-sm text-muted-foreground">{l.submitted}</s> {l.corrected}
                  </>
                ) : (
                  l.submitted
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  const set = (line: ClosingLine, next: number) =>
    setCounts((c) => ({
      ...c,
      [line.assignmentId]: Math.max(0, Math.min(next, line.reportedToday + line.toDo)),
    }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitMyClosing({
        lines: data.lines.map((l) => ({
          assignmentId: l.assignmentId,
          finished: counts[l.assignmentId] ?? 0,
        })),
        confirmZero: total === 0 ? confirmZero : undefined,
        idempotencyKey: newUuid(),
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      toast.success(t("sent", { n: res.data.units }));
      notifyDataChanged("pedidos");
      router.push("/clothier");
    });
  }

  return (
    <div className="space-y-4">
      {data.closing && <p className="text-sm text-muted-foreground">{t("waitingApproval")}</p>}
      {data.lines.length === 0 ? (
        <EmptyState
          icon={CheckCircle2Icon}
          title={t("noWorkTitle")}
          description={t("noWorkDescription")}
        />
      ) : (
        <ul className="space-y-3">
          {data.lines.map((line) => {
            const value = counts[line.assignmentId] ?? 0;
            return (
              <li key={line.assignmentId} className="space-y-3 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{line.garment}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPedidoNumber(line.pedidoNumber)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{t("size")}</p>
                    <p className="font-mono text-2xl font-semibold leading-none">{line.size}</p>
                  </div>
                </div>
                <p className="text-sm" id={`q-${line.assignmentId}`}>
                  {t("question")}
                </p>
                <div
                  className="flex items-center justify-center gap-6"
                  role="group"
                  aria-labelledby={`q-${line.assignmentId}`}
                >
                  <Button
                    variant="outline"
                    className="size-14 rounded-full"
                    onClick={() => set(line, value - 1)}
                    disabled={value <= 0}
                    aria-label={t("less")}
                  >
                    <MinusIcon className="size-6" aria-hidden="true" />
                  </Button>
                  <output
                    className="w-16 text-center font-mono text-4xl font-semibold tabular-nums"
                    aria-live="polite"
                  >
                    {value}
                  </output>
                  <Button
                    variant="outline"
                    className="size-14 rounded-full"
                    onClick={() => set(line, value + 1)}
                    disabled={value >= line.reportedToday + line.toDo}
                    aria-label={t("more")}
                  >
                    <PlusIcon className="size-6" aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {t("hint", { reported: line.reportedToday, left: line.toDo })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {total === 0 && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm">
          <input
            type="checkbox"
            checked={confirmZero}
            onChange={(e) => setConfirmZero(e.target.checked)}
            className="size-5"
          />
          {t("confirmZero")}
        </label>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        className="h-14 w-full text-base"
        onClick={submit}
        disabled={isPending || (total === 0 && !confirmZero)}
      >
        {isPending && <Loader2Icon className="size-5 animate-spin" aria-hidden="true" />}
        {data.closing ? t("resend", { n: total }) : t("send", { n: total })}
      </Button>
    </div>
  );
}
