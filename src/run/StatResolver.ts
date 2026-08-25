import type { ArmyRunState, CombatStats, RunStatModifier, StatKey } from '../core/types';
import { RATIO_STATS, STAT_KEYS } from '../core/types';
import { getHero } from '../data/heroes';

/**
 * Resolves an army's run-level stats.
 *
 * Run level = hero base + mastery stat rewards + run-wide modifiers (events)
 * + per-floor buffs (War Camp) + lieutenant contribution.
 *
 * Blessings are deliberately NOT resolved here: they are registered with the
 * combat trigger system so that conditional ones ("while five armies live")
 * work, and so the map UI never has to guess at conditional values. Persistent
 * health is stored as a ratio, so a mid-run Max HP change stays consistent.
 */
export function resolveArmyStats(army: ArmyRunState, masteryTier: number, runModifiers: RunStatModifier[]): CombatStats {
  const hero = getHero(army.heroId);
  const base: CombatStats = { ...hero.baseStats };

  const percent: Partial<Record<StatKey, number>> = {};
  const flat: Partial<Record<StatKey, number>> = {};

  const push = (mod: RunStatModifier) => {
    if (mod.mode === 'PERCENT') percent[mod.stat] = (percent[mod.stat] ?? 0) + mod.value;
    else flat[mod.stat] = (flat[mod.stat] ?? 0) + mod.value;
  };

  // Mastery tiers that grant plain stat rewards apply outside combat too, so
  // the collection screen and the HP bars show the real numbers.
  for (const tier of hero.mastery) {
    if (tier.tier > masteryTier) continue;
    for (const effect of tier.effects) {
      if (effect.type !== 'MODIFY_STAT' || !effect.stat) continue;
      if (effect.trigger && effect.trigger !== 'ON_BATTLE_START') continue;
      if (effect.conditions && effect.conditions.length > 0) continue;
      if (effect.target && effect.target.scope !== 'SELF') continue;
      push({ stat: effect.stat, mode: effect.mode ?? 'PERCENT', value: effect.value ?? 0, sourceId: `mastery${tier.tier}` });
    }
  }

  // Lieutenants add half of their own base stat advantage in Attack and Max HP.
  if (army.lieutenantId) {
    const lieutenant = getHero(army.lieutenantId);
    flat.attack = (flat.attack ?? 0) + lieutenant.baseStats.attack * 0.15;
    flat.maxHP = (flat.maxHP ?? 0) + lieutenant.baseStats.maxHP * 0.15;
    flat.defense = (flat.defense ?? 0) + lieutenant.baseStats.defense * 0.15;
  }

  for (const mod of runModifiers) push(mod);
  for (const mod of army.floorModifiers) push(mod);

  const out: CombatStats = { ...base };
  for (const key of STAT_KEYS) {
    const value = base[key] * (1 + (percent[key] ?? 0)) + (flat[key] ?? 0);
    out[key] = RATIO_STATS.includes(key) ? Math.max(0, Math.min(1, value)) : Math.max(0, value);
  }
  return out;
}

/** Absolute current HP derived from the persistent ratio. */
export function armyCurrentHP(army: ArmyRunState, stats: CombatStats): number {
  return Math.max(0, Math.round(stats.maxHP * army.hpRatio));
}

/** Applies a heal expressed as a fraction of Max HP. Returns the ratio gained. */
export function healArmy(army: ArmyRunState, fractionOfMax: number): number {
  if (!army.alive) return 0;
  const before = army.hpRatio;
  army.hpRatio = Math.min(1, army.hpRatio + fractionOfMax);
  return army.hpRatio - before;
}

/** Applies damage expressed as a fraction of current or max HP. */
export function damageArmy(army: ArmyRunState, fraction: number, of: 'CURRENT' | 'MAX' = 'CURRENT'): void {
  if (!army.alive) return;
  const loss = of === 'CURRENT' ? army.hpRatio * fraction : fraction;
  army.hpRatio = Math.max(0, army.hpRatio - loss);
  if (army.hpRatio <= 0) {
    army.hpRatio = 0;
    army.alive = false;
  }
}
