/**
 * CROWNBOUND - shared domain types.
 *
 * Everything content-related in this project is data-driven: heroes, enemies,
 * blessings, relics, events and bosses are plain definition objects that are
 * interpreted by generic engines. Adding content should never require touching
 * the combat or map core.
 */

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export type StatKey =
  | 'maxHP'
  | 'attack'
  | 'defense'
  | 'attackSpeed'
  | 'critChance'
  | 'critDamage'
  | 'skillPower'
  | 'energyGeneration'
  | 'healingPower'
  | 'range'
  | 'movementSpeed';

export type CombatStats = Record<StatKey, number>;

export const STAT_KEYS: StatKey[] = [
  'maxHP',
  'attack',
  'defense',
  'attackSpeed',
  'critChance',
  'critDamage',
  'skillPower',
  'energyGeneration',
  'healingPower',
  'range',
  'movementSpeed',
];

/** Stats where a "percent" modifier is additive on a base of 1.0 rather than multiplicative on a raw value. */
export const RATIO_STATS: StatKey[] = ['critChance'];

/* ------------------------------------------------------------------ */
/* Heroes                                                              */
/* ------------------------------------------------------------------ */

export type HeroClass = 'GUARDIAN' | 'WARRIOR' | 'RIDER' | 'RANGER' | 'ARCANIST' | 'SUPPORT';

export type Row = 'FRONT' | 'BACK';
export type Side = 'PLAYER' | 'ENEMY';

export type CombatantKind = 'HERO' | 'MERCENARY' | 'ENEMY' | 'ELITE' | 'GUARDIAN' | 'BOSS' | 'SUMMON';

export type UnlockConditionType =
  | 'STARTER'
  | 'REACH_FLOOR'
  | 'DEFEAT_FLOOR'
  | 'COMPLETE_ASCENSION'
  | 'TOTAL_ENEMIES_DEFEATED'
  | 'TOTAL_TREASURES_OPENED'
  | 'TOTAL_LEGENDARY_BLESSINGS'
  | 'REACH_ENDLESS_FLOOR'
  | 'CLEAR_WITHOUT_HEALING_FOUNTAIN'
  | 'ACHIEVEMENT';

export interface UnlockCondition {
  type: UnlockConditionType;
  value?: number;
  /** Human readable requirement, shown on locked cards. */
  label: string;
  achievementId?: string;
}

export interface MasteryTier {
  tier: number;
  /** Requirement description shown in the collection screen. */
  label: string;
  challenge: MasteryChallenge;
  /** Effects applied to the hero once this tier is reached. */
  effects: EffectDefinition[];
  /** Short player-facing summary of the reward. */
  reward: string;
}

export type MasteryChallengeType =
  | 'UNLOCKED'
  | 'DAMAGE_ABSORBED'
  | 'DAMAGE_DEALT'
  | 'HEALING_DONE'
  | 'BATTLES_WON'
  | 'ENEMIES_DEFEATED'
  | 'REACH_FLOOR_WITH'
  | 'COMPLETE_ASCENSION_WITH'
  | 'SKILLS_CAST';

export interface MasteryChallenge {
  type: MasteryChallengeType;
  value: number;
}

export interface HeroDefinition {
  id: string;
  name: string;
  title: string;
  heroClass: HeroClass;
  /** Secondary class used purely for presentation / blessing tags. */
  secondaryClass?: HeroClass;
  preferredRow: Row;
  baseStats: CombatStats;
  activeSkill: SkillDefinition;
  passiveSkills: PassiveDefinition[];
  unlockCondition: UnlockCondition;
  mastery: MasteryTier[];
  /** Placeholder art description - drives the procedural silhouette. */
  art: HeroArt;
  lore: string;
}

export interface HeroArt {
  /** Primary body colour. */
  color: number;
  /** Accent colour used for trims and weapons. */
  accent: number;
  /** Silhouette shape used by the procedural texture generator. */
  shape: 'BULWARK' | 'BLADE' | 'LANCE' | 'BOW' | 'STAFF' | 'CHALICE';
}

export interface PassiveDefinition {
  id: string;
  name: string;
  description: string;
  effects: EffectDefinition[];
}

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  /** Seconds the caster is locked in the cast animation. */
  castTime: number;
  effects: EffectDefinition[];
}

/* ------------------------------------------------------------------ */
/* Generic effect / trigger system                                     */
/* ------------------------------------------------------------------ */

export type TriggerType =
  | 'ON_BATTLE_START'
  | 'ON_BATTLE_END'
  | 'ON_BATTLE_WON'
  | 'ON_BASIC_ATTACK'
  | 'ON_CRIT'
  | 'ON_SKILL_CAST'
  | 'ON_SKILL_HIT'
  | 'ON_KILL'
  | 'ON_DAMAGE_TAKEN'
  | 'ON_DAMAGE_DEALT'
  | 'ON_ARMY_DEATH'
  | 'ON_GUARDIAN_KILL'
  | 'ON_FLOOR_START'
  | 'ON_FLOOR_END'
  | 'ON_TREASURE_OPEN'
  | 'ON_HEAL'
  | 'ON_REVIVE'
  | 'ON_LETHAL_DAMAGE';

export type EffectType =
  | 'MODIFY_STAT'
  | 'HEAL'
  | 'SHIELD'
  | 'ENERGY'
  | 'DAMAGE'
  | 'REVIVE'
  | 'GRANT_GOLD'
  | 'ADD_RELIC'
  | 'ADD_BLESSING'
  | 'REVEAL_TILE'
  | 'CLEANSE'
  | 'DAMAGE_TAKEN_AMP'
  | 'DAMAGE_AMP'
  | 'REPEAT_SKILL'
  | 'EMPOWER_NEXT_ATTACK'
  | 'SURVIVE_LETHAL'
  | 'DAMAGE_REDUCTION'
  | 'REFLECT'
  | 'LIFESTEAL'
  | 'HEAL_RECEIVED_MOD'
  | 'GRANT_ARMY_SLOT'
  | 'RUN_FLAG';

/** Which combatants an effect resolves onto. */
export interface TargetSelector {
  scope: 'SELF' | 'ALLIES' | 'ENEMIES' | 'CURRENT_TARGET' | 'EVENT_TARGET' | 'EVENT_SOURCE';
  row?: Row;
  heroClass?: HeroClass;
  kind?: CombatantKind;
  /** Undefined = every matching combatant. */
  count?: number;
  sort?:
    | 'LOWEST_HP_PERCENT'
    | 'HIGHEST_HP_PERCENT'
    | 'LOWEST_HP_ABSOLUTE'
    | 'HIGHEST_ATTACK'
    | 'NEAREST'
    | 'FARTHEST'
    | 'RANDOM';
  includeDead?: boolean;
  /** Only targets in front of the source (used by cleave style skills). */
  frontalOnly?: boolean;
}

export type EffectCondition =
  | { type: 'SELF_HP_BELOW'; value: number }
  | { type: 'SELF_HP_ABOVE'; value: number }
  | { type: 'TARGET_HP_BELOW'; value: number }
  | { type: 'ALLY_ALIVE_COUNT'; op: 'EQ' | 'LTE' | 'GTE'; value: number }
  | { type: 'BATTLE_TIME_BEFORE'; value: number }
  | { type: 'BATTLE_TIME_AFTER'; value: number }
  | { type: 'TARGET_KIND'; value: CombatantKind[] }
  | { type: 'SOURCE_ROW'; value: Row }
  | { type: 'IS_CRIT' }
  | { type: 'BLESSING_COUNT'; op: 'GTE'; value: number };

/** How a numeric magnitude is computed. */
export type MagnitudeSource = 'FLAT' | 'ATTACK' | 'SKILL_POWER' | 'MAX_HP' | 'CURRENT_HP' | 'MISSING_HP';

export interface EffectDefinition {
  type: EffectType;
  /** Defaults to ON_BATTLE_START (i.e. a permanent passive for the fight). */
  trigger?: TriggerType;
  target?: TargetSelector;
  /** MODIFY_STAT only. */
  stat?: StatKey;
  mode?: 'PERCENT' | 'FLAT';
  /** Primary magnitude. Percent values use 0.1 for 10%. */
  value?: number;
  /** For DAMAGE / HEAL / SHIELD: what the magnitude scales off. */
  magnitude?: MagnitudeSource;
  /** Seconds. Omitted = permanent for the battle. */
  duration?: number;
  /** 0..1 roll gate, uses the battle RNG. */
  chance?: number;
  /** Fires only on every Nth trigger occurrence. */
  everyNth?: number;
  /** Hard usage limit. */
  oncePer?: 'BATTLE' | 'FLOOR' | 'RUN';
  conditions?: EffectCondition[];
  /** Free-form payload for the few bespoke effect types. */
  meta?: Record<string, number | string | boolean>;
  /** Internal id used for counters / once-per bookkeeping. Auto-assigned. */
  uid?: string;
}

/* ------------------------------------------------------------------ */
/* Enemies                                                             */
/* ------------------------------------------------------------------ */

export type EnemyRole =
  | 'TANK'
  | 'BRUISER'
  | 'ASSASSIN'
  | 'ARCHER'
  | 'CASTER'
  | 'HEALER'
  | 'SUMMONER'
  | 'BEAST';

export type TargetingRule =
  | 'NEAREST'
  | 'LOWEST_HP_PERCENT'
  | 'LOWEST_HP_ABSOLUTE'
  | 'HIGHEST_ATTACK'
  | 'BACKLINE_FIRST'
  | 'FRONTLINE_FIRST'
  | 'RANDOM';

export interface EnemyDefinition {
  id: string;
  name: string;
  role: EnemyRole;
  preferredRow: Row;
  baseStats: CombatStats;
  targeting: TargetingRule;
  activeSkill?: SkillDefinition;
  passiveSkills?: PassiveDefinition[];
  /** Relative frequency when populating a floor. */
  weight: number;
  /** Earliest floor this enemy may appear on. */
  minFloor: number;
  art: HeroArt;
}

export type EliteModifierId =
  | 'ARMORED'
  | 'FRENZIED'
  | 'VAMPIRIC'
  | 'REFLECTIVE'
  | 'BERSERKER'
  | 'ARCANE'
  | 'REGENERATING'
  | 'SWIFT'
  | 'FORTIFIED'
  | 'CURSED';

export interface EliteModifierDefinition {
  id: EliteModifierId;
  name: string;
  description: string;
  effects: EffectDefinition[];
}

export interface BossDefinition {
  id: string;
  name: string;
  title: string;
  floor: number;
  /** Enemy definition ids that fight alongside the boss in phase 1. */
  guards: string[];
  enemy: EnemyDefinition;
  phases: BossPhase[];
  introLines: string[];
}

export interface BossPhase {
  /** Phase becomes active once boss HP percent drops to or below this. */
  hpThreshold: number;
  name: string;
  /** Effects applied to the boss when the phase begins. */
  effects: EffectDefinition[];
  /** Enemy ids summoned when the phase begins. */
  summons?: string[];
  banner?: string;
}

/* ------------------------------------------------------------------ */
/* Blessings                                                           */
/* ------------------------------------------------------------------ */

export type BlessingRarity = 'RARE' | 'EPIC' | 'LEGENDARY';

export type BlessingTag =
  | 'OFFENSE'
  | 'DEFENSE'
  | 'SUSTAIN'
  | 'ENERGY'
  | 'CRIT'
  | 'FRONTLINE'
  | 'BACKLINE'
  | 'RANGER'
  | 'GUARDIAN'
  | 'WARRIOR'
  | 'SUPPORT'
  | 'ECONOMY'
  | 'RISK';

export interface BlessingDefinition {
  id: string;
  name: string;
  rarity: BlessingRarity;
  description: string;
  tags: BlessingTag[];
  maxStacks: number;
  effects: EffectDefinition[];
  /** Optional upgraded form used by the Crown Fragment relic. */
  upgradeTo?: string;
  /** Excluded from the regular offer pool (special unlocks). */
  offerable?: boolean;
  /** Only offered from this floor onwards. */
  minFloor?: number;
}

export interface OwnedBlessing {
  id: string;
  stacks: number;
}

/* ------------------------------------------------------------------ */
/* Relics                                                              */
/* ------------------------------------------------------------------ */

export type RelicRarity = 'COMMON' | 'RARE' | 'EPIC';

export type RelicTargeting = 'NONE' | 'SINGLE_ARMY' | 'DEAD_ARMY' | 'ALL_ARMIES' | 'MAP';

export type RelicUsage = 'MAP' | 'PRE_BATTLE' | 'ANY';

export interface RelicDefinition {
  id: string;
  name: string;
  rarity: RelicRarity;
  description: string;
  targeting: RelicTargeting;
  usage: RelicUsage;
  effects: EffectDefinition[];
  price: number;
  /** Relic cannot be used when this returns false. */
  requires?: 'DEAD_ARMY' | 'GUARDIAN_ALIVE' | 'BLESSING_CHOICE' | 'RARE_BLESSING';
}

export interface OwnedRelic {
  id: string;
  /** Unique instance id so duplicates can be removed individually. */
  uid: string;
}

/* ------------------------------------------------------------------ */
/* Map                                                                 */
/* ------------------------------------------------------------------ */

export type TileType =
  | 'EMPTY'
  | 'START'
  | 'ENEMY'
  | 'ELITE'
  | 'GUARDIAN'
  | 'TREASURE'
  | 'GOLD'
  | 'HEALING_FOUNTAIN'
  | 'SACRED_SPRING'
  | 'SHRINE'
  | 'MERCHANT'
  | 'RELIC'
  | 'EVENT'
  | 'RECRUITMENT_CAMP'
  | 'RESURRECTION_SHRINE'
  | 'ORACLE_TOWER'
  | 'ALTAR'
  | 'WAR_CAMP'
  | 'TEMPLE'
  | 'TRAP'
  | 'EXIT'
  | 'BLOCKED';

export type TileState = 'HIDDEN' | 'REVEALED' | 'CLEARED';

export interface TileData {
  id: string;
  x: number;
  y: number;
  type: TileType;
  state: TileState;
  /** Content already known to the player (scouting reveals without access). */
  scouted: boolean;
  /** Encounter payload for combat tiles. */
  encounterId?: string;
  /** Event definition id for EVENT tiles. */
  eventId?: string;
  /** Relic definition id for RELIC tiles. */
  relicId?: string;
  /** Gold payload for GOLD / TREASURE tiles. */
  gold?: number;
}

export interface EncounterUnit {
  defId: string;
  row: Row;
  slot: number;
  eliteModifiers?: EliteModifierId[];
  /** Applied on top of the floor multiplier. */
  powerMultiplier: number;
}

export interface EncounterData {
  id: string;
  kind: CombatantKind;
  units: EncounterUnit[];
  goldReward: number;
  bossId?: string;
  /** Display name used by the pre-battle screen. */
  name: string;
}

export interface MapData {
  width: number;
  height: number;
  startTileId: string;
  guardianTileId: string;
  exitTileId: string;
  tiles: TileData[];
  encounters: Record<string, EncounterData>;
  biomeId: string;
  floor: number;
}

/* ------------------------------------------------------------------ */
/* Run / profile state                                                 */
/* ------------------------------------------------------------------ */

export type GameMode = 'NORMAL' | 'ENDLESS' | 'DAILY';

export interface ArmyRunState {
  /** Stable id within the run (heroes can appear once, mercenaries get generated ids). */
  id: string;
  heroId: string;
  lieutenantId?: string;
  /**
   * Persistent health as a ratio of the army's current Max HP (0..1).
   *
   * Stored as a ratio rather than an absolute value so that Max HP changes
   * mid-run (Vitality, Cursed Crown, ...) never silently kill or heal an army.
   * `armyCurrentHP()` converts it to absolute HP where needed.
   */
  hpRatio: number;
  alive: boolean;
  row: Row;
  slot: number;
  /** Temporary per-floor stat modifiers (War Camp etc.). */
  floorModifiers: RunStatModifier[];
  /** Temporary per-battle modifiers granted by relics. */
  battleModifiers: RunStatModifier[];
  /** Mercenaries are removed at the end of the run and have no profile progression. */
  temporary?: boolean;
  /** Mercenary armies expire at the end of this floor. */
  expiresAfterFloor?: number;
}

export interface RunStatModifier {
  stat: StatKey;
  mode: 'PERCENT' | 'FLAT';
  value: number;
  sourceId: string;
}

export interface RunStatistics {
  enemiesDefeated: number;
  elitesDefeated: number;
  guardiansDefeated: number;
  battlesWon: number;
  blessingsCollected: number;
  legendaryBlessings: number;
  goldCollected: number;
  treasuresOpened: number;
  relicsUsed: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  healingFountainsUsed: number;
  armiesLost: number;
  floorsCleared: number;
}

export interface SerializedMapState {
  map: MapData;
  /** Ids of encounters already defeated on this floor. */
  defeatedEncounterIds: string[];
  collectedNodeIds: string[];
  guardianDefeated: boolean;
}

export interface RunState {
  schemaVersion: number;
  seed: number;
  mode: GameMode;
  floor: number;
  ascensionLevel: number;
  gold: number;
  armies: ArmyRunState[];
  blessings: OwnedBlessing[];
  relics: OwnedRelic[];
  /** Run-wide stat modifiers granted by events (Cursed Crown, ...). */
  runModifiers: RunStatModifier[];
  currentMap: SerializedMapState | null;
  runStats: RunStatistics;
  startedAt: number;
  elapsedMs: number;
  /** Per-run counters for oncePer bookkeeping and hero passives. */
  flags: Record<string, number>;
  /** Pending blessing offer so a reload lands on the same choice. */
  pendingReward: PendingReward | null;
  /** RNG cursor so reloading a run cannot reroll content. */
  rngState: number;
  maxArmySlots: number;
  heroStats: Record<string, HeroRunTracking>;
  finished?: 'WON' | 'LOST';
}

export interface HeroRunTracking {
  damageDealt: number;
  damageAbsorbed: number;
  healingDone: number;
  kills: number;
  skillsCast: number;
  battlesWon: number;
}

export interface PendingReward {
  kind: 'BLESSING' | 'CHECKPOINT';
  blessingIds: string[];
  rerollsUsed: number;
  /** Floor this offer belongs to. */
  floor: number;
  /** Checkpoint chest payload. */
  chest?: CheckpointChest;
}

export interface CheckpointChest {
  gold: number;
  relicIds: string[];
  healPercent: number;
}

export interface LifetimeStatistics {
  runsStarted: number;
  runsWon: number;
  enemiesDefeated: number;
  elitesDefeated: number;
  guardiansDefeated: number;
  treasuresOpened: number;
  relicsUsed: number;
  legendaryBlessings: number;
  blessingsCollected: number;
  goldCollected: number;
  totalPlayTimeMs: number;
  bestRunTimeMs: number;
  deepestFloorPerHero: Record<string, number>;
}

export interface PlayerSettings {
  musicVolume: number;
  sfxVolume: number;
  battleSpeed: number;
  autoFormation: boolean;
  reduceMotion: boolean;
  showDamageNumbers: boolean;
}

export interface HeroMasteryProgress {
  tier: number;
  progress: Record<string, number>;
}

export interface PlayerProfile {
  schemaVersion: number;
  unlockedHeroes: string[];
  heroMastery: Record<string, HeroMasteryProgress>;
  highestFloor: number;
  highestAscension: number;
  highestEndlessFloor: number;
  achievements: string[];
  crownShards: number;
  kingdomMastery: string[];
  totalStats: LifetimeStatistics;
  settings: PlayerSettings;
  /** Set once Floor 20 has been beaten - gates Ascension / Lieutenants. */
  firstVictory: boolean;
  clearedAscensions: number[];
  daily: DailyRecord | null;
  unlockedFeatures: string[];
  seenIntro: boolean;
}

export interface DailyRecord {
  date: string;
  seed: number;
  bestScore: number;
  completed: boolean;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export type EventOutcomeType =
  | 'GOLD'
  | 'HEAL_ALL'
  | 'HEAL_ONE'
  | 'DAMAGE_ALL'
  | 'RELIC'
  | 'BLESSING_CHOICE'
  | 'BLESSING_UPGRADED_CHOICE'
  | 'REVEAL_MAP'
  | 'BLESSING_REROLL'
  | 'SPAWN_ELITE'
  | 'SPAWN_DUEL'
  | 'MERCENARY'
  | 'RUN_MODIFIER'
  | 'GUARDIAN_BUFF'
  | 'NOTHING'
  | 'RANDOM';

export interface EventOutcome {
  type: EventOutcomeType;
  value?: number;
  /** For RANDOM: weighted sub-outcomes. */
  options?: { weight: number; outcome: EventOutcome; text: string }[];
  text?: string;
  /** For RUN_MODIFIER. */
  modifiers?: RunStatModifier[];
  relicRarity?: RelicRarity;
  blessingRarity?: BlessingRarity;
}

export interface EventChoice {
  id: string;
  label: string;
  /** Gold cost, blocks the choice when unaffordable. */
  cost?: number;
  /** Percent of current HP paid by every living army. */
  hpCost?: number;
  requires?: 'FREE_ARMY_SLOT' | 'DEAD_ARMY' | 'GOLD';
  outcome: EventOutcome;
  flavor?: string;
}

export interface EventDefinition {
  id: string;
  name: string;
  description: string;
  choices: EventChoice[];
  minFloor: number;
  weight: number;
  /** Only appears once Ascension III has unlocked the extended pool. */
  requiresFeature?: string;
}

/* ------------------------------------------------------------------ */
/* Floors / biomes / ascension                                         */
/* ------------------------------------------------------------------ */

export interface BiomeDefinition {
  id: string;
  name: string;
  floors: [number, number];
  palette: {
    background: number;
    tile: number;
    tileAlt: number;
    fog: number;
    accent: number;
    hazard: number;
  };
  decor: 'RUINS' | 'DUNES' | 'ICE' | 'SHADOW' | 'LAVA' | 'THRONE';
}

export interface FloorDefinition {
  floor: number;
  width: number;
  height: number;
  biomeId: string;
  /** Number of hostile tiles (excluding guardian). */
  enemyCount: [number, number];
  eliteCount: [number, number];
  /** Weighted table for the remaining non-combat tiles. */
  nodeWeights: Partial<Record<TileType, number>>;
  bossId?: string;
  isCheckpoint: boolean;
  blockedRatio: number;
}

export interface AscensionDefinition {
  level: number;
  name: string;
  description: string;
  enemyPowerBonus: number;
  extraElites: number;
  eliteModifierCount: number;
  guardianModifiers: number;
  healingNodeMultiplier: number;
  bossExtraPhase: boolean;
  legendaryEnemies: boolean;
  extraEvents: boolean;
}

/* ------------------------------------------------------------------ */
/* Achievements / meta                                                 */
/* ------------------------------------------------------------------ */

export type AchievementConditionType =
  | 'REACH_FLOOR'
  | 'DEFEAT_FLOOR'
  | 'WIN_WITHOUT_HEALING_FOUNTAIN'
  | 'WIN_WITH_ALL_ARMIES'
  | 'BLESSINGS_IN_RUN'
  | 'LEGENDARY_BLESSINGS_IN_RUN'
  | 'TOTAL_ENEMIES_DEFEATED'
  | 'TOTAL_TREASURES_OPENED'
  | 'TOTAL_RELICS_USED'
  | 'COMPLETE_ASCENSION'
  | 'REACH_ENDLESS_FLOOR';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  condition: { type: AchievementConditionType; value?: number };
  crownShards: number;
}

export interface KingdomMasteryDefinition {
  id: string;
  name: string;
  description: string;
  cost: number;
  order: number;
}
