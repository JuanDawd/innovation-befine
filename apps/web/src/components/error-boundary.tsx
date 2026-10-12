"use client";

import * as Sentry from "@sentry/nextjs";
import { Component, type ReactNode } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  eventId: string | null;
};

/**
 * Error boundary that reports unhandled React errors to Sentry — T085
 *
 * Wrap page-level sections that could throw (data tables, forms, realtime panels).
 * Does NOT wrap the entire app — let Next.js error.tsx handle root-level crashes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, eventId: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    const eventId = Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
    this.setState({ eventId });
  }

  reset = () => this.setState({ hasError: false, eventId: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return <DefaultErrorFallback eventId={this.state.eventId} onRetry={this.reset} />;
  }
}

/** Function component so the fallback can use next-intl (class components can't use hooks). */
function DefaultErrorFallback({
  eventId,
  onRetry,
}: {
  eventId: string | null;
  onRetry: () => void;
}) {
  const t = useTranslations("errors");
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center"
    >
      <AlertTriangleIcon className="size-8 text-destructive" aria-hidden />
      <div>
        <p className="text-sm font-medium text-destructive">{t("unexpected")}</p>
        {eventId && <p className="mt-1 font-mono text-xs text-muted-foreground">ID: {eventId}</p>}
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}
