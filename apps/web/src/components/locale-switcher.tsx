"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { GlobeIcon } from "lucide-react";
import { type Locale, locales } from "@/i18n/config";

const localeLabels: Record<Locale, string> = {
  es: "ES",
  en: "EN",
};

export function LocaleSwitcher() {
  const currentLocale = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  function switchLocale(nextLocale: Locale) {
    startTransition(() => {
      document.cookie = `locale=${nextLocale};path=/;max-age=31536000`;
      window.location.reload();
    });
  }

  return (
    <div className="flex items-center gap-1">
      <GlobeIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      {locales.map((locale) => (
        <Button
          key={locale}
          variant={locale === currentLocale ? "secondary" : "ghost"}
          size="xs"
          onClick={() => switchLocale(locale)}
          disabled={isPending || locale === currentLocale}
          aria-label={`Switch to ${locale === "es" ? "Spanish" : "English"}`}
        >
          {localeLabels[locale]}
        </Button>
      ))}
    </div>
  );
}
