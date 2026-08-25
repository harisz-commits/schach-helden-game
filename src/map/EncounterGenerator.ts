import type { CombatantKind, EncounterData, EncounterUnit, EliteModifierId, Row } from '../core/types';
import { GameConfig } from '../core/GameConfig';
import { RNG } from '../core/RNG';
import { ELITE_MODIFIERS, enemyPool, getEnemy } from '../data/enemies';
import { getBoss } from '../data/bosses';
import { ascension } from '../data/ascensions';

export interface EncounterRequest {
  id: string;
  floor: number;
  kind: CombatantKind;
  ascensionLevel: number;
  bossId?: string;
}

const SLOTS_PER_ROW = GameConfig.run.formationSlotsPerRow;

function squadSize(floor: number, kind: CombatantKind, rng: RNG): number {
  if (kind === 'GUARDIAN' || kind === 'BOSS') return rng.int(3, 4);
  const base = floor <= 4 ? rng.int(4, 5) : floor <= 12 ? rng.int(4, 5) : rng.int(5, 6);
  return kind === 'ELITE' ? Math.min(SLOTS_PER_ROW * 2, base + 1) : base;
}

/** Assigns a unit to the next free slot of its preferred row, spilling over when full. */
function assignSlot(rows: Record<Row, number>, preferred: Row): { row: Row; slot: number } {
  const other: Row = preferred === 'FRONT' ? 'BACK' : 'FRONT';
  if (rows[preferred] < SLOTS_PER_ROW) {
    const slot = rows[preferred];
    rows[preferred] += 1;
    return { row: preferred, slot };
  }
  const slot = rows[other];
  rows[other] += 1;
  return { row: other, slot: Math.min(slot, SLOTS_PER_ROW - 1) };
}

function rollModifiers(rng: RNG, count: number): EliteModifierId[] {
  if (count <= 0) return [];
  return rng.pickMany(ELITE_MODIFIERS, count).map((mod) => mod.id);
}

function goldFor(kind: CombatantKind, rng: RNG): number {
  const eco = GameConfig.economy;
  if (kind === 'ELITE') return rng.int(eco.goldPerElite[0], eco.goldPerElite[1]);
  if (kind === 'GUARDIAN' || kind === 'BOSS') return rng.int(eco.goldPerGuardian[0], eco.goldPerGuardian[1]);
  return rng.int(eco.goldPerEnemy[0], eco.goldPerEnemy[1]);
}

/**
 * Builds the enemy warband for a tile. Only definition ids and multipliers are
 * stored - actual stats are resolved when the battle starts, so save files stay
 * small and rebalancing applies retroactively.
 */
export function generateEncounter(request: EncounterRequest, rng: RNG): EncounterData {
  const { floor, kind, ascensionLevel } = request;
  const asc = ascension(ascensionLevel);
  const rows: Record<Row, number> = { FRONT: 0, BACK: 0 };
  const units: EncounterUnit[] = [];
  let name = 'Warband';

  if ((kind === 'GUARDIAN' || kind === 'BOSS') && request.bossId) {
    const boss = getBoss(request.bossId);
    name = boss.name;
    const bossSlot = assignSlot(rows, boss.enemy.preferredRow);
    units.push({
      defId: boss.enemy.id,
      row: bossSlot.row,
      slot: bossSlot.slot,
      powerMultiplier: 1,
      ...(asc.guardianModifiers > 0 ? { eliteModifiers: rollModifiers(rng, asc.guardianModifiers) } : {}),
    });
    for (const guardId of boss.guards) {
      const def = getEnemy(guardId);
      const slot = assignSlot(rows, def.preferredRow);
      units.push({ defId: guardId, row: slot.row, slot: slot.slot, powerMultiplier: 0.75 });
    }
    return { id: request.id, kind, units, goldReward: goldFor(kind, rng), bossId: request.bossId, name };
  }

  const pool = enemyPool(floor);
  const size = squadSize(floor, kind, rng);

  if (kind === 'GUARDIAN') {
    // A non-boss floor guardian: the strongest available type, heavily buffed.
    const leader = rng.weighted(pool, (e) => (e.role === 'TANK' || e.role === 'BEAST' ? e.weight * 2 : e.weight));
    name = `${leader.name} Guardian`;
    const slot = assignSlot(rows, leader.preferredRow);
    units.push({
      defId: leader.id,
      row: slot.row,
      slot: slot.slot,
      powerMultiplier: 1,
      eliteModifiers: rollModifiers(rng, 1 + asc.guardianModifiers),
    });
    for (let i = 0; i < size; i++) {
      const def = rng.weighted(pool, (e) => e.weight);
      const s = assignSlot(rows, def.preferredRow);
      units.push({ defId: def.id, row: s.row, slot: s.slot, powerMultiplier: 0.8 });
    }
    return { id: request.id, kind, units, goldReward: goldFor(kind, rng), name };
  }

  for (let i = 0; i < size; i++) {
    const def = rng.weighted(pool, (e) => e.weight);
    const slot = assignSlot(rows, def.preferredRow);
    const unit: EncounterUnit = { defId: def.id, row: slot.row, slot: slot.slot, powerMultiplier: 1 };
    if (kind === 'ELITE' && i === 0) {
      unit.eliteModifiers = rollModifiers(rng, asc.eliteModifierCount);
      unit.powerMultiplier = 1;
      name = `Elite ${def.name}`;
    } else if (kind === 'ELITE') {
      unit.powerMultiplier = 0.85;
    }
    if (asc.legendaryEnemies && kind !== 'ELITE' && rng.bool(0.15)) {
      unit.eliteModifiers = rollModifiers(rng, 1);
      unit.powerMultiplier *= 1.1;
    }
    units.push(unit);
  }

  if (kind !== 'ELITE') {
    const lead = units[0];
    name = lead ? `${getEnemy(lead.defId).name} Warband` : 'Warband';
  }

  return { id: request.id, kind, units, goldReward: goldFor(kind, rng), name };
}

/** A duel is a single tough enemy with elite modifiers - used by the Duelist event. */
export function generateDuel(floor: number, ascensionLevel: number, rng: RNG, id: string): EncounterData {
  const pool = enemyPool(floor);
  const def = rng.weighted(pool, (e) => (e.role === 'BRUISER' || e.role === 'ASSASSIN' ? e.weight * 2 : e.weight));
  return {
    id,
    kind: 'ELITE',
    units: [
      {
        defId: def.id,
        row: def.preferredRow,
        slot: 0,
        powerMultiplier: 2.1,
        eliteModifiers: rollModifiers(rng, ascension(ascensionLevel).eliteModifierCount + 1),
      },
    ],
    goldReward: goldFor('ELITE', rng),
    name: `Duelist: ${def.name}`,
  };
}
