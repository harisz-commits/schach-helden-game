import type {
  BossPhase,
  CombatStats,
  CombatantKind,
  EffectDefinition,
  EncounterData,
  OwnedBlessing,
  Row,
  Side,
  SkillDefinition,
  TargetingRule,
} from '../core/types';
import { GameConfig, encounterMultiplier, guardianDamageMultiplier } from '../core/GameConfig';
import { RNG } from '../core/RNG';
import { getBlessing } from '../data/blessings';
import { ELITE_MODIFIERS_BY_ID, getEnemy } from '../data/enemies';
import { getBoss } from '../data/bosses';
import { getHero } from '../data/heroes';
import { EffectEngine } from '../effects/EffectEngine';
import { TriggerSystem } from '../effects/TriggerSystem';
import type { EffectHost, PendingRunEffect, TriggerEvent } from '../effects/EffectTypes';
import { Combatant, ConditionContext, resetCombatantUids } from './Combatant';
import { computeDamage, energyFromDamage } from './DamageSystem';
import { slotPosition } from './Formation';
import { acquireTarget, pickByRule } from './TargetingSystem';

export type BattleOutcome = 'ONGOING' | 'VICTORY' | 'DEFEAT';

export interface CombatLogEntry {
  t: number;
  type: 'ATTACK' | 'SKILL' | 'DAMAGE' | 'HEAL' | 'SHIELD' | 'DEATH' | 'REVIVE' | 'PHASE' | 'INFO' | 'ENERGY';
  sourceId?: string;
  targetId?: string;
  amount?: number;
  isCrit?: boolean;
  text?: string;
}

export interface BattleArmyInput {
  armyId: string;
  heroId: string;
  lieutenantId?: string;
  row: Row;
  slot: number;
  currentHP: number;
  /** Run-level resolved stats (hero base + blessings + mastery + floor buffs). */
  stats: CombatStats;
}

export interface BattleSetup {
  seed: number;
  floor: number;
  ascensionLevel: number;
  mode: 'NORMAL' | 'ENDLESS' | 'DAILY';
  armies: BattleArmyInput[];
  encounter: EncounterData;
  blessings: OwnedBlessing[];
  /** Mastery tier reached per hero id. */
  heroMastery: Record<string, number>;
  /** Siege Stone and friends. */
  guardianHPPenalty?: number;
  /** Royal Feast makes the guardian tougher. */
  guardianPowerBonus?: number;
  bossExtraPhase?: boolean;
  /** Pre-battle relic buffs, keyed by army id ('*' applies to all). */
  battleModifiers?: { armyId: string; effects: EffectDefinition[] }[];
}

export interface BattleResult {
  outcome: 'VICTORY' | 'DEFEAT';
  durationSeconds: number;
  armies: {
    armyId: string;
    heroId: string;
    hpRatio: number;
    alive: boolean;
    damageDealt: number;
    damageTaken: number;
    healingDone: number;
    kills: number;
    skillsCast: number;
  }[];
  enemiesDefeated: number;
  runEffects: PendingRunEffect[];
}

interface SurviveGrant {
  shieldPercent: number;
  sourceKey: string;
}

interface PendingRepeat {
  casterId: string;
  effectiveness: number;
}

const TICK = 1 / GameConfig.combat.tickRate;

/**
 * The auto-battler.
 *
 * Fully deterministic: the same seed, formation and inputs always produce the
 * same battle, which is what makes the combat tests meaningful and lets the
 * renderer be a pure view over the simulation.
 */
export class CombatEngine implements EffectHost {
  readonly rng: RNG;
  readonly triggers = new TriggerSystem();
  readonly effects: EffectEngine;
  readonly log: CombatLogEntry[] = [];
  readonly setup: BattleSetup;

  time = 0;
  outcome: BattleOutcome = 'ONGOING';
  combatants: Combatant[] = [];
  blessingCount = 0;

  private playerSide: Combatant[] = [];
  private enemySide: Combatant[] = [];
  private targetingRules = new Map<string, TargetingRule>();
  private surviveGrants = new Map<string, SurviveGrant>();
  private pendingRepeats: PendingRepeat[] = [];
  private runEffects: PendingRunEffect[] = [];
  private bossPhasesFired = new Set<number>();
  private bossCombatant: Combatant | null = null;
  private bossPhases: BossPhase[] = [];
  private accumulator = 0;
  private skillCache = new Map<string, SkillDefinition>();
  /** Banner text the renderer should show (boss phase changes). */
  pendingBanner: string | null = null;

  constructor(setup: BattleSetup) {
    this.setup = setup;
    this.rng = new RNG(setup.seed);
    this.effects = new EffectEngine(this, this.triggers);
    this.blessingCount = setup.blessings.reduce((sum, b) => sum + b.stacks, 0);
    resetCombatantUids();
    this.buildPlayerSide();
    this.buildEnemySide();
    this.registerBlessings();
    this.registerBattleModifiers();
    this.start();
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  private buildPlayerSide(): void {
    for (const army of this.setup.armies) {
      const hero = getHero(army.heroId);
      const combatant = new Combatant({
        id: army.armyId,
        name: hero.name,
        side: 'PLAYER',
        kind: 'HERO',
        defId: hero.id,
        row: army.row,
        slot: army.slot,
        baseStats: army.stats,
        startingHP: army.currentHP,
        heroClass: hero.heroClass,
        skill: hero.activeSkill,
        armyId: army.armyId,
        art: hero.art,
      });
      const pos = slotPosition('PLAYER', army.row, army.slot);
      combatant.placeAt(pos.x, pos.y);
      // Stagger the first swing so hits do not arrive in lockstep.
      combatant.attackTimer = (army.slot % 4) * 0.12;
      this.combatants.push(combatant);
      this.playerSide.push(combatant);
      this.skillCache.set(combatant.id, hero.activeSkill);

      const tier = this.setup.heroMastery[hero.id] ?? 1;
      for (const passive of hero.passiveSkills) {
        this.triggers.registerMany(passive.effects, {
          keyPrefix: `hero:${army.armyId}:${passive.id}`,
          ownerSide: 'PLAYER',
          ownerId: combatant.id,
          label: passive.name,
        });
      }
      // Mastery tiers past the first add their own effects.
      for (const masteryTier of hero.mastery) {
        if (masteryTier.tier > tier || masteryTier.effects.length === 0) continue;
        this.triggers.registerMany(masteryTier.effects, {
          keyPrefix: `mastery:${army.armyId}:${masteryTier.tier}`,
          ownerSide: 'PLAYER',
          ownerId: combatant.id,
          label: `${hero.name} Mastery ${masteryTier.tier}`,
        });
      }
      // Lieutenants contribute their passives at reduced strength.
      if (army.lieutenantId) {
        const lieutenant = getHero(army.lieutenantId);
        for (const passive of lieutenant.passiveSkills) {
          this.triggers.registerMany(scaleEffects(passive.effects, 0.5), {
            keyPrefix: `lt:${army.armyId}:${passive.id}`,
            ownerSide: 'PLAYER',
            ownerId: combatant.id,
            label: `${lieutenant.name} (Lieutenant)`,
          });
        }
      }
    }
  }

  private buildEnemySide(): void {
    const { encounter, floor, ascensionLevel } = this.setup;
    const boss = encounter.bossId ? getBoss(encounter.bossId) : null;

    for (const unit of encounter.units) {
      const isBossUnit = boss !== null && unit.defId === boss.enemy.id;
      const def = isBossUnit ? boss!.enemy : getEnemy(unit.defId);
      const kind: CombatantKind = isBossUnit ? 'BOSS' : encounter.kind === 'ELITE' && unit.eliteModifiers?.length ? 'ELITE' : encounter.kind === 'GUARDIAN' && unit.eliteModifiers?.length ? 'GUARDIAN' : unit.eliteModifiers?.length ? 'ELITE' : 'ENEMY';

      const multiplier =
        encounterMultiplier(floor, kind, ascensionLevel) *
        unit.powerMultiplier *
        (1 + (this.setup.guardianPowerBonus ?? 0) * (kind === 'GUARDIAN' || kind === 'BOSS' ? 1 : 0));

      const scaled = scaleEnemyStats(def.baseStats, multiplier);
      if ((kind === 'GUARDIAN' || kind === 'BOSS') && this.setup.guardianHPPenalty) {
        scaled.maxHP *= 1 - this.setup.guardianHPPenalty;
      }
      if (kind === 'GUARDIAN' || kind === 'BOSS') {
        scaled.maxHP *= GameConfig.combat.guardianHPBonus;
        const damageBonus = guardianDamageMultiplier(floor);
        scaled.attack *= damageBonus;
        scaled.skillPower *= damageBonus;
      }

      const combatant = new Combatant({
        id: `${def.id}_${unit.row}${unit.slot}`,
        name: def.name,
        side: 'ENEMY',
        kind,
        defId: def.id,
        row: unit.row,
        slot: unit.slot,
        baseStats: scaled,
        startingHP: scaled.maxHP,
        ...(def.activeSkill ? { skill: def.activeSkill } : {}),
        art: def.art,
      });
      const pos = slotPosition('ENEMY', unit.row, unit.slot);
      combatant.placeAt(pos.x, pos.y);
      combatant.attackTimer = (unit.slot % 4) * 0.12 + 0.15;
      this.combatants.push(combatant);
      this.enemySide.push(combatant);
      this.targetingRules.set(combatant.id, def.targeting);
      if (def.activeSkill) this.skillCache.set(combatant.id, def.activeSkill);

      for (const passive of def.passiveSkills ?? []) {
        this.triggers.registerMany(passive.effects, {
          keyPrefix: `enemy:${combatant.id}:${passive.id}`,
          ownerSide: 'ENEMY',
          ownerId: combatant.id,
          label: passive.name,
        });
      }
      for (const modId of unit.eliteModifiers ?? []) {
        const mod = ELITE_MODIFIERS_BY_ID[modId];
        if (!mod) continue;
        this.triggers.registerMany(mod.effects, {
          keyPrefix: `elite:${combatant.id}:${modId}`,
          ownerSide: 'ENEMY',
          ownerId: combatant.id,
          label: mod.name,
        });
      }

      if (isBossUnit) {
        this.bossCombatant = combatant;
        this.bossPhases = boss!.phases.filter((_, index) =>
          index < boss!.phases.length - 1 || this.setup.bossExtraPhase !== false || boss!.phases.length <= 3,
        );
        if (!this.setup.bossExtraPhase && boss!.id === 'the_crownless_king') {
          this.bossPhases = boss!.phases.slice(0, 2);
        }
      }
    }
  }

  private registerBlessings(): void {
    for (const owned of this.setup.blessings) {
      const def = getBlessing(owned.id);
      this.triggers.registerMany(def.effects, {
        keyPrefix: `blessing:${def.id}`,
        ownerSide: 'PLAYER',
        stacks: owned.stacks,
        label: def.name,
      });
    }
  }

  private registerBattleModifiers(): void {
    for (const entry of this.setup.battleModifiers ?? []) {
      const targets =
        entry.armyId === '*'
          ? this.playerSide
          : this.playerSide.filter((c) => c.armyId === entry.armyId);
      for (const target of targets) {
        this.triggers.registerMany(entry.effects, {
          keyPrefix: `relic:${entry.armyId}:${target.id}`,
          ownerSide: 'PLAYER',
          ownerId: target.id,
          label: 'Relic',
        });
      }
    }
  }

  private start(): void {
    this.refreshAllStats();
    for (const combatant of this.combatants) {
      if (combatant.skill) combatant.energy = GameConfig.combat.startingEnergy;
    }
    this.emit({ trigger: 'ON_BATTLE_START' });
    this.refreshAllStats();
    for (const combatant of this.combatants) {
      combatant.currentHP = Math.min(combatant.currentHP, combatant.stats.maxHP);
    }
    this.log.push({ t: 0, type: 'INFO', text: this.setup.encounter.name });
  }

  /* ---------------------------------------------------------------- */
  /* EffectHost                                                        */
  /* ---------------------------------------------------------------- */

  alliesOf(side: Side): Combatant[] {
    return side === 'PLAYER' ? this.playerSide : this.enemySide;
  }

  enemiesOf(side: Side): Combatant[] {
    return side === 'PLAYER' ? this.enemySide : this.playerSide;
  }

  livingCount(side: Side): number {
    return this.alliesOf(side).filter((c) => c.alive).length;
  }

  currentTargetOf(combatant: Combatant): Combatant | null {
    if (!combatant.targetId) return null;
    return this.combatants.find((c) => c.id === combatant.targetId && c.alive) ?? null;
  }

  queueRunEffect(effect: PendingRunEffect): void {
    this.runEffects.push(effect);
  }

  logEvent(entry: { type: string; sourceId?: string; targetId?: string; amount?: number; text?: string }): void {
    this.log.push({ t: this.time, ...entry } as CombatLogEntry);
  }

  dealEffectDamage(
    attacker: Combatant,
    defender: Combatant,
    magnitude: EffectDefinition['magnitude'],
    multiplier: number,
    options: { isSkill: boolean; meta?: Record<string, number | string | boolean> },
  ): void {
    if (!defender.alive || !attacker.alive) return;
    const meta = options.meta ?? {};
    if (meta.teleport === true) {
      // Blink behind the line: snap next to the target.
      attacker.x = defender.x + (attacker.isPlayer ? -1 : 1) * GameConfig.combat.lane.minSeparation;
      attacker.y = defender.y;
    }
    const result = computeDamage(
      {
        attacker,
        defender,
        magnitude: magnitude ?? 'ATTACK',
        multiplier,
        isSkill: options.isSkill,
        ...(meta.guaranteedCrit === true ? { guaranteedCrit: true } : {}),
        ...(meta.missingHPScaling !== undefined ? { missingHPScaling: Number(meta.missingHPScaling) } : {}),
        ...(meta.executeThreshold !== undefined ? { executeThreshold: Number(meta.executeThreshold) } : {}),
        ...(meta.executeMultiplier !== undefined ? { executeMultiplier: Number(meta.executeMultiplier) } : {}),
      },
      this.rng,
      this.conditionContext(),
    );
    this.applyDamage(attacker, defender, result.amount, {
      isSkill: options.isSkill,
      isCrit: result.isCrit,
    });
    if (options.isSkill) {
      this.emit({ trigger: 'ON_SKILL_HIT', source: attacker, target: defender, amount: result.amount, isSkill: true });
    }
    if (result.isCrit) {
      this.emit({ trigger: 'ON_CRIT', source: attacker, target: defender, amount: result.amount, isCrit: true });
    }
  }

  healTarget(source: Combatant | null, target: Combatant, amount: number): void {
    if (!target.alive || amount <= 0) return;
    const ctx = this.conditionContext();
    const healPower = source ? source.stats.healingPower : 1;
    const received = 1 + target.sumTimed(target.healReceivedMods, ctx);
    const total = amount * healPower * Math.max(0, received);
    const missing = Math.max(0, target.stats.maxHP - target.currentHP);
    const applied = Math.min(missing, total);
    target.currentHP += applied;
    const overflow = total - applied;
    const shieldCap = (target.flags.overhealShield ?? 0) * target.stats.maxHP;
    if (overflow > 0 && shieldCap > 0) {
      target.shield = Math.min(shieldCap, target.shield + overflow);
      target.shieldExpiresAt = undefined;
    }
    if (source) source.healingDone += applied;
    if (applied > 0) {
      this.log.push({ t: this.time, type: 'HEAL', ...(source ? { sourceId: source.id } : {}), targetId: target.id, amount: applied });
      this.emit({ trigger: 'ON_HEAL', source, target, amount: applied });
    }
  }

  shieldTarget(target: Combatant, amount: number, durationSeconds?: number): void {
    if (!target.alive || amount <= 0) return;
    target.shield += amount;
    target.shieldExpiresAt = durationSeconds !== undefined ? this.time + durationSeconds : undefined;
    this.log.push({ t: this.time, type: 'SHIELD', targetId: target.id, amount });
  }

  reviveTarget(target: Combatant, hpPercent: number): boolean {
    if (target.alive) return false;
    target.alive = true;
    target.currentHP = Math.max(1, target.stats.maxHP * hpPercent);
    target.energy = 0;
    target.shield = 0;
    this.log.push({ t: this.time, type: 'REVIVE', targetId: target.id, amount: target.currentHP });
    this.emit({ trigger: 'ON_REVIVE', target });
    return true;
  }

  grantSurviveLethal(target: Combatant, shieldPercent: number, sourceKey: string): void {
    if (target.currentHP > 0) {
      // Pre-emptive grant (registered at battle start) - remember it for later.
      this.surviveGrants.set(target.id, { shieldPercent, sourceKey });
      return;
    }
    target.currentHP = 1;
    target.alive = true;
    this.shieldTarget(target, target.stats.maxHP * shieldPercent);
    this.log.push({ t: this.time, type: 'INFO', targetId: target.id, text: 'LAST STAND' });
  }

  repeatSkill(source: Combatant, effectiveness: number): void {
    this.pendingRepeats.push({ casterId: source.id, effectiveness });
  }

  /* ---------------------------------------------------------------- */
  /* Simulation                                                        */
  /* ---------------------------------------------------------------- */

  private conditionContext(): ConditionContext {
    return {
      time: this.time,
      livingAllies: (side: Side) => this.livingCount(side),
      blessingCount: this.blessingCount,
    };
  }

  private refreshAllStats(): void {
    const ctx = this.conditionContext();
    for (const combatant of this.combatants) combatant.refreshStats(ctx);
  }

  emit(event: TriggerEvent): void {
    this.effects.emit(event);
  }

  /** Advances the simulation by real seconds (already speed-scaled). */
  update(deltaSeconds: number): void {
    if (this.outcome !== 'ONGOING') return;
    this.accumulator += deltaSeconds;
    let guard = 0;
    while (this.accumulator >= TICK && this.outcome === 'ONGOING' && guard < 600) {
      this.accumulator -= TICK;
      this.step(TICK);
      guard += 1;
    }
  }

  /** Runs the whole battle instantly. Used by tests and the balance harness. */
  runToCompletion(): BattleResult {
    let guard = 0;
    const maxSteps = Math.ceil(GameConfig.combat.maxBattleSeconds / TICK) + 10;
    while (this.outcome === 'ONGOING' && guard < maxSteps) {
      this.step(TICK);
      guard += 1;
    }
    if (this.outcome === 'ONGOING') this.finish('DEFEAT');
    return this.result();
  }

  private step(dt: number): void {
    this.time += dt;
    this.refreshAllStats();

    for (const combatant of this.combatants) {
      combatant.expireTimed(this.time);
      this.tickHots(combatant, dt);
    }

    for (const combatant of this.combatants) {
      if (!combatant.alive || this.outcome !== 'ONGOING') continue;
      this.stepCombatant(combatant, dt);
    }

    this.flushRepeats();
    this.checkBossPhases();
    this.checkOutcome();
  }

  private tickHots(combatant: Combatant, dt: number): void {
    if (combatant.hots.length === 0 || !combatant.alive) return;
    for (const hot of combatant.hots) {
      const amount = hot.perSecond * dt;
      if (amount > 0) this.healTarget(null, combatant, amount);
      if (!hot.permanent) hot.remaining -= dt;
    }
    combatant.hots = combatant.hots.filter((hot) => hot.permanent || hot.remaining > 0);
  }

  private stepCombatant(combatant: Combatant, dt: number): void {
    if (combatant.castLock > 0) {
      combatant.castLock = Math.max(0, combatant.castLock - dt);
      return;
    }

    const enemies = this.enemiesOf(combatant.side).filter((c) => c.alive);
    if (enemies.length === 0) return;

    const skill = this.skillCache.get(combatant.id);
    if (skill && combatant.energy >= GameConfig.combat.energyMax) {
      this.castSkill(combatant, skill);
      return;
    }

    let target = this.currentTargetOf(combatant);
    if (!target) {
      target = this.selectTarget(combatant, enemies);
      combatant.targetId = target ? target.id : null;
    }
    if (!target) return;

    const distance = combatant.distanceTo(target);
    const range = combatant.stats.range;
    if (distance > range) {
      this.moveToward(combatant, target, dt);
    }

    combatant.attackTimer -= dt;
    if (combatant.attackTimer <= 0 && combatant.distanceTo(target) <= range) {
      this.basicAttack(combatant, target);
      const interval = 1 / Math.max(0.15, combatant.stats.attackSpeed);
      combatant.attackTimer = interval;
    } else if (combatant.attackTimer < 0) {
      combatant.attackTimer = 0;
    }
  }

  private selectTarget(combatant: Combatant, enemies: Combatant[]): Combatant | null {
    if (combatant.isPlayer) return acquireTarget(combatant, enemies);
    const rule = this.targetingRules.get(combatant.id) ?? 'NEAREST';
    return pickByRule(combatant, enemies, rule);
  }

  private moveToward(combatant: Combatant, target: Combatant, dt: number): void {
    const dx = target.x - combatant.x;
    const dy = target.y - combatant.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Stop just inside weapon range, never closer than the separation floor.
    const stopAt = Math.max(GameConfig.combat.lane.minSeparation, combatant.stats.range * 0.92);
    const travel = Math.min(combatant.stats.movementSpeed * dt, Math.max(0, dist - stopAt));
    if (travel <= 0) return;
    combatant.x += (dx / dist) * travel;
    // Damped lateral drift: armies wheel toward their target but hold their
    // lane, so five formations do not collapse into one pile in the middle.
    combatant.y += (dy / dist) * travel * 0.45;
  }

  private basicAttack(attacker: Combatant, target: Combatant): void {
    attacker.bumpCounter('attacks');
    const empower = attacker.empowerNextAttack;
    attacker.empowerNextAttack = 0;

    const result = computeDamage(
      {
        attacker,
        defender: target,
        magnitude: 'ATTACK',
        multiplier: 1,
        isSkill: false,
        bonusMultiplier: 1 + empower,
      },
      this.rng,
      this.conditionContext(),
    );

    this.log.push({
      t: this.time,
      type: 'ATTACK',
      sourceId: attacker.id,
      targetId: target.id,
      amount: result.amount,
      isCrit: result.isCrit,
    });

    attacker.addEnergy(GameConfig.combat.energyPerBasicAttack);
    this.emit({ trigger: 'ON_BASIC_ATTACK', source: attacker, target, amount: result.amount, isCrit: result.isCrit });
    if (result.isCrit) this.emit({ trigger: 'ON_CRIT', source: attacker, target, amount: result.amount, isCrit: true });

    this.applyDamage(attacker, target, result.amount, { isSkill: false, isCrit: result.isCrit });
  }

  private castSkill(caster: Combatant, skill: SkillDefinition): void {
    caster.energy = 0;
    caster.castLock = skill.castTime;
    caster.skillsCast += 1;
    caster.resolvingSkill = true;
    caster.counters.energyThisCast = 0;
    caster.bumpCounter('skillCasts');
    this.log.push({ t: this.time, type: 'SKILL', sourceId: caster.id, text: skill.name });

    // Make sure the caster has a target for CURRENT_TARGET selectors.
    if (!this.currentTargetOf(caster)) {
      const enemies = this.enemiesOf(caster.side).filter((c) => c.alive);
      const target = this.selectTarget(caster, enemies);
      caster.targetId = target ? target.id : null;
    }

    this.emit({ trigger: 'ON_SKILL_CAST', source: caster, skillId: skill.id, isSkill: true });
    this.resolveSkill(caster, skill, 1);
    caster.resolvingSkill = false;
  }

  private resolveSkill(caster: Combatant, skill: SkillDefinition, effectiveness: number): void {
    const tuned = tuneSkill(caster, skill);
    const ctx = this.conditionContext();
    for (let index = 0; index < tuned.effects.length; index++) {
      const effect = tuned.effects[index]!;
      const entry = {
        key: `skill:${caster.id}:${skill.id}#${index}`,
        effect,
        ownerSide: caster.side,
        ownerId: caster.id,
        stacks: 1,
        label: skill.name,
      };
      this.effects.applyEffect(
        effect,
        entry,
        caster,
        { trigger: 'ON_SKILL_CAST', source: caster, isSkill: true },
        ctx,
        effectiveness,
      );
    }
  }

  private flushRepeats(): void {
    if (this.pendingRepeats.length === 0) return;
    const repeats = this.pendingRepeats.splice(0, this.pendingRepeats.length);
    for (const repeat of repeats) {
      const caster = this.combatants.find((c) => c.id === repeat.casterId);
      const skill = caster ? this.skillCache.get(caster.id) : undefined;
      if (!caster || !caster.alive || !skill) continue;
      this.log.push({ t: this.time, type: 'SKILL', sourceId: caster.id, text: `${skill.name} (Echo)` });
      caster.resolvingSkill = true;
      this.resolveSkill(caster, skill, repeat.effectiveness);
      caster.resolvingSkill = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Damage application                                                */
  /* ---------------------------------------------------------------- */

  applyDamage(
    attacker: Combatant | null,
    target: Combatant,
    amount: number,
    options: { isSkill: boolean; isCrit?: boolean },
  ): void {
    if (!target.alive || amount <= 0) return;

    let remaining = amount;
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
    }
    target.currentHP -= remaining;
    target.damageTaken += amount;
    if (attacker) attacker.damageDealt += amount;

    this.log.push({
      t: this.time,
      type: 'DAMAGE',
      ...(attacker ? { sourceId: attacker.id } : {}),
      targetId: target.id,
      amount,
      ...(options.isCrit ? { isCrit: true } : {}),
    });

    // Energy from being hit.
    target.addEnergy(energyFromDamage(target, amount));

    const ctx = this.conditionContext();

    // Lifesteal and reflect.
    if (attacker) {
      const lifesteal = attacker.sumTimed(attacker.lifesteals, ctx);
      if (lifesteal > 0) this.healTarget(attacker, attacker, amount * lifesteal);
      const reflect = target.sumTimed(target.reflects, ctx);
      if (reflect > 0 && attacker.alive) {
        const reflected = amount * reflect;
        this.applyDamage(null, attacker, reflected, { isSkill: false });
        const reflectHeal = target.flags.thorne_reflect_heal ?? 0;
        if (reflectHeal > 0) this.healTarget(target, target, reflected * reflectHeal);
      }
    }

    this.emit({ trigger: 'ON_DAMAGE_TAKEN', source: attacker ?? null, target, amount, ...(options.isCrit ? { isCrit: true } : {}) });
    if (attacker) this.emit({ trigger: 'ON_DAMAGE_DEALT', source: attacker, target, amount });

    if (target.currentHP <= 0) {
      const grant = this.surviveGrants.get(target.id);
      if (grant) {
        this.surviveGrants.delete(target.id);
        target.currentHP = 1;
        this.shieldTarget(target, target.stats.maxHP * grant.shieldPercent);
        const healPct = target.flags.seraph_last_stand_heal ?? 0;
        if (healPct > 0) this.healTarget(null, target, target.stats.maxHP * healPct);
        this.log.push({ t: this.time, type: 'INFO', targetId: target.id, text: 'LAST STAND' });
        return;
      }
      this.emit({ trigger: 'ON_LETHAL_DAMAGE', source: attacker ?? null, target });
      if (target.currentHP > 0) return;
      this.kill(attacker, target);
    }
  }

  private kill(attacker: Combatant | null, target: Combatant): void {
    target.alive = false;
    target.currentHP = 0;
    target.shield = 0;
    target.hots = [];
    this.log.push({ t: this.time, type: 'DEATH', targetId: target.id, ...(attacker ? { sourceId: attacker.id } : {}) });

    if (attacker) {
      attacker.kills += 1;
      this.emit({
        trigger: 'ON_KILL',
        source: attacker,
        target,
        isSkill: attacker.resolvingSkill,
      });
    }
    if (target.isPlayer) {
      this.emit({ trigger: 'ON_ARMY_DEATH', target, source: attacker ?? null });
    }
    // A revive effect may have brought the unit straight back.
    if (target.alive) return;
    for (const combatant of this.combatants) {
      if (combatant.targetId === target.id) combatant.targetId = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Boss phases and outcome                                           */
  /* ---------------------------------------------------------------- */

  private checkBossPhases(): void {
    const boss = this.bossCombatant;
    if (!boss || !boss.alive) return;
    for (let index = 0; index < this.bossPhases.length; index++) {
      if (this.bossPhasesFired.has(index)) continue;
      const phase = this.bossPhases[index]!;
      if (boss.hpPercent > phase.hpThreshold) continue;
      this.bossPhasesFired.add(index);
      this.triggerPhase(boss, phase, index);
    }
  }

  private triggerPhase(boss: Combatant, phase: BossPhase, index: number): void {
    this.log.push({ t: this.time, type: 'PHASE', sourceId: boss.id, text: phase.banner ?? phase.name });
    this.pendingBanner = phase.banner ?? phase.name;
    const ctx = this.conditionContext();
    phase.effects.forEach((effect, i) => {
      this.effects.applyEffect(
        effect,
        { key: `phase:${index}:${i}`, effect, ownerSide: 'ENEMY', ownerId: boss.id, stacks: 1, label: phase.name },
        boss,
        { trigger: 'ON_BATTLE_START', source: boss },
        ctx,
      );
    });
    for (const summonId of phase.summons ?? []) {
      this.summon(summonId);
    }
    this.refreshAllStats();
  }

  /** Spawns an extra enemy mid-battle (boss phases, Summoner skill). */
  summon(defId: string): Combatant | null {
    const def = getEnemy(defId);
    const used = new Set(this.enemySide.filter((c) => c.row === def.preferredRow).map((c) => c.slot));
    let slot = 0;
    while (used.has(slot) && slot < GameConfig.run.formationSlotsPerRow) slot += 1;
    const row: Row = slot >= GameConfig.run.formationSlotsPerRow ? (def.preferredRow === 'FRONT' ? 'BACK' : 'FRONT') : def.preferredRow;
    if (slot >= GameConfig.run.formationSlotsPerRow) slot = this.enemySide.filter((c) => c.row === row).length % GameConfig.run.formationSlotsPerRow;

    const multiplier = encounterMultiplier(this.setup.floor, 'SUMMON', this.setup.ascensionLevel);
    const combatant = new Combatant({
      id: `${def.id}_summon`,
      name: def.name,
      side: 'ENEMY',
      kind: 'SUMMON',
      defId: def.id,
      row,
      slot,
      baseStats: scaleEnemyStats(def.baseStats, multiplier),
      startingHP: scaleEnemyStats(def.baseStats, multiplier).maxHP,
      ...(def.activeSkill ? { skill: def.activeSkill } : {}),
      art: def.art,
    });
    const pos = slotPosition('ENEMY', row, slot);
    combatant.placeAt(pos.x, pos.y);
    this.combatants.push(combatant);
    this.enemySide.push(combatant);
    this.targetingRules.set(combatant.id, def.targeting);
    if (def.activeSkill) this.skillCache.set(combatant.id, def.activeSkill);
    combatant.refreshStats(this.conditionContext());
    this.log.push({ t: this.time, type: 'INFO', targetId: combatant.id, text: `${def.name} joins the fight` });
    return combatant;
  }

  private checkOutcome(): void {
    if (this.outcome !== 'ONGOING') return;
    const playersAlive = this.playerSide.some((c) => c.alive);
    const enemiesAlive = this.enemySide.some((c) => c.alive);
    if (!enemiesAlive) this.finish('VICTORY');
    else if (!playersAlive) this.finish('DEFEAT');
    else if (this.time >= GameConfig.combat.maxBattleSeconds) this.finish('DEFEAT');
  }

  private finish(outcome: 'VICTORY' | 'DEFEAT'): void {
    this.outcome = outcome;
    this.emit({ trigger: 'ON_BATTLE_END' });
    this.log.push({ t: this.time, type: 'INFO', text: outcome });
  }

  result(): BattleResult {
    return {
      outcome: this.outcome === 'VICTORY' ? 'VICTORY' : 'DEFEAT',
      durationSeconds: this.time,
      armies: this.playerSide.map((c) => ({
        armyId: c.armyId!,
        heroId: c.defId,
        hpRatio: c.alive ? Math.max(0, Math.min(1, c.currentHP / c.stats.maxHP)) : 0,
        alive: c.alive,
        damageDealt: c.damageDealt,
        damageTaken: c.damageTaken,
        healingDone: c.healingDone,
        kills: c.kills,
        skillsCast: c.skillsCast,
      })),
      enemiesDefeated: this.enemySide.filter((c) => !c.alive && c.kind !== 'SUMMON').length,
      runEffects: this.runEffects.slice(),
    };
  }

  /** Snapshot used by the renderer. */
  snapshot(): Combatant[] {
    return this.combatants;
  }

  takeBanner(): string | null {
    const banner = this.pendingBanner;
    this.pendingBanner = null;
    return banner;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Enemy stat scaling.
 *
 * HP and damage scale with the floor multiplier while defence grows on a
 * softer curve - otherwise late floors turn into unreadable HP sponges.
 */
export function scaleEnemyStats(base: CombatStats, multiplier: number): CombatStats {
  const s = GameConfig.scaling;
  return {
    ...base,
    maxHP: base.maxHP * multiplier * s.enemyHPFactor,
    attack: base.attack * multiplier * s.enemyAttackFactor,
    skillPower: base.skillPower * multiplier * s.enemyAttackFactor,
    defense: base.defense * Math.pow(Math.max(1, multiplier), s.enemyDefenseExponent),
  };
}

/** Mastery tiers tune a hero's own active skill through three generic flags. */
export function tuneSkill(caster: Combatant, skill: SkillDefinition): SkillDefinition {
  const valueBonus = caster.flags.skillValueBonus ?? 0;
  const targetBonus = caster.flags.skillTargetBonus ?? 0;
  const durationBonus = caster.flags.skillDurationBonus ?? 0;
  if (valueBonus === 0 && targetBonus === 0 && durationBonus === 0) return skill;
  return {
    ...skill,
    effects: skill.effects.map((effect) => {
      const next: EffectDefinition = { ...effect };
      if (next.value !== undefined) next.value = next.value * (1 + valueBonus);
      if (next.duration !== undefined) next.duration = next.duration + durationBonus;
      if (targetBonus > 0 && next.target?.count !== undefined) {
        next.target = { ...next.target, count: next.target.count + targetBonus };
      }
      return next;
    }),
  };
}

function scaleEffects(effects: EffectDefinition[], factor: number): EffectDefinition[] {
  return effects.map((effect) => ({
    ...effect,
    ...(effect.value !== undefined ? { value: effect.value * factor } : {}),
  }));
}
