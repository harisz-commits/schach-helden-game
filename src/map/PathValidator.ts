import type { TileData } from '../core/types';
import { MapView, isImpassable } from './MapState';

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
  guardianReachable: boolean;
  exitReachable: boolean;
  unreachableTiles: string[];
  routesToGuardian: number;
  guardianDistance: number;
}

/** Breadth-first distances from a tile, treating BLOCKED as walls. */
export function bfsDistances(view: MapView, from: TileData, skipId?: string): Map<string, number> {
  const dist = new Map<string, number>();
  if (isImpassable(from.type) || from.id === skipId) return dist;
  dist.set(from.id, 0);
  const queue: TileData[] = [from];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const d = dist.get(current.id)!;
    for (const next of view.passableNeighbours(current)) {
      if (next.id === skipId || dist.has(next.id)) continue;
      dist.set(next.id, d + 1);
      queue.push(next);
    }
  }
  return dist;
}

export function isReachable(view: MapView, from: TileData, to: TileData, skipId?: string): boolean {
  if (from.id === to.id) return true;
  return bfsDistances(view, from, skipId).has(to.id);
}

/**
 * Returns 2 when start and goal stay connected no matter which single
 * intermediate tile is removed (i.e. there is no chokepoint), otherwise 1,
 * or 0 when the goal is unreachable at all.
 *
 * This is what guarantees "at least two interesting routes" per floor.
 */
export function countIndependentRoutes(view: MapView, from: TileData, to: TileData): number {
  if (!isReachable(view, from, to)) return 0;
  for (const tile of view.tiles) {
    if (isImpassable(tile.type)) continue;
    if (tile.id === from.id || tile.id === to.id) continue;
    if (!isReachable(view, from, to, tile.id)) return 1;
  }
  return 2;
}

/** Finds the chokepoint tiles that a single removal would cut the route at. */
export function findChokepoints(view: MapView, from: TileData, to: TileData): TileData[] {
  const out: TileData[] = [];
  for (const tile of view.tiles) {
    if (isImpassable(tile.type)) continue;
    if (tile.id === from.id || tile.id === to.id) continue;
    if (!isReachable(view, from, to, tile.id)) out.push(tile);
  }
  return out;
}

/**
 * Full floor validation. Used by the generator on every attempt and by the
 * soak tests across thousands of seeds.
 */
export function validateMap(view: MapView, requiredRoutes: number, minGuardianDistance: number): ValidationResult {
  const reasons: string[] = [];
  const start = view.start;
  const guardian = view.guardian;
  const exit = view.exit;

  const distances = bfsDistances(view, start);
  const guardianReachable = distances.has(guardian.id);
  const exitReachable = distances.has(exit.id);
  const guardianDistance = distances.get(guardian.id) ?? -1;

  if (!guardianReachable) reasons.push('guardian unreachable');
  if (!exitReachable) reasons.push('exit unreachable');
  if (guardianReachable && guardianDistance < minGuardianDistance) {
    reasons.push(`guardian too close to spawn (${guardianDistance})`);
  }

  // Every walkable tile must be reachable, otherwise content is stranded.
  const unreachableTiles: string[] = [];
  for (const tile of view.tiles) {
    if (isImpassable(tile.type)) continue;
    if (!distances.has(tile.id)) unreachableTiles.push(tile.id);
  }
  if (unreachableTiles.length > 0) reasons.push(`${unreachableTiles.length} stranded tiles`);

  const routesToGuardian = guardianReachable ? countIndependentRoutes(view, start, guardian) : 0;
  if (routesToGuardian < requiredRoutes) {
    reasons.push(`only ${routesToGuardian} route(s) to the guardian`);
  }

  return {
    valid: reasons.length === 0,
    reasons,
    guardianReachable,
    exitReachable,
    unreachableTiles,
    routesToGuardian,
    guardianDistance,
  };
}
