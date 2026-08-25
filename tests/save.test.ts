import { beforeEach, describe, expect, it } from 'vitest';
import { SaveManager } from '../src/save/SaveManager';
import { createDefaultProfile } from '../src/save/SaveTypes';
import { migrate } from '../src/save/SaveMigration';
import { RunManager } from '../src/run/RunManager';
import { GameConfig } from '../src/core/GameConfig';
import { STARTER_HERO_IDS } from '../src/data/heroes';

function buildRun() {
  const profile = createDefaultProfile();
  const run = RunManager.createRun(
    { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'NORMAL', ascensionLevel: 0, seed: 777 },
    profile,
  );
  const manager = new RunManager(run, profile, () => {});
  return { profile, run, manager };
}

describe('save system', () => {
  let manager: SaveManager;

  beforeEach(() => {
    manager = new SaveManager();
  });

  it('round-trips a run without losing state', () => {
    const { profile, run, manager: runManager } = buildRun();
    // Play a little so the state is not trivially empty.
    runManager.addGold(120);
    runManager.addBlessing('r01_sharpened_steel');
    runManager.addRelic('war_horn');
    runManager.armies[0]!.hpRatio = 0.42;

    manager.profile = profile;
    manager.run = run;
    const json = manager.serialize();

    const restored = new SaveManager();
    expect(restored.restore(json)).toBe(true);
    expect(restored.run?.gold).toBe(run.gold);
    expect(restored.run?.seed).toBe(777);
    expect(restored.run?.armies[0]?.hpRatio).toBeCloseTo(0.42);
    expect(restored.run?.blessings).toEqual(run.blessings);
    expect(restored.run?.relics.map((r) => r.id)).toEqual(['war_horn']);
    expect(restored.run?.currentMap?.map.tiles.length).toBe(run.currentMap?.map.tiles.length);
  });

  it('rebuilds a working RunManager from a restored save', () => {
    const { profile, run, manager: runManager } = buildRun();
    const tile = runManager.fog.frontier()[0]!;
    runManager.fog.clearTile(tile);

    manager.profile = profile;
    manager.run = run;
    const restored = new SaveManager();
    restored.restore(manager.serialize());

    const rebuilt = new RunManager(restored.run!, restored.profile, () => {});
    expect(rebuilt.view.get(tile.id)?.state).toBe('CLEARED');
    // Fog state is reconstructed, so neighbours stay interactable after a load.
    expect(rebuilt.fog.frontier().length).toBeGreaterThan(0);
  });

  it('keeps persistent damage across a save/load cycle', () => {
    const { profile, run } = buildRun();
    run.armies[1]!.hpRatio = 0.31;
    run.armies[2]!.alive = false;
    run.armies[2]!.hpRatio = 0;

    manager.profile = profile;
    manager.run = run;
    const restored = new SaveManager();
    restored.restore(manager.serialize());

    expect(restored.run?.armies[1]?.hpRatio).toBeCloseTo(0.31);
    expect(restored.run?.armies[2]?.alive).toBe(false);
  });

  it('repairs a partial save instead of discarding it', () => {
    const envelope = migrate({
      schemaVersion: GameConfig.saveSchemaVersion,
      profile: { schemaVersion: 1, unlockedHeroes: [], crownShards: 40 },
      run: null,
      savedAt: 0,
    });
    expect(envelope).not.toBeNull();
    expect(envelope!.profile.crownShards).toBe(40);
    expect(envelope!.profile.unlockedHeroes.length).toBeGreaterThan(0);
    expect(envelope!.profile.settings.sfxVolume).toBeGreaterThan(0);
  });

  it('drops a run written by a newer schema but keeps the profile', () => {
    const envelope = migrate({
      schemaVersion: GameConfig.saveSchemaVersion + 5,
      profile: { ...createDefaultProfile(), crownShards: 99 },
      run: { floor: 3 },
      savedAt: 0,
    });
    expect(envelope?.run).toBeNull();
    expect(envelope?.profile.crownShards).toBe(99);
  });

  it('rejects garbage', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate('nope')).toBeNull();
    expect(migrate({})).toBeNull();
  });
});
