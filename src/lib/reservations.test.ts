import { describe, expect, it } from 'vitest';
import type { Reservation, ReservationStatus } from '../types/reservation';
import {
  EMPTY_FILTERS,
  allowedTransitions,
  buildDayRange,
  canTransition,
  clockTime,
  composeReservationDate,
  computeDailyMetrics,
  durationError,
  formatBookingWindow,
  formatPercent,
  hasActiveFilters,
  hourSlotLabel,
  illegalTransitionMessage,
  isNoShowCandidate,
  isTerminalStatus,
  matchesReservationFilters,
  normalizeReservation,
  partySizeError,
  reservationCode,
  reservationDateError,
  reservationHaystack,
  searchCustomers,
  seatedStampFor,
  splitReservationDate,
  toggleInList,
  windowsOverlap,
} from './reservations';

// Instants in LOCAL time: grid, day range and 12h formatter read the
// local clock, so the tests have to speak the same language in any area.
const at = (h: number, m = 0): string => new Date(2026, 3, 16, h, m, 0).toISOString();

const booking = (over: Partial<Reservation> & { id: number }): Reservation => ({
  merchant_id: 1,
  customer_id: null,
  reservation_date: at(19),
  duration_minutes: 90,
  seated_at: null,
  party_size: 4,
  status: 'pending',
  source: 'phone',
  special_requests: null,
  created_by: null,
  ...over,
});

describe('life cycle state machine', () => {
  it('allows the normal path of service', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'seated')).toBe(true);
    expect(canTransition('seated', 'completed')).toBe(true);
  });

  it('blocks illegal jump from aborted to completed', () => {
    expect(canTransition('cancelled', 'completed')).toBe(false);
  });

  it('It does not allow an absence or a reservation that has already been completed to be resurrected', () => {
    expect(canTransition('no_show', 'seated')).toBe(false);
    expect(canTransition('completed', 'seated')).toBe(false);
  });

  it('a table already seated can only end', () => {
    expect(allowedTransitions('seated')).toEqual(['completed']);
    expect(canTransition('seated', 'cancelled')).toBe(false);
  });

  it('marks the three final states as terminal', () => {
    (['completed', 'cancelled', 'no_show'] as ReservationStatus[]).forEach((status) => {
      expect(isTerminalStatus(status)).toBe(true);
      expect(allowedTransitions(status)).toEqual([]);
    });
    expect(isTerminalStatus('pending')).toBe(false);
  });

  it('the waiting list can enter the book', () => {
    expect(canTransition('white_list', 'confirmed')).toBe(true);
  });

  it('explains illegal jumping with readable state names', () => {
    expect(illegalTransitionMessage('cancelled', 'completed')).toBe(
      'Illegal lifecycle jump: a Cancelled reservation cannot become Completed.',
    );
  });
});

describe('automatic arrival seal (seated_at)', () => {
  const now = new Date(2026, 3, 16, 19, 5, 0);

  it('stamps the time when entering SEATED', () => {
    const stamp = seatedStampFor(booking({ id: 1, status: 'confirmed' }), 'seated', now);
    expect(stamp).toBe(now.toISOString());
  });

  it('does not seal anything in the other transitions', () => {
    expect(seatedStampFor(booking({ id: 1 }), 'confirmed', now)).toBeUndefined();
  });

  it('does not rewrite a previous mark: the first is the actual arrival time', () => {
    const first = at(19, 2);
    expect(
      seatedStampFor(booking({ id: 1, status: 'seated', seated_at: first }), 'seated', now),
    ).toBeUndefined();
  });
});

describe('candidata a no-show', () => {
  it('After the courtesy of 15 minutes, a confirmed candidate is', () => {
    const late = new Date(2026, 3, 16, 19, 16, 0);
    expect(isNoShowCandidate(booking({ id: 1, status: 'confirmed' }), late)).toBe(true);
  });

  it('within courtesy it is still not', () => {
    const grace = new Date(2026, 3, 16, 19, 14, 0);
    expect(isNoShowCandidate(booking({ id: 1, status: 'confirmed' }), grace)).toBe(false);
  });

  it('a reservation already seated is never a candidate', () => {
    const late = new Date(2026, 3, 16, 20, 0, 0);
    expect(isNoShowCandidate(booking({ id: 1, status: 'seated' }), late)).toBe(false);
  });
});

describe('KPIs of the day', () => {
  const day: Reservation[] = [
    booking({ id: 1, status: 'pending', party_size: 2 }),
    booking({ id: 2, status: 'confirmed', party_size: 4 }),
    booking({ id: 3, status: 'seated', party_size: 3 }),
    booking({ id: 4, status: 'completed', party_size: 5 }),
    booking({ id: 5, status: 'cancelled', party_size: 8 }),
    booking({ id: 6, status: 'no_show', party_size: 6 }),
  ];

  it('add the expected diners leaving out the canceled ones', () => {
    // 2 + 4 + 3 + 5 + 6 = 20; The 8 of the canceled one are not expected.
    expect(computeDailyMetrics(day).totalExpectedGuests).toBe(20);
  });

  it('those seated and those who have already finished count as covered', () => {
    expect(computeDailyMetrics(day).coveredGuests).toBe(8);
  });

  it('count pending confirmations', () => {
    expect(computeDailyMetrics(day).pendingConfirmations).toBe(1);
  });

  it('calculates the no-show rate on the total reservations of the day', () => {
    // 1 of 6 reservations.
    expect(computeDailyMetrics(day).noShowRate).toBeCloseTo(16.666, 2);
  });

  it('calculates occupancy based on expected diners', () => {
    // 8 covered out of 20 expected.
    expect(computeDailyMetrics(day).occupancyRate).toBe(40);
  });

  it('an empty day does not divide by zero', () => {
    const empty = computeDailyMetrics([]);
    expect(empty.noShowRate).toBe(0);
    expect(empty.occupancyRate).toBe(0);
    expect(empty.totalExpectedGuests).toBe(0);
  });

  it('format percentages with a decimal', () => {
    expect(formatPercent(16.666)).toBe('16.7%');
  });
});

describe('filtros', () => {
  const withRequest = booking({
    id: 1,
    special_requests: 'Window seat preferred',
    source: 'online',
    status: 'confirmed',
  });
  const withGuest = booking({
    id: 2,
    source: 'walk_in',
    status: 'seated',
    guests: [
      {
        id: 9,
        reservation_id: 2,
        name: 'Carlos Mendoza',
        email: 'carlos@example.com',
        phone: '+34 600 123 456',
        is_primary: true,
        is_active: true,
      },
    ],
  });

  it('without filters it hides nothing', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(matchesReservationFilters(withRequest, EMPTY_FILTERS)).toBe(true);
  });

  it('filter by status (multi-selection)', () => {
    const filters = { ...EMPTY_FILTERS, statuses: ['seated' as ReservationStatus] };
    expect(matchesReservationFilters(withGuest, filters)).toBe(true);
    expect(matchesReservationFilters(withRequest, filters)).toBe(false);
  });

  it('filter by source channel', () => {
    const filters = { ...EMPTY_FILTERS, sources: ['online'] };
    expect(matchesReservationFilters(withRequest, filters)).toBe(true);
    expect(matchesReservationFilters(withGuest, filters)).toBe(false);
  });

  it('search by text in special requests', () => {
    const filters = { ...EMPTY_FILTERS, search: 'window' };
    expect(matchesReservationFilters(withRequest, filters)).toBe(true);
  });

  it('search by phone and email for a companion on the roster', () => {
    expect(
      matchesReservationFilters(withGuest, { ...EMPTY_FILTERS, search: '600 123' }),
    ).toBe(true);
    expect(
      matchesReservationFilters(withGuest, { ...EMPTY_FILTERS, search: 'carlos@example' }),
    ).toBe(true);
  });

  it('search by CRM customer name', () => {
    const linked = booking({ id: 3, customer_id: 44 });
    expect(
      matchesReservationFilters(linked, { ...EMPTY_FILTERS, search: 'lucia' }, 'Lucia Prat'),
    ).toBe(true);
  });

  it('combine state and text with logical AND', () => {
    const filters = {
      statuses: ['confirmed' as ReservationStatus],
      sources: [],
      search: 'window',
    };
    expect(matchesReservationFilters(withRequest, filters)).toBe(true);
    expect(
      matchesReservationFilters({ ...withRequest, status: 'pending' }, filters),
    ).toBe(false);
  });

  it('the haystack includes the reservation code', () => {
    expect(reservationHaystack(withRequest)).toContain('#res-1');
  });

  it('toggleInList adds and removes', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('ventanas semiabiertas', () => {
  it('two reservations in a row do not overlap', () => {
    expect(windowsOverlap(0, 100, 100, 200)).toBe(false);
    expect(windowsOverlap(0, 101, 100, 200)).toBe(true);
  });
});

describe('fechas y formato', () => {
  it('the day range covers 24 local hours', () => {
    const { from, to } = buildDayRange('2026-04-16');
    expect(new Date(from).getTime()).toBe(new Date(2026, 3, 16, 0, 0, 0, 0).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 3, 17, 0, 0, 0, 0).getTime());
  });

  it('formats the time in 12 hours with AM/PM', () => {
    expect(clockTime(at(19, 5))).toBe('07:05 PM');
    expect(clockTime(at(0, 30))).toBe('12:30 AM');
    expect(clockTime(null)).toBe('');
  });

  it('label grill stripes', () => {
    expect(hourSlotLabel(13)).toBe('01:00 PM');
    expect(hourSlotLabel(0)).toBe('12:00 AM');
  });

  it('describes the booking window with its duration', () => {
    expect(formatBookingWindow(booking({ id: 1 }))).toBe('07:00 PM – 08:30 PM (90 min)');
  });

  it('compose and decompose the form date without losing local time', () => {
    const iso = composeReservationDate('2026-04-16', '19:30');
    expect(splitReservationDate(iso)).toEqual({ date: '2026-04-16', time: '19:30' });
  });

  it('the reservation code uses the story format', () => {
    expect(reservationCode(12)).toBe('#RES-12');
  });
});

describe('discharge validation', () => {
  it('requires a group size that is integer and greater than zero', () => {
    expect(partySizeError('4')).toBe('');
    expect(partySizeError('0')).toBe('Party size must be greater than 0');
    expect(partySizeError('-2')).toBe('Party size must be greater than 0');
    expect(partySizeError('2.5')).toBe('Party size must be a whole number');
    expect(partySizeError('')).toBe('Party size is required');
  });

  it('requires a positive duration', () => {
    expect(durationError('90')).toBe('');
    expect(durationError('0')).toBe('Duration must be greater than 0');
  });

  it('requires valid date and time', () => {
    expect(reservationDateError('2026-04-16', '19:00')).toBe('');
    expect(reservationDateError('', '19:00')).toBe('Reservation date is required');
    expect(reservationDateError('2026-04-16', '')).toBe('Reservation time is required');
  });
});

describe('customer autocompletion', () => {
  const customers = [
    { id: 1, name: 'Lucia Prat', email: 'lucia@example.com', phone: '600111222' },
    { id: 2, name: 'Carlos Mendoza', email: 'carlos@example.com', phone: '600333444' },
  ];

  it('search by name, phone number and email', () => {
    expect(searchCustomers(customers, 'lucia').map((c) => c.id)).toEqual([1]);
    expect(searchCustomers(customers, '600333').map((c) => c.id)).toEqual([2]);
    expect(searchCustomers(customers, 'carlos@').map((c) => c.id)).toEqual([2]);
  });

  it('with the empty box it does not propose anything', () => {
    expect(searchCustomers(customers, '   ')).toEqual([]);
  });
});

describe('defensive normalization', () => {
  it('an inherited state drops to pending instead of breaking the queue', () => {
    const raw = { ...booking({ id: 1 }), status: 'walk_in_hold' as ReservationStatus };
    expect(normalizeReservation(raw).status).toBe('pending');
  });

  it('numbers arriving as text are converted', () => {
    const raw = {
      ...booking({ id: 1 }),
      party_size: '4' as unknown as number,
      duration_minutes: '90' as unknown as number,
    };
    const normalized = normalizeReservation(raw);
    expect(normalized.party_size).toBe(4);
    expect(normalized.duration_minutes).toBe(90);
  });
});
