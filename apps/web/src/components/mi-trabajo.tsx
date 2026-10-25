"use client";

/**
 * Mi trabajo — T123 (spec §3.2, §3.10)
 *
 * The clothier's phone screen, one-handed: Correcciones first, then her work
 * by delivery date, then Disponibles to take. Every action opens a bottom
 * sheet with a big −/+ stepper. Her pay rate is shown; client prices never.
 * Reports made offline are queued and sent when the phone reconnects.
 */

import { useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  Loader2Icon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  WrenchIcon,
} from "lucide-react";
import type { AvailableItem, WorkItem } from "@befine/db";
import { formatPedidoNumber } from "@befine/db/pedido-totals";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchQuery } from "@/lib/action-query";
import { queryKeys } from "@/lib/query-keys";
import { notifyDataChanged } from "@/lib/data-events";
import { enqueue } from "@/lib/mutation-queue";
import { newUuid } from "@/lib/uuid";
import { formatMoney } from "@/i18n";
import { cn } from "@/lib/utils";
import { claimUnits, releaseMyUnits, reportUnits } from "@/app/(protected)/clothier/work-actions";

type Mode =
  | { kind: "report"; item: WorkItem }
  | { kind: "release"; item: WorkItem }
  | { kind: "claim"; item: AvailableItem; max: number };

function isNetworkError(err: unknown) {
  return err instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function DeliveryFlag({ flag }: { flag: WorkItem["deliveryFlag"] }) {
  const t = useTranslations("miTrabajo");
  if (flag === "overdue")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
        <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
        {t("overdue")}
      </span>
    );
  if (flag === "today")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-attention-foreground">
        <CalendarClockIcon className="size-3.5" aria-hidden="true" />
        {t("today")}
      </span>
    );
  return null;
}

function Specs({ item }: { item: Pick<WorkItem, "color" | "style" | "instructions"> }) {
  const parts = [item.color, item.style].filter(Boolean);
  return (
    <>
      {parts.length > 0 && <p className="text-sm text-muted-foreground">{parts.join(" · ")}</p>}
      {item.instructions && (
        <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-sm">
          {item.instructions}
        </p>
      )}
    </>
  );
}

function WorkCard({
  item,
  correction,
  dayOpen,
  onReport,
  onRelease,
}: {
  item: WorkItem;
  correction: boolean;
  dayOpen: boolean;
  onReport: () => void;
  onRelease: () => void;
}) {
  const t = useTranslations("miTrabajo");
  const p = item.progress;
  return (
    <li
      className={cn(
        "space-y-3 rounded-2xl border bg-card p-4",
        correction && "border-status-attention-foreground/40 bg-status-attention/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{item.garment}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{formatPedidoNumber(item.pedidoNumber)}</span>
            <DeliveryFlag flag={item.deliveryFlag} />
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">{t("size")}</p>
          <p className="font-mono text-2xl font-semibold leading-none">{item.sizeLabel}</p>
        </div>
      </div>
      <Specs item={item} />
      {item.specChange && (
        <p className="rounded-lg border border-status-attention-foreground/30 bg-status-attention/40 px-3 py-2 text-sm">
          {t("changed", { summary: item.specChange.summary, reason: item.specChange.reason })}
        </p>
      )}
      {correction && item.returnReason && (
        <p className="flex items-start gap-2 text-sm font-medium">
          <WrenchIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("returnReason", { reason: item.returnReason })}
        </p>
      )}
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>
          {correction ? t("toRedo", { n: p.inRework }) : t("toDo", { n: item.toDo, total: p.live })}
          {p.pendingReview > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · {t("inReview", { n: p.pendingReview })}
            </span>
          )}
        </span>
        <span className="font-mono tabular-nums">
          {formatMoney(item.pieceRate)}{" "}
          <span className="text-xs text-muted-foreground">{t("each")}</span>
        </span>
      </div>
      {item.rateReason && (
        <p className="text-xs text-muted-foreground">
          {t("specialRate", { reason: item.rateReason })}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="h-12 flex-1 text-base" onClick={onReport} disabled={!dayOpen}>
          <CheckCircle2Icon className="size-5" aria-hidden="true" />
          {t("report")}
        </Button>
        {item.canRelease && (
          <Button variant="outline" className="h-12" onClick={onRelease}>
            <RotateCcwIcon className="size-4" aria-hidden="true" />
            {t("release")}
          </Button>
        )}
      </div>
    </li>
  );
}

function AvailableCard({
  item,
  room,
  onClaim,
}: {
  item: AvailableItem;
  room: number;
  onClaim: () => void;
}) {
  const t = useTranslations("miTrabajo");
  return (
    <li className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{item.garment}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{formatPedidoNumber(item.pedidoNumber)}</span>
            {item.destination === "inventory" && <span>{t("forStock")}</span>}
            <DeliveryFlag flag={item.deliveryFlag} />
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">{t("size")}</p>
          <p className="font-mono text-2xl font-semibold leading-none">{item.sizeLabel}</p>
        </div>
      </div>
      <Specs item={item} />
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{t("available", { n: item.unassigned })}</span>
        <span className="font-mono tabular-nums">
          {formatMoney(item.pieceRate)}{" "}
          <span className="text-xs text-muted-foreground">{t("each")}</span>
        </span>
      </div>
      <Button
        variant="outline"
        className="h-12 w-full text-base"
        onClick={onClaim}
        disabled={room < 1}
      >
        <PlusIcon className="size-5" aria-hidden="true" />
        {t("claim")}
      </Button>
    </li>
  );
}

function Section({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold">
        {title}
        <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

// ─── Quantity sheet ──────────────────────────────────────────────────────────

function QuantitySheet({ mode, onClose }: { mode: Mode | null; onClose: () => void }) {
  const t = useTranslations("miTrabajo");
  const tc = useTranslations("common");
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [openedFor, setOpenedFor] = useState<Mode | null>(null);

  const max =
    mode?.kind === "report"
      ? mode.item.toDo
      : mode?.kind === "release"
        ? mode.item.progress.unstarted
        : (mode?.max ?? 1);
  // Reset when a new action opens (render-time sync, no effect needed).
  if (mode !== openedFor) {
    setOpenedFor(mode);
    setQty(mode?.kind === "claim" ? Math.min(max, mode.item.unassigned) : max);
    setError(null);
  }

  const rate = mode?.item.pieceRate ?? 0;
  const title =
    mode?.kind === "report"
      ? t("reportTitle")
      : mode?.kind === "release"
        ? t("releaseTitle")
        : t("claimTitle");

  function submit() {
    if (!mode) return;
    setError(null);
    startTransition(async () => {
      try {
        if (mode.kind === "report") {
          const payload = {
            assignmentId: mode.item.assignmentId,
            quantity: qty,
            idempotencyKey: newUuid(),
          };
          if (!navigator.onLine) {
            await enqueue({
              id: payload.idempotencyKey,
              type: "reportUnits",
              payload,
              createdAt: Date.now(),
            });
            toast.info(t("queued", { n: qty }));
            onClose();
            return;
          }
          try {
            const res = await reportUnits(payload);
            if (!res.success) return setError(res.error.message);
            toast.success(t("reported", { n: qty }));
          } catch (err) {
            if (!isNetworkError(err)) throw err;
            await enqueue({
              id: payload.idempotencyKey,
              type: "reportUnits",
              payload,
              createdAt: Date.now(),
            });
            toast.info(t("queued", { n: qty }));
          }
        } else if (mode.kind === "release") {
          const res = await releaseMyUnits(mode.item.assignmentId, {
            version: mode.item.version,
            quantity: qty,
          });
          if (!res.success) return setError(res.error.message);
          toast.success(t("released", { n: qty }));
        } else {
          const res = await claimUnits({
            cellId: mode.item.cellId,
            quantity: qty,
            expectedUnassigned: mode.item.unassigned,
          });
          if (!res.success) {
            if (res.error.code === "STALE_DATA") notifyDataChanged("pedidos");
            return setError(res.error.message);
          }
          toast.success(t("claimed", { n: qty }));
        }
        notifyDataChanged("pedidos");
        onClose();
      } catch (err) {
        setError(isNetworkError(err) ? t("offline") : t("error"));
      }
    });
  }

  return (
    <Sheet open={mode !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {mode && (
            <SheetDescription>
              {mode.item.garment} · {t("size")} {mode.item.sizeLabel} ·{" "}
              {formatPedidoNumber(mode.item.pedidoNumber)}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div
            className="flex items-center justify-center gap-6"
            role="group"
            aria-label={t("quantity")}
          >
            <Button
              variant="outline"
              className="size-16 rounded-full"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label={t("less")}
            >
              <MinusIcon className="size-6" aria-hidden="true" />
            </Button>
            <output
              className="w-20 text-center font-mono text-5xl font-semibold tabular-nums"
              aria-live="polite"
            >
              {qty}
            </output>
            <Button
              variant="outline"
              className="size-16 rounded-full"
              onClick={() => setQty((q) => Math.min(max, q + 1))}
              disabled={qty >= max}
              aria-label={t("more")}
            >
              <PlusIcon className="size-6" aria-hidden="true" />
            </Button>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {mode?.kind === "release"
              ? t("releaseHint", { max })
              : t("earnings", { total: formatMoney(rate * qty), max })}
          </p>
          {error && (
            <p className="text-center text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <SheetFooter className="flex-row gap-2 px-4">
          <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button className="h-12 flex-[2] text-base" onClick={submit} disabled={isPending}>
            {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
            {mode?.kind === "report"
              ? t("confirmReport", { n: qty })
              : mode?.kind === "release"
                ? t("confirmRelease", { n: qty })
                : t("confirmClaim", { n: qty })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function MiTrabajo() {
  const t = useTranslations("miTrabajo");
  const [mode, setMode] = useState<Mode | null>(null);
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.pedidos.myWork,
    queryFn: () => fetchQuery("myWork"),
    refetchInterval: 30_000,
  });

  if (isPending)
    return (
      <div className="space-y-3 px-4 pt-2" aria-busy="true">
        <Skeleton className="h-5 w-48" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  if (isError || !data) return <p className="px-4 text-sm text-destructive">{t("loadError")}</p>;

  const room = Math.max(data.claimLimit - data.held, 0);
  const toDo = [...data.corrections, ...data.work].reduce((n, i) => n + i.toDo, 0);
  const nothing = !data.corrections.length && !data.work.length && !data.available.length;

  return (
    <div className="space-y-6 px-4 pb-8">
      <p className="text-sm text-muted-foreground">
        {t("summary", { toDo, review: data.pendingReview })}
      </p>
      {!data.dayOpen && (
        <p className="rounded-xl border border-status-attention-foreground/30 bg-status-attention/40 p-3 text-sm">
          {t("dayClosed")}
        </p>
      )}
      {nothing && (
        <EmptyState
          icon={CheckCircle2Icon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      )}
      {data.corrections.length > 0 && (
        <Section id="mt-corrections" title={t("corrections")} count={data.corrections.length}>
          {data.corrections.map((item) => (
            <WorkCard
              key={item.assignmentId}
              item={item}
              correction
              dayOpen={data.dayOpen}
              onReport={() => setMode({ kind: "report", item })}
              onRelease={() => setMode({ kind: "release", item })}
            />
          ))}
        </Section>
      )}
      {data.work.length > 0 && (
        <Section id="mt-work" title={t("myWork")} count={data.work.length}>
          {data.work.map((item) => (
            <WorkCard
              key={item.assignmentId}
              item={item}
              correction={false}
              dayOpen={data.dayOpen}
              onReport={() => setMode({ kind: "report", item })}
              onRelease={() => setMode({ kind: "release", item })}
            />
          ))}
        </Section>
      )}
      {data.available.length > 0 && (
        <Section id="mt-available" title={t("availableTitle")} count={data.available.length}>
          <li className="text-sm text-muted-foreground">
            {room > 0 ? t("room", { n: room }) : t("noRoom", { limit: data.claimLimit })}
          </li>
          {data.available.map((item) => (
            <AvailableCard
              key={item.cellId}
              item={item}
              room={room}
              onClaim={() => setMode({ kind: "claim", item, max: Math.min(room, item.unassigned) })}
            />
          ))}
        </Section>
      )}
      <QuantitySheet mode={mode} onClose={() => setMode(null)} />
    </div>
  );
}
