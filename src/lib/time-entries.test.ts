import { describe, expect, it } from 'vitest';
import type { TimeEntry } from '../types/time-entry';
import {
  buildTimesheet,
  buildTimesheetCsv,
  chronologyError,
  classifyEntry,
  clockTime,
  collaboratorRefOf,
  currentWeekRange,
  dateKey,
  defaultTimeEntryFilters,
  entryDate,
  filterTimeEntries,
  formatBreak,
  formatHours,
  hasActiveTimeFilters,
  isOnDuty,
  netHours,
  overlapError,
  overlappingEntry,
  overtimeHours,
  rawHours,
  regularHours,
  tardyLabel,
  tardyMinutes,
  timeEntryHaystack,
  timeEntryRef,
  TIMESHEET_HEADERS,
} from './time-entries';

// Local Dates: The module compares days in local time on purpose.
const at = (day: number, h: number, m = 0): string =>
  new Date(2026, 7, day, h, m, 0).toISOString();

const entry = (over: Partial<TimeEntry> & { id: number }): TimeEntry => ({
  company_id: 1,
  merchant_id: 3,
  collaborator_id: 4,
  shift_id: null,
  clock_in: at(30, 8),
  clock_out: at(30, 16),
  break_minutes: 30,
  adjustment_reason: null,
  is_edited: false,
  edited_by_user_id: null,
  edited_at: null,
  regular_hours: 7.5,
  overtime_hours: 0,
  double_overtime_hours: 0,
  approved: false,
  created_at: at(30, 8),
  collaborator: { id: 4, name: 'Juan Perez', role: 'waiter' },
  ...over,
});

describe('horas', () => {
  it('measures raw interval', () => {
    expect(rawHours(entry({ id: 1 }))).toBe(8);
  });

  it('an open day still does not measure anything', () => {
    expect(rawHours(entry({ id: 1, clock_out: null }))).toBe(0);
    expect(netHours(entry({ id: 1, clock_out: null }))).toBe(0);
  });

  it('deducts unpaid rest', () => {
    expect(netHours(entry({ id: 1 }))).toBe(7.5);
  });

  it('a disproportionate rest does not leave the net negative', () => {
    expect(netHours(entry({ id: 1, break_minutes: 600 }))).toBe(0);
  });

  it('split hours by daily threshold', () => {
    const long = entry({ id: 1, clock_out: at(30, 19), break_minutes: 0 });
    expect(regularHours(long)).toBe(8);
    expect(overtimeHours(long)).toBe(3);
  });

  it('without excess there are no overtime', () => {
    expect(overtimeHours(entry({ id: 1 }))).toBe(0);
  });

  it('ignore reversed marks instead of returning negative hours', () => {
    expect(rawHours(entry({ id: 1, clock_in: at(30, 16), clock_out: at(30, 8) }))).toBe(0);
  });

  it('format hours and rest for the grill', () => {
    expect(formatHours(7.5)).toBe('7.50 hrs');
    expect(formatBreak(45)).toBe('45 min');
    expect(formatBreak(0)).toBe('—');
  });
});

describe('classification of the day', () => {
  const now = new Date(2026, 7, 30, 14, 0, 0);

  it('no exit and the same day, still in progress', () => {
    const open = entry({ id: 1, clock_out: null });
    expect(classifyEntry(open, now)).toBe('on_duty');
    expect(isOnDuty(open)).toBe(true);
  });

  it('with no exit and with the day already closed, it is an incident', () => {
    const stale = entry({ id: 1, clock_in: at(28, 8), clock_out: null });
    expect(classifyEntry(stale, now)).toBe('missed_punch');
  });

  it('marks overtime when it exceeds the threshold', () => {
    expect(
      classifyEntry(entry({ id: 1, clock_out: at(30, 19), break_minutes: 0 }), now),
    ).toBe('overtime');
  });

  it('scores late when he enters outside the courtesy margin', () => {
    const late = entry({
      id: 1,
      clock_in: at(30, 8, 15),
      shift: { id: 7, startTime: at(30, 8) },
    });
    expect(classifyEntry(late, now)).toBe('tardy');
    expect(tardyMinutes(late)).toBe(15);
    expect(tardyLabel(late)).toBe('+15m Late');
  });

  it('within the margin of courtesy remains punctual', () => {
    const slightly = entry({
      id: 1,
      clock_in: at(30, 8, 3),
      shift: { id: 7, startTime: at(30, 8) },
    });
    expect(classifyEntry(slightly, now)).toBe('on_time');
    expect(tardyLabel(slightly)).toBe('');
  });

  it('Without a scheduled shift there is nothing to compare the delay with', () => {
    expect(tardyMinutes(entry({ id: 1, shift: null }))).toBe(0);
    expect(classifyEntry(entry({ id: 1 }), now)).toBe('on_time');
  });

  it('the extra hour outweighs the delay', () => {
    const both = entry({
      id: 1,
      clock_in: at(30, 8, 30),
      clock_out: at(30, 20),
      break_minutes: 0,
      shift: { id: 7, startTime: at(30, 8) },
    });
    expect(classifyEntry(both, now)).toBe('overtime');
  });
});

describe('presentation', () => {
  it('format the mark in 12 hours', () => {
    expect(clockTime(at(30, 8, 3))).toBe('08:03 AM');
    expect(clockTime(at(30, 16, 15))).toBe('04:15 PM');
    expect(clockTime(null)).toBe('—');
  });

  it('format the date of the day', () => {
    expect(entryDate(at(30, 8))).toBe('Aug 30, 2026');
  });

  it('compose the references of the story', () => {
    expect(timeEntryRef(42)).toBe('#TME-42');
    expect(collaboratorRefOf(4)).toBe('#CLB-4');
  });

  it('day key is local, not UTC', () => {
    // 23:50 belongs to its own day even though in UTC it is already the next one.
    expect(dateKey(new Date(2026, 7, 30, 23, 50))).toBe('2026-08-30');
  });
});

describe('filtros', () => {
  const now = new Date(2026, 7, 30, 14, 0, 0);
  const rows = [
    entry({ id: 1, collaborator: { id: 4, name: 'Juan Perez', role: 'waiter' } }),
    entry({
      id: 2,
      collaborator_id: 5,
      collaborator: { id: 5, name: 'Ana Rivas', role: 'cook' },
      clock_in: at(29, 8),
      clock_out: at(29, 16),
    }),
  ];

  it('starts in the current week', () => {
    // August 30, 2026 is Sunday: the week runs from Monday the 24th to Sunday the 30th.
    expect(currentWeekRange(new Date(2026, 7, 30))).toEqual({
      from: '2026-08-24',
      to: '2026-08-30',
    });
  });

  it('search by name, #TME and #CLB', () => {
    expect(timeEntryHaystack(rows[0])).toContain('juan perez');
    expect(timeEntryHaystack(rows[0])).toContain('#tme-1');
    expect(timeEntryHaystack(rows[0])).toContain('#clb-4');
  });

  it('filter by role', () => {
    const out = filterTimeEntries(
      rows,
      { ...defaultTimeEntryFilters(now), role: 'cook' },
      now,
    );
    expect(out.map((e) => e.id)).toEqual([2]);
  });

  it('filter by derived state', () => {
    const open = entry({ id: 3, clock_out: null });
    const out = filterTimeEntries(
      [...rows, open],
      { ...defaultTimeEntryFilters(now), status: 'on_duty' },
      now,
    );
    expect(out.map((e) => e.id)).toEqual([3]);
  });

  it('filter by date range', () => {
    const out = filterTimeEntries(
      rows,
      { ...defaultTimeEntryFilters(now), from: '2026-08-30', to: '2026-08-30' },
      now,
    );
    expect(out.map((e) => e.id)).toEqual([1]);
  });

  it('the default range does not count as an active filter', () => {
    expect(hasActiveTimeFilters(defaultTimeEntryFilters(now), now)).toBe(false);
    expect(
      hasActiveTimeFilters({ ...defaultTimeEntryFilters(now), role: 'cook' }, now),
    ).toBe(true);
  });
});

describe('form guards', () => {
  it('rejects an output earlier than or equal to the input', () => {
    expect(chronologyError(at(30, 16), at(30, 8))).toContain('must be after');
    expect(chronologyError(at(30, 8), at(30, 8))).toContain('must be after');
  });

  it('acepta un intervalo correcto', () => {
    expect(chronologyError(at(30, 8), at(30, 16))).toBe('');
  });

  it('without exit there is no chronology to validate', () => {
    expect(chronologyError(at(30, 8), '')).toBe('');
  });

  it('detects overlap with another signing of the same collaborator', () => {
    const existing = [entry({ id: 9, clock_in: at(30, 7), clock_out: at(30, 12) })];
    const clash = overlappingEntry(existing, 4, at(30, 8), at(30, 16));
    expect(clash?.id).toBe(9);
    expect(overlapError(clash!)).toContain('#TME-9');
  });

  it('an open day blocks any subsequent signing', () => {
    const existing = [entry({ id: 9, clock_in: at(30, 6), clock_out: null })];
    expect(overlappingEntry(existing, 4, at(30, 20), at(30, 22))?.id).toBe(9);
  });

  it('does not collide with signings of another collaborator', () => {
    const existing = [entry({ id: 9, collaborator_id: 99, clock_in: at(30, 7), clock_out: at(30, 12) })];
    expect(overlappingEntry(existing, 4, at(30, 8), at(30, 16))).toBeNull();
  });

  it('When editing, the signing itself does not count as an overlap', () => {
    const existing = [entry({ id: 9 })];
    expect(overlappingEntry(existing, 4, at(30, 8), at(30, 16), 9)).toBeNull();
  });

  it('intervals that only touch at the end do not overlap', () => {
    const existing = [entry({ id: 9, clock_in: at(30, 16), clock_out: at(30, 20) })];
    expect(overlappingEntry(existing, 4, at(30, 8), at(30, 16))).toBeNull();
  });
});

describe('payroll export', () => {
  const now = new Date(2026, 7, 30, 14, 0, 0);
  const rows = [
    entry({ id: 1, clock_out: at(30, 19), break_minutes: 60 }), // 10 netas: 8 + 2 extra
    entry({ id: 2, clock_in: at(29, 8), clock_out: at(29, 16), break_minutes: 30 }), // 7,5
    entry({
      id: 3,
      collaborator_id: 5,
      collaborator: { id: 5, name: 'Ana Rivas', role: 'cook' },
      clock_in: at(28, 8),
      clock_out: null,
    }),
  ];

  it('add per collaborator adding ordinary and extra', () => {
    const sheet = buildTimesheet(rows, now);
    const juan = sheet.find((r) => r.collaboratorId === 4);
    expect(juan).toMatchObject({
      entries: 2,
      regularHours: 15.5, // 8 + 7,5
      overtimeHours: 2,
      breakMinutes: 90,
    });
  });

  it('counts unclosed transfer incidents', () => {
    const ana = buildTimesheet(rows, now).find((r) => r.collaboratorId === 5);
    expect(ana?.missedPunches).toBe(1);
  });

  it('sort by name so the CSV is comparable between weeks', () => {
    expect(buildTimesheet(rows, now).map((r) => r.collaboratorName)).toEqual([
      'Ana Rivas',
      'Juan Perez',
    ]);
  });

  it('generates a CSV with header and totals', () => {
    const csv = buildTimesheetCsv(buildTimesheet(rows, now));
    const lines = csv.split('\n');
    expect(lines[0]).toBe(TIMESHEET_HEADERS.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('#CLB-4');
    expect(lines[2]).toContain('15.50');
    expect(lines[2]).toContain('2.00');
  });

  it('quote the fields with a comma so as not to break the table', () => {
    const csv = buildTimesheetCsv(
      buildTimesheet([entry({ id: 1, collaborator: { id: 4, name: 'Perez, Juan', role: 'waiter' } })], now),
    );
    expect(csv).toContain('"Perez, Juan"');
  });
});
