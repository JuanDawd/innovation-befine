/**
 * Login page — T016
 *
 * Each tenant deployment's staff entry point (`/` redirects here). Branding
 * comes from lib/brand and the tenant's /brand/wordmark.svg.
 */
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { BRAND_NAME } from "@/lib/brand";
import { LoginShell } from "./login-shell";

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <div
      className="relative h-dvh overflow-hidden flex"
      style={{ background: "var(--brand-ink)", color: "var(--brand-bone)" }}
    >
      {/* ─── Left decorative panel (lg+) ─── */}
      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative flex-col justify-center px-12 xl:px-16 flex-shrink-0"
        style={{ borderRight: "1px solid color-mix(in srgb, var(--brand-bone) 6%, transparent)" }}
      >
        {/* Ambient blooms */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 40% 40%, color-mix(in srgb, var(--brand-pink) 16%, transparent) 0%, color-mix(in srgb, var(--brand-pink) 4%, transparent) 50%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-0 right-0 h-[350px] w-[350px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--brand-pink) 6%, transparent) 0%, transparent 70%)",
            }}
          />
        </div>

        {/* Logo — pinned top-left */}
        <div className="absolute top-10 left-12 xl:left-16 z-10 flex items-center gap-3">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect
              x="2"
              y="2"
              width="10"
              height="10"
              rx="1.5"
              transform="rotate(45 7 7)"
              fill="var(--brand-pink)"
            />
          </svg>
          <Image
            src="/brand/wordmark.svg"
            alt={BRAND_NAME}
            width={120}
            height={24}
            priority
            className="h-6 w-auto brightness-0 invert"
          />
        </div>

        {/* Editorial headline — vertically centered */}
        <div className="relative z-10 space-y-6">
          <p
            className="text-[clamp(2.4rem,3.8vw,3.8rem)] leading-[0.95] tracking-tight font-bold"
            style={{
              fontFamily: "var(--font-display)",
              fontVariationSettings: "'SOFT' 40, 'WONK' 1",
            }}
          >
            <span style={{ color: "var(--brand-bone)" }}>Gestión operativa</span>
            <br />
            <span style={{ color: "var(--brand-pink)" }}>para tu salón y taller.</span>
          </p>

          <p
            className="text-sm leading-relaxed max-w-xs"
            style={{
              color: "var(--brand-taupe)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Tickets, confección, nómina y más, en un solo lugar para el equipo de {BRAND_NAME}.
          </p>
        </div>
      </div>

      {/* ─── Right: form panel ─── */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Mobile-only logo */}
        <div className="flex lg:hidden items-center gap-3 px-6 pt-8">
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
            <rect
              x="2"
              y="2"
              width="10"
              height="10"
              rx="1.5"
              transform="rotate(45 7 7)"
              fill="var(--brand-pink)"
            />
          </svg>
          <Image
            src="/brand/wordmark.svg"
            alt={BRAND_NAME}
            width={110}
            height={22}
            className="h-5 w-auto brightness-0 invert"
          />
        </div>

        {/* Bloom behind form on right side */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden lg:left-[52%] xl:left-[55%]"
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--brand-pink) 5%, transparent) 0%, transparent 65%)",
            }}
          />
        </div>

        {/* Form — centered */}
        <div className="relative z-10 flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-[340px]">
            {/* Heading */}
            <div className="mb-8 space-y-1">
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--brand-bone)",
                }}
              >
                {t("auth.login")}
              </h1>
            </div>

            <LoginShell />
          </div>
        </div>
      </div>
    </div>
  );
}
