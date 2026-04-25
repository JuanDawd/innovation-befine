import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ProgressStatus = "pending" | "in-progress" | "done" | "blocked" | "unknown";

export interface ProgressTask {
  id: string;
  title: string;
  status: ProgressStatus;
  severity?: string;
  dependencies?: string;
}

export interface ProgressPhase {
  name: string;
  slug: string;
  total: number;
  done: number;
  pending: number;
  inProgress: number;
  progressPct: number;
  tasks: ProgressTask[];
}

export interface ProgressSnapshot {
  phases: ProgressPhase[];
  total: number;
  done: number;
  pending: number;
  progressPct: number;
}

const FILE_PATH = join(process.cwd(), "..", "..", "docs", "Business", "progress.md");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseStatus(value: string): ProgressStatus {
  const v = value.trim().toLowerCase().replace(/_/g, "-");
  if (v === "done" || v === "pending" || v === "in-progress" || v === "blocked") return v;
  return "unknown";
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|\s*$/.test(line);
}

function parsePhaseBlock(name: string, body: string): ProgressPhase | null {
  const lines = body.split("\n");
  const tableLines: string[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.trim().startsWith("|")) {
      tableLines.push(line);
      inTable = true;
    } else if (inTable && line.trim() === "") {
      break;
    }
  }
  if (tableLines.length < 2) return null;

  const headers = splitRow(tableLines[0]).map((h) => h.toLowerCase());
  const idIdx = headers.findIndex((h) => h === "id");
  const taskIdx = headers.findIndex((h) => h === "task");
  const statusIdx = headers.findIndex((h) => h === "status");
  const severityIdx = headers.findIndex((h) => h === "severity");
  const depsIdx = headers.findIndex((h) => h === "dependencies");
  if (idIdx === -1 || taskIdx === -1 || statusIdx === -1) return null;

  const tasks: ProgressTask[] = [];
  for (let i = 1; i < tableLines.length; i++) {
    const line = tableLines[i];
    if (isSeparator(line)) continue;
    const cells = splitRow(line);
    if (cells.length < headers.length) continue;
    const id = cells[idIdx];
    if (!id || id.startsWith("-")) continue;
    tasks.push({
      id,
      title: cells[taskIdx] ?? "",
      status: parseStatus(cells[statusIdx] ?? ""),
      severity: severityIdx >= 0 ? cells[severityIdx] : undefined,
      dependencies: depsIdx >= 0 ? cells[depsIdx] : undefined,
    });
  }

  const done = tasks.filter((t) => t.status === "done").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const total = tasks.length;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  return {
    name,
    slug: slugify(name),
    total,
    done,
    pending,
    inProgress,
    progressPct,
    tasks,
  };
}

export function parseProgress(source: string): ProgressSnapshot {
  // Drop "Totals" section so it doesn't get parsed as a phase.
  const trimmed = source.split(/^##\s+Totals\s*$/m)[0];
  const blocks = trimmed.split(/^##\s+/m).slice(1);
  const phases: ProgressPhase[] = [];
  for (const block of blocks) {
    const newlineIdx = block.indexOf("\n");
    if (newlineIdx === -1) continue;
    const name = block.slice(0, newlineIdx).trim();
    const body = block.slice(newlineIdx + 1);
    const phase = parsePhaseBlock(name, body);
    if (phase && phase.tasks.length > 0) phases.push(phase);
  }

  const total = phases.reduce((sum, p) => sum + p.total, 0);
  const done = phases.reduce((sum, p) => sum + p.done, 0);
  const pending = phases.reduce((sum, p) => sum + p.pending, 0);
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  return { phases, total, done, pending, progressPct };
}

export async function getProgressSnapshot(): Promise<ProgressSnapshot> {
  const source = await readFile(FILE_PATH, "utf8");
  return parseProgress(source);
}
