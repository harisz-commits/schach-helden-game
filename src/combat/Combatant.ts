import type {
  CombatStats,
  CombatantKind,
  EffectCondition,
  EffectDefinition,
  HeroClass,
  Row,
  Side,
  SkillDefinition,
  StatKey,
} from '../core/types';
import { RATIO_STATS, STAT_KEYS } from '../core/types';
import { GameConfig } from '../core/GameConfig';

export interface TimedModifier {
  id: string;
  stat: StatKey;
  mode: 'PERCENT' | 'FLAT';
  value: number;
  /** Combat time at which the modifier drops off. Undefined = whole battle. */
  expiresAt?: number;
  conditions?: EffectCondition[];
  sourceKey: string;
  stacks: number;
  maxStacks?: number;
  /** Debuffs are shortened by Iron Mind and removed by cleanses. */
  debuff?: boolean;
}

/** A timed scalar such as damage reduction or reflect. */
export interface TimedValue {
  value: number;
  expiresAt?: number;
  conditions?: EffectCondition[];
  sourceKey: string;
  meta?: Record<string, number | string | boolean>;
  debuff?: boolean;
}

export interface HealOverTime {
  perSecond: number;
  remaining: number;
  sourceId: string;
  /** Infinite regeneration (elite modifier). */
  permanent?: boolean;
}

export interface CombatantInit {
  id: string;
  name: string;
  side: Side;
  kind: CombatantKind;
  defId: string;
  row: Row;
  slot: number;
  baseStats: CombatStats;
  startingHP: number;
  heroClass?: HeroClass;
  skill?: SkillDefinition;
  /** Run-state army id, so persistent HP can be written back. */
  armyId?: string;
  art: { color: number; accent: number; shape: string };
}

let uidCounter = 0;
export function resetCombatantUids(): void {
  uidCounter = 0;
}

/**
 * One unit on the battlefield. Player armies and enemies use the same class -
 * everything that differs between them lives in data.
 */
export class Combatant {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly kind: CombatantKind;
  readonly defId: string;
  readonly armyId: string | undefined;
  readonly heroClass: HeroClass | undefined;
  readonly skill: SkillDefinition | undefined;
  readonly art: { color: number; accent: number; shape: string };

  row: Row;
  slot: number;

  readonly baseStats: CombatStats;
  /** Resolved stats, refreshed once per simulation tick. */
  stats: CombatStats;

  currentHP: number;
  shield = 0;
  shieldExpiresAt: number | undefined;
  energy = 0;
  alive = true;

  x = 0;
  y = 0;
  homeX = 0;
  homeY = 0;
  /** Small deterministic offset so units do not perfectly overlap. */
  jitterY = 0;

  attackTimer = 0;
  castLock = 0;
  targetId: string | null = null;
  /** Set for one attack by War Machine style effects. */
  empowerNextAttack = 0;

  modifiers: TimedModifier[] = [];
  damageReductions: TimedValue[] = [];
  damageAmps: TimedValue[] = [];
  damageTakenAmps: TimedValue[] = [];
  reflects: TimedValue[] = [];
  lifesteals: TimedValue[] = [];
  healReceivedMods: TimedValue[] = [];
  hots: HealOverTime[] = [];
  flags: Record<string, number> = {};
  counters: Record<string, number> = {};
  /** Marked by Solen - other effects can key off this. */
  markedUntil = 0;

  // Tracking for mastery challenges and the post-battle report.
  damageDealt = 0;
  damageTaken = 0;
  healingDone = 0;
  kills = 0;
  skillsCast = 0;
  /** Set while a skill is resolving so ON_KILL can tell how the kill happened. */
  resolvingSkill = false;

  constructor(init: CombatantInit) {
    uidCounter += 1;
    this.id = `${init.id}#${uidCounter}`;
    this.name = init.name;
    this.side = init.side;
    this.kind = init.kind;
    this.defId = init.defId;
    this.armyId = init.armyId;
    this.heroClass = init.heroClass;
    this.skill = init.skill;
    this.art = init.art;
    this.row = init.row;
    this.slot = init.slot;
    this.baseStats = { ...init.baseStats };
    this.stats = { ...init.baseStats };
    this.currentHP = Math.max(1, Math.round(init.startingHP));
  }

  get hpPercent(): number {
    return this.stats.maxHP > 0 ? this.currentHP / this.stats.maxHP : 0;
  }

  get isPlayer(): boolean {
    return this.side === 'PLAYER';
  }

  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /** Places the unit at its formation slot. */
  placeAt(centreX: number, laneY: number): void {
    this.homeX = centreX;
    this.homeY = laneY;
    this.x = centreX;
    this.y = laneY;
  }

  distanceTo(other: Combatant): number {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Recomputes `stats` from base + active modifiers. */
  refreshStats(ctx: ConditionContext): void {
    const percent: Partial<Record<StatKey, number>> = {};
    const flat: Partial<Record<StatKey, number>> = {};

    for (const mod of this.modifiers) {
      if (mod.expiresAt !== undefined && ctx.time >= mod.expiresAt) continue;
      if (mod.conditions && !evaluateConditions(mod.conditions, this, ctx)) continue;
      const amount = mod.value * mod.stacks;
      if (mod.mode === 'PERCENT') percent[mod.stat] = (percent[mod.stat] ?? 0) + amount;
      else flat[mod.stat] = (flat[mod.stat] ?? 0) + amount;
    }

    const previousMax = this.stats.maxHP;
    for (const key of STAT_KEYS) {
      const base = this.baseStats[key];
      const pct = percent[key] ?? 0;
      const add = flat[key] ?? 0;
      let value: number;
      if (RATIO_STATS.includes(key)) {
        value = base * (1 + pct) + add;
        value = Math.max(0, Math.min(1, value));
      } else {
        value = base * (1 + pct) + add;
        value = Math.max(0, value);
      }
      this.stats[key] = value;
    }
    // A mid-battle Max HP change keeps the same absolute HP but is capped.
    if (this.stats.maxHP !== previousMax && this.stats.maxHP > 0) {
      this.currentHP = Math.min(this.currentHP, this.stats.maxHP);
    }
  }

  /** Multiplicative stacking so 3 x 45% never reaches 100% immunity. */
  totalDamageReduction(ctx: ConditionContext): number {
    let remaining = 1;
    for (const entry of this.damageReductions) {
      if (entry.expiresAt !== undefined && ctx.time >= entry.expiresAt) continue;
      if (entry.conditions && !evaluateConditions(entry.conditions, this, ctx)) continue;
      remaining *= 1 - Math.max(0, Math.min(0.9, entry.value));
    }
    return 1 - remaining;
  }

  sumTimed(list: TimedValue[], ctx: ConditionContext, filter?: (entry: TimedValue) => boolean): number {
    let total = 0;
    for (const entry of list) {
      if (entry.expiresAt !== undefined && ctx.time >= entry.expiresAt) continue;
      if (entry.conditions && !evaluateConditions(entry.conditions, this, ctx)) continue;
      if (filter && !filter(entry)) continue;
      total += entry.value;
    }
    return total;
  }

  addModifier(mod: TimedModifier): void {
    const existing = this.modifiers.find((m) => m.sourceKey === mod.sourceKey && m.stat === mod.stat);
    if (existing) {
      const cap = mod.maxStacks ?? 1;
      existing.stacks = Math.min(cap, existing.stacks + mod.stacks);
      existing.expiresAt = mod.expiresAt;
      return;
    }
    this.modifiers.push(mod);
  }

  /** Removes one debuff. Returns true when something was removed. */
  cleanse(): boolean {
    const index = this.modifiers.findIndex((m) => m.debuff);
    if (index >= 0) {
      this.modifiers.splice(index, 1);
      return true;
    }
    const lists = [this.damageTakenAmps, this.healReceivedMods];
    for (const list of lists) {
      const i = list.findIndex((entry) => entry.debuff);
      if (i >= 0) {
        list.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  expireTimed(time: number): void {
    this.modifiers = this.modifiers.filter((m) => m.expiresAt === undefined || time < m.expiresAt);
    const keep = (entry: TimedValue) => entry.expiresAt === undefined || time < entry.expiresAt;
    this.damageReductions = this.damageReductions.filter(keep);
    this.damageAmps = this.damageAmps.filter(keep);
    this.damageTakenAmps = this.damageTakenAmps.filter(keep);
    this.reflects = this.reflects.filter(keep);
    this.lifesteals = this.lifesteals.filter(keep);
    this.healReceivedMods = this.healReceivedMods.filter(keep);
    if (this.shieldExpiresAt !== undefined && time >= this.shieldExpiresAt) {
      this.shield = 0;
      this.shieldExpiresAt = undefined;
    }
  }

  bumpCounter(key: string): number {
    this.counters[key] = (this.counters[key] ?? 0) + 1;
    return this.counters[key]!;
  }

  addEnergy(amount: number): void {
    const scaled = amount > 0 ? amount * this.stats.energyGeneration : amount;
    this.energy = Math.max(0, Math.min(GameConfig.combat.energyMax, this.energy + scaled));
  }
}

/* ------------------------------------------------------------------ */
/* Conditions                                                          */
/* ------------------------------------------------------------------ */

export interface ConditionContext {
  time: number;
  /** Living allies of the combatant being evaluated. */
  livingAllies: (side: Side) => number;
  eventTarget?: Combatant | undefined;
  isCrit?: boolean;
  blessingCount?: number;
}

export function evaluateConditions(
  conditions: EffectCondition[],
  self: Combatant,
  ctx: ConditionContext,
): boolean {
  for (const condition of conditions) {
    if (!evaluateCondition(condition, self, ctx)) return false;
  }
  return true;
}

function evaluateCondition(condition: EffectCondition, self: Combatant, ctx: ConditionContext): boolean {
  switch (condition.type) {
    case 'SELF_HP_BELOW':
      return self.hpPercent < condition.value;
    case 'SELF_HP_ABOVE':
      return self.hpPercent > condition.value;
    case 'TARGET_HP_BELOW':
      return (ctx.eventTarget?.hpPercent ?? 1) < condition.value;
    case 'ALLY_ALIVE_COUNT': {
      const count = ctx.livingAllies(self.side);
      if (condition.op === 'EQ') return count === condition.value;
      if (condition.op === 'LTE') return count <= condition.value;
      return count >= condition.value;
    }
    case 'BATTLE_TIME_BEFORE':
      return ctx.time < condition.value;
    case 'BATTLE_TIME_AFTER':
      return ctx.time >= condition.value;
    case 'TARGET_KIND':
      return ctx.eventTarget ? condition.value.includes(ctx.eventTarget.kind) : false;
    case 'SOURCE_ROW':
      return self.row === condition.value;
    case 'IS_CRIT':
      return ctx.isCrit === true;
    case 'BLESSING_COUNT':
      return (ctx.blessingCount ?? 0) >= condition.value;
    default:
      return true;
  }
}

/** Effects default to targeting the owner when no selector is given. */
export function defaultTargetScope(effect: EffectDefinition): 'SELF' | 'ALLIES' | 'ENEMIES' {
  if (effect.target?.scope === 'ALLIES') return 'ALLIES';
  if (effect.target?.scope === 'ENEMIES') return 'ENEMIES';
  return 'SELF';
}
