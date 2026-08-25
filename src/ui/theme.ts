import type { BlessingRarity, RelicRarity } from '../core/types';

/**
 * Visual language: dark parchment and gold. Deliberately its own identity -
 * high contrast, large touch targets, readable on a phone in daylight.
 */
export const Theme = {
  color: {
    bg: 0x12100c,
    bgAlt: 0x181510,
    panel: 0x1f1a12,
    panelLight: 0x2b2418,
    panelHi: 0x3a3020,
    border: 0x4a3f28,
    borderBright: 0x6d5c38,
    gold: 0xd9b46a,
    goldBright: 0xf2d99b,
    goldDim: 0x8a7548,
    text: 0xe8e0cc,
    textDim: 0x9a8f76,
    textFaint: 0x6b6252,
    good: 0x7fc48a,
    bad: 0xd4614f,
    warn: 0xe0a24a,
    hp: 0x8fbf72,
    hpLow: 0xd4614f,
    hpMid: 0xe0a24a,
    energy: 0x6fb7d8,
    shield: 0xa8c8e8,
    enemy: 0xb5563f,
    rare: 0x6f9fd8,
    epic: 0xb07ff0,
    legendary: 0xf0b040,
    common: 0x9a9a8a,
  },
  css: {
    gold: '#d9b46a',
    goldBright: '#f2d99b',
    text: '#e8e0cc',
    textDim: '#9a8f76',
    textFaint: '#6b6252',
    good: '#7fc48a',
    bad: '#d4614f',
    warn: '#e0a24a',
    bg: '#12100c',
    panel: '#1f1a12',
  },
  font: {
    display: 'Georgia, "Times New Roman", "Noto Serif", serif',
    body: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  },
  radius: 10,
  /** Minimum comfortable touch target. */
  touch: 46,
} as const;

export const RARITY_COLOR: Record<BlessingRarity, number> = {
  RARE: Theme.color.rare,
  EPIC: Theme.color.epic,
  LEGENDARY: Theme.color.legendary,
};

export const RELIC_RARITY_COLOR: Record<RelicRarity, number> = {
  COMMON: Theme.color.common,
  RARE: Theme.color.rare,
  EPIC: Theme.color.epic,
};

export function hpColor(ratio: number): number {
  if (ratio > 0.6) return Theme.color.hp;
  if (ratio > 0.3) return Theme.color.hpMid;
  return Theme.color.hpLow;
}

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Scales a base font size for the current viewport, clamped for readability. */
export function fontScale(width: number): number {
  return Math.max(0.85, Math.min(1.45, width / 620));
}
