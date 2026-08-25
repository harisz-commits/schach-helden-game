import type {
  AchievementDefinition,
  HeroDefinition,
  PlayerProfile,
  RunState,
  UnlockCondition,
} from '../core/types';
import { GameConfig } from '../core/GameConfig';
import { gameEvents } from '../core/EventBus';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, KINGDOM_MASTERY_BY_ID } from '../data/achievements';
import { HEROES, getHero } from '../data/heroes';

export interface UnlockProgress {
  hero: HeroDefinition;
  unlocked: boolean;
  current: number;
  required: number;
  label: string;
}

export interface ProgressionOutcome {
  heroesUnlocked: string[];
  achievementsUnlocked: string[];
  masteryUnlocked: { heroId: string; tier: number; reward: string }[];
  crownShards: number;
  newRecord: boolean;
}

/**
 * Everything permanent: hero unlocks, mastery tiers, achievements and
 * Crown Shards. All conditions are data-driven so a new hero or achievement
 * is a data change only.
 */
export class ProgressionManager {
  constructor(private profile: PlayerProfile) {}

  /* ------------------------------ heroes ------------------------- */

  isHeroUnlocked(heroId: string): boolean {
    return this.profile.unlockedHeroes.includes(heroId);
  }

  /** Current progress towards each locked hero, for the collection screen. */
  heroProgress(): UnlockProgress[] {
    return HEROES.map((hero) => {
      const unlocked = this.isHeroUnlocked(hero.id);
      const { current, required } = this.conditionProgress(hero.unlockCondition);
      return { hero, unlocked, current, required, label: hero.unlockCondition.label };
    });
  }

  private conditionProgress(condition: UnlockCondition): { current: number; required: number } {
    const stats = this.profile.totalStats;
    const required = condition.value ?? 1;
    switch (condition.type) {
      case 'STARTER':
        return { current: 1, required: 1 };
      case 'REACH_FLOOR':
        return { current: this.profile.highestFloor, required };
      case 'DEFEAT_FLOOR':
        return { current: this.profile.firstVictory ? required : this.profile.highestFloor, required };
      case 'COMPLETE_ASCENSION':
        return { current: this.profile.highestAscension, required };
      case 'TOTAL_ENEMIES_DEFEATED':
        return { current: stats.enemiesDefeated, required };
      case 'TOTAL_TREASURES_OPENED':
        return { current: stats.treasuresOpened, required };
      case 'TOTAL_LEGENDARY_BLESSINGS':
        return { current: stats.legendaryBlessings, required };
      case 'REACH_ENDLESS_FLOOR':
        return { current: this.profile.highestEndlessFloor, required };
      case 'CLEAR_WITHOUT_HEALING_FOUNTAIN':
        return { current: this.profile.achievements.includes('no_fountain') ? 1 : 0, required: 1 };
      case 'ACHIEVEMENT':
        return { current: this.profile.achievements.includes(condition.achievementId ?? '') ? 1 : 0, required: 1 };
      default:
        return { current: 0, required };
    }
  }

  private evaluateHeroUnlocks(): string[] {
    const unlocked: string[] = [];
    for (const hero of HEROES) {
      if (this.isHeroUnlocked(hero.id)) continue;
      const { current, required } = this.conditionProgress(hero.unlockCondition);
      if (current >= required) {
        this.profile.unlockedHeroes.push(hero.id);
        if (!this.profile.heroMastery[hero.id]) {
          this.profile.heroMastery[hero.id] = { tier: 1, progress: {} };
        }
        unlocked.push(hero.id);
        gameEvents.emit('hero:unlocked', { heroId: hero.id });
      }
    }
    return unlocked;
  }

  /* --------------------------- achievements ---------------------- */

  private evaluateAchievements(run: RunState | null): { ids: string[]; shards: number } {
    const ids: string[] = [];
    let shards = 0;
    for (const achievement of ACHIEVEMENTS) {
      if (this.profile.achievements.includes(achievement.id)) continue;
      if (!this.achievementMet(achievement, run)) continue;
      this.profile.achievements.push(achievement.id);
      shards += achievement.crownShards;
      ids.push(achievement.id);
      gameEvents.emit('achievement:unlocked', { achievementId: achievement.id });
    }
    return { ids, shards };
  }

  private achievementMet(achievement: AchievementDefinition, run: RunState | null): boolean {
    const stats = this.profile.totalStats;
    const condition = achievement.condition;
    const value = condition.value ?? 1;
    switch (condition.type) {
      case 'REACH_FLOOR':
        return this.profile.highestFloor >= value;
      case 'DEFEAT_FLOOR':
        return this.profile.firstVictory;
      case 'WIN_WITHOUT_HEALING_FOUNTAIN':
        return run?.finished === 'WON' && run.runStats.healingFountainsUsed === 0;
      case 'WIN_WITH_ALL_ARMIES':
        return run?.finished === 'WON' && run.armies.filter((a) => !a.temporary).every((a) => a.alive);
      case 'BLESSINGS_IN_RUN':
        return (run?.runStats.blessingsCollected ?? 0) >= value;
      case 'LEGENDARY_BLESSINGS_IN_RUN':
        return (run?.blessings.filter((b) => b.id.startsWith('l')).length ?? 0) >= value;
      case 'TOTAL_ENEMIES_DEFEATED':
        return stats.enemiesDefeated >= value;
      case 'TOTAL_TREASURES_OPENED':
        return stats.treasuresOpened >= value;
      case 'TOTAL_RELICS_USED':
        return stats.relicsUsed >= value;
      case 'COMPLETE_ASCENSION':
        return this.profile.highestAscension >= value;
      case 'REACH_ENDLESS_FLOOR':
        return this.profile.highestEndlessFloor >= value;
      default:
        return false;
    }
  }

  /* ----------------------------- mastery ------------------------- */

  private evaluateMastery(run: RunState | null): { heroId: string; tier: number; reward: string }[] {
    const unlocked: { heroId: string; tier: number; reward: string }[] = [];
    if (!run) return unlocked;

    for (const [heroId, tracking] of Object.entries(run.heroStats)) {
      const hero = getHero(heroId);
      const progress = this.profile.heroMastery[heroId] ?? { tier: 1, progress: {} };
      // Lifetime totals accumulate across runs.
      progress.progress.damageDealt = (progress.progress.damageDealt ?? 0) + tracking.damageDealt;
      progress.progress.damageAbsorbed = (progress.progress.damageAbsorbed ?? 0) + tracking.damageAbsorbed;
      progress.progress.healingDone = (progress.progress.healingDone ?? 0) + tracking.healingDone;
      progress.progress.enemiesDefeated = (progress.progress.enemiesDefeated ?? 0) + tracking.kills;
      progress.progress.skillsCast = (progress.progress.skillsCast ?? 0) + tracking.skillsCast;
      progress.progress.battlesWon = (progress.progress.battlesWon ?? 0) + tracking.battlesWon;
      progress.progress.deepestFloor = Math.max(progress.progress.deepestFloor ?? 0, run.floor);
      if (run.finished === 'WON') {
        progress.progress.ascensionCleared = Math.max(progress.progress.ascensionCleared ?? 0, run.ascensionLevel);
      }

      let tier = progress.tier;
      for (const masteryTier of hero.mastery) {
        if (masteryTier.tier <= tier) continue;
        if (!this.masteryMet(masteryTier.challenge, progress.progress)) break;
        tier = masteryTier.tier;
        unlocked.push({ heroId, tier: masteryTier.tier, reward: masteryTier.reward });
        gameEvents.emit('mastery:unlocked', { heroId, tier: masteryTier.tier });
      }
      progress.tier = tier;
      this.profile.heroMastery[heroId] = progress;
    }
    return unlocked;
  }

  private masteryMet(
    challenge: { type: string; value: number },
    progress: Record<string, number>,
  ): boolean {
    switch (challenge.type) {
      case 'UNLOCKED':
        return true;
      case 'DAMAGE_DEALT':
        return (progress.damageDealt ?? 0) >= challenge.value;
      case 'DAMAGE_ABSORBED':
        return (progress.damageAbsorbed ?? 0) >= challenge.value;
      case 'HEALING_DONE':
        return (progress.healingDone ?? 0) >= challenge.value;
      case 'BATTLES_WON':
        return (progress.battlesWon ?? 0) >= challenge.value;
      case 'ENEMIES_DEFEATED':
        return (progress.enemiesDefeated ?? 0) >= challenge.value;
      case 'SKILLS_CAST':
        return (progress.skillsCast ?? 0) >= challenge.value;
      case 'REACH_FLOOR_WITH':
        return (progress.deepestFloor ?? 0) >= challenge.value;
      case 'COMPLETE_ASCENSION_WITH':
        return (progress.ascensionCleared ?? 0) >= challenge.value;
      default:
        return false;
    }
  }

  /** Progress towards a hero's next mastery tier, for the collection screen. */
  masteryProgress(heroId: string): { tier: number; next: { label: string; reward: string; current: number; required: number } | null } {
    const hero = getHero(heroId);
    const progress = this.profile.heroMastery[heroId] ?? { tier: 0, progress: {} };
    const next = hero.mastery.find((tier) => tier.tier > progress.tier);
    if (!next) return { tier: progress.tier, next: null };
    const map: Record<string, string> = {
      DAMAGE_DEALT: 'damageDealt',
      DAMAGE_ABSORBED: 'damageAbsorbed',
      HEALING_DONE: 'healingDone',
      BATTLES_WON: 'battlesWon',
      ENEMIES_DEFEATED: 'enemiesDefeated',
      SKILLS_CAST: 'skillsCast',
      REACH_FLOOR_WITH: 'deepestFloor',
      COMPLETE_ASCENSION_WITH: 'ascensionCleared',
      UNLOCKED: 'unlocked',
    };
    const key = map[next.challenge.type] ?? '';
    return {
      tier: progress.tier,
      next: {
        label: next.label,
        reward: next.reward,
        current: Math.floor(progress.progress[key] ?? 0),
        required: next.challenge.value,
      },
    };
  }

  /* ------------------------- run integration --------------------- */

  /** Records a floor being reached mid-run so unlocks fire immediately. */
  recordFloorReached(run: RunState): ProgressionOutcome {
    let newRecord = false;
    if (run.mode === 'ENDLESS') {
      if (run.floor > this.profile.highestEndlessFloor) {
        this.profile.highestEndlessFloor = run.floor;
        newRecord = true;
      }
    }
    if (run.floor > this.profile.highestFloor) {
      this.profile.highestFloor = run.floor;
      newRecord = true;
    }
    for (const army of run.armies) {
      const best = this.profile.totalStats.deepestFloorPerHero[army.heroId] ?? 0;
      if (run.floor > best) this.profile.totalStats.deepestFloorPerHero[army.heroId] = run.floor;
    }
    return this.evaluateAll(run, newRecord);
  }

  /** Finalises a run: records the result, awards shards, fires every unlock. */
  completeRun(run: RunState, won: boolean): ProgressionOutcome {
    this.profile.totalStats.totalPlayTimeMs += run.elapsedMs;
    this.profile.totalStats.goldCollected += run.runStats.goldCollected;

    let newRecord = run.floor > this.profile.highestFloor;
    if (newRecord) this.profile.highestFloor = run.floor;

    if (won) {
      this.profile.totalStats.runsWon += 1;
      if (this.profile.totalStats.bestRunTimeMs === 0 || run.elapsedMs < this.profile.totalStats.bestRunTimeMs) {
        this.profile.totalStats.bestRunTimeMs = run.elapsedMs;
      }
      const firstEver = !this.profile.firstVictory;
      this.profile.firstVictory = true;
      if (firstEver) {
        this.unlockFeature('ASCENSION');
        this.unlockFeature('LIEUTENANTS');
        this.unlockFeature('EXTENDED_EVENTS');
        this.unlockFeature('DAILY');
      }
      if (run.ascensionLevel > 0 && !this.profile.clearedAscensions.includes(run.ascensionLevel)) {
        this.profile.clearedAscensions.push(run.ascensionLevel);
        this.profile.highestAscension = Math.max(this.profile.highestAscension, run.ascensionLevel);
        if (run.ascensionLevel >= GameConfig.endless.unlockAscension) this.unlockFeature('ENDLESS');
        newRecord = true;
      }
      if (run.mode === 'NORMAL' && run.ascensionLevel === 0) this.unlockFeature('DAILY');
    }

    return this.evaluateAll(run, newRecord);
  }

  private evaluateAll(run: RunState | null, newRecord: boolean): ProgressionOutcome {
    const achievements = this.evaluateAchievements(run);
    const heroes = this.evaluateHeroUnlocks();
    const mastery = this.evaluateMastery(run);

    let shards = achievements.shards;
    if (newRecord) shards += GameConfig.meta.crownShardsPerNewFloor;
    if (run?.mode === 'ENDLESS' && run.floor % GameConfig.meta.endlessMilestoneStep === 0) {
      shards += GameConfig.meta.crownShardsPerEndlessMilestone;
    }
    if (run?.finished === 'WON' && run.ascensionLevel > 0) {
      shards += GameConfig.meta.crownShardsPerAscensionClear;
    }
    this.profile.crownShards += shards;

    gameEvents.emit('profile:updated', {});
    return {
      heroesUnlocked: heroes,
      achievementsUnlocked: achievements.ids,
      masteryUnlocked: mastery,
      crownShards: shards,
      newRecord,
    };
  }

  unlockFeature(feature: string): void {
    if (!this.profile.unlockedFeatures.includes(feature)) this.profile.unlockedFeatures.push(feature);
  }

  hasFeature(feature: string): boolean {
    return this.profile.unlockedFeatures.includes(feature);
  }

  /* ------------------------- kingdom mastery --------------------- */

  canBuyMastery(id: string): boolean {
    const def = KINGDOM_MASTERY_BY_ID[id];
    if (!def) return false;
    if (this.profile.kingdomMastery.includes(id)) return false;
    return this.profile.crownShards >= def.cost;
  }

  buyMastery(id: string): boolean {
    if (!this.canBuyMastery(id)) return false;
    const def = KINGDOM_MASTERY_BY_ID[id]!;
    this.profile.crownShards -= def.cost;
    this.profile.kingdomMastery.push(id);
    gameEvents.emit('profile:updated', {});
    return true;
  }

  achievementList(): { def: AchievementDefinition; unlocked: boolean }[] {
    return ACHIEVEMENTS.map((def) => ({ def, unlocked: this.profile.achievements.includes(def.id) }));
  }

  /** Highest ascension the player is allowed to start. */
  maxSelectableAscension(): number {
    if (!this.profile.firstVictory) return 0;
    return Math.min(GameConfig.ascension.maxLevel, this.profile.highestAscension + 1);
  }

  achievementById(id: string): AchievementDefinition | undefined {
    return ACHIEVEMENTS_BY_ID[id];
  }
}
