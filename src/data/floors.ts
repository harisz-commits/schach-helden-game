import type { BiomeDefinition, FloorDefinition, TileType } from '../core/types';

export const BIOMES: BiomeDefinition[] = [
  {
    id: 'emerald_ruins',
    name: 'Emerald Ruins',
    floors: [1, 4],
    palette: { background: 0x14210f, tile: 0x2f4a2a, tileAlt: 0x3a5733, fog: 0x1b2418, accent: 0x8fd06a, hazard: 0xc9743a },
    decor: 'RUINS',
  },
  {
    id: 'sunken_sands',
    name: 'Sunken Sands',
    floors: [5, 8],
    palette: { background: 0x241c10, tile: 0x5c4728, tileAlt: 0x6d5631, fog: 0x241d13, accent: 0xe0c273, hazard: 0xb5502f },
    decor: 'DUNES',
  },
  {
    id: 'frozen_dominion',
    name: 'Frozen Dominion',
    floors: [9, 12],
    palette: { background: 0x101b24, tile: 0x2c4657, tileAlt: 0x365467, fog: 0x16212b, accent: 0xa8dcf0, hazard: 0x5f9ec4 },
    decor: 'ICE',
  },
  {
    id: 'shadow_realm',
    name: 'Shadow Realm',
    floors: [13, 16],
    palette: { background: 0x160f1e, tile: 0x33234a, tileAlt: 0x3f2c59, fog: 0x1a1224, accent: 0xb07ff0, hazard: 0x8f3bbd },
    decor: 'SHADOW',
  },
  {
    id: 'burning_empire',
    name: 'Burning Empire',
    floors: [17, 19],
    palette: { background: 0x1e0d09, tile: 0x53231a, tileAlt: 0x652c20, fog: 0x21100b, accent: 0xf0813a, hazard: 0xe03b1f },
    decor: 'LAVA',
  },
  {
    id: 'golden_throne',
    name: 'Golden Throne',
    floors: [20, 20],
    palette: { background: 0x1d1708, tile: 0x584618, tileAlt: 0x6b5620, fog: 0x241d0c, accent: 0xf2d06a, hazard: 0xd94f2f },
    decor: 'THRONE',
  },
];

export const BIOMES_BY_ID: Record<string, BiomeDefinition> = Object.fromEntries(BIOMES.map((b) => [b.id, b]));

/** Endless floors rotate through the five campaign biomes. */
export function biomeForFloor(floor: number): BiomeDefinition {
  const direct = BIOMES.find((b) => floor >= b.floors[0] && floor <= b.floors[1]);
  if (direct) return direct;
  const rotation = BIOMES.filter((b) => b.id !== 'golden_throne');
  return rotation[(floor - 1) % rotation.length]!;
}

type NodeWeights = Partial<Record<TileType, number>>;

const EARLY_NODES: NodeWeights = {
  EMPTY: 90,
  TREASURE: 34,
  GOLD: 40,
  HEALING_FOUNTAIN: 26,
  EVENT: 30,
  MERCHANT: 14,
  RELIC: 16,
  SHRINE: 12,
  ORACLE_TOWER: 10,
  TRAP: 12,
  WAR_CAMP: 10,
};

const MID_NODES: NodeWeights = {
  EMPTY: 78,
  TREASURE: 34,
  GOLD: 36,
  HEALING_FOUNTAIN: 24,
  SACRED_SPRING: 12,
  EVENT: 34,
  MERCHANT: 16,
  RELIC: 18,
  SHRINE: 12,
  TEMPLE: 10,
  ORACLE_TOWER: 12,
  RESURRECTION_SHRINE: 14,
  RECRUITMENT_CAMP: 10,
  ALTAR: 14,
  TRAP: 14,
  WAR_CAMP: 12,
};

const LATE_NODES: NodeWeights = {
  EMPTY: 68,
  TREASURE: 32,
  GOLD: 32,
  HEALING_FOUNTAIN: 22,
  SACRED_SPRING: 14,
  EVENT: 34,
  MERCHANT: 16,
  RELIC: 20,
  SHRINE: 12,
  TEMPLE: 12,
  ORACLE_TOWER: 12,
  RESURRECTION_SHRINE: 18,
  RECRUITMENT_CAMP: 12,
  ALTAR: 18,
  TRAP: 18,
  WAR_CAMP: 12,
};

interface BandSpec {
  range: [number, number];
  width: number;
  height: number;
  enemyCount: [number, number];
  eliteCount: [number, number];
  nodes: NodeWeights;
  blockedRatio: number;
}

const BANDS: BandSpec[] = [
  { range: [1, 4], width: 7, height: 7, enemyCount: [5, 7], eliteCount: [0, 1], nodes: EARLY_NODES, blockedRatio: 0.14 },
  { range: [5, 8], width: 7, height: 8, enemyCount: [6, 8], eliteCount: [1, 2], nodes: MID_NODES, blockedRatio: 0.15 },
  { range: [9, 12], width: 8, height: 8, enemyCount: [7, 9], eliteCount: [1, 2], nodes: MID_NODES, blockedRatio: 0.16 },
  { range: [13, 16], width: 8, height: 9, enemyCount: [8, 10], eliteCount: [2, 3], nodes: LATE_NODES, blockedRatio: 0.16 },
  { range: [17, 19], width: 9, height: 9, enemyCount: [9, 12], eliteCount: [2, 4], nodes: LATE_NODES, blockedRatio: 0.17 },
];

const BOSS_FLOORS: Record<number, string> = {
  4: 'the_gatekeeper',
  8: 'the_twin_knights',
  12: 'the_sorcerer_king',
  16: 'the_fallen_general',
  20: 'the_crownless_king',
};

function bandFor(floor: number): BandSpec {
  const band = BANDS.find((b) => floor >= b.range[0] && floor <= b.range[1]);
  if (band) return band;
  // Endless: keep growing slowly, capped so mobile screens stay readable.
  const extra = Math.min(2, Math.floor((floor - 19) / 8));
  const base = BANDS[BANDS.length - 1]!;
  return {
    ...base,
    width: Math.min(10, base.width + extra),
    height: Math.min(10, base.height + extra),
    enemyCount: [base.enemyCount[0] + extra, base.enemyCount[1] + extra],
    eliteCount: [base.eliteCount[0] + extra, base.eliteCount[1] + extra],
  };
}

/** Floor definitions are derived so Endless can extend past 20 with the same rules. */
export function floorDefinition(floor: number): FloorDefinition {
  const biome = biomeForFloor(floor);
  if (floor === 20) {
    return {
      floor,
      width: 7,
      height: 7,
      biomeId: biome.id,
      enemyCount: [4, 5],
      eliteCount: [2, 2],
      nodeWeights: {
        EMPTY: 60,
        TREASURE: 30,
        HEALING_FOUNTAIN: 30,
        SACRED_SPRING: 22,
        RELIC: 24,
        SHRINE: 18,
        TEMPLE: 16,
        RESURRECTION_SHRINE: 20,
      },
      bossId: BOSS_FLOORS[20],
      isCheckpoint: true,
      blockedRatio: 0.12,
    };
  }
  const band = bandFor(floor);
  const bossId = BOSS_FLOORS[floor];
  return {
    floor,
    width: band.width,
    height: band.height,
    biomeId: biome.id,
    enemyCount: band.enemyCount,
    eliteCount: band.eliteCount,
    nodeWeights: band.nodes,
    ...(bossId ? { bossId } : {}),
    isCheckpoint: floor % 4 === 0,
    blockedRatio: band.blockedRatio,
  };
}

export const CHECKPOINT_FLOORS = [4, 8, 12, 16];

/**
 * Every generated floor carries a small guaranteed activity spine. Random
 * weights still shape the rest, but an unlucky seed can no longer produce a
 * stretch that feels like empty tapping between compulsory fights.
 */
export function guaranteedNodesForFloor(floor: number): TileType[] {
  if (floor === 20) return [];
  const nodes: TileType[] = ['EVENT', 'TREASURE', 'RELIC'];
  nodes.push(floor <= 4 ? 'WAR_CAMP' : floor % 2 === 0 ? 'ALTAR' : 'ORACLE_TOWER');
  if (floor % 2 === 0) nodes.push('MERCHANT');
  return nodes;
}

/** Endless bosses reuse the campaign bosses on a rotation. */
export function endlessBossId(floor: number): string | undefined {
  if (floor <= 20) return BOSS_FLOORS[floor];
  const bosses = ['the_gatekeeper', 'the_twin_knights', 'the_sorcerer_king', 'the_fallen_general', 'the_crownless_king'];
  if (floor % 5 !== 0) return undefined;
  return bosses[Math.floor(floor / 5 - 1) % bosses.length];
}
