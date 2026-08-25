# CROWNBOUND — Balance

Every number in this document lives in `src/core/GameConfig.ts`. Nothing that
affects balance is hard-coded anywhere else in the project, so tuning the game
means editing one file.

The values here were not guessed. `tests/balance.test.ts` plays complete
20-floor expeditions through the **real** combat engine and reports fight
duration and health attrition per floor band; the numbers below are what that
harness measures. Run it yourself:

```bash
BALANCE_LOG=1 npx vitest run tests/balance.test.ts
```

---

## 1. Floor scaling

```
floorMultiplier(f) = 1 + linear * (f - 1) + quadratic * (f - 1)^2
```

| Parameter   | Value    |
| ----------- | -------- |
| `linear`    | `0.035`  |
| `quadratic` | `0.0012` |

| Floor | Multiplier |
| ----- | ---------- |
| 1     | 1.00       |
| 5     | 1.16       |
| 10    | 1.41       |
| 15    | 1.73       |
| 20    | 2.10       |

**Why this differs from the original design draft.** The draft specified
`0.10 / 0.006`, which reaches ×5.07 by Floor 20. In CROWNBOUND the player has no
levels and no gear — their only power growth is blessings, worth roughly
×1.6–×2.0 over a full run. Enemy HP *and* enemy damage both scale with this
multiplier, so the difficulty a player feels grows with its **square**. At ×5 the
late game became an unwinnable stat check: the simulation wiped on Floor 9–12 in
every seed. A curve that ends near ×2.1 keeps enemy growth in step with blessing
growth, which is what makes the last floors hard-but-fair rather than impossible.

Endless floors past 20 keep compounding at `endlessExtraPerFloor = 0.045` per
floor on top of the campaign curve.

### Per-kind multipliers

| Kind     | Multiplier |
| -------- | ---------- |
| Enemy    | ×1.00      |
| Elite    | ×1.30      |
| Guardian | ×1.45      |
| Boss     | ×1.50      |
| Summon   | ×0.60      |

Guardians and bosses additionally get `guardianHPBonus = ×1.10` so their fights
last long enough for their phases to matter.

### Enemy stat conversion

```
maxHP   = base.maxHP   * multiplier * enemyHPFactor      (1.45)
attack  = base.attack  * multiplier * enemyAttackFactor  (2.20)
defense = base.defense * multiplier ^ enemyDefenseExponent (0.55)
```

Defence deliberately grows on a softer curve. If defence scaled linearly, late
floors would turn into unreadable HP sponges where every hit chips off a
fraction of a percent.

`enemyHPFactor` sets **fight length**; `enemyAttackFactor` sets **attrition**.
They are the two knobs to reach for first when re-tuning.

---

## 2. Measured combat bands

Design targets: normal fights 8–20 s, guardian and boss fights 15–35 s.

| Floors | Fight    | Duration | Pool HP lost |
| ------ | -------- | -------- | ------------ |
| 1–4    | Normal   | 8.9 s    | 0.8 %        |
| 1–4    | Elite    | 10.7 s   | 1.0 %        |
| 1–4    | Guardian | 16.0 s   | ~0 %         |
| 13–16  | Normal   | 18.1 s   | 3.0 %        |
| 13–16  | Guardian | 23.3 s   | 1.6 %        |
| 17–20  | Normal   | 20.3 s   | 4.0 %        |
| 17–20  | Elite    | 20.7 s   | 6.3 %        |
| 17–20  | Guardian | 19.0 s   | 10.1 %       |

"Pool HP lost" is the share of the **whole expedition's** health spent on one
fight. It has to be small: a full run is around 100 battles fought on a single
health pool, so even 3 % per fight is a serious cost.

The final boss is the intended wall. Measured against a representative
mid-strength build:

| Arrive at | Result       |
| --------- | ------------ |
| 100 % HP  | Win, ~38 s   |
| 80 % HP   | Win, ~43 s   |
| 60 % HP   | Win, ~55 s   |
| 40 % HP   | Loss         |

Naive simulated play — fights everything, never buys, never uses a relic, picks
blessings semi-randomly — reaches Floor 15–20 and loses. That is the intended
shape: the first Floor 20 clear should take several attempts and require actually
using the systems.

---

## 3. Hero base stats

Player armies are **armies**, not individuals, so their health pools are an
order of magnitude larger than a single enemy's. This is what makes ~100 fights
on one pool readable: a normal fight costs an army a visible slice of its bar
rather than an unreadable rounding error.

| Hero    | Class     | Max HP | Attack | Defense | Atk Speed | Range |
| ------- | --------- | ------ | ------ | ------- | --------- | ----- |
| Auren   | Guardian  | 17 500 | 92     | 88      | 0.85      | Melee |
| Borin   | Warrior   | 14 200 | 138    | 62      | 0.95      | Melee |
| Lyra    | Ranger    | 9 800  | 142    | 38      | 1.10      | Long  |
| Kael    | Arcanist  | 10 100 | 96     | 40      | 0.80      | Mid   |
| Elara   | Support   | 10 800 | 82     | 44      | 0.85      | Mid   |
| Garran  | Guardian  | 18 200 | 100    | 82      | 0.80      | Melee |
| Nyra    | Rider     | 11 600 | 152    | 48      | 1.15      | Melee |
| Seraph  | Guard/Sup | 16 800 | 104    | 76      | 0.85      | Reach |
| Darius  | Warrior   | 15 000 | 150    | 62      | 0.90      | Melee |

Enemy base HP sits between 420 (Shade) and 1 520 (Royal Guard); a warband of
4–6 of them is what a five-army expedition is sized against.

---

## 4. Damage formula

```
raw       = base * abilityMultiplier * variance * crit * outgoingAmps * incomingAmps * stalemate
mitigated = raw * (100 / (100 + targetDefense))
final     = mitigated * (1 - damageReduction)
```

- `variance` — uniform 0.95–1.05, seeded, so fights look organic but stay reproducible
- `crit` — `critDamage` (base 1.5) when the seeded roll beats `critChance` (base 5 %)
- `damageReduction` stacks **multiplicatively**, so three 45 % sources never reach immunity
- `stalemate` — after 40 s every combatant gains +3 % damage per second, so no fight
  can stall; the 90 s hard cap is a safety net that should never be hit

---

## 5. Energy

| Parameter                | Value |
| ------------------------ | ----- |
| Energy to cast           | 100   |
| Starting energy          | 25    |
| Per basic attack         | 14    |
| Per 1 % Max HP lost      | 0.4   |
| Cap on energy per hit    | 12    |

Starting energy exists for a real reason: at 0 starting energy and +10 per
swing, a 10-second normal battle ended before anyone reached 100 and **active
skills never appeared outside boss fights**. `tests/combat.test.ts` now asserts
that skills fire in ordinary battles.

---

## 6. Blessing rarity

| Floors | Rare | Epic | Legendary |
| ------ | ---- | ---- | --------- |
| 1–4    | 75 % | 23 % | 2 %       |
| 5–8    | 65 % | 31 % | 4 %       |
| 9–12   | 55 % | 38 % | 7 %       |
| 13–16  | 45 % | 43 % | 12 %      |
| 17–20  | 35 % | 45 % | 20 %      |

Checkpoint chests (Floors 4, 8, 12, 16) roll one band higher.

---

## 7. Gold economy

| Source          | Gold    |
| --------------- | ------- |
| Normal enemy    | 10–25   |
| Elite           | 30–60   |
| Guardian        | 50–100  |
| Treasure        | 20–100  |
| Gold node       | 15–40   |
| Checkpoint chest| 90–160  |

Gold exists only inside a run. A typical floor yields roughly 120–200 gold,
against merchant prices of 40–140, so a floor buys one or two meaningful things.

| Merchant item     | Price   |
| ----------------- | ------- |
| Small heal (30 %) | 40      |
| Large heal (15 % all) | 90  |
| Relic             | 45–100  |
| Epic relic        | 120     |
| Blessing reroll   | 50      |
| Sealed blessing   | 120     |
| Floor attack buff | 70      |

`Merchant Coin` halves the next merchant's prices; `Battle Spoils` adds +20 %
gold per stack.

---

## 8. Healing economy

This is the tightest constraint in the game. Roughly 100 fights are fought on
one health pool, so healing supply is what decides how deep a run goes.

| Source              | Heal                      |
| ------------------- | ------------------------- |
| Healing Fountain    | 35 % Max HP, one army     |
| Sacred Spring       | 12 % Max HP, all armies   |
| Resurrection Shrine | Revive at 35 % HP         |
| Checkpoint chest    | 15 % Max HP, all armies   |
| Healing Chalice     | 30 % Max HP, one army     |
| Greater Chalice     | 15 % Max HP, all armies   |
| Bloodlust (Epic)    | 4 % Max HP after each win |
| Recovery (Rare)     | 3 % to the most wounded   |

A fountain restores 35 % to **one** army — 7 % of a five-army pool. Sustain
blessings that trigger after every battle are worth far more over a run than any
single node, which is the intended build tension.

---

## 9. Ascension

| Level | Enemy power | Additional rule                        |
| ----- | ----------- | -------------------------------------- |
| I     | +12 %       | —                                      |
| II    | +24 %       | More elites                            |
| III   | +36 %       | Darker events. Unlocks Endless Kingdom |
| IV    | +48 %       | Guardians carry an elite modifier      |
| V     | +60 %       | Elite warbands everywhere              |
| VI    | +72 %       | Healing nodes ×0.55 as common          |
| VII   | +84 %       | Elites carry two modifiers             |
| VIII  | +96 %       | Guardians gain an extra ability        |
| IX    | +108 %      | Legendary enemy variants               |
| X     | +120 %      | The Crownless King gains a 4th phase   |

---

## 10. Map generation

| Parameter                | Value |
| ------------------------ | ----- |
| Min guardian distance    | 3     |
| Min exit distance        | 4     |
| Required routes to guardian | 2  |
| Min walkable share       | 62 %  |
| Blocked ratio            | 14–17 % |
| Generation retries       | 60    |

"Two routes" means literally two: `countIndependentRoutes` verifies that no
single tile can be removed without disconnecting the spawn from the guardian.
`tests/map.soak.test.ts` checks thousands of seeds against this and against
reachability of every walkable tile.

---

## 11. Meta progression

| Source                | Crown Shards |
| --------------------- | ------------ |
| New deepest floor     | 5            |
| Achievement           | 10–150       |
| Ascension first clear  | 50           |
| Endless milestone (10) | 30          |

Kingdom Mastery deliberately sells **utility, never power** — starting gold, a
reroll, a starting relic, an extra merchant slot, one more treasure on Floor 1.
Nothing here makes an army stronger, because a roguelite that can be bought is
not a roguelite.
