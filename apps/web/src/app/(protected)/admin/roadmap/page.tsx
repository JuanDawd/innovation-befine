import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/middleware-helpers";
import {
  getRoadmaps,
  type Roadmap,
  type RoadmapPhase,
  type RoadmapTask,
  type TaskStatus,
} from "@/lib/roadmap";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  done: { label: "Hecho", className: "bg-status-success text-status-success-foreground" },
  "in-progress": {
    label: "En curso",
    className: "bg-status-progress text-status-progress-foreground",
  },
  pending: { label: "Pendiente", className: "bg-status-initial text-status-initial-foreground" },
  plan: { label: "Plan", className: "bg-muted text-muted-foreground" },
};

export default async function AdminRoadmapPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !hasRole(session.user, "cashier_admin")) redirect("/403");

  const roadmaps = await getRoadmaps();

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-4">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Roadmap interno</p>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Estado del producto
        </h1>
        <p className="text-sm text-muted-foreground">
          Una tarea = una responsabilidad. Origen: <code className="font-mono">roadmaps/</code>
        </p>
      </header>

      {roadmaps.map((roadmap) => (
        <RoadmapSection key={roadmap.slug} roadmap={roadmap} />
      ))}
    </div>
  );
}

function RoadmapSection({ roadmap }: { roadmap: Roadmap }) {
  const complete = roadmap.total > 0 && roadmap.done === roadmap.total;
  return (
    <details
      open={!complete}
      className="group/roadmap rounded-2xl border border-border bg-card shadow-sm"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h2
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {roadmap.title}
          </h2>
          {roadmap.description && (
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{roadmap.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {roadmap.total > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {roadmap.done}/{roadmap.total} · {roadmap.progressPct}%
            </span>
          )}
          <span className="text-muted-foreground transition-transform group-open/roadmap:rotate-90">
            ›
          </span>
        </div>
      </summary>

      <div className="border-t border-border px-6 pb-6 pt-5 space-y-6">
        {roadmap.total > 0 && <ProgressBar pct={roadmap.progressPct} />}
        <div className="space-y-3">
          {roadmap.phases.map((phase) => (
            <PhaseAccordion key={phase.id} phase={phase} />
          ))}
        </div>
      </div>
    </details>
  );
}

function PhaseAccordion({ phase }: { phase: RoadmapPhase }) {
  const hasWork = phase.tasks.some((t) => t.status !== "plan");
  const open = hasWork && phase.done < phase.total;

  return (
    <details open={open} className="rounded-lg border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{phase.title}</h3>
          {hasWork && (
            <p className="text-xs text-muted-foreground">
              {phase.done}/{phase.total} hechas · {phase.progressPct}%
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasWork && (
            <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted md:block">
              <div
                className="h-full bg-primary"
                style={{ width: `${phase.progressPct}%` }}
                aria-hidden="true"
              />
            </div>
          )}
          <span className="text-muted-foreground text-xs">›</span>
        </div>
      </summary>
      <ul className="border-t border-border divide-y divide-border">
        {phase.tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </ul>
    </details>
  );
}

function TaskRow({ task }: { task: RoadmapTask }) {
  const meta = STATUS_META[task.status];
  const hasDetail = task.acceptance.length > 0 || task.testingSteps.length > 0;

  if (!hasDetail) {
    return (
      <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
            {task.id}
          </span>
          <span className="truncate">{task.title}</span>
        </div>
        <StatusBadge meta={meta} />
      </li>
    );
  }

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm marker:hidden [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
              {task.id}
            </span>
            <span className="truncate">{task.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge meta={meta} />
            <span className="text-muted-foreground text-xs transition-transform group-open:rotate-90">
              ›
            </span>
          </div>
        </summary>
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
          {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {task.acceptance.length > 0 && (
              <DetailBlock title="Criterios de aceptación">
                <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                  {task.acceptance.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </DetailBlock>
            )}
            {task.testingSteps.length > 0 && (
              <DetailBlock title="Validación">
                <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                  {task.testingSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </DetailBlock>
            )}
          </div>
          {task.dependencies && (
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium">Deps:</span> {task.dependencies}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

function StatusBadge({ meta }: { meta: { label: string; className: string } }) {
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {title}
      </p>
      {children}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
