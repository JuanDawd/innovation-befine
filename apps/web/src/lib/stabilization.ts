import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type StabilizationStatus = "pending" | "in-progress" | "done";
export type StabilizationType = "bug" | "ux" | "logic" | "infra";

export interface StabilizationTask {
  title: string;
  status: StabilizationStatus;
  type: StabilizationType;
  scope: string[];
  steps: string[];
  acceptance: string[];
  test: string[];
}

export interface StabilizationSnapshot {
  phase: string;
  tasks: StabilizationTask[];
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  progressPct: number;
}

const FILE_PATH = join(process.cwd(), "..", "..", "docs", "stabilization-phase.md");

async function readSource(): Promise<string> {
  return await readFile(FILE_PATH, "utf8");
}

function parseStatus(value: string): StabilizationStatus {
  const v = value.trim().toLowerCase();
  if (v === "in-progress" || v === "done" || v === "pending") return v;
  return "pending";
}

function parseType(value: string): StabilizationType {
  const v = value.trim().toLowerCase();
  if (v === "bug" || v === "ux" || v === "logic" || v === "infra") return v;
  return "ux";
}

function extractList(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("*") || /^\d+\./.test(line))
    .map((line) =>
      line
        .replace(/^\*\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .trim(),
    )
    .filter(Boolean);
}

function parseTask(block: string): StabilizationTask | null {
  const titleMatch = block.match(/^##\s+Task:\s+(.+)$/m);
  if (!titleMatch) return null;
  const title = titleMatch[1].trim();

  const statusMatch = block.match(/^Status:\s*(.+)$/m);
  const typeMatch = block.match(/^Type:\s*(.+)$/m);

  const sectionRegex =
    /^(Scope|Steps|Acceptance Criteria|Test):\s*$([\s\S]*?)(?=^\w[\w ]*:\s*$|^---|$(?![\s\S]))/gm;
  const sections: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = sectionRegex.exec(block)) !== null) {
    sections[m[1]] = m[2];
  }

  return {
    title,
    status: parseStatus(statusMatch?.[1] ?? "pending"),
    type: parseType(typeMatch?.[1] ?? "ux"),
    scope: extractList(sections["Scope"] ?? ""),
    steps: extractList(sections["Steps"] ?? ""),
    acceptance: extractList(sections["Acceptance Criteria"] ?? ""),
    test: extractList(sections["Test"] ?? ""),
  };
}

function parsePhase(source: string): string {
  const m = source.match(/^\*\*Phase\*\*:\s*(.+)$/m);
  return m?.[1].trim() ?? "Stabilization";
}

export function parseStabilization(source: string): StabilizationSnapshot {
  const phase = parsePhase(source);
  const blocks = source
    .split(/^##\s+Task:/m)
    .slice(1)
    .map((b) => "## Task:" + b);
  const tasks = blocks.map(parseTask).filter((t): t is StabilizationTask => t !== null);

  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const total = tasks.length;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  return { phase, tasks, total, done, inProgress, pending, progressPct };
}

export async function getStabilizationSnapshot(): Promise<StabilizationSnapshot> {
  const source = await readSource();
  return parseStabilization(source);
}
