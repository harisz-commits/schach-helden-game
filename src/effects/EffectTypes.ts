import type { EffectDefinition, Side, TriggerType } from '../core/types';
import type { Combatant } from '../combat/Combatant';
import type { RNG } from '../core/RNG';

/** One effect registered with the trigger system, plus where it came from. */
export interface RegisteredEffect {
  /** Unique per (source, effect index) - counters and once-per limits key off it. */
  key: string;
  effect: EffectDefinition;
  ownerSide: Side;
  /** Bound to a specific unit (hero passive, elite modifier) or team-wide (blessing). */
  ownerId?: string;
  stacks: number;
  /** Human readable origin, used by the debug panel and combat log. */
  label: string;
}

export interface TriggerEvent {
  trigger: TriggerType;
  source?: Combatant | null;
  target?: Combatant | null;
  amount?: number;
  isCrit?: boolean;
  isSkill?: boolean;
  skillId?: string;
}

/** Run-level consequences produced by effects fired during combat. */
export interface PendingRunEffect {
  type: 'GRANT_GOLD' | 'ADD_RELIC' | 'ADD_BLESSING' | 'REVEAL_TILE' | 'GRANT_ARMY_SLOT' | 'RUN_FLAG';
  value: number;
  meta?: Record<string, number | string | boolean>;
}

/**
 * Everything the effect engine needs from whatever is hosting it.
 * CombatEngine implements this for battles; RunEffectHost implements it for
 * out-of-combat resolution (post-battle heals, relic use, event outcomes).
 */
export interface EffectHost {
  readonly time: number;
  readonly rng: RNG;
  readonly blessingCount: number;

  alliesOf(side: Side): Combatant[];
  enemiesOf(side: Side): Combatant[];
  livingCount(side: Side): number;

  dealEffectDamage(
    attacker: Combatant,
    defender: Combatant,
    magnitude: EffectDefinition['magnitude'],
    multiplier: number,
    options: { isSkill: boolean; meta?: Record<string, number | string | boolean> },
  ): void;

  healTarget(source: Combatant | null, target: Combatant, amount: number, durationSeconds?: number): void;
  shieldTarget(target: Combatant, amount: number, durationSeconds?: number): void;
  reviveTarget(target: Combatant, hpPercent: number): boolean;
  grantSurviveLethal(target: Combatant, shieldPercent: number, sourceKey: string): void;
  repeatSkill(source: Combatant, effectiveness: number): void;
  queueRunEffect(effect: PendingRunEffect): void;
  /** Current basic-attack target of a unit, used by CURRENT_TARGET selectors. */
  currentTargetOf(combatant: Combatant): Combatant | null;
  logEvent(entry: { type: string; sourceId?: string; targetId?: string; amount?: number; text?: string }): void;
}
