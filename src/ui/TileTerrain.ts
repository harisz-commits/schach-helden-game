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
 * Draws one tile as a raised block of ground.
 *
 * The side face is what sells the depth: without it the grid reads as flat
 * paper, which is exactly what made the board feel like a wireframe.
 */
export function drawTileSurface(g: Phaser.GameObjects.Graphics, tile: TileData, options: TileSurfaceOptions): void {
  const { size, biome, known, cleared, active } = options;
  const half = size / 2;
  const radius = Math.max(3, size * 0.13);
  const depth = Math.max(3, size * 0.11);

  const base = known ? (cleared ? shade(biome.palette.tile, 0.28) : biome.palette.tile) : biome.palette.fog;
  const top = active ? lighten(base, 0.26) : known ? lighten(base, 0.12) : base;

  // Side face, drawn first and slightly inset so the top overhangs it.
  g.fillStyle(shade(base, 0.55), 1);
  g.fillRoundedRect(-half, -half + depth * 0.6, size, size, radius);

  // Lit top face.
  g.fillStyle(top, 1);
  g.fillRoundedRect(-half, -half, size, size - depth * 0.4, radius);

  // A brighter rim along the top edge reads as sunlight catching the surface.
  g.fillStyle(lighten(top, 0.22), known ? 0.5 : 0.16);
  g.fillRoundedRect(-half + radius * 0.4, -half + 1, size - radius * 0.8, Math.max(1, size * 0.07), radius * 0.4);

  if (known && !cleared) drawScatter(g, tile, size, biome);
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
    const x = (((h >>> 3) % 1000) / 1000 - 0.5) * size * 0.72;
    const y = (((h >>> 13) % 1000) / 1000 - 0.5) * size * 0.6;
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

  g.fillStyle(shade(biome.palette.fog, 0.45), 0.95);
  g.fillRoundedRect(-size / 2, -size / 2, size, size, Math.max(3, size * 0.13));

  // Deliberately low contrast: unexplored ground should recede so the tiles
  // you can actually act on are the first thing the eye lands on.
  // Many large, very faint puffs blend into haze; a few strong ones read as
  // grubby blotches, which is what the first attempt looked like.
  const puffs = 8;
  for (let i = 0; i < puffs; i++) {
    const h = hashString(`puff:${i}`, seed);
    const x = (((h >>> 5) % 1000) / 1000 - 0.5) * size * 0.8;
    const y = (((h >>> 15) % 1000) / 1000 - 0.5) * size * 0.66;
    const r = size * (0.24 + (((h >>> 25) % 100) / 100) * 0.16);
    g.fillStyle(pale, 0.045);
    g.fillCircle(x, y, r);
  }
}

/**
 * A small stone pedestal under structures, so buildings look like they stand
 * on the ground rather than floating as icons.
 */
export function drawPedestal(g: Phaser.GameObjects.Graphics, size: number, biome: BiomeDefinition): void {
  const w = size * 0.56;
  const y = size * 0.24;
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(0, y + size * 0.03, w * 1.05, size * 0.13);
  g.fillStyle(shade(biome.palette.tileAlt, 0.15), 1);
  g.fillEllipse(0, y, w, size * 0.15);
  g.fillStyle(lighten(biome.palette.tileAlt, 0.12), 1);
  g.fillEllipse(0, y - size * 0.02, w * 0.86, size * 0.11);
}
