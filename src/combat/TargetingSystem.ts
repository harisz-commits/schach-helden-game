import type { Row, TargetSelector, TargetingRule } from '../core/types';
import { Combatant } from './Combatant';

/** Stable ordering so the simulation stays deterministic across runs. */
function stable(list: Combatant[]): Combatant[] {
  return list.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Picks a basic-attack target for a unit according to its targeting rule. */
export function acquireTarget(self: Combatant, enemies: Combatant[]): Combatant | null {
  const living = stable(enemies.filter((e) => e.alive));
  if (living.length === 0) return null;
  const rule: TargetingRule = self.isPlayer ? 'NEAREST' : ((self as unknown as { targeting?: TargetingRule }).targeting ?? 'NEAREST');
  return pickByRule(self, living, rule);
}

export function pickByRule(self: Combatant, living: Combatant[], rule: TargetingRule): Combatant | null {
  if (living.length === 0) return null;
  switch (rule) {
    case 'LOWEST_HP_PERCENT':
      return minBy(living, (c) => c.hpPercent);
    case 'LOWEST_HP_ABSOLUTE':
      return minBy(living, (c) => c.currentHP);
    case 'HIGHEST_ATTACK':
      return maxBy(living, (c) => c.stats.attack);
    case 'BACKLINE_FIRST': {
      const back = living.filter((c) => c.row === 'BACK');
      return back.length > 0 ? minBy(back, (c) => c.currentHP) : minBy(living, (c) => self.distanceTo(c));
    }
    case 'FRONTLINE_FIRST': {
      const front = living.filter((c) => c.row === 'FRONT');
      return front.length > 0 ? minBy(front, (c) => self.distanceTo(c)) : minBy(living, (c) => self.distanceTo(c));
    }
    case 'RANDOM':
      // Deterministic "random": rotate by the unit's own attack count.
      return living[(self.counters.attacks ?? 0) % living.length]!;
    case 'NEAREST':
    default:
      return minBy(living, (c) => self.distanceTo(c));
  }
}

/**
 * Resolves an effect's target selector into a concrete combatant list.
 * This is what makes every blessing / skill / passive purely data-driven.
 */
export function resolveTargets(
  selector: TargetSelector | undefined,
  context: {
    self: Combatant;
    allies: Combatant[];
    enemies: Combatant[];
    currentTarget?: Combatant | null;
    eventTarget?: Combatant | null;
    eventSource?: Combatant | null;
  },
): Combatant[] {
  if (!selector) return [context.self];

  let pool: Combatant[];
  switch (selector.scope) {
    case 'SELF':
      pool = [context.self];
      break;
    case 'ALLIES':
      pool = context.allies;
      break;
    case 'ENEMIES':
      pool = context.enemies;
      break;
    case 'CURRENT_TARGET':
      pool = context.currentTarget ? [context.currentTarget] : [];
      break;
    case 'EVENT_TARGET':
      pool = context.eventTarget ? [context.eventTarget] : [];
      break;
    case 'EVENT_SOURCE':
      pool = context.eventSource ? [context.eventSource] : [];
      break;
    default:
      pool = [context.self];
  }

  let filtered = pool.filter((c) => (selector.includeDead ? true : c.alive));
  if (selector.row) filtered = filtered.filter((c) => c.row === selector.row);
  if (selector.heroClass) {
    filtered = filtered.filter((c) => c.heroClass === selector.heroClass);
  }
  if (selector.kind) filtered = filtered.filter((c) => c.kind === selector.kind);
  if (selector.frontalOnly) {
    // Only units on the same side of the lane the caster is facing.
    const forward = context.self.isPlayer ? 1 : -1;
    filtered = filtered.filter((c) => (c.x - context.self.x) * forward >= -1);
  }

  // Row filters that eliminate everything fall back to the whole pool, so a
  // "hit the back line" skill still does something when the back line is empty.
  if (filtered.length === 0 && (selector.row || selector.heroClass)) {
    filtered = pool.filter((c) => (selector.includeDead ? true : c.alive));
  }

  const sorted = sortTargets(filtered, selector, context.self);
  if (selector.count === undefined) return sorted;
  return sorted.slice(0, Math.max(0, selector.count));
}

function sortTargets(list: Combatant[], selector: TargetSelector, self: Combatant): Combatant[] {
  const items = stable(list);
  switch (selector.sort) {
    case 'LOWEST_HP_PERCENT':
      return items.sort((a, b) => a.hpPercent - b.hpPercent);
    case 'HIGHEST_HP_PERCENT':
      return items.sort((a, b) => b.hpPercent - a.hpPercent);
    case 'LOWEST_HP_ABSOLUTE':
      return items.sort((a, b) => a.currentHP - b.currentHP);
    case 'HIGHEST_ATTACK':
      return items.sort((a, b) => b.stats.attack - a.stats.attack);
    case 'NEAREST':
      return items.sort((a, b) => self.distanceTo(a) - self.distanceTo(b));
    case 'FARTHEST':
      return items.sort((a, b) => self.distanceTo(b) - self.distanceTo(a));
    case 'RANDOM':
      return items.sort((a, b) => hash(a.id + self.id) - hash(b.id + self.id));
    default:
      return items;
  }
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function minBy<T>(list: T[], score: (item: T) => number): T {
  let best = list[0]!;
  let bestScore = score(best);
  for (let i = 1; i < list.length; i++) {
    const s = score(list[i]!);
    if (s < bestScore) {
      best = list[i]!;
      bestScore = s;
    }
  }
  return best;
}

function maxBy<T>(list: T[], score: (item: T) => number): T {
  return minBy(list, (item) => -score(item));
}

export function rowOf(slotIndex: number, perRow: number): Row {
  return slotIndex < perRow ? 'FRONT' : 'BACK';
}
