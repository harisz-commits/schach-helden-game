import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/RNG';
import { generateMap } from '../src/map/MapGenerator';
import { MapView } from '../src/map/MapState';
import { validateMap } from '../src/map/PathValidator';
import { GameConfig } from '../src/core/GameConfig';

function build(seed: number, floor: number) {
  const rng = new RNG(seed);
  const { map, report } = generateMap(
    { floor, ascensionLevel: 0, mode: 'NORMAL', features: [] },
    rng,
  );
  return { view: new MapView(map), map, report };
}

describe('MapGenerator', () => {
  it('produces a valid floor for a spread of seeds and floors', () => {
    for (let seed = 1; seed <= 120; seed++) {
      for (const floor of [1, 5, 9, 13, 17, 20]) {
        const { view } = build(seed * 7919 + floor, floor);
        const check = validateMap(view, GameConfig.map.requiredRoutes, GameConfig.map.minGuardianDistance);
        expect(check.guardianReachable, `seed ${seed} floor ${floor}`).toBe(true);
        expect(check.exitReachable).toBe(true);
        expect(check.unreachableTiles).toHaveLength(0);
        expect(check.guardianDistance).toBeGreaterThanOrEqual(GameConfig.map.minGuardianDistance);
        expect(check.routesToGuardian).toBeGreaterThanOrEqual(GameConfig.map.requiredRoutes);
      }
    }
  });

  it('is deterministic for the same seed', () => {
    const a = build(4242, 7);
    const b = build(4242, 7);
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
  });

  it('opens the start tile and its neighbours', () => {
    const { view } = build(99, 3);
    expect(view.start.state).toBe('CLEARED');
    const revealed = view.passableNeighbours(view.start).filter((t) => t.state === 'REVEALED');
    expect(revealed.length).toBeGreaterThan(0);
  });
});
