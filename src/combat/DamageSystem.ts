import type { MagnitudeSource } from '../core/types';
import { GameConfig } from '../core/GameConfig';
import { RNG } from '../core/RNG';
import { Combatant, ConditionContext, evaluateConditions, TimedValue } from './Combatant';

export interface DamageParams {
  attacker: Combatant;
  defender: Combatant;
  magnitude: MagnitudeSource;
  multiplier: number;
  isSkill: boolean;
  guaranteedCrit?: boolean;
  canCrit?: boolean;
  /** Extra outgoing multiplier (empowered attacks, skill echoes). */
  bonusMultiplier?: number;
  /** Skills that scale with the caster's missing HP. */
  missingHPScaling?: number;
  /** Execute style bonus. */
  executeThreshold?: number;
  executeMultiplier?: number;
}

export interface DamageResult {
  amount: number;
  isCrit: boolean;
  /** Pre-mitigation value, used by the combat log for tooltips. */
  raw: number;
}

function magnitudeBase(attacker: Combatant, magnitude: MagnitudeSource): number {
  switch (magnitude) {
    case 'ATTACK':
      return attacker.stats.attack;
    case 'SKILL_POWER':
      return attacker.stats.skillPower;
    case 'MAX_HP':
      return attacker.stats.maxHP;
    case 'CURRENT_HP':
      return attacker.currentHP;
    case 'MISSING_HP':
      return Math.max(0, attacker.stats.maxHP - attacker.currentHP);
    case 'FLAT':
    default:
      return 1;
  }
}

/** Does an outgoing damage amp apply against this particular target? */
function ampApplies(entry: TimedValue, defender: Combatant, time: number): boolean {
  const meta = entry.meta ?? {};
  if (meta.targetHPBelow !== undefined && defender.hpPercent >= Number(meta.targetHPBelow)) return false;
  if (meta.targetRow !== undefined && defender.row !== meta.targetRow) return false;
  if (meta.targetKind !== undefined) {
    const kinds = String(meta.targetKind).split(',');
    if (!kinds.includes(defender.kind)) return false;
  }
  if (meta.targetMarked === true && defender.markedUntil <= time) return false;
  if (meta.missingHPPerTenPercent === true) return true;
  return true;
}

function outgoingAmp(attacker: Combatant, defender: Combatant, ctx: ConditionContext): number {
  let total = 0;
  for (const entry of attacker.damageAmps) {
    if (entry.expiresAt !== undefined && ctx.time >= entry.expiresAt) continue;
    if (entry.conditions && !evaluateConditions(entry.conditions, attacker, ctx)) continue;
    if (!ampApplies(entry, defender, ctx.time)) continue;
    if (entry.meta?.missingHPPerTenPercent === true) {
      const missingTenths = Math.floor((1 - attacker.hpPercent) * 10);
      total += entry.value * missingTenths;
    } else {
      total += entry.value;
    }
  }
  return total;
}

function incomingAmp(defender: Combatant, ctx: ConditionContext): number {
  return defender.sumTimed(defender.damageTakenAmps, ctx);
}

/** Ramp applied late in a fight so nothing can stall forever. */
export function stalemateMultiplier(time: number): number {
  const over = time - GameConfig.combat.stalemateStart;
  if (over <= 0) return 1;
  return 1 + over * GameConfig.combat.stalemateRampPerSecond;
}

/**
 * The single damage formula used by every attack and skill in the game:
 *
 *   attack * abilityMultiplier * variance * crit * offensiveModifiers
 *          * (K / (K + targetDefense)) * (1 - damageReduction)
 */
export function computeDamage(params: DamageParams, rng: RNG, ctx: ConditionContext): DamageResult {
  const { attacker, defender } = params;
  const base = magnitudeBase(attacker, params.magnitude);
  let multiplier = params.multiplier * (params.bonusMultiplier ?? 1);

  if (params.missingHPScaling) {
    multiplier *= 1 + (1 - attacker.hpPercent) * params.missingHPScaling;
  }
  if (params.executeThreshold && defender.hpPercent <= params.executeThreshold) {
    multiplier *= params.executeMultiplier ?? 2;
  }

  const [low, high] = GameConfig.combat.randomVariance;
  const variance = rng.float(low, high);

  const canCrit = params.canCrit !== false;
  const isCrit = params.guaranteedCrit === true || (canCrit && rng.next() < attacker.stats.critChance);
  const critMultiplier = isCrit ? attacker.stats.critDamage : 1;

  const offensive = 1 + outgoingAmp(attacker, defender, { ...ctx, eventTarget: defender });
  const receiving = 1 + incomingAmp(defender, ctx);
  const stalemate = stalemateMultiplier(ctx.time);

  const raw = base * multiplier * variance * critMultiplier * offensive * receiving * stalemate;

  const K = GameConfig.combat.defenseConstant;
  const mitigation = K / (K + Math.max(0, defender.stats.defense));
  const reduction = 1 - defender.totalDamageReduction(ctx);

  const amount = Math.max(1, raw * mitigation * reduction);
  return { amount, isCrit, raw };
}

/** Energy gained by a unit that just took a hit. */
export function energyFromDamage(defender: Combatant, damage: number): number {
  if (defender.stats.maxHP <= 0) return 0;
  const percentLost = (damage / defender.stats.maxHP) * 100;
  return Math.min(GameConfig.combat.energyOnDamageCap, percentLost * GameConfig.combat.energyPerHPPercentLost);
}
