import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import { ReceiptIcon, ScissorsIcon, WalletIcon, ArrowRightIcon } from "lucide-react";

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
    <div className="relative min-h-screen bg-zinc-950 text-zinc-50 overflow-hidden">
      {/* ── Ambient geometry ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 h-150 w-150 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle at center,#8B3A62 0%,transparent 70%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-96 w-96 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 40px)",
        }}
      />

      {/* ── Nav ── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10 lg:px-16">
        <Image
          src="/brand/wordmark.svg"
          alt="Innovation Befine"
          width={140}
          height={28}
          priority
          className="h-7 w-auto brightness-0 invert"
        />
        <Link
          href="/login"
          className="group flex items-center gap-2 rounded-full border border-zinc-700 px-5 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-[#8B3A62] hover:text-white"
        >
          {t("ctaNav")}
          <ArrowRightIcon
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </header>

      {/* ── Hero ── */}
      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-20 sm:px-10 sm:pt-28 lg:px-16 lg:pt-36">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#8B3A62]/40 bg-[#8B3A62]/10 px-4 py-1.5">
          <span className="size-1.5 rounded-full bg-[#8B3A62]" aria-hidden="true" />
          <span className="text-xs font-medium tracking-widest text-[#c47a9e] uppercase">
            {t("eyebrow")}
          </span>
        </div>

        <h1 className="max-w-3xl text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-tight">
          {t("heroLine1")}
          <br />
          <span
            className="italic"
            style={{
              background: "linear-gradient(135deg,#8B3A62 0%,#c47a9e 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {t("heroLine2")}
          </span>
        </h1>

        <p className="mt-6 max-w-md text-base leading-relaxed text-zinc-400">
          {t("heroParagraph")}
        </p>

        <div className="mt-10">
          <Link
            href="/login"
            className="group inline-flex items-center gap-3 rounded-full bg-[#8B3A62] px-8 py-3.5 text-sm font-semibold text-white transition-all hover:bg-[#a04475] hover:shadow-[0_0_32px_rgba(139,58,98,0.5)] active:scale-95"
          >
            {t("cta")}
            <ArrowRightIcon
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </div>

        {/* ── Divider ── */}
        <div className="mt-24 mb-16 flex items-center gap-4">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-xs tracking-[0.2em] uppercase text-zinc-600">
            {t("featuresLabel")}
          </span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* ── Feature cards ── */}
        <div className="grid gap-px bg-zinc-800 sm:grid-cols-3">
          {features.map(({ icon: Icon, num, title, desc }) => (
            <div
              key={num}
              className="group relative flex flex-col gap-6 bg-zinc-950 p-8 transition-colors hover:bg-zinc-900"
            >
              <div className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[#8B3A62] transition-transform duration-300 group-hover:scale-x-100" />

              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 transition-colors group-hover:border-[#8B3A62]/40">
                  <Icon className="size-5 text-[#c47a9e]" aria-hidden="true" />
                </div>
                <span className="select-none font-mono text-3xl font-bold leading-none text-zinc-800 transition-colors group-hover:text-zinc-700">
                  {num}
                </span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-zinc-800/60 px-6 py-6 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <p className="text-xs text-zinc-600">{t("footer")}</p>
          <div className="size-1.5 rounded-full bg-[#8B3A62]" aria-hidden="true" />
        </div>
      </footer>
    </div>
  );
}
