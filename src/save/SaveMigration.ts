import type { SaveEnvelope } from './SaveTypes';
import { createDefaultProfile } from './SaveTypes';
import { GameConfig } from '../core/GameConfig';

type Migration = (envelope: SaveEnvelope) => SaveEnvelope;

/**
 * Schema migrations, applied in order from the stored version up to the
 * current one. Version 1 is the launch schema, so there is nothing to migrate
 * yet - the machinery exists so future changes never orphan a save.
 */
const MIGRATIONS: Record<number, Migration> = {
  // 1: (envelope) => ...  // example: bumping to schema 2
};

export function migrate(raw: unknown): SaveEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  let envelope = raw as SaveEnvelope;
  if (typeof envelope.schemaVersion !== 'number') return null;

  let version = envelope.schemaVersion;
  let guard = 0;
  while (version < GameConfig.saveSchemaVersion && guard < 32) {
    const migration = MIGRATIONS[version];
    if (!migration) break;
    envelope = migration(envelope);
    version += 1;
    envelope.schemaVersion = version;
    guard += 1;
  }

  if (version > GameConfig.saveSchemaVersion) {
    // A newer build wrote this save. Keep the profile, drop the run, since the
    // run format is the part most likely to have changed incompatibly.
    return { ...envelope, run: null, schemaVersion: GameConfig.saveSchemaVersion };
  }

  return repair(envelope);
}

/** Fills in anything a partially written or hand-edited save is missing. */
function repair(envelope: SaveEnvelope): SaveEnvelope {
  const defaults = createDefaultProfile();
  const profile = { ...defaults, ...(envelope.profile ?? {}) };
  profile.settings = { ...defaults.settings, ...(envelope.profile?.settings ?? {}) };
  profile.totalStats = { ...defaults.totalStats, ...(envelope.profile?.totalStats ?? {}) };
  if (!Array.isArray(profile.unlockedHeroes) || profile.unlockedHeroes.length === 0) {
    profile.unlockedHeroes = [...defaults.unlockedHeroes];
  }
  if (!profile.heroMastery || typeof profile.heroMastery !== 'object') {
    profile.heroMastery = { ...defaults.heroMastery };
  }
  return { ...envelope, profile, schemaVersion: GameConfig.saveSchemaVersion };
}
