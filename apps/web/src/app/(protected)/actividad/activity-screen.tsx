"use client";

/**
 * Actividad — T132 (spec §3.9.28). Admin timeline with filters; 50 entries
 * per page (keyset), loaded on demand.
 */

import { useId, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlertTriangleIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ActivityTimeline } from "@/components/activity-timeline";
import { getActivityPage } from "./actions";

const CATEGORIES = [
  "money",
  "pedidos",
  "production",
  "stock",
  "tickets",
  "day",
  "people",
  "appointments",
  "catalog",
  "auth",
] as const;

type Filters = { actorUserId: string; category: string; from: string; to: string; record: string };
const EMPTY: Filters = { actorUserId: "", category: "", from: "", to: "", record: "" };

export function ActivityScreen({ people }: { people: { id: string; name: string }[] }) {
  const t = useTranslations("activity");
  const uid = useId();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const set = (k: keyof Filters) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  // Selects and dates apply at once; the text search applies on submit.
  const setNow = (k: keyof Filters) => (v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setApplied((a) => ({ ...a, [k]: v }));
  };

  const q = useInfiniteQuery({
    queryKey: ["activity", "timeline", applied],
    queryFn: async ({ pageParam }) => {
      const res = await getActivityPage({ ...applied, cursor: pageParam });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    initialPageParam: null as { createdAt: string; id: string } | null,
    getNextPageParam: (last) => last.next,
  });
  const filtered = Object.values(applied).some(Boolean);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(draft);
        }}
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_1.2fr_auto]"
      >
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-who`} className="text-sm font-medium">
            {t("filters.person")}
          </label>
          <NativeSelect
            id={`${uid}-who`}
            value={draft.actorUserId}
            onChange={(e) => setNow("actorUserId")(e.target.value)}
            className="w-full"
          >
            <option value="">{t("filters.anyone")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-cat`} className="text-sm font-medium">
            {t("filters.type")}
          </label>
          <NativeSelect
            id={`${uid}-cat`}
            value={draft.category}
            onChange={(e) => setNow("category")(e.target.value)}
            className="w-full"
          >
            <option value="">{t("filters.anyType")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-from`} className="text-sm font-medium">
            {t("filters.from")}
          </label>
          <Input
            id={`${uid}-from`}
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setNow("from")(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-to`} className="text-sm font-medium">
            {t("filters.to")}
          </label>
          <Input
            id={`${uid}-to`}
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setNow("to")(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-rec`} className="text-sm font-medium">
            {t("filters.record")}
          </label>
          <Input
            id={`${uid}-rec`}
            type="search"
            value={draft.record}
            maxLength={100}
            placeholder={t("filters.recordPlaceholder")}
            onChange={(e) => set("record")(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">{t("filters.search")}</Button>
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setApplied(EMPTY);
              }}
            >
              <XIcon className="size-4" aria-hidden="true" />
              {t("filters.clear")}
            </Button>
          )}
        </div>
      </form>

      <div aria-live="polite">
        {q.isPending ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </p>
        ) : q.isError ? (
          <p
            role="alert"
            className="flex items-center gap-2 py-6 text-sm text-status-negative-foreground"
          >
            <AlertTriangleIcon className="size-4" aria-hidden="true" />
            {q.error.message}
          </p>
        ) : (
          <div className="rounded-xl border bg-card px-4 py-2">
            <ActivityTimeline
              rows={q.data.pages.flatMap((p) => p.rows)}
              hasMore={q.hasNextPage}
              loadingMore={q.isFetchingNextPage}
              onLoadMore={() => void q.fetchNextPage()}
              emptyTitle={filtered ? t("noMatchesTitle") : undefined}
              emptyDescription={filtered ? t("noMatchesDescription") : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
