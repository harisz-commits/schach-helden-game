import type { EliteModifierDefinition, EnemyDefinition } from '../core/types';
import { RANGE, stats } from './util';

/**
 * Enemy roster. `weight` drives how often a type is rolled for a floor,
 * `minFloor` gates the nastier types behind later biomes.
 */
export const ENEMIES: EnemyDefinition[] = [
  {
    id: 'swordsman',
    name: 'Swordsman',
    role: 'BRUISER',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 760, attack: 74, defense: 34, attackSpeed: 1.0, range: RANGE.MELEE, movementSpeed: 112 }),
    targeting: 'NEAREST',
    weight: 100,
    minFloor: 1,
    art: { color: 0x9c8b73, accent: 0xd0d0d0, shape: 'BLADE' },
  },
  {
    id: 'shieldbearer',
    name: 'Shieldbearer',
    role: 'TANK',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 1180, attack: 50, defense: 62, attackSpeed: 0.8, range: RANGE.MELEE, movementSpeed: 92 }),
    targeting: 'NEAREST',
    weight: 80,
    minFloor: 1,
    art: { color: 0x7c7f86, accent: 0xb8a06a, shape: 'BULWARK' },
    passiveSkills: [
      {
        id: 'shieldbearer_bulwark',
        name: 'Bulwark',
        description: 'Reduces damage taken by 10%.',
        effects: [{ type: 'DAMAGE_REDUCTION', target: { scope: 'SELF' }, value: 0.1 }],
      },
    ],
  },
  {
    id: 'archer',
    name: 'Archer',
    role: 'ARCHER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 560, attack: 82, defense: 22, attackSpeed: 1.05, range: RANGE.LONG, movementSpeed: 104 }),
    targeting: 'NEAREST',
    weight: 90,
    minFloor: 1,
    art: { color: 0x6f8f5c, accent: 0xd8c48a, shape: 'BOW' },
  },
  {
    id: 'spearman',
    name: 'Spearman',
    role: 'BRUISER',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 820, attack: 70, defense: 38, attackSpeed: 0.92, range: RANGE.REACH, movementSpeed: 106 }),
    targeting: 'NEAREST',
    weight: 85,
    minFloor: 1,
    art: { color: 0x8a7a5c, accent: 0xc0c0c0, shape: 'LANCE' },
  },
  {
    id: 'crossbowman',
    name: 'Crossbowman',
    role: 'ARCHER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 620, attack: 104, defense: 24, attackSpeed: 0.7, range: RANGE.LONG, movementSpeed: 96 }),
    targeting: 'LOWEST_HP_ABSOLUTE',
    weight: 70,
    minFloor: 3,
    art: { color: 0x5e6f74, accent: 0xd8c48a, shape: 'BOW' },
  },
  {
    id: 'berserker',
    name: 'Berserker',
    role: 'BRUISER',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 880, attack: 98, defense: 24, attackSpeed: 1.2, range: RANGE.MELEE, movementSpeed: 132 }),
    targeting: 'LOWEST_HP_PERCENT',
    weight: 70,
    minFloor: 3,
    art: { color: 0xa04b3c, accent: 0xe0b070, shape: 'BLADE' },
    passiveSkills: [
      {
        id: 'berserker_rage',
        name: 'Rage',
        description: 'Below 50% HP, gains 35% Attack Speed.',
        effects: [
          {
            type: 'MODIFY_STAT',
            stat: 'attackSpeed',
            mode: 'PERCENT',
            value: 0.35,
            target: { scope: 'SELF' },
            conditions: [{ type: 'SELF_HP_BELOW', value: 0.5 }],
          },
        ],
      },
    ],
  },
  {
    id: 'knight',
    name: 'Knight',
    role: 'TANK',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 1320, attack: 84, defense: 58, attackSpeed: 0.85, range: RANGE.MELEE, movementSpeed: 100 }),
    targeting: 'HIGHEST_ATTACK',
    weight: 65,
    minFloor: 5,
    art: { color: 0x5c6b8a, accent: 0xd8c48a, shape: 'BULWARK' },
    activeSkill: {
      id: 'knight_charge',
      name: 'Shield Charge',
      description: 'Slams a target for 160% Attack.',
      castTime: 0.3,
      effects: [{ type: 'DAMAGE', target: { scope: 'CURRENT_TARGET' }, magnitude: 'ATTACK', value: 1.6 }],
    },
  },
  {
    id: 'assassin',
    name: 'Assassin',
    role: 'ASSASSIN',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 640, attack: 112, defense: 20, attackSpeed: 1.25, critChance: 0.15, range: RANGE.MELEE, movementSpeed: 175 }),
    targeting: 'BACKLINE_FIRST',
    weight: 60,
    minFloor: 4,
    art: { color: 0x3b3547, accent: 0x8f4fbd, shape: 'BLADE' },
  },
  {
    id: 'fire_mage',
    name: 'Fire Mage',
    role: 'CASTER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 580, attack: 66, defense: 20, attackSpeed: 0.75, skillPower: 118, range: RANGE.MID, movementSpeed: 92 }),
    targeting: 'NEAREST',
    weight: 65,
    minFloor: 3,
    art: { color: 0xb5502f, accent: 0xf0a24a, shape: 'STAFF' },
    activeSkill: {
      id: 'fire_mage_blast',
      name: 'Flame Burst',
      description: 'Deals 130% Skill Power to 2 armies.',
      castTime: 0.5,
      effects: [
        { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 2, sort: 'NEAREST' }, magnitude: 'SKILL_POWER', value: 1.3 },
      ],
    },
  },
  {
    id: 'frost_mage',
    name: 'Frost Mage',
    role: 'CASTER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 600, attack: 62, defense: 22, attackSpeed: 0.75, skillPower: 104, range: RANGE.MID, movementSpeed: 92 }),
    targeting: 'HIGHEST_ATTACK',
    weight: 60,
    minFloor: 6,
    art: { color: 0x4f8fb5, accent: 0xcfe8f5, shape: 'STAFF' },
    activeSkill: {
      id: 'frost_mage_chill',
      name: 'Deep Chill',
      description: 'Deals 105% Skill Power and slows the target by 25% Attack Speed for 5s.',
      castTime: 0.5,
      effects: [
        { type: 'DAMAGE', target: { scope: 'CURRENT_TARGET' }, magnitude: 'SKILL_POWER', value: 1.05 },
        {
          type: 'MODIFY_STAT',
          stat: 'attackSpeed',
          mode: 'PERCENT',
          value: -0.25,
          duration: 5,
          target: { scope: 'CURRENT_TARGET' },
          meta: { debuff: true },
        },
      ],
    },
  },
  {
    id: 'healer',
    name: 'Battle Healer',
    role: 'HEALER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 700, attack: 48, defense: 26, attackSpeed: 0.8, skillPower: 96, healingPower: 1.1, range: RANGE.MID, movementSpeed: 96 }),
    targeting: 'NEAREST',
    weight: 45,
    minFloor: 4,
    art: { color: 0x8fb59c, accent: 0xf2e2b8, shape: 'CHALICE' },
    activeSkill: {
      id: 'healer_mend',
      name: 'Mend',
      description: 'Heals the most wounded ally for 18% Max HP.',
      castTime: 0.4,
      effects: [
        { type: 'HEAL', target: { scope: 'ALLIES', count: 1, sort: 'LOWEST_HP_PERCENT' }, magnitude: 'MAX_HP', value: 0.18 },
      ],
    },
  },
  {
    id: 'priest',
    name: 'Dark Priest',
    role: 'HEALER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 760, attack: 56, defense: 30, attackSpeed: 0.78, skillPower: 110, healingPower: 1.2, range: RANGE.MID, movementSpeed: 94 }),
    targeting: 'LOWEST_HP_PERCENT',
    weight: 40,
    minFloor: 9,
    art: { color: 0x5b3f6e, accent: 0xd9a441, shape: 'CHALICE' },
    activeSkill: {
      id: 'priest_benediction',
      name: 'Benediction',
      description: 'Heals two allies for 14% Max HP and grants them 12% Defense for 6s.',
      castTime: 0.45,
      effects: [
        { type: 'HEAL', target: { scope: 'ALLIES', count: 2, sort: 'LOWEST_HP_PERCENT' }, magnitude: 'MAX_HP', value: 0.14 },
        { type: 'MODIFY_STAT', stat: 'defense', mode: 'PERCENT', value: 0.12, duration: 6, target: { scope: 'ALLIES', count: 2, sort: 'LOWEST_HP_PERCENT' } },
      ],
    },
  },
  {
    id: 'summoner',
    name: 'Summoner',
    role: 'SUMMONER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 720, attack: 58, defense: 26, attackSpeed: 0.7, skillPower: 92, range: RANGE.MID, movementSpeed: 90 }),
    targeting: 'NEAREST',
    weight: 40,
    minFloor: 7,
    art: { color: 0x4a5b3f, accent: 0x9fd06a, shape: 'STAFF' },
    activeSkill: {
      id: 'summoner_call',
      name: 'Call of the Grave',
      description: 'Summons a shade to fight alongside the warband.',
      castTime: 0.6,
      effects: [
        { type: 'DAMAGE', target: { scope: 'CURRENT_TARGET' }, magnitude: 'SKILL_POWER', value: 0.7 },
        { type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { summon: 'shade', count: 1 }, oncePer: 'BATTLE' },
      ],
    },
  },
  {
    id: 'royal_guard',
    name: 'Royal Guard',
    role: 'TANK',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 1520, attack: 96, defense: 72, attackSpeed: 0.85, range: RANGE.MELEE, movementSpeed: 98 }),
    targeting: 'FRONTLINE_FIRST',
    weight: 45,
    minFloor: 11,
    art: { color: 0xa8873f, accent: 0xf2e2b8, shape: 'BULWARK' },
    activeSkill: {
      id: 'royal_guard_decree',
      name: 'Royal Decree',
      description: 'Gains 30% damage reduction for 5s and strikes for 140% Attack.',
      castTime: 0.35,
      effects: [
        { type: 'DAMAGE_REDUCTION', target: { scope: 'SELF' }, value: 0.3, duration: 5 },
        { type: 'DAMAGE', target: { scope: 'CURRENT_TARGET' }, magnitude: 'ATTACK', value: 1.4 },
      ],
    },
  },
  {
    id: 'war_beast',
    name: 'War Beast',
    role: 'BEAST',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 1420, attack: 118, defense: 40, attackSpeed: 0.95, range: RANGE.MELEE, movementSpeed: 142 }),
    targeting: 'RANDOM',
    weight: 50,
    minFloor: 8,
    art: { color: 0x6b4436, accent: 0xc9743a, shape: 'LANCE' },
    activeSkill: {
      id: 'war_beast_maul',
      name: 'Maul',
      description: 'Savages two armies for 145% Attack.',
      castTime: 0.35,
      effects: [
        { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 2, sort: 'NEAREST' }, magnitude: 'ATTACK', value: 1.45 },
      ],
    },
  },
  {
    id: 'shade',
    name: 'Shade',
    role: 'ASSASSIN',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 420, attack: 78, defense: 14, attackSpeed: 1.15, range: RANGE.MELEE, movementSpeed: 160 }),
    targeting: 'LOWEST_HP_PERCENT',
    weight: 0,
    minFloor: 1,
    art: { color: 0x2b2b38, accent: 0x7a6ad0, shape: 'BLADE' },
  },
];

export const ENEMIES_BY_ID: Record<string, EnemyDefinition> = Object.fromEntries(
  ENEMIES.map((enemy) => [enemy.id, enemy]),
);

export function getEnemy(id: string): EnemyDefinition {
  const enemy = ENEMIES_BY_ID[id];
  if (!enemy) throw new Error(`Unknown enemy: ${id}`);
  return enemy;
}

/** Enemies eligible for random population of a floor. */
export function enemyPool(floor: number): EnemyDefinition[] {
  return ENEMIES.filter((enemy) => enemy.weight > 0 && enemy.minFloor <= floor);
}

/* ------------------------------------------------------------------ */
/* Elite modifiers                                                     */
/* ------------------------------------------------------------------ */

export const ELITE_MODIFIERS: EliteModifierDefinition[] = [
  {
    id: 'ARMORED',
    name: 'Armored',
    description: '+40% Defense',
    effects: [{ type: 'MODIFY_STAT', stat: 'defense', mode: 'PERCENT', value: 0.4, target: { scope: 'SELF' } }],
  },
  {
    id: 'FRENZIED',
    name: 'Frenzied',
    description: 'Below 50% HP: +50% Attack Speed',
    effects: [
      {
        type: 'MODIFY_STAT',
        stat: 'attackSpeed',
        mode: 'PERCENT',
        value: 0.5,
        target: { scope: 'SELF' },
        conditions: [{ type: 'SELF_HP_BELOW', value: 0.5 }],
      },
    ],
  },
  {
    id: 'VAMPIRIC',
    name: 'Vampiric',
    description: 'Heals for 20% of damage dealt',
    effects: [{ type: 'LIFESTEAL', target: { scope: 'SELF' }, value: 0.2 }],
  },
  {
    id: 'REFLECTIVE',
    name: 'Reflective',
    description: 'Reflects 15% of damage taken',
    effects: [{ type: 'REFLECT', target: { scope: 'SELF' }, value: 0.15 }],
  },
  {
    id: 'BERSERKER',
    name: 'Berserker',
    description: 'Each kill grants +25% Attack',
    effects: [
      {
        type: 'MODIFY_STAT',
        trigger: 'ON_KILL',
        stat: 'attack',
        mode: 'PERCENT',
        value: 0.25,
        target: { scope: 'SELF' },
        meta: { maxStacks: 4 },
      },
    ],
  },
  {
    id: 'ARCANE',
    name: 'Arcane',
    description: '+40% Skill Power',
    effects: [{ type: 'MODIFY_STAT', stat: 'skillPower', mode: 'PERCENT', value: 0.4, target: { scope: 'SELF' } }],
  },
  {
    id: 'REGENERATING',
    name: 'Regenerating',
    description: 'Restores 1% Max HP per second',
    effects: [
      { type: 'HEAL', target: { scope: 'SELF' }, magnitude: 'MAX_HP', value: 0.01, meta: { perSecond: true } },
    ],
  },
  {
    id: 'SWIFT',
    name: 'Swift',
    description: '+30% Movement and Attack Speed',
    effects: [
      { type: 'MODIFY_STAT', stat: 'movementSpeed', mode: 'PERCENT', value: 0.3, target: { scope: 'SELF' } },
      { type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT', value: 0.3, target: { scope: 'SELF' } },
    ],
  },
  {
    id: 'FORTIFIED',
    name: 'Fortified',
    description: 'Takes 40% less damage for the first 10 seconds',
    effects: [
      {
        type: 'DAMAGE_REDUCTION',
        target: { scope: 'SELF' },
        value: 0.4,
        conditions: [{ type: 'BATTLE_TIME_BEFORE', value: 10 }],
      },
    ],
  },
  {
    id: 'CURSED',
    name: 'Cursed',
    description: 'Reduces healing your armies receive by 30%',
    effects: [
      { type: 'HEAL_RECEIVED_MOD', target: { scope: 'ENEMIES' }, value: -0.3 },
    ],
  },
];

export const ELITE_MODIFIERS_BY_ID: Record<string, EliteModifierDefinition> = Object.fromEntries(
  ELITE_MODIFIERS.map((mod) => [mod.id, mod]),
);
