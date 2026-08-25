import type { TileData } from '../core/types';
import { RNG } from '../core/RNG';
import { INTERESTING_TILES, MapView, isImpassable } from './MapState';

/**
 * Fog of war.
 *
 * Three visibility levels:
 *  - HIDDEN   : unknown, not interactable
 *  - REVEALED : adjacent to something you cleared, content visible, tappable
 *  - CLEARED  : already resolved
 *
 * A tile may additionally be `scouted`: its content is known (Oracle Tower,
 * Golden Compass, ...) while it stays out of reach until the fog front arrives.
 */
export class FogSystem {
  constructor(private readonly view: MapView) {}

  /** Opens the tiles next to a freshly cleared tile. */
  revealAround(tile: TileData): TileData[] {
    const opened: TileData[] = [];
    for (const next of this.view.passableNeighbours(tile)) {
      if (next.state === 'HIDDEN') {
        next.state = 'REVEALED';
        opened.push(next);
      }
    }
    return opened;
  }

  /** Marks a tile resolved and pushes the fog front outward. */
  clearTile(tile: TileData): TileData[] {
    tile.state = 'CLEARED';
    tile.scouted = true;
    return this.revealAround(tile);
  }

  /** True when the player is allowed to tap this tile right now. */
  canInteract(tile: TileData): boolean {
    return tile.state === 'REVEALED' && !isImpassable(tile.type);
  }

  /** Rebuilds REVEALED state from the cleared set - used after loading a save. */
  recompute(): void {
    for (const tile of this.view.tiles) {
      if (tile.state === 'CLEARED') {
        for (const next of this.view.passableNeighbours(tile)) {
          if (next.state === 'HIDDEN') next.state = 'REVEALED';
        }
      }
    }
  }

  /** Scouting effects: learn what is out there without opening a path to it. */
  scout(count: number, rng: RNG, options: { prioritiseInteresting?: boolean } = {}): TileData[] {
    const hidden = this.view.tiles.filter(
      (tile) => !tile.scouted && !isImpassable(tile.type) && tile.state !== 'CLEARED',
    );
    if (hidden.length === 0) return [];
    const ranked = options.prioritiseInteresting
      ? [
          ...rng.shuffle(hidden.filter((t) => INTERESTING_TILES.includes(t.type))),
          ...rng.shuffle(hidden.filter((t) => !INTERESTING_TILES.includes(t.type))),
        ]
      : rng.shuffle(hidden);
    const picked = ranked.slice(0, count);
    for (const tile of picked) tile.scouted = true;
    return picked;
  }

  scoutGuardian(): TileData {
    const guardian = this.view.guardian;
    guardian.scouted = true;
    return guardian;
  }

  /** Reveals everything - used by the Ancient Library event and debug tools. */
  scoutAll(): void {
    for (const tile of this.view.tiles) tile.scouted = true;
  }

  /** Tiles the player can currently act on. */
  frontier(): TileData[] {
    return this.view.tiles.filter((tile) => this.canInteract(tile));
  }
}
