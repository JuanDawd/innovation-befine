/** Seeded PRNG (mulberry32) — the same seed replays the same day. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Weighted choice over [item, weight] pairs. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [item, w] of entries) {
      r -= w;
      if (r <= 0) return item;
    }
    return entries[entries.length - 1]![0];
  }

  /** Independent stream for one actor, derived from this one. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 2 ** 32));
  }
}

const FIRST = [
  "Laura",
  "Camila",
  "Valentina",
  "Sofía",
  "Isabela",
  "Mariana",
  "Daniela",
  "Paula",
  "Natalia",
  "Juliana",
  "Andrea",
  "Carolina",
  "Luisa",
  "Manuela",
  "Sara",
  "Gabriela",
];
const LAST = [
  "Gómez",
  "Rodríguez",
  "Martínez",
  "López",
  "García",
  "Restrepo",
  "Ospina",
  "Castro",
  "Vargas",
  "Moreno",
  "Jiménez",
  "Rojas",
  "Herrera",
  "Cárdenas",
];

/** A plausible client name, tagged so sim data is recognisable in the database. */
export function personName(rng: Rng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)} (sim)`;
}

export function phone(rng: Rng): string {
  return `3${rng.int(0, 2)}${rng.int(10_000_000, 99_999_999)}`;
}
