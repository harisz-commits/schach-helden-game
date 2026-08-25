import type { HeroDefinition } from '../core/types';
import { RANGE, mastery, stats } from './util';

/**
 * The full CROWNBOUND roster.
 *
 * Adding a hero means adding one entry here - the combat engine, unlock
 * manager and mastery system all read from these definitions.
 */
export const HEROES: HeroDefinition[] = [
  /* ---------------------------------------------------------------- */
  {
    id: 'auren',
    name: 'Auren',
    title: 'Shield of the Dawn',
    heroClass: 'GUARDIAN',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 17500, attack: 92, defense: 88, attackSpeed: 0.85, skillPower: 95, range: RANGE.MELEE, movementSpeed: 95 }),
    art: { color: 0x4f7fb5, accent: 0xe0c273, shape: 'BULWARK' },
    lore: 'First to the wall, last to leave it.',
    activeSkill: {
      id: 'auren_shield_wall',
      name: 'Shield Wall',
      description: 'Auren gains 45% damage reduction for 4s. Front row allies gain 15%.',
      castTime: 0.35,
      effects: [
        { type: 'DAMAGE_REDUCTION', target: { scope: 'SELF' }, value: 0.45, duration: 4 },
        { type: 'DAMAGE_REDUCTION', target: { scope: 'ALLIES', row: 'FRONT' }, value: 0.15, duration: 4 },
      ],
    },
    passiveSkills: [
      {
        id: 'auren_unyielding',
        name: 'Unyielding',
        description: 'Below 40% HP, Auren gains 30% Defense.',
        effects: [
          {
            type: 'MODIFY_STAT',
            stat: 'defense',
            mode: 'PERCENT',
            value: 0.3,
            target: { scope: 'SELF' },
            conditions: [{ type: 'SELF_HP_BELOW', value: 0.4 }],
          },
        ],
      },
    ],
    unlockCondition: { type: 'STARTER', label: 'Available from the start' },
    mastery: mastery([
      { label: 'Recruit Auren', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Absorb 20,000 damage',
        challenge: { type: 'DAMAGE_ABSORBED', value: 20000 },
        reward: 'Shield Wall duration +1s',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillDurationBonus', value: 1 } }],
      },
      {
        label: 'Win 30 battles',
        challenge: { type: 'BATTLES_WON', value: 30 },
        reward: 'Shield Wall effects +12%',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.12 } }],
      },
      {
        label: 'Reach Floor 16 with Auren',
        challenge: { type: 'REACH_FLOOR_WITH', value: 16 },
        reward: 'Damage taken while shielded generates +6 Energy',
        effects: [
          {
            type: 'ENERGY',
            trigger: 'ON_DAMAGE_TAKEN',
            target: { scope: 'SELF' },
            value: 6,
          },
        ],
      },
      {
        label: 'Complete Ascension III with Auren',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 3 },
        reward: 'Shield Wall also protects the back row',
        effects: [{ type: 'DAMAGE_REDUCTION', trigger: 'ON_SKILL_CAST', target: { scope: 'ALLIES', row: 'BACK' }, value: 0.15, duration: 4 }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'borin',
    name: 'Borin',
    title: 'Axe of the Broken Oath',
    heroClass: 'WARRIOR',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 14200, attack: 138, defense: 62, attackSpeed: 0.95, skillPower: 120, range: RANGE.MELEE, movementSpeed: 112 }),
    art: { color: 0xa8503c, accent: 0xe0c273, shape: 'BLADE' },
    lore: 'He swore to guard a king who no longer exists.',
    activeSkill: {
      id: 'borin_cleave',
      name: 'Cleave',
      description: 'Deals 180% Attack to up to 3 enemies in front of Borin.',
      castTime: 0.3,
      effects: [
        {
          type: 'DAMAGE',
          target: { scope: 'ENEMIES', count: 3, sort: 'NEAREST', frontalOnly: true },
          magnitude: 'ATTACK',
          value: 1.8,
        },
      ],
    },
    passiveSkills: [
      {
        id: 'borin_executioner',
        name: 'Executioner',
        description: '+25% damage against enemies below 35% HP.',
        effects: [
          {
            type: 'DAMAGE_AMP',
            target: { scope: 'SELF' },
            value: 0.25,
            meta: { targetHPBelow: 0.35 },
          },
        ],
      },
    ],
    unlockCondition: { type: 'STARTER', label: 'Available from the start' },
    mastery: mastery([
      { label: 'Recruit Borin', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Deal 60,000 damage',
        challenge: { type: 'DAMAGE_DEALT', value: 60000 },
        reward: 'Cleave effects +14%',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.14 } }],
      },
      {
        label: 'Defeat 200 enemies',
        challenge: { type: 'ENEMIES_DEFEATED', value: 200 },
        reward: '+15% damage against enemies below 50% HP',
        effects: [{ type: 'DAMAGE_AMP', target: { scope: 'SELF' }, value: 0.15, meta: { targetHPBelow: 0.5 } }],
      },
      {
        label: 'Reach Floor 14 with Borin',
        challenge: { type: 'REACH_FLOOR_WITH', value: 14 },
        reward: 'Cleave hits one more enemy',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }],
      },
      {
        label: 'Complete Ascension III with Borin',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 3 },
        reward: 'Kills refund 35 Energy',
        effects: [{ type: 'ENERGY', trigger: 'ON_KILL', target: { scope: 'SELF' }, value: 35 }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'lyra',
    name: 'Lyra',
    title: 'The Long Sight',
    heroClass: 'RANGER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 9800, attack: 142, defense: 38, attackSpeed: 1.1, critChance: 0.1, skillPower: 118, range: RANGE.LONG, movementSpeed: 105 }),
    art: { color: 0x5d9b62, accent: 0xe0c273, shape: 'BOW' },
    lore: 'She counts the seconds between heartbeats, and fires between them.',
    activeSkill: {
      id: 'lyra_piercing_arrow',
      name: 'Piercing Arrow',
      description: 'A shot that punches through the line: 220% Attack to the main target, 110% to two more behind it.',
      castTime: 0.3,
      effects: [
        { type: 'DAMAGE', target: { scope: 'CURRENT_TARGET' }, magnitude: 'ATTACK', value: 2.2 },
        { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 2, sort: 'FARTHEST' }, magnitude: 'ATTACK', value: 1.1 },
      ],
    },
    passiveSkills: [
      {
        id: 'lyra_eagle_eye',
        name: 'Eagle Eye',
        description: '+15% Crit Chance and +20% Crit Damage.',
        effects: [
          { type: 'MODIFY_STAT', stat: 'critChance', mode: 'FLAT', value: 0.15, target: { scope: 'SELF' } },
          { type: 'MODIFY_STAT', stat: 'critDamage', mode: 'FLAT', value: 0.2, target: { scope: 'SELF' } },
        ],
      },
    ],
    unlockCondition: { type: 'STARTER', label: 'Available from the start' },
    mastery: mastery([
      { label: 'Recruit Lyra', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Deal 50,000 damage',
        challenge: { type: 'DAMAGE_DEALT', value: 50000 },
        reward: '+8% Crit Chance',
        effects: [{ type: 'MODIFY_STAT', stat: 'critChance', mode: 'FLAT', value: 0.08, target: { scope: 'SELF' } }],
      },
      {
        label: 'Cast Piercing Arrow 150 times',
        challenge: { type: 'SKILLS_CAST', value: 150 },
        reward: 'Piercing Arrow pierces one more enemy',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }],
      },
      {
        label: 'Reach Floor 16 with Lyra',
        challenge: { type: 'REACH_FLOOR_WITH', value: 16 },
        reward: 'Crits grant +5 Energy',
        effects: [{ type: 'ENERGY', trigger: 'ON_CRIT', target: { scope: 'SELF' }, value: 5 }],
      },
      {
        label: 'Complete Ascension III with Lyra',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 3 },
        reward: '+25% Crit Damage',
        effects: [{ type: 'MODIFY_STAT', stat: 'critDamage', mode: 'FLAT', value: 0.25, target: { scope: 'SELF' } }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'kael',
    name: 'Kael',
    title: 'Emberwright',
    heroClass: 'ARCANIST',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 10100, attack: 96, defense: 40, attackSpeed: 0.8, skillPower: 165, energyGeneration: 1.1, range: RANGE.MID, movementSpeed: 100 }),
    art: { color: 0x8a5fb5, accent: 0xf0a24a, shape: 'STAFF' },
    lore: 'Every spell he casts costs him a memory. He has forgotten his own name twice.',
    activeSkill: {
      id: 'kael_meteor',
      name: 'Meteor',
      description: 'Calls down burning stone: 170% Skill Power to 3 enemies.',
      castTime: 0.55,
      effects: [
        {
          type: 'DAMAGE',
          target: { scope: 'ENEMIES', count: 3, sort: 'NEAREST' },
          magnitude: 'SKILL_POWER',
          value: 1.7,
        },
      ],
    },
    passiveSkills: [
      {
        id: 'kael_arcane_momentum',
        name: 'Arcane Momentum',
        description: 'Each skill hit restores 3 Energy (max 15 per cast).',
        effects: [
          {
            type: 'ENERGY',
            trigger: 'ON_SKILL_HIT',
            target: { scope: 'SELF' },
            value: 3,
            meta: { capPerCast: 15 },
          },
        ],
      },
    ],
    unlockCondition: { type: 'STARTER', label: 'Available from the start' },
    mastery: mastery([
      { label: 'Recruit Kael', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Cast 120 skills',
        challenge: { type: 'SKILLS_CAST', value: 120 },
        reward: 'Meteor effects +12%',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.12 } }],
      },
      {
        label: 'Deal 70,000 damage',
        challenge: { type: 'DAMAGE_DEALT', value: 70000 },
        reward: 'Meteor strikes one more enemy',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }],
      },
      {
        label: 'Reach Floor 16 with Kael',
        challenge: { type: 'REACH_FLOOR_WITH', value: 16 },
        reward: '+15% Energy Generation',
        effects: [{ type: 'MODIFY_STAT', stat: 'energyGeneration', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' } }],
      },
      {
        label: 'Complete Ascension III with Kael',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 3 },
        reward: 'Battles start with 40 Energy',
        effects: [{ type: 'ENERGY', trigger: 'ON_BATTLE_START', target: { scope: 'SELF' }, value: 40 }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'elara',
    name: 'Elara',
    title: 'Keeper of the Quiet Light',
    heroClass: 'SUPPORT',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 10800, attack: 82, defense: 44, attackSpeed: 0.85, skillPower: 140, healingPower: 1.2, energyGeneration: 1.15, range: RANGE.MID, movementSpeed: 100 }),
    art: { color: 0xd9d2c0, accent: 0xe0c273, shape: 'CHALICE' },
    lore: 'She does not fight. She refuses to let anyone fall.',
    activeSkill: {
      id: 'elara_divine_light',
      name: 'Divine Light',
      description: 'Heals the most wounded army for 22% of its Max HP.',
      castTime: 0.4,
      effects: [
        {
          type: 'HEAL',
          target: { scope: 'ALLIES', count: 1, sort: 'LOWEST_HP_PERCENT' },
          magnitude: 'MAX_HP',
          value: 0.22,
        },
      ],
    },
    passiveSkills: [
      {
        id: 'elara_grace',
        name: 'Grace',
        description: 'All healing effects are 15% stronger.',
        effects: [
          { type: 'MODIFY_STAT', stat: 'healingPower', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' } },
        ],
      },
    ],
    unlockCondition: { type: 'STARTER', label: 'Available from the start' },
    mastery: mastery([
      { label: 'Recruit Elara', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Heal 40,000 HP',
        challenge: { type: 'HEALING_DONE', value: 40000 },
        reward: 'Divine Light effects +18%',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.18 } }],
      },
      {
        label: 'Win 40 battles',
        challenge: { type: 'BATTLES_WON', value: 40 },
        reward: 'Divine Light heals one more ally',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }],
      },
      {
        label: 'Reach Floor 16 with Elara',
        challenge: { type: 'REACH_FLOOR_WITH', value: 16 },
        reward: 'Overhealing becomes a shield',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'ALLIES' }, meta: { flag: 'overhealShield', value: 0.1 } }],
      },
      {
        label: 'Complete Ascension III with Elara',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 3 },
        reward: '+20% Energy Generation',
        effects: [{ type: 'MODIFY_STAT', stat: 'energyGeneration', mode: 'PERCENT', value: 0.2, target: { scope: 'SELF' } }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'garran',
    name: 'Garran',
    title: 'The Iron Answer',
    heroClass: 'GUARDIAN',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 18200, attack: 100, defense: 82, attackSpeed: 0.8, skillPower: 100, range: RANGE.MELEE, movementSpeed: 92 }),
    art: { color: 0x6b6f76, accent: 0xc9743a, shape: 'BULWARK' },
    lore: 'Struck him once? He remembers. Struck him five times? He answers.',
    activeSkill: {
      id: 'garran_iron_retaliation',
      name: 'Iron Retaliation',
      description: '35% damage reduction for 4s and reflects 25% of damage taken.',
      castTime: 0.3,
      effects: [
        { type: 'DAMAGE_REDUCTION', target: { scope: 'SELF' }, value: 0.35, duration: 4 },
        { type: 'REFLECT', target: { scope: 'SELF' }, value: 0.25, duration: 4 },
      ],
    },
    passiveSkills: [
      {
        id: 'garran_counterblow',
        name: 'Counterblow',
        description: 'Every 5th hit taken triggers a counterattack.',
        effects: [
          {
            type: 'DAMAGE',
            trigger: 'ON_DAMAGE_TAKEN',
            target: { scope: 'EVENT_SOURCE' },
            magnitude: 'ATTACK',
            value: 1.1,
            everyNth: 5,
          },
        ],
      },
    ],
    unlockCondition: { type: 'REACH_FLOOR', value: 4, label: 'Reach Floor 4' },
    mastery: mastery([
      { label: 'Recruit Garran', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Absorb 25,000 damage',
        challenge: { type: 'DAMAGE_ABSORBED', value: 25000 },
        reward: 'Permanently reflects 10% of damage taken',
        effects: [{ type: 'REFLECT', target: { scope: 'SELF' }, value: 0.1 }],
      },
      {
        label: 'Win 35 battles',
        challenge: { type: 'BATTLES_WON', value: 35 },
        reward: 'An extra counterattack every 3rd hit taken',
        effects: [{ type: 'DAMAGE', trigger: 'ON_DAMAGE_TAKEN', target: { scope: 'EVENT_SOURCE' }, magnitude: 'ATTACK', value: 0.8, everyNth: 3 }],
      },
      {
        label: 'Reach Floor 16 with Garran',
        challenge: { type: 'REACH_FLOOR_WITH', value: 16 },
        reward: '+12% Max HP',
        effects: [{ type: 'MODIFY_STAT', stat: 'maxHP', mode: 'PERCENT', value: 0.12, target: { scope: 'SELF' } }],
      },
      {
        label: 'Complete Ascension III with Garran',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 3 },
        reward: 'Iron Retaliation also shields for 12% Max HP',
        effects: [{ type: 'SHIELD', trigger: 'ON_SKILL_CAST', target: { scope: 'SELF' }, magnitude: 'MAX_HP', value: 0.12, duration: 8 }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'nyra',
    name: 'Nyra',
    title: 'The Silent Charge',
    heroClass: 'RIDER',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 11600, attack: 152, defense: 48, attackSpeed: 1.15, critChance: 0.08, skillPower: 130, range: RANGE.MELEE, movementSpeed: 165 }),
    art: { color: 0x38405c, accent: 0xb0435f, shape: 'LANCE' },
    lore: 'She rides past the shield wall as if it were a rumour.',
    activeSkill: {
      id: 'nyra_shadow_strike',
      name: 'Shadow Strike',
      description: 'Blinks to the weakest back-line enemy and strikes for 250% Attack.',
      castTime: 0.25,
      effects: [
        {
          type: 'DAMAGE',
          target: { scope: 'ENEMIES', count: 1, sort: 'LOWEST_HP_ABSOLUTE', row: 'BACK' },
          magnitude: 'ATTACK',
          value: 2.5,
          meta: { teleport: true },
        },
      ],
    },
    passiveSkills: [
      {
        id: 'nyra_first_gallop',
        name: 'First Gallop',
        description: '+35% Attack Speed during the first 6 seconds of a battle.',
        effects: [
          {
            type: 'MODIFY_STAT',
            stat: 'attackSpeed',
            mode: 'PERCENT',
            value: 0.35,
            target: { scope: 'SELF' },
            conditions: [{ type: 'BATTLE_TIME_BEFORE', value: 6 }],
          },
        ],
      },
    ],
    unlockCondition: { type: 'REACH_FLOOR', value: 8, label: 'Reach Floor 8' },
    mastery: mastery([
      { label: 'Recruit Nyra', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Defeat 150 enemies',
        challenge: { type: 'ENEMIES_DEFEATED', value: 150 },
        reward: 'Shadow Strike effects +14%',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.14 } }],
      },
      {
        label: 'Deal 55,000 damage',
        challenge: { type: 'DAMAGE_DEALT', value: 55000 },
        reward: '+15% Attack Speed',
        effects: [{ type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' } }],
      },
      {
        label: 'Reach Floor 16 with Nyra',
        challenge: { type: 'REACH_FLOOR_WITH', value: 16 },
        reward: 'Shadow Strike kills refund 45 Energy',
        effects: [{ type: 'ENERGY', trigger: 'ON_KILL', target: { scope: 'SELF' }, value: 45 }],
      },
      {
        label: 'Complete Ascension III with Nyra',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 3 },
        reward: '+10% Crit Chance',
        effects: [{ type: 'MODIFY_STAT', stat: 'critChance', mode: 'FLAT', value: 0.1, target: { scope: 'SELF' } }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'mira',
    name: 'Mira',
    title: 'The Long Vigil',
    heroClass: 'SUPPORT',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 11200, attack: 86, defense: 46, attackSpeed: 0.9, skillPower: 132, healingPower: 1.15, energyGeneration: 1.1, range: RANGE.MID, movementSpeed: 100 }),
    art: { color: 0x7fb5a6, accent: 0xe0c273, shape: 'CHALICE' },
    lore: 'She has sat with more dying soldiers than any healer alive. None of them died.',
    activeSkill: {
      id: 'mira_renewal',
      name: 'Renewal',
      description: 'Heals three allies over 6 seconds.',
      castTime: 0.4,
      effects: [
        {
          type: 'HEAL',
          target: { scope: 'ALLIES', count: 3, sort: 'LOWEST_HP_PERCENT' },
          magnitude: 'MAX_HP',
          value: 0.16,
          duration: 6,
        },
      ],
    },
    passiveSkills: [
      {
        id: 'mira_clarity',
        name: 'Clarity',
        description: 'Every second skill cast cleanses a negative effect from the team.',
        effects: [
          {
            type: 'CLEANSE',
            trigger: 'ON_SKILL_CAST',
            target: { scope: 'ALLIES' },
            everyNth: 2,
            value: 1,
          },
        ],
      },
    ],
    unlockCondition: { type: 'REACH_FLOOR', value: 12, label: 'Reach Floor 12' },
    mastery: mastery([
      { label: 'Recruit Mira', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Heal 45,000 HP',
        challenge: { type: 'HEALING_DONE', value: 45000 },
        reward: 'Renewal effects +18%',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.18 } }],
      },
      {
        label: 'Win 40 battles',
        challenge: { type: 'BATTLES_WON', value: 40 },
        reward: 'Renewal reaches one more ally',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }],
      },
      {
        label: 'Reach Floor 18 with Mira',
        challenge: { type: 'REACH_FLOOR_WITH', value: 18 },
        reward: 'Cleanses an ally debuff on every skill cast',
        effects: [{ type: 'CLEANSE', trigger: 'ON_SKILL_CAST', target: { scope: 'ALLIES' }, value: 1 }],
      },
      {
        label: 'Complete Ascension IV with Mira',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 4 },
        reward: '+20% Healing Power',
        effects: [{ type: 'MODIFY_STAT', stat: 'healingPower', mode: 'PERCENT', value: 0.2, target: { scope: 'SELF' } }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'draven',
    name: 'Draven',
    title: 'The Unspent Fury',
    heroClass: 'WARRIOR',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 14800, attack: 146, defense: 58, attackSpeed: 1.0, skillPower: 120, range: RANGE.MELEE, movementSpeed: 118 }),
    art: { color: 0x8f3b3b, accent: 0xe0a24a, shape: 'BLADE' },
    lore: 'Pain is simply information. He has learned to read it very fast.',
    activeSkill: {
      id: 'draven_rampage',
      name: 'Rampage',
      description: '+40% Attack Speed and +20% damage for 6 seconds.',
      castTime: 0.25,
      effects: [
        { type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT', value: 0.4, target: { scope: 'SELF' }, duration: 6 },
        { type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.2, target: { scope: 'SELF' }, duration: 6 },
      ],
    },
    passiveSkills: [
      {
        id: 'draven_bloodfury',
        name: 'Blood Fury',
        description: '+4% damage for every 10% of Max HP missing.',
        effects: [
          {
            type: 'DAMAGE_AMP',
            target: { scope: 'SELF' },
            value: 0.04,
            meta: { missingHPPerTenPercent: true },
          },
        ],
      },
    ],
    unlockCondition: { type: 'REACH_FLOOR', value: 16, label: 'Reach Floor 16' },
    mastery: mastery([
      { label: 'Recruit Draven', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Deal 80,000 damage',
        challenge: { type: 'DAMAGE_DEALT', value: 80000 },
        reward: 'Rampage lasts 2s longer',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillDurationBonus', value: 2 } }],
      },
      {
        label: 'Defeat 250 enemies',
        challenge: { type: 'ENEMIES_DEFEATED', value: 250 },
        reward: 'Blood Fury +2% per 10% missing HP',
        effects: [{ type: 'DAMAGE_AMP', target: { scope: 'SELF' }, value: 0.02, meta: { missingHPPerTenPercent: true } }],
      },
      {
        label: 'Reach Floor 18 with Draven',
        challenge: { type: 'REACH_FLOOR_WITH', value: 18 },
        reward: 'Rampage also grants 20% lifesteal for 6s',
        effects: [{ type: 'LIFESTEAL', trigger: 'ON_SKILL_CAST', target: { scope: 'SELF' }, value: 0.2, duration: 6 }],
      },
      {
        label: 'Complete Ascension V with Draven',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 5 },
        reward: '+15% Attack',
        effects: [{ type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' } }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'seraph',
    name: 'Seraph',
    title: 'The Last Bastion',
    heroClass: 'GUARDIAN',
    secondaryClass: 'SUPPORT',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 16800, attack: 104, defense: 76, attackSpeed: 0.85, skillPower: 145, healingPower: 1.1, range: RANGE.REACH, movementSpeed: 98 }),
    art: { color: 0xe6dcc0, accent: 0xd9a441, shape: 'BULWARK' },
    lore: 'She was there when the first crown fell. She intends to be there for the last.',
    activeSkill: {
      id: 'seraph_sacred_bastion',
      name: 'Sacred Bastion',
      description: 'Shields every ally for 14% of their Max HP.',
      castTime: 0.45,
      effects: [
        { type: 'SHIELD', target: { scope: 'ALLIES' }, magnitude: 'MAX_HP', value: 0.14, duration: 10 },
      ],
    },
    passiveSkills: [
      {
        id: 'seraph_last_stand',
        name: 'Last Stand',
        description: 'Once per battle, the first ally that would die survives at 1 HP with a 15% Max HP shield.',
        effects: [
          {
            type: 'SURVIVE_LETHAL',
            trigger: 'ON_LETHAL_DAMAGE',
            target: { scope: 'EVENT_TARGET' },
            value: 0.15,
            oncePer: 'BATTLE',
          },
        ],
      },
    ],
    unlockCondition: { type: 'DEFEAT_FLOOR', value: 20, label: 'Defeat Floor 20' },
    mastery: mastery([
      { label: 'Recruit Seraph', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      {
        label: 'Absorb 30,000 damage',
        challenge: { type: 'DAMAGE_ABSORBED', value: 30000 },
        reward: 'Sacred Bastion effects +28%',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.28 } }],
      },
      {
        label: 'Win 45 battles',
        challenge: { type: 'BATTLES_WON', value: 45 },
        reward: 'All allies gain +10% Defense',
        effects: [{ type: 'MODIFY_STAT', stat: 'defense', mode: 'PERCENT', value: 0.1, target: { scope: 'ALLIES' } }],
      },
      {
        label: 'Reach Floor 20 with Seraph',
        challenge: { type: 'REACH_FLOOR_WITH', value: 20 },
        reward: 'Last Stand also restores 20% Max HP',
        effects: [{ type: 'RUN_FLAG', target: { scope: 'ALLIES' }, meta: { flag: 'seraph_last_stand_heal', value: 0.2 } }],
      },
      {
        label: 'Complete Ascension V with Seraph',
        challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 5 },
        reward: 'Sacred Bastion also grants 25 Energy',
        effects: [{ type: 'ENERGY', trigger: 'ON_SKILL_CAST', target: { scope: 'ALLIES' }, value: 25 }],
      },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'thorne',
    name: 'Thorne',
    title: 'The Bramble Crown',
    heroClass: 'GUARDIAN',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 19000, attack: 88, defense: 92, attackSpeed: 0.75, skillPower: 110, range: RANGE.MELEE, movementSpeed: 88 }),
    art: { color: 0x3f5c46, accent: 0x9e5a3a, shape: 'BULWARK' },
    lore: 'Armour of thorns. Every blow you land is a blow you receive.',
    activeSkill: {
      id: 'thorne_bramble_ward',
      name: 'Bramble Ward',
      description: 'Reflects 45% of damage taken for 5 seconds and taunts the enemy line.',
      castTime: 0.35,
      effects: [
        { type: 'REFLECT', target: { scope: 'SELF' }, value: 0.45, duration: 5 },
        { type: 'DAMAGE_REDUCTION', target: { scope: 'SELF' }, value: 0.2, duration: 5 },
      ],
    },
    passiveSkills: [
      {
        id: 'thorne_thorns',
        name: 'Thorns',
        description: 'Permanently reflects 18% of damage taken.',
        effects: [{ type: 'REFLECT', target: { scope: 'SELF' }, value: 0.18 }],
      },
    ],
    unlockCondition: { type: 'COMPLETE_ASCENSION', value: 1, label: 'Complete Ascension I' },
    mastery: mastery([
      { label: 'Recruit Thorne', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Absorb 35,000 damage', challenge: { type: 'DAMAGE_ABSORBED', value: 35000 }, reward: 'Thorns +6% reflection', effects: [{ type: 'REFLECT', target: { scope: 'SELF' }, value: 0.06 }] },
      { label: 'Win 40 battles', challenge: { type: 'BATTLES_WON', value: 40 }, reward: '+10% Defense', effects: [{ type: 'MODIFY_STAT', stat: 'defense', mode: 'PERCENT', value: 0.1, target: { scope: 'SELF' } }] },
      { label: 'Reach Floor 18 with Thorne', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: 'Reflected damage heals Thorne for 25%', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'thorne_reflect_heal', value: 0.25 } }] },
      { label: 'Complete Ascension V with Thorne', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 5 }, reward: '+15% Max HP', effects: [{ type: 'MODIFY_STAT', stat: 'maxHP', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' } }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'cassia',
    name: 'Cassia',
    title: 'One Breath, One Shot',
    heroClass: 'RANGER',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 9400, attack: 134, defense: 36, attackSpeed: 1.05, critChance: 0.18, critDamage: 1.7, skillPower: 120, range: RANGE.LONG, movementSpeed: 108 }),
    art: { color: 0xb5763f, accent: 0xf2e2b8, shape: 'BOW' },
    lore: 'She does not aim at bodies. She aims at the gaps between armour plates.',
    activeSkill: {
      id: 'cassia_perfect_shot',
      name: 'Perfect Shot',
      description: 'A guaranteed critical strike for 200% Attack.',
      castTime: 0.35,
      effects: [
        {
          type: 'DAMAGE',
          target: { scope: 'CURRENT_TARGET' },
          magnitude: 'ATTACK',
          value: 2.0,
          meta: { guaranteedCrit: true },
        },
      ],
    },
    passiveSkills: [
      {
        id: 'cassia_momentum',
        name: 'Killing Momentum',
        description: 'Every critical hit grants +3% Attack for the rest of the battle (max 10 stacks).',
        effects: [
          {
            type: 'MODIFY_STAT',
            trigger: 'ON_CRIT',
            stat: 'attack',
            mode: 'PERCENT',
            value: 0.03,
            target: { scope: 'SELF' },
            meta: { maxStacks: 10 },
          },
        ],
      },
    ],
    unlockCondition: { type: 'COMPLETE_ASCENSION', value: 2, label: 'Complete Ascension II' },
    mastery: mastery([
      { label: 'Recruit Cassia', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Deal 60,000 damage', challenge: { type: 'DAMAGE_DEALT', value: 60000 }, reward: '+10% Crit Chance', effects: [{ type: 'MODIFY_STAT', stat: 'critChance', mode: 'FLAT', value: 0.1, target: { scope: 'SELF' } }] },
      { label: 'Cast 140 skills', challenge: { type: 'SKILLS_CAST', value: 140 }, reward: 'Perfect Shot effects +20%', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.2 } }] },
      { label: 'Reach Floor 18 with Cassia', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: '+20% Crit Damage', effects: [{ type: 'MODIFY_STAT', stat: 'critDamage', mode: 'FLAT', value: 0.2, target: { scope: 'SELF' } }] },
      { label: 'Complete Ascension V with Cassia', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 5 }, reward: '+30% Crit Damage', effects: [{ type: 'MODIFY_STAT', stat: 'critDamage', mode: 'FLAT', value: 0.3, target: { scope: 'SELF' } }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'orin',
    name: 'Orin',
    title: 'The Tide Caller',
    heroClass: 'SUPPORT',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 10900, attack: 84, defense: 44, attackSpeed: 0.9, skillPower: 128, energyGeneration: 1.3, healingPower: 1.05, range: RANGE.MID, movementSpeed: 100 }),
    art: { color: 0x4a86a8, accent: 0xe0c273, shape: 'STAFF' },
    lore: 'He does not make his allies stronger. He makes them faster to act.',
    activeSkill: {
      id: 'orin_surge',
      name: 'Surge',
      description: 'Grants every ally 25 Energy.',
      castTime: 0.3,
      effects: [{ type: 'ENERGY', target: { scope: 'ALLIES' }, value: 25 }],
    },
    passiveSkills: [
      {
        id: 'orin_flow',
        name: 'Flow',
        description: 'All allies gain +10% Energy Generation.',
        effects: [
          { type: 'MODIFY_STAT', stat: 'energyGeneration', mode: 'PERCENT', value: 0.1, target: { scope: 'ALLIES' } },
        ],
      },
    ],
    unlockCondition: { type: 'COMPLETE_ASCENSION', value: 3, label: 'Complete Ascension III' },
    mastery: mastery([
      { label: 'Recruit Orin', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Cast 100 skills', challenge: { type: 'SKILLS_CAST', value: 100 }, reward: 'Surge effects +28%', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.28 } }] },
      { label: 'Win 40 battles', challenge: { type: 'BATTLES_WON', value: 40 }, reward: 'Flow +5% Energy Generation', effects: [{ type: 'MODIFY_STAT', stat: 'energyGeneration', mode: 'PERCENT', value: 0.05, target: { scope: 'ALLIES' } }] },
      { label: 'Reach Floor 18 with Orin', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: 'Battles start with 25 team Energy', effects: [{ type: 'ENERGY', trigger: 'ON_BATTLE_START', target: { scope: 'ALLIES' }, value: 25 }] },
      { label: 'Complete Ascension V with Orin', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 5 }, reward: 'Surge also heals allies for 8% Max HP', effects: [{ type: 'HEAL', trigger: 'ON_SKILL_CAST', target: { scope: 'ALLIES' }, magnitude: 'MAX_HP', value: 0.08 }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'vex',
    name: 'Vex',
    title: 'The Gap in the Line',
    heroClass: 'RIDER',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 10900, attack: 158, defense: 42, attackSpeed: 1.2, critChance: 0.12, skillPower: 135, range: RANGE.MELEE, movementSpeed: 180 }),
    art: { color: 0x2f2b40, accent: 0x8f4fbd, shape: 'LANCE' },
    lore: 'Nobody has ever seen Vex arrive. They only notice the absence afterwards.',
    activeSkill: {
      id: 'vex_phase_lunge',
      name: 'Phase Lunge',
      description: 'Blinks behind the enemy line and strikes two back-line targets for 190% Attack.',
      castTime: 0.25,
      effects: [
        {
          type: 'DAMAGE',
          target: { scope: 'ENEMIES', count: 2, sort: 'LOWEST_HP_ABSOLUTE', row: 'BACK' },
          magnitude: 'ATTACK',
          value: 1.9,
          meta: { teleport: true },
        },
      ],
    },
    passiveSkills: [
      {
        id: 'vex_assassin',
        name: 'Assassin',
        description: '+20% damage against back-line enemies.',
        effects: [
          {
            type: 'DAMAGE_AMP',
            target: { scope: 'SELF' },
            value: 0.2,
            meta: { targetRow: 'BACK' },
          },
        ],
      },
    ],
    unlockCondition: { type: 'COMPLETE_ASCENSION', value: 4, label: 'Complete Ascension IV' },
    mastery: mastery([
      { label: 'Recruit Vex', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Defeat 200 enemies', challenge: { type: 'ENEMIES_DEFEATED', value: 200 }, reward: 'Phase Lunge effects +16%', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.16 } }] },
      { label: 'Deal 65,000 damage', challenge: { type: 'DAMAGE_DEALT', value: 65000 }, reward: 'Assassin +10% against the back line', effects: [{ type: 'DAMAGE_AMP', target: { scope: 'SELF' }, value: 0.1, meta: { targetRow: 'BACK' } }] },
      { label: 'Reach Floor 18 with Vex', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: 'Kills grant +12% Attack Speed for 5s', effects: [{ type: 'MODIFY_STAT', trigger: 'ON_KILL', stat: 'attackSpeed', mode: 'PERCENT', value: 0.12, duration: 5, target: { scope: 'SELF' } }] },
      { label: 'Complete Ascension VI with Vex', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 6 }, reward: 'Phase Lunge hits one more target', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'valeria',
    name: 'Valeria',
    title: 'The Rising Tally',
    heroClass: 'WARRIOR',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 14400, attack: 140, defense: 60, attackSpeed: 1.0, skillPower: 122, range: RANGE.MELEE, movementSpeed: 116 }),
    art: { color: 0xb08040, accent: 0xf2e2b8, shape: 'BLADE' },
    lore: 'She keeps a count. The count is the point.',
    activeSkill: {
      id: 'valeria_warmarch',
      name: 'War March',
      description: 'Deals 165% Attack to two enemies and grants the front row +10% Attack for 6s.',
      castTime: 0.3,
      effects: [
        { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 2, sort: 'NEAREST' }, magnitude: 'ATTACK', value: 1.65 },
        { type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.1, duration: 6, target: { scope: 'ALLIES', row: 'FRONT' } },
      ],
    },
    passiveSkills: [
      {
        id: 'valeria_tally',
        name: 'The Tally',
        description: 'Each kill on a floor grants +4% Attack for the rest of that floor (max +40%).',
        effects: [
          {
            type: 'MODIFY_STAT',
            trigger: 'ON_KILL',
            stat: 'attack',
            mode: 'PERCENT',
            value: 0.04,
            target: { scope: 'SELF' },
            meta: { maxStacks: 10, persistFloor: true },
          },
        ],
      },
    ],
    unlockCondition: { type: 'COMPLETE_ASCENSION', value: 5, label: 'Complete Ascension V' },
    mastery: mastery([
      { label: 'Recruit Valeria', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Defeat 220 enemies', challenge: { type: 'ENEMIES_DEFEATED', value: 220 }, reward: '+10% Attack', effects: [{ type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.1, target: { scope: 'SELF' } }] },
      { label: 'Deal 70,000 damage', challenge: { type: 'DAMAGE_DEALT', value: 70000 }, reward: 'War March hits one more enemy', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }] },
      { label: 'Reach Floor 18 with Valeria', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: '+12% Attack', effects: [{ type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.12, target: { scope: 'SELF' } }] },
      { label: 'Complete Ascension VI with Valeria', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 6 }, reward: 'The Tally grants an extra +3% per kill', effects: [{ type: 'MODIFY_STAT', trigger: 'ON_KILL', stat: 'attack', mode: 'PERCENT', value: 0.03, target: { scope: 'SELF' }, meta: { maxStacks: 10 } }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'morwen',
    name: 'Morwen',
    title: 'She Who Pays in Blood',
    heroClass: 'ARCANIST',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 11400, attack: 92, defense: 42, attackSpeed: 0.8, skillPower: 170, range: RANGE.MID, movementSpeed: 98 }),
    art: { color: 0x4b2a52, accent: 0xc23b6a, shape: 'STAFF' },
    lore: 'Her magic has one price, and she always has it on her.',
    activeSkill: {
      id: 'morwen_hemorrhage',
      name: 'Hemorrhage',
      description: 'Deals 150% Skill Power to 3 enemies. Stronger the more HP Morwen is missing.',
      castTime: 0.5,
      effects: [
        {
          type: 'DAMAGE',
          target: { scope: 'ENEMIES', count: 3, sort: 'NEAREST' },
          magnitude: 'SKILL_POWER',
          value: 1.5,
          meta: { missingHPScaling: 0.8 },
        },
      ],
    },
    passiveSkills: [
      {
        id: 'morwen_dark_pact',
        name: 'Dark Pact',
        description: '+30% Skill Power below 50% HP.',
        effects: [
          {
            type: 'MODIFY_STAT',
            stat: 'skillPower',
            mode: 'PERCENT',
            value: 0.3,
            target: { scope: 'SELF' },
            conditions: [{ type: 'SELF_HP_BELOW', value: 0.5 }],
          },
        ],
      },
    ],
    unlockCondition: {
      type: 'CLEAR_WITHOUT_HEALING_FOUNTAIN',
      value: 20,
      label: 'Clear Floor 20 without using a Healing Fountain',
    },
    mastery: mastery([
      { label: 'Recruit Morwen', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Deal 75,000 damage', challenge: { type: 'DAMAGE_DEALT', value: 75000 }, reward: 'Hemorrhage effects +16%', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.16 } }] },
      { label: 'Cast 130 skills', challenge: { type: 'SKILLS_CAST', value: 130 }, reward: '+15% Skill Power below 65% HP', effects: [{ type: 'MODIFY_STAT', stat: 'skillPower', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' }, conditions: [{ type: 'SELF_HP_BELOW', value: 0.65 }] }] },
      { label: 'Reach Floor 18 with Morwen', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: '15% lifesteal', effects: [{ type: 'LIFESTEAL', target: { scope: 'SELF' }, value: 0.15 }] },
      { label: 'Complete Ascension VI with Morwen', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 6 }, reward: '+20% Skill Power', effects: [{ type: 'MODIFY_STAT', stat: 'skillPower', mode: 'PERCENT', value: 0.2, target: { scope: 'SELF' } }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'rook',
    name: 'Rook',
    title: 'The Opportunist',
    heroClass: 'RIDER',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 12200, attack: 132, defense: 52, attackSpeed: 1.1, critChance: 0.1, skillPower: 118, range: RANGE.MELEE, movementSpeed: 158 }),
    art: { color: 0x5a4632, accent: 0xd9a441, shape: 'LANCE' },
    lore: 'He is not in this for the kingdom. He has been extremely clear about that.',
    activeSkill: {
      id: 'rook_plunder',
      name: 'Plunder',
      description: 'Strikes for 200% Attack and marks the target - killing it yields extra gold.',
      castTime: 0.25,
      effects: [
        { type: 'DAMAGE', target: { scope: 'CURRENT_TARGET' }, magnitude: 'ATTACK', value: 2.0 },
        { type: 'GRANT_GOLD', target: { scope: 'SELF' }, value: 6 },
      ],
    },
    passiveSkills: [
      {
        id: 'rook_spoils',
        name: 'Spoils of War',
        description: 'After a victory, 35% chance for bonus gold.',
        effects: [
          { type: 'GRANT_GOLD', trigger: 'ON_BATTLE_WON', target: { scope: 'SELF' }, value: 25, chance: 0.35 },
        ],
      },
    ],
    unlockCondition: { type: 'TOTAL_TREASURES_OPENED', value: 100, label: 'Open 100 treasure chests' },
    mastery: mastery([
      { label: 'Recruit Rook', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Win 35 battles', challenge: { type: 'BATTLES_WON', value: 35 }, reward: 'Spoils of War triggers 15% more often', effects: [{ type: 'GRANT_GOLD', trigger: 'ON_BATTLE_WON', target: { scope: 'SELF' }, value: 25, chance: 0.15 }] },
      { label: 'Deal 50,000 damage', challenge: { type: 'DAMAGE_DEALT', value: 50000 }, reward: 'Plunder effects +17%', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.17 } }] },
      { label: 'Reach Floor 16 with Rook', challenge: { type: 'REACH_FLOOR_WITH', value: 16 }, reward: 'Victories yield 20 extra gold', effects: [{ type: 'GRANT_GOLD', trigger: 'ON_BATTLE_WON', value: 20 }] },
      { label: 'Complete Ascension V with Rook', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 5 }, reward: '+15% Attack Speed', effects: [{ type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' } }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'darius',
    name: 'Darius',
    title: 'The Closing Argument',
    heroClass: 'WARRIOR',
    preferredRow: 'FRONT',
    baseStats: stats({ maxHP: 15000, attack: 150, defense: 62, attackSpeed: 0.9, critChance: 0.08, skillPower: 128, range: RANGE.MELEE, movementSpeed: 112 }),
    art: { color: 0x7a2f2f, accent: 0xd9d2c0, shape: 'BLADE' },
    lore: 'Five hundred enemies have disagreed with him. None of them finished the sentence.',
    activeSkill: {
      id: 'darius_finality',
      name: 'Finality',
      description: 'A single devastating blow for 300% Attack, doubled against targets below 25% HP.',
      castTime: 0.45,
      effects: [
        {
          type: 'DAMAGE',
          target: { scope: 'CURRENT_TARGET' },
          magnitude: 'ATTACK',
          value: 3.0,
          meta: { executeThreshold: 0.25, executeMultiplier: 2 },
        },
      ],
    },
    passiveSkills: [
      {
        id: 'darius_relentless',
        name: 'Relentless',
        description: 'Kills grant +8% Attack for 8 seconds, stacking.',
        effects: [
          {
            type: 'MODIFY_STAT',
            trigger: 'ON_KILL',
            stat: 'attack',
            mode: 'PERCENT',
            value: 0.08,
            duration: 8,
            target: { scope: 'SELF' },
            meta: { maxStacks: 5 },
          },
        ],
      },
    ],
    unlockCondition: { type: 'TOTAL_ENEMIES_DEFEATED', value: 500, label: 'Defeat 500 enemies' },
    mastery: mastery([
      { label: 'Recruit Darius', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Deal 90,000 damage', challenge: { type: 'DAMAGE_DEALT', value: 90000 }, reward: 'Finality effects +13%', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.13 } }] },
      { label: 'Defeat 300 enemies', challenge: { type: 'ENEMIES_DEFEATED', value: 300 }, reward: '+25% damage against enemies below 35% HP', effects: [{ type: 'DAMAGE_AMP', target: { scope: 'SELF' }, value: 0.25, meta: { targetHPBelow: 0.35 } }] },
      { label: 'Reach Floor 18 with Darius', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: 'Finality kills refund 60 Energy', effects: [{ type: 'ENERGY', trigger: 'ON_KILL', target: { scope: 'SELF' }, value: 60 }] },
      { label: 'Complete Ascension VI with Darius', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 6 }, reward: '+15% Attack', effects: [{ type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' } }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'aurelia',
    name: 'Aurelia',
    title: 'The Gathered Light',
    heroClass: 'ARCANIST',
    secondaryClass: 'SUPPORT',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 11200, attack: 90, defense: 44, attackSpeed: 0.85, skillPower: 152, healingPower: 1.1, energyGeneration: 1.1, range: RANGE.MID, movementSpeed: 100 }),
    art: { color: 0xf0e0b0, accent: 0xc9962f, shape: 'STAFF' },
    lore: 'Every blessing the expedition carries hums a little louder when she is near.',
    activeSkill: {
      id: 'aurelia_convergence',
      name: 'Convergence',
      description: 'Deals 155% Skill Power to 2 enemies and heals the weakest ally for 12% Max HP.',
      castTime: 0.45,
      effects: [
        { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 2, sort: 'NEAREST' }, magnitude: 'SKILL_POWER', value: 1.55 },
        { type: 'HEAL', target: { scope: 'ALLIES', count: 1, sort: 'LOWEST_HP_PERCENT' }, magnitude: 'MAX_HP', value: 0.12 },
      ],
    },
    passiveSkills: [
      {
        id: 'aurelia_resonance',
        name: 'Resonance',
        description: '+5% Skill Power for every 5 blessings the expedition carries.',
        effects: [
          {
            type: 'MODIFY_STAT',
            stat: 'skillPower',
            mode: 'PERCENT',
            value: 0.05,
            target: { scope: 'SELF' },
            meta: { perBlessings: 5 },
          },
        ],
      },
    ],
    unlockCondition: { type: 'TOTAL_LEGENDARY_BLESSINGS', value: 100, label: 'Collect 100 Legendary Blessings' },
    mastery: mastery([
      { label: 'Recruit Aurelia', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Cast 120 skills', challenge: { type: 'SKILLS_CAST', value: 120 }, reward: 'Convergence effects +16%', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.16 } }] },
      { label: 'Heal 35,000 HP', challenge: { type: 'HEALING_DONE', value: 35000 }, reward: '+8% Skill Power', effects: [{ type: 'MODIFY_STAT', stat: 'skillPower', mode: 'PERCENT', value: 0.08, target: { scope: 'SELF' } }] },
      { label: 'Reach Floor 18 with Aurelia', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: 'Convergence hits one more enemy', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }] },
      { label: 'Complete Ascension VI with Aurelia', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 6 }, reward: '+18% Skill Power', effects: [{ type: 'MODIFY_STAT', stat: 'skillPower', mode: 'PERCENT', value: 0.18, target: { scope: 'SELF' } }] },
    ]),
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'solen',
    name: 'Solen',
    title: 'The Marked Path',
    heroClass: 'RANGER',
    secondaryClass: 'SUPPORT',
    preferredRow: 'BACK',
    baseStats: stats({ maxHP: 10100, attack: 128, defense: 40, attackSpeed: 1.05, critChance: 0.1, skillPower: 130, range: RANGE.LONG, movementSpeed: 106 }),
    art: { color: 0xc7b06a, accent: 0xffffff, shape: 'BOW' },
    lore: 'He does not kill the enemy. He simply shows the others exactly where to strike.',
    activeSkill: {
      id: 'solen_hunters_mark',
      name: "Hunter's Mark",
      description: 'Marks 2 enemies for 8s: they take 20% more damage from every army.',
      castTime: 0.3,
      effects: [
        { type: 'DAMAGE', target: { scope: 'CURRENT_TARGET' }, magnitude: 'ATTACK', value: 1.4 },
        {
          type: 'DAMAGE_TAKEN_AMP',
          target: { scope: 'ENEMIES', count: 2, sort: 'HIGHEST_HP_PERCENT' },
          value: 0.2,
          duration: 8,
        },
      ],
    },
    passiveSkills: [
      {
        id: 'solen_focus',
        name: 'Focused Volley',
        description: '+12% damage against marked enemies.',
        effects: [
          {
            type: 'DAMAGE_AMP',
            target: { scope: 'SELF' },
            value: 0.12,
            meta: { targetMarked: true },
          },
        ],
      },
    ],
    unlockCondition: { type: 'REACH_ENDLESS_FLOOR', value: 50, label: 'Reach Endless Floor 50' },
    mastery: mastery([
      { label: 'Recruit Solen', challenge: { type: 'UNLOCKED', value: 1 }, reward: 'Hero unlocked' },
      { label: 'Cast 110 skills', challenge: { type: 'SKILLS_CAST', value: 110 }, reward: "Hunter's Mark effects +30%", effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillValueBonus', value: 0.3 } }] },
      { label: 'Deal 55,000 damage', challenge: { type: 'DAMAGE_DEALT', value: 55000 }, reward: 'Marks one more enemy', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillTargetBonus', value: 1 } }] },
      { label: 'Reach Floor 18 with Solen', challenge: { type: 'REACH_FLOOR_WITH', value: 18 }, reward: 'Marks last 4s longer', effects: [{ type: 'RUN_FLAG', target: { scope: 'SELF' }, meta: { flag: 'skillDurationBonus', value: 4 } }] },
      { label: 'Complete Ascension VI with Solen', challenge: { type: 'COMPLETE_ASCENSION_WITH', value: 6 }, reward: '+12% Attack', effects: [{ type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.12, target: { scope: 'SELF' } }] },
    ]),
  },
];

export const HEROES_BY_ID: Record<string, HeroDefinition> = Object.fromEntries(
  HEROES.map((hero) => [hero.id, hero]),
);

export function getHero(id: string): HeroDefinition {
  const hero = HEROES_BY_ID[id];
  if (!hero) throw new Error(`Unknown hero: ${id}`);
  return hero;
}

export const STARTER_HERO_IDS = HEROES.filter((h) => h.unlockCondition.type === 'STARTER').map((h) => h.id);
