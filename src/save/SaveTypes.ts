import type { PlayerProfile, RunState } from '../core/types';
import { GameConfig } from '../core/GameConfig';
import { STARTER_HERO_IDS } from '../data/heroes';

export interface SaveEnvelope {
  schemaVersion: number;
  profile: PlayerProfile;
  run: RunState | null;
  savedAt: number;
}

export function createDefaultProfile(): PlayerProfile {
  return {
    schemaVersion: GameConfig.saveSchemaVersion,
    unlockedHeroes: [...STARTER_HERO_IDS],
    heroMastery: Object.fromEntries(STARTER_HERO_IDS.map((id) => [id, { tier: 1, progress: {} }])),
    highestFloor: 0,
    highestAscension: 0,
    highestEndlessFloor: 0,
    achievements: [],
    crownShards: 0,
    kingdomMastery: [],
    totalStats: {
      runsStarted: 0,
      runsWon: 0,
      enemiesDefeated: 0,
      elitesDefeated: 0,
      guardiansDefeated: 0,
      treasuresOpened: 0,
      relicsUsed: 0,
      legendaryBlessings: 0,
      blessingsCollected: 0,
      goldCollected: 0,
      totalPlayTimeMs: 0,
      bestRunTimeMs: 0,
      deepestFloorPerHero: {},
    },
    settings: {
      musicVolume: 0.5,
      sfxVolume: 0.7,
      battleSpeed: 1,
      autoFormation: true,
      reduceMotion: false,
      showDamageNumbers: true,
    },
    firstVictory: false,
    clearedAscensions: [],
    daily: null,
    unlockedFeatures: [],
    seenIntro: false,
  };
}
