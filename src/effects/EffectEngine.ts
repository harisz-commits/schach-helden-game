import type { EffectDefinition, Side } from '../core/types';
import { Combatant, ConditionContext, evaluateConditions } from '../combat/Combatant';
import { resolveTargets } from '../combat/TargetingSystem';
import type { EffectHost, PendingRunEffect, RegisteredEffect, TriggerEvent } from './EffectTypes';
import { TriggerSystem } from './TriggerSystem';

const RUN_LEVEL_EFFECTS = new Set(['GRANT_GOLD', 'ADD_RELIC', 'ADD_BLESSING', 'REVEAL_TILE', 'GRANT_ARMY_SLOT']);

/**
 * Interprets EffectDefinitions.
 *
 * Nothing in here knows about individual blessings, heroes or relics - it only
 * knows effect types. That is what keeps "add a blessing" a data-only change.
 */
export class EffectEngine {
  constructor(
    private readonly host: EffectHost,
    readonly triggers: TriggerSystem,
  ) {}

  /** Dispatches a trigger to every effect listening for it. */
  emit(event: TriggerEvent): void {
    const listeners = this.triggers.listeners(event.trigger);
    if (listeners.length === 0) return;
    for (const entry of listeners) {
      this.tryApply(entry, event);
    }
  }

  private conditionContext(event: TriggerEvent): ConditionContext {
    return {
      time: this.host.time,
      livingAllies: (side: Side) => this.host.livingCount(side),
      eventTarget: event.target ?? undefined,
      ...(event.isCrit !== undefined ? { isCrit: event.isCrit } : {}),
      blessingCount: this.host.blessingCount,
    };
  }

  /** Picks the combatant an effect acts "from". */
  private resolveSelf(entry: RegisteredEffect, event: TriggerEvent): Combatant | null {
    if (entry.ownerId) {
      const owner = this.host
        .alliesOf(entry.ownerSide)
        .concat(this.host.enemiesOf(entry.ownerSide))
        .find((c) => c.id === entry.ownerId);
      return owner ?? null;
    }
    // Team-wide sources (blessings) act from whichever of their units is involved.
    if (event.source && event.source.side === entry.ownerSide) return event.source;
    if (event.target && event.target.side === entry.ownerSide) return event.target;
    const allies = this.host.alliesOf(entry.ownerSide);
    return allies.find((c) => c.alive) ?? allies[0] ?? null;
  }

  private tryApply(entry: RegisteredEffect, event: TriggerEvent): void {
    const effect = entry.effect;

    // Team-wide triggers bound to an actor must actually involve that actor.
    if (entry.ownerId && event.source && effect.trigger && effect.trigger !== 'ON_BATTLE_START') {
      const actorRelevant =
        event.source.id === entry.ownerId || event.target?.id === entry.ownerId;
      if (!actorRelevant) return;
    }

    const self = this.resolveSelf(entry, event);
    if (!self) return;

    const ctx = this.conditionContext(event);
    if (effect.conditions && !evaluateConditions(effect.conditions, self, ctx)) return;

    if (effect.everyNth && effect.everyNth > 1) {
      const actorId = event.source?.id ?? self.id;
      const count = this.triggers.bump(entry.key, actorId);
      if (count % effect.everyNth !== 0) return;
    }

    if (effect.oncePer) {
      const limitKey = `${entry.key}|${effect.oncePer}`;
      if (this.triggers.isConsumed(limitKey)) return;
    }

    if (effect.chance !== undefined && this.host.rng.next() >= effect.chance) return;

    const applied = this.applyEffect(effect, entry, self, event, ctx);

    if (applied && effect.oncePer) {
      this.triggers.consume(`${entry.key}|${effect.oncePer}`);
    }
  }

  /** Applies one effect. Returns false when it resolved to nothing. */
  applyEffect(
    effect: EffectDefinition,
    entry: RegisteredEffect,
    self: Combatant,
    event: TriggerEvent,
    _ctx: ConditionContext,
    effectivenessOverride = 1,
  ): boolean {
    if (RUN_LEVEL_EFFECTS.has(effect.type)) {
      const payload: PendingRunEffect = {
        type: effect.type as PendingRunEffect['type'],
        value: (effect.value ?? 1) * entry.stacks,
        ...(effect.meta ? { meta: effect.meta } : {}),
      };
      this.host.queueRunEffect(payload);
      return true;
    }

    const targets = resolveTargets(effect.target, {
      self,
      allies: this.host.alliesOf(self.side),
      enemies: this.host.enemiesOf(self.side),
      currentTarget: this.host.currentTargetOf(self),
      eventTarget: event.target ?? null,
      eventSource: event.source ?? null,
    });

    if (targets.length === 0) return false;

    const stacks = entry.stacks;
    const value = (effect.value ?? 0) * effectivenessOverride;
    const expiresAt = effect.duration !== undefined ? this.host.time + this.debuffAdjusted(effect, targets[0]!) : undefined;
    const sourceKey = entry.key;

    switch (effect.type) {
      case 'MODIFY_STAT': {
        if (!effect.stat) return false;
        // "+5% per 5 blessings" style scaling.
        const perBlessings = Number(effect.meta?.perBlessings ?? 0);
        const scale = perBlessings > 0 ? Math.floor(this.host.blessingCount / perBlessings) : 1;
        if (scale <= 0) return false;
        for (const target of targets) {
          target.addModifier({
            id: `${sourceKey}:${target.id}`,
            stat: effect.stat,
            mode: effect.mode ?? 'PERCENT',
            value: value * stacks * scale,
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(effect.conditions ? { conditions: effect.conditions } : {}),
            sourceKey,
            stacks: 1,
            maxStacks: Number(effect.meta?.maxStacks ?? 1),
            ...(effect.meta?.debuff === true ? { debuff: true } : {}),
          });
          if (effect.stat === 'maxHP' && value > 0) {
            // Growing Max HP should hand the army the extra HP too.
            target.currentHP += target.baseStats.maxHP * value * stacks * scale;
          }
        }
        return true;
      }

      case 'HEAL': {
        for (const target of targets) {
          const amount = this.magnitudeValue(effect, self, target) * stacks * effectivenessOverride;
          if (effect.meta?.perSecond === true) {
            target.hots.push({ perSecond: amount, remaining: Infinity, sourceId: sourceKey, permanent: true });
          } else if (effect.duration) {
            target.hots.push({ perSecond: amount / effect.duration, remaining: effect.duration, sourceId: sourceKey });
          } else {
            this.host.healTarget(self, target, amount);
          }
        }
        return true;
      }

      case 'SHIELD': {
        for (const target of targets) {
          const amount = this.magnitudeValue(effect, self, target) * stacks * effectivenessOverride;
          this.host.shieldTarget(target, amount, effect.duration);
        }
        return true;
      }

      case 'ENERGY': {
        const cap = Number(effect.meta?.capPerCast ?? 0);
        for (const target of targets) {
          let amount = value * stacks;
          if (cap > 0) {
            const used = target.counters.energyThisCast ?? 0;
            amount = Math.min(amount, Math.max(0, cap - used));
            target.counters.energyThisCast = used + amount;
            if (amount <= 0) continue;
          }
          target.addEnergy(amount);
        }
        return true;
      }

      case 'DAMAGE': {
        for (const target of targets) {
          this.host.dealEffectDamage(self, target, effect.magnitude ?? 'ATTACK', value * stacks, {
            isSkill: true,
            ...(effect.meta ? { meta: effect.meta } : {}),
          });
        }
        return true;
      }

      case 'DAMAGE_REDUCTION': {
        for (const target of targets) {
          target.damageReductions.push({
            value: value * stacks,
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(effect.conditions ? { conditions: effect.conditions } : {}),
            sourceKey,
          });
        }
        return true;
      }

      case 'REFLECT': {
        for (const target of targets) {
          target.reflects.push({ value: value * stacks, ...(expiresAt !== undefined ? { expiresAt } : {}), sourceKey });
        }
        return true;
      }

      case 'LIFESTEAL': {
        for (const target of targets) {
          target.lifesteals.push({ value: value * stacks, ...(expiresAt !== undefined ? { expiresAt } : {}), sourceKey });
        }
        return true;
      }

      case 'HEAL_RECEIVED_MOD': {
        for (const target of targets) {
          target.healReceivedMods.push({
            value: value * stacks,
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            sourceKey,
            debuff: value < 0,
          });
        }
        return true;
      }

      case 'DAMAGE_AMP': {
        for (const target of targets) {
          target.damageAmps.push({
            value: value * stacks,
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(effect.conditions ? { conditions: effect.conditions } : {}),
            ...(effect.meta ? { meta: effect.meta } : {}),
            sourceKey,
          });
        }
        return true;
      }

      case 'DAMAGE_TAKEN_AMP': {
        for (const target of targets) {
          target.damageTakenAmps.push({
            value: value * stacks,
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            sourceKey,
            debuff: value > 0,
          });
          if (effect.duration) target.markedUntil = Math.max(target.markedUntil, this.host.time + effect.duration);
        }
        return true;
      }

      case 'EMPOWER_NEXT_ATTACK': {
        for (const target of targets) target.empowerNextAttack = value * stacks;
        return true;
      }

      case 'REVIVE': {
        let any = false;
        for (const target of targets) {
          if (this.host.reviveTarget(target, value)) any = true;
        }
        return any;
      }

      case 'CLEANSE': {
        let any = false;
        const limit = Math.max(1, Math.round(value || 1));
        for (const target of targets) {
          for (let i = 0; i < limit; i++) {
            if (target.cleanse()) any = true;
            else break;
          }
        }
        return any;
      }

      case 'SURVIVE_LETHAL': {
        for (const target of targets) this.host.grantSurviveLethal(target, value, sourceKey);
        return true;
      }

      case 'REPEAT_SKILL': {
        const caster = event.source ?? self;
        this.host.repeatSkill(caster, value);
        return true;
      }

      case 'RUN_FLAG': {
        const flag = effect.meta?.flag;
        if (typeof flag === 'string') {
          const amount = Number(effect.meta?.value ?? effect.value ?? 1) * stacks;
          for (const target of targets) {
            target.flags[flag] = (target.flags[flag] ?? 0) + amount;
          }
          return true;
        }
        if (effect.meta?.summon) {
          this.host.queueRunEffect({ type: 'RUN_FLAG', value: 1, meta: effect.meta });
          return true;
        }
        return false;
      }

      default:
        return false;
    }
  }

  /** Iron Mind and similar effects shorten hostile durations. */
  private debuffAdjusted(effect: EffectDefinition, target: Combatant): number {
    const duration = effect.duration ?? 0;
    const isDebuff = effect.meta?.debuff === true || (effect.type === 'DAMAGE_TAKEN_AMP' && (effect.value ?? 0) > 0);
    if (!isDebuff) return duration;
    const mod = target.flags.debuffDuration ?? 0;
    return Math.max(0.5, duration * (1 + mod));
  }

  private magnitudeValue(effect: EffectDefinition, self: Combatant, target: Combatant): number {
    const value = effect.value ?? 0;
    switch (effect.magnitude) {
      case 'MAX_HP':
        return target.stats.maxHP * value;
      case 'CURRENT_HP':
        return target.currentHP * value;
      case 'MISSING_HP':
        return Math.max(0, target.stats.maxHP - target.currentHP) * value;
      case 'SKILL_POWER':
        return self.stats.skillPower * value;
      case 'ATTACK':
        return self.stats.attack * value;
      case 'FLAT':
      default:
        return value;
    }
  }
}
