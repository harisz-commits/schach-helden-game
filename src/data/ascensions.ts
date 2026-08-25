import type { AscensionDefinition } from '../core/types';
import { GameConfig } from '../core/GameConfig';

const DESCRIPTIONS: { name: string; description: string }[] = [
  { name: 'Ascension I', description: 'Enemies are 12% stronger.' },
  { name: 'Ascension II', description: 'Enemies are 24% stronger. More elites roam each floor.' },
  { name: 'Ascension III', description: 'Enemies are 36% stronger. Darker events appear. Unlocks Endless Kingdom.' },
  { name: 'Ascension IV', description: 'Enemies are 48% stronger. Guardians carry an elite modifier.' },
  { name: 'Ascension V', description: 'Enemies are 60% stronger. Elite warbands are everywhere.' },
  { name: 'Ascension VI', description: 'Enemies are 72% stronger. Healing nodes become rare.' },
  { name: 'Ascension VII', description: 'Enemies are 84% stronger. Elites carry two modifiers.' },
  { name: 'Ascension VIII', description: 'Enemies are 96% stronger. Guardians gain an extra ability.' },
  { name: 'Ascension IX', description: 'Enemies are 108% stronger. Legendary enemy variants appear.' },
  { name: 'Ascension X', description: 'Enemies are 120% stronger. The Crownless King reveals a fourth phase.' },
];

export const ASCENSIONS: AscensionDefinition[] = DESCRIPTIONS.map((entry, index) => {
  const level = index + 1;
  return {
    level,
    name: entry.name,
    description: entry.description,
    enemyPowerBonus: GameConfig.ascension.powerPerLevel * level,
    extraElites: level >= 5 ? 2 : level >= 2 ? 1 : 0,
    eliteModifierCount: level >= 7 ? 2 : 1,
    guardianModifiers: level >= 4 ? 1 : 0,
    healingNodeMultiplier: level >= 6 ? 0.55 : 1,
    bossExtraPhase: level >= 10,
    legendaryEnemies: level >= 9,
    extraEvents: level >= 3,
  };
});

const NEUTRAL: AscensionDefinition = {
  level: 0,
  name: 'Normal',
  description: 'The standard expedition.',
  enemyPowerBonus: 0,
  extraElites: 0,
  eliteModifierCount: 1,
  guardianModifiers: 0,
  healingNodeMultiplier: 1,
  bossExtraPhase: false,
  legendaryEnemies: false,
  extraEvents: false,
};

export function ascension(level: number): AscensionDefinition {
  if (level <= 0) return NEUTRAL;
  return ASCENSIONS[Math.min(level, ASCENSIONS.length) - 1]!;
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
