"use client";

/**
 * Historial of one record — T132 (spec §3.9.28)
 *
 * RecordHistory renders inline (pedido page, ticket dialog);
 * RecordHistoryButton opens it in a dialog (client and employee rows).
 * Loaded when shown, 30 entries at a time.
 */

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertTriangleIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActivityTimeline } from "@/components/activity-timeline";
import { getRecordHistory } from "@/app/(protected)/actividad/actions";

type RecordRef = { entityType: "pedido" | "ticket" | "client" | "employee"; entityId: string };

export function RecordHistory({ entityType, entityId }: RecordRef) {
  const t = useTranslations("activity");
  const q = useInfiniteQuery({
    queryKey: ["activity", "record", entityType, entityId],
    queryFn: async ({ pageParam }) => {
      const res = await getRecordHistory({ entityType, entityId, cursor: pageParam });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    initialPageParam: null as { createdAt: string; id: string } | null,
    getNextPageParam: (last) => last.next,
  });

  if (q.isPending)
    return (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        {t("loading")}
      </p>
    );
  if (q.isError)
    return (
      <p
        role="alert"
        className="flex items-center gap-2 py-4 text-sm text-status-negative-foreground"
      >
        <AlertTriangleIcon className="size-4" aria-hidden="true" />
        {q.error.message}
      </p>
    );
  return (
    <ActivityTimeline
      rows={q.data.pages.flatMap((p) => p.rows)}
      hasMore={q.hasNextPage}
      loadingMore={q.isFetchingNextPage}
      onLoadMore={() => void q.fetchNextPage()}
      showRecordLink={entityType === "client"}
      emptyTitle={t("historyEmptyTitle")}
      emptyDescription={t("historyEmptyDescription")}
    />
  );
}

export function RecordHistoryButton({ title, ...record }: RecordRef & { title: string }) {
  const t = useTranslations("activity");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={t("historyOf", { name: title })}
      >
        <HistoryIcon className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t("history")}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("history")}</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          {open && <RecordHistory {...record} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
