import { describe, expect, it } from 'vitest';
import { RNG, createDailySeed, hashString } from '../src/core/RNG';

describe('RNG', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new RNG(12345);
    const b = new RNG(12345);
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 50 }, (_, i) => new RNG(i).next());
    expect(new Set(a).size).toBeGreaterThan(45);
  });

  it('round-trips through its serialised state', () => {
    const rng = new RNG(999);
    for (let i = 0; i < 17; i++) rng.next();
    const restored = RNG.fromState(rng.getState());
    expect(Array.from({ length: 20 }, () => restored.next())).toEqual(
      Array.from({ length: 20 }, () => rng.next()),
    );
  });

  it('keeps int() inside its bounds', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 5000; i++) {
      const value = rng.int(3, 9);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
    }
  });

  it('respects weights', () => {
    const rng = new RNG(42);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 20000; i++) {
      counts[rng.weighted(['a', 'b'] as const, (k) => (k === 'a' ? 9 : 1))] += 1;
    }
    expect(counts.a / 20000).toBeGreaterThan(0.85);
    expect(counts.a / 20000).toBeLessThan(0.95);
  });

  it('gives independent streams per fork label', () => {
    const base = new RNG(2024);
    const combat = base.fork('combat').next();
    const map = base.fork('map').next();
    expect(combat).not.toBe(map);
    // Forking is pure: the same label always yields the same stream.
    expect(new RNG(2024).fork('combat').next()).toBe(combat);
  });

  it('derives a stable seed per calendar day', () => {
    const date = new Date(Date.UTC(2026, 3, 20));
    expect(createDailySeed(date)).toEqual(createDailySeed(date));
    expect(createDailySeed(date).date).toBe('2026-04-20');
    expect(createDailySeed(date).seed).not.toBe(createDailySeed(new Date(Date.UTC(2026, 3, 21))).seed);
  });

  it('hashes strings deterministically without collisions on close inputs', () => {
    expect(hashString('floor:1')).toBe(hashString('floor:1'));
    expect(hashString('floor:1')).not.toBe(hashString('floor:2'));
  });
});
