import Phaser from 'phaser';
import type { TileType } from '../core/types';
import { Theme } from './theme';

export const TILE_LABEL: Record<TileType, string> = {
  EMPTY: 'Empty ground',
  START: 'Landing site',
  ENEMY: 'Enemy warband',
  ELITE: 'Elite warband',
  GUARDIAN: 'The Guardian',
  TREASURE: 'Treasure chamber',
  GOLD: 'Scattered gold',
  HEALING_FOUNTAIN: 'Healing fountain',
  SACRED_SPRING: 'Sacred spring',
  SHRINE: 'Shrine',
  MERCHANT: 'Merchant',
  RELIC: 'Relic',
  EVENT: 'Something happens here',
  RECRUITMENT_CAMP: 'Recruitment camp',
  RESURRECTION_SHRINE: 'Resurrection shrine',
  ORACLE_TOWER: 'Oracle tower',
  ALTAR: 'Ancient altar',
  WAR_CAMP: 'War camp',
  TEMPLE: 'Temple',
  TRAP: 'Trap',
  EXIT: 'The way onward',
  BLOCKED: 'Impassable',
};

export const TILE_DESCRIPTION: Partial<Record<TileType, string>> = {
  ENEMY: 'A warband blocks the way. Defeat it to press on.',
  ELITE: 'Stronger, and carrying a dangerous trait. Worth more gold.',
  GUARDIAN: 'Defeat the Guardian to open the way out of this floor.',
  TREASURE: 'Gold, and sometimes more.',
  GOLD: 'A small pile of coin.',
  HEALING_FOUNTAIN: 'Restores 35% Max HP to one army.',
  SACRED_SPRING: 'Restores 12% Max HP to every army.',
  SHRINE: 'Offers a blessing.',
  TEMPLE: 'Offers a stronger blessing.',
  MERCHANT: 'Buy healing, relics and blessings.',
  RELIC: 'A relic for your satchel.',
  EVENT: 'An encounter with a choice to make.',
  RECRUITMENT_CAMP: 'Hire a mercenary army for this floor.',
  RESURRECTION_SHRINE: 'Brings one fallen army back at 35% HP.',
  ORACLE_TOWER: 'Reveals distant tiles and the Guardian.',
  ALTAR: 'Pay in blood for a powerful blessing.',
  WAR_CAMP: 'One army gains +25% Attack for this floor.',
  TRAP: 'Something here is going to hurt.',
  EXIT: 'Leave this floor and descend.',
};

/** Tile family colouring, so danger and comfort read instantly. */
export function tileAccent(type: TileType): number {
  switch (type) {
    case 'ENEMY':
      return Theme.color.enemy;
    case 'ELITE':
      return 0xd4614f;
    case 'GUARDIAN':
      return Theme.color.legendary;
    case 'TRAP':
      return 0xa8523f;
    case 'HEALING_FOUNTAIN':
    case 'SACRED_SPRING':
    case 'RESURRECTION_SHRINE':
      return Theme.color.good;
    case 'TREASURE':
    case 'GOLD':
    case 'MERCHANT':
      return Theme.color.gold;
    case 'RELIC':
      return Theme.color.epic;
    case 'SHRINE':
    case 'TEMPLE':
    case 'ALTAR':
      return Theme.color.rare;
    case 'EXIT':
      return Theme.color.goldBright;
    case 'EVENT':
      return Theme.color.warn;
    default:
      return Theme.color.textDim;
  }
}

/**
 * Draws a distinct glyph for every tile type.
 *
 * Vector glyphs rather than a font or emoji: they scale to any tile size,
 * render identically everywhere and cost nothing to load.
 */
export function drawTileGlyph(
  g: Phaser.GameObjects.Graphics,
  type: TileType,
  size: number,
  color: number,
): void {
  const s = size * 0.5;
  const line = Math.max(1.6, size * 0.075);
  g.lineStyle(line, color, 1);
  g.fillStyle(color, 1);

  switch (type) {
    case 'ENEMY':
      g.lineBetween(-s * 0.55, -s * 0.55, s * 0.55, s * 0.55);
      g.lineBetween(s * 0.55, -s * 0.55, -s * 0.55, s * 0.55);
      break;

    case 'ELITE':
      g.lineBetween(-s * 0.6, -s * 0.4, s * 0.6, s * 0.6);
      g.lineBetween(s * 0.6, -s * 0.4, -s * 0.6, s * 0.6);
      star(g, 0, -s * 0.62, s * 0.28, color);
      break;

    case 'GUARDIAN': {
      // Crown.
      g.beginPath();
      g.moveTo(-s * 0.7, s * 0.35);
      g.lineTo(-s * 0.55, -s * 0.5);
      g.lineTo(-s * 0.2, s * 0.02);
      g.lineTo(0, -s * 0.62);
      g.lineTo(s * 0.2, s * 0.02);
      g.lineTo(s * 0.55, -s * 0.5);
      g.lineTo(s * 0.7, s * 0.35);
      g.closePath();
      g.fillPath();
      g.fillRect(-s * 0.7, s * 0.4, s * 1.4, line * 1.4);
      break;
    }

    case 'TREASURE':
      g.fillRoundedRect(-s * 0.62, -s * 0.18, s * 1.24, s * 0.76, 3);
      g.lineStyle(line, color, 1);
      g.beginPath();
      g.arc(0, -s * 0.18, s * 0.62, Math.PI, 0, false);
      g.strokePath();
      g.fillStyle(Theme.color.bg, 1);
      g.fillRect(-s * 0.12, -s * 0.1, s * 0.24, s * 0.34);
      break;

    case 'GOLD':
      g.fillCircle(-s * 0.24, s * 0.16, s * 0.34);
      g.fillCircle(s * 0.26, s * 0.2, s * 0.3);
      g.fillCircle(s * 0.02, -s * 0.3, s * 0.36);
      break;

    case 'HEALING_FOUNTAIN':
      g.fillRect(-s * 0.16, -s * 0.62, s * 0.32, s * 1.24);
      g.fillRect(-s * 0.62, -s * 0.16, s * 1.24, s * 0.32);
      break;

    case 'SACRED_SPRING':
      for (let i = 0; i < 3; i++) {
        const y = -s * 0.4 + i * s * 0.42;
        g.lineStyle(line, color, 1 - i * 0.18);
        g.beginPath();
        g.moveTo(-s * 0.65, y);
        g.lineTo(-s * 0.2, y - s * 0.18);
        g.lineTo(s * 0.2, y + s * 0.18);
        g.lineTo(s * 0.65, y);
        g.strokePath();
      }
      break;

    case 'SHRINE':
    case 'TEMPLE':
      g.fillTriangle(0, -s * 0.72, -s * 0.72, -s * 0.05, s * 0.72, -s * 0.05);
      g.fillRect(-s * 0.5, -s * 0.05, s * 0.18, s * 0.68);
      g.fillRect(s * 0.32, -s * 0.05, s * 0.18, s * 0.68);
      if (type === 'TEMPLE') g.fillRect(-s * 0.14, -s * 0.05, s * 0.28, s * 0.68);
      g.fillRect(-s * 0.72, s * 0.6, s * 1.44, line);
      break;

    case 'MERCHANT':
      // Scales.
      g.lineBetween(0, -s * 0.62, 0, s * 0.5);
      g.lineBetween(-s * 0.62, -s * 0.4, s * 0.62, -s * 0.4);
      g.strokeCircle(-s * 0.62, -s * 0.05, s * 0.3);
      g.strokeCircle(s * 0.62, -s * 0.05, s * 0.3);
      g.fillRect(-s * 0.34, s * 0.5, s * 0.68, line);
      break;

    case 'RELIC':
      g.fillTriangle(0, -s * 0.7, -s * 0.55, 0, s * 0.55, 0);
      g.fillTriangle(0, s * 0.7, -s * 0.55, 0, s * 0.55, 0);
      break;

    case 'EVENT':
      g.lineStyle(line * 1.15, color, 1);
      g.beginPath();
      g.arc(0, -s * 0.22, s * 0.34, Math.PI * 0.9, Math.PI * 0.35, false);
      g.strokePath();
      g.lineBetween(s * 0.02, -s * 0.02, s * 0.02, s * 0.24);
      g.fillCircle(s * 0.02, s * 0.55, line * 0.85);
      break;

    case 'RECRUITMENT_CAMP':
      g.fillRect(-s * 0.5, -s * 0.7, line, s * 1.4);
      g.fillTriangle(-s * 0.5 + line, -s * 0.66, s * 0.6, -s * 0.34, -s * 0.5 + line, -s * 0.02);
      break;

    case 'RESURRECTION_SHRINE':
      g.lineStyle(line, color, 1);
      g.strokeCircle(0, -s * 0.34, s * 0.32);
      g.lineBetween(0, -s * 0.02, 0, s * 0.66);
      g.lineBetween(-s * 0.42, s * 0.22, s * 0.42, s * 0.22);
      break;

    case 'ORACLE_TOWER':
      g.lineStyle(line, color, 1);
      g.beginPath();
      g.moveTo(-s * 0.72, 0);
      g.lineTo(0, -s * 0.5);
      g.lineTo(s * 0.72, 0);
      g.lineTo(0, s * 0.5);
      g.closePath();
      g.strokePath();
      g.fillCircle(0, 0, s * 0.22);
      break;

    case 'ALTAR':
      g.fillRect(-s * 0.6, s * 0.34, s * 1.2, s * 0.28);
      g.fillRect(-s * 0.28, -s * 0.1, s * 0.56, s * 0.46);
      g.lineStyle(line, color, 1);
      g.beginPath();
      g.arc(0, -s * 0.2, s * 0.5, 0, Math.PI, false);
      g.strokePath();
      break;

    case 'WAR_CAMP':
      g.fillTriangle(0, -s * 0.66, -s * 0.7, s * 0.5, s * 0.7, s * 0.5);
      g.fillStyle(Theme.color.bg, 1);
      g.fillTriangle(0, -s * 0.1, -s * 0.22, s * 0.5, s * 0.22, s * 0.5);
      break;

    case 'TRAP':
      g.fillRect(-s * 0.7, s * 0.42, s * 1.4, line);
      for (let i = 0; i < 4; i++) {
        const x = -s * 0.6 + i * s * 0.4;
        g.fillTriangle(x, s * 0.42, x + s * 0.18, -s * 0.42, x + s * 0.36, s * 0.42);
      }
      break;

    case 'EXIT':
      g.lineStyle(line, color, 1);
      g.beginPath();
      g.moveTo(-s * 0.5, s * 0.66);
      g.lineTo(-s * 0.5, -s * 0.16);
      g.arc(0, -s * 0.16, s * 0.5, Math.PI, 0, false);
      g.lineTo(s * 0.5, s * 0.66);
      g.strokePath();
      g.fillTriangle(0, -s * 0.1, -s * 0.24, s * 0.22, s * 0.24, s * 0.22);
      g.fillRect(-s * 0.09, s * 0.14, s * 0.18, s * 0.4);
      break;

    case 'START':
      g.lineStyle(line, color, 1);
      g.strokeCircle(0, 0, s * 0.42);
      g.fillCircle(0, 0, s * 0.16);
      break;

    case 'EMPTY':
    default:
      g.fillStyle(color, 0.5);
      g.fillCircle(0, 0, Math.max(1.5, size * 0.05));
      break;
  }
}

function star(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, color: number): void {
  g.fillStyle(color, 1);
  const points: number[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  }
  g.fillPoints(
    points.reduce<Phaser.Geom.Point[]>((acc, _value, index, array) => {
      if (index % 2 === 0) acc.push(new Phaser.Geom.Point(array[index]!, array[index + 1]!));
      return acc;
    }, []),
    true,
  );
}
