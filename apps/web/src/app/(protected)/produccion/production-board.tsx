"use client";

/**
 * Producción board — T124 (spec §3.10)
 *
 * Por revisar: reported units grouped by clothier. One tap approves all of
 * an item; "Revisar" splits it into approve / return for rework / scrap,
 * with a defect reason for anything not approved.
 * Sin asignar: sizes nobody holds yet, linking to the pedido to assign them.
 * (Cierres de jornada join this screen with T125.)
 */

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckIcon, ClipboardCheckIcon, Loader2Icon, PackageOpenIcon } from "lucide-react";
import type { ReviewItem } from "@befine/db";
import { formatPedidoNumber } from "@befine/db/pedido-totals";
import { DEFECT_CODES, DEFECT_LABELS, type DefectCode } from "@befine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchQuery } from "@/lib/action-query";
import { queryKeys } from "@/lib/query-keys";
import { notifyDataChanged } from "@/lib/data-events";
import { newUuid } from "@/lib/uuid";
import { oneOf, useSearchParamState } from "@/hooks/use-search-param-state";
import { cn } from "@/lib/utils";
import { reviewUnits } from "./actions";

const TABS = ["revisar", "sin-asignar"] as const;

function since(date: Date | string) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(date));
}

// ─── Review dialog ───────────────────────────────────────────────────────────

function ReviewDialog({
  item,
  clothierName,
  onClose,
}: {
  item: ReviewItem | null;
  clothierName: string;
  onClose: () => void;
}) {
  const t = useTranslations("produccion.review");
  const tc = useTranslations("common");
  const uid = useId();
  const [approved, setApproved] = useState("");
  const [returned, setReturned] = useState("");
  const [scrapped, setScrapped] = useState("");
  const [returnCode, setReturnCode] = useState<DefectCode | "">("");
  const [returnNote, setReturnNote] = useState("");
  const [scrapCode, setScrapCode] = useState<DefectCode | "">("");
  const [scrapNote, setScrapNote] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<ReviewItem | null>(null);
  const [isPending, startTransition] = useTransition();

  if (item !== openedFor) {
    setOpenedFor(item);
    setApproved(item ? String(item.pending) : "");
    setReturned("");
    setScrapped("");
    setReturnCode("");
    setReturnNote("");
    setScrapCode("");
    setScrapNote("");
    setError(null);
    setKey(newUuid());
  }

  const a = Number(approved) || 0;
  const r = Number(returned) || 0;
  const sc = Number(scrapped) || 0;
  const total = a + r + sc;
  const pending = item?.pending ?? 0;
  const problem =
    total < 1
      ? t("atLeastOne")
      : total > pending
        ? t("tooMany", { n: pending })
        : r > 0 && !returnCode
          ? t("returnCodeRequired")
          : r > 0 && returnCode === "otro" && !returnNote.trim()
            ? t("noteRequired")
            : sc > 0 && !scrapCode
              ? t("scrapCodeRequired")
              : sc > 0 && scrapCode === "otro" && !scrapNote.trim()
                ? t("noteRequired")
                : null;

  function submit() {
    if (!item || problem) return;
    setError(null);
    startTransition(async () => {
      const res = await reviewUnits(item.assignmentId, {
        expectedPending: item.pending,
        approved: a,
        returned: r,
        scrapped: sc,
        returnCode: r > 0 ? returnCode || undefined : undefined,
        returnNote: r > 0 ? returnNote : undefined,
        scrapCode: sc > 0 ? scrapCode || undefined : undefined,
        scrapNote: sc > 0 ? scrapNote : undefined,
        idempotencyKey: key,
      });
      if (!res.success) {
        setError(res.error.message);
        if (res.error.code === "STALE_DATA") notifyDataChanged("pedidos");
        return;
      }
      toast.success(t("done", { n: total }));
      notifyDataChanged("pedidos");
      onClose();
    });
  }

  const numberField = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1.5">
      <label htmlFor={`${uid}-${id}`} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={`${uid}-${id}`}
        inputMode="numeric"
        value={value}
        placeholder="0"
        onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 5))}
        className="text-center font-mono text-lg tabular-nums"
      />
    </div>
  );

  const reasonFields = (
    kind: "return" | "scrap",
    code: DefectCode | "",
    setCode: (c: DefectCode | "") => void,
    note: string,
    setNote: (n: string) => void,
  ) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-${kind}-code`} className="text-sm font-medium">
          {kind === "return" ? t("returnReason") : t("scrapReason")}
        </label>
        <NativeSelect
          id={`${uid}-${kind}-code`}
          value={code}
          onChange={(e) => setCode(e.target.value as DefectCode | "")}
          className="w-full"
        >
          <option value="">{t("chooseReason")}</option>
          {DEFECT_CODES.map((c) => (
            <option key={c} value={c}>
              {DEFECT_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${uid}-${kind}-note`} className="text-sm font-medium">
          {t("note")}{" "}
          {code !== "otro" && <span className="text-muted-foreground">{tc("optional")}</span>}
        </label>
        <Input
          id={`${uid}-${kind}-note`}
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          {item && (
            <DialogDescription>
              {clothierName} · {item.garment} · {t("size")} {item.sizeLabel} ·{" "}
              {formatPedidoNumber(item.pedidoNumber)} · {t("pending", { n: item.pending })}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {numberField("approved", t("approve"), approved, setApproved)}
            {numberField("returned", t("return"), returned, setReturned)}
            {numberField("scrapped", t("scrap"), scrapped, setScrapped)}
          </div>
          {r > 0 && reasonFields("return", returnCode, setReturnCode, returnNote, setReturnNote)}
          {sc > 0 && reasonFields("scrap", scrapCode, setScrapCode, scrapNote, setScrapNote)}
          <p className={cn("text-sm", problem ? "text-destructive" : "text-muted-foreground")}>
            {problem ?? t("summary", { total, pending })}
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tc("cancel")}</DialogClose>
          <Button onClick={submit} disabled={!!problem || isPending}>
            {isPending && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Queue ───────────────────────────────────────────────────────────────────

function QuickApprove({ item }: { item: ReviewItem }) {
  const t = useTranslations("produccion.review");
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      onClick={() =>
        startTransition(async () => {
          const res = await reviewUnits(item.assignmentId, {
            expectedPending: item.pending,
            approved: item.pending,
            returned: 0,
            scrapped: 0,
            idempotencyKey: newUuid(),
          });
          if (!res.success) {
            toast.error(res.error.message);
            if (res.error.code === "STALE_DATA") notifyDataChanged("pedidos");
            return;
          }
          toast.success(t("done", { n: item.pending }));
          notifyDataChanged("pedidos");
        })
      }
      disabled={isPending}
      aria-label={t("approveAllLabel", {
        n: item.pending,
        garment: item.garment,
        size: item.sizeLabel,
      })}
    >
      {isPending ? (
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <CheckIcon className="size-4" aria-hidden="true" />
      )}
      {t("approveAll", { n: item.pending })}
    </Button>
  );
}

export function ProductionBoard() {
  const t = useTranslations("produccion");
  const [tab, setTab] = useSearchParamState("tab", "revisar", oneOf(TABS));
  const [reviewing, setReviewing] = useState<{ item: ReviewItem; name: string } | null>(null);
  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.pedidos.productionBoard,
    queryFn: () => fetchQuery("productionBoard"),
    refetchInterval: 30_000,
  });

  const pendingTotal = data?.queue.reduce((n, g) => n + g.pending, 0) ?? 0;
  const tabs = [
    { id: "revisar" as const, label: t("tabs.review", { n: pendingTotal }) },
    {
      id: "sin-asignar" as const,
      label: t("tabs.unassigned", { n: data?.unassigned.length ?? 0 }),
    },
  ];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={t("pageTitle")}
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-muted p-1"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-destructive">{t("loadError")}</p>
      ) : tab === "revisar" ? (
        <div role="tabpanel" className="space-y-4">
          {!data.dayOpen && (
            <p className="rounded-xl border border-status-attention-foreground/30 bg-status-attention/40 p-3 text-sm">
              {t("dayClosed")}
            </p>
          )}
          {data.queue.length === 0 ? (
            <EmptyState
              icon={ClipboardCheckIcon}
              title={t("emptyReviewTitle")}
              description={t("emptyReviewDescription")}
            />
          ) : (
            data.queue.map((group) => (
              <section
                key={group.employeeId}
                aria-labelledby={`g-${group.employeeId}`}
                className="rounded-xl border bg-card"
              >
                <h2
                  id={`g-${group.employeeId}`}
                  className="flex items-baseline justify-between gap-2 border-b px-4 py-3 text-base font-semibold"
                >
                  {group.clothierName}
                  <span className="text-sm font-normal text-muted-foreground">
                    {t("review.pending", { n: group.pending })}
                  </span>
                </h2>
                <ul className="divide-y">
                  {group.items.map((item) => (
                    <li
                      key={item.assignmentId}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          {item.garment} · {t("review.size")} {item.sizeLabel}
                          {item.includesRework && (
                            <span className="ml-2 rounded-full bg-status-attention px-2 py-0.5 text-xs text-status-attention-foreground">
                              {t("review.rework")}
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground">
                          <Link
                            href={`/pedidos/${item.pedidoId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {formatPedidoNumber(item.pedidoNumber)}
                          </Link>
                          {item.color && ` · ${item.color}`}
                          {item.destination === "inventory" && ` · ${t("forStock")}`}
                          {" · "}
                          {t("review.since", { date: since(item.reportedAt) })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-semibold tabular-nums">
                          {item.pending}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReviewing({ item, name: group.clothierName })}
                          disabled={!data.dayOpen}
                        >
                          {t("review.open")}
                        </Button>
                        {data.dayOpen && <QuickApprove item={item} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : (
        <div role="tabpanel">
          {data.unassigned.length === 0 ? (
            <EmptyState
              icon={PackageOpenIcon}
              title={t("emptyUnassignedTitle")}
              description={t("emptyUnassignedDescription")}
            />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {data.unassigned.map((c) => (
                <li key={c.cellId}>
                  <Link
                    href={`/pedidos/${c.pedidoId}`}
                    className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">
                        {c.garment} · {t("review.size")} {c.sizeLabel}
                      </span>
                      <span className="block text-muted-foreground">
                        {formatPedidoNumber(c.pedidoNumber)}
                        {c.destination === "inventory" && ` · ${t("forStock")}`}
                        {c.estimatedDeliveryDate &&
                          ` · ${t("delivery", { date: c.estimatedDeliveryDate })}`}
                        {c.deliveryFlag === "overdue" && (
                          <span className="font-medium text-destructive"> · {t("overdue")}</span>
                        )}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums">
                      {t("unassignedUnits", { n: c.unassigned })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ReviewDialog
        item={reviewing?.item ?? null}
        clothierName={reviewing?.name ?? ""}
        onClose={() => setReviewing(null)}
      />
    </div>
  );
}
