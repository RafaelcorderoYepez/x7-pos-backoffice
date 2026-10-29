// Table operating rules: parent-child union, mutation guards with live service,
// spatial validation against the canvas and transfer eligibility.
//
// Live out of sight on purpose: these are the rules that stories demand to prove
// (uniqueness, plane limits, circular lock, active order guard) and here you can
// try without mounting React or simulating fetch.

import type { DiningTable, FloorPlan, TableStatus } from '../types/dining-system';
import { tableFootprint } from '../types/dining-system';
import type { UnitSystem } from './measurement-units';
import { formatLength } from './measurement-units';

// ================= Father-son hierarchy =================

// /api/tables response embeds `parent_table: {id, number}` and writing DTOs
// they talk about `parent_table_id`. Always reading here prevents half UI from seeing the union and the
// another half does not, depending on which endpoint the queue comes from.
export const parentTableId = (t: Pick<DiningTable, 'parent_table' | 'parent_table_id'>): number | null =>
  t.parent_table?.id ?? t.parent_table_id ?? null;

export const isJoined = (t: DiningTable): boolean => parentTableId(t) != null;

export const childTablesOf = (tables: DiningTable[], parentId: number): DiningTable[] =>
  tables.filter((t) => parentTableId(t) === parentId);

// All the offspring of a table, not just its direct children: this is what is needed to
// close the circular lock in chains of three or more (A -> B -> C -> A).
// The `seen` cuts the traversal if the data already comes with a backend loop, so as not to
// hang the UI in an infinite loop while a select is painted.
export const descendantTableIds = (tables: DiningTable[], rootId: number): Set<number> => {
  const found = new Set<number>();
  const queue: number[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as number;
    for (const t of tables) {
      if (parentTableId(t) !== current || found.has(t.id)) continue;
      found.add(t.id);
      queue.push(t.id);
    }
  }
  return found;
};

export const CIRCULAR_PARENT_ERROR =
  'A table cannot be joined to itself or to one of its own child tables.';

// The backend only checks the one-hop cycle (parent.parent_table_id === id), so
// long chains are blocked here before being persisted.
export const wouldCreateCycle = (
  tables: DiningTable[],
  tableId: number,
  candidateParentId: number,
): boolean =>
  candidateParentId === tableId || descendantTableIds(tables, tableId).has(candidateParentId);

// Candidates for mother table: all except herself and her own offspring.
export const eligibleParentTables = (tables: DiningTable[], tableId: number): DiningTable[] => {
  const blocked = descendantTableIds(tables, tableId);
  return tables.filter((t) => t.id !== tableId && !blocked.has(t.id));
};

// Label of the joining badge of a daughter row: "Joined to T-01".
export const joinedToLabel = (
  tables: DiningTable[],
  table: DiningTable,
): string => {
  const parentId = parentTableId(table);
  if (parentId == null) return '';
  const parent = tables.find((t) => t.id === parentId);
  return `Joined to ${parent?.number ?? table.parent_table?.number ?? `#${parentId}`}`;
};

// Badge label of a mother row: "2 tables joined".
export const joinedChildrenLabel = (tables: DiningTable[], parentId: number): string => {
  const n = childTablesOf(tables, parentId).length;
  if (n === 0) return '';
  return `${n} ${n === 1 ? 'table' : 'tables'} joined`;
};

// ================= Uniqueness of the number =================

export const duplicateTableNumberError = (number: string): string =>
  `Table number '${number.trim()}' already exists for this merchant.`;

// Compares without considering capital letters or extra spaces: the base unique index is
// sensitive to those differences, but for the operator 'a1' and 'A1' they are the same table and
// Letting you save both turns the grill into a minefield.
export const isDuplicateTableNumber = (
  tables: DiningTable[],
  candidate: string,
  currentTableId?: number,
): boolean => {
  const value = candidate.trim().toLowerCase();
  if (!value) return false;
  return tables.some(
    (t) => t.id !== currentTableId && (t.number ?? '').trim().toLowerCase() === value,
  );
};

// ================= Spatial validation against the canvas =================

// pos_x/pos_y are the top left corner of the table, in canvas pixels. out
// of [0, width] × [0, height] the table disappears from the plane even if the row exists.
export const positionBoundsError = (
  pos_x: number,
  pos_y: number,
  plan: Pick<FloorPlan, 'name' | 'width' | 'height'> | undefined,
  system?: UnitSystem,
): string => {
  if (!plan) return '';
  const insideX = Number.isFinite(pos_x) && pos_x >= 0 && pos_x <= plan.width;
  const insideY = Number.isFinite(pos_y) && pos_y >= 0 && pos_y <= plan.height;
  if (insideX && insideY) return '';
  const w = system ? formatLength(plan.width, system) : `${plan.width}px`;
  const h = system ? formatLength(plan.height, system) : `${plan.height}px`;
  return `Table position must stay inside '${plan.name}': X between 0 and ${w}, Y between 0 and ${h}.`;
};

// Soft notice: the coordinate falls inside, but the table footprint sticks out over the edge.
// Does not block saving — the table is still reachable and repositionable in the editor.
export const footprintClipWarning = (
  table: Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape'> & {
    width?: number | null;
    height?: number | null;
  },
  plan: Pick<FloorPlan, 'width' | 'height'> | undefined,
): string => {
  if (!plan) return '';
  const { w, h } = tableFootprint(table);
  const overflowsX = table.pos_x >= 0 && table.pos_x + w > plan.width;
  const overflowsY = table.pos_y >= 0 && table.pos_y + h > plan.height;
  if (!overflowsX && !overflowsY) return '';
  return 'The table fits inside the canvas but part of its footprint hangs over the edge. Drag it in the editor to tidy the layout.';
};

export const rotationError = (rotation: number): string =>
  Number.isInteger(rotation) && rotation >= 0 && rotation <= 360
    ? ''
    : 'Rotation must be a whole number of degrees between 0 and 360.';

// ================= Live Duty Guard =================

export interface ActiveServiceContext {
  // UnreleasedAt assignments on this table: There is a waiter with the table in charge.
  activeAssignments?: number;
  // Commands open on the table. The backend doesn't expose them in /api/tables yet, so
  // By default it is 0 and the 'occupied' state is the signal that we do have.
  openOrders?: number;
}

// An occupied table (or one with a live waiter/order) is not deleted or moved from plane to zone:
// the POS would lose track of an open order.
export const activeServiceGuard = (
  table: Pick<DiningTable, 'number' | 'status'>,
  ctx: ActiveServiceContext = {},
): string => {
  const busy =
    table.status === 'occupied' ||
    (ctx.activeAssignments ?? 0) > 0 ||
    (ctx.openOrders ?? 0) > 0;
  return busy
    ? `Cannot modify or remove Table ${table.number} while it has an active guest order or assigned server. Please close open orders first.`
    : '';
};

// What changes count as "moving the table" and therefore remain under guard.
// Renaming, relocating on the canvas, or changing shape is still allowed with the table occupied:
// It does not break the relationship with the command.
export const changesTableLayout = (
  table: DiningTable,
  next: { floorPlan?: number | null; floorZone?: number | null },
): boolean => {
  const planChanged =
    next.floorPlan != null && next.floorPlan !== (table.floorPlan?.id ?? null);
  const zoneChanged =
    next.floorZone != null && next.floorZone !== (table.floorZone?.id ?? null);
  return planChanged || zoneChanged;
};

// ================= Transfer of diners =================

// Only a free table can receive a transfer: busy would duplicate orders and
// out of order or in cleaning should not seat anyone.
export const canReceiveTransfer = (t: Pick<DiningTable, 'status'>): boolean =>
  t.status === 'available';

export const transferTargetError = (target: Pick<DiningTable, 'number'>): string =>
  `Target Table [${target.number}] is currently occupied or unavailable for transfer.`;

export const transferSourceError = (source: Pick<DiningTable, 'number'>): string =>
  `Table ${source.number} has no seated party to transfer.`;

// The origin has to be busy (there are diners to move) and the destination free.
export const eligibleTransferTargets = (
  tables: DiningTable[],
  sourceId: number,
): DiningTable[] => tables.filter((t) => t.id !== sourceId && canReceiveTransfer(t));

// ================= Liberation of the united group =================

// When the account is closed, the mother and daughters table returns to cleanliness: no one sits at
// a table that has not yet been wiped, and thus no one is left 'occupied' orphaned.
export const GROUP_RELEASE_STATUS: TableStatus = 'cleaning';

// Status that a daughter inherits when joining a busy mother (story 7).
export const inheritedChildStatus = (parentStatus: string): TableStatus | null =>
  parentStatus === 'occupied' ? 'occupied' : null;

// ================= Spatial presentation =================

// "Pos: [100, 150] | Circle | 90°" — the compact reading that the grid asks for.
export const formatSpatialSummary = (
  t: Pick<DiningTable, 'pos_x' | 'pos_y' | 'shape' | 'rotation'>,
): string => {
  const x = Math.round(t.pos_x ?? 0);
  const y = Math.round(t.pos_y ?? 0);
  return `Pos: [${x}, ${y}] | ${t.shape ?? 'Square'} | ${Math.round(t.rotation ?? 0)}°`;
};

export const formatSeats = (capacity: number): string =>
  `${capacity} ${capacity === 1 ? 'Seat' : 'Seats'}`;
