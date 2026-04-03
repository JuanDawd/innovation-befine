export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

export const BUSINESS_TIMEZONE = "America/Bogota";
export const CURRENCY_CODE = "COP";
