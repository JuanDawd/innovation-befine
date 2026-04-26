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
      className="relative min-h-dvh overflow-hidden"
      style={{ background: "#010101", color: "#f2ece1" }}
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
              "radial-gradient(circle at 60% 40%, rgba(233,64,142,0.18) 0%, rgba(233,64,142,0.05) 45%, transparent 70%)",
          }}
        />
        {/* Soft pink bloom — bottom left */}
        <div
          className="absolute -bottom-24 -left-32 h-[400px] w-[400px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(233,64,142,0.07) 0%, transparent 70%)",
          }}
        />
        {/* Vertical rule — editorial skeleton */}
        <div
          className="absolute top-0 left-[52%] bottom-0 w-px hidden xl:block"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, rgba(233,64,142,0.12) 30%, rgba(233,64,142,0.12) 70%, transparent 100%)",
          }}
        />
        {/* Horizontal rule — below hero */}
        <div
          className="absolute top-[62%] inset-x-0 h-px hidden lg:block"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, rgba(242,236,225,0.06) 20%, rgba(242,236,225,0.06) 80%, transparent 100%)",
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
              fill="#E9408E"
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
          style={{ color: "#b8b0a3" }}
          onMouseEnter={undefined}
        >
          <span
            className="relative"
            style={{ fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif" }}
          >
            {t("ctaNav")}
            <span
              aria-hidden="true"
              className="absolute -bottom-px left-0 right-0 h-px origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
              style={{ background: "#E9408E" }}
            />
          </span>
          <ArrowRightIcon
            className="size-3 transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      </header>

      {/* ─── Hero ─── */}
      <main className="relative z-10">
        <div className="mx-auto max-w-[1320px] px-6 sm:px-10 lg:px-16 xl:px-20">
          {/* Eyebrow */}
          <div className="pt-16 sm:pt-20 lg:pt-28">
            <div
              className="inline-flex items-center gap-2.5 mb-10"
              style={{ fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif" }}
            >
              <span className="h-px w-8" style={{ background: "#E9408E" }} aria-hidden="true" />
              <span
                className="text-[10px] font-semibold tracking-[0.25em] uppercase"
                style={{ color: "#E9408E" }}
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
                    fontFamily: "'Fraunces', 'Cormorant Garamond', 'Times New Roman', serif",
                    fontVariationSettings: "'SOFT' 40, 'WONK' 1",
                  }}
                >
                  <span style={{ color: "#f2ece1" }}>{t("heroLine1")}</span>
                  <br />
                  <em
                    className="not-italic"
                    style={{
                      background: "linear-gradient(100deg, #E9408E 0%, #f06aa5 60%, #E9408E 100%)",
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
                    color: "#807870",
                    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
                  }}
                >
                  {t("heroParagraph")}
                </p>
                <Link
                  href="/login"
                  className="group inline-flex items-center justify-between w-full border px-5 py-3.5 text-sm font-medium transition-all duration-300 hover:pl-6"
                  style={{
                    borderColor: "rgba(233,64,142,0.35)",
                    color: "#f2ece1",
                    fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
                    background:
                      "linear-gradient(to right, rgba(233,64,142,0.06) 0%, transparent 100%)",
                  }}
                >
                  <span>{t("cta")}</span>
                  <span
                    className="flex items-center gap-1.5 transition-transform duration-300 group-hover:translate-x-1"
                    style={{ color: "#E9408E" }}
                  >
                    <span
                      className="h-px w-4 transition-all duration-300 group-hover:w-6"
                      style={{ background: "#E9408E" }}
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
            style={{ borderTop: "1px solid rgba(242,236,225,0.05)", paddingTop: "2rem" }}
          >
            <span
              className="text-[10px] font-semibold tracking-[0.22em] uppercase shrink-0"
              style={{
                color: "#807870",
                fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
              }}
            >
              {t("featuresLabel")}
            </span>
            <div className="h-px flex-1" style={{ background: "rgba(242,236,225,0.05)" }} />
          </div>

          {/* ─── Feature cards ─── */}
          <div
            className="grid sm:grid-cols-3 gap-px mb-24 lg:mb-32"
            style={{ background: "rgba(242,236,225,0.08)" }}
          >
            {features.map(({ icon: Icon, num, title, desc }) => (
              <article
                key={num}
                className="group relative flex flex-col gap-6 p-8 xl:p-10 transition-colors duration-300"
                style={{ background: "#010101" }}
              >
                {/* Hover fill */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: "rgba(233,64,142,0.03)" }}
                  aria-hidden="true"
                />
                {/* Top accent line */}
                <div
                  className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"
                  style={{ background: "#E9408E" }}
                  aria-hidden="true"
                />

                <div className="flex items-start justify-between">
                  <div
                    className="flex h-9 w-9 items-center justify-center border transition-colors duration-300 group-hover:border-[rgba(233,64,142,0.4)]"
                    style={{
                      borderColor: "rgba(242,236,225,0.15)",
                      background: "rgba(242,236,225,0.03)",
                    }}
                  >
                    <Icon
                      className="size-4 transition-colors duration-300 group-hover:text-[#E9408E]"
                      aria-hidden="true"
                      style={{ color: "#b8b0a3" }}
                    />
                  </div>
                  <span
                    className="font-mono text-4xl font-bold leading-none select-none transition-colors duration-300 group-hover:opacity-60"
                    style={{
                      color: "rgba(242,236,225,0.06)",
                      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    }}
                  >
                    {num}
                  </span>
                </div>

                <div>
                  <h2
                    className="text-sm font-semibold mb-2 transition-colors duration-300"
                    style={{
                      color: "#f2ece1",
                      fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
                    }}
                  >
                    {title}
                  </h2>
                  <p
                    className="text-sm leading-relaxed"
                    style={{
                      color: "#807870",
                      fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
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
        style={{ borderTop: "1px solid rgba(242,236,225,0.05)" }}
      >
        <div className="mx-auto max-w-[1320px] flex items-center justify-between">
          <p
            className="text-xs"
            style={{
              color: "#2a2724",
              fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
            }}
          >
            {t("footer")}
          </p>
          <div
            className="h-px w-8"
            style={{ background: "rgba(233,64,142,0.3)" }}
            aria-hidden="true"
          />
        </div>
      </footer>
    </div>
  );
}
