/**
 * M-58 — per-clothier order for claimable pieces.
 *
 * Every clothier used to get the same list of unassigned pieces and tapped the
 * top one, so they collided on it (optimistic lock → CONFLICT). Older days still
 * come first, but within a day each clothier sees the pieces in their own stable
 * order, so simultaneous claims usually land on different pieces.
 */

/** FNV-1a 32-bit — cheap, stable across runs, good enough to spread a list. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function spreadForClaimer<T extends { id: string; productDate: string }>(
  pieces: T[],
  employeeId: string,
): T[] {
  const key = new Map(pieces.map((p) => [p.id, fnv1a(`${employeeId}:${p.id}`)]));
  return [...pieces].sort(
    (a, b) => a.productDate.localeCompare(b.productDate) || key.get(a.id)! - key.get(b.id)!,
  );
}
