/**
 * Deterministic seeded RNG (mulberry32).
 *
 * Every random decision inside a run must go through one of these so that a
 * seed fully reproduces a run. The internal state is a single uint32, which
 * makes it trivial to serialise into the save file.
 */
export class RNG {
  private state: number;

  constructor(seed: number) {
    // Avoid the degenerate 0 state.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Restore an RNG from a serialised cursor. */
  static fromState(state: number): RNG {
    const rng = new RNG(1);
    rng.state = state >>> 0;
    return rng;
  }

  getState(): number {
    return this.state >>> 0;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  bool(chance = 0.5): boolean {
    return this.next() < chance;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('RNG.pick called with an empty list');
    return items[this.int(0, items.length - 1)]!;
  }

  /** Picks `count` distinct entries (or fewer when the pool is small). */
  pickMany<T>(items: readonly T[], count: number): T[] {
    const pool = items.slice();
    const out: T[] = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
      const idx = this.int(0, pool.length - 1);
      out.push(pool[idx]!);
      pool.splice(idx, 1);
    }
    return out;
  }

  /** Weighted pick. Entries with weight <= 0 are ignored. */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    let total = 0;
    for (const item of items) {
      const w = weightOf(item);
      if (w > 0) total += w;
    }
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (const item of items) {
      const w = weightOf(item);
      if (w <= 0) continue;
      roll -= w;
      if (roll <= 0) return item;
    }
    return items[items.length - 1]!;
  }

  /** Weighted pick over a `Record<key, weight>` table. */
  weightedKey<K extends string>(table: Partial<Record<K, number>>): K {
    const keys = Object.keys(table) as K[];
    return this.weighted(keys, (k) => table[k] ?? 0);
  }

  /** Fisher-Yates, returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }

  /**
   * Creates an independent stream derived from this RNG's seed and a label.
   * Used so that e.g. combat rolls never shift the map generation sequence.
   */
  fork(label: string): RNG {
    return new RNG(hashString(label, this.state));
  }
}

/** FNV-1a style string hash mixed with a numeric seed. */
export function hashString(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Final avalanche so adjacent labels diverge quickly.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/** Creates a run seed from the current clock, kept in uint32 range. */
export function createRandomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

/** Deterministic per-calendar-day seed shared by every player. */
export function createDailySeed(date = new Date()): { date: string; seed: number } {
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${date.getUTCDate()}`.padStart(2, '0');
  const key = `${y}-${m}-${d}`;
  return { date: key, seed: hashString(`crownbound-daily-${key}`) };
}
