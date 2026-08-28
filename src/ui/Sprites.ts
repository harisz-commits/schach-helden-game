import Phaser from 'phaser';
import { Theme } from './theme';

const CACHE = new Set<string>();

export type UnitShape = 'BULWARK' | 'BLADE' | 'LANCE' | 'BOW' | 'STAFF' | 'CHALICE';

const W = 72;
const H = 92;

/**
 * Procedural placeholder art.
 *
 * Each hero class gets a distinct silhouette so roles are readable at a glance
 * without any art assets. Swapping in real artwork later only means loading a
 * texture with the same key.
 */
export function unitTextureKey(shape: string, color: number, accent: number): string {
  return `unit_${shape}_${color.toString(16)}_${accent.toString(16)}`;
}

export function ensureUnitTexture(scene: Phaser.Scene, shape: string, color: number, accent: number): string {
  const key = unitTextureKey(shape, color, accent);
  if (CACHE.has(key) && scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const dark = darken(color, 0.55);

  // Shadow / base
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(W / 2, H - 6, W * 0.62, 10);

  drawShape(g, shape as UnitShape, color, accent, dark);

  // Helmet
  g.fillStyle(dark, 1);
  g.fillCircle(W / 2, 20, 12);
  g.fillStyle(color, 1);
  g.fillCircle(W / 2, 19, 10);
  g.fillStyle(accent, 1);
  g.fillRect(W / 2 - 10, 16, 20, 3);

  g.generateTexture(key, W, H);
  g.destroy();
  CACHE.add(key);
  return key;
}

function drawShape(
  g: Phaser.GameObjects.Graphics,
  shape: UnitShape,
  color: number,
  accent: number,
  dark: number,
): void {
  const cx = W / 2;
  switch (shape) {
    case 'BULWARK': {
      // Broad body behind a tower shield.
      g.fillStyle(dark, 1);
      g.fillRoundedRect(cx - 20, 28, 40, 50, 6);
      g.fillStyle(color, 1);
      g.fillRoundedRect(cx - 17, 30, 34, 46, 6);
      g.fillStyle(accent, 1);
      g.fillRoundedRect(cx - 13, 34, 26, 34, 5);
      g.fillStyle(dark, 1);
      g.fillRect(cx - 2, 36, 4, 30);
      g.fillRect(cx - 11, 48, 22, 4);
      break;
    }
    case 'BLADE': {
      g.fillStyle(dark, 1);
      g.fillRoundedRect(cx - 14, 30, 28, 48, 6);
      g.fillStyle(color, 1);
      g.fillRoundedRect(cx - 11, 32, 22, 44, 6);
      // Sword raised on the right.
      g.fillStyle(accent, 1);
      g.fillRect(cx + 13, 22, 5, 44);
      g.fillRect(cx + 7, 40, 17, 4);
      g.fillStyle(dark, 1);
      g.fillRect(cx + 13, 60, 5, 8);
      break;
    }
    case 'LANCE': {
      // Rider: wider stance plus a long lance.
      g.fillStyle(dark, 1);
      g.fillRoundedRect(cx - 22, 44, 44, 30, 8);
      g.fillStyle(color, 1);
      g.fillRoundedRect(cx - 19, 46, 38, 26, 8);
      g.fillRoundedRect(cx - 10, 28, 20, 26, 6);
      g.fillStyle(accent, 1);
      g.fillTriangle(cx + 16, 18, cx + 22, 22, cx + 6, 58);
      g.fillRect(cx - 16, 70, 8, 8);
      g.fillRect(cx + 8, 70, 8, 8);
      break;
    }
    case 'BOW': {
      g.fillStyle(dark, 1);
      g.fillRoundedRect(cx - 12, 30, 24, 48, 6);
      g.fillStyle(color, 1);
      g.fillRoundedRect(cx - 9, 32, 18, 44, 6);
      // Bow arc.
      g.lineStyle(4, accent, 1);
      g.beginPath();
      g.arc(cx + 6, 48, 22, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70), false);
      g.strokePath();
      g.lineStyle(1, Theme.color.text, 0.8);
      g.lineBetween(cx + 13, 27, cx + 13, 69);
      break;
    }
    case 'STAFF': {
      // Robed caster: triangular silhouette.
      g.fillStyle(dark, 1);
      g.fillTriangle(cx, 28, cx - 24, 80, cx + 24, 80);
      g.fillStyle(color, 1);
      g.fillTriangle(cx, 32, cx - 20, 77, cx + 20, 77);
      g.fillStyle(accent, 1);
      g.fillRect(cx + 16, 26, 4, 52);
      g.fillCircle(cx + 18, 24, 7);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(cx + 16, 22, 3);
      break;
    }
    case 'CHALICE':
    default: {
      g.fillStyle(dark, 1);
      g.fillTriangle(cx, 30, cx - 22, 80, cx + 22, 80);
      g.fillStyle(color, 1);
      g.fillTriangle(cx, 34, cx - 18, 77, cx + 18, 77);
      // Halo.
      g.lineStyle(3, accent, 1);
      g.strokeCircle(cx, 12, 13);
      g.fillStyle(accent, 1);
      g.fillRoundedRect(cx - 6, 44, 12, 12, 3);
      g.fillRect(cx - 2, 56, 4, 8);
      g.fillRect(cx - 7, 64, 14, 3);
      break;
    }
  }
}

function darken(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

export function lighten(color: number, factor: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** Soft radial particle used for hits and skill flashes. */
export function ensureSparkTexture(scene: Phaser.Scene): string {
  const key = 'spark';
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 8);
  g.generateTexture(key, 16, 16);
  g.destroy();
  return key;
}

/* ------------------------------------------------------------------ */
/* Troop formations                                                    */
/* ------------------------------------------------------------------ */

const TROOP_W = 26;
const TROOP_H = 34;

/**
 * A single rank-and-file soldier.
 *
 * An "army" in CROWNBOUND is a formation, not one hero. Drawing the troops
 * behind the leader - and removing them as the army's health drops - is what
 * makes persistent damage legible: you watch the banner thin out across a
 * floor instead of reading a percentage.
 */
export function ensureTroopTexture(scene: Phaser.Scene, shape: string, color: number, accent: number): string {
  const key = `troop_${shape}_${color.toString(16)}_${accent.toString(16)}`;
  if (CACHE.has(key) && scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const cx = TROOP_W / 2;
  const dark = darken(color, 0.5);
  const mid = darken(color, 0.82);

  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(cx, TROOP_H - 3, TROOP_W * 0.58, 5);

  // Legs and torso.
  g.fillStyle(dark, 1);
  g.fillRect(cx - 5, TROOP_H - 12, 4, 10);
  g.fillRect(cx + 1, TROOP_H - 12, 4, 10);
  g.fillStyle(mid, 1);
  g.fillRoundedRect(cx - 7, 12, 14, 15, 3);

  // Weapon silhouette, so roles stay readable even at this size.
  g.fillStyle(accent, 1);
  switch (shape) {
    case 'BULWARK':
      g.fillRoundedRect(cx - 10, 14, 8, 13, 2);
      break;
    case 'BOW':
      g.fillRect(cx + 7, 10, 2, 18);
      break;
    case 'STAFF':
    case 'CHALICE':
      g.fillRect(cx + 7, 6, 2, 22);
      g.fillCircle(cx + 8, 5, 3);
      break;
    case 'LANCE':
      g.fillRect(cx + 6, 2, 2, 26);
      break;
    case 'BLADE':
    default:
      g.fillRect(cx + 7, 6, 2, 16);
      g.fillRect(cx + 4, 12, 8, 2);
      break;
  }

  // Helmet.
  g.fillStyle(dark, 1);
  g.fillCircle(cx, 9, 6);
  g.fillStyle(color, 1);
  g.fillCircle(cx, 8, 5);

  g.generateTexture(key, TROOP_W, TROOP_H);
  g.destroy();
  CACHE.add(key);
  return key;
}

/**
 * Formation slots behind the leader, in normalised units.
 *
 * Ordered back-to-front so that shrinking the visible count removes the rear
 * ranks first - the formation reads as thinning out, not dissolving randomly.
 */
export const TROOP_SLOTS: { x: number; y: number }[] = [
  { x: -1.1, y: 2.5 },
  { x: 0, y: 2.66 },
  { x: 1.1, y: 2.5 },
  { x: -1.65, y: 1.76 },
  { x: -0.55, y: 1.92 },
  { x: 0.55, y: 1.92 },
  { x: 1.65, y: 1.76 },
  { x: -1.12, y: 1.04 },
  { x: 1.12, y: 1.04 },
];
