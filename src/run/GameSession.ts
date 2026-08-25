import type { GameMode, PlayerProfile } from '../core/types';
import { gameEvents } from '../core/EventBus';
import { saveManager } from '../save/SaveManager';
import { ProgressionManager, type ProgressionOutcome } from '../progression/ProgressionManager';
import { RunManager, type StartRunOptions } from './RunManager';
import { platform } from '../platform';
import { GameConfig } from '../core/GameConfig';
import { createDailySeed } from '../core/RNG';

/**
 * The single object scenes talk to. Owns the active run, the profile and the
 * autosave wiring, so no scene ever touches the save file directly.
 */
class GameSession {
  runManager: RunManager | null = null;
  progression: ProgressionManager;
  /** Unlocks produced by the most recent run, shown on the end screen. */
  lastOutcome: ProgressionOutcome | null = null;

  constructor() {
    this.progression = new ProgressionManager(saveManager.profile);
  }

  get profile(): PlayerProfile {
    return saveManager.profile;
  }

  /** Re-points the managers after a save load or profile reset. */
  refreshProfile(): void {
    this.progression = new ProgressionManager(saveManager.profile);
  }

  hasSavedRun(): boolean {
    return saveManager.hasRun();
  }

  startRun(options: StartRunOptions): RunManager {
    this.refreshProfile();
    const run = RunManager.createRun(options, this.profile);
    saveManager.run = run;
    this.profile.totalStats.runsStarted += 1;
    this.runManager = new RunManager(run, this.profile, () => saveManager.requestSave());
    this.progression.recordFloorReached(run);
    saveManager.requestSave();
    gameEvents.emit('run:started', { seed: run.seed });
    return this.runManager;
  }

  /** Starts today's Daily Kingdom run with the shared deterministic seed. */
  startDailyRun(heroIds: string[]): RunManager {
    const daily = createDailySeed();
    this.profile.daily = {
      date: daily.date,
      seed: daily.seed,
      bestScore: this.profile.daily?.date === daily.date ? this.profile.daily.bestScore : 0,
      completed: false,
    };
    return this.startRun({ heroIds, mode: 'DAILY', ascensionLevel: 0, seed: daily.seed });
  }

  resumeRun(): RunManager | null {
    if (!saveManager.run || saveManager.run.finished) return null;
    this.refreshProfile();
    this.runManager = new RunManager(saveManager.run, this.profile, () => saveManager.requestSave());
    return this.runManager;
  }

  /** Records a newly reached floor and fires any unlocks it triggers. */
  onFloorReached(): ProgressionOutcome | null {
    if (!this.runManager) return null;
    const outcome = this.progression.recordFloorReached(this.runManager.run);
    this.reportScore();
    saveManager.requestSave();
    return outcome;
  }

  endRun(won: boolean): ProgressionOutcome {
    const manager = this.runManager;
    if (!manager) {
      this.lastOutcome = {
        heroesUnlocked: [],
        achievementsUnlocked: [],
        masteryUnlocked: [],
        crownShards: 0,
        newRecord: false,
      };
      return this.lastOutcome;
    }
    manager.finishRun(won);
    const outcome = this.progression.completeRun(manager.run, won);
    this.lastOutcome = outcome;

    if (manager.run.mode === 'DAILY' && this.profile.daily) {
      const score = this.dailyScore();
      if (score > this.profile.daily.bestScore) this.profile.daily.bestScore = score;
      this.profile.daily.completed = true;
    }

    this.reportScore();
    // The finished run stays in memory for the end screen but is dropped from
    // the save so "Continue" never resumes a dead expedition.
    saveManager.run = null;
    void saveManager.flush();
    return outcome;
  }

  /** Composite Daily score: depth first, then efficiency. */
  dailyScore(): number {
    const run = this.runManager?.run;
    if (!run) return 0;
    const hpRemaining = run.armies.reduce((sum, a) => sum + a.hpRatio, 0) / Math.max(1, run.armies.length);
    const minutes = Math.max(1, run.elapsedMs / 60000);
    return Math.round(
      run.floor * 1000 +
        run.runStats.enemiesDefeated * 5 +
        hpRemaining * 500 +
        Math.max(0, 60 - minutes) * 10,
    );
  }

  private reportScore(): void {
    const run = this.runManager?.run;
    if (!run) return;
    const score = run.mode === 'ENDLESS' ? this.profile.highestEndlessFloor : this.profile.highestFloor;
    platform().sendScore(score);
  }

  abandonRun(): void {
    this.runManager = null;
    saveManager.clearRun();
  }

  /** Modes unlocked so far, used to build the main menu. */
  availableModes(): GameMode[] {
    const modes: GameMode[] = ['NORMAL'];
    if (this.progression.hasFeature('ENDLESS')) modes.push('ENDLESS');
    if (this.progression.hasFeature('DAILY')) modes.push('DAILY');
    return modes;
  }

  maxSpeed(): number {
    const speeds = GameConfig.combat.speeds;
    if (this.profile.firstVictory) return speeds[speeds.length - 1]!;
    return GameConfig.combat.unlockedSpeedsBeforeVictory;
  }

  save(): void {
    saveManager.requestSave();
  }
}

export const session = new GameSession();
