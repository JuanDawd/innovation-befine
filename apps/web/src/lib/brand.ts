/**
 * Tenant brand — the white-label slot.
 *
 * Each deployment sets its own name and business units through public env vars,
 * so the shell never hardcodes a client's brand.
 *   NEXT_PUBLIC_BRAND_NAME=Befine                 (short: wordmark, PWA short name)
 *   NEXT_PUBLIC_BRAND_FULL_NAME=Innovation Befine (page titles, PWA name)
 *   NEXT_PUBLIC_BRAND_UNITS=DoWell,Swimwear   (optional, comma-separated)
 */

export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Befine";

export const BRAND_FULL_NAME =
  process.env.NEXT_PUBLIC_BRAND_FULL_NAME?.trim() || "Innovation Befine";

export const BRAND_UNITS: string[] = (process.env.NEXT_PUBLIC_BRAND_UNITS ?? "DoWell,Swimwear")
  .split(",")
  .map((unit) => unit.trim())
  .filter(Boolean);
