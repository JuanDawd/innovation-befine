/**
 * Login page — T016
 */
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Image from "next/image";
import { LoginShell } from "./login-shell";

export default async function LoginPage() {
  const t = await getTranslations();

  return (
    <div
      className="relative h-dvh overflow-hidden flex"
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

      {/* ─── Left decorative panel (lg+) ─── */}
      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative flex-col justify-center px-12 xl:px-16 flex-shrink-0"
        style={{ borderRight: "1px solid rgba(242,236,225,0.06)" }}
      >
        {/* Ambient blooms */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 40% 40%, rgba(233,64,142,0.16) 0%, rgba(233,64,142,0.04) 50%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-0 right-0 h-[350px] w-[350px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(233,64,142,0.06) 0%, transparent 70%)",
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

        {/* Editorial headline — vertically centered */}
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-2.5">
            <span className="h-px w-8" style={{ background: "#E9408E" }} aria-hidden="true" />
            <span
              className="text-[10px] font-semibold tracking-[0.25em] uppercase"
              style={{
                color: "#E9408E",
                fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
              }}
            >
              Plataforma interna
            </span>
          </div>

          <h1
            className="text-[clamp(2.4rem,3.8vw,3.8rem)] leading-[0.95] tracking-tight font-bold"
            style={{
              fontFamily: "'Fraunces', 'Cormorant Garamond', 'Times New Roman', serif",
              fontVariationSettings: "'SOFT' 40, 'WONK' 1",
            }}
          >
            <span style={{ color: "#f2ece1" }}>Gestión operativa</span>
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
              para tu salón y taller.
            </em>
          </h1>

          <p
            className="text-sm leading-relaxed max-w-xs"
            style={{
              color: "#4a4640",
              fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
            }}
          >
            Tickets, confección, nómina y más — todo en un solo lugar diseñado para el ritmo de
            Innovation Befine.
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
              fill="#E9408E"
            />
          </svg>
          <Image
            src="/brand/wordmark.svg"
            alt="Innovation Befine"
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
              background: "radial-gradient(circle, rgba(233,64,142,0.05) 0%, transparent 65%)",
            }}
          />
        </div>

        {/* Form — centered */}
        <div className="relative z-10 flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-[340px]">
            {/* Heading */}
            <div className="mb-8 space-y-1">
              <p
                className="text-[10px] font-semibold tracking-[0.22em] uppercase"
                style={{
                  color: "#E9408E",
                  fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
                }}
              >
                Acceso
              </p>
              <h2
                className="text-2xl font-bold tracking-tight"
                style={{
                  fontFamily: "'Fraunces', 'Cormorant Garamond', 'Times New Roman', serif",
                  color: "#f2ece1",
                }}
              >
                {t("auth.login")}
              </h2>
            </div>

            <LoginShell />
          </div>
        </div>

        {/* Footer back link */}
        <div
          className="relative z-10 px-8 py-5"
          style={{ borderTop: "1px solid rgba(242,236,225,0.05)" }}
        >
          <Link
            href="/"
            className="group flex items-center gap-2 text-xs w-fit transition-colors"
            style={{
              color: "#4a4640",
              fontFamily: "'Inter Tight', ui-sans-serif, system-ui, sans-serif",
            }}
          >
            <span
              className="transition-all group-hover:-translate-x-0.5 group-hover:text-[#E9408E]"
              aria-hidden="true"
            >
              ←
            </span>
            <span className="group-hover:text-[#b8b0a3] transition-colors">Volver al inicio</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
