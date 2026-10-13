"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
// Replaces the root layout, so neither its stylesheet nor NextIntlClientProvider
// apply here: import both directly. Messages are bundled statically (this chunk
// only loads when the root crashes) so the page never depends on a fetch.
import "./globals.css";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

const ERRORS: Record<Locale, typeof es.errors> = { es: es.errors, en: en.errors };

/** Same source as i18n/request.ts: the `locale` cookie, else the default. */
function currentLocale(): Locale {
  if (typeof document === "undefined") return defaultLocale;
  const value = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/)?.[1];
  return locales.includes(value as Locale) ? (value as Locale) : defaultLocale;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const locale = currentLocale();
  const t = ERRORS[locale];

  return (
    <html lang={locale}>
      <body className="flex min-h-screen items-center justify-center bg-background font-sans text-foreground">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold">{t.globalTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.globalDescription}</p>
          <button
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t.globalRetry}
          </button>
        </div>
      </body>
    </html>
  );
}
