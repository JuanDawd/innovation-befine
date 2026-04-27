import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Breadcrumb crumbs, rendered as "Innovations / Befine / Panel".
   *  The last item is styled as current location. */
  crumbs?: string[];
  /** Main editorial title. Can contain JSX to italicize a fragment with
   *  the primary color, e.g. <>Buen día, <em>Camila.</em></> */
  title: ReactNode;
  /** Italic Fraunces subtitle sitting below the title. */
  subtitle?: ReactNode;
  /** Right-aligned slot for primary/secondary actions. */
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader — editorial page introduction.
 *
 * Use at the top of every admin/cashier/secretary page. Pairs Fraunces
 * display type with a rule-line divider below and actions floated right.
 *
 * Typical use:
 *   <PageHeader
 *     crumbs={["Innovations", "Befine", "Panel"]}
 *     title={<>Buen día, <em>Camila.</em></>}
 *     subtitle="Nueve citas confirmadas, tres sastres cosiendo"
 *     actions={<><Button variant="outline">Exportar</Button><Button>Nuevo ticket</Button></>}
 *   />
 */
export function PageHeader({ crumbs, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {crumbs && crumbs.length > 0 && (
          <nav
            aria-label="breadcrumb"
            className="mb-3 text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground"
          >
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <span key={`${c}-${i}`}>
                  <span
                    className={cn(isLast ? "font-medium text-foreground" : "text-muted-foreground")}
                  >
                    {c}
                  </span>
                  {!isLast && <span className="mx-2 text-border">/</span>}
                </span>
              );
            })}
          </nav>
        )}

        <h1
          className="text-4xl font-light leading-[0.95] tracking-tight text-foreground sm:text-5xl md:text-[56px] [&_em]:font-light [&_em]:italic [&_em]:text-primary"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>

        {subtitle && (
          <p
            className="mt-3 max-w-xl text-base italic text-muted-foreground sm:text-lg"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {actions}
    </header>
  );
}
