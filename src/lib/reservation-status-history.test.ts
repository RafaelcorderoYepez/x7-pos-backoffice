import { describe, expect, it } from 'vitest';
import type {
  ReservationStatus,
  ReservationStatusHistoryEntry,
  StatusHistoryFeedEntry,
} from '../types/reservation';
import {
  EMPTY_HISTORY_FILTERS,
  actorLabel,
  actorOptions,
  auditTimestamp,
  computeDurations,
  computeShiftMetrics,
  detectLateChange,
  diningOverrunLabel,
  entryDuration,
  entryDurationLabel,
  entryLateChange,
  formatDuration,
  hasActiveHistoryFilters,
  lateChangeLabel,
  matchesHistoryFilters,
  parseReservationLookup,
  receptionWaitLabel,
  sortHistoryByRecency,
  timeInPreviousMs,
} from './reservation-status-history';

// Hora local, como la pinta el navegador del local.
const at = (h: number, m = 0, s = 0): string => new Date(2026, 3, 16, h, m, s).toISOString();

const entry = (
  id: number,
  status: ReservationStatus,
  changedAt: string,
  changedBy: number | null = 2,
): ReservationStatusHistoryEntry => ({
  id,
  reservation_id: 1,
  status,
  changed_at: changedAt,
  changed_by: changedBy,
  is_active: true,
});

const SUMMARY = {
  id: 1,
  reservation_date: at(19),
  duration_minutes: 90,
  seated_at: at(19, 7),
  party_size: 4,
  status: 'completed' as ReservationStatus,
  guest_name: 'Carlos Mendoza',
};

// Entrada del feed tal como la sirve el backend: con la anterior de su reserva resuelta.
const feed = (
  id: number,
  status: ReservationStatus,
  changedAt: string,
  previous: [ReservationStatus, string] | null,
  over: Partial<StatusHistoryFeedEntry> = {},
): StatusHistoryFeedEntry => ({
  ...entry(id, status, changedAt),
  previous_status: previous?.[0] ?? null,
  previous_changed_at: previous?.[1] ?? null,
  reservation: SUMMARY,
  ...over,
});

// Ciclo completo: alta 14:00, confirmada 14:20, sentada 19:07, terminada 20:52.
const FULL_CYCLE = [
  feed(1, 'pending', at(14), null),
  feed(2, 'confirmed', at(14, 20), ['pending', at(14)]),
  feed(3, 'seated', at(19, 7), ['confirmed', at(14, 20)]),
  feed(4, 'completed', at(20, 52), ['seated', at(19, 7)]),
];

describe('time in state (Δt between consecutive entries)', () => {
  it('measures the time spent in the previous state', () => {
    expect(FULL_CYCLE.map(timeInPreviousMs)).toEqual([
      null,
      20 * 60_000,
      (4 * 60 + 47) * 60_000,
      105 * 60_000,
    ]);
  });
});

describe('entryDuration', () => {
  it('closes the confirmation lead on CONFIRMED after PENDING', () => {
    expect(entryDuration(FULL_CYCLE[1])).toEqual({ kind: 'confirmation_lead', ms: 20 * 60_000 });
  });

  it('measures reception wait from the booked time, not from the previous state', () => {
    expect(entryDuration(FULL_CYCLE[2])).toEqual({ kind: 'reception_wait', ms: 7 * 60_000 });
  });

  it('measures dining SEATED → COMPLETED against the booked duration', () => {
    expect(entryDuration(FULL_CYCLE[3])).toEqual({
      kind: 'dining',
      ms: 105 * 60_000,
      bookedMs: 90 * 60_000,
      overrunMs: 15 * 60_000,
    });
  });

  it('does not invent a lead time when CONFIRMED follows the wait list', () => {
    expect(entryDuration(feed(9, 'confirmed', at(15), ['white_list', at(14)]))).toBeNull();
    expect(entryDuration(FULL_CYCLE[0])).toBeNull();
  });

  it('labels each duration', () => {
    expect(entryDurationLabel(entryDuration(FULL_CYCLE[1])!)).toBe('Confirmation lead 20m');
    expect(entryDurationLabel(entryDuration(FULL_CYCLE[2])!)).toBe('Wait at reception: 7m wait');
    expect(entryDurationLabel(entryDuration(FULL_CYCLE[3])!)).toBe(
      'Dining 1h 45m · +15m over (booked 1h 30m)',
    );
  });
});

describe('computeDurations (lifecycle of one reservation)', () => {
  const booking = (history: ReservationStatusHistoryEntry[], seatedAt: string | null = null) => ({
    reservation_date: at(19),
    duration_minutes: 90,
    seated_at: seatedAt,
    status_history: history,
  });

  it('derives lead time, reception wait and dining duration, whatever the input order', () => {
    const d = computeDurations(booking([FULL_CYCLE[2], FULL_CYCLE[0], FULL_CYCLE[3], FULL_CYCLE[1]]));
    expect(d.confirmationLeadMs).toBe(20 * 60_000);
    expect(d.receptionWaitMs).toBe(7 * 60_000);
    expect(d.diningMs).toBe(105 * 60_000);
    expect(d.diningOverrunMs).toBe(15 * 60_000);
  });

  it('falls back to seated_at when a legacy booking lacks the SEATED entry', () => {
    const d = computeDurations(booking([entry(1, 'pending', at(14))], at(18, 55)));
    expect(d.receptionWaitMs).toBe(-5 * 60_000);
    expect(d.diningMs).toBeNull();
  });

  it('breaks changed_at ties by id', () => {
    const d = computeDurations(booking([entry(8, 'confirmed', at(14)), entry(7, 'pending', at(14))]));
    expect(d.confirmationLeadMs).toBe(0);
  });
});

describe('late change detection', () => {
  it('flags a cancellation inside the 30-minute run-up, boundary included', () => {
    expect(detectLateChange(entry(1, 'cancelled', at(18, 40)), at(19))).toEqual({
      status: 'cancelled',
      minutesBeforeStart: 20,
    });
    expect(detectLateChange(entry(1, 'cancelled', at(18, 30)), at(19))).not.toBeNull();
    expect(detectLateChange(entry(1, 'cancelled', at(18, 29)), at(19))).toBeNull();
  });

  it('flags no-shows after the start time and never other statuses', () => {
    expect(detectLateChange(entry(1, 'no_show', at(19, 20)), at(19))?.minutesBeforeStart).toBe(-20);
    expect(detectLateChange(entry(1, 'seated', at(19, 5)), at(19))).toBeNull();
  });

  it('reads the booked time from the embedded reservation', () => {
    expect(entryLateChange(feed(5, 'cancelled', at(18, 50), ['confirmed', at(12)]))).toEqual({
      status: 'cancelled',
      minutesBeforeStart: 10,
    });
    expect(entryLateChange(feed(6, 'cancelled', at(18, 50), null, { reservation: undefined }))).toBeNull();
  });

  it('describes the callout in plain words', () => {
    expect(lateChangeLabel({ status: 'cancelled', minutesBeforeStart: 12 })).toBe(
      'Late cancellation — 12 min before start',
    );
    expect(lateChangeLabel({ status: 'no_show', minutesBeforeStart: -18 })).toBe(
      'Late no-show — 18 min after start',
    );
    expect(lateChangeLabel({ status: 'cancelled', minutesBeforeStart: 0 })).toBe(
      'Late cancellation — at start time',
    );
  });
});

describe('computeShiftMetrics', () => {
  it('sums the day: transitions, seated, cancellations + no-shows, automated', () => {
    const metrics = computeShiftMetrics([
      ...FULL_CYCLE,
      feed(5, 'cancelled', at(18, 50), ['confirmed', at(12)], { reservation_id: 2 }),
      feed(6, 'no_show', at(21, 20), ['pending', at(10)], {
        reservation_id: 3,
        changed_by: null,
        reservation: { ...SUMMARY, id: 3, reservation_date: at(21) },
      }),
      feed(7, 'cancelled', at(9), ['pending', at(8)], { reservation_id: 4 }),
    ]);

    expect(metrics.transitions).toBe(7);
    expect(metrics.seatedParties).toBe(1);
    expect(metrics.cancellationsAndNoShows).toBe(3);
    expect(metrics.automatedActions).toBe(1);
    expect(metrics.lateChanges).toBe(2); // la de las 9:00 se hizo con margen
    expect(metrics.avgConfirmationLeadMs).toBe(20 * 60_000);
    expect(metrics.avgReceptionWaitMs).toBe(7 * 60_000);
    expect(metrics.avgDiningMs).toBe(105 * 60_000);
    expect(metrics.diningOverruns).toBe(1);
  });

  it('reports zeros and null averages on an empty day', () => {
    const metrics = computeShiftMetrics([]);
    expect(metrics.transitions).toBe(0);
    expect(metrics.automatedActions).toBe(0);
    expect(metrics.avgConfirmationLeadMs).toBeNull();
  });
});

describe('filters', () => {
  const automatedCancel = feed(5, 'cancelled', at(18), ['pending', at(12)], { changed_by: null });
  const staffSeat = feed(6, 'seated', at(19), ['confirmed', at(12)], { changed_by: 12 });

  it('isolates by target status', () => {
    const f = { ...EMPTY_HISTORY_FILTERS, status: 'seated' as const };
    expect(matchesHistoryFilters(staffSeat, f)).toBe(true);
    expect(matchesHistoryFilters(automatedCancel, f)).toBe(false);
  });

  it('isolates by staff member, and "automated" means changed_by null', () => {
    expect(matchesHistoryFilters(staffSeat, { ...EMPTY_HISTORY_FILTERS, actor: 12 })).toBe(true);
    expect(matchesHistoryFilters(automatedCancel, { ...EMPTY_HISTORY_FILTERS, actor: 12 })).toBe(false);
    expect(matchesHistoryFilters(automatedCancel, { ...EMPTY_HISTORY_FILTERS, actor: 'automated' })).toBe(true);
    expect(matchesHistoryFilters(staffSeat, { ...EMPTY_HISTORY_FILTERS, actor: 'automated' })).toBe(false);
  });

  it('knows when filters are active', () => {
    expect(hasActiveHistoryFilters(EMPTY_HISTORY_FILTERS)).toBe(false);
    expect(hasActiveHistoryFilters({ ...EMPTY_HISTORY_FILTERS, actor: 'automated' })).toBe(true);
  });

  it('parses reservation lookups', () => {
    expect(parseReservationLookup('#RES-14')).toBe(14);
    expect(parseReservationLookup('res-14')).toBe(14);
    expect(parseReservationLookup(' 14 ')).toBe(14);
    expect(parseReservationLookup('RES 7')).toBe(7);
    expect(parseReservationLookup('carlos')).toBeNull();
    expect(parseReservationLookup('0')).toBeNull();
    expect(parseReservationLookup('')).toBeNull();
  });

  it('offers only the actors seen on the day, automated last', () => {
    const staff = new Map([[12, { name: 'Ana Ruiz', role: 'host' }]]);
    expect(actorOptions([automatedCancel, staffSeat, staffSeat, FULL_CYCLE[0]], staff)).toEqual([
      { value: 12, label: 'Ana Ruiz (Host)' },
      { value: 2, label: 'Staff #2' },
      { value: 'automated', label: 'Automated System' },
    ]);
  });
});

describe('formatting', () => {
  it('formats durations compactly', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(12 * 60_000)).toBe('12m');
    expect(formatDuration(65 * 60_000)).toBe('1h 05m');
    expect(formatDuration(-7 * 60_000)).toBe('7m');
    expect(formatDuration(27 * 60 * 60_000)).toBe('1d 3h');
    expect(formatDuration(null)).toBe('—');
  });

  it('labels reception wait and dining overrun with their direction', () => {
    expect(receptionWaitLabel(7 * 60_000)).toBe('7m wait');
    expect(receptionWaitLabel(-5 * 60_000)).toBe('5m early');
    expect(receptionWaitLabel(20_000)).toBe('On time');
    expect(diningOverrunLabel(15 * 60_000)).toBe('+15m over');
    expect(diningOverrunLabel(-20 * 60_000)).toBe('20m under');
  });

  it('prints the audit timestamp with seconds', () => {
    expect(auditTimestamp(at(19, 5, 12))).toBe('16/04/2026 19:05:12');
    expect(auditTimestamp(undefined)).toBe('—');
  });

  it('attributes null actors to the automated system', () => {
    const staff = new Map([[12, { name: 'Ana Ruiz', role: 'host' }]]);
    expect(actorLabel(null, staff)).toBe('Automated System');
    expect(actorLabel(12, staff)).toBe('Ana Ruiz (Host)');
    expect(actorLabel(7, staff)).toBe('Staff #7');
  });

  it('orders strictly by changed_at DESC', () => {
    expect(sortHistoryByRecency(FULL_CYCLE).map((e) => e.id)).toEqual([4, 3, 2, 1]);
  });
});
