# CROWNBOUND

A tactical roguelite expedition game for the browser. You lead five armies into
a twenty-floor kingdom: reveal the map tile by tile, choose your route, fight
auto-resolved battles, and carry every wound you take with you to the next
fight.

Built with TypeScript, Phaser 3 and Vite. No backend, no database — everything
runs client-side and is designed to deploy to YouTube Playables.

---

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
```

| Command                  | What it does                                         |
| ------------------------ | ---------------------------------------------------- |
| `npm run dev`            | Dev server with hot reload and the debug panel        |
| `npm run build`          | Typecheck, then production build into `dist/`         |
| `npm run build:youtube`  | Production build tuned for YouTube Playables          |
| `npm run preview`        | Serve the production build locally                    |
| `npm test`               | Full test suite                                       |
| `npm run test:watch`     | Tests in watch mode                                   |
| `npm run test:soak`      | Map generation soak test across 3 000 seeds           |
| `npm run typecheck`      | `tsc --noEmit`                                        |

---

## The game

**One run = 20 floors.** Roughly 30–50 minutes. You can close the tab at any
point and pick up exactly where you left off.

Each floor plays out the same way:

```
enter the floor
   └─ a small area is visible, everything else is fog
      └─ tap an adjacent tile to resolve it
         └─ the fog opens around whatever you clear
            └─ enemy tiles block the way until you beat them
               └─ find and defeat the Guardian
                  └─ the exit unlocks
                     └─ keep exploring, or descend
                        └─ choose one of three blessings
```

**Damage is permanent.** Auren ends a fight at 71 % and starts the next one at
71 %. An army that hits 0 HP is out for the rest of the run unless you find a
Resurrection Shrine, a Resurrection Rune or Phoenix Oath. When every army is
down, the run ends.

**Five biomes**: Emerald Ruins (1–4), Sunken Sands (5–8), Frozen Dominion
(9–12), Shadow Realm (13–16), Burning Empire (17–19), and the Golden Throne
(20), where the Crownless King is waiting.

Beating Floor 20 for the first time unlocks Ascension I–X, the Lieutenant
system, Seraph, new events and — at Ascension III — the Endless Kingdom.

---

## Project structure

```
src/
  core/          types, seeded RNG, event bus, GameConfig (all balance numbers)
  platform/      GamePlatform interface + Local and YouTube adapters
  data/          heroes, enemies, blessings, relics, events, bosses, floors,
                 ascensions, achievements — pure content, no logic
  map/           MapGenerator, MapState, FogSystem, PathValidator,
                 EncounterGenerator
  combat/        CombatEngine, Combatant, Formation, TargetingSystem,
                 DamageSystem
  effects/       EffectEngine, TriggerSystem, EffectTypes — the generic
                 trigger/effect interpreter every content type runs through
  run/           RunManager (everything between battles), GameSession,
                 StatResolver, RunEffectHost
  progression/   ProgressionManager: unlocks, mastery, achievements, shards
  save/          SaveManager, schema migration, save types
  scenes/        Boot, MainMenu, HeroSelect, Map, Battle, Reward, Collection,
                 Records, RunEnd
  ui/            theme, BaseScene, components, overlays, procedural sprites
  audio/         AudioManager (WebAudio, no asset files)
  debug/         DebugPanel and DevBridge — stripped from production builds
tests/           RNG, map, combat, blessings, save, progression, balance
```

---

## Architecture

### Everything is data

Heroes, enemies, blessings, relics, events, bosses and elite modifiers are all
plain definition objects. A generic **effect/trigger system** interprets them,
so the combat engine has no idea what "Bloodlust" or "Phoenix Oath" are. There
is no `if (blessing === 'bloodlust')` anywhere in the codebase.

An effect looks like this:

```ts
{
  type: 'HEAL',
  trigger: 'ON_BATTLE_WON',
  target: { scope: 'ALLIES', row: 'FRONT' },
  magnitude: 'MAX_HP',
  value: 0.06,
}
```

Triggers cover the whole lifecycle — `ON_BATTLE_START`, `ON_BASIC_ATTACK`,
`ON_CRIT`, `ON_SKILL_CAST`, `ON_KILL`, `ON_DAMAGE_TAKEN`, `ON_ARMY_DEATH`,
`ON_GUARDIAN_KILL`, `ON_FLOOR_START`, `ON_TREASURE_OPEN` and more. Effects can
carry conditions (`SELF_HP_BELOW`, `ALLY_ALIVE_COUNT`, `BATTLE_TIME_BEFORE`),
a `chance`, an `everyNth` counter and a `oncePer: BATTLE | FLOOR | RUN` limit.

The same engine runs inside battles (`CombatEngine`) and on the map
(`RunEffectHost`), so a blessing that heals after a victory and one that buffs
during a fight are written the same way.

### Determinism

Every run has a seed, and every random decision goes through `RNG` (mulberry32,
serialisable to a single uint32). The same seed produces the same map, the same
warbands, the same blessing offers and — given the same formation — the same
battle, tick for tick. That is what makes the Daily Kingdom shareable and the
tests meaningful.

The RNG cursor is stored in the save file, so reloading a run can never reroll
content you already saw.

### Combat

A fixed-timestep simulation at 30 Hz, fully decoupled from rendering. Each unit
independently picks a target, closes to weapon range, attacks, builds energy,
and fires its active skill at 100 Energy. `BattleScene` is a pure view over the
simulation — it reads a combat log and draws it.

```
damage = attack * abilityMultiplier * variance * crit * modifiers
         * (100 / (100 + targetDefense)) * (1 - damageReduction)
```

### Map generation

Every floor is generated and then **validated** before the player sees it:

- the Guardian is reachable and never adjacent to the spawn
- the exit is reachable
- no walkable tile is stranded
- at least two *independent* routes lead to the Guardian — verified by checking
  that no single tile can be removed without disconnecting spawn from Guardian

If a candidate layout fails, the generator retries; if a chokepoint is the only
problem, it opens a wall to create a loop. `tests/map.soak.test.ts` runs this
across thousands of seeds.

### Persistent health

Army health is stored as a **ratio**, not an absolute value. This matters:
blessings like Vitality change an army's Max HP mid-run, and a ratio keeps that
consistent instead of silently healing or killing the army. `StatResolver`
converts to absolute HP wherever it is needed.

---

## Save system

Two independent states, both versioned:

- **RunState** — seed, floor, gold, armies, blessings, relics, the current map,
  run statistics, RNG cursor. Dropped when the run ends.
- **PlayerProfile** — unlocked heroes, hero mastery, records, achievements,
  Crown Shards, Kingdom Mastery, settings. Permanent.

Autosave is debounced and fires after every meaningful change: tile reveal,
battle, blessing choice, relic use, purchase, event choice, floor transition,
unlock and run end. It also flushes on pause and page hide, so closing the tab
mid-floor loses nothing.

`SaveMigration.ts` upgrades old saves in order and repairs partial ones. A save
written by a *newer* build keeps its profile and drops its run rather than
crashing.

---

## YouTube Playables integration

`src/platform/` is the only place that knows a host SDK exists.

```ts
interface GamePlatform {
  initialize(): Promise<void>;
  firstFrameReady(): void;
  gameReady(): void;
  saveData(data: string): Promise<void>;
  loadData(): Promise<string | null>;
  isAudioEnabled(): boolean;
  onAudioChange(callback: (enabled: boolean) => void): void;
  onPause(callback: () => void): void;
  onResume(callback: () => void): void;
  sendScore(score: number): void;
}
```

- `LocalPlatform` — localStorage plus the page visibility API. Used in dev and
  on the plain web.
- `YouTubePlatform` — wraps the `ytgame` global. Every call is defensive: if a
  namespace is missing because the SDK moved, the game keeps running and loses
  that one integration instead of crashing.

The adapter is chosen automatically by `createPlatform()`.

To ship to Playables:

1. `npm run build:youtube`
2. Load the official Playables SDK **before** the game bundle in `index.html`
3. Re-check the current official Playables requirements — they change, and this
   file is the only place that should need editing

Audio never overrides platform state: if the host mutes the game, `AudioManager`
mutes. Platform pause suspends the combat simulation, the scene, tweens, timers
and audio, and resume continues from exactly the same tick.

Scores are only sent when a genuine best is beaten: highest floor in Normal,
highest Endless floor in Endless.

---

## Adding content

### A hero

Add one entry to `src/data/heroes.ts`:

```ts
{
  id: 'newhero',
  name: 'New Hero',
  title: 'The Something',
  heroClass: 'WARRIOR',
  preferredRow: 'FRONT',
  baseStats: stats({ maxHP: 14000, attack: 140, defense: 60 }),
  art: { color: 0xa8503c, accent: 0xe0c273, shape: 'BLADE' },
  lore: 'One line of character.',
  activeSkill: {
    id: 'newhero_skill',
    name: 'Skill Name',
    description: 'What the player sees.',
    castTime: 0.3,
    effects: [
      { type: 'DAMAGE', target: { scope: 'ENEMIES', count: 2, sort: 'NEAREST' },
        magnitude: 'ATTACK', value: 1.8 },
    ],
  },
  passiveSkills: [{ id: '...', name: '...', description: '...', effects: [...] }],
  unlockCondition: { type: 'REACH_FLOOR', value: 10, label: 'Reach Floor 10' },
  mastery: mastery([ /* five tiers */ ]),
}
```

That is the whole change. The unlock manager, collection screen, mastery system
and combat engine all read from it. `shape` picks one of six procedural
silhouettes — swap in real artwork later by registering a texture under the same
key.

### A blessing

Add to `src/data/blessings.ts`. Set `rarity`, `maxStacks`, `tags` and effects:

```ts
{
  id: 'r17_example',
  name: 'Example',
  rarity: 'RARE',
  description: 'Front row armies gain +10% Attack Speed.',
  tags: ['OFFENSE', 'FRONTLINE'],
  maxStacks: 3,
  effects: [{
    type: 'MODIFY_STAT', stat: 'attackSpeed', mode: 'PERCENT',
    value: 0.1, target: { scope: 'ALLIES', row: 'FRONT' },
  }],
}
```

It enters the offer pool automatically. Set `offerable: false` to keep it out
(used for Crown Fragment upgrade forms), or `minFloor` to gate it.

### A relic

Add to `src/data/relics.ts`. `usage` decides where the button appears (`MAP`,
`PRE_BATTLE`, `ANY`), `targeting` decides whether the player picks an army, and
`requires` gates it (`DEAD_ARMY`, `GUARDIAN_ALIVE`, `RARE_BLESSING`, …).

### An enemy

Add to `src/data/enemies.ts` with `weight` (how often it is rolled) and
`minFloor` (when it starts appearing). Give it a `targeting` rule and optionally
an `activeSkill` and passives — it will start showing up in generated warbands
immediately.

### An event

Add to `src/data/events.ts`. Each choice has an `outcome` that `RunManager`
resolves — `GOLD`, `HEAL_ALL`, `RELIC`, `BLESSING_CHOICE`, `SPAWN_ELITE`,
`SPAWN_DUEL`, `MERCENARY`, `RUN_MODIFIER`, or a weighted `RANDOM` of several.

---

## Testing

```bash
npm test
```

| Suite               | Covers                                                       |
| ------------------- | ------------------------------------------------------------ |
| `rng.test.ts`       | Same seed → same sequence; state round-trip; daily seeds      |
| `map.test.ts`       | Floor validity across seeds and floors; determinism           |
| `map.soak.test.ts`  | Thousands of seeds: reachability, no softlocks, two routes, content |
| `combat.test.ts`    | Determinism, persistent damage, formation, scaling, blessings |
| `save.test.ts`      | Save → load fidelity, migration, partial-save repair          |
| `progression.test.ts` | Hero unlocks, achievements, mastery, ascension gating       |
| `run.test.ts`       | A complete 20-floor expedition driven through RunManager: floor transitions, rewards, guardian gating, save/resume, loss |
| `modes.test.ts`     | Endless past Floor 20, Daily seed sharing, Lieutenants        |
| `balance.test.ts`   | Full 20-floor simulations; asserts duration and attrition bands |

The balance suite doubles as a tuning tool:

```bash
BALANCE_LOG=1 npx vitest run tests/balance.test.ts
```

See [BALANCE.md](BALANCE.md) for the numbers and the reasoning behind them.

---

## Debug tools

Development builds only — `DEBUG_ENABLED` is false in production and the whole
module tree-shakes away.

A **DBG** button on the map screen opens a panel: add gold, blessings and
relics, reveal the map, damage or kill armies, heal everything, skip floors,
jump to Floor 19, unlock all heroes, grant first victory, add Crown Shards,
spawn an event, reset the profile.

`window.__crownbound` exposes a small scripting surface for the console:

```js
__crownbound.frontier()          // tiles you can act on
__crownbound.tap('ENEMY')        // act on a tile by id or type
__crownbound.armies()            // health of every army
__crownbound.labels()            // every visible label on screen
__crownbound.findLabel('CLOSE')  // where a button is, so you can click it
```

`findLabel` is registered in every scene, which makes the whole UI - modals
included - drivable through the real input pipeline rather than by guessing
coordinates.

---

## Mobile first

Touch is the primary input: tap, drag and scroll, with no interaction anywhere
requiring hover. Mouse and keyboard work fully as well. Every screen is rebuilt
on resize rather than scaled, so the layout adapts to any aspect ratio — the
battlefield even rotates on portrait phones so the two sides face each other
top-to-bottom instead of being squeezed into a narrow lane.

---

## Licence and assets

All content is original. Names, heroes, enemies, abilities, UI, text and art are
written for this project. Placeholder art is generated procedurally at runtime
(`src/ui/Sprites.ts`, `src/ui/TileGlyphs.ts`) — there are no image or audio
files in the repository, and sound is synthesised with WebAudio oscillators.
