import { format, formatDistanceToNow, type Locale as DateLocale } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { BUSINESS_TIMEZONE, CURRENCY_CODE, type Locale } from "./config";

const dateLocales: Record<Locale, DateLocale> = {
  es,
  en: enUS,
};

/**
 * Format a monetary amount in COP (Colombian Pesos).
 * COP has no cents — values are whole pesos.
 * Output: "$12.500" (Spanish) or "$12,500" (English)
 */
export function formatMoney(pesos: number, locale: Locale = "es"): string {
  return new Intl.NumberFormat(locale === "es" ? "es-CO" : "en-US", {
    style: "currency",
    currency: CURRENCY_CODE,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pesos);
}

/**
 * Format a date in the business timezone.
 * Default pattern: DD/MM/YYYY for Spanish, MM/DD/YYYY for English.
 */
export function formatDate(date: Date | string, locale: Locale = "es", pattern?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(d, BUSINESS_TIMEZONE);
  const datePattern = pattern ?? (locale === "es" ? "dd/MM/yyyy" : "MM/dd/yyyy");
  return format(zonedDate, datePattern, { locale: dateLocales[locale] });
}

/**
 * Format a date with time in the business timezone.
 */
export function formatDateTime(date: Date | string, locale: Locale = "es"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(d, BUSINESS_TIMEZONE);
  const pattern = locale === "es" ? "dd/MM/yyyy HH:mm" : "MM/dd/yyyy h:mm a";
  return format(zonedDate, pattern, { locale: dateLocales[locale] });
}

/**
 * Format a time only in the business timezone.
 */
export function formatTime(date: Date | string, locale: Locale = "es"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(d, BUSINESS_TIMEZONE);
  const pattern = locale === "es" ? "HH:mm" : "h:mm a";
  return format(zonedDate, pattern, { locale: dateLocales[locale] });
}

/**
 * Format a percentage value.
 * Output: "15 %" or "+15 %↑" for positive deltas.
 */
export function formatPercent(
  value: number,
  locale: Locale = "es",
  options?: { showSign?: boolean },
): string {
  const formatted = new Intl.NumberFormat(locale === "es" ? "es-CO" : "en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: options?.showSign ? "exceptZero" : "auto",
  }).format(value / 100);
  return formatted;
}

/**
 * Format a count with locale-aware thousand separators.
 * Output: "1.500" (Spanish) or "1,500" (English)
 */
export function formatCount(count: number, locale: Locale = "es"): string {
  return new Intl.NumberFormat(locale === "es" ? "es-CO" : "en-US").format(count);
}

/**
 * Format a relative time string.
 * Output: "hace 2 horas" (Spanish) or "2 hours ago" (English)
 */
export function formatRelativeTime(date: Date | string, locale: Locale = "es"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, {
    addSuffix: true,
    locale: dateLocales[locale],
  });
}
