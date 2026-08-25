import type { RelicDefinition, RelicRarity } from '../core/types';

/**
 * Relics are consumable actives held in a 9-slot inventory.
 * `usage` decides where the button appears (map screen vs. pre-battle screen).
 */
export const RELICS: RelicDefinition[] = [
  {
    id: 'healing_chalice',
    name: 'Healing Chalice',
    rarity: 'COMMON',
    description: 'Restores 30% of Max HP to one army.',
    targeting: 'SINGLE_ARMY',
    usage: 'ANY',
    price: 55,
    effects: [{ type: 'HEAL', magnitude: 'MAX_HP', value: 0.3, meta: { runLevel: true } }],
  },
  {
    id: 'greater_healing_chalice',
    name: 'Greater Healing Chalice',
    rarity: 'RARE',
    description: 'Restores 15% of Max HP to every army.',
    targeting: 'ALL_ARMIES',
    usage: 'ANY',
    price: 90,
    effects: [{ type: 'HEAL', magnitude: 'MAX_HP', value: 0.15, meta: { runLevel: true } }],
  },
  {
    id: 'war_horn',
    name: 'War Horn',
    rarity: 'COMMON',
    description: 'All armies gain +30% Attack for the next battle.',
    targeting: 'ALL_ARMIES',
    usage: 'PRE_BATTLE',
    price: 60,
    effects: [{ type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.3, meta: { battleOnly: true } }],
  },
  {
    id: 'iron_banner',
    name: 'Iron Banner',
    rarity: 'COMMON',
    description: 'All armies gain +30% Defense for the next battle.',
    targeting: 'ALL_ARMIES',
    usage: 'PRE_BATTLE',
    price: 60,
    effects: [{ type: 'MODIFY_STAT', stat: 'defense', mode: 'PERCENT', value: 0.3, meta: { battleOnly: true } }],
  },
  {
    id: 'siege_stone',
    name: 'Siege Stone',
    rarity: 'RARE',
    description: 'The Guardian of this floor loses 20% of its Max HP before the fight.',
    targeting: 'MAP',
    usage: 'MAP',
    price: 95,
    requires: 'GUARDIAN_ALIVE',
    effects: [{ type: 'RUN_FLAG', meta: { flag: 'guardianHPPenalty', value: 0.2 } }],
  },
  {
    id: 'oracle_eye',
    name: 'Oracle Eye',
    rarity: 'COMMON',
    description: 'Reveals ten hidden tiles of interest.',
    targeting: 'MAP',
    usage: 'MAP',
    price: 50,
    effects: [{ type: 'REVEAL_TILE', value: 10, meta: { prioritiseInteresting: true } }],
  },
  {
    id: 'resurrection_rune',
    name: 'Resurrection Rune',
    rarity: 'EPIC',
    description: 'Revives a fallen army with 40% HP.',
    targeting: 'DEAD_ARMY',
    usage: 'MAP',
    price: 130,
    requires: 'DEAD_ARMY',
    effects: [{ type: 'REVIVE', value: 0.4, meta: { runLevel: true } }],
  },
  {
    id: 'merchant_coin',
    name: 'Merchant Coin',
    rarity: 'COMMON',
    description: 'The next merchant charges 50% less.',
    targeting: 'NONE',
    usage: 'MAP',
    price: 45,
    effects: [{ type: 'RUN_FLAG', meta: { flag: 'merchantDiscount', value: 0.5 } }],
  },
  {
    id: 'smoke_bomb',
    name: 'Smoke Bomb',
    rarity: 'COMMON',
    description: 'Slip past a normal enemy without fighting. Does not work on Elites or Guardians.',
    targeting: 'MAP',
    usage: 'PRE_BATTLE',
    price: 55,
    effects: [{ type: 'RUN_FLAG', meta: { flag: 'skipBattle', value: 1 } }],
  },
  {
    id: 'golden_compass',
    name: 'Golden Compass',
    rarity: 'COMMON',
    description: "Reveals the Guardian's position on this floor.",
    targeting: 'MAP',
    usage: 'MAP',
    price: 45,
    effects: [{ type: 'REVEAL_TILE', value: 1, meta: { revealGuardian: true } }],
  },
  {
    id: 'energy_crystal',
    name: 'Energy Crystal',
    rarity: 'RARE',
    description: 'All armies start the next battle with +40 Energy.',
    targeting: 'ALL_ARMIES',
    usage: 'PRE_BATTLE',
    price: 80,
    effects: [{ type: 'ENERGY', value: 40, meta: { battleOnly: true } }],
  },
  {
    id: 'purification_stone',
    name: 'Purification Stone',
    rarity: 'RARE',
    description: 'Removes all negative floor modifiers.',
    targeting: 'NONE',
    usage: 'MAP',
    price: 75,
    effects: [{ type: 'CLEANSE', meta: { runLevel: true, floorModifiers: true } }],
  },
  {
    id: 'blood_gem',
    name: 'Blood Gem',
    rarity: 'RARE',
    description: 'One army gains +50% Attack for the next battle but loses 15% of its current HP.',
    targeting: 'SINGLE_ARMY',
    usage: 'PRE_BATTLE',
    price: 85,
    effects: [
      { type: 'MODIFY_STAT', stat: 'attack', mode: 'PERCENT', value: 0.5, meta: { battleOnly: true } },
      { type: 'DAMAGE', magnitude: 'CURRENT_HP', value: 0.15, meta: { runLevel: true } },
    ],
  },
  {
    id: 'blessing_prism',
    name: 'Blessing Prism',
    rarity: 'RARE',
    description: 'Rerolls a blessing selection.',
    targeting: 'NONE',
    usage: 'ANY',
    price: 80,
    requires: 'BLESSING_CHOICE',
    effects: [{ type: 'RUN_FLAG', meta: { flag: 'blessingReroll', value: 1 } }],
  },
  {
    id: 'crown_fragment',
    name: 'Crown Fragment',
    rarity: 'EPIC',
    description: 'Upgrades one Rare blessing you own into its stronger Epic form.',
    targeting: 'NONE',
    usage: 'MAP',
    price: 140,
    requires: 'RARE_BLESSING',
    effects: [{ type: 'ADD_BLESSING', meta: { upgradeRare: true } }],
  },
];

export const RELICS_BY_ID: Record<string, RelicDefinition> = Object.fromEntries(
  RELICS.map((relic) => [relic.id, relic]),
);

export function getRelic(id: string): RelicDefinition {
  const relic = RELICS_BY_ID[id];
  if (!relic) throw new Error(`Unknown relic: ${id}`);
  return relic;
}

export function relicsByRarity(rarity: RelicRarity): RelicDefinition[] {
  return RELICS.filter((relic) => relic.rarity === rarity);
}
