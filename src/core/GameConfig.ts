import type { BlessingRarity, RelicRarity } from './types';

/**
 * Central balance configuration.
 *
 * Rule for this project: no gameplay magic numbers anywhere else. If a value
 * influences balance it lives here so it can be tuned in one place (and is
 * mirrored in BALANCE.md).
 */
export const GameConfig = {
  version: '0.1.0',
  saveSchemaVersion: 1,

  run: {
    totalFloors: 20,
    baseArmySlots: 5,
    maxArmySlots: 6,
    formationSlotsPerRow: 4,
    startingGold: 0,
    relicInventorySize: 9,
    /** Blessing offers presented after each floor. */
    rewardChoices: 3,
    /** Free rerolls granted per floor by Tactical Reserve / Kingdom Mastery. */
    baseRerolls: 0,
  },

  /**
   * Floor power curve: 1 + a*(f-1) + b*(f-1)^2
   *
   * The draft's 0.10 / 0.006 curve was an unwinnable stat wall, while the
   * previous x2.10 endpoint removed most early pressure. This middle curve is
   * paired with larger warbands and steeper guardian pressure so route,
   * formation, reserve and sustain decisions matter from Floor 1 onward.
   */
  scaling: {
    linear: 0.038,
    quadratic: 0.0013,
    kindMultiplier: {
      ENEMY: 1.0,
      ELITE: 1.32,
      GUARDIAN: 1.45,
      BOSS: 1.55,
      SUMMON: 0.6,
      HERO: 1,
      MERCENARY: 1,
    } as Record<string, number>,
    /** Enemy HP is scaled a little harder than damage so fights stay readable. */
    enemyHPFactor: 1.4,
    enemyAttackFactor: 2.65,
    /** Defence grows on a softer curve so late floors are not HP sponges. */
    enemyDefenseExponent: 0.55,
    /** Endless keeps growing past floor 20 with an extra per-floor multiplier. */
    endlessExtraPerFloor: 0.045,
  },

  combat: {
    /** Fixed simulation step. Rendering interpolates on top of this. */
    tickRate: 30,
    maxBattleSeconds: 90,
    /** After this point every combatant gains ramping damage to break stalls. */
    stalemateStart: 30,
    stalemateRampPerSecond: 0.05,
    energyMax: 100,
    /**
     * Armies enter a fight already part-charged, and each swing charges them
     * meaningfully. Without this, a 10-second normal battle ends before anyone
     * reaches 100 Energy and active skills never appear outside boss fights.
     */
    startingEnergy: 25,
    energyPerBasicAttack: 14,
    /** Energy gained per 1% of max HP lost. */
    energyPerHPPercentLost: 0.4,
    energyOnDamageCap: 12,
    baseCritDamage: 1.5,
    randomVariance: [0.95, 1.05] as [number, number],
    /** Defence softening constant in damage = raw * K/(K+def). */
    defenseConstant: 100,
    /** Lane geometry in abstract combat units. */
    lane: {
      frontX: 160,
      backX: 268,
      slotSpacing: 104,
      meleeRange: 78,
      /** Closest two units will ever stand, so sprites never fully overlap. */
      minSeparation: 86,
    },
    speeds: [1, 2, 4] as number[],
    /** 4x is unlocked after the first full clear. */
    unlockedSpeedsBeforeVictory: 2,
    /** Guardians and bosses gain this much extra HP so their fights last longer. */
    guardianHPBonus: 1.05,
    /** Relative pressure fades as the normal floor curve takes over. */
    guardianDamageBonus: { floor1: 1.38, floor20: 1.05 },
  },

  blessings: {
    /** Rarity odds per floor band. Bands are [maxFloor, weights]. */
    rarityTable: [
      { maxFloor: 4, weights: { RARE: 75, EPIC: 23, LEGENDARY: 2 } },
      { maxFloor: 8, weights: { RARE: 65, EPIC: 31, LEGENDARY: 4 } },
      { maxFloor: 12, weights: { RARE: 55, EPIC: 38, LEGENDARY: 7 } },
      { maxFloor: 16, weights: { RARE: 45, EPIC: 43, LEGENDARY: 12 } },
      { maxFloor: Infinity, weights: { RARE: 35, EPIC: 45, LEGENDARY: 20 } },
    ] as { maxFloor: number; weights: Record<BlessingRarity, number> }[],
    /** Checkpoint chests bias the roll upward by one band. */
    checkpointBandBonus: 1,
  },

  economy: {
    goldPerEnemy: [10, 25] as [number, number],
    goldPerElite: [30, 60] as [number, number],
    goldPerGuardian: [50, 100] as [number, number],
    goldPerTreasure: [20, 100] as [number, number],
    goldTileAmount: [15, 40] as [number, number],
    checkpointChestGold: [90, 160] as [number, number],
    merchant: {
      itemCount: [3, 4] as [number, number],
      smallHeal: 40,
      largeHeal: 90,
      relic: [50, 100] as [number, number],
      epicRelic: 120,
      blessingReroll: 50,
      randomBlessing: 120,
      buff: 70,
    },
    relicRarityWeights: { COMMON: 62, RARE: 30, EPIC: 8 } as Record<RelicRarity, number>,
  },

  healing: {
    healingFountain: 0.35,
    sacredSpring: 0.12,
    resurrectionShrineHP: 0.35,
    warCampAttack: 0.25,
    /** Cap on how much a heal can overshoot into a shield (Lifebinder). */
    overhealShieldCap: 0.1,
  },

  map: {
    /** Reveal radius around a cleared tile (Chebyshev = 1 means orthogonal + diagonal). */
    revealOrthogonalOnly: true,
    minGuardianDistance: 3,
    minExitDistance: 4,
    /** Generation retries before falling back to a guaranteed-simple layout. */
    maxGenerationAttempts: 60,
    /** Minimum share of the grid that must stay walkable. */
    minOpenRatio: 0.62,
    /** How many independent routes to the guardian the validator requires. */
    requiredRoutes: 2,
    oracleTowerReveals: 12,
    oracleEyeReveals: 10,
  },

  ascension: {
    maxLevel: 10,
    /** Ascension N grants this much extra enemy power per level. */
    powerPerLevel: 0.12,
  },

  endless: {
    unlockAscension: 3,
    bossEveryNFloors: 5,
  },

  meta: {
    crownShardsPerNewFloor: 5,
    crownShardsPerBossFirstKill: 25,
    crownShardsPerAscensionClear: 50,
    crownShardsPerEndlessMilestone: 30,
    endlessMilestoneStep: 10,
  },

  ui: {
    /** Design resolution; the scale manager letterboxes around this. */
    designWidth: 900,
    designHeight: 1600,
    minWidth: 320,
    maxWidth: 1600,
    toastDurationMs: 2200,
  },

  save: {
    /** Debounce window so rapid state changes coalesce into one write. */
    autosaveDebounceMs: 250,
    runKey: 'crownbound.run.v1',
    profileKey: 'crownbound.profile.v1',
  },
} as const;

export type GameConfigType = typeof GameConfig;

/** Power multiplier for a floor, before per-kind multipliers. */
export function floorMultiplier(floor: number): number {
  const f = Math.max(1, floor);
  const base = 1 + GameConfig.scaling.linear * (f - 1) + GameConfig.scaling.quadratic * Math.pow(f - 1, 2);
  if (f <= GameConfig.run.totalFloors) return base;
  // Endless: keep compounding beyond the normal campaign.
  const extra = f - GameConfig.run.totalFloors;
  return base * Math.pow(1 + GameConfig.scaling.endlessExtraPerFloor, extra);
}

/** Total enemy power multiplier including kind and ascension. */
export function encounterMultiplier(floor: number, kind: string, ascensionLevel: number): number {
  const kindMult = GameConfig.scaling.kindMultiplier[kind] ?? 1;
  const asc = 1 + GameConfig.ascension.powerPerLevel * Math.max(0, ascensionLevel);
  return floorMultiplier(floor) * kindMult * asc;
}

/** Guardians teach attrition early without multiplying late-boss damage twice. */
export function guardianDamageMultiplier(floor: number): number {
  const range = GameConfig.combat.guardianDamageBonus;
  const progress = Math.min(1, Math.max(0, (floor - 1) / (GameConfig.run.totalFloors - 1)));
  return range.floor1 + (range.floor20 - range.floor1) * progress;
}

export function blessingRarityWeights(floor: number, bandBonus = 0): Record<BlessingRarity, number> {
  const table = GameConfig.blessings.rarityTable;
  let index = table.findIndex((band) => floor <= band.maxFloor);
  if (index < 0) index = table.length - 1;
  index = Math.min(table.length - 1, index + bandBonus);
  return { ...table[index]!.weights };
}
