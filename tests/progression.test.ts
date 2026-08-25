import { describe, expect, it } from 'vitest';
import type { RunState } from '../src/core/types';
import { ProgressionManager } from '../src/progression/ProgressionManager';
import { createDefaultProfile } from '../src/save/SaveTypes';
import { RunManager } from '../src/run/RunManager';
import { HEROES, STARTER_HERO_IDS, getHero } from '../src/data/heroes';
import { ascension } from '../src/data/ascensions';
import { GameConfig } from '../src/core/GameConfig';
import { generateEncounter } from '../src/map/EncounterGenerator';
import { RNG } from '../src/core/RNG';

function freshRun(profile = createDefaultProfile()): { profile: typeof profile; run: RunState; manager: RunManager } {
  const run = RunManager.createRun(
    { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'NORMAL', ascensionLevel: 0, seed: 4242 },
    profile,
  );
  return { profile, run, manager: new RunManager(run, profile, () => {}) };
}

describe('hero unlocks', () => {
  it('starts with exactly the five starter heroes', () => {
    const profile = createDefaultProfile();
    expect(profile.unlockedHeroes.sort()).toEqual([...STARTER_HERO_IDS].sort());
    expect(profile.unlockedHeroes).toHaveLength(5);
  });

  it('unlocks a floor-gated hero the moment the floor is reached', () => {
    const { profile, run } = freshRun();
    const progression = new ProgressionManager(profile);
    expect(progression.isHeroUnlocked('garran')).toBe(false);

    run.floor = 4;
    const outcome = progression.recordFloorReached(run);
    expect(outcome.heroesUnlocked).toContain('garran');
    expect(progression.isHeroUnlocked('garran')).toBe(true);
    expect(progression.isHeroUnlocked('nyra')).toBe(false);

    run.floor = 8;
    expect(progression.recordFloorReached(run).heroesUnlocked).toContain('nyra');
  });

  it('unlocks stat-gated heroes from lifetime totals', () => {
    const profile = createDefaultProfile();
    const progression = new ProgressionManager(profile);
    profile.totalStats.enemiesDefeated = 499;
    const { run } = freshRun(profile);
    expect(progression.recordFloorReached(run).heroesUnlocked).not.toContain('darius');
    profile.totalStats.enemiesDefeated = 500;
    expect(progression.recordFloorReached(run).heroesUnlocked).toContain('darius');
  });

  it('unlocks the ascension heroes only after the matching clear', () => {
    const profile = createDefaultProfile();
    const progression = new ProgressionManager(profile);
    const { run } = freshRun(profile);
    profile.highestAscension = 1;
    expect(progression.recordFloorReached(run).heroesUnlocked).toContain('thorne');
    expect(progression.isHeroUnlocked('cassia')).toBe(false);
    profile.highestAscension = 2;
    expect(progression.recordFloorReached(run).heroesUnlocked).toContain('cassia');
  });

  it('never unlocks the same hero twice', () => {
    const profile = createDefaultProfile();
    const progression = new ProgressionManager(profile);
    const { run } = freshRun(profile);
    run.floor = 4;
    progression.recordFloorReached(run);
    const second = progression.recordFloorReached(run);
    expect(second.heroesUnlocked).not.toContain('garran');
    expect(profile.unlockedHeroes.filter((id) => id === 'garran')).toHaveLength(1);
  });

  it('reports readable progress for every locked hero', () => {
    const profile = createDefaultProfile();
    const progression = new ProgressionManager(profile);
    for (const entry of progression.heroProgress()) {
      expect(entry.label.length).toBeGreaterThan(3);
      expect(entry.required).toBeGreaterThan(0);
      if (!entry.unlocked) expect(entry.current).toBeLessThan(entry.required);
    }
    expect(progression.heroProgress()).toHaveLength(HEROES.length);
  });
});

describe('first victory and ascension', () => {
  it('unlocks Ascension, Lieutenants and Seraph on the first Floor 20 clear', () => {
    const { profile, run } = freshRun();
    const progression = new ProgressionManager(profile);
    run.floor = GameConfig.run.totalFloors;
    run.finished = 'WON';
    const outcome = progression.completeRun(run, true);

    expect(profile.firstVictory).toBe(true);
    expect(progression.hasFeature('ASCENSION')).toBe(true);
    expect(progression.hasFeature('LIEUTENANTS')).toBe(true);
    expect(outcome.heroesUnlocked).toContain('seraph');
    expect(profile.achievements).toContain('floor_20_clear');
  });

  it('gates the selectable ascension behind the previous clear', () => {
    const profile = createDefaultProfile();
    const progression = new ProgressionManager(profile);
    expect(progression.maxSelectableAscension()).toBe(0);
    profile.firstVictory = true;
    expect(progression.maxSelectableAscension()).toBe(1);
    profile.highestAscension = 3;
    expect(progression.maxSelectableAscension()).toBe(4);
  });

  it('records a cleared ascension and unlocks Endless at III', () => {
    const { profile, run } = freshRun();
    const progression = new ProgressionManager(profile);
    run.ascensionLevel = 3;
    run.floor = 20;
    run.finished = 'WON';
    progression.completeRun(run, true);
    expect(profile.clearedAscensions).toContain(3);
    expect(profile.highestAscension).toBe(3);
    expect(progression.hasFeature('ENDLESS')).toBe(true);
  });

  it('applies ascension rules to generated content', () => {
    const rng = new RNG(99);
    const plain = generateEncounter({ id: 'a', floor: 10, kind: 'ELITE', ascensionLevel: 0 }, rng);
    const high = generateEncounter({ id: 'b', floor: 10, kind: 'ELITE', ascensionLevel: 7 }, new RNG(99));
    const modsOf = (e: typeof plain) => Math.max(...e.units.map((u) => u.eliteModifiers?.length ?? 0));
    expect(ascension(7).eliteModifierCount).toBe(2);
    expect(modsOf(high)).toBeGreaterThan(modsOf(plain));

    // Ascension IV+ gives guardians a modifier of their own.
    const guardian = generateEncounter(
      { id: 'g', floor: 12, kind: 'BOSS', ascensionLevel: 4, bossId: 'the_sorcerer_king' },
      new RNG(3),
    );
    expect(guardian.units[0]?.eliteModifiers?.length).toBeGreaterThan(0);
  });

  it('makes healing nodes rarer from Ascension VI', () => {
    expect(ascension(6).healingNodeMultiplier).toBeLessThan(1);
    expect(ascension(5).healingNodeMultiplier).toBe(1);
  });
});

describe('achievements and mastery', () => {
  it('awards achievements once and grants their Crown Shards', () => {
    const { profile, run } = freshRun();
    const progression = new ProgressionManager(profile);
    run.floor = 8;
    const first = progression.recordFloorReached(run);
    expect(first.achievementsUnlocked).toContain('floor_8');
    expect(profile.crownShards).toBeGreaterThan(0);

    const shardsAfterFirst = profile.crownShards;
    const second = progression.recordFloorReached(run);
    expect(second.achievementsUnlocked).not.toContain('floor_8');
    expect(profile.crownShards).toBe(shardsAfterFirst);
  });

  it('advances hero mastery from run performance', () => {
    const { profile, run } = freshRun();
    const progression = new ProgressionManager(profile);
    expect(profile.heroMastery.auren?.tier).toBe(1);

    run.heroStats.auren = {
      damageDealt: 0,
      damageAbsorbed: 25000,
      healingDone: 0,
      kills: 0,
      skillsCast: 0,
      battlesWon: 0,
    };
    const outcome = progression.completeRun(run, false);
    expect(outcome.masteryUnlocked.some((m) => m.heroId === 'auren' && m.tier === 2)).toBe(true);
    expect(profile.heroMastery.auren?.tier).toBe(2);
  });

  it('never skips a mastery tier', () => {
    const { profile, run } = freshRun();
    const progression = new ProgressionManager(profile);
    // Enough for tier 4's requirement, but tier 2's is unmet.
    run.floor = 20;
    run.heroStats.auren = {
      damageDealt: 0,
      damageAbsorbed: 0,
      healingDone: 0,
      kills: 0,
      skillsCast: 0,
      battlesWon: 0,
    };
    progression.completeRun(run, false);
    expect(profile.heroMastery.auren?.tier).toBe(1);
  });

  it('spends Crown Shards on Kingdom Mastery exactly once', () => {
    const profile = createDefaultProfile();
    const progression = new ProgressionManager(profile);
    profile.crownShards = 100;
    expect(progression.buyMastery('km_gold')).toBe(true);
    expect(profile.crownShards).toBe(60);
    expect(progression.buyMastery('km_gold')).toBe(false);
    expect(profile.kingdomMastery).toEqual(['km_gold']);
    expect(progression.canBuyMastery('km_relic')).toBe(false);
  });

  it('applies Kingdom Mastery to a new run', () => {
    const profile = createDefaultProfile();
    profile.kingdomMastery = ['km_gold', 'km_reroll', 'km_relic'];
    const run = RunManager.createRun(
      { heroIds: STARTER_HERO_IDS.slice(0, 5), mode: 'NORMAL', ascensionLevel: 0, seed: 5 },
      profile,
    );
    expect(run.gold).toBe(25);
    expect(run.flags.rerolls).toBe(1);
    expect(run.relics).toHaveLength(1);
  });

  it('gives every hero a complete, ordered mastery track', () => {
    for (const hero of HEROES) {
      expect(hero.mastery).toHaveLength(5);
      hero.mastery.forEach((tier, index) => {
        expect(tier.tier).toBe(index + 1);
        expect(tier.reward.length).toBeGreaterThan(3);
      });
      expect(getHero(hero.id)).toBe(hero);
    }
  });
});
