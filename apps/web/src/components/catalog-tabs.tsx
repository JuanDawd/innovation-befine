"use client";

/**
 * CatalogTabs — T024, T027
 *
 * Tab switcher for Services / Cloth pieces / Sizes and colours (T110) catalog sections.
 */

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { oneOf, useSearchParamState } from "@/hooks/use-search-param-state";

const CATALOG_TABS = ["services", "clothPieces", "garments", "details"] as const;

export function CatalogTabs({
  services,
  clothPieces,
  garments,
  details,
}: {
  services: ReactNode;
  clothPieces: ReactNode;
  garments: ReactNode;
  details: ReactNode;
}) {
  const t = useTranslations("catalog");
  const [tab, setTab] = useSearchParamState("tab", "services", oneOf(CATALOG_TABS));

  const tabs = [
    { id: "services" as const, label: t("servicesTab") },
    { id: "clothPieces" as const, label: t("clothPiecesTab") },
    { id: "garments" as const, label: t("garmentsTab") },
    { id: "details" as const, label: t("detailsTab") },
  ];
  const panels = { services, clothPieces, garments, details };

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={t("pageTitle")}
        className="flex max-w-full flex-wrap gap-1 rounded-xl bg-muted p-1 w-fit"
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

      <div role="tabpanel">{panels[tab]}</div>
    </div>
  );
}
