import type { BossDefinition } from '../core/types';
import { RANGE, stats } from './util';

/**
 * Major bosses. The boss itself is a full EnemyDefinition, so it flows through
 * exactly the same combat pipeline as any other enemy - phases are layered on
 * top by the CombatEngine when the boss crosses an HP threshold.
 */
export const BOSSES: BossDefinition[] = [
  {
    id: 'the_gatekeeper',
    name: 'The Gatekeeper',
    title: 'Warden of the First Seal',
    floor: 4,
    guards: ['shieldbearer', 'swordsman'],
    introLines: ['Something enormous shifts in the dark.', 'THE GATEKEEPER blocks the way.'],
    enemy: {
      id: 'the_gatekeeper',
      name: 'The Gatekeeper',
      role: 'TANK',
      preferredRow: 'FRONT',
      baseStats: stats({ maxHP: 4300, attack: 118, defense: 78, attackSpeed: 0.7, range: RANGE.REACH, movementSpeed: 76 }),
      targeting: 'FRONTLINE_FIRST',
      weight: 0,
      minFloor: 4,
      art: { color: 0x5c6b4a, accent: 0xd9a441, shape: 'BULWARK' },
      activeSkill: {
        id: 'gatekeeper_slam',
        name: 'Gate Slam',
        description: 'Slams the ground for 150% Attack to three armies.',
        castTime: 0.6,
        effects: [
          { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 3, sort: 'NEAREST' }, magnitude: 'ATTACK', value: 1.5 },
        ],
      },
    },
    phases: [
      {
        hpThreshold: 0.5,
        name: 'Sealed Fury',
        banner: 'THE GATEKEEPER BRACES',
        effects: [
          { type: 'MODIFY_STAT', stat: 'defense', mode: 'PERCENT', value: 0.3, target: { scope: 'SELF' } },
          { type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT', value: 0.2, target: { scope: 'SELF' } },
        ],
      },
    ],
  },

  {
    id: 'the_twin_knights',
    name: 'The Twin Knights',
    title: 'Oathbound, Twice Over',
    floor: 8,
    guards: ['knight', 'archer'],
    introLines: ['Two sets of footsteps, perfectly in time.', 'THE TWIN KNIGHTS will not fight you one at a time.'],
    enemy: {
      id: 'twin_knight_elder',
      name: 'Elder Twin',
      role: 'TANK',
      preferredRow: 'FRONT',
      baseStats: stats({ maxHP: 3900, attack: 140, defense: 70, attackSpeed: 0.85, range: RANGE.MELEE, movementSpeed: 100 }),
      targeting: 'HIGHEST_ATTACK',
      weight: 0,
      minFloor: 8,
      art: { color: 0x8a5c3f, accent: 0xf2e2b8, shape: 'BLADE' },
      activeSkill: {
        id: 'twin_sweep',
        name: 'Paired Sweep',
        description: 'Sweeps two armies for 170% Attack.',
        castTime: 0.4,
        effects: [
          { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 2, sort: 'NEAREST' }, magnitude: 'ATTACK', value: 1.7 },
        ],
      },
      passiveSkills: [
        {
          id: 'twin_bond',
          name: 'Sworn Bond',
          description: 'Takes 25% less damage while its twin lives.',
          effects: [
            {
              type: 'DAMAGE_REDUCTION',
              target: { scope: 'SELF' },
              value: 0.25,
              conditions: [{ type: 'ALLY_ALIVE_COUNT', op: 'GTE', value: 2 }],
            },
          ],
        },
      ],
    },
    phases: [
      {
        hpThreshold: 0.45,
        name: 'Broken Bond',
        banner: 'THE BOND SNAPS',
        effects: [
          { type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.3, target: { scope: 'SELF' } },
          { type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT', value: 0.25, target: { scope: 'SELF' } },
        ],
      },
    ],
  },

  {
    id: 'the_sorcerer_king',
    name: 'The Sorcerer King',
    title: 'He Who Counted the Hours',
    floor: 12,
    guards: ['frost_mage', 'priest'],
    introLines: ['The air goes thin and very cold.', 'THE SORCERER KING has been expecting you.'],
    enemy: {
      id: 'the_sorcerer_king',
      name: 'The Sorcerer King',
      role: 'CASTER',
      preferredRow: 'BACK',
      baseStats: stats({ maxHP: 4400, attack: 106, defense: 56, attackSpeed: 0.7, skillPower: 210, range: RANGE.LONG, movementSpeed: 82 }),
      targeting: 'LOWEST_HP_ABSOLUTE',
      weight: 0,
      minFloor: 12,
      art: { color: 0x3d4d8a, accent: 0xa8dcf0, shape: 'STAFF' },
      activeSkill: {
        id: 'sorcerer_king_nova',
        name: 'Hollow Nova',
        description: 'Deals 130% Skill Power to every army and drains 15 Energy.',
        castTime: 0.7,
        effects: [
          { type: 'DAMAGE', target: { scope: 'ENEMIES' }, magnitude: 'SKILL_POWER', value: 1.3 },
          { type: 'ENERGY', target: { scope: 'ENEMIES' }, value: -15 },
        ],
      },
    },
    phases: [
      {
        hpThreshold: 0.5,
        name: 'Unbound Arithmetic',
        banner: 'THE CALCULATION CHANGES',
        summons: ['shade', 'shade'],
        effects: [{ type: 'MODIFY_STAT', stat: 'skillPower', mode: 'PERCENT', value: 0.35, target: { scope: 'SELF' } }],
      },
    ],
  },

  {
    id: 'the_fallen_general',
    name: 'The Fallen General',
    title: 'Still Commanding, Still Dead',
    floor: 16,
    guards: ['royal_guard', 'summoner'],
    introLines: ['A voice gives orders in a language nobody answers to any more.', 'THE FALLEN GENERAL takes the field.'],
    enemy: {
      id: 'the_fallen_general',
      name: 'The Fallen General',
      role: 'SUMMONER',
      preferredRow: 'FRONT',
      baseStats: stats({ maxHP: 4200, attack: 196, defense: 74, attackSpeed: 0.9, skillPower: 225, range: RANGE.REACH, movementSpeed: 92 }),
      targeting: 'FRONTLINE_FIRST',
      weight: 0,
      minFloor: 16,
      art: { color: 0x4a3b52, accent: 0xc9962f, shape: 'LANCE' },
      activeSkill: {
        id: 'general_command',
        name: 'Field Command',
        description: 'Strikes two armies for 165% Attack and rallies his warband (+25% Attack for 8s).',
        castTime: 0.5,
        effects: [
          { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 2, sort: 'NEAREST' }, magnitude: 'ATTACK', value: 1.65 },
          { type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.25, duration: 8, target: { scope: 'ALLIES' } },
        ],
      },
    },
    phases: [
      {
        hpThreshold: 0.6,
        name: 'Call the Reserves',
        banner: 'THE RESERVES ANSWER',
        summons: ['swordsman', 'archer'],
        effects: [{ type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.15, target: { scope: 'SELF' } }],
      },
      {
        hpThreshold: 0.3,
        name: 'No Retreat',
        banner: 'NO RETREAT IS ORDERED',
        summons: ['royal_guard'],
        effects: [
          { type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT', value: 0.3, target: { scope: 'SELF' } },
          { type: 'MODIFY_STAT', stat: 'defense', mode: 'PERCENT', value: 0.2, target: { scope: 'SELF' } },
        ],
      },
    ],
  },

  {
    id: 'the_crownless_king',
    name: 'The Crownless King',
    title: 'The First to Wear It, The Last to Give It Up',
    floor: 20,
    guards: ['royal_guard', 'royal_guard'],
    introLines: [
      'The throne room is exactly as tall as the rumours claimed.',
      'He does not stand. He does not need to.',
      'THE CROWNLESS KING.',
    ],
    enemy: {
      id: 'the_crownless_king',
      name: 'The Crownless King',
      role: 'BRUISER',
      preferredRow: 'FRONT',
      baseStats: stats({ maxHP: 3350, attack: 245, defense: 84, attackSpeed: 0.95, skillPower: 290, range: RANGE.REACH, movementSpeed: 96 }),
      targeting: 'HIGHEST_ATTACK',
      weight: 0,
      minFloor: 20,
      art: { color: 0x6b5620, accent: 0xf2d06a, shape: 'BLADE' },
      activeSkill: {
        id: 'crownless_judgement',
        name: 'Judgement',
        description: 'Deals 145% Attack to three armies and 90% Skill Power to the rest.',
        castTime: 0.55,
        effects: [
          { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 3, sort: 'NEAREST' }, magnitude: 'ATTACK', value: 1.45 },
          { type: 'DAMAGE', target: { scope: 'ENEMIES', sort: 'FARTHEST' }, magnitude: 'SKILL_POWER', value: 0.9 },
        ],
      },
    },
    phases: [
      {
        hpThreshold: 0.6,
        name: 'The Court Answers',
        banner: 'THE COURT ANSWERS',
        summons: ['royal_guard', 'knight'],
        effects: [{ type: 'MODIFY_STAT', stat: 'skillPower', mode: 'PERCENT', value: 0.25, target: { scope: 'SELF' } }],
      },
      {
        hpThreshold: 0.3,
        name: 'Enraged',
        banner: 'THE CROWNLESS KING IS ENRAGED',
        effects: [
          { type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.4, target: { scope: 'SELF' } },
          { type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT', value: 0.4, target: { scope: 'SELF' } },
        ],
      },
      {
        // Only reachable at Ascension X, where the fourth phase is enabled.
        hpThreshold: 0.12,
        name: 'The Crown Remembers',
        banner: 'THE CROWN REMEMBERS',
        summons: ['royal_guard', 'royal_guard', 'knight'],
        effects: [
          { type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.35, target: { scope: 'SELF' } },
          { type: 'DAMAGE_REDUCTION', target: { scope: 'SELF' }, value: 0.2 },
        ],
      },
    ],
  },
];

export const BOSSES_BY_ID: Record<string, BossDefinition> = Object.fromEntries(BOSSES.map((b) => [b.id, b]));

export function getBoss(id: string): BossDefinition {
  const boss = BOSSES_BY_ID[id];
  if (!boss) throw new Error(`Unknown boss: ${id}`);
  return boss;
}
