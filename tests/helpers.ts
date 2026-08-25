import type { ArmyRunState, OwnedBlessing, Row } from '../src/core/types';
import { RNG } from '../src/core/RNG';
import { CombatEngine, type BattleSetup } from '../src/combat/CombatEngine';
import { generateEncounter } from '../src/map/EncounterGenerator';
import { resolveArmyStats } from '../src/run/StatResolver';
import { getHero } from '../src/data/heroes';
import { autoAssign } from '../src/combat/Formation';

export const STARTER_TEAM = ['auren', 'borin', 'lyra', 'kael', 'elara'];

export function makeArmies(heroIds: string[] = STARTER_TEAM, hpRatio = 1): ArmyRunState[] {
  const placement = autoAssign(heroIds.map((id) => ({ id, preferredRow: getHero(id).preferredRow })));
  return heroIds.map((heroId) => {
    const slot = placement.get(heroId)!;
    return {
      id: `army_${heroId}`,
      heroId,
      hpRatio,
      alive: true,
      row: slot.row as Row,
      slot: slot.slot,
      floorModifiers: [],
      battleModifiers: [],
    };
  });
}

export function buildBattle(options: {
  armies: ArmyRunState[];
  floor: number;
  kind: 'ENEMY' | 'ELITE' | 'GUARDIAN' | 'BOSS';
  seed: number;
  blessings?: OwnedBlessing[];
  ascensionLevel?: number;
  bossId?: string;
}): CombatEngine {
  const rng = new RNG(options.seed);
  const encounter = generateEncounter(
    {
      id: 'test',
      floor: options.floor,
      kind: options.kind,
      ascensionLevel: options.ascensionLevel ?? 0,
      ...(options.bossId ? { bossId: options.bossId } : {}),
    },
    rng,
  );
  const setup: BattleSetup = {
    seed: options.seed,
    floor: options.floor,
    ascensionLevel: options.ascensionLevel ?? 0,
    mode: 'NORMAL',
    armies: options.armies
      .filter((a) => a.alive)
      .map((army) => {
        const stats = resolveArmyStats(army, 1, []);
        return {
          armyId: army.id,
          heroId: army.heroId,
          row: army.row,
          slot: army.slot,
          currentHP: stats.maxHP * army.hpRatio,
          stats,
        };
      }),
    encounter,
    blessings: options.blessings ?? [],
    heroMastery: {},
  };
  return new CombatEngine(setup);
}
