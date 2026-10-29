// Transfer control rules: net hours, classification of the day, guards of the
// payroll export form and assembly.
//
// All of this lives outside of React because it is arithmetic with money behind it: it is the hours that
// are paid. The backend calculates its own when persisting; here it is recalculated to paint and to
// export, with the SAME definition (gross interval − unpaid rest).

import type { PunchStatus, TimeEntry } from '../types/time-entry';

// ================= Umbrales =================

// Standard day from which the hours count as overtime. Must match
// DAILY_OVERTIME_THRESHOLD_HOURS from backend; the natural owner of the number is the module
// merchant-overtime-rule, which is not yet hooked on signings.
export const DAILY_OVERTIME_THRESHOLD_HOURS = 8;

// Courtesy margin before considering an entry late. Without it, clock in at 08:00:12
// It would come out red and the grill would become useless from so much noise.
export const TARDY_GRACE_MINUTES = 5;

// ================= Referencias visibles =================

export const timeEntryRef = (id: number): string => `#TME-${id}`;
export const collaboratorRefOf = (collaboratorId: number): string => `#CLB-${collaboratorId}`;

// ================= Horas =================

const MS_PER_HOUR = 3_600_000;

/** Clock hours between the two marks. An open day still doesn't measure anything. */
export const rawHours = (entry: Pick<TimeEntry, 'clock_in' | 'clock_out'>): number => {
  if (!entry.clock_out) return 0;
  const start = new Date(entry.clock_in).getTime();
  const end = new Date(entry.clock_out).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return (end - start) / MS_PER_HOUR;
};

/**
 * Payable hours: the gross interval minus unpaid rest.
 *
 * It never goes below zero no matter how much rest you type: a net negative means nothing
 * in a payroll and would drag the error into the exported total.
 */
export const netHours = (entry: Pick<TimeEntry, 'clock_in' | 'clock_out' | 'break_minutes'>): number => {
  const raw = rawHours(entry);
  if (raw === 0) return 0;
  const net = raw - Math.max(0, entry.break_minutes ?? 0) / 60;
  return Number(Math.max(0, net).toFixed(2));
};

export const regularHours = (entry: Pick<TimeEntry, 'clock_in' | 'clock_out' | 'break_minutes'>): number =>
  Number(Math.min(netHours(entry), DAILY_OVERTIME_THRESHOLD_HOURS).toFixed(2));

export const overtimeHours = (entry: Pick<TimeEntry, 'clock_in' | 'clock_out' | 'break_minutes'>): number =>
  Number(Math.max(0, netHours(entry) - DAILY_OVERTIME_THRESHOLD_HOURS).toFixed(2));

export const formatHours = (hours: number): string => `${hours.toFixed(2)} hrs`;

export const formatBreak = (minutes: number): string =>
  minutes > 0 ? `${minutes} min` : '—';

// ================= Status of the day =================

/** Minutes late with respect to the scheduled shift. Without a turn there is nothing to compare with. */
export const tardyMinutes = (entry: TimeEntry): number => {
  const scheduled = entry.shift?.startTime;
  if (!scheduled) return 0;
  const start = new Date(scheduled).getTime();
  const actual = new Date(entry.clock_in).getTime();
  if (Number.isNaN(start) || Number.isNaN(actual)) return 0;
  return Math.max(0, Math.round((actual - start) / 60_000));
};

/**
 * State of a day, in order of severity.
 *
 * `now` is injected instead of reading the clock inside: an open day is normal at half
 * afternoon and incidence at the end of the day, and that difference must be proven.
 */
export const classifyEntry = (entry: TimeEntry, now: Date = new Date()): PunchStatus => {
  if (!entry.clock_out) {
    // No way out: keep working as long as it is the same day; From there, incidence.
    const startedOn = new Date(entry.clock_in);
    const sameDay =
      startedOn.getFullYear() === now.getFullYear() &&
      startedOn.getMonth() === now.getMonth() &&
      startedOn.getDate() === now.getDate();
    return sameDay ? 'on_duty' : 'missed_punch';
  }
  if (overtimeHours(entry) > 0) return 'overtime';
  if (tardyMinutes(entry) > TARDY_GRACE_MINUTES) return 'tardy';
  return 'on_time';
};

export const isOnDuty = (entry: TimeEntry): boolean => !entry.clock_out;

/** "+15m Late" — the detail that accompanies the amber badge. */
export const tardyLabel = (entry: TimeEntry): string => {
  const late = tardyMinutes(entry);
  return late > TARDY_GRACE_MINUTES ? `+${late}m Late` : '';
};

// ================= Presentation of brands =================

// Hand-built 12-hour format: the separator that ICU inserts before the AM/PM switches between
// versions of Node and this string is compared in the tests.
export const clockTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = d.getHours();
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const entryDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
};

/** Key YYYY-MM-DD in LOCAL time: toISOString() would shift the day according to the zone. */
export const dateKey = (value: Date | string): string => {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ================= Filtros =================

export interface TimeEntryFilters {
  search: string;
  from: string;
  to: string;
  role: string;
  status: string;
}

/** Current week (Monday to Sunday), which is the period with which it is reviewed daily. */
export const currentWeekRange = (today: Date = new Date()): { from: string; to: string } => {
  const day = today.getDay();
  // getDay() returns 0 for Sunday: goes back 6 days so the week starts on Monday.
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: dateKey(monday), to: dateKey(sunday) };
};

export const defaultTimeEntryFilters = (today: Date = new Date()): TimeEntryFilters => ({
  search: '',
  ...currentWeekRange(today),
  role: '',
  status: '',
});

// Name of the collaborator, #CLB-{id} and #TME-{id}: the three search axes of the story.
export const timeEntryHaystack = (entry: TimeEntry): string =>
  [
    entry.collaborator?.name ?? '',
    timeEntryRef(entry.id),
    String(entry.id),
    collaboratorRefOf(entry.collaborator_id),
    String(entry.collaborator_id),
    entry.collaborator?.role ?? '',
  ]
    .join(' ')
    .toLowerCase();

export const filterTimeEntries = (
  entries: TimeEntry[],
  filters: TimeEntryFilters,
  now: Date = new Date(),
): TimeEntry[] => {
  const term = filters.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (term && !timeEntryHaystack(e).includes(term)) return false;
    if (filters.role && (e.collaborator?.role ?? '').toLowerCase() !== filters.role) {
      return false;
    }
    if (filters.status && classifyEntry(e, now) !== filters.status) return false;
    // The range is compared by local day, not by instant: a clocking in at 11:50 p.m. belongs
    // to your day, not the next.
    const key = dateKey(e.clock_in);
    if (filters.from && key < filters.from) return false;
    if (filters.to && key > filters.to) return false;
    return true;
  });
};

export const hasActiveTimeFilters = (
  filters: TimeEntryFilters,
  today: Date = new Date(),
): boolean => {
  const base = defaultTimeEntryFilters(today);
  return (
    filters.search.trim().length > 0 ||
    filters.role.length > 0 ||
    filters.status.length > 0 ||
    filters.from !== base.from ||
    filters.to !== base.to
  );
};

// ================= Form guards =================

export const CHRONOLOGY_ERROR = 'Clock-Out timestamp must be after Clock-In timestamp.';
export const REASON_REQUIRED_ERROR = 'An adjustment reason is required.';

export const chronologyError = (clockIn: string, clockOut: string): string => {
  if (!clockIn || !clockOut) return '';
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return '';
  return end <= start ? CHRONOLOGY_ERROR : '';
};

/**
 * Overlap with another signing of the same collaborator.
 *
 * An open day is treated as "to infinity": as long as it is not closed, any
 * Subsequent signing collides with it — which is precisely the incident to be resolved. Same
 * definition that saves it from the backend, so that the form does not promise what the API
 * va a rechazar.
 */
export const overlappingEntry = (
  entries: TimeEntry[],
  collaboratorId: number,
  clockIn: string,
  clockOut: string | null,
  excludeId?: number,
): TimeEntry | null => {
  const start = new Date(clockIn).getTime();
  if (Number.isNaN(start)) return null;
  const end = clockOut ? new Date(clockOut).getTime() : Number.POSITIVE_INFINITY;
  return (
    entries.find((other) => {
      if (other.id === excludeId) return false;
      if (other.collaborator_id !== collaboratorId) return false;
      const otherStart = new Date(other.clock_in).getTime();
      const otherEnd = other.clock_out
        ? new Date(other.clock_out).getTime()
        : Number.POSITIVE_INFINITY;
      return start < otherEnd && otherStart < end;
    }) ?? null
  );
};

export const overlapError = (clash: TimeEntry): string =>
  `This time range overlaps time entry ${timeEntryRef(clash.id)} for the same collaborator.`;

// ================= Payroll export =================

export interface TimesheetRow {
  collaboratorId: number;
  collaboratorName: string;
  role: string;
  entries: number;
  regularHours: number;
  overtimeHours: number;
  breakMinutes: number;
  missedPunches: number;
}

/**
 * Add per employee what the payroll needs.
 *
 * Hours are summed from ticks, not from persisted columns: if someone
 * corrected a signing, the exported total must reflect the correction even if the row
 * saved would have been left behind.
 */
export const buildTimesheet = (
  entries: TimeEntry[],
  now: Date = new Date(),
): TimesheetRow[] => {
  const byCollaborator = new Map<number, TimesheetRow>();
  for (const e of entries) {
    const row = byCollaborator.get(e.collaborator_id) ?? {
      collaboratorId: e.collaborator_id,
      collaboratorName: e.collaborator?.name ?? `Collaborator #${e.collaborator_id}`,
      role: e.collaborator?.role ?? '',
      entries: 0,
      regularHours: 0,
      overtimeHours: 0,
      breakMinutes: 0,
      missedPunches: 0,
    };
    row.entries += 1;
    row.regularHours += regularHours(e);
    row.overtimeHours += overtimeHours(e);
    row.breakMinutes += Math.max(0, e.break_minutes ?? 0);
    if (classifyEntry(e, now) === 'missed_punch') row.missedPunches += 1;
    byCollaborator.set(e.collaborator_id, row);
  }
  return Array.from(byCollaborator.values())
    .map((r) => ({
      ...r,
      regularHours: Number(r.regularHours.toFixed(2)),
      overtimeHours: Number(r.overtimeHours.toFixed(2)),
    }))
    .sort((a, b) => a.collaboratorName.localeCompare(b.collaboratorName));
};

export const TIMESHEET_HEADERS = [
  'Collaborator ID',
  'Collaborator',
  'Role',
  'Entries',
  'Regular Hours',
  'Overtime Hours',
  'Break Minutes',
  'Missed Punches',
];

// A field with a comma, quote or line break breaks the CSV if it is raw: it is enclosed in quotes and
// inner quotes are duplicated, which is what Excel expects.
const csvCell = (value: string | number): string => {
  const raw = String(value ?? '');
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export const buildTimesheetCsv = (rows: TimesheetRow[]): string =>
  [
    TIMESHEET_HEADERS.join(','),
    ...rows.map((r) =>
      [
        collaboratorRefOf(r.collaboratorId),
        r.collaboratorName,
        r.role,
        r.entries,
        r.regularHours.toFixed(2),
        r.overtimeHours.toFixed(2),
        r.breakMinutes,
        r.missedPunches,
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');

export const timesheetFilename = (from: string, to: string): string =>
  `timesheet-${from}_${to}.csv`;
