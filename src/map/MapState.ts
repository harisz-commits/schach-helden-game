import type { MapData, TileData, TileType } from '../core/types';

/** Tile types the player must fight through before the tile opens up. */
export const COMBAT_TILES: TileType[] = ['ENEMY', 'ELITE', 'GUARDIAN'];

/** Tile types worth revealing with scouting effects. */
export const INTERESTING_TILES: TileType[] = [
  'GUARDIAN',
  'TREASURE',
  'RELIC',
  'MERCHANT',
  'HEALING_FOUNTAIN',
  'SACRED_SPRING',
  'RESURRECTION_SHRINE',
  'EVENT',
  'ALTAR',
  'TEMPLE',
  'EXIT',
  'ELITE',
];

export function tileId(x: number, y: number): string {
  return `${x},${y}`;
}

export function isCombatTile(type: TileType): boolean {
  return COMBAT_TILES.includes(type);
}

/** Tiles the player can never walk into. */
export function isImpassable(type: TileType): boolean {
  return type === 'BLOCKED';
}

export class MapView {
  readonly byId: Map<string, TileData>;

  constructor(readonly data: MapData) {
    this.byId = new Map(data.tiles.map((tile) => [tile.id, tile]));
  }

  get width(): number {
    return this.data.width;
  }

  get height(): number {
    return this.data.height;
  }

  at(x: number, y: number): TileData | undefined {
    if (x < 0 || y < 0 || x >= this.data.width || y >= this.data.height) return undefined;
    return this.byId.get(tileId(x, y));
  }

  get(id: string): TileData | undefined {
    return this.byId.get(id);
  }

  require(id: string): TileData {
    const tile = this.byId.get(id);
    if (!tile) throw new Error(`Unknown tile: ${id}`);
    return tile;
  }

  get start(): TileData {
    return this.require(this.data.startTileId);
  }

  get guardian(): TileData {
    return this.require(this.data.guardianTileId);
  }

  get exit(): TileData {
    return this.require(this.data.exitTileId);
  }

  /** Orthogonal neighbours only - the whole game reads the grid this way. */
  neighbours(tile: TileData): TileData[] {
    const out: TileData[] = [];
    const deltas = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (const [dx, dy] of deltas) {
      const next = this.at(tile.x + dx!, tile.y + dy!);
      if (next) out.push(next);
    }
    return out;
  }

  passableNeighbours(tile: TileData): TileData[] {
    return this.neighbours(tile).filter((n) => !isImpassable(n.type));
  }

  get tiles(): TileData[] {
    return this.data.tiles;
  }

  /** Every tile the player has resolved. */
  clearedTiles(): TileData[] {
    return this.data.tiles.filter((tile) => tile.state === 'CLEARED');
  }
}
