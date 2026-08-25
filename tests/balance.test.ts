import { describe, expect, it } from 'vitest';
import type { ArmyRunState, OwnedBlessing } from '../src/core/types';
import { RNG } from '../src/core/RNG';
import { blessingsByRarity } from '../src/data/blessings';
import { blessingRarityWeights } from '../src/core/GameConfig';
import { buildBattle, makeArmies } from './helpers';

const VERBOSE = process.env.BALANCE_LOG === '1';

type Kind = 'ENEMY' | 'ELITE' | 'GUARDIAN';

const BOSS_BY_FLOOR: Record<number, string> = {
  4: 'the_gatekeeper',
  8: 'the_twin_knights',
  12: 'the_sorcerer_king',
  16: 'the_fallen_general',
  20: 'the_crownless_king',
};

/** A player who changes priorities when the expedition is becoming wounded. */
function rollBlessing(floor: number, rng: RNG, owned: OwnedBlessing[], healthPool: number): void {
  // Match RunManager: each of the three cards rolls its own rarity.
  const offers = Array.from({ length: 3 }, () => {
    const rarity = rng.weightedKey(blessingRarityWeights(floor));
    return rng.pick(blessingsByRarity(rarity));
  });
  const available = offers.filter((b) => !owned.some((o) => o.id === b.id && o.stacks >= b.maxStacks));
  const priorities = healthPool < 0.78 ? ['SUSTAIN', 'DEFENSE', 'OFFENSE'] : ['OFFENSE', 'SUSTAIN', 'DEFENSE'];
  const pick = priorities
    .map((tag) => available.find((blessing) => blessing.tags.includes(tag as 'SUSTAIN' | 'DEFENSE' | 'OFFENSE')))
    .find(Boolean) ?? available[0] ?? offers[0]!;
  const existing = owned.find((b) => b.id === pick.id);
  if (existing && existing.stacks < pick.maxStacks) existing.stacks += 1;
  else if (!existing) owned.push({ id: pick.id, stacks: 1 });
}

interface FightSample {
  floor: number;
  kind: Kind;
  duration: number;
  /** Share of the whole army pool lost in this single fight. */
  poolLost: number;
  won: boolean;
}

function poolOf(armies: ArmyRunState[]): number {
  return armies.reduce((sum, a) => sum + a.hpRatio, 0) / armies.length;
}

function simulateRun(seed: number): { samples: FightSample[]; reachedFloor: number; won: boolean } {
  const rng = new RNG(seed);
  const armies = makeArmies();
  const blessings: OwnedBlessing[] = [];
  const samples: FightSample[] = [];
  let reachedFloor = 0;
  let won = false;

  for (let floor = 1; floor <= 20; floor++) {
    reachedFloor = floor;
    // A player who routes reasonably fights most, but not all, of a floor.
    const plan: Kind[] = ['ENEMY', 'ENEMY', 'ENEMY', 'ENEMY', 'ELITE', 'GUARDIAN'];
    let wiped = false;

    for (const kind of plan) {
      if (armies.every((a) => !a.alive)) {
        wiped = true;
        break;
      }
      const before = poolOf(armies);
      const boss = kind === 'GUARDIAN' ? BOSS_BY_FLOOR[floor] : undefined;
      const engine = buildBattle({
        armies,
        floor,
        kind,
        seed: rng.int(1, 0x7fffffff),
        blessings,
        ...(boss ? { bossId: boss } : {}),
      });
      const result = engine.runToCompletion();
      for (const entry of result.armies) {
        const army = armies.find((a) => a.id === entry.armyId);
        if (!army) continue;
        army.hpRatio = entry.hpRatio;
        army.alive = entry.alive;
      }
      samples.push({
        floor,
        kind,
        duration: result.durationSeconds,
        poolLost: before - poolOf(armies),
        won: result.outcome === 'VICTORY',
      });
      if (result.outcome === 'DEFEAT') {
        wiped = true;
        break;
      }
    }
    if (wiped) break;

    // Floor rewards: one blessing plus the healing a floor typically offers
    // (one fountain on the wounded army, a sacred spring, a checkpoint chest).
    rollBlessing(floor, rng, blessings, poolOf(armies));
    const wounded = armies.filter((a) => a.alive).sort((a, b) => a.hpRatio - b.hpRatio)[0];
    if (wounded) wounded.hpRatio = Math.min(1, wounded.hpRatio + 0.35);
    for (const army of armies) if (army.alive) army.hpRatio = Math.min(1, army.hpRatio + 0.12);
    if (floor % 4 === 0) {
      for (const army of armies) if (army.alive) army.hpRatio = Math.min(1, army.hpRatio + 0.15);
    }
    if (floor === 20) won = true;
  }

  return { samples, reachedFloor, won };
}

function summarise(samples: FightSample[], kind: Kind, band: [number, number]) {
  const rows = samples.filter((s) => s.kind === kind && s.floor >= band[0] && s.floor <= band[1]);
  if (rows.length === 0) return null;
  return {
    n: rows.length,
    duration: rows.reduce((s, r) => s + r.duration, 0) / rows.length,
    poolLost: (rows.reduce((s, r) => s + r.poolLost, 0) / rows.length) * 100,
  };
}

describe('balance', () => {
  it('keeps battles inside the intended duration and attrition bands', () => {
    const runs = Array.from({ length: 8 }, (_, i) => simulateRun((i + 1) * 104729));
    const all = runs.flatMap((r) => r.samples);

    if (VERBOSE) {
      console.log('\nband        kind      n   avg duration   avg pool lost');
      for (const band of [[1, 4], [5, 8], [9, 12], [13, 16], [17, 20]] as [number, number][]) {
        for (const kind of ['ENEMY', 'ELITE', 'GUARDIAN'] as Kind[]) {
          const s = summarise(all, kind, band);
          if (!s) continue;
          console.log(
            `${String(band[0]).padStart(2)}-${String(band[1]).padStart(2)}       ${kind.padEnd(9)} ${String(s.n).padStart(3)}   ${s.duration.toFixed(1).padStart(8)}s   ${s.poolLost.toFixed(2).padStart(8)}%`,
          );
        }
      }
      console.log(
        '\nreached floors:',
        runs.map((r) => r.reachedFloor).join(', '),
        '| wins:',
        runs.filter((r) => r.won).length,
      );
    }

    const normal = summarise(all, 'ENEMY', [1, 20])!;
    const guardian = summarise(all, 'GUARDIAN', [1, 20])!;

    // Normal fights: quick, and each one costs real but recoverable health.
    expect(normal.duration).toBeGreaterThan(5);
    expect(normal.duration).toBeLessThan(22);
    expect(normal.poolLost).toBeGreaterThan(0.4);
    expect(normal.poolLost).toBeLessThan(8);

    // Guardians: longer and meaningfully more expensive.
    expect(guardian.duration).toBeGreaterThan(10);
    expect(guardian.duration).toBeLessThan(40);
    expect(guardian.poolLost).toBeGreaterThan(normal.poolLost);

    // A system-agnostic run should reach the midgame but not trivially clear it.
    // Naive play (no relics, no merchant and six fights per floor) should
    // reach the midgame, but no longer wander to Floor 20 by itself. Routing,
    // reserves, relic timing and a coherent build are what carry late runs.
    const deepest = Math.max(...runs.map((r) => r.reachedFloor));
    const median = runs.map((r) => r.reachedFloor).sort((a, b) => a - b)[Math.floor(runs.length / 2)]!;
    expect(deepest).toBeGreaterThanOrEqual(13);
    expect(median).toBeGreaterThanOrEqual(10);
    expect(runs.filter((run) => run.won)).toHaveLength(0);
  });

  it('is deterministic: identical seed and formation produce an identical battle', () => {
    const a = buildBattle({ armies: makeArmies(), floor: 6, kind: 'ELITE', seed: 555 }).runToCompletion();
    const b = buildBattle({ armies: makeArmies(), floor: 6, kind: 'ELITE', seed: 555 }).runToCompletion();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
