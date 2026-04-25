import { getStabilizationSnapshots } from "@/lib/stabilization";
import { buildPublicSnapshotFromMany, type PublicTask } from "@/lib/stabilization-public";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<PublicTask["status"], { label: string; className: string }> = {
  pending: { label: "Próximamente", className: "bg-muted text-muted-foreground" },
  "in-progress": { label: "En curso", className: "bg-primary/15 text-primary" },
  done: { label: "Listo", className: "bg-success/15 text-success" },
};

export default async function PublicRoadmapPage() {
  const snapshot = buildPublicSnapshotFromMany(await getStabilizationSnapshots());

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
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
            Estamos puliendo la plataforma con foco en estabilidad, claridad y experiencia. Acá ves
            cómo avanzamos.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Fase actual</p>
              <p className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                Estabilización
              </p>
            </div>
            <p className="font-mono tabular-nums text-2xl">{snapshot.progressPct}%</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${snapshot.progressPct}%` }}
              aria-hidden="true"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Mejoras enfocadas en navegación, pagos, analíticas y experiencia general.
          </p>
        </section>

        <section className="grid grid-cols-3 gap-3">
          <Stat label="Total" value={snapshot.total} />
          <Stat label="Listas" value={snapshot.done} />
          <Stat label="Pendientes" value={snapshot.remaining} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Mejoras</h2>
          <ul className="space-y-2">
            {snapshot.tasks.map((task, idx) => {
              const copy = STATUS_COPY[task.status];
              return (
                <li
                  key={`${idx}-${task.title}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <span className="text-sm">{task.title}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      copy.className,
                    )}
                  >
                    {copy.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="pt-4 text-center text-xs text-muted-foreground">
          Esta página se actualiza a medida que avanzamos.
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-center">
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
