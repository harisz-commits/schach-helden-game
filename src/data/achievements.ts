import type { AchievementDefinition, KingdomMasteryDefinition } from '../core/types';

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'floor_4', name: 'Past the Gate', description: 'Reach Floor 4.', condition: { type: 'REACH_FLOOR', value: 4 }, crownShards: 10 },
  { id: 'floor_8', name: 'Into the Sands', description: 'Reach Floor 8.', condition: { type: 'REACH_FLOOR', value: 8 }, crownShards: 15 },
  { id: 'floor_12', name: 'Through the Ice', description: 'Reach Floor 12.', condition: { type: 'REACH_FLOOR', value: 12 }, crownShards: 20 },
  { id: 'floor_16', name: 'Into Shadow', description: 'Reach Floor 16.', condition: { type: 'REACH_FLOOR', value: 16 }, crownShards: 30 },
  { id: 'floor_20_clear', name: 'The First King Falls', description: 'Defeat Floor 20.', condition: { type: 'DEFEAT_FLOOR', value: 20 }, crownShards: 80 },
  {
    id: 'no_fountain',
    name: 'No Comfort Taken',
    description: 'Clear Floor 20 without using a Healing Fountain.',
    condition: { type: 'WIN_WITHOUT_HEALING_FOUNTAIN' },
    crownShards: 60,
  },
  {
    id: 'all_five_alive',
    name: 'Not One Left Behind',
    description: 'Finish a run with all five armies alive.',
    condition: { type: 'WIN_WITH_ALL_ARMIES' },
    crownShards: 50,
  },
  { id: 'blessings_20', name: 'Richly Blessed', description: 'Collect 20 blessings in one run.', condition: { type: 'BLESSINGS_IN_RUN', value: 20 }, crownShards: 30 },
  { id: 'legendary_5', name: 'Crowned in Light', description: 'Own 5 Legendary blessings in one run.', condition: { type: 'LEGENDARY_BLESSINGS_IN_RUN', value: 5 }, crownShards: 45 },
  { id: 'enemies_500', name: 'Five Hundred Answers', description: 'Defeat 500 enemies in total.', condition: { type: 'TOTAL_ENEMIES_DEFEATED', value: 500 }, crownShards: 40 },
  { id: 'treasures_100', name: 'Grave Robber', description: 'Open 100 treasures.', condition: { type: 'TOTAL_TREASURES_OPENED', value: 100 }, crownShards: 40 },
  { id: 'relics_100', name: 'Practised Hand', description: 'Use 100 relics.', condition: { type: 'TOTAL_RELICS_USED', value: 100 }, crownShards: 40 },
  { id: 'ascension_5', name: 'Fifth Ascent', description: 'Complete Ascension V.', condition: { type: 'COMPLETE_ASCENSION', value: 5 }, crownShards: 70 },
  { id: 'endless_50', name: 'Deeper Still', description: 'Reach Endless Floor 50.', condition: { type: 'REACH_ENDLESS_FLOOR', value: 50 }, crownShards: 80 },
  { id: 'endless_100', name: 'The Kingdom Has No Floor', description: 'Reach Endless Floor 100.', condition: { type: 'REACH_ENDLESS_FLOOR', value: 100 }, crownShards: 150 },
];

export const ACHIEVEMENTS_BY_ID: Record<string, AchievementDefinition> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/**
 * Kingdom Mastery: small permanent utility unlocks bought with Crown Shards.
 * Deliberately never raw power - the roguelite has to stay a roguelite.
 */
export const KINGDOM_MASTERY: KingdomMasteryDefinition[] = [
  { id: 'km_gold', name: 'Full Purse', description: 'Start every run with 25 Gold.', cost: 40, order: 1 },
  { id: 'km_reroll', name: 'Second Thoughts', description: 'Start every run with 1 blessing reroll.', cost: 70, order: 2 },
  { id: 'km_relic', name: 'Packed Light', description: 'Start every run with a random Common relic.', cost: 110, order: 3 },
  { id: 'km_merchant', name: 'Known Customer', description: 'Merchants stock one extra item.', cost: 150, order: 4 },
  { id: 'km_treasure', name: 'Scout Report', description: 'Floor 1 gains an additional treasure tile.', cost: 200, order: 5 },
];

export const KINGDOM_MASTERY_BY_ID: Record<string, KingdomMasteryDefinition> = Object.fromEntries(
  KINGDOM_MASTERY.map((m) => [m.id, m]),
);
