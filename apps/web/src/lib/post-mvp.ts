import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PostMvpItem {
  id: string;
  title: string;
  body: string;
}

export interface PostMvpCategory {
  number: string;
  title: string;
  slug: string;
  intro: string;
  items: PostMvpItem[];
}

export interface PostMvpSnapshot {
  categories: PostMvpCategory[];
  totalItems: number;
}

const FILE_PATH = join(process.cwd(), "..", "..", "docs", "roadmap-post-mvp.md");

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseCategoryHeading(heading: string): { number: string; title: string } | null {
  const match = heading.match(/^(\d+)\.\s+(.+)$/);
  if (!match) return null;
  return { number: match[1], title: match[2].trim() };
}

function parseItemHeading(heading: string): { id: string; title: string } | null {
  const match = heading.match(/^(\d+\.\d+)\s+(.+)$/);
  if (!match) return null;
  return { id: match[1], title: match[2].trim() };
}

export function parsePostMvp(source: string): PostMvpSnapshot {
  const categoryBlocks = source.split(/^##\s+/m).slice(1);
  const categories: PostMvpCategory[] = [];

  for (const block of categoryBlocks) {
    const newlineIdx = block.indexOf("\n");
    if (newlineIdx === -1) continue;
    const heading = block.slice(0, newlineIdx).trim();
    const head = parseCategoryHeading(heading);
    if (!head) continue;

    const body = block.slice(newlineIdx + 1);
    const itemBlocks = body.split(/^###\s+/m);
    const intro = itemBlocks[0].split(/^---\s*$/m)[0].trim();
    const items: PostMvpItem[] = [];

    for (const itemBlock of itemBlocks.slice(1)) {
      const itemNl = itemBlock.indexOf("\n");
      if (itemNl === -1) continue;
      const itemHeading = itemBlock.slice(0, itemNl).trim();
      const item = parseItemHeading(itemHeading);
      if (!item) continue;
      const bodyText = itemBlock
        .slice(itemNl + 1)
        .split(/^---\s*$/m)[0]
        .trim();
      items.push({ id: item.id, title: item.title, body: bodyText });
    }

    categories.push({
      number: head.number,
      title: head.title,
      slug: slugify(`${head.number}-${head.title}`),
      intro,
      items,
    });
  }

  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);
  return { categories, totalItems };
}

export async function getPostMvpSnapshot(): Promise<PostMvpSnapshot> {
  const source = await readFile(FILE_PATH, "utf8");
  return parsePostMvp(source);
}
