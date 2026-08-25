import { describe, expect, it } from 'vitest';
import type { OwnedBlessing } from '../src/core/types';
import { GameConfig, encounterMultiplier, floorMultiplier } from '../src/core/GameConfig';
import { ascension } from '../src/data/ascensions';
import { BLESSINGS } from '../src/data/blessings';
import { buildBattle, makeArmies } from './helpers';

describe('combat engine', () => {
  it('is deterministic for the same seed and formation', () => {
    const run = () => buildBattle({ armies: makeArmies(), floor: 3, kind: 'ENEMY', seed: 31337 }).runToCompletion();
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('produces a different battle for a different seed', () => {
    const a = buildBattle({ armies: makeArmies(), floor: 3, kind: 'ENEMY', seed: 1 }).runToCompletion();
    const b = buildBattle({ armies: makeArmies(), floor: 3, kind: 'ENEMY', seed: 2 }).runToCompletion();
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('always reaches a conclusion inside the battle time limit', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const floor of [1, 8, 15, 20]) {
        const result = buildBattle({ armies: makeArmies(), floor, kind: 'ELITE', seed }).runToCompletion();
        expect(['VICTORY', 'DEFEAT']).toContain(result.outcome);
        expect(result.durationSeconds).toBeLessThanOrEqual(GameConfig.combat.maxBattleSeconds + 1);
      }
    }
  });

  it('carries damage out of the battle so health is persistent', () => {
    const armies = makeArmies();
    const result = buildBattle({ armies, floor: 6, kind: 'ELITE', seed: 4242 }).runToCompletion();
    for (const entry of result.armies) {
      const army = armies.find((a) => a.id === entry.armyId)!;
      army.hpRatio = entry.hpRatio;
      army.alive = entry.alive;
    }
    expect(armies.some((a) => a.hpRatio < 1)).toBe(true);

    // The follow-up fight starts from the damaged state, not from full health.
    const engine = buildBattle({ armies, floor: 6, kind: 'ENEMY', seed: 99 });
    const wounded = engine.snapshot().filter((c) => c.isPlayer);
    for (const combatant of wounded) {
      const army = armies.find((a) => a.id === combatant.armyId)!;
      expect(combatant.currentHP / combatant.stats.maxHP).toBeCloseTo(army.hpRatio, 1);
    }
  });

  it('starts armies in the row they were assigned', () => {
    const armies = makeArmies();
    armies[0]!.row = 'BACK';
    armies[0]!.slot = 3;
    const engine = buildBattle({ armies, floor: 2, kind: 'ENEMY', seed: 5 });
    const combatant = engine.snapshot().find((c) => c.armyId === armies[0]!.id)!;
    expect(combatant.row).toBe('BACK');
    expect(combatant.x).toBeLessThan(-GameConfig.combat.lane.frontX);
  });

  it('makes the front row absorb more damage than the back row', () => {
    let frontDamage = 0;
    let backDamage = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const armies = makeArmies();
      const engine = buildBattle({ armies, floor: 5, kind: 'ENEMY', seed });
      engine.runToCompletion();
      for (const combatant of engine.snapshot()) {
        if (!combatant.isPlayer) continue;
        if (combatant.row === 'FRONT') frontDamage += combatant.damageTaken;
        else backDamage += combatant.damageTaken;
      }
    }
    expect(frontDamage).toBeGreaterThan(backDamage);
  });

  it('scales enemies up with the floor', () => {
    const low = buildBattle({ armies: makeArmies(), floor: 1, kind: 'ENEMY', seed: 8 });
    const high = buildBattle({ armies: makeArmies(), floor: 18, kind: 'ENEMY', seed: 8 });
    const hpOf = (engine: typeof low) =>
      engine.snapshot().filter((c) => !c.isPlayer).reduce((sum, c) => sum + c.stats.maxHP, 0);
    expect(hpOf(high)).toBeGreaterThan(hpOf(low) * 1.5);
    expect(floorMultiplier(18)).toBeGreaterThan(floorMultiplier(1));
  });

  it('applies ascension power on top of floor scaling', () => {
    const normal = encounterMultiplier(10, 'ENEMY', 0);
    const ascended = encounterMultiplier(10, 'ENEMY', 5);
    expect(ascended / normal).toBeCloseTo(1 + GameConfig.ascension.powerPerLevel * 5, 5);

    const base = buildBattle({ armies: makeArmies(), floor: 10, kind: 'ENEMY', seed: 3, ascensionLevel: 0 });
    const hard = buildBattle({ armies: makeArmies(), floor: 10, kind: 'ENEMY', seed: 3, ascensionLevel: 5 });
    const attackOf = (engine: typeof base) =>
      engine.snapshot().filter((c) => !c.isPlayer).reduce((sum, c) => sum + c.stats.attack, 0);
    expect(attackOf(hard)).toBeGreaterThan(attackOf(base));
  });

  it('gives elite warbands a modifier-carrying leader and more power', () => {
    // Elites are stronger by kind multiplier and always field a modified unit.
    expect(GameConfig.scaling.kindMultiplier.ELITE).toBeGreaterThan(GameConfig.scaling.kindMultiplier.ENEMY);
    expect(GameConfig.scaling.kindMultiplier.GUARDIAN).toBeGreaterThan(GameConfig.scaling.kindMultiplier.ELITE);

    for (let seed = 1; seed <= 10; seed++) {
      const elite = buildBattle({ armies: makeArmies(), floor: 9, kind: 'ELITE', seed });
      expect(elite.snapshot().some((c) => !c.isPlayer && c.kind === 'ELITE')).toBe(true);
    }
  });

  it('runs boss phases and summons reinforcements', () => {
    const engine = buildBattle({
      armies: makeArmies(),
      floor: 16,
      kind: 'BOSS',
      seed: 12,
      bossId: 'the_fallen_general',
    });
    const before = engine.snapshot().filter((c) => !c.isPlayer).length;
    engine.runToCompletion();
    const after = engine.snapshot().filter((c) => !c.isPlayer).length;
    expect(after).toBeGreaterThan(before);
    expect(engine.log.some((entry) => entry.type === 'PHASE')).toBe(true);
  });

  it('honours ascension X adding the fourth boss phase', () => {
    expect(ascension(10).bossExtraPhase).toBe(true);
    expect(ascension(9).bossExtraPhase).toBe(false);
  });

  it('casts active skills in an ordinary battle, not just long ones', () => {
    let battlesWithSkills = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const engine = buildBattle({ armies: makeArmies(), floor: 4, kind: 'ENEMY', seed });
      engine.runToCompletion();
      if (engine.result().armies.some((a) => a.skillsCast > 0)) battlesWithSkills += 1;
    }
    // Skills are a core mechanic: they must show up in normal fights.
    expect(battlesWithSkills).toBeGreaterThanOrEqual(10);
  });
});

describe('blessing effects', () => {
  const stack = (id: string, stacks = 1): OwnedBlessing[] => [{ id, stacks }];

  it('MODIFY_STAT raises the stat it names', () => {
    const plain = buildBattle({ armies: makeArmies(), floor: 5, kind: 'ENEMY', seed: 11 });
    const buffed = buildBattle({
      armies: makeArmies(),
      floor: 5,
      kind: 'ENEMY',
      seed: 11,
      blessings: stack('r01_sharpened_steel', 3),
    });
    const attackOf = (e: typeof plain) =>
      e.snapshot().filter((c) => c.isPlayer).reduce((sum, c) => sum + c.stats.attack, 0);
    expect(attackOf(buffed)).toBeCloseTo(attackOf(plain) * 1.3, 0);
  });

  it('row-scoped blessings only touch that row', () => {
    const engine = buildBattle({
      armies: makeArmies(),
      floor: 5,
      kind: 'ENEMY',
      seed: 11,
      blessings: stack('e02_vanguard'),
    });
    const base = buildBattle({ armies: makeArmies(), floor: 5, kind: 'ENEMY', seed: 11 });
    for (const combatant of engine.snapshot().filter((c) => c.isPlayer)) {
      const plain = base.snapshot().find((c) => c.armyId === combatant.armyId)!;
      if (combatant.row === 'FRONT') expect(combatant.stats.defense).toBeGreaterThan(plain.stats.defense);
      else expect(combatant.stats.defense).toBeCloseTo(plain.stats.defense, 5);
    }
  });

  it('conditional blessings only apply while their condition holds', () => {
    // Five Crowns needs five living armies.
    const five = buildBattle({
      armies: makeArmies(),
      floor: 5,
      kind: 'ENEMY',
      seed: 3,
      blessings: stack('l04_five_crowns'),
    });
    const four = buildBattle({
      armies: makeArmies(['auren', 'borin', 'lyra', 'kael']),
      floor: 5,
      kind: 'ENEMY',
      seed: 3,
      blessings: stack('l04_five_crowns'),
    });
    const auren5 = five.snapshot().find((c) => c.defId === 'auren')!;
    const auren4 = four.snapshot().find((c) => c.defId === 'auren')!;
    expect(auren5.stats.attack).toBeGreaterThan(auren4.stats.attack);
  });

  it('battle-start shields absorb damage before health', () => {
    const engine = buildBattle({
      armies: makeArmies(),
      floor: 5,
      kind: 'ENEMY',
      seed: 6,
      blessings: stack('l07_royal_guard'),
    });
    const front = engine.snapshot().filter((c) => c.isPlayer && c.row === 'FRONT');
    expect(front.every((c) => c.shield > 0)).toBe(true);
  });

  it('Phoenix Oath revives at most once per floor', () => {
    const armies = makeArmies();
    // Send in a single very fragile army against a heavy floor.
    const solo = [armies[2]!];
    solo[0]!.hpRatio = 0.05;
    const engine = buildBattle({
      armies: solo,
      floor: 18,
      kind: 'ELITE',
      seed: 5,
      blessings: [{ id: 'l01_phoenix_oath', stacks: 1 }],
    });
    engine.runToCompletion();
    const revives = engine.log.filter((entry) => entry.type === 'REVIVE').length;
    expect(revives).toBeLessThanOrEqual(1);
  });

  it('Blood Pact trades healing for attack', () => {
    const engine = buildBattle({
      armies: makeArmies(),
      floor: 5,
      kind: 'ENEMY',
      seed: 9,
      blessings: stack('l05_blood_pact'),
    });
    const plain = buildBattle({ armies: makeArmies(), floor: 5, kind: 'ENEMY', seed: 9 });
    const a = engine.snapshot().find((c) => c.defId === 'borin')!;
    const b = plain.snapshot().find((c) => c.defId === 'borin')!;
    expect(a.stats.attack).toBeGreaterThan(b.stats.attack * 1.35);
    expect(a.healReceivedMods.length).toBeGreaterThan(0);
  });

  it('Sixth Banner is the only source of a sixth army slot', () => {
    const granting = BLESSINGS.filter((b) => b.effects.some((e) => e.type === 'GRANT_ARMY_SLOT'));
    expect(granting.map((b) => b.id)).toEqual(['l10_sixth_banner']);
    expect(GameConfig.run.maxArmySlots).toBe(GameConfig.run.baseArmySlots + 1);
  });
});
