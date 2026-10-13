"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** "Mostrar N más" footer for lists paged with useIncrementalList. */
export function ShowMore({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  const t = useTranslations("common");
  if (remaining <= 0) return null;
  return (
    <div className="flex justify-center pt-2">
      <Button variant="outline" size="sm" onClick={onClick}>
        {t("showMore", { count: remaining })}
      </Button>
    </div>
  );
}
