import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** What the user does on this page ("Mis servicios", "Cobrar") — not the role name. */
  title: ReactNode;
  /** One short line under the title. */
  description?: ReactNode;
  /** Inline element next to the title, e.g. a StatusBadge. */
  meta?: ReactNode;
  /** Renders a back arrow before the title. `backLabel` is its accessible name. */
  backHref?: string;
  backLabel?: string;
  /** Right-aligned slot for the page's primary action(s). Wraps below on mobile. */
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader — the single page-title pattern for every screen.
 *
 *   <PageHeader
 *     title={t("pageTitle")}
 *     description={t("pageSubtitle")}
 *     actions={<Button>…</Button>}
 *   />
 */
export function PageHeader({
  title,
  description,
  meta,
  backHref,
  backLabel,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="-ml-1.5 mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground md:text-3xl">
              {title}
            </h1>
            {meta}
          </div>
          {description && (
            <p className="mt-1 text-sm text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
