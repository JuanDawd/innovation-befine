import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type TaskStatus = "pending" | "in-progress" | "done" | "plan";

export interface RoadmapTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  acceptance: string[];
  testingSteps: string[];
  dependencies: string;
}

export interface RoadmapPhase {
  id: string;
  title: string;
  tasks: RoadmapTask[];
  total: number;
  done: number;
  progressPct: number;
}

export interface Roadmap {
  slug: string;
  title: string;
  description: string;
  phases: RoadmapPhase[];
  total: number;
  done: number;
  progressPct: number;
}

const ROADMAP_FILES: Array<{ slug: string; file: string }> = [
  { slug: "mvp", file: "MVP.md" },
  { slug: "stabilization", file: "Stabilization.md" },
  { slug: "post-mvp", file: "PostMVP.md" },
  { slug: "issues", file: "Issues.md" },
];

function parseStatus(raw: string): TaskStatus {
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, "");
  if (v === "done" || v === "complete" || v === "completed") return "done";
  if (v === "in-progress" || v === "inprogress") return "in-progress";
  if (v === "pending") return "pending";
  return "plan";
}

function extractBulletList(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*]/.test(l) || /^\d+\./.test(l))
    .map((l) =>
      l
        .replace(/^[-*]\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .trim(),
    )
    .filter(Boolean);
}

function extractFieldValue(block: string, field: string): string {
  // Match "- **Field:** value" capturing everything until the next "- **" or end
  const regex = new RegExp(
    `\\*\\*${field}:\\*\\*\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n#{1,4} |\\n---|\\s*$)`,
  );
  const m = block.match(regex);
  return m ? m[1].trim() : "";
}

function parseTask(block: string): RoadmapTask | null {
  // Block starts with "### Task X: Title" or "## Issue ID: ISS-XXX"
  const taskMatch = block.match(/^#{2,3}\s+(?:Task\s+)?([\w.]+)[:\s]+(.+)$/m);
  if (!taskMatch) return null;

  const id = taskMatch[1].trim();
  const title = taskMatch[2].trim();

  const statusRaw = extractFieldValue(block, "Status");
  // Also check plain "Status: done" (Stabilization format)
  const plainStatus = block.match(/^[-*]\s*\*\*Status:\*\*\s*(.+)$/m)?.[1] ?? statusRaw;

  const description = extractFieldValue(block, "Description");
  const acRaw = extractFieldValue(block, "Acceptance Criteria");
  const stepsRaw = extractFieldValue(block, "Testing Steps");
  const deps = extractFieldValue(block, "Dependencies");

  return {
    id,
    title,
    description: description.split("\n")[0].trim(),
    status: parseStatus(plainStatus),
    acceptance: extractBulletList(acRaw),
    testingSteps: extractBulletList(stepsRaw),
    dependencies: deps.split("\n")[0].trim(),
  };
}

function parsePhase(phaseId: string, heading: string, body: string): RoadmapPhase {
  // Tasks are delimited by "### Task" or "## Issue ID"
  const taskBlocks = body
    .split(/(?=^#{2,3}\s+(?:Task\s+|Issue ID:\s*))/m)
    .filter((b) => /^#{2,3}\s+(?:Task\s+|Issue ID:\s*)/m.test(b));

  const tasks = taskBlocks.map(parseTask).filter((t): t is RoadmapTask => t !== null);
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  return { id: phaseId, title: heading, tasks, total, done, progressPct };
}

function extractRoadmapMeta(source: string): { title: string; description: string } {
  const titleMatch = source.match(/^# (.+)$/m);
  const title = titleMatch?.[1].trim() ?? "Roadmap";
  // First blockquote after title
  const descMatch = source.match(/^>\s*(.+)$/m);
  const description = descMatch?.[1].trim() ?? "";
  return { title, description };
}

export function parseRoadmap(slug: string, source: string): Roadmap {
  const { title, description } = extractRoadmapMeta(source);

  // Split by "## Phase X:" headings (2-hash)
  const phaseBlocks = source.split(/^## /m).slice(1);
  const phases: RoadmapPhase[] = [];

  for (const block of phaseBlocks) {
    const nlIdx = block.indexOf("\n");
    if (nlIdx === -1) continue;
    const heading = block.slice(0, nlIdx).trim();

    // Skip non-phase headings (e.g. "Resolution Log", appendix sections)
    const phaseIdMatch = heading.match(/^(?:Phase\s+)?([A-Z0-9]+(?:[A-Z])?)[:\s]/i);
    if (!phaseIdMatch) continue;

    const body = block.slice(nlIdx + 1);
    // Extract clean title after the phase number
    const cleanTitle = heading.replace(/^(?:Phase\s+)?[A-Z0-9]+[:\s]+/i, "").trim();
    const phase = parsePhase(phaseIdMatch[1], cleanTitle, body);
    if (phase.tasks.length > 0) phases.push(phase);
  }

  const total = phases.reduce((s, p) => s + p.total, 0);
  const done = phases.reduce((s, p) => s + p.done, 0);
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  return { slug, title, description, phases, total, done, progressPct };
}

export async function getRoadmaps(): Promise<Roadmap[]> {
  const results = await Promise.all(
    ROADMAP_FILES.map(async ({ slug, file }) => {
      try {
        const source = await readFile(join(process.cwd(), "..", "..", "roadmaps", file), "utf8");
        return parseRoadmap(slug, source);
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is Roadmap => r !== null && r.total > 0);
}

export async function getRoadmap(slug: string): Promise<Roadmap | null> {
  const entry = ROADMAP_FILES.find((f) => f.slug === slug);
  if (!entry) return null;
  try {
    const source = await readFile(join(process.cwd(), "..", "..", "roadmaps", entry.file), "utf8");
    return parseRoadmap(slug, source);
  } catch {
    return null;
  }
}
