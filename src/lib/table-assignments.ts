// Rules for table assignments: who covers which table in which turn, when comes on
// service and when he is released.
//
// The operating truth is NOT the `status` column but `releasedAt`: as long as it is null the
// waiter is still on duty, even if someone has touched the status by hand. Everything that
// decides "is on duty" goes through isActiveDuty() so that the grill, filter and
// conflict guard cannot disagree with each other.

import type { DiningTable } from '../types/dining-system';

// ================= Contract forms =================

export interface ShiftRef {
  id: number;
  merchantId?: number;
  name?: string;
  // Explicit `null`: This is how /api/collaborators returns them for a non-closing turn.
  startTime?: string | null;
  endTime?: string | null;
  role?: string | null;
  status?: string | null;
}

export interface CollaboratorRef {
  id: number;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  code?: string;
}

export interface TableAssignment {
  id: number;
  shiftId: number;
  tableId: number;
  collaboratorId: number;
  assignedAt?: string;
  releasedAt?: string | null;
  status: string;
  // The backend loads these relations into eager, so they usually come pre-hydrated.
  shift?: ShiftRef | null;
  table?: Partial<DiningTable> | null;
  collaborator?: CollaboratorRef | null;
}

// ================= Active duty =================

// releasedAt === null is the definition of history: as long as there is no exit stamp,
// the table is still covered.
export const isActiveDuty = (a: Pick<TableAssignment, 'releasedAt'>): boolean =>
  a.releasedAt == null;

export type DutyFilter = 'all' | 'active' | 'released';

export const DUTY_FILTER_LABELS: Record<DutyFilter, string> = {
  all: 'All Statuses',
  active: 'Active Duty',
  released: 'Released / Closed',
};

export const matchesDutyFilter = (a: TableAssignment, filter: DutyFilter): boolean =>
  filter === 'all' ? true : filter === 'active' ? isActiveDuty(a) : !isActiveDuty(a);

export const dutyBadgeLabel = (a: TableAssignment): string =>
  isActiveDuty(a) ? 'On Duty' : 'Released';

// Green for live duty, dull blue for closed shift.
export const dutyBadgeStyle = (a: TableAssignment): string =>
  isActiveDuty(a) ? 'bg-green-500/10 text-green-700' : 'bg-blue-500/10 text-blue-700';

// ================= Etiquetas =================

// Without the COLLABORATORS feature the backend returns 403 and only the id remains; the row has
// it should still be readable in that case.
export const collaboratorLabel = (a: TableAssignment): string => {
  const c = a.collaborator;
  if (!c) return `Collaborator #${a.collaboratorId}`;
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return c.name || full || `Collaborator #${a.collaboratorId}`;
};

export const collaboratorBadge = (a: TableAssignment): string => {
  const c = a.collaborator;
  return [c?.role, c?.code].filter(Boolean).join(' · ');
};

// 12 h format built by hand and not with toLocaleTimeString: the separator that ICU puts
// before AM/PM switches between versions of Node (thin space U+202F), and this string is
// It compares in the tests and is read on the grid.
const clockTime = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
};

const shortDate = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// "Lunch Shift - Jul 28", or the role and date when the shift does not have its own name.
export const shiftLabel = (shift?: ShiftRef | null): string => {
  if (!shift) return '—';
  const date = shortDate(shift.startTime);
  const name = shift.name?.trim() || (shift.role ? `${titleCase(shift.role)} Shift` : `Shift #${shift.id}`);
  return date ? `${name} - ${date}` : name;
};

export const shiftHours = (shift?: ShiftRef | null): string => {
  const start = clockTime(shift?.startTime);
  if (!start) return '—';
  const end = clockTime(shift?.endTime);
  return end ? `${start} – ${end}` : `${start} – open`;
};

function titleCase(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Assigned: 12:30 PM | Released: 04:15 PM" / "Assigned: 12:30 PM | Duty Active".
export const formatDutyWindow = (a: TableAssignment): string => {
  const assigned = clockTime(a.assignedAt) || '—';
  return isActiveDuty(a)
    ? `Assigned: ${assigned} | Duty Active`
    : `Assigned: ${assigned} | Released: ${clockTime(a.releasedAt) || '—'}`;
};

// ================= Turn context =================

// The open trading shift: active and without closing time. If there are several (the backend does not
// prevents it) the one who started later wins, which is the one in front of the operator.
export const resolveActiveShiftId = (shifts: ShiftRef[]): string => {
  const open = shifts
    .filter((s) => (s.status ?? 'active') === 'active' && !s.endTime)
    .sort((a, b) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime());
  return open.length > 0 ? String(open[0].id) : '';
};

export const isHistoricalShift = (shift?: ShiftRef | null): boolean =>
  !!shift && (Boolean(shift.endTime) || (shift.status ?? 'active') !== 'active');

// ================= Table/shift exclusivity =================

// Backend index [tableId, shiftId] is NOT unique, so table uniqueness
// within the turn it is held here: if there is already someone covering it without releasing, there is conflict.
export const conflictingAssignment = (
  assignments: TableAssignment[],
  tableId: number,
  shiftId: number,
): TableAssignment | null =>
  assignments.find((a) => a.tableId === tableId && a.shiftId === shiftId && isActiveDuty(a)) ??
  null;

export const reassignConflictPrompt = (tableNumber: string, holder: string): string =>
  `Table ${tableNumber} is currently assigned to ${holder}. Reassigning will automatically release ${holder}'s duty. Proceed?`;

// Releasing a waiter from a table with open orders does not block — the shift ends
// the same — but be warned: someone has to take care of those accounts.
export const openOrdersReleaseWarning = (tableNumber: string): string =>
  `Table ${tableNumber} has active guest orders. Ensure open checks are transferred to another collaborator before releasing.`;

// The busy table is the live command signal that /api/tables exposes today.
export const hasOpenChecks = (table?: Pick<DiningTable, 'status'> | null): boolean =>
  table?.status === 'occupied';

// ================= Search =================

// Collaborator's name, table number and zone label: the three axes by which a
// supervisor looks for a row.
export const assignmentHaystack = (
  a: TableAssignment,
  table?: Partial<DiningTable> | null,
): string =>
  [
    collaboratorLabel(a),
    a.collaborator?.firstName ?? '',
    a.collaborator?.lastName ?? '',
    table?.number ?? a.table?.number ?? `#${a.tableId}`,
    table?.floorZone?.name ?? a.table?.floorZone?.name ?? '',
    shiftLabel(a.shift),
    String(a.shiftId),
  ]
    .join(' ')
    .toLowerCase();
