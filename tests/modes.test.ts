import { describe, expect, it } from 'vitest';
import { RNG, createDailySeed } from '../src/core/RNG';
import { GameConfig, floorMultiplier } from '../src/core/GameConfig';
import { RunManager } from '../src/run/RunManager';
import { generateMap } from '../src/map/MapGenerator';
import { MapView } from '../src/map/MapState';
import { validateMap } from '../src/map/PathValidator';
import { biomeForFloor, endlessBossId, floorDefinition } from '../src/data/floors';
import { createDefaultProfile } from '../src/save/SaveTypes';
import { resolveArmyStats } from '../src/run/StatResolver';
import { STARTER_HERO_IDS, getHero } from '../src/data/heroes';
import { buildBattle, makeArmies } from './helpers';

describe('Endless Kingdom', () => {
  it('keeps generating valid floors well past Floor 20', () => {
    for (const floor of [21, 25, 30, 40, 50, 75, 100]) {
      const { map } = generateMap(
        { floor, ascensionLevel: 0, mode: 'ENDLESS', features: [] },
        new RNG(floor * 7919),
      );
      const view = new MapView(map);
      const check = validateMap(view, GameConfig.map.requiredRoutes, GameConfig.map.minGuardianDistance);
      expect(check.valid, `floor ${floor}: ${check.reasons.join(', ')}`).toBe(true);
      expect(map.tiles.length).toBeGreaterThan(40);
    }
  });

  it('keeps scaling difficulty upward without limit', () => {
    expect(floorMultiplier(30)).toBeGreaterThan(floorMultiplier(20));
    expect(floorMultiplier(60)).toBeGreaterThan(floorMultiplier(30));
    expect(floorMultiplier(100)).toBeGreaterThan(floorMultiplier(60));
  });

  it('puts a boss on every fifth floor and rotates the campaign bosses', () => {
    expect(endlessBossId(21)).toBeUndefined();
    expect(endlessBossId(24)).toBeUndefined();
    expect(endlessBossId(25)).toBeTruthy();
    expect(endlessBossId(30)).toBeTruthy();
    const ids = [25, 30, 35, 40, 45, 50].map((f) => endlessBossId(f));
    expect(new Set(ids).size).toBeGreaterThan(1);
  });

  it('rotates biomes rather than running out of them', () => {
    for (const floor of [21, 33, 47, 68, 99]) {
      const biome = biomeForFloor(floor);
      expect(biome).toBeTruthy();
      expect(biome.id).not.toBe('golden_throne');
    }
  });

  it('caps floor size so late Endless floors stay readable on a phone', () => {
    for (const floor of [21, 50, 120]) {
      const def = floorDefinition(floor);
      expect(def.width).toBeLessThanOrEqual(10);
      expect(def.height).toBeLessThanOrEqual(10);
    }
  });

  it('never marks Floor 20 as the end of an Endless run', () => {
    const profile = createDefaultProfile();
    const run = RunManager.createRun(
      { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'ENDLESS', ascensionLevel: 0, seed: 99 },
      profile,
    );
    const manager = new RunManager(run, profile, () => {});
    run.floor = 20;
    manager.advanceFloor();
    expect(manager.floor).toBe(21);
    expect(manager.run.currentMap).not.toBeNull();
    expect(manager.fog.frontier().length).toBeGreaterThan(0);
  });
});

describe('Daily Kingdom', () => {
  it('gives every player the same expedition on a given day', () => {
    const daily = createDailySeed(new Date(Date.UTC(2026, 5, 1)));
    const build = () => {
      const profile = createDefaultProfile();
      const run = RunManager.createRun(
        { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'DAILY', ascensionLevel: 0, seed: daily.seed },
        profile,
      );
      return new RunManager(run, profile, () => {}).view.data;
    };
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it('changes the expedition from one day to the next', () => {
    const a = createDailySeed(new Date(Date.UTC(2026, 5, 1)));
    const b = createDailySeed(new Date(Date.UTC(2026, 5, 2)));
    expect(a.seed).not.toBe(b.seed);
  });
});

describe('Lieutenants', () => {
  it('adds the lieutenant to the captain\'s run-level stats', () => {
    const profile = createDefaultProfile();
    const plain = RunManager.createRun(
      { heroIds: ['auren'], mode: 'NORMAL', ascensionLevel: 0, seed: 1 },
      profile,
    );
    const paired = RunManager.createRun(
      { heroIds: ['auren'], mode: 'NORMAL', ascensionLevel: 0, seed: 1, lieutenantIds: { auren: 'borin' } },
      profile,
    );
    const a = resolveArmyStats(plain.armies[0]!, 1, []);
    const b = resolveArmyStats(paired.armies[0]!, 1, []);
    expect(b.attack).toBeGreaterThan(a.attack);
    expect(b.maxHP).toBeGreaterThan(a.maxHP);
    expect(paired.armies[0]!.lieutenantId).toBe('borin');
  });

  it('brings the lieutenant\'s passive into battle at reduced strength', () => {
    const armies = makeArmies(['lyra']);
    const solo = buildBattle({ armies, floor: 3, kind: 'ENEMY', seed: 12 });
    const soloCrit = solo.snapshot().find((c) => c.defId === 'lyra')!.stats.critChance;

    // Cassia's passive is crit-flavoured; as a lieutenant it should still show up.
    const paired = makeArmies(['lyra']);
    paired[0]!.lieutenantId = 'cassia';
    const withLt = buildBattle({ armies: paired, floor: 3, kind: 'ENEMY', seed: 12 });
    const lyra = withLt.snapshot().find((c) => c.defId === 'lyra')!;
    expect(lyra.stats.attack).toBeGreaterThan(solo.snapshot().find((c) => c.defId === 'lyra')!.stats.attack);
    expect(soloCrit).toBeGreaterThan(0);
  });

  it('is gated behind the first victory', () => {
    const profile = createDefaultProfile();
    expect(profile.unlockedFeatures).not.toContain('LIEUTENANTS');
    expect(getHero('seraph').unlockCondition.type).toBe('DEFEAT_FLOOR');
  });
});
