import { describe, expect, it } from 'vitest';
import type { ShiftRef, TableAssignment } from './table-assignments';
import {
  assignmentHaystack,
  collaboratorBadge,
  collaboratorLabel,
  conflictingAssignment,
  dutyBadgeLabel,
  dutyBadgeStyle,
  formatDutyWindow,
  hasOpenChecks,
  isActiveDuty,
  isHistoricalShift,
  matchesDutyFilter,
  openOrdersReleaseWarning,
  reassignConflictPrompt,
  resolveActiveShiftId,
  shiftHours,
  shiftLabel,
} from './table-assignments';

// The times are built locally so that the 12h formatter reads the same as the
// operator has on his watch, regardless of the area in which the tests are run.
const at = (h: number, m = 0): string => {
  const d = new Date(2026, 6, 28, h, m, 0);
  return d.toISOString();
};

const assignment = (over: Partial<TableAssignment> & { id: number }): TableAssignment => ({
  shiftId: 1,
  tableId: 10,
  collaboratorId: 5,
  assignedAt: at(12, 30),
  releasedAt: null,
  status: 'active',
  ...over,
});

describe('active duty', () => {
  it('without releasedAt the waiter is still on duty', () => {
    expect(isActiveDuty(assignment({ id: 1 }))).toBe(true);
  });

  it('with releasedAt the coverage is closed', () => {
    expect(isActiveDuty(assignment({ id: 1, releasedAt: at(16, 15) }))).toBe(false);
  });

  it('releasedAt commands an inconsistent status', () => {
    // Actual row possible: someone touched the status but the check mark is already set.
    const closed = assignment({ id: 1, status: 'active', releasedAt: at(16, 15) });
    expect(isActiveDuty(closed)).toBe(false);
    expect(dutyBadgeLabel(closed)).toBe('Released');
  });

  it('the badge distinguishes closing service', () => {
    expect(dutyBadgeStyle(assignment({ id: 1 }))).toContain('green');
    expect(dutyBadgeStyle(assignment({ id: 1, releasedAt: at(16) }))).toContain('blue');
  });
});

describe('coverage filter', () => {
  const live = assignment({ id: 1 });
  const closed = assignment({ id: 2, releasedAt: at(16, 15) });

  it('"all" no descarta nada', () => {
    expect(matchesDutyFilter(live, 'all')).toBe(true);
    expect(matchesDutyFilter(closed, 'all')).toBe(true);
  });

  it('"active" keeps only active ones', () => {
    expect(matchesDutyFilter(live, 'active')).toBe(true);
    expect(matchesDutyFilter(closed, 'active')).toBe(false);
  });

  it('"released" keeps only released ones', () => {
    expect(matchesDutyFilter(live, 'released')).toBe(false);
    expect(matchesDutyFilter(closed, 'released')).toBe(true);
  });
});

describe('contributor tags', () => {
  it('prefer the full catalog name', () => {
    expect(
      collaboratorLabel(assignment({ id: 1, collaborator: { id: 5, name: 'John Doe' } })),
    ).toBe('John Doe');
  });

  it('compone nombre y apellido cuando no hay `name`', () => {
    expect(
      collaboratorLabel(
        assignment({ id: 1, collaborator: { id: 5, firstName: 'Ana', lastName: 'Ruiz' } }),
      ),
    ).toBe('Ana Ruiz');
  });

  it('drops to id when collaborators feature is not granted', () => {
    expect(collaboratorLabel(assignment({ id: 1, collaboratorId: 9 }))).toBe('Collaborator #9');
  });

  it('compose the role and code badge', () => {
    expect(
      collaboratorBadge(
        assignment({ id: 1, collaborator: { id: 5, role: 'waiter', code: 'W-12' } }),
      ),
    ).toBe('waiter · W-12');
  });
});

describe('service window', () => {
  it('marks live coverage as active', () => {
    expect(formatDutyWindow(assignment({ id: 1 }))).toBe('Assigned: 12:30 PM | Duty Active');
  });

  it('shows both marks when already released', () => {
    expect(formatDutyWindow(assignment({ id: 1, releasedAt: at(16, 15) }))).toBe(
      'Assigned: 12:30 PM | Released: 04:15 PM',
    );
  });

  it('survives an absent brand', () => {
    expect(formatDutyWindow(assignment({ id: 1, assignedAt: undefined }))).toBe(
      'Assigned: — | Duty Active',
    );
  });
});

describe('turnos', () => {
  const open: ShiftRef = { id: 7, startTime: at(11), status: 'active' };
  const closed: ShiftRef = { id: 6, startTime: at(8), endTime: at(11), status: 'closed' };

  it('resolve the open turn', () => {
    expect(resolveActiveShiftId([closed, open])).toBe('7');
  });

  it('with several open the most recent wins', () => {
    const older: ShiftRef = { id: 5, startTime: at(9), status: 'active' };
    expect(resolveActiveShiftId([older, open])).toBe('7');
  });

  it('without an open shift it does not impose any', () => {
    expect(resolveActiveShiftId([closed])).toBe('');
    expect(resolveActiveShiftId([])).toBe('');
  });

  it('distinguishes the historical turn', () => {
    expect(isHistoricalShift(closed)).toBe(true);
    expect(isHistoricalShift(open)).toBe(false);
  });

  it('name the shift with its date', () => {
    expect(shiftLabel({ id: 7, name: 'Lunch Shift', startTime: at(11) })).toBe(
      'Lunch Shift - Jul 28',
    );
  });

  it('derives the role name when the shift does not have one', () => {
    expect(shiftLabel({ id: 7, role: 'waiter', startTime: at(11) })).toBe('Waiter Shift - Jul 28');
  });

  it('marks the shift as open without closing time', () => {
    expect(shiftHours(open)).toBe('11:00 AM – open');
    expect(shiftHours(closed)).toBe('08:00 AM – 11:00 AM');
  });
});

describe('table/shift exclusivity', () => {
  const live = assignment({ id: 1, tableId: 10, shiftId: 1, collaborator: { id: 5, name: 'John Doe' } });
  const released = assignment({ id: 2, tableId: 10, shiftId: 1, releasedAt: at(15) });

  it('Find the waiter who already covers the table in that turn', () => {
    expect(conflictingAssignment([released, live], 10, 1)?.id).toBe(1);
  });

  it('released coverage does not generate conflict', () => {
    expect(conflictingAssignment([released], 10, 1)).toBeNull();
  });

  it('the same table in another turn does not collide', () => {
    expect(conflictingAssignment([live], 10, 2)).toBeNull();
  });

  it('Write the transfer notice with the name of the owner', () => {
    expect(reassignConflictPrompt('A1', 'John Doe')).toBe(
      "Table A1 is currently assigned to John Doe. Reassigning will automatically release John Doe's duty. Proceed?",
    );
  });
});

describe('notice of open accounts upon release', () => {
  it('a busy table has live accounts', () => {
    expect(hasOpenChecks({ status: 'occupied' })).toBe(true);
    expect(hasOpenChecks({ status: 'available' })).toBe(false);
    expect(hasOpenChecks(null)).toBe(false);
  });

  it('write the story notice', () => {
    expect(openOrdersReleaseWarning('A1')).toBe(
      'Table A1 has active guest orders. Ensure open checks are transferred to another collaborator before releasing.',
    );
  });
});

describe('search', () => {
  const a = assignment({
    id: 1,
    collaborator: { id: 5, firstName: 'Ana', lastName: 'Ruiz' },
  });
  const t = { id: 10, number: 'A1', floorZone: { id: 3, name: 'VIP Lounge' } };

  it('search by collaborator name', () => {
    expect(assignmentHaystack(a, t)).toContain('ana ruiz');
  });

  it('search by table number', () => {
    expect(assignmentHaystack(a, t)).toContain('a1');
  });

  it('search by area', () => {
    expect(assignmentHaystack(a, t)).toContain('vip lounge');
  });
});
