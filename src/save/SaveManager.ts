import type { PlayerProfile, RunState } from '../core/types';
import { GameConfig } from '../core/GameConfig';
import { platform } from '../platform';
import { migrate } from './SaveMigration';
import { createDefaultProfile, type SaveEnvelope } from './SaveTypes';

/**
 * Owns the two persisted states and the autosave policy.
 *
 * Everything that changes run state calls `requestSave()`; writes are
 * debounced so a burst of changes (tile reveal -> combat -> reward) becomes a
 * single write, and `flush()` forces one out on pause or page hide.
 */
export class SaveManager {
  profile: PlayerProfile = createDefaultProfile();
  run: RunState | null = null;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;
  private dirty = false;

  async load(): Promise<void> {
    const raw = await platform().loadData();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const envelope = migrate(parsed);
      if (!envelope) return;
      this.profile = envelope.profile;
      this.run = envelope.run;
    } catch (error) {
      console.warn('[SaveManager] could not read save, starting fresh', error);
    }
  }

  /** Debounced autosave - call after any meaningful state change. */
  requestSave(): void {
    this.dirty = true;
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, GameConfig.save.autosaveDebounceMs);
  }

  /** Writes immediately. Used on pause, run end and before navigation. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.writing) {
      this.dirty = true;
      return;
    }
    this.writing = true;
    this.dirty = false;
    const envelope: SaveEnvelope = {
      schemaVersion: GameConfig.saveSchemaVersion,
      profile: this.profile,
      run: this.run,
      savedAt: Date.now(),
    };
    try {
      await platform().saveData(JSON.stringify(envelope));
    } catch (error) {
      console.warn('[SaveManager] save failed', error);
    } finally {
      this.writing = false;
      if (this.dirty) this.requestSave();
    }
  }

  hasRun(): boolean {
    return this.run !== null && !this.run.finished;
  }

  clearRun(): void {
    this.run = null;
    this.requestSave();
  }

  resetProfile(): void {
    this.profile = createDefaultProfile();
    this.run = null;
    this.requestSave();
  }

  /** Round-trips the current state - used by the save tests. */
  serialize(): string {
    return JSON.stringify({
      schemaVersion: GameConfig.saveSchemaVersion,
      profile: this.profile,
      run: this.run,
      savedAt: 0,
    } satisfies SaveEnvelope);
  }

  restore(json: string): boolean {
    const envelope = migrate(JSON.parse(json) as unknown);
    if (!envelope) return false;
    this.profile = envelope.profile;
    this.run = envelope.run;
    return true;
  }
}

export const saveManager = new SaveManager();
