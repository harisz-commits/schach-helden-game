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
