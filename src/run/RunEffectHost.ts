import type { ArmyRunState, PlayerProfile, RunState, Side } from '../core/types';
import { RNG } from '../core/RNG';
import { Combatant, resetCombatantUids } from '../combat/Combatant';
import { slotPosition } from '../combat/Formation';
import { EffectEngine } from '../effects/EffectEngine';
import { TriggerSystem } from '../effects/TriggerSystem';
import type { EffectHost, PendingRunEffect, TriggerEvent } from '../effects/EffectTypes';
import { getBlessing } from '../data/blessings';
import { getHero } from '../data/heroes';
import { resolveArmyStats } from './StatResolver';

/**
 * Runs the effect system outside of combat.
 *
 * Triggers such as ON_BATTLE_WON, ON_GUARDIAN_KILL and ON_TREASURE_OPEN fire
 * on the map, not in a battle, but they use the exact same EffectDefinitions.
 * To make that work the armies are mirrored as lightweight Combatants, the
 * effects resolve against those, and the results are written back as HP ratios.
 */
export class RunEffectHost implements EffectHost {
  readonly time = 0;
  rng: RNG;
  triggers = new TriggerSystem();
  engine: EffectEngine;

  private mirrors = new Map<string, Combatant>();
  private pending: PendingRunEffect[] = [];

  constructor(
    private run: RunState,
    private profile: PlayerProfile,
  ) {
    this.rng = RNG.fromState(run.rngState);
    this.engine = new EffectEngine(this, this.triggers);
    this.rebuild();
  }

  get blessingCount(): number {
    return this.run.blessings.reduce((sum, b) => sum + b.stacks, 0);
  }

  /** Rebuilds the mirrors and re-registers every source. Cheap and rare. */
  rebuild(): void {
    resetCombatantUids();
    this.mirrors.clear();
    this.triggers = new TriggerSystem();
    this.engine = new EffectEngine(this, this.triggers);

    for (const army of this.run.armies) {
      const hero = getHero(army.heroId);
      const masteryTier = this.profile.heroMastery[army.heroId]?.tier ?? 1;
      const stats = resolveArmyStats(army, masteryTier, this.run.runModifiers);
      const mirror = new Combatant({
        id: army.id,
        name: hero.name,
        side: 'PLAYER',
        kind: 'HERO',
        defId: hero.id,
        row: army.row,
        slot: army.slot,
        baseStats: stats,
        startingHP: Math.max(0, stats.maxHP * army.hpRatio),
        heroClass: hero.heroClass,
        armyId: army.id,
        art: hero.art,
      });
      const pos = slotPosition('PLAYER', army.row, army.slot);
      mirror.placeAt(pos.x, pos.y);
      mirror.alive = army.alive;
      mirror.currentHP = Math.max(army.alive ? 1 : 0, stats.maxHP * army.hpRatio);
      mirror.refreshStats({ time: 0, livingAllies: () => this.livingCount('PLAYER') });
      this.mirrors.set(army.id, mirror);

      for (const passive of hero.passiveSkills) {
        this.triggers.registerMany(passive.effects, {
          keyPrefix: `runhero:${army.id}:${passive.id}`,
          ownerSide: 'PLAYER',
          ownerId: mirror.id,
          label: passive.name,
        });
      }
      for (const tier of hero.mastery) {
        if (tier.tier > masteryTier || tier.effects.length === 0) continue;
        this.triggers.registerMany(tier.effects, {
          keyPrefix: `runmastery:${army.id}:${tier.tier}`,
          ownerSide: 'PLAYER',
          ownerId: mirror.id,
          label: `${hero.name} Mastery ${tier.tier}`,
        });
      }
    }

    for (const owned of this.run.blessings) {
      const def = getBlessing(owned.id);
      this.triggers.registerMany(def.effects, {
        keyPrefix: `runblessing:${def.id}`,
        ownerSide: 'PLAYER',
        stacks: owned.stacks,
        label: def.name,
      });
    }

    this.triggers.restore(this.run.flags.__consumed ? [] : []);
  }

  /** Refreshes mirrors from the run state before a trigger fires. */
  sync(): void {
    for (const army of this.run.armies) {
      const mirror = this.mirrors.get(army.id);
      if (!mirror) continue;
      mirror.alive = army.alive;
      mirror.currentHP = Math.max(0, mirror.stats.maxHP * army.hpRatio);
    }
  }

  /** Writes mirror HP back into the run as ratios. */
  commit(): void {
    for (const army of this.run.armies) {
      const mirror = this.mirrors.get(army.id);
      if (!mirror) continue;
      army.hpRatio = mirror.stats.maxHP > 0 ? Math.max(0, Math.min(1, mirror.currentHP / mirror.stats.maxHP)) : 0;
      army.alive = mirror.alive && army.hpRatio > 0;
      if (!army.alive) army.hpRatio = 0;
    }
    this.run.rngState = this.rng.getState();
  }

  /** Fires a run-level trigger and returns any queued run consequences. */
  emit(event: TriggerEvent): PendingRunEffect[] {
    this.sync();
    this.pending = [];
    this.engine.emit(event);
    this.commit();
    return this.pending;
  }

  mirrorOf(armyId: string): Combatant | undefined {
    return this.mirrors.get(armyId);
  }

  armyOf(mirrorId: string): ArmyRunState | undefined {
    for (const [armyId, mirror] of this.mirrors) {
      if (mirror.id === mirrorId) return this.run.armies.find((a) => a.id === armyId);
    }
    return undefined;
  }

  /* ------------------------- EffectHost ------------------------- */

  alliesOf(side: Side): Combatant[] {
    return side === 'PLAYER' ? Array.from(this.mirrors.values()) : [];
  }

  enemiesOf(side: Side): Combatant[] {
    return side === 'PLAYER' ? [] : Array.from(this.mirrors.values());
  }

  livingCount(side: Side): number {
    return this.alliesOf(side).filter((c) => c.alive).length;
  }

  currentTargetOf(): Combatant | null {
    return null;
  }

  dealEffectDamage(): void {
    /* out-of-combat effects never deal combat damage */
  }

  healTarget(_source: Combatant | null, target: Combatant, amount: number): void {
    if (!target.alive || amount <= 0) return;
    target.currentHP = Math.min(target.stats.maxHP, target.currentHP + amount);
  }

  shieldTarget(): void {
    /* shields only exist inside a battle */
  }

  reviveTarget(target: Combatant, hpPercent: number): boolean {
    if (target.alive) return false;
    target.alive = true;
    target.currentHP = Math.max(1, target.stats.maxHP * hpPercent);
    return true;
  }

  grantSurviveLethal(): void {
    /* battle-only */
  }

  repeatSkill(): void {
    /* battle-only */
  }

  queueRunEffect(effect: PendingRunEffect): void {
    this.pending.push(effect);
  }

  logEvent(): void {
    /* run-level effects report through RunManager messages instead */
  }
}
