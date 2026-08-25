import type {
  ArmyRunState,
  BlessingRarity,
  EncounterData,
  EventChoice,
  EventDefinition,
  EventOutcome,
  GameMode,
  OwnedBlessing,
  OwnedRelic,
  PendingReward,
  PlayerProfile,
  RelicDefinition,
  RunState,
  TileData,
} from '../core/types';
import { GameConfig, blessingRarityWeights } from '../core/GameConfig';
import { RNG, createRandomSeed } from '../core/RNG';
import { gameEvents } from '../core/EventBus';
import { BLESSINGS, blessingsByRarity, getBlessing } from '../data/blessings';
import { RELICS, getRelic } from '../data/relics';
import { getEvent } from '../data/events';
import { getHero } from '../data/heroes';
import { floorDefinition } from '../data/floors';
import { ascension } from '../data/ascensions';
import { FogSystem } from '../map/FogSystem';
import { MapView } from '../map/MapState';
import { generateMap } from '../map/MapGenerator';
import { generateDuel, generateEncounter } from '../map/EncounterGenerator';
import { autoAssign } from '../combat/Formation';
import type { BattleResult, BattleSetup } from '../combat/CombatEngine';
import { RunEffectHost } from './RunEffectHost';
import { armyCurrentHP, damageArmy, healArmy, resolveArmyStats } from './StatResolver';

export type InteractionResult =
  | { kind: 'BATTLE'; tileId: string; encounter: EncounterData }
  | { kind: 'EVENT'; tileId: string; event: EventDefinition }
  | { kind: 'MERCHANT'; tileId: string }
  | { kind: 'BLESSING'; tileId: string; rarity: BlessingRarity }
  | { kind: 'CHOOSE_ARMY'; tileId: string; purpose: ArmyChoicePurpose }
  | { kind: 'RESOLVED'; messages: string[] }
  | { kind: 'EXIT' }
  | { kind: 'BLOCKED'; reason: string };

export type ArmyChoicePurpose =
  | 'HEALING_FOUNTAIN'
  | 'WAR_CAMP'
  | 'RESURRECTION_SHRINE'
  | 'RECRUITMENT_CAMP'
  | 'RELIC_HEAL'
  | 'RELIC_REVIVE'
  | 'RELIC_BUFF';

export interface ShopItem {
  id: string;
  label: string;
  description: string;
  price: number;
  kind: 'HEAL_ONE' | 'HEAL_ALL' | 'RELIC' | 'BLESSING_REROLL' | 'RANDOM_BLESSING' | 'BUFF';
  relicId?: string;
  sold?: boolean;
}

export interface StartRunOptions {
  heroIds: string[];
  lieutenantIds?: Record<string, string>;
  mode: GameMode;
  ascensionLevel: number;
  seed?: number;
}

export interface EventResolution {
  messages: string[];
  battle?: EncounterData;
  blessingOffer?: BlessingRarity;
  needsArmyChoice?: ArmyChoicePurpose;
}

const REWARD_COUNT = GameConfig.run.rewardChoices;

/**
 * Owns everything that happens between battles: the floor, the map, gold,
 * blessings, relics, events, merchants and floor transitions.
 *
 * Scenes only ever talk to this class - they never mutate RunState directly.
 */
export class RunManager {
  view: MapView;
  fog: FogSystem;
  private effectHost: RunEffectHost;
  private merchantStockCache = new Map<string, ShopItem[]>();
  /** Set while a Smoke Bomb is armed. */
  private pendingSkipBattle = false;

  constructor(
    public run: RunState,
    public profile: PlayerProfile,
    private onChanged: () => void,
  ) {
    if (!run.currentMap) {
      this.generateFloor();
    }
    this.view = new MapView(run.currentMap!.map);
    this.fog = new FogSystem(this.view);
    this.fog.recompute();
    this.effectHost = new RunEffectHost(run, profile);
  }

  /* ---------------------------------------------------------------- */
  /* Creation                                                          */
  /* ---------------------------------------------------------------- */

  static createRun(options: StartRunOptions, profile: PlayerProfile): RunState {
    const seed = options.seed ?? createRandomSeed();
    const placement = autoAssign(
      options.heroIds.map((id) => ({ id, preferredRow: getHero(id).preferredRow })),
    );
    const armies: ArmyRunState[] = options.heroIds.map((heroId) => {
      const slot = placement.get(heroId)!;
      const lieutenantId = options.lieutenantIds?.[heroId];
      return {
        id: `army_${heroId}`,
        heroId,
        ...(lieutenantId ? { lieutenantId } : {}),
        hpRatio: 1,
        alive: true,
        row: slot.row,
        slot: slot.slot,
        floorModifiers: [],
        battleModifiers: [],
      };
    });

    const mastery = profile.kingdomMastery;
    const run: RunState = {
      schemaVersion: GameConfig.saveSchemaVersion,
      seed,
      mode: options.mode,
      floor: 1,
      ascensionLevel: options.ascensionLevel,
      gold: GameConfig.run.startingGold + (mastery.includes('km_gold') ? 25 : 0),
      armies,
      blessings: [],
      relics: [],
      runModifiers: [],
      currentMap: null,
      runStats: {
        enemiesDefeated: 0,
        elitesDefeated: 0,
        guardiansDefeated: 0,
        battlesWon: 0,
        blessingsCollected: 0,
        legendaryBlessings: 0,
        goldCollected: 0,
        treasuresOpened: 0,
        relicsUsed: 0,
        damageDealt: 0,
        damageTaken: 0,
        healingDone: 0,
        healingFountainsUsed: 0,
        armiesLost: 0,
        floorsCleared: 0,
      },
      startedAt: Date.now(),
      elapsedMs: 0,
      flags: {
        rerolls: mastery.includes('km_reroll') ? 1 : 0,
      },
      pendingReward: null,
      rngState: new RNG(seed).getState(),
      maxArmySlots: GameConfig.run.baseArmySlots,
      heroStats: Object.fromEntries(
        options.heroIds.map((id) => [id, { damageDealt: 0, damageAbsorbed: 0, healingDone: 0, kills: 0, skillsCast: 0, battlesWon: 0 }]),
      ),
    };

    if (mastery.includes('km_relic')) {
      const rng = new RNG(seed ^ 0x5bf03635);
      const pool = RELICS.filter((r) => r.rarity === 'COMMON');
      run.relics.push({ id: rng.pick(pool).id, uid: `relic_start` });
    }

    return run;
  }

  /* ---------------------------------------------------------------- */
  /* Accessors                                                         */
  /* ---------------------------------------------------------------- */

  get floor(): number {
    return this.run.floor;
  }

  get gold(): number {
    return this.run.gold;
  }

  get armies(): ArmyRunState[] {
    return this.run.armies;
  }

  get livingArmies(): ArmyRunState[] {
    return this.run.armies.filter((a) => a.alive);
  }

  get guardianDefeated(): boolean {
    return this.run.currentMap?.guardianDefeated ?? false;
  }

  get rerollsLeft(): number {
    return this.run.flags.rerolls ?? 0;
  }

  armyStats(army: ArmyRunState) {
    const tier = this.profile.heroMastery[army.heroId]?.tier ?? 1;
    return resolveArmyStats(army, tier, this.run.runModifiers);
  }

  armyHP(army: ArmyRunState): number {
    return armyCurrentHP(army, this.armyStats(army));
  }

  private rng(label: string): RNG {
    const rng = RNG.fromState(this.run.rngState);
    const child = rng.fork(`${label}:${this.run.floor}`);
    // Advance the run cursor so repeated calls never repeat content.
    rng.next();
    this.run.rngState = rng.getState();
    return child;
  }

  private changed(): void {
    this.onChanged();
  }

  private goldMultiplier(): number {
    let bonus = 0;
    for (const owned of this.run.blessings) {
      const def = getBlessing(owned.id);
      for (const effect of def.effects) {
        if (effect.type === 'RUN_FLAG' && effect.meta?.flag === 'goldMultiplier') {
          bonus += Number(effect.meta.value ?? 0) * owned.stacks;
        }
      }
    }
    return 1 + bonus;
  }

  addGold(amount: number): number {
    const total = Math.round(amount * this.goldMultiplier());
    this.run.gold += total;
    this.run.runStats.goldCollected += total;
    return total;
  }

  /* ---------------------------------------------------------------- */
  /* Floors                                                            */
  /* ---------------------------------------------------------------- */

  private generateFloor(): void {
    const rng = RNG.fromState(this.run.rngState).fork(`floor:${this.run.floor}:${this.run.seed}`);
    const { map } = generateMap(
      {
        floor: this.run.floor,
        ascensionLevel: this.run.ascensionLevel,
        mode: this.run.mode === 'DAILY' ? 'NORMAL' : this.run.mode,
        features: this.profile.unlockedFeatures,
        bonusTreasureOnFirstFloor: this.profile.kingdomMastery.includes('km_treasure'),
      },
      rng,
    );
    this.run.currentMap = { map, defeatedEncounterIds: [], collectedNodeIds: [], guardianDefeated: false };
    this.run.rngState = rng.getState();
  }

  /** Moves to the next floor and generates it. */
  advanceFloor(): void {
    this.run.runStats.floorsCleared += 1;
    this.run.floor += 1;
    // Per-floor buffs and mercenaries expire.
    for (const army of this.run.armies) army.floorModifiers = [];
    this.run.armies = this.run.armies.filter(
      (army) => !army.temporary || (army.expiresAfterFloor ?? 0) >= this.run.floor,
    );
    this.run.flags.guardianHPPenalty = 0;
    this.run.flags.guardianPowerBonus = 0;
    this.run.flags.rerolls = this.rerollsPerFloor();
    this.merchantStockCache.clear();
    this.generateFloor();
    this.view = new MapView(this.run.currentMap!.map);
    this.fog = new FogSystem(this.view);
    this.effectHost.rebuild();
    this.effectHost.triggers.resetFloorScope();
    this.applyRunEffects(this.effectHost.emit({ trigger: 'ON_FLOOR_START' }));
    this.changed();
  }

  private rerollsPerFloor(): number {
    let count = this.profile.kingdomMastery.includes('km_reroll') ? 1 : 0;
    for (const owned of this.run.blessings) {
      for (const effect of getBlessing(owned.id).effects) {
        if (effect.type === 'RUN_FLAG' && effect.meta?.flag === 'rerollsPerFloor') {
          count += Number(effect.meta.value ?? 0) * owned.stacks;
        }
      }
    }
    return count;
  }

  /* ---------------------------------------------------------------- */
  /* Tile interaction                                                  */
  /* ---------------------------------------------------------------- */

  canInteract(tileId: string): boolean {
    const tile = this.view.get(tileId);
    if (!tile) return false;
    if (tile.type === 'EXIT' && !this.guardianDefeated) return false;
    return this.fog.canInteract(tile);
  }

  interact(tileId: string): InteractionResult {
    const tile = this.view.get(tileId);
    if (!tile) return { kind: 'BLOCKED', reason: 'Unknown tile' };
    if (!this.fog.canInteract(tile)) return { kind: 'BLOCKED', reason: 'Out of reach' };

    switch (tile.type) {
      case 'ENEMY':
      case 'ELITE':
      case 'GUARDIAN': {
        const encounter = this.run.currentMap!.map.encounters[tile.encounterId!];
        if (!encounter) return { kind: 'BLOCKED', reason: 'Missing encounter' };
        if (this.pendingSkipBattle && tile.type === 'ENEMY') {
          this.pendingSkipBattle = false;
          this.clearTile(tile);
          this.changed();
          return { kind: 'RESOLVED', messages: ['You slip past the warband unseen.'] };
        }
        return { kind: 'BATTLE', tileId, encounter };
      }

      case 'EVENT': {
        const event = getEvent(tile.eventId!);
        return { kind: 'EVENT', tileId, event };
      }

      case 'MERCHANT':
        return { kind: 'MERCHANT', tileId };

      case 'SHRINE':
      case 'TEMPLE': {
        const rarity = tile.type === 'TEMPLE' ? 'EPIC' : 'RARE';
        return { kind: 'BLESSING', tileId, rarity };
      }

      case 'HEALING_FOUNTAIN':
        return { kind: 'CHOOSE_ARMY', tileId, purpose: 'HEALING_FOUNTAIN' };
      case 'WAR_CAMP':
        return { kind: 'CHOOSE_ARMY', tileId, purpose: 'WAR_CAMP' };
      case 'RESURRECTION_SHRINE':
        if (this.run.armies.every((a) => a.alive)) {
          this.clearTile(tile);
          this.changed();
          return { kind: 'RESOLVED', messages: ['The shrine is silent - none of your armies have fallen.'] };
        }
        return { kind: 'CHOOSE_ARMY', tileId, purpose: 'RESURRECTION_SHRINE' };
      case 'RECRUITMENT_CAMP':
        if (this.run.armies.length >= this.run.maxArmySlots) {
          this.clearTile(tile);
          this.changed();
          return { kind: 'RESOLVED', messages: ['No banner left to raise - your expedition is full.'] };
        }
        return { kind: 'CHOOSE_ARMY', tileId, purpose: 'RECRUITMENT_CAMP' };

      case 'EXIT':
        if (!this.guardianDefeated) return { kind: 'BLOCKED', reason: 'The way out is sealed until the Guardian falls.' };
        return { kind: 'EXIT' };

      default:
        return { kind: 'RESOLVED', messages: this.resolveSimpleTile(tile) };
    }
  }

  /** Nodes that resolve immediately on tap. */
  private resolveSimpleTile(tile: TileData): string[] {
    const messages: string[] = [];
    const rng = this.rng(`tile:${tile.id}`);

    switch (tile.type) {
      case 'EMPTY':
      case 'START':
        break;

      case 'GOLD': {
        const gained = this.addGold(tile.gold ?? 20);
        messages.push(`You find ${gained} gold.`);
        break;
      }

      case 'TREASURE': {
        const gained = this.addGold(tile.gold ?? 40);
        this.run.runStats.treasuresOpened += 1;
        this.profile.totalStats.treasuresOpened += 1;
        messages.push(`Treasure! ${gained} gold.`);
        const extra = this.hasRunFlag('treasureExtraOffer');
        if (extra || rng.bool(0.3)) {
          const relic = this.grantRandomRelic(rng);
          if (relic) messages.push(`The chest also held ${relic.name}.`);
        }
        this.applyRunEffects(this.effectHost.emit({ trigger: 'ON_TREASURE_OPEN' }));
        break;
      }

      case 'RELIC': {
        const def = tile.relicId ? getRelic(tile.relicId) : null;
        if (def && this.addRelic(def.id)) messages.push(`You recover ${def.name}.`);
        else messages.push('Your relic satchel is full.');
        break;
      }

      case 'SACRED_SPRING': {
        const amount = GameConfig.healing.sacredSpring;
        for (const army of this.livingArmies) healArmy(army, amount);
        messages.push(`The spring restores ${Math.round(amount * 100)}% Max HP to every army.`);
        break;
      }

      case 'ORACLE_TOWER': {
        const revealed = this.fog.scout(GameConfig.map.oracleTowerReveals, rng, { prioritiseInteresting: true });
        this.fog.scoutGuardian();
        messages.push(`The tower reveals ${revealed.length} distant tiles - and the Guardian.`);
        break;
      }

      case 'ALTAR': {
        const cost = 0.12;
        for (const army of this.livingArmies) damageArmy(army, cost, 'CURRENT');
        messages.push('The altar takes 12% of every army\'s health...');
        this.queueBlessingOffer(rng.bool(0.35) ? 'LEGENDARY' : 'EPIC');
        messages.push('...and offers something in return.');
        break;
      }

      case 'TRAP': {
        const damage = 0.08 + rng.float(0, 0.06);
        for (const army of this.livingArmies) damageArmy(army, damage, 'CURRENT');
        this.syncDeaths();
        messages.push(`A trap! Every army loses ${Math.round(damage * 100)}% of its health.`);
        break;
      }

      default:
        break;
    }

    this.clearTile(tile);
    this.changed();
    return messages;
  }

  /** Applies an army-targeted node once the player has picked a target. */
  resolveArmyChoice(tileId: string, purpose: ArmyChoicePurpose, armyId: string): string[] {
    const tile = this.view.get(tileId);
    const army = this.run.armies.find((a) => a.id === armyId);
    const messages: string[] = [];
    if (!army) return ['No such army.'];

    switch (purpose) {
      case 'HEALING_FOUNTAIN': {
        const gained = healArmy(army, GameConfig.healing.healingFountain);
        this.run.runStats.healingFountainsUsed += 1;
        messages.push(`${getHero(army.heroId).name} recovers ${Math.round(gained * 100)}% Max HP.`);
        break;
      }
      case 'WAR_CAMP': {
        army.floorModifiers.push({ stat: 'attack', mode: 'PERCENT', value: GameConfig.healing.warCampAttack, sourceId: 'war_camp' });
        messages.push(`${getHero(army.heroId).name} gains +${Math.round(GameConfig.healing.warCampAttack * 100)}% Attack for this floor.`);
        break;
      }
      case 'RESURRECTION_SHRINE': {
        army.alive = true;
        army.hpRatio = GameConfig.healing.resurrectionShrineHP;
        messages.push(`${getHero(army.heroId).name} returns to the banner.`);
        this.effectHost.rebuild();
        break;
      }
      case 'RECRUITMENT_CAMP': {
        // `armyId` carries the chosen mercenary hero id here.
        const mercenary = this.recruitMercenary(armyId);
        if (mercenary) messages.push(`${getHero(mercenary.heroId).name} joins as a mercenary.`);
        else messages.push('Nobody answers the call.');
        break;
      }
      default:
        break;
    }

    if (tile) this.clearTile(tile);
    this.changed();
    return messages;
  }

  /** Heroes available to hire at a Recruitment Camp. */
  mercenaryOptions(): string[] {
    const taken = new Set(this.run.armies.map((a) => a.heroId));
    const rng = this.rng('mercenary');
    const pool = this.profile.unlockedHeroes.filter((id) => !taken.has(id));
    return rng.pickMany(pool.length > 0 ? pool : this.profile.unlockedHeroes, 3);
  }

  private recruitMercenary(heroId: string): ArmyRunState | null {
    if (this.run.armies.length >= this.run.maxArmySlots) return null;
    const placement = autoAssign(
      this.run.armies
        .map((a) => ({ id: a.id, preferredRow: a.row }))
        .concat([{ id: 'new', preferredRow: getHero(heroId).preferredRow }]),
    );
    const slot = placement.get('new')!;
    const army: ArmyRunState = {
      id: `merc_${heroId}_${this.run.floor}`,
      heroId,
      hpRatio: 0.8,
      alive: true,
      row: slot.row,
      slot: slot.slot,
      floorModifiers: [],
      battleModifiers: [],
      temporary: true,
      expiresAfterFloor: this.run.floor,
    };
    this.run.armies.push(army);
    this.effectHost.rebuild();
    return army;
  }

  private clearTile(tile: TileData): void {
    this.fog.clearTile(tile);
    if (!this.run.currentMap!.collectedNodeIds.includes(tile.id)) {
      this.run.currentMap!.collectedNodeIds.push(tile.id);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Battles                                                           */
  /* ---------------------------------------------------------------- */

  buildBattleSetup(encounter: EncounterData): BattleSetup {
    const asc = ascension(this.run.ascensionLevel);
    const battleModifiers = this.run.armies
      .filter((a) => a.alive && a.battleModifiers.length > 0)
      .map((army) => ({
        armyId: army.id,
        effects: army.battleModifiers.map((mod) => ({
          type: 'MODIFY_STAT' as const,
          stat: mod.stat,
          mode: mod.mode,
          value: mod.value,
          target: { scope: 'SELF' as const },
        })),
      }));

    if ((this.run.flags.battleEnergyBonus ?? 0) > 0) {
      battleModifiers.push({
        armyId: '*',
        effects: [
          {
            type: 'MODIFY_STAT' as const,
            stat: 'attack',
            mode: 'PERCENT' as const,
            value: 0,
            target: { scope: 'SELF' as const },
          },
        ],
      });
    }

    return {
      seed: RNG.fromState(this.run.rngState).fork(`battle:${encounter.id}`).getState(),
      floor: this.run.floor,
      ascensionLevel: this.run.ascensionLevel,
      mode: this.run.mode,
      armies: this.livingArmies.map((army) => {
        const stats = this.armyStats(army);
        return {
          armyId: army.id,
          heroId: army.heroId,
          ...(army.lieutenantId ? { lieutenantId: army.lieutenantId } : {}),
          row: army.row,
          slot: army.slot,
          currentHP: Math.max(1, stats.maxHP * army.hpRatio),
          stats,
        };
      }),
      encounter,
      blessings: this.run.blessings,
      heroMastery: Object.fromEntries(
        Object.entries(this.profile.heroMastery).map(([id, value]) => [id, value.tier]),
      ),
      guardianHPPenalty: this.run.flags.guardianHPPenalty ?? 0,
      guardianPowerBonus: this.run.flags.guardianPowerBonus ?? 0,
      bossExtraPhase: asc.bossExtraPhase,
      ...(battleModifiers.length > 0 ? { battleModifiers } : {}),
    };
  }

  /** Writes a finished battle back into the run. */
  applyBattleResult(tileId: string | null, encounter: EncounterData, result: BattleResult): string[] {
    const messages: string[] = [];
    const stats = this.run.runStats;

    for (const entry of result.armies) {
      const army = this.run.armies.find((a) => a.id === entry.armyId);
      if (!army) continue;
      army.hpRatio = entry.hpRatio;
      const wasAlive = army.alive;
      army.alive = entry.alive;
      if (wasAlive && !entry.alive) {
        stats.armiesLost += 1;
        messages.push(`${getHero(army.heroId).name} has fallen.`);
      }
      stats.damageDealt += entry.damageDealt;
      stats.damageTaken += entry.damageTaken;
      stats.healingDone += entry.healingDone;

      const tracking = this.run.heroStats[army.heroId] ?? {
        damageDealt: 0,
        damageAbsorbed: 0,
        healingDone: 0,
        kills: 0,
        skillsCast: 0,
        battlesWon: 0,
      };
      tracking.damageDealt += entry.damageDealt;
      tracking.damageAbsorbed += entry.damageTaken;
      tracking.healingDone += entry.healingDone;
      tracking.kills += entry.kills;
      tracking.skillsCast += entry.skillsCast;
      if (result.outcome === 'VICTORY') tracking.battlesWon += 1;
      this.run.heroStats[army.heroId] = tracking;
    }

    // Relic pre-battle buffs are consumed by the fight.
    for (const army of this.run.armies) army.battleModifiers = [];
    this.run.flags.guardianHPPenalty = 0;

    if (result.outcome !== 'VICTORY') {
      this.changed();
      return messages;
    }

    stats.battlesWon += 1;
    stats.enemiesDefeated += result.enemiesDefeated;
    this.profile.totalStats.enemiesDefeated += result.enemiesDefeated;
    if (encounter.kind === 'ELITE') {
      stats.elitesDefeated += 1;
      this.profile.totalStats.elitesDefeated += 1;
    }

    const gained = this.addGold(encounter.goldReward);
    messages.push(`Victory. ${gained} gold.`);

    this.effectHost.rebuild();
    this.applyRunEffects(result.runEffects);
    this.applyRunEffects(this.effectHost.emit({ trigger: 'ON_BATTLE_WON' }));
    this.applyRunEffects(this.effectHost.emit({ trigger: 'ON_BATTLE_END' }));

    const tile = tileId ? this.view.get(tileId) : null;
    if (tile) {
      if (tile.type === 'GUARDIAN') {
        this.run.currentMap!.guardianDefeated = true;
        stats.guardiansDefeated += 1;
        this.profile.totalStats.guardiansDefeated += 1;
        this.applyRunEffects(this.effectHost.emit({ trigger: 'ON_GUARDIAN_KILL' }));
        messages.push('The Guardian falls. The way out is open.');
        this.fog.scout(4, this.rng('guardian-reveal'), { prioritiseInteresting: true });
      }
      this.clearTile(tile);
    }

    this.syncDeaths();
    this.changed();
    return messages;
  }

  /** Applies effects that combat queued for the run layer. */
  private applyRunEffects(effects: { type: string; value: number; meta?: Record<string, unknown> }[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'GRANT_GOLD':
          this.addGold(effect.value);
          break;
        case 'ADD_RELIC':
          this.grantRandomRelic(this.rng('relic-drop'));
          break;
        case 'GRANT_ARMY_SLOT':
          this.run.maxArmySlots = Math.min(GameConfig.run.maxArmySlots, this.run.maxArmySlots + effect.value);
          break;
        case 'REVEAL_TILE':
          this.fog.scout(effect.value, this.rng('reveal'), { prioritiseInteresting: true });
          break;
        case 'ADD_BLESSING':
          this.queueBlessingOffer('EPIC');
          break;
        default:
          break;
      }
    }
  }

  private syncDeaths(): void {
    for (const army of this.run.armies) {
      if (army.hpRatio <= 0) {
        army.hpRatio = 0;
        army.alive = false;
      }
    }
  }

  isRunLost(): boolean {
    return this.run.armies.every((a) => !a.alive);
  }

  /* ---------------------------------------------------------------- */
  /* Blessings                                                         */
  /* ---------------------------------------------------------------- */

  /** Builds the one-of-three offer shown after a floor (or from a shrine). */
  createBlessingOffer(forcedRarity?: BlessingRarity, bandBonus = 0): PendingReward {
    const rng = this.rng('blessing-offer');
    const ids: string[] = [];
    let guard = 0;
    while (ids.length < REWARD_COUNT && guard < 60) {
      guard += 1;
      const rarity = forcedRarity ?? (rng.weightedKey(blessingRarityWeights(this.run.floor, bandBonus)) as BlessingRarity);
      const pool = blessingsByRarity(rarity).filter((def) => {
        if (ids.includes(def.id)) return false;
        if (def.minFloor && this.run.floor < def.minFloor) return false;
        const owned = this.run.blessings.find((b) => b.id === def.id);
        return !owned || owned.stacks < def.maxStacks;
      });
      if (pool.length === 0) continue;
      ids.push(rng.pick(pool).id);
    }
    // Fall back to anything still offerable so the player is never stuck.
    while (ids.length < REWARD_COUNT) {
      const fallback = BLESSINGS.find((b) => b.offerable !== false && !ids.includes(b.id));
      if (!fallback) break;
      ids.push(fallback.id);
    }
    return { kind: 'BLESSING', blessingIds: ids, rerollsUsed: 0, floor: this.run.floor };
  }

  queueBlessingOffer(rarity?: BlessingRarity): void {
    this.run.pendingReward = this.createBlessingOffer(rarity);
    this.changed();
  }

  get pendingReward(): PendingReward | null {
    return this.run.pendingReward;
  }

  chooseBlessing(blessingId: string): void {
    const def = getBlessing(blessingId);
    this.addBlessing(def.id);
    this.run.pendingReward = null;
    this.changed();
  }

  addBlessing(blessingId: string): void {
    const def = getBlessing(blessingId);
    const existing = this.run.blessings.find((b) => b.id === blessingId);
    if (existing) {
      if (existing.stacks >= def.maxStacks) return;
      existing.stacks += 1;
    } else {
      this.run.blessings.push({ id: blessingId, stacks: 1 });
    }
    this.run.runStats.blessingsCollected += 1;
    this.profile.totalStats.blessingsCollected += 1;
    if (def.rarity === 'LEGENDARY') {
      this.run.runStats.legendaryBlessings += 1;
      this.profile.totalStats.legendaryBlessings += 1;
    }
    for (const effect of def.effects) {
      if (effect.type === 'GRANT_ARMY_SLOT') {
        this.run.maxArmySlots = Math.min(GameConfig.run.maxArmySlots, this.run.maxArmySlots + (effect.value ?? 1));
      }
    }
    this.effectHost.rebuild();
  }

  rerollBlessings(free = false): boolean {
    if (!this.run.pendingReward) return false;
    if (!free) {
      if ((this.run.flags.rerolls ?? 0) <= 0) return false;
      this.run.flags.rerolls = (this.run.flags.rerolls ?? 0) - 1;
    }
    const offer = this.createBlessingOffer();
    offer.rerollsUsed = this.run.pendingReward.rerollsUsed + 1;
    this.run.pendingReward = offer;
    this.changed();
    return true;
  }

  ownedBlessings(): { def: ReturnType<typeof getBlessing>; owned: OwnedBlessing }[] {
    return this.run.blessings.map((owned) => ({ def: getBlessing(owned.id), owned }));
  }

  private hasRunFlag(flag: string): boolean {
    for (const owned of this.run.blessings) {
      for (const effect of getBlessing(owned.id).effects) {
        if (effect.type === 'RUN_FLAG' && effect.meta?.flag === flag) return true;
      }
    }
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* Relics                                                            */
  /* ---------------------------------------------------------------- */

  addRelic(relicId: string): boolean {
    if (this.run.relics.length >= GameConfig.run.relicInventorySize) return false;
    this.run.relics.push({ id: relicId, uid: `${relicId}_${this.run.relics.length}_${Date.now().toString(36)}` });
    this.changed();
    return true;
  }

  private grantRandomRelic(rng: RNG): RelicDefinition | null {
    const rarity = rng.weightedKey(GameConfig.economy.relicRarityWeights);
    const pool = RELICS.filter((r) => r.rarity === rarity);
    const def = rng.pick(pool.length > 0 ? pool : RELICS);
    return this.addRelic(def.id) ? def : null;
  }

  ownedRelics(): { def: RelicDefinition; owned: OwnedRelic }[] {
    return this.run.relics.map((owned) => ({ def: getRelic(owned.id), owned }));
  }

  canUseRelic(def: RelicDefinition, context: 'MAP' | 'PRE_BATTLE'): boolean {
    if (def.usage !== 'ANY' && def.usage !== context) return false;
    switch (def.requires) {
      case 'DEAD_ARMY':
        return this.run.armies.some((a) => !a.alive);
      case 'GUARDIAN_ALIVE':
        return !this.guardianDefeated;
      case 'BLESSING_CHOICE':
        return this.run.pendingReward !== null;
      case 'RARE_BLESSING':
        return this.run.blessings.some((b) => getBlessing(b.id).rarity === 'RARE' && getBlessing(b.id).upgradeTo);
      default:
        return true;
    }
  }

  /** Returns messages, or a purpose when the relic still needs a target. */
  useRelic(uid: string, targetArmyId?: string): { messages: string[]; needsArmy?: ArmyChoicePurpose } {
    const index = this.run.relics.findIndex((r) => r.uid === uid);
    if (index < 0) return { messages: ['That relic is gone.'] };
    const owned = this.run.relics[index]!;
    const def = getRelic(owned.id);
    const rng = this.rng(`relic:${uid}`);
    const messages: string[] = [];

    if (def.targeting === 'SINGLE_ARMY' && !targetArmyId) {
      return { messages: [], needsArmy: def.id === 'blood_gem' ? 'RELIC_BUFF' : 'RELIC_HEAL' };
    }
    if (def.targeting === 'DEAD_ARMY' && !targetArmyId) {
      return { messages: [], needsArmy: 'RELIC_REVIVE' };
    }

    const targets = (() => {
      if (def.targeting === 'ALL_ARMIES') return this.livingArmies;
      if (targetArmyId) {
        const army = this.run.armies.find((a) => a.id === targetArmyId);
        return army ? [army] : [];
      }
      return [];
    })();

    for (const effect of def.effects) {
      switch (effect.type) {
        case 'HEAL': {
          for (const army of targets) {
            const gained = healArmy(army, effect.value ?? 0);
            messages.push(`${getHero(army.heroId).name} recovers ${Math.round(gained * 100)}% Max HP.`);
          }
          break;
        }
        case 'DAMAGE': {
          for (const army of targets) damageArmy(army, effect.value ?? 0, 'CURRENT');
          break;
        }
        case 'REVIVE': {
          for (const army of targets) {
            if (army.alive) continue;
            army.alive = true;
            army.hpRatio = effect.value ?? 0.4;
            messages.push(`${getHero(army.heroId).name} rises again.`);
          }
          break;
        }
        case 'MODIFY_STAT': {
          const list = def.targeting === 'ALL_ARMIES' ? this.livingArmies : targets;
          for (const army of list) {
            army.battleModifiers.push({
              stat: effect.stat!,
              mode: effect.mode ?? 'PERCENT',
              value: effect.value ?? 0,
              sourceId: def.id,
            });
          }
          messages.push(`${def.name} readied for the next battle.`);
          break;
        }
        case 'ENERGY': {
          this.run.flags.battleEnergyBonus = effect.value ?? 0;
          messages.push('Your armies crackle with stored energy.');
          break;
        }
        case 'REVEAL_TILE': {
          if (effect.meta?.revealGuardian) {
            this.fog.scoutGuardian();
            messages.push('The compass points straight at the Guardian.');
          } else {
            const revealed = this.fog.scout(effect.value ?? 10, rng, { prioritiseInteresting: true });
            messages.push(`${revealed.length} tiles revealed.`);
          }
          break;
        }
        case 'CLEANSE': {
          this.run.runModifiers = this.run.runModifiers.filter((mod) => mod.value >= 0);
          for (const army of this.run.armies) army.floorModifiers = army.floorModifiers.filter((m) => m.value >= 0);
          messages.push('Negative modifiers cleansed.');
          break;
        }
        case 'ADD_BLESSING': {
          if (effect.meta?.upgradeRare) {
            const upgraded = this.upgradeRareBlessing();
            messages.push(upgraded ? `${upgraded} was reforged into its greater form.` : 'No rare blessing could be reforged.');
          }
          break;
        }
        case 'RUN_FLAG': {
          const flag = String(effect.meta?.flag ?? '');
          const value = Number(effect.meta?.value ?? 1);
          if (flag === 'skipBattle') {
            this.pendingSkipBattle = true;
            messages.push('Smoke fills the passage - you may slip past one warband.');
          } else if (flag === 'blessingReroll') {
            this.run.flags.rerolls = (this.run.flags.rerolls ?? 0) + 1;
            if (this.run.pendingReward) this.rerollBlessings(true);
            messages.push('The prism reshapes the offer.');
          } else {
            this.run.flags[flag] = (this.run.flags[flag] ?? 0) + value;
            if (flag === 'guardianHPPenalty') messages.push('The Guardian is weakened before the fight even begins.');
            if (flag === 'merchantDiscount') messages.push('The next merchant will offer you a far better price.');
          }
          break;
        }
        default:
          break;
      }
    }

    this.run.relics.splice(index, 1);
    this.run.runStats.relicsUsed += 1;
    this.profile.totalStats.relicsUsed += 1;
    this.syncDeaths();
    this.effectHost.rebuild();
    this.changed();
    return { messages };
  }

  private upgradeRareBlessing(): string | null {
    const candidate = this.run.blessings.find((b) => {
      const def = getBlessing(b.id);
      return def.rarity === 'RARE' && def.upgradeTo;
    });
    if (!candidate) return null;
    const def = getBlessing(candidate.id);
    candidate.stacks -= 1;
    if (candidate.stacks <= 0) {
      this.run.blessings = this.run.blessings.filter((b) => b.id !== candidate.id);
    }
    this.addBlessing(def.upgradeTo!);
    return def.name;
  }

  /* ---------------------------------------------------------------- */
  /* Merchant                                                          */
  /* ---------------------------------------------------------------- */

  merchantStock(tileId: string): ShopItem[] {
    const cached = this.merchantStockCache.get(tileId);
    if (cached) return cached;

    const rng = this.rng(`merchant:${tileId}`);
    const eco = GameConfig.economy.merchant;
    const discount = (this.run.flags.merchantDiscount ?? 0) > 0 ? 0.5 : 1;
    const count =
      rng.int(eco.itemCount[0], eco.itemCount[1]) + (this.profile.kingdomMastery.includes('km_merchant') ? 1 : 0);

    const items: ShopItem[] = [];
    const price = (value: number) => Math.max(5, Math.round(value * discount));

    items.push({
      id: 'heal_one',
      label: 'Field Surgeon',
      description: 'Restore 30% Max HP to one army.',
      price: price(eco.smallHeal),
      kind: 'HEAL_ONE',
    });

    for (let i = items.length; i < count; i++) {
      const roll = rng.next();
      if (roll < 0.42) {
        const rarity = rng.weightedKey(GameConfig.economy.relicRarityWeights);
        const pool = RELICS.filter((r) => r.rarity === rarity);
        const def = rng.pick(pool.length > 0 ? pool : RELICS);
        items.push({
          id: `relic_${i}`,
          label: def.name,
          description: def.description,
          price: price(def.rarity === 'EPIC' ? eco.epicRelic : def.price),
          kind: 'RELIC',
          relicId: def.id,
        });
      } else if (roll < 0.6) {
        items.push({
          id: `heal_all_${i}`,
          label: 'Camp Physician',
          description: 'Restore 15% Max HP to every army.',
          price: price(eco.largeHeal),
          kind: 'HEAL_ALL',
        });
      } else if (roll < 0.78) {
        items.push({
          id: `reroll_${i}`,
          label: 'Blessing Reroll',
          description: 'Gain one blessing reroll.',
          price: price(eco.blessingReroll),
          kind: 'BLESSING_REROLL',
        });
      } else if (roll < 0.92) {
        items.push({
          id: `blessing_${i}`,
          label: 'Sealed Blessing',
          description: 'Choose one of three blessings now.',
          price: price(eco.randomBlessing),
          kind: 'RANDOM_BLESSING',
        });
      } else {
        items.push({
          id: `buff_${i}`,
          label: "Quartermaster's Kit",
          description: 'All armies gain +15% Attack for this floor.',
          price: price(eco.buff),
          kind: 'BUFF',
        });
      }
    }

    this.merchantStockCache.set(tileId, items);
    return items;
  }

  buy(tileId: string, itemId: string): { ok: boolean; message: string } {
    const stock = this.merchantStock(tileId);
    const item = stock.find((entry) => entry.id === itemId);
    if (!item || item.sold) return { ok: false, message: 'Already sold.' };
    if (this.run.gold < item.price) return { ok: false, message: 'Not enough gold.' };

    switch (item.kind) {
      case 'HEAL_ONE': {
        const wounded = this.livingArmies.sort((a, b) => a.hpRatio - b.hpRatio)[0];
        if (!wounded) return { ok: false, message: 'No army to treat.' };
        healArmy(wounded, 0.3);
        break;
      }
      case 'HEAL_ALL':
        for (const army of this.livingArmies) healArmy(army, 0.15);
        break;
      case 'RELIC':
        if (!this.addRelic(item.relicId!)) return { ok: false, message: 'Your satchel is full.' };
        break;
      case 'BLESSING_REROLL':
        this.run.flags.rerolls = (this.run.flags.rerolls ?? 0) + 1;
        break;
      case 'RANDOM_BLESSING':
        this.queueBlessingOffer();
        break;
      case 'BUFF':
        for (const army of this.run.armies) {
          army.floorModifiers.push({ stat: 'attack', mode: 'PERCENT', value: 0.15, sourceId: 'merchant_buff' });
        }
        break;
    }

    this.run.gold -= item.price;
    item.sold = true;
    this.run.flags.merchantDiscount = 0;
    this.effectHost.rebuild();
    this.changed();
    return { ok: true, message: `${item.label} acquired.` };
  }

  closeMerchant(tileId: string): void {
    const tile = this.view.get(tileId);
    if (tile) this.clearTile(tile);
    this.changed();
  }

  /* ---------------------------------------------------------------- */
  /* Events                                                            */
  /* ---------------------------------------------------------------- */

  canChooseEvent(choice: EventChoice): boolean {
    if (choice.cost && this.run.gold < choice.cost) return false;
    if (choice.requires === 'FREE_ARMY_SLOT' && this.run.armies.length >= this.run.maxArmySlots) return false;
    if (choice.requires === 'DEAD_ARMY' && this.run.armies.every((a) => a.alive)) return false;
    return true;
  }

  resolveEventChoice(tileId: string, eventId: string, choiceId: string): EventResolution {
    const event = getEvent(eventId);
    const choice = event.choices.find((c) => c.id === choiceId);
    const tile = this.view.get(tileId);
    if (!choice) return { messages: ['Nothing happens.'] };

    const rng = this.rng(`event:${tileId}`);
    const messages: string[] = [];
    const resolution: EventResolution = { messages };

    if (choice.cost) {
      this.run.gold -= choice.cost;
      messages.push(`You part with ${choice.cost} gold.`);
    }
    if (choice.hpCost) {
      for (const army of this.livingArmies) damageArmy(army, choice.hpCost, 'CURRENT');
      this.syncDeaths();
      messages.push(`Every army gives up ${Math.round(choice.hpCost * 100)}% of its health.`);
    }

    this.applyEventOutcome(choice.outcome, rng, resolution);

    if (tile && !resolution.battle) this.clearTile(tile);
    this.effectHost.rebuild();
    this.changed();
    return resolution;
  }

  private applyEventOutcome(outcome: EventOutcome, rng: RNG, resolution: EventResolution): void {
    const messages = resolution.messages;
    if (outcome.text) messages.push(outcome.text);

    switch (outcome.type) {
      case 'RANDOM': {
        const options = outcome.options ?? [];
        if (options.length === 0) break;
        const picked = rng.weighted(options, (o) => o.weight);
        messages.push(picked.text);
        this.applyEventOutcome(picked.outcome, rng, resolution);
        break;
      }
      case 'GOLD': {
        const gained = this.addGold(outcome.value ?? 50);
        messages.push(`You gain ${gained} gold.`);
        break;
      }
      case 'HEAL_ALL': {
        for (const army of this.livingArmies) healArmy(army, outcome.value ?? 0.15);
        messages.push(`Every army recovers ${Math.round((outcome.value ?? 0.15) * 100)}% Max HP.`);
        break;
      }
      case 'HEAL_ONE': {
        const wounded = this.livingArmies.sort((a, b) => a.hpRatio - b.hpRatio)[0];
        if (wounded) {
          healArmy(wounded, outcome.value ?? 0.3);
          messages.push(`${getHero(wounded.heroId).name} is patched up.`);
        }
        break;
      }
      case 'DAMAGE_ALL': {
        for (const army of this.livingArmies) damageArmy(army, outcome.value ?? 0.1, 'CURRENT');
        this.syncDeaths();
        break;
      }
      case 'RELIC': {
        const pool = RELICS.filter((r) => r.rarity === (outcome.relicRarity ?? 'COMMON'));
        const def = rng.pick(pool.length > 0 ? pool : RELICS);
        messages.push(this.addRelic(def.id) ? `You receive ${def.name}.` : 'Your satchel is full.');
        break;
      }
      case 'BLESSING_CHOICE':
      case 'BLESSING_UPGRADED_CHOICE': {
        resolution.blessingOffer = outcome.blessingRarity ?? 'EPIC';
        this.queueBlessingOffer(resolution.blessingOffer);
        break;
      }
      case 'REVEAL_MAP': {
        const revealed = this.fog.scout(outcome.value ?? 10, rng, { prioritiseInteresting: true });
        messages.push(`${revealed.length} tiles revealed.`);
        break;
      }
      case 'BLESSING_REROLL': {
        this.run.flags.rerolls = (this.run.flags.rerolls ?? 0) + (outcome.value ?? 1);
        break;
      }
      case 'SPAWN_ELITE': {
        const id = `event_elite_${this.run.floor}_${rng.int(0, 9999)}`;
        const encounter = generateEncounter(
          { id, floor: this.run.floor, kind: 'ELITE', ascensionLevel: this.run.ascensionLevel },
          rng,
        );
        this.run.currentMap!.map.encounters[id] = encounter;
        resolution.battle = encounter;
        break;
      }
      case 'SPAWN_DUEL': {
        const id = `event_duel_${this.run.floor}_${rng.int(0, 9999)}`;
        const encounter = generateDuel(this.run.floor, this.run.ascensionLevel, rng, id);
        this.run.currentMap!.map.encounters[id] = encounter;
        resolution.battle = encounter;
        this.run.flags.duelReward = 1;
        break;
      }
      case 'MERCENARY': {
        resolution.needsArmyChoice = 'RECRUITMENT_CAMP';
        break;
      }
      case 'RUN_MODIFIER': {
        for (const mod of outcome.modifiers ?? []) this.run.runModifiers.push(mod);
        break;
      }
      case 'GUARDIAN_BUFF': {
        for (const army of this.run.armies) {
          army.alive = true;
          army.hpRatio = 1;
        }
        this.run.flags.guardianPowerBonus = (this.run.flags.guardianPowerBonus ?? 0) + (outcome.value ?? 0.15);
        messages.push('Every army is fully restored.');
        break;
      }
      case 'NOTHING':
      default:
        break;
    }
  }

  /** Called after winning a duel started by an event. */
  grantDuelReward(): void {
    if (!this.run.flags.duelReward) return;
    this.run.flags.duelReward = 0;
    this.queueBlessingOffer('EPIC');
  }

  /* ---------------------------------------------------------------- */
  /* Checkpoints and run end                                           */
  /* ---------------------------------------------------------------- */

  isCheckpointFloor(): boolean {
    return floorDefinition(this.run.floor).isCheckpoint && this.run.floor < GameConfig.run.totalFloors;
  }

  /** Golden chest awarded after clearing a checkpoint floor. */
  createCheckpointChest(): PendingReward {
    const rng = this.rng('checkpoint');
    const eco = GameConfig.economy;
    const gold = rng.int(eco.checkpointChestGold[0], eco.checkpointChestGold[1]);
    const relicIds: string[] = [];
    const rarity = rng.weightedKey({ COMMON: 40, RARE: 45, EPIC: 15 });
    const pool = RELICS.filter((r) => r.rarity === rarity);
    relicIds.push(rng.pick(pool.length > 0 ? pool : RELICS).id);

    const offer = this.createBlessingOffer(undefined, GameConfig.blessings.checkpointBandBonus);
    return {
      kind: 'CHECKPOINT',
      blessingIds: offer.blessingIds,
      rerollsUsed: 0,
      floor: this.run.floor,
      chest: { gold, relicIds, healPercent: 0.15 },
    };
  }

  claimCheckpointChest(chest: { gold: number; relicIds: string[]; healPercent: number }): string[] {
    const messages: string[] = [];
    const gained = this.addGold(chest.gold);
    messages.push(`${gained} gold.`);
    for (const relicId of chest.relicIds) {
      if (this.addRelic(relicId)) messages.push(`${getRelic(relicId).name}.`);
    }
    for (const army of this.livingArmies) healArmy(army, chest.healPercent);
    messages.push(`All armies restore ${Math.round(chest.healPercent * 100)}% Max HP.`);
    this.changed();
    return messages;
  }

  finishRun(won: boolean): void {
    this.run.finished = won ? 'WON' : 'LOST';
    this.run.elapsedMs = Date.now() - this.run.startedAt;
    this.changed();
    gameEvents.emit('run:ended', { won });
  }

  /** Tick the run clock so the end screen can show a real duration. */
  tickClock(): void {
    this.run.elapsedMs = Date.now() - this.run.startedAt;
  }
}
