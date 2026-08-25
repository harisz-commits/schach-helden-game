import { describe, expect, it } from 'vitest';
import type { PlayerProfile, TileData } from '../src/core/types';
import { RunManager } from '../src/run/RunManager';
import { ProgressionManager } from '../src/progression/ProgressionManager';
import { CombatEngine } from '../src/combat/CombatEngine';
import { createDefaultProfile } from '../src/save/SaveTypes';
import { SaveManager } from '../src/save/SaveManager';
import { GameConfig } from '../src/core/GameConfig';
import { STARTER_HERO_IDS } from '../src/data/heroes';

interface RunLog {
  floorsCleared: number;
  battles: number;
  guardiansBeaten: number;
  blessingsTaken: number;
  goldEarned: number;
  exitTakenBeforeGuardian: boolean;
  won: boolean;
  stoppedBecause?: string;
}

const SAFE_FIRST = new Set([
  'EMPTY',
  'GOLD',
  'TREASURE',
  'RELIC',
  'ORACLE_TOWER',
  'SACRED_SPRING',
  'HEALING_FOUNTAIN',
  'WAR_CAMP',
  'SHRINE',
  'TEMPLE',
  'RESURRECTION_SHRINE',
  'RECRUITMENT_CAMP',
  'MERCHANT',
  'EVENT',
  'ALTAR',
  'TRAP',
]);

/**
 * Drives a whole expedition through the real RunManager and CombatEngine -
 * the same calls the scenes make, without any UI.
 *
 * `restoreHealth` keeps this an orchestration test rather than a balance test:
 * balance is covered separately, here we care that 20 floors can actually be
 * played from start to finish.
 */
function playRun(seed: number, options: { restoreHealth?: boolean; profile?: PlayerProfile } = {}): {
  log: RunLog;
  manager: RunManager;
  profile: PlayerProfile;
} {
  const profile = options.profile ?? createDefaultProfile();
  const progression = new ProgressionManager(profile);
  const run = RunManager.createRun(
    { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'NORMAL', ascensionLevel: 0, seed },
    profile,
  );
  const manager = new RunManager(run, profile, () => {});
  const log: RunLog = {
    floorsCleared: 0,
    battles: 0,
    guardiansBeaten: 0,
    blessingsTaken: 0,
    goldEarned: 0,
    exitTakenBeforeGuardian: false,
    won: false,
  };

  const takePendingReward = () => {
    const reward = manager.pendingReward;
    if (!reward) return;
    manager.chooseBlessing(reward.blessingIds[0]!);
    log.blessingsTaken += 1;
  };

  for (let floor = 1; floor <= GameConfig.run.totalFloors; floor++) {
    let steps = 0;
    let leftFloor = false;

    while (steps++ < 400 && !leftFloor) {
      // Traps, altars and blood-price events can also wipe the expedition, so
      // the health top-up has to happen here, not only after a battle.
      if (options.restoreHealth) {
        for (const army of manager.armies) {
          if (!army.alive || army.hpRatio < 0.5) {
            army.alive = true;
            army.hpRatio = 1;
          }
        }
      }
      if (manager.isRunLost()) {
        log.stoppedBecause = `wiped on floor ${manager.floor}`;
        return { log, manager, profile };
      }
      const frontier = manager.fog.frontier();
      if (frontier.length === 0) {
        log.stoppedBecause = `no reachable tiles on floor ${manager.floor} (guardian defeated: ${manager.guardianDefeated})`;
        break;
      }

      const exitTile = frontier.find((t) => t.type === 'EXIT');
      // The exit must never be usable before the guardian falls.
      if (exitTile && !manager.guardianDefeated && manager.canInteract(exitTile.id)) {
        log.exitTakenBeforeGuardian = true;
      }

      let tile: TileData | undefined;
      if (manager.guardianDefeated && exitTile) tile = exitTile;
      if (!tile) tile = frontier.find((t) => t.type === 'GUARDIAN');
      if (!tile) tile = frontier.find((t) => SAFE_FIRST.has(t.type));
      if (!tile) tile = frontier.find((t) => t.type === 'ENEMY' || t.type === 'ELITE');
      if (!tile) tile = frontier[0]!;

      const result = manager.interact(tile.id);

      switch (result.kind) {
        case 'BATTLE': {
          const engine = new CombatEngine(manager.buildBattleSetup(result.encounter));
          const battle = engine.runToCompletion();
          const wasGuardian = tile.type === 'GUARDIAN';
          manager.applyBattleResult(tile.id, result.encounter, battle);
          log.battles += 1;
          if (battle.outcome === 'VICTORY' && wasGuardian) log.guardiansBeaten += 1;
          if (battle.outcome === 'DEFEAT' && !options.restoreHealth) {
            return { log, manager, profile };
          }
          if (battle.outcome === 'DEFEAT') {
            // Keep the orchestration test going past a lost fight.
            for (const army of manager.armies) {
              army.alive = true;
              army.hpRatio = 1;
            }
            manager.fog.clearTile(tile);
          }
          break;
        }
        case 'EVENT': {
          const choice = result.event.choices.find((c) => manager.canChooseEvent(c)) ?? result.event.choices[0]!;
          const resolution = manager.resolveEventChoice(tile.id, result.event.id, choice.id);
          if (resolution.battle) {
            const engine = new CombatEngine(manager.buildBattleSetup(resolution.battle));
            manager.applyBattleResult(null, resolution.battle, engine.runToCompletion());
            manager.fog.clearTile(tile);
            log.battles += 1;
          }
          if (resolution.needsArmyChoice) {
            const hero = manager.mercenaryOptions()[0];
            if (hero) manager.resolveArmyChoice(tile.id, resolution.needsArmyChoice, hero);
          }
          break;
        }
        case 'MERCHANT': {
          const stock = manager.merchantStock(tile.id);
          const affordable = stock.find((item) => item.price <= manager.gold);
          if (affordable) manager.buy(tile.id, affordable.id);
          manager.closeMerchant(tile.id);
          break;
        }
        case 'BLESSING': {
          manager.queueBlessingOffer(result.rarity);
          manager.fog.clearTile(tile);
          break;
        }
        case 'CHOOSE_ARMY': {
          if (result.purpose === 'RECRUITMENT_CAMP') {
            const hero = manager.mercenaryOptions()[0];
            if (hero) manager.resolveArmyChoice(tile.id, result.purpose, hero);
            else manager.fog.clearTile(tile);
          } else {
            const wantsDead = result.purpose === 'RESURRECTION_SHRINE';
            const army = manager.armies.find((a) => (wantsDead ? !a.alive : a.alive));
            if (army) manager.resolveArmyChoice(tile.id, result.purpose, army.id);
            else manager.fog.clearTile(tile);
          }
          break;
        }
        case 'EXIT':
          leftFloor = true;
          break;
        case 'RESOLVED':
        case 'BLOCKED':
          break;
      }

      takePendingReward();
    }

    if (!leftFloor) {
      const front = manager.fog.frontier().map((t) => t.type).join(',');
      const remaining = manager.view.tiles.filter((t) => t.state !== 'CLEARED' && t.type !== 'BLOCKED').length;
      log.stoppedBecause ??= `could not leave floor ${manager.floor}: guardianDefeated=${manager.guardianDefeated}, frontier=[${front}], unresolved=${remaining}`;
      break;
    }

    log.goldEarned = manager.run.runStats.goldCollected;
    log.floorsCleared += 1;

    if (floor >= GameConfig.run.totalFloors) {
      log.won = true;
      break;
    }

    // The floor reward, then descend - exactly what RewardScene does.
    manager.run.pendingReward = manager.isCheckpointFloor()
      ? manager.createCheckpointChest()
      : manager.createBlessingOffer();
    if (manager.pendingReward?.chest) manager.claimCheckpointChest(manager.pendingReward.chest);
    takePendingReward();
    manager.advanceFloor();
    progression.recordFloorReached(manager.run);

    if (options.restoreHealth) {
      for (const army of manager.armies) {
        army.alive = true;
        army.hpRatio = 1;
      }
    }
  }

  return { log, manager, profile };
}

describe('full run orchestration', () => {
  it('plays all 20 floors from start to victory', () => {
    const { log, manager } = playRun(20260420, { restoreHealth: true });

    expect(log.stoppedBecause ?? 'reached the end').toBe('reached the end');
    expect(log.won).toBe(true);
    expect(log.floorsCleared).toBe(GameConfig.run.totalFloors);
    expect(log.guardiansBeaten).toBeGreaterThanOrEqual(18);
    expect(log.battles).toBeGreaterThan(40);
    expect(log.blessingsTaken).toBeGreaterThanOrEqual(20);
    expect(log.goldEarned).toBeGreaterThan(500);
    expect(manager.floor).toBe(GameConfig.run.totalFloors);
  });

  it('never lets the exit open before the guardian falls', () => {
    for (const seed of [1, 2, 3]) {
      const { log } = playRun(seed * 7919, { restoreHealth: true });
      expect(log.exitTakenBeforeGuardian).toBe(false);
    }
  });

  it('is fully deterministic for a given seed', () => {
    const a = playRun(4242, { restoreHealth: true });
    const b = playRun(4242, { restoreHealth: true });
    expect(a.log).toEqual(b.log);
    expect(a.manager.run.blessings).toEqual(b.manager.run.blessings);
    expect(a.manager.run.gold).toBe(b.manager.run.gold);
  });

  it('unlocks the floor-gated heroes along the way', () => {
    const { profile } = playRun(555, { restoreHealth: true });
    expect(profile.unlockedHeroes).toContain('garran'); // Floor 4
    expect(profile.unlockedHeroes).toContain('nyra'); // Floor 8
    expect(profile.unlockedHeroes).toContain('mira'); // Floor 12
    expect(profile.unlockedHeroes).toContain('draven'); // Floor 16
    expect(profile.highestFloor).toBe(GameConfig.run.totalFloors);
  });

  it('resumes a saved run mid-expedition and keeps playing', () => {
    const profile = createDefaultProfile();
    const run = RunManager.createRun(
      { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'NORMAL', ascensionLevel: 0, seed: 8080 },
      profile,
    );
    const manager = new RunManager(run, profile, () => {});

    // Play part of floor 1.
    for (let i = 0; i < 4; i++) {
      const tile = manager.fog.frontier().find((t) => t.type === 'EMPTY' || t.type === 'GOLD');
      if (!tile) break;
      manager.interact(tile.id);
    }
    manager.addGold(50);
    manager.addBlessing('r07_vitality');
    const clearedBefore = manager.view.tiles.filter((t) => t.state === 'CLEARED').length;
    const goldBefore = manager.gold;

    const save = new SaveManager();
    save.profile = profile;
    save.run = run;
    const restored = new SaveManager();
    expect(restored.restore(save.serialize())).toBe(true);

    const resumed = new RunManager(restored.run!, restored.profile, () => {});
    expect(resumed.gold).toBe(goldBefore);
    expect(resumed.view.tiles.filter((t) => t.state === 'CLEARED').length).toBe(clearedBefore);
    expect(resumed.run.blessings.map((b) => b.id)).toContain('r07_vitality');

    // And the resumed run is still playable.
    const frontier = resumed.fog.frontier();
    expect(frontier.length).toBeGreaterThan(0);
    const result = resumed.interact(frontier[0]!.id);
    expect(result.kind).not.toBe('BLOCKED');
  });

  it('ends the run when every army falls', () => {
    const profile = createDefaultProfile();
    const run = RunManager.createRun(
      { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'NORMAL', ascensionLevel: 0, seed: 31337 },
      profile,
    );
    const manager = new RunManager(run, profile, () => {});
    expect(manager.isRunLost()).toBe(false);
    for (const army of manager.armies) {
      army.alive = false;
      army.hpRatio = 0;
    }
    expect(manager.isRunLost()).toBe(true);

    const progression = new ProgressionManager(profile);
    manager.finishRun(false);
    const outcome = progression.completeRun(manager.run, false);
    expect(manager.run.finished).toBe('LOST');
    expect(profile.firstVictory).toBe(false);
    expect(outcome.newRecord).toBe(true);
  });

  it('keeps reserve armies out of combat without changing their persistent HP', () => {
    const profile = createDefaultProfile();
    const run = RunManager.createRun(
      { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'NORMAL', ascensionLevel: 0, seed: 90210 },
      profile,
    );
    const manager = new RunManager(run, profile, () => {});
    const deployed = new Set(manager.armies.slice(0, 2).map((army) => army.id));
    const reserve = manager.armies[2]!;
    reserve.hpRatio = 0.41;
    const encounter = Object.values(manager.run.currentMap!.map.encounters)[0]!;

    const setup = manager.buildBattleSetup(encounter, deployed);
    expect(setup.armies.map((army) => army.armyId)).toEqual(Array.from(deployed));

    const result = new CombatEngine(setup).runToCompletion();
    manager.applyBattleResult(null, encounter, result);
    expect(reserve.hpRatio).toBe(0.41);
    expect(reserve.alive).toBe(true);
  });
});
