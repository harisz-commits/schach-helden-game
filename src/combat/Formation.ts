import type { Row } from '../core/types';
import { GameConfig } from '../core/GameConfig';

export const SLOTS_PER_ROW = GameConfig.run.formationSlotsPerRow;

export interface FormationSlot {
  row: Row;
  slot: number;
}

/** All 8 formation slots (4 front, 4 back) in display order. */
export const ALL_SLOTS: FormationSlot[] = [
  ...Array.from({ length: SLOTS_PER_ROW }, (_, i) => ({ row: 'FRONT' as Row, slot: i })),
  ...Array.from({ length: SLOTS_PER_ROW }, (_, i) => ({ row: 'BACK' as Row, slot: i })),
];

/** Lane geometry in abstract combat units, mirrored for the enemy side. */
export function slotPosition(side: 'PLAYER' | 'ENEMY', row: Row, slot: number): { x: number; y: number } {
  const lane = GameConfig.combat.lane;
  const depth = row === 'FRONT' ? lane.frontX : lane.backX;
  const x = side === 'PLAYER' ? -depth : depth;
  const y = (slot - (SLOTS_PER_ROW - 1) / 2) * lane.slotSpacing;
  return { x, y };
}

export function slotKey(row: Row, slot: number): string {
  return `${row}:${slot}`;
}

/** Default placement: tanks and melee up front, ranged and support behind. */
export function autoAssign(
  entries: { id: string; preferredRow: Row }[],
): Map<string, FormationSlot> {
  const result = new Map<string, FormationSlot>();
  const used = { FRONT: 0, BACK: 0 } as Record<Row, number>;
  const order = [...entries].sort((a, b) => (a.preferredRow === b.preferredRow ? 0 : a.preferredRow === 'FRONT' ? -1 : 1));
  for (const entry of order) {
    const preferred = entry.preferredRow;
    const other: Row = preferred === 'FRONT' ? 'BACK' : 'FRONT';
    const row = used[preferred] < SLOTS_PER_ROW ? preferred : other;
    const slot = used[row];
    used[row] += 1;
    result.set(entry.id, { row, slot: Math.min(slot, SLOTS_PER_ROW - 1) });
  }
  return result;
}

/** True when a slot is free for the given army set. */
export function isSlotFree(
  assignments: Map<string, FormationSlot>,
  row: Row,
  slot: number,
  ignoreId?: string,
): boolean {
  for (const [id, value] of assignments) {
    if (id === ignoreId) continue;
    if (value.row === row && value.slot === slot) return false;
  }
  return true;
}
