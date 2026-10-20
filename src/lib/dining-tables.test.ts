import { describe, expect, it } from 'vitest';
import type { DiningTable, FloorPlan } from '../types/dining-system';
import {
  activeServiceGuard,
  canReceiveTransfer,
  changesTableLayout,
  childTablesOf,
  descendantTableIds,
  duplicateTableNumberError,
  eligibleParentTables,
  eligibleTransferTargets,
  footprintClipWarning,
  formatSeats,
  formatSpatialSummary,
  inheritedChildStatus,
  isDuplicateTableNumber,
  isJoined,
  joinedChildrenLabel,
  joinedToLabel,
  parentTableId,
  positionBoundsError,
  rotationError,
  transferTargetError,
} from './dining-tables';

const table = (over: Partial<DiningTable> & { id: number }): DiningTable => ({
  merchant_id: 1,
  number: `T${over.id}`,
  capacity: 4,
  status: 'available',
  location: 'Main',
  rotation: 0,
  shape: 'Square',
  pos_x: 0,
  pos_y: 0,
  ...over,
});

const PLAN: FloorPlan = {
  id: 1,
  name: 'Main Floor Plan',
  width: 1000,
  height: 700,
  status: 'active',
};

describe('parentTableId', () => {
  it('reads the embedded object returned by /api/tables', () => {
    expect(parentTableId(table({ id: 2, parent_table: { id: 1, number: 'T-01' } }))).toBe(1);
  });

  it('reads the scalar that travels in the write DTOs', () => {
    expect(parentTableId(table({ id: 2, parent_table_id: 7 }))).toBe(7);
  });

  it('a loose table has no mother', () => {
    expect(parentTableId(table({ id: 2 }))).toBeNull();
    expect(isJoined(table({ id: 2 }))).toBe(false);
  });
});

describe('parent-child hierarchy', () => {
  const tables = [
    table({ id: 1, number: 'T-01' }),
    table({ id: 2, number: 'T-02', parent_table: { id: 1, number: 'T-01' } }),
    table({ id: 3, number: 'T-03', parent_table: { id: 2, number: 'T-02' } }),
    table({ id: 4, number: 'T-04' }),
  ];

  it('list direct children', () => {
    expect(childTablesOf(tables, 1).map((t) => t.id)).toEqual([2]);
  });

  it('runs through the entire offspring, not just one jump', () => {
    expect([...descendantTableIds(tables, 1)]).toEqual([2, 3]);
  });

  it('tag the join with the parent table number', () => {
    expect(joinedToLabel(tables, tables[1])).toBe('Joined to T-01');
    expect(joinedToLabel(tables, tables[0])).toBe('');
  });

  it('tag how many tables hang from a mother', () => {
    expect(joinedChildrenLabel(tables, 1)).toBe('1 table joined');
    expect(joinedChildrenLabel(tables, 4)).toBe('');
  });

  it('does not hang if the backend returns an already persisted loop', () => {
    const cyclic = [
      table({ id: 1, parent_table: { id: 2 } }),
      table({ id: 2, parent_table: { id: 1 } }),
    ];
    expect([...descendantTableIds(cyclic, 1)]).toEqual([2, 1]);
  });
});

describe('candado circular', () => {
  const tables = [
    table({ id: 1, number: 'A1' }),
    table({ id: 2, number: 'A2', parent_table: { id: 1 } }),
    table({ id: 3, number: 'A3', parent_table: { id: 2 } }),
  ];

  it('excludes the table itself as a mother', () => {
    expect(eligibleParentTables(tables, 1).map((t) => t.id)).not.toContain(1);
  });

  it('excludes direct daughters', () => {
    expect(eligibleParentTables(tables, 1).map((t) => t.id)).not.toContain(2);
  });

  it('exclude granddaughters: close strings that the backend doesn't see', () => {
    // The backend only compares parent.parent_table_id === id, so A3 would appear valid.
    expect(eligibleParentTables(tables, 1).map((t) => t.id)).not.toContain(3);
    expect(eligibleParentTables(tables, 1)).toHaveLength(0);
  });

  it('let a table outside the group pass', () => {
    const withOutsider = [...tables, table({ id: 9, number: 'B1' })];
    expect(eligibleParentTables(withOutsider, 1).map((t) => t.id)).toEqual([9]);
  });
});

describe('uniqueness of the number', () => {
  const tables = [table({ id: 1, number: 'A1' }), table({ id: 2, number: 'B2' })];

  it('detect duplicate ignoring capital letters and spaces', () => {
    expect(isDuplicateTableNumber(tables, ' a1 ')).toBe(true);
  });

  it('does not accuse herself when editing', () => {
    expect(isDuplicateTableNumber(tables, 'A1', 1)).toBe(false);
  });

  it('write the message that the operator expects', () => {
    expect(duplicateTableNumberError(' A1 ')).toBe(
      "Table number 'A1' already exists for this merchant.",
    );
  });
});

describe('spatial validation', () => {
  it('accepts a coordinate within the canvas', () => {
    expect(positionBoundsError(100, 150, PLAN)).toBe('');
  });

  it('reject a negative coordinate', () => {
    expect(positionBoundsError(-1, 150, PLAN)).toContain("must stay inside 'Main Floor Plan'");
  });

  it('rejects a coordinate beyond the width of the plane', () => {
    expect(positionBoundsError(1001, 150, PLAN)).toContain('X between 0 and 1000px');
  });

  it('rejects a coordinate beyond the height of the plane', () => {
    expect(positionBoundsError(100, 701, PLAN)).toContain('Y between 0 and 700px');
  });

  it('writes the limits on the unit in front of the user', () => {
    expect(positionBoundsError(1001, 150, PLAN, 'metric')).toContain('X between 0 and 10 m');
  });

  it('Without a chosen plan there is nothing to validate', () => {
    expect(positionBoundsError(9999, 9999, undefined)).toBe('');
  });

  it('warns (without locking) when the fingerprint protrudes from the edge', () => {
    const warning = footprintClipWarning(
      { pos_x: 960, pos_y: 100, shape: 'Square', width: 80, height: 80 },
      PLAN,
    );
    expect(warning).toContain('hangs over the edge');
  });

  it('does not warn when the entire table fits', () => {
    expect(
      footprintClipWarning({ pos_x: 100, pos_y: 100, shape: 'Square' }, PLAN),
    ).toBe('');
  });
});

describe('rotation', () => {
  it.each([0, 90, 360])('acepta %i grados', (deg) => {
    expect(rotationError(deg)).toBe('');
  });

  it.each([-1, 361, 45.5, NaN])('rechaza %s', (deg) => {
    expect(rotationError(deg)).toContain('between 0 and 360');
  });
});

describe('live duty guard', () => {
  it('locks a busy table with the story message', () => {
    expect(activeServiceGuard(table({ id: 1, number: 'A1', status: 'occupied' }))).toBe(
      'Cannot modify or remove Table A1 while it has an active guest order or assigned server. Please close open orders first.',
    );
  });

  it('blocks a free table that still has a waiter assigned', () => {
    expect(
      activeServiceGuard(table({ id: 1, number: 'A1' }), { activeAssignments: 1 }),
    ).toContain('Cannot modify or remove Table A1');
  });

  it('lock a table with open commands', () => {
    expect(activeServiceGuard(table({ id: 1, number: 'A1' }), { openOrders: 2 })).toContain(
      'Please close open orders first',
    );
  });

  it('let a free table pass without cover', () => {
    expect(activeServiceGuard(table({ id: 1, number: 'A1' }), { activeAssignments: 0 })).toBe('');
  });

  it('Only changing plans or areas counts as a move.', () => {
    const t = table({ id: 1, floorPlan: { id: 1 }, floorZone: { id: 10 } });
    expect(changesTableLayout(t, { floorPlan: 2, floorZone: 10 })).toBe(true);
    expect(changesTableLayout(t, { floorPlan: 1, floorZone: 11 })).toBe(true);
    expect(changesTableLayout(t, { floorPlan: 1, floorZone: 10 })).toBe(false);
  });
});

describe('transferencia', () => {
  const tables = [
    table({ id: 1, number: 'A1', status: 'occupied' }),
    table({ id: 2, number: 'B3', status: 'occupied' }),
    table({ id: 3, number: 'C2', status: 'available' }),
    table({ id: 4, number: 'D4', status: 'cleaning' }),
    table({ id: 5, number: 'E5', status: 'out_of_service' }),
  ];

  it('only one available table can receive diners', () => {
    expect(canReceiveTransfer(tables[2])).toBe(true);
    expect(canReceiveTransfer(tables[1])).toBe(false);
    expect(canReceiveTransfer(tables[3])).toBe(false);
    expect(canReceiveTransfer(tables[4])).toBe(false);
  });

  it('lists only the available ones as destination, excluding the origin', () => {
    expect(eligibleTransferTargets(tables, 1).map((t) => t.number)).toEqual(['C2']);
  });

  it('word the block with the number in square brackets, like the story', () => {
    expect(transferTargetError(tables[1])).toBe(
      'Target Table [B3] is currently occupied or unavailable for transfer.',
    );
  });
});

describe('group union and liberation', () => {
  it('a daughter inherits the status of a busy mother', () => {
    expect(inheritedChildStatus('occupied')).toBe('occupied');
  });

  it('with the free mother nothing is inherited', () => {
    expect(inheritedChildStatus('available')).toBeNull();
    expect(inheritedChildStatus('reserved')).toBeNull();
  });
});

describe('presentation', () => {
  it('summarizes the placement as requested by the grill', () => {
    expect(
      formatSpatialSummary({ pos_x: 100, pos_y: 150, shape: 'Circle', rotation: 90 }),
    ).toBe('Pos: [100, 150] | Circle | 90°');
  });

  it('rounds fractional drag coordinates', () => {
    expect(
      formatSpatialSummary({ pos_x: 99.6, pos_y: 150.2, shape: 'Booth', rotation: 45 }),
    ).toBe('Pos: [100, 150] | Booth | 45°');
  });

  it('makes the seat unique', () => {
    expect(formatSeats(1)).toBe('1 Seat');
    expect(formatSeats(4)).toBe('4 Seats');
  });
});
