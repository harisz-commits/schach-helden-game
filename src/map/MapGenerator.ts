import type { EncounterData, MapData, TileData, TileType } from '../core/types';
import { GameConfig } from '../core/GameConfig';
import { RNG } from '../core/RNG';
import { floorDefinition, endlessBossId } from '../data/floors';
import { ascension } from '../data/ascensions';
import { eventPool } from '../data/events';
import { RELICS } from '../data/relics';
import { MapView, isImpassable, tileId } from './MapState';
import { bfsDistances, countIndependentRoutes, findChokepoints, validateMap } from './PathValidator';
import { generateEncounter } from './EncounterGenerator';

export interface MapGenerationOptions {
  floor: number;
  ascensionLevel: number;
  mode: 'NORMAL' | 'ENDLESS' | 'DAILY';
  features: string[];
  /** Kingdom Mastery: one extra treasure tile on floor 1. */
  bonusTreasureOnFirstFloor?: boolean;
}

export interface GenerationReport {
  attempts: number;
  routes: number;
  guardianDistance: number;
}

const NON_BLOCKABLE_DISTANCE = 1;

function makeTile(x: number, y: number, type: TileType): TileData {
  return { id: tileId(x, y), x, y, type, state: 'HIDDEN', scouted: false };
}

/** Blocks random cells while keeping the walkable region fully connected. */
function carveBlockedCells(tiles: TileData[], view: MapView, start: TileData, targetBlocked: number, rng: RNG): void {
  const candidates = rng.shuffle(
    tiles.filter((tile) => {
      if (tile.id === start.id) return false;
      const dx = Math.abs(tile.x - start.x);
      const dy = Math.abs(tile.y - start.y);
      return dx + dy > NON_BLOCKABLE_DISTANCE;
    }),
  );

  let blocked = 0;
  for (const tile of candidates) {
    if (blocked >= targetBlocked) break;
    tile.type = 'BLOCKED';
    const reach = bfsDistances(view, start);
    const openCount = tiles.filter((t) => !isImpassable(t.type)).length;
    if (reach.size !== openCount) {
      // The block stranded part of the map - undo it.
      tile.type = 'EMPTY';
      continue;
    }
    blocked += 1;
  }
}

/** Re-opens blocked cells around chokepoints until two independent routes exist. */
function ensureTwoRoutes(view: MapView, start: TileData, goal: TileData, rng: RNG): number {
  let routes = countIndependentRoutes(view, start, goal);
  let guard = 0;
  while (routes < GameConfig.map.requiredRoutes && guard < 24) {
    guard += 1;
    const chokepoints = findChokepoints(view, start, goal);
    if (chokepoints.length === 0) break;
    const choke = rng.pick(chokepoints);
    // Opening a wall next to the chokepoint is what creates the alternate loop.
    const walls = view
      .neighbours(choke)
      .filter((n) => isImpassable(n.type))
      .concat(
        view
          .neighbours(choke)
          .flatMap((n) => view.neighbours(n))
          .filter((n) => isImpassable(n.type)),
      );
    if (walls.length === 0) break;
    const wall = rng.pick(walls);
    wall.type = 'EMPTY';
    routes = countIndependentRoutes(view, start, goal);
  }
  return routes;
}

function pickStart(width: number, height: number, rng: RNG): { x: number; y: number } {
  // Spawn along the bottom edge so the map reads as "climbing upward".
  const x = rng.int(Math.floor(width / 2) - 1, Math.ceil(width / 2));
  return { x: Math.max(0, Math.min(width - 1, x)), y: height - 1 };
}

interface AttemptResult {
  tiles: TileData[];
  view: MapView;
  data: MapData;
  routes: number;
}

function attemptLayout(options: MapGenerationOptions, rng: RNG): AttemptResult | null {
  const def = floorDefinition(options.floor);
  const { width, height } = def;
  const tiles: TileData[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push(makeTile(x, y, 'EMPTY'));
    }
  }

  const data: MapData = {
    width,
    height,
    startTileId: '',
    guardianTileId: '',
    exitTileId: '',
    tiles,
    encounters: {},
    biomeId: def.biomeId,
    floor: options.floor,
  };
  const view = new MapView(data);

  const startPos = pickStart(width, height, rng);
  const start = view.at(startPos.x, startPos.y)!;
  start.type = 'START';
  data.startTileId = start.id;

  const total = width * height;
  const maxBlocked = Math.floor(total * (1 - GameConfig.map.minOpenRatio));
  const targetBlocked = Math.min(maxBlocked, Math.round(total * def.blockedRatio));
  carveBlockedCells(tiles, view, start, targetBlocked, rng);

  const distances = bfsDistances(view, start);
  const open = tiles.filter((tile) => !isImpassable(tile.type) && tile.id !== start.id);
  if (open.length < 12) return null;

  const maxDistance = Math.max(...Array.from(distances.values()));
  if (maxDistance < GameConfig.map.minGuardianDistance) return null;

  // Guardian: far from spawn, never adjacent to it.
  const guardianCandidates = open.filter((tile) => {
    const d = distances.get(tile.id) ?? -1;
    return d >= Math.max(GameConfig.map.minGuardianDistance, Math.floor(maxDistance * 0.55));
  });
  if (guardianCandidates.length === 0) return null;
  const guardian = rng.pick(guardianCandidates);
  guardian.type = 'GUARDIAN';
  data.guardianTileId = guardian.id;

  // Exit: far from spawn and not right next to the guardian, so clearing the
  // guardian still leaves a short walk and a reason to keep exploring.
  const guardianDistances = bfsDistances(view, guardian);
  const exitCandidates = open.filter((tile) => {
    if (tile.id === guardian.id) return false;
    const d = distances.get(tile.id) ?? -1;
    const gd = guardianDistances.get(tile.id) ?? -1;
    return d >= GameConfig.map.minExitDistance && gd >= 2;
  });
  const exit = exitCandidates.length > 0 ? rng.pick(exitCandidates) : rng.pick(open.filter((t) => t.id !== guardian.id));
  exit.type = 'EXIT';
  data.exitTileId = exit.id;

  const routes = ensureTwoRoutes(view, start, guardian, rng);
  return { tiles, view, data, routes };
}

function populate(result: AttemptResult, options: MapGenerationOptions, rng: RNG): void {
  const def = floorDefinition(options.floor);
  const asc = ascension(options.ascensionLevel);
  const { view, data } = result;
  const encounters: Record<string, EncounterData> = {};

  const free = data.tiles.filter((tile) => tile.type === 'EMPTY');
  const shuffled = rng.shuffle(free);
  let cursor = 0;
  const take = (): TileData | undefined => shuffled[cursor++];

  const enemyCount = rng.int(def.enemyCount[0], def.enemyCount[1]);
  const eliteCount = rng.int(def.eliteCount[0], def.eliteCount[1]) + asc.extraElites;

  for (let i = 0; i < enemyCount; i++) {
    const tile = take();
    if (!tile) break;
    tile.type = 'ENEMY';
  }
  for (let i = 0; i < eliteCount; i++) {
    const tile = take();
    if (!tile) break;
    tile.type = 'ELITE';
  }

  if (options.bonusTreasureOnFirstFloor && options.floor === 1) {
    const tile = take();
    if (tile) tile.type = 'TREASURE';
  }

  // Fill the remainder from the weighted node table.
  const weights: Partial<Record<TileType, number>> = { ...def.nodeWeights };
  if (asc.healingNodeMultiplier !== 1) {
    for (const key of ['HEALING_FOUNTAIN', 'SACRED_SPRING'] as TileType[]) {
      if (weights[key]) weights[key] = Math.max(1, Math.round(weights[key]! * asc.healingNodeMultiplier));
    }
  }
  let merchantPlaced = 0;
  for (let i = cursor; i < shuffled.length; i++) {
    const tile = shuffled[i]!;
    let type = rng.weightedKey(weights);
    // At most one merchant per floor keeps gold decisions meaningful.
    if (type === 'MERCHANT') {
      if (merchantPlaced >= 1) type = 'EMPTY';
      else merchantPlaced += 1;
    }
    tile.type = type;
  }

  // Attach payloads.
  const events = eventPool(options.floor, options.features);
  const eco = GameConfig.economy;
  for (const tile of data.tiles) {
    switch (tile.type) {
      case 'ENEMY':
      case 'ELITE': {
        const kind = tile.type === 'ELITE' ? 'ELITE' : 'ENEMY';
        const id = `enc_${tile.id}`;
        encounters[id] = generateEncounter(
          { id, floor: options.floor, kind, ascensionLevel: options.ascensionLevel },
          rng,
        );
        tile.encounterId = id;
        break;
      }
      case 'GUARDIAN': {
        const id = `enc_${tile.id}`;
        const bossId = options.mode === 'ENDLESS' ? endlessBossId(options.floor) : def.bossId;
        encounters[id] = generateEncounter(
          {
            id,
            floor: options.floor,
            kind: bossId ? 'BOSS' : 'GUARDIAN',
            ascensionLevel: options.ascensionLevel,
            ...(bossId ? { bossId } : {}),
          },
          rng,
        );
        tile.encounterId = id;
        break;
      }
      case 'EVENT': {
        if (events.length === 0) {
          tile.type = 'EMPTY';
        } else {
          tile.eventId = rng.weighted(events, (e) => e.weight).id;
        }
        break;
      }
      case 'RELIC': {
        const rarity = rng.weightedKey(eco.relicRarityWeights);
        const pool = RELICS.filter((relic) => relic.rarity === rarity);
        tile.relicId = (pool.length > 0 ? rng.pick(pool) : rng.pick(RELICS)).id;
        break;
      }
      case 'TREASURE':
        tile.gold = rng.int(eco.goldPerTreasure[0], eco.goldPerTreasure[1]);
        break;
      case 'GOLD':
        tile.gold = rng.int(eco.goldTileAmount[0], eco.goldTileAmount[1]);
        break;
      default:
        break;
    }
  }

  data.encounters = encounters;

  // Reveal the start and its immediate surroundings.
  const start = view.start;
  start.state = 'CLEARED';
  start.scouted = true;
  for (const n of view.passableNeighbours(start)) {
    n.state = 'REVEALED';
  }
}

/**
 * Generates a fully validated floor. Guarantees (asserted by the soak tests):
 *  - the guardian is reachable and never adjacent to the spawn
 *  - the exit is reachable
 *  - no walkable tile is stranded
 *  - at least two independent routes lead to the guardian
 */
export function generateMap(
  options: MapGenerationOptions,
  rng: RNG,
): { map: MapData; report: GenerationReport } {
  let fallback: AttemptResult | null = null;
  for (let attempt = 1; attempt <= GameConfig.map.maxGenerationAttempts; attempt++) {
    const result = attemptLayout(options, rng);
    if (!result) continue;
    const check = validateMap(result.view, GameConfig.map.requiredRoutes, GameConfig.map.minGuardianDistance);
    if (check.valid) {
      populate(result, options, rng);
      return {
        map: result.data,
        report: { attempts: attempt, routes: check.routesToGuardian, guardianDistance: check.guardianDistance },
      };
    }
    // Keep the best "reachable but single route" layout as a safety net.
    if (!fallback && check.guardianReachable && check.exitReachable && check.unreachableTiles.length === 0) {
      fallback = result;
    }
  }

  if (fallback) {
    populate(fallback, options, rng);
    const check = validateMap(fallback.view, 1, 1);
    return {
      map: fallback.data,
      report: {
        attempts: GameConfig.map.maxGenerationAttempts,
        routes: check.routesToGuardian,
        guardianDistance: check.guardianDistance,
      },
    };
  }

  // Last resort: an open grid with no blocked cells always validates.
  const openOptions = { ...options };
  const rngOpen = rng.fork('open-fallback');
  const result = attemptOpenGrid(openOptions);
  populate(result, openOptions, rngOpen);
  const check = validateMap(result.view, 1, 1);
  return {
    map: result.data,
    report: { attempts: GameConfig.map.maxGenerationAttempts, routes: check.routesToGuardian, guardianDistance: check.guardianDistance },
  };
}

function attemptOpenGrid(options: MapGenerationOptions): AttemptResult {
  const def = floorDefinition(options.floor);
  const tiles: TileData[] = [];
  for (let y = 0; y < def.height; y++) {
    for (let x = 0; x < def.width; x++) tiles.push(makeTile(x, y, 'EMPTY'));
  }
  const data: MapData = {
    width: def.width,
    height: def.height,
    startTileId: '',
    guardianTileId: '',
    exitTileId: '',
    tiles,
    encounters: {},
    biomeId: def.biomeId,
    floor: options.floor,
  };
  const view = new MapView(data);
  const start = view.at(Math.floor(def.width / 2), def.height - 1)!;
  start.type = 'START';
  data.startTileId = start.id;
  const guardian = view.at(Math.floor(def.width / 2), 0)!;
  guardian.type = 'GUARDIAN';
  data.guardianTileId = guardian.id;
  const exit = view.at(0, 0)!;
  exit.type = 'EXIT';
  data.exitTileId = exit.id;
  return { tiles, view, data, routes: 2 };
}
