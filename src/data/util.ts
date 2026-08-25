import type { CombatStats, EffectDefinition, MasteryChallenge, MasteryTier } from '../core/types';

export const RANGE = {
  MELEE: 78,
  REACH: 150,
  MID: 240,
  LONG: 340,
} as const;

const DEFAULT_STATS: CombatStats = {
  maxHP: 1200,
  attack: 110,
  defense: 55,
  attackSpeed: 1,
  critChance: 0.05,
  critDamage: 1.5,
  skillPower: 110,
  energyGeneration: 1,
  healingPower: 1,
  range: RANGE.MELEE,
  movementSpeed: 110,
};

/** Builds a full stat block from a partial override. */
export function stats(overrides: Partial<CombatStats>): CombatStats {
  return { ...DEFAULT_STATS, ...overrides };
}

export interface MasteryInput {
  label: string;
  challenge: MasteryChallenge;
  reward: string;
  effects?: EffectDefinition[];
}

/** Compact builder for the five mastery tiers every hero owns. */
export function mastery(entries: MasteryInput[]): MasteryTier[] {
  return entries.map((entry, index) => ({
    tier: index + 1,
    label: entry.label,
    challenge: entry.challenge,
    reward: entry.reward,
    effects: entry.effects ?? [],
  }));
}

/** Shorthand for a permanent percent stat modifier on the owner. */
export function statBuff(stat: CombatStats extends never ? never : keyof CombatStats, value: number): EffectDefinition {
  return { type: 'MODIFY_STAT', stat, mode: 'PERCENT', value, target: { scope: 'SELF' } };
}
