import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon, ReceiptIcon, ScissorsIcon, WalletIcon } from "lucide-react";

export default async function LandingPage() {
  const t = await getTranslations("landing");

  const features = [
    {
      icon: ReceiptIcon,
      num: "01",
      title: t("feat1Title"),
      desc: t("feat1Desc"),
    },
    {
      icon: ScissorsIcon,
      num: "02",
      title: t("feat2Title"),
      desc: t("feat2Desc"),
    },
    {
      icon: WalletIcon,
      num: "03",
      title: t("feat3Title"),
      desc: t("feat3Desc"),
    },
  ] as const;

  return (
    <div
      className="relative min-h-dvh overflow-hidden flex flex-col"
      style={{ background: "var(--brand-ink)", color: "var(--brand-bone)" }}
    >
      {/* ─── Grain overlay ─── */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.032]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />

      {/* ─── Background composition ─── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {/* Pink bloom — top right */}
        <div
          className="absolute -top-32 -right-48 h-[600px] w-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle at 60% 40%, color-mix(in srgb, var(--brand-pink) 18%, transparent) 0%, color-mix(in srgb, var(--brand-pink) 5%, transparent) 45%, transparent 70%)",
          }}
        />
        {/* Soft pink bloom — bottom left */}
        <div
          className="absolute -bottom-24 -left-32 h-[400px] w-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--brand-pink) 7%, transparent) 0%, transparent 70%)",
          }}
        />
        {/* Vertical rule — editorial skeleton */}
        <div
          className="absolute top-0 left-[52%] bottom-0 w-px hidden xl:block"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--brand-pink) 12%, transparent) 30%, color-mix(in srgb, var(--brand-pink) 12%, transparent) 70%, transparent 100%)",
          }}
        />
        {/* Horizontal rule — below hero */}
        <div
          className="absolute top-[62%] inset-x-0 h-px hidden lg:block"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, color-mix(in srgb, var(--brand-bone) 6%, transparent) 20%, color-mix(in srgb, var(--brand-bone) 6%, transparent) 80%, transparent 100%)",
          }}
        />
      </div>

      {/* ─── Navigation ─── */}
      <header
        className="relative z-10 flex items-center justify-between px-6 sm:px-10 lg:px-16 xl:px-20"
        style={{ paddingTop: "1.75rem", paddingBottom: "1.75rem" }}
      >
        <div className="flex items-center gap-3">
          {/* Diamond mark */}
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
            alt="Innovation Befine"
            width={120}
            height={24}
            priority
            className="h-6 w-auto brightness-0 invert"
          />
        </div>

        <Link
          href="/login"
          className="group flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: "var(--brand-stone)" }}
          onMouseEnter={undefined}
        >
          <span className="relative" style={{ fontFamily: "var(--font-sans)" }}>
            {t("ctaNav")}
            <span
              aria-hidden="true"
              className="absolute -bottom-px left-0 right-0 h-px origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
              style={{ background: "var(--brand-pink)" }}
            />
          </span>
          <ArrowRightIcon
            className="size-3 transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </header>

      {/* ─── Hero ─── */}
      <main className="relative z-10 flex-1">
        <div className="mx-auto max-w-[1320px] px-6 sm:px-10 lg:px-16 xl:px-20">
          {/* Eyebrow */}
          <div className="pt-16 sm:pt-20 lg:pt-28">
            <div
              className="inline-flex items-center gap-2.5 mb-10"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              <span
                className="h-px w-8"
                style={{ background: "var(--brand-pink)" }}
                aria-hidden="true"
              />
              <span
                className="text-xs font-semibold tracking-[0.25em] uppercase"
                style={{ color: "var(--brand-pink)" }}
              >
                {t("eyebrow")}
              </span>
            </div>

            {/* Main headline — split layout */}
            <div className="grid lg:grid-cols-[1fr_auto] lg:gap-16 xl:gap-24 items-end">
              <div>
                <h1
                  className="text-[clamp(3rem,7vw,5.5rem)] leading-[0.95] tracking-tight font-bold"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontVariationSettings: "'SOFT' 40, 'WONK' 1",
                  }}
                >
                  <span style={{ color: "var(--brand-bone)" }}>{t("heroLine1")}</span>
                  <br />
                  <em
                    className="not-italic"
                    style={{
                      background:
                        "linear-gradient(100deg, var(--brand-pink) 0%, var(--brand-pink-soft) 60%, var(--brand-pink) 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {t("heroLine2")}
                  </em>
                </h1>
              </div>

              {/* Right column — descriptor + CTA */}
              <div className="mt-10 lg:mt-0 lg:mb-2 lg:max-w-[280px] xl:max-w-[320px] flex-shrink-0">
                <p
                  className="text-sm leading-relaxed mb-8"
                  style={{
                    color: "var(--brand-taupe)",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {t("heroParagraph")}
                </p>
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-between w-full border px-5 py-3.5 text-sm font-medium transition-all duration-300 hover:pl-6"
                  style={{
                    borderColor: "color-mix(in srgb, var(--brand-pink) 35%, transparent)",
                    color: "var(--brand-bone)",
                    fontFamily: "var(--font-sans)",
                    background:
                      "linear-gradient(to right, color-mix(in srgb, var(--brand-pink) 6%, transparent) 0%, transparent 100%)",
                  }}
                >
                  <span>{t("cta")}</span>
                  <span
                    className="flex items-center gap-1.5 transition-transform duration-300 group-hover:translate-x-1"
                    style={{ color: "var(--brand-pink)" }}
                  >
                    <span
                      className="h-px w-4 transition-all duration-300 group-hover:w-6"
                      style={{ background: "var(--brand-pink)" }}
                      aria-hidden="true"
                    />
                    <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            </div>
          </div>

          {/* ─── Divider with label ─── */}
          <div
            className="mt-24 lg:mt-32 mb-12 flex items-center gap-5"
            style={{
              borderTop: "1px solid color-mix(in srgb, var(--brand-bone) 5%, transparent)",
              paddingTop: "2rem",
            }}
          >
            <span
              className="text-xs font-semibold tracking-[0.22em] uppercase shrink-0"
              style={{
                color: "var(--brand-taupe)",
                fontFamily: "var(--font-sans)",
              }}
            >
              {t("featuresLabel")}
            </span>
            <div
              className="h-px flex-1"
              style={{ background: "color-mix(in srgb, var(--brand-bone) 5%, transparent)" }}
            />
          </div>

          {/* ─── Feature cards ─── */}
          <div
            className="grid sm:grid-cols-3 gap-px mb-24 lg:mb-32"
            style={{ background: "color-mix(in srgb, var(--brand-bone) 8%, transparent)" }}
          >
            {features.map(({ icon: Icon, num, title, desc }) => (
              <article
                key={num}
                className="group relative flex flex-col gap-6 p-8 xl:p-10 transition-colors duration-300"
                style={{ background: "var(--brand-ink)" }}
              >
                {/* Hover fill */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: "color-mix(in srgb, var(--brand-pink) 3%, transparent)" }}
                  aria-hidden="true"
                />
                {/* Top accent line */}
                <div
                  className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"
                  style={{ background: "var(--brand-pink)" }}
                  aria-hidden="true"
                />

                <div className="flex items-start justify-between">
                  <div
                    className="flex h-9 w-9 items-center justify-center border transition-colors duration-300 group-hover:border-[color-mix(in srgb, var(--brand-pink) 40%, transparent)]"
                    style={{
                      borderColor: "color-mix(in srgb, var(--brand-bone) 15%, transparent)",
                      background: "color-mix(in srgb, var(--brand-bone) 3%, transparent)",
                    }}
                  >
                    <Icon
                      className="size-4 transition-colors duration-300 group-hover:text-brand-pink"
                      aria-hidden="true"
                      style={{ color: "var(--brand-stone)" }}
                    />
                  </div>
                  <span
                    className="font-mono text-4xl font-bold leading-none select-none transition-colors duration-300 group-hover:opacity-60"
                    style={{
                      color: "color-mix(in srgb, var(--brand-bone) 6%, transparent)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {num}
                  </span>
                </div>

                <div>
                  <h2
                    className="text-sm font-semibold mb-2 transition-colors duration-300"
                    style={{
                      color: "var(--brand-bone)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {title}
                  </h2>
                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      color: "var(--brand-taupe)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {desc}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer
        className="relative z-10 px-6 sm:px-10 lg:px-16 xl:px-20 py-6"
        style={{ borderTop: "1px solid color-mix(in srgb, var(--brand-bone) 5%, transparent)" }}
      >
        <div className="mx-auto max-w-[1320px] flex items-center justify-between">
          <p
            className="text-xs"
            style={{
              color: "var(--brand-char)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {t("footer")}
          </p>
          <div
            className="h-px w-8"
            style={{ background: "color-mix(in srgb, var(--brand-pink) 30%, transparent)" }}
            aria-hidden="true"
          />
        </div>
      </footer>
    </div>
  );
}
