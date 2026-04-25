import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import {
  getStabilizationSnapshot,
  type StabilizationStatus,
  type StabilizationType,
} from "@/lib/stabilization";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<StabilizationStatus, { label: string; className: string }> = {
  pending: {
    label: "Pendiente",
    className: "bg-status-initial text-status-initial-foreground",
  },
  "in-progress": {
    label: "En curso",
    className: "bg-status-progress text-status-progress-foreground",
  },
  done: {
    label: "Hecho",
    className: "bg-status-success text-status-success-foreground",
  },
};

const TYPE_COPY: Record<StabilizationType, string> = {
  bug: "Bug",
  ux: "UX",
  logic: "Lógica",
  infra: "Infra",
};

function StatusBadge({ status }: { status: StabilizationStatus }) {
  const copy = STATUS_COPY[status];
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

  const snapshot = await getStabilizationSnapshot();

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Roadmap interno</p>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {snapshot.phase}
        </h1>
        <p className="text-sm text-muted-foreground">
          Fuente única para fixes, polish y cierres post-MVP. Una tarea = una responsabilidad.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total" value={snapshot.total} />
        <Stat label="Hechas" value={snapshot.done} accent="success" />
        <Stat label="En curso" value={snapshot.inProgress} accent="progress" />
        <Stat label="Pendientes" value={snapshot.pending} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progreso global</span>
          <span className="font-mono tabular-nums">{snapshot.progressPct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${snapshot.progressPct}%` }}
            aria-hidden="true"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Tareas atómicas</h2>
        <ul className="space-y-3">
          {snapshot.tasks.map((task, idx) => (
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
                <StatusBadge status={task.status} />
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
    </div>
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
