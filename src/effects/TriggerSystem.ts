import type { EffectDefinition, Side, TriggerType } from '../core/types';
import type { RegisteredEffect } from './EffectTypes';

const DEFAULT_TRIGGER: TriggerType = 'ON_BATTLE_START';

/**
 * Registry + bookkeeping for the trigger/effect system.
 *
 * Keeps three kinds of state:
 *  - which effects listen to which trigger
 *  - per-effect occurrence counters (drives `everyNth`)
 *  - which `oncePer` effects have already fired
 */
export class TriggerSystem {
  private byTrigger = new Map<TriggerType, RegisteredEffect[]>();
  private counters = new Map<string, number>();
  private consumed = new Set<string>();

  register(entry: RegisteredEffect): void {
    const trigger = entry.effect.trigger ?? DEFAULT_TRIGGER;
    let list = this.byTrigger.get(trigger);
    if (!list) {
      list = [];
      this.byTrigger.set(trigger, list);
    }
    list.push(entry);
  }

  registerMany(
    effects: EffectDefinition[],
    options: { keyPrefix: string; ownerSide: Side; ownerId?: string; stacks?: number; label: string },
  ): void {
    effects.forEach((effect, index) => {
      this.register({
        key: `${options.keyPrefix}#${index}`,
        effect,
        ownerSide: options.ownerSide,
        ...(options.ownerId ? { ownerId: options.ownerId } : {}),
        stacks: options.stacks ?? 1,
        label: options.label,
      });
    });
  }

  listeners(trigger: TriggerType): RegisteredEffect[] {
    return this.byTrigger.get(trigger) ?? [];
  }

  /** Increments and returns the occurrence count for an effect + actor pair. */
  bump(key: string, actorId: string): number {
    const composite = `${key}|${actorId}`;
    const next = (this.counters.get(composite) ?? 0) + 1;
    this.counters.set(composite, next);
    return next;
  }

  isConsumed(key: string): boolean {
    return this.consumed.has(key);
  }

  consume(key: string): void {
    this.consumed.add(key);
  }

  /** Clears BATTLE-scoped limits between fights. */
  resetBattleScope(): void {
    for (const key of Array.from(this.consumed)) {
      if (key.endsWith('|BATTLE')) this.consumed.delete(key);
    }
    this.counters.clear();
  }

  /** Clears FLOOR-scoped limits (Phoenix Oath) when a new floor begins. */
  resetFloorScope(): void {
    for (const key of Array.from(this.consumed)) {
      if (key.endsWith('|FLOOR')) this.consumed.delete(key);
    }
  }

  /** Serialises the once-per-run limits so a reload cannot re-trigger them. */
  serialize(): string[] {
    return Array.from(this.consumed).filter((key) => key.endsWith('|RUN'));
  }

  restore(keys: string[]): void {
    for (const key of keys) this.consumed.add(key);
  }
}
