import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { GameConfig } from '../src/core/GameConfig';
import { generateMap } from '../src/map/MapGenerator';
import { MapView, isImpassable } from '../src/map/MapState';
import { bfsDistances, validateMap } from '../src/map/PathValidator';
import { FogSystem } from '../src/map/FogSystem';

/**
 * Soak test: thousands of seeds must all produce a playable floor.
 * Run the wider sweep with `npm run test:soak`.
 */
const SEEDS = process.env.SOAK === '1' ? 3000 : 400;

describe('map soak', () => {
  it(`generates ${SEEDS} valid floors across every floor size`, () => {
    const floors = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 20, 25, 40];
    const failures: string[] = [];
    let routeSum = 0;
    let attemptSum = 0;
    let checked = 0;

    for (let i = 0; i < SEEDS; i++) {
      const floor = floors[i % floors.length]!;
      const seed = (i * 2654435761) >>> 0;
      const rng = new RNG(seed);
      const { map, report } = generateMap(
        {
          floor,
          ascensionLevel: i % 11,
          mode: floor > 20 ? 'ENDLESS' : 'NORMAL',
          features: ['EXTENDED_EVENTS'],
        },
        rng,
      );
      const view = new MapView(map);
      const check = validateMap(view, GameConfig.map.requiredRoutes, GameConfig.map.minGuardianDistance);
      if (!check.valid) failures.push(`seed ${seed} floor ${floor}: ${check.reasons.join(', ')}`);
      routeSum += check.routesToGuardian;
      attemptSum += report.attempts;
      checked += 1;
    }

    if (failures.length > 0) console.log(failures.slice(0, 10).join('\n'));
    expect(failures).toHaveLength(0);
    expect(routeSum / checked).toBeGreaterThanOrEqual(GameConfig.map.requiredRoutes);
    // Generation should rarely need many retries.
    expect(attemptSum / checked).toBeLessThan(6);
  });

  it('never strands a reward behind impassable terrain', () => {
    for (let i = 0; i < 250; i++) {
      const rng = new RNG(i * 7919 + 13);
      const { map } = generateMap({ floor: (i % 20) + 1, ascensionLevel: 0, mode: 'NORMAL', features: [] }, rng);
      const view = new MapView(map);
      const reachable = bfsDistances(view, view.start);
      for (const tile of map.tiles) {
        if (isImpassable(tile.type)) continue;
        expect(reachable.has(tile.id), `tile ${tile.id} (${tile.type}) stranded on floor ${map.floor}`).toBe(true);
      }
    }
  });

  it('keeps the guardian away from the spawn and gates the exit behind it', () => {
    for (let i = 0; i < 250; i++) {
      const rng = new RNG(i * 104729 + 5);
      const floor = (i % 20) + 1;
      const { map } = generateMap({ floor, ascensionLevel: 0, mode: 'NORMAL', features: [] }, rng);
      const view = new MapView(map);
      const distances = bfsDistances(view, view.start);
      expect(distances.get(view.guardian.id)!).toBeGreaterThanOrEqual(GameConfig.map.minGuardianDistance);
      expect(view.guardian.id).not.toBe(view.start.id);
      expect(view.exit.id).not.toBe(view.guardian.id);
      expect(distances.has(view.exit.id)).toBe(true);
    }
  });

  it('lets the fog front reach every tile by clearing what it exposes', () => {
    // Simulates a player who clears every reachable tile: the whole floor,
    // guardian and exit included, must become reachable.
    for (let i = 0; i < 120; i++) {
      const rng = new RNG(i * 31337 + 7);
      const floor = (i % 20) + 1;
      const { map } = generateMap({ floor, ascensionLevel: 0, mode: 'NORMAL', features: [] }, rng);
      const view = new MapView(map);
      const fog = new FogSystem(view);

      let guard = 0;
      let frontier = fog.frontier();
      while (frontier.length > 0 && guard < 500) {
        guard += 1;
        fog.clearTile(frontier[0]!);
        frontier = fog.frontier();
      }

      const unopened = map.tiles.filter((tile) => !isImpassable(tile.type) && tile.state !== 'CLEARED');
      expect(unopened, `floor ${floor} left ${unopened.length} tiles unreachable`).toHaveLength(0);
    }
  });

  it('populates each floor with the content its definition promises', () => {
    for (let i = 0; i < 120; i++) {
      const floor = (i % 20) + 1;
      const { map } = generateMap(
        { floor, ascensionLevel: 0, mode: 'NORMAL', features: [] },
        new RNG(i * 48271 + 3),
      );
      const counts = new Map<string, number>();
      for (const tile of map.tiles) counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
      expect(counts.get('GUARDIAN')).toBe(1);
      expect(counts.get('EXIT')).toBe(1);
      expect(counts.get('START')).toBe(1);
      expect(counts.get('ENEMY') ?? 0).toBeGreaterThan(0);
      // At most one merchant per floor keeps gold decisions meaningful.
      expect(counts.get('MERCHANT') ?? 0).toBeLessThanOrEqual(1);

      for (const tile of map.tiles) {
        if (tile.type === 'ENEMY' || tile.type === 'ELITE' || tile.type === 'GUARDIAN') {
          expect(tile.encounterId).toBeTruthy();
          expect(map.encounters[tile.encounterId!]).toBeTruthy();
          expect(map.encounters[tile.encounterId!]!.units.length).toBeGreaterThan(0);
        }
        if (tile.type === 'EVENT') expect(tile.eventId).toBeTruthy();
        if (tile.type === 'RELIC') expect(tile.relicId).toBeTruthy();
      }
    }
  });

  it('puts the campaign boss on its floor', () => {
    for (const [floor, bossId] of [
      [4, 'the_gatekeeper'],
      [8, 'the_twin_knights'],
      [12, 'the_sorcerer_king'],
      [16, 'the_fallen_general'],
      [20, 'the_crownless_king'],
    ] as [number, string][]) {
      const { map } = generateMap({ floor, ascensionLevel: 0, mode: 'NORMAL', features: [] }, new RNG(floor * 999));
      const view = new MapView(map);
      const encounter = map.encounters[view.guardian.encounterId!]!;
      expect(encounter.bossId).toBe(bossId);
      expect(encounter.kind).toBe('BOSS');
    }
  });
});
