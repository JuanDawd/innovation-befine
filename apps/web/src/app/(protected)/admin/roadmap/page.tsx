import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import {
  getStabilizationSnapshot,
  type StabilizationStatus,
  type StabilizationType,
} from "@/lib/stabilization";
import {
  getProgressSnapshot,
  type ProgressPhase,
  type ProgressStatus,
} from "@/lib/progress-tracker";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STAB_STATUS_COPY: Record<StabilizationStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-status-initial text-status-initial-foreground" },
  "in-progress": {
    label: "En curso",
    className: "bg-status-progress text-status-progress-foreground",
  },
  done: { label: "Hecho", className: "bg-status-success text-status-success-foreground" },
};

const PROGRESS_STATUS_COPY: Record<ProgressStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-status-initial text-status-initial-foreground" },
  "in-progress": {
    label: "En curso",
    className: "bg-status-progress text-status-progress-foreground",
  },
  done: { label: "Hecho", className: "bg-status-success text-status-success-foreground" },
  blocked: { label: "Bloqueado", className: "bg-status-negative text-status-negative-foreground" },
  unknown: { label: "—", className: "bg-muted text-muted-foreground" },
};

const TYPE_COPY: Record<StabilizationType, string> = {
  bug: "Bug",
  ux: "UX",
  logic: "Lógica",
  infra: "Infra",
};

function StabStatusBadge({ status }: { status: StabilizationStatus }) {
  const copy = STAB_STATUS_COPY[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        copy.className,
      )}
    >
      {copy.label}
    </span>
  );
}

function ProgressStatusBadge({ status }: { status: ProgressStatus }) {
  const copy = PROGRESS_STATUS_COPY[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        copy.className,
      )}
    >
      {copy.label}
    </span>
  );
}

function TypeChip({ type }: { type: StabilizationType }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {TYPE_COPY[type]}
    </span>
  );
}

export default async function AdminRoadmapPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin")) redirect("/403");

  const [stab, progress] = await Promise.all([getStabilizationSnapshot(), getProgressSnapshot()]);

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-12">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Roadmap interno</p>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Estado del producto
        </h1>
        <p className="text-sm text-muted-foreground">
          Origen único de verdad: estabilización + MVP + post-MVP. Una tarea = una responsabilidad.
        </p>
      </header>

      {/* ── Stabilization section ───────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {stab.phase}
          </h2>
          <span className="text-sm text-muted-foreground">
            {stab.done}/{stab.total} hechas · {stab.progressPct}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total" value={stab.total} />
          <Stat label="Hechas" value={stab.done} accent="success" />
          <Stat label="En curso" value={stab.inProgress} accent="progress" />
          <Stat label="Pendientes" value={stab.pending} />
        </div>

        <ProgressBar pct={stab.progressPct} />

        <ul className="space-y-3">
          {stab.tasks.map((task, idx) => (
            <li
              key={`${idx}-${task.title}`}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TypeChip type={task.type} />
                    <h3 className="text-sm font-semibold leading-snug">{task.title}</h3>
                  </div>
                  {task.scope[0] && (
                    <p className="text-xs text-muted-foreground">{task.scope[0]}</p>
                  )}
                </div>
                <StabStatusBadge status={task.status} />
              </div>

              {(task.steps.length > 0 || task.acceptance.length > 0) && (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {task.steps.length > 0 && (
                    <Block title="Pasos">
                      <ol className="ml-4 list-decimal space-y-0.5 text-xs text-muted-foreground">
                        {task.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                    </Block>
                  )}
                  {task.acceptance.length > 0 && (
                    <Block title="Aceptación">
                      <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                        {task.acceptance.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </Block>
                  )}
                </div>
              )}

              {task.test.length > 0 && (
                <div className="mt-3">
                  <Block title="Validación">
                    <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                      {task.test.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </Block>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── MVP + Post-MVP section ──────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            MVP y Post-MVP
          </h2>
          <span className="text-sm text-muted-foreground">
            {progress.done}/{progress.total} hechas · {progress.progressPct}%
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total" value={progress.total} />
          <Stat label="Hechas" value={progress.done} accent="success" />
          <Stat label="Pendientes" value={progress.pending} />
        </div>

        <ProgressBar pct={progress.progressPct} />

        <div className="space-y-4">
          {progress.phases.map((phase) => (
            <PhaseCard key={phase.slug} phase={phase} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PhaseCard({ phase }: { phase: ProgressPhase }) {
  const open = phase.pending > 0 || phase.inProgress > 0;
  return (
    <details open={open} className="rounded-lg border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{phase.name}</h3>
          <p className="text-xs text-muted-foreground">
            {phase.done}/{phase.total} hechas · {phase.progressPct}%
          </p>
        </div>
        <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted md:block">
          <div
            className="h-full bg-primary"
            style={{ width: `${phase.progressPct}%` }}
            aria-hidden="true"
          />
        </div>
      </summary>
      <ul className="border-t border-border divide-y divide-border">
        {phase.tasks.map((task) => (
          <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {task.id}
              </span>
              <span className="truncate">{task.title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {task.severity && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {task.severity}
                </span>
              )}
              <ProgressStatusBadge status={task.status} />
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success" | "progress";
}) {
  const ring =
    accent === "success"
      ? "ring-success/30"
      : accent === "progress"
        ? "ring-primary/30"
        : "ring-border";
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 ring-1", ring)}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </p>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Progreso</span>
        <span className="font-mono tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
