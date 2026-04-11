"use client";

/**
 * CatalogTabs — T024, T027
 *
 * Tab switcher for Services / Cloth pieces catalog sections.
 */

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function CatalogTabs({
  services,
  clothPieces,
}: {
  services: ReactNode;
  clothPieces: ReactNode;
}) {
  const t = useTranslations("catalog");
  const [tab, setTab] = useState<"services" | "clothPieces">("services");

  const tabs = [
    { id: "services" as const, label: t("servicesTab") },
    { id: "clothPieces" as const, label: t("clothPiecesTab") },
  ];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label={t("pageTitle")}
        className="flex gap-1 rounded-xl bg-muted p-1 w-fit"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">{tab === "services" ? services : clothPieces}</div>
    </div>
  );
}
