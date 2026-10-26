import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type SimEventKind =
  | "step_ok" // an action finished as expected
  | "step_rejected" // the app refused it the way it should (validation, conflict) — not a bug
  | "step_failed" // the action could not finish: selector timeout, unexpected state
  | "page_error" // uncaught exception in the browser
  | "console_error"
  | "http_5xx"
  | "request_failed"
  | "error_toast" // the app showed the user an error message
  | "error_boundary"; // "Algo salió mal" page

export type SimEvent = {
  at: string;
  actor: string;
  kind: SimEventKind;
  action?: string;
  detail: string;
  url?: string;
  ms?: number;
  /** x-vercel-id of a failed response, to find it in Vercel logs. */
  requestId?: string;
  screenshot?: string;
};

/** Run log: one JSONL file plus a summary written at the end. */
export class Report {
  readonly dir: string;
  private readonly events: SimEvent[] = [];

  constructor(
    baseDir: string,
    readonly runId: string,
  ) {
    this.dir = join(baseDir, runId);
    mkdirSync(join(this.dir, "shots"), { recursive: true });
  }

  add(event: Omit<SimEvent, "at">): void {
    const full = { at: new Date().toISOString(), ...event };
    this.events.push(full);
    appendFileSync(join(this.dir, "events.jsonl"), JSON.stringify(full) + "\n");
    if (event.kind !== "step_ok") {
      console.log(
        `[${event.actor}] ${event.kind} ${event.action ?? ""} — ${event.detail.slice(0, 160)}`,
      );
    }
  }

  summary(meta: Record<string, string | number>): string {
    const byKind = new Map<string, number>();
    for (const e of this.events) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);

    const actions = new Map<
      string,
      { ok: number; rejected: number; failed: number; ms: number[] }
    >();
    for (const e of this.events) {
      if (!e.action || !e.kind.startsWith("step_")) continue;
      const a = actions.get(e.action) ?? { ok: 0, rejected: 0, failed: 0, ms: [] };
      if (e.kind === "step_ok") a.ok++;
      else if (e.kind === "step_rejected") a.rejected++;
      else a.failed++;
      if (e.ms) a.ms.push(e.ms);
      actions.set(e.action, a);
    }

    // Group problems by a normalised message so repeats collapse into one line.
    const problems = new Map<string, { count: number; sample: SimEvent }>();
    for (const e of this.events) {
      if (e.kind === "step_ok" || e.kind === "step_rejected") continue;
      const key = `${e.kind} | ${e.action ?? ""} | ${e.detail.replace(/[0-9a-f-]{36}|\d+/g, "#").slice(0, 140)}`;
      const p = problems.get(key) ?? { count: 0, sample: e };
      p.count++;
      problems.set(key, p);
    }

    const p95 = (ms: number[]) => {
      if (!ms.length) return "—";
      const s = [...ms].sort((a, b) => a - b);
      return `${s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]} ms`;
    };

    const lines = [
      `# Workday simulation ${this.runId}`,
      "",
      ...Object.entries(meta).map(([k, v]) => `- **${k}:** ${v}`),
      "",
      "## Totals",
      "",
      ...[...byKind.entries()].sort().map(([k, n]) => `- ${k}: ${n}`),
      "",
      "## Actions",
      "",
      "| Action | OK | Rejected | Failed | p95 |",
      "| --- | --- | --- | --- | --- |",
      ...[...actions.entries()]
        .sort()
        .map(([k, a]) => `| ${k} | ${a.ok} | ${a.rejected} | ${a.failed} | ${p95(a.ms)} |`),
      "",
      "## Problems (grouped)",
      "",
      ...[...problems.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(
          ([key, p]) =>
            `- **×${p.count}** ${key}` +
            (p.sample.url ? `\n  - url: ${p.sample.url}` : "") +
            (p.sample.requestId ? `\n  - vercel id: ${p.sample.requestId}` : "") +
            (p.sample.screenshot ? `\n  - screenshot: ${p.sample.screenshot}` : ""),
        ),
    ];
    const text = lines.join("\n") + "\n";
    writeFileSync(join(this.dir, "summary.md"), text);
    return text;
  }
}
