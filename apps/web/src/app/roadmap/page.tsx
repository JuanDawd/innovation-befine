import { getRoadmaps, type Roadmap, type RoadmapPhase, type TaskStatus } from "@/lib/roadmap";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROADMAP_LABELS: Record<string, string> = {
  mvp: "Construcción base",
  stabilization: "Estabilización",
  "post-mvp": "Mejoras futuras",
  issues: "Seguimiento de bugs",
};

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  done: { label: "Listo", className: "bg-success/15 text-success" },
  "in-progress": { label: "En curso", className: "bg-primary/15 text-primary" },
  pending: { label: "Próximamente", className: "bg-muted text-muted-foreground" },
  plan: { label: "Planeado", className: "bg-muted text-muted-foreground" },
};

export default async function PublicRoadmapPage() {
  const roadmaps = await getRoadmaps();

  const totalTasks = roadmaps.reduce((s, r) => s + r.total, 0);
  const doneTasks = roadmaps.reduce((s, r) => s + r.done, 0);
  const overallPct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-4">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
            Innovation Befine
          </p>
          <h1
            className="text-4xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Avance del producto
          </h1>
          <p className="text-base text-muted-foreground">
            Estamos construyendo y puliendo la plataforma. Acá ves cómo avanzamos.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Progreso total</p>
            <p className="font-mono tabular-nums text-2xl">{overallPct}%</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${overallPct}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            <Stat label="Total" value={totalTasks} />
            <Stat label="Listas" value={doneTasks} />
            <Stat label="Pendientes" value={totalTasks - doneTasks} />
          </div>
        </section>

        {roadmaps.map((roadmap) => (
          <RoadmapSection key={roadmap.slug} roadmap={roadmap} />
        ))}

        <footer className="pt-4 text-center text-xs text-muted-foreground">
          Esta página se actualiza a medida que avanzamos.
        </footer>
      </div>
    </div>
  );
}

function RoadmapSection({ roadmap }: { roadmap: Roadmap }) {
  const label = ROADMAP_LABELS[roadmap.slug] ?? roadmap.title;
  const complete = roadmap.total > 0 && roadmap.done === roadmap.total;

  return (
    <details
      open={!complete}
      className="group/roadmap rounded-2xl border border-border bg-card shadow-sm"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg font-semibold">{label}</h2>
        <div className="flex items-center gap-3">
          {roadmap.total > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {roadmap.done}/{roadmap.total}
            </span>
          )}
          <span className="text-muted-foreground transition-transform group-open/roadmap:rotate-90">
            ›
          </span>
        </div>
      </summary>

      <div className="border-t border-border px-5 pb-4 pt-4 space-y-2">
        {roadmap.phases.map((phase) => (
          <PhaseBlock key={phase.id} phase={phase} />
        ))}
      </div>
    </details>
  );
}

function PhaseBlock({ phase }: { phase: RoadmapPhase }) {
  return (
    <details className="rounded-lg border border-border bg-card shadow-sm group">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium">{phase.title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {phase.done}/{phase.total}
          </span>
          <span className="text-muted-foreground text-xs transition-transform group-open:rotate-90">
            ›
          </span>
        </div>
      </summary>
      <ul className="border-t border-border divide-y divide-border">
        {phase.tasks.map((task) => {
          const meta = STATUS_META[task.status];
          return (
            <li
              key={task.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="truncate">{task.title}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                  meta.className,
                )}
              >
                {meta.label}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-0.5 text-xl font-semibold tabular-nums"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </p>
    </div>
  );
}
