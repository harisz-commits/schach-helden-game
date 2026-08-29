import Phaser from 'phaser';
import type { BiomeDefinition, TileData } from '../core/types';
import { hashString } from '../core/RNG';

/**
 * Terrain rendering for the expedition map.
 *
 * The map is meant to read as ground you are uncovering, not as a spreadsheet
 * of coloured squares: every tile is a raised block with a lit top face, a
 * shaded side and biome-specific scatter, and unexplored ground is buried
 * under drifting cloud rather than a flat panel with a question mark.
 */

/** Lightens a colour towards white by `amount` (0..1). */
export function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (
    (Math.round(r + (255 - r) * amount) << 16) |
    (Math.round(g + (255 - g) * amount) << 8) |
    Math.round(b + (255 - b) * amount)
  );
}

/** Darkens a colour towards black by `amount` (0..1). */
export function shade(color: number, amount: number): number {
  const r = Math.round(((color >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((color >> 8) & 0xff) * (1 - amount));
  const b = Math.round((color & 0xff) * (1 - amount));
  return (r << 16) | (g << 8) | b;
}

/**
 * Isometric projection.
 *
 * `TILE_RATIO` is the height of a tile's diamond relative to its width. A
 * textbook 2:1 view (0.5) produces a grid twice as wide as it is tall, which
 * on a portrait phone leaves most of the screen empty and forces constant
 * horizontal panning. 0.68 is a steeper camera: unmistakably isometric, but
 * the floor is close to filling a tall viewport.
 */
export const TILE_RATIO = 0.68;

/** Vertical thickness of a tile block, as a share of tile width. */
export const TILE_DEPTH = 0.17;

/** Grid coordinates to screen offset, before the board's own pan offset. */
export function isoProject(gx: number, gy: number, tileWidth: number): { x: number; y: number } {
  const h = tileWidth * TILE_RATIO;
  return { x: (gx - gy) * (tileWidth / 2), y: (gx + gy) * (h / 2) };
}

/** Bounding box of a whole grid in projected space, including tile extents. */
export function isoGridBounds(
  width: number,
  height: number,
  tileWidth: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const h = tileWidth * TILE_RATIO;
  const depth = tileWidth * TILE_DEPTH;
  return {
    minX: -(height - 1) * (tileWidth / 2) - tileWidth / 2,
    maxX: (width - 1) * (tileWidth / 2) + tileWidth / 2,
    minY: -h / 2,
    maxY: (width - 1 + height - 1) * (h / 2) + h / 2 + depth,
  };
}

/**
 * The tile diamond as a Phaser hit area.
 *
 * Phaser tests hit areas in local space measured from a game object's top-left
 * corner, not from its centre - a centred polygon silently never matches.
 */
export function isoDiamondHitArea(tileWidth: number): number[] {
  const h = tileWidth * TILE_RATIO;
  return [tileWidth / 2, 0, tileWidth, h / 2, tileWidth / 2, h, 0, h / 2];
}

export interface TileSurfaceOptions {
  size: number;
  biome: BiomeDefinition;
  /** Unexplored ground sits under cloud and gets no scatter. */
  known: boolean;
  /** Already resolved: walked-over ground, visibly trodden down. */
  cleared: boolean;
  /** Reachable right now, so it catches the light. */
  active: boolean;
}

/**
 * Draws one tile as an isometric block of ground.
 *
 * Three faces: a lit diamond on top and two side faces below it, the left one
 * darker than the right so the whole board reads as lit from one direction.
 * Without the sides the grid is just a pattern of rhombuses on a flat plane.
 */
export function drawTileSurface(g: Phaser.GameObjects.Graphics, tile: TileData, options: TileSurfaceOptions): void {
  const { size, biome, known, cleared, active } = options;
  const w = size;
  const h = w * TILE_RATIO;
  const depth = w * TILE_DEPTH;

  const base = known ? (cleared ? shade(biome.palette.tile, 0.3) : biome.palette.tile) : biome.palette.fog;
  const top = active ? lighten(base, 0.28) : known ? lighten(base, 0.12) : base;

  // Left and right side faces, from the lower corners down.
  g.fillStyle(shade(base, 0.52), 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(-w / 2, 0),
      new Phaser.Geom.Point(0, h / 2),
      new Phaser.Geom.Point(0, h / 2 + depth),
      new Phaser.Geom.Point(-w / 2, depth),
    ],
    true,
  );
  g.fillStyle(shade(base, 0.34), 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(w / 2, 0),
      new Phaser.Geom.Point(0, h / 2),
      new Phaser.Geom.Point(0, h / 2 + depth),
      new Phaser.Geom.Point(w / 2, depth),
    ],
    true,
  );

  // Lit top face.
  g.fillStyle(top, 1);
  g.fillPoints(
    [
      new Phaser.Geom.Point(0, -h / 2),
      new Phaser.Geom.Point(w / 2, 0),
      new Phaser.Geom.Point(0, h / 2),
      new Phaser.Geom.Point(-w / 2, 0),
    ],
    true,
  );

  // Seam along the top edges keeps neighbouring tiles from merging into one mass.
  g.lineStyle(1, lighten(top, 0.3), known ? 0.35 : 0.12);
  g.strokePoints(
    [
      new Phaser.Geom.Point(0, -h / 2),
      new Phaser.Geom.Point(w / 2, 0),
      new Phaser.Geom.Point(0, h / 2),
      new Phaser.Geom.Point(-w / 2, 0),
    ],
    true,
  );

  if (known && !cleared) drawScatter(g, tile, w, biome);
}

/** Outline of a tile's top face, used for the "you can act here" highlight. */
export function strokeTileDiamond(
  g: Phaser.GameObjects.Graphics,
  size: number,
  color: number,
  thickness: number,
  alpha = 1,
): void {
  const h = size * TILE_RATIO;
  g.lineStyle(thickness, color, alpha);
  g.strokePoints(
    [
      new Phaser.Geom.Point(0, -h / 2),
      new Phaser.Geom.Point(size / 2, 0),
      new Phaser.Geom.Point(0, h / 2),
      new Phaser.Geom.Point(-size / 2, 0),
    ],
    true,
  );
}

/**
 * Deterministic ground detail: pebbles, tufts, cracks or ice shards depending
 * on the biome. Seeded from the tile id so a floor looks the same every time
 * it is drawn, including after a reload.
 */
function drawScatter(g: Phaser.GameObjects.Graphics, tile: TileData, size: number, biome: BiomeDefinition): void {
  const seed = hashString(`scatter:${tile.id}:${biome.id}`);
  const detail = lighten(biome.palette.tile, 0.14);
  const dark = shade(biome.palette.tile, 0.3);
  const count = 3 + (seed % 3);

  for (let i = 0; i < count; i++) {
    const h = hashString(`${tile.id}:${i}`, seed);
    // Keep scatter inside the diamond: sample a point then squeeze it toward
    // the centre by how far out it is along the other axis.
    const rx = (((h >>> 3) % 1000) / 1000 - 0.5) * 2;
    const ry = (((h >>> 13) % 1000) / 1000 - 0.5) * 2;
    const inset = Math.max(0, 1 - Math.abs(rx) - Math.abs(ry) * 0.5);
    const x = rx * size * 0.34 * (0.4 + inset);
    const y = ry * size * TILE_RATIO * 0.34 * (0.4 + inset);
    const scale = size * (0.035 + (((h >>> 23) % 100) / 100) * 0.045);

    switch (biome.decor) {
      case 'DUNES':
        // Wind ripples.
        g.fillStyle(detail, 0.5);
        g.fillRect(x - scale * 1.6, y, scale * 3.2, Math.max(1, scale * 0.4));
        break;
      case 'ICE':
        // Angular shards.
        g.fillStyle(lighten(biome.palette.accent, 0.2), 0.35);
        g.fillTriangle(x, y - scale, x - scale * 0.7, y + scale, x + scale * 0.7, y + scale);
        break;
      case 'LAVA':
        // Glowing cracks.
        g.fillStyle(biome.palette.hazard, 0.42);
        g.fillRect(x, y, Math.max(1, scale * 0.5), scale * 2);
        break;
      case 'SHADOW':
        g.fillStyle(biome.palette.accent, 0.22);
        g.fillCircle(x, y, scale * 0.8);
        break;
      case 'THRONE':
        // Inlaid tiling.
        g.fillStyle(lighten(biome.palette.accent, 0.1), 0.22);
        g.fillRect(x - scale, y - scale * 0.3, scale * 2, Math.max(1, scale * 0.6));
        break;
      case 'RUINS':
      default:
        // Grass tufts and stones.
        if (i % 2 === 0) {
          g.fillStyle(detail, 0.45);
          g.fillTriangle(x, y - scale * 1.3, x - scale * 0.5, y + scale * 0.4, x + scale * 0.5, y + scale * 0.4);
        } else {
          g.fillStyle(dark, 0.4);
          g.fillEllipse(x, y, scale * 1.6, scale * 1.1);
        }
        break;
    }
  }
}

/**
 * Cloud cover over unexplored ground.
 *
 * Built from overlapping circles so the fog has a soft, irregular silhouette -
 * a flat rectangle with a "?" printed on it never reads as fog.
 */
export function drawFogCloud(g: Phaser.GameObjects.Graphics, tile: TileData, size: number, biome: BiomeDefinition): void {
  const seed = hashString(`fog:${tile.id}`);
  const pale = lighten(biome.palette.fog, 0.3);

  const h = size * TILE_RATIO;
  g.fillStyle(shade(biome.palette.fog, 0.45), 0.95);
  g.fillPoints(
    [
      new Phaser.Geom.Point(0, -h / 2),
      new Phaser.Geom.Point(size / 2, 0),
      new Phaser.Geom.Point(0, h / 2),
      new Phaser.Geom.Point(-size / 2, 0),
    ],
    true,
  );

  // Deliberately low contrast: unexplored ground should recede so the tiles
  // you can actually act on are the first thing the eye lands on.
  // Many large, very faint puffs blend into haze; a few strong ones read as
  // grubby blotches, which is what the first attempt looked like.
  const puffs = 8;
  for (let i = 0; i < puffs; i++) {
    const h = hashString(`puff:${i}`, seed);
    const x = (((h >>> 5) % 1000) / 1000 - 0.5) * size * 0.62;
    const y = (((h >>> 15) % 1000) / 1000 - 0.5) * size * TILE_RATIO * 0.62;
    const r = size * (0.16 + (((h >>> 25) % 100) / 100) * 0.11);
    g.fillStyle(pale, 0.045);
    g.fillCircle(x, y, r);
  }
}

/**
 * A small stone pedestal under structures, so buildings look like they stand
 * on the ground rather than floating as icons.
 */
export function drawPedestal(g: Phaser.GameObjects.Graphics, size: number, biome: BiomeDefinition): void {
  const w = size * 0.52;
  const y = size * TILE_RATIO * 0.16;
  const flat = size * TILE_RATIO;
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(0, y + flat * 0.06, w * 1.1, flat * 0.3);
  g.fillStyle(shade(biome.palette.tileAlt, 0.2), 1);
  g.fillEllipse(0, y, w, flat * 0.3);
  g.fillStyle(lighten(biome.palette.tileAlt, 0.14), 1);
  g.fillEllipse(0, y - flat * 0.05, w * 0.84, flat * 0.24);
}
