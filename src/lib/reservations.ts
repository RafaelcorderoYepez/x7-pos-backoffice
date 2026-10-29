// Reservation book rules: what status transition is legal, how many people are expected in
// the day, and if the venue's capacity can support one more reservation in a specific slot.
//
// Everything that decides "this reservation counts" goes through the helpers of this file so that the
// strip of KPIs, the filters and the grid cannot disagree with each other. The module is pure
// (without fetch or React) because it is the part that is really tested.

import type {
  Reservation,
  ReservationGuest,
  ReservationStatus,
} from '../types/reservation';
import {
  NO_SHOW_GRACE_MINUTES,
  RESERVATION_STATUS_LABELS,
  isReservationStatus,
} from '../types/reservation';

// ================= State Machine =================

// Graph of legal life cycle transitions. What does NOT appear here is an illegal jump:
// from `cancelled` or `completed` is not exited (they are terminals), and `seated` is only reached from
// a live reservation, never from a canceled one. The backend doesn't enforce any of this yet, so
// that the UI save is the only thing that prevents leaving the history in an impossible state.
export const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'seated', 'cancelled', 'no_show', 'white_list'],
  // Confirmed it can be seated, canceled or marked absent after the courtesy.
  confirmed: ['seated', 'cancelled', 'no_show'],
  // Sitting only advances to finished; overriding a table that is already eating doesn't make sense
  // operational (that's what closing the command and completing it is for).
  seated: ['completed'],
  // Terminals: the reserve has already closed its history.
  completed: [],
  cancelled: [],
  no_show: [],
  // The waiting list enters the book when space becomes available, or falls.
  white_list: ['pending', 'confirmed', 'cancelled', 'no_show'],
};

export const allowedTransitions = (from: ReservationStatus): ReservationStatus[] =>
  RESERVATION_TRANSITIONS[from] ?? [];

export const canTransition = (from: ReservationStatus, to: ReservationStatus): boolean =>
  allowedTransitions(from).includes(to);

export const isTerminalStatus = (status: ReservationStatus): boolean =>
  allowedTransitions(status).length === 0;

export const illegalTransitionMessage = (
  from: ReservationStatus,
  to: ReservationStatus,
): string =>
  `Illegal lifecycle jump: a ${RESERVATION_STATUS_LABELS[from]} reservation cannot become ${RESERVATION_STATUS_LABELS[to]}.`;

// `seated_at` is sealed upon entering SEATED and is NEVER rewritten: if the row already has a flag
// (a reserve who sat down, stood up and sat down again after a correction), the first
// is the actual arrival time of the group.
export const seatedStampFor = (
  reservation: Pick<Reservation, 'status' | 'seated_at'>,
  next: ReservationStatus,
  now: Date = new Date(),
): string | undefined => {
  if (next !== 'seated') return undefined;
  if (reservation.seated_at) return undefined;
  return now.toISOString();
};

// After the courtesy of the reserved time, a reservation that still does not sit down is a candidate
// to no-show. It is a SUGGESTION to the hostess (the line badge), not a transition
// automatic: the person who decides that the client did not come is a person.
export const isNoShowCandidate = (
  reservation: Pick<Reservation, 'status' | 'reservation_date'>,
  now: Date = new Date(),
  graceMinutes: number = NO_SHOW_GRACE_MINUTES,
): boolean => {
  if (reservation.status !== 'pending' && reservation.status !== 'confirmed') return false;
  const start = new Date(reservation.reservation_date).getTime();
  if (Number.isNaN(start)) return false;
  return now.getTime() > start + graceMinutes * 60_000;
};

// ================= Ventana temporal =================

export const reservationStart = (reservation: Pick<Reservation, 'reservation_date'>): number =>
  new Date(reservation.reservation_date).getTime();

export const reservationEnd = (
  reservation: Pick<Reservation, 'reservation_date' | 'duration_minutes'>,
): number => reservationStart(reservation) + (reservation.duration_minutes || 0) * 60_000;

// Overlap of two semi-open intervals [beginning, end): two reserves that touch each other right at the
// edge (one ends at 9:00 p.m. and the next starts at 9:00 p.m.) They DO NOT compete for the table.
export const windowsOverlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => aStart < bEnd && bStart < aEnd;

// Day range [00:00, 24:00) in local LOCAL TIME, not UTC: overnight service
// belongs to the day that the hostess sees on her watch, and divide it by the Greenwich meridian
// would move late dinners to the next day in half of Europe.
export const buildDayRange = (isoDate: string): { from: string; to: string } => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const from = new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
  const to = new Date(year, (month ?? 1) - 1, (day ?? 1) + 1, 0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
};

export const todayIsoDate = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// 12 h format built by hand and not with toLocaleTimeString: the separator that ICU puts
// before AM/PM switches between versions of Node (thin space U+202F), and this string is
// It compares in the tests and is read on the grid.
export const clockTime = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
};

export const hourSlotLabel = (hour: number): string => {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(h12).padStart(2, '0')}:00 ${suffix}`;
};

// "07:00 PM – 08:30 PM (90 min)".
export const formatBookingWindow = (
  reservation: Pick<Reservation, 'reservation_date' | 'duration_minutes'>,
): string => {
  const start = clockTime(reservation.reservation_date);
  if (!start) return '—';
  const end = clockTime(new Date(reservationEnd(reservation)).toISOString());
  return `${start} – ${end} (${reservation.duration_minutes} min)`;
};

export const reservationHour = (
  reservation: Pick<Reservation, 'reservation_date'>,
): number => {
  const d = new Date(reservation.reservation_date);
  return Number.isNaN(d.getTime()) ? -1 : d.getHours();
};

export const reservationCode = (id: number): string => `#RES-${id}`;

// ================= KPIs of the day =================

export interface DailyReservationMetrics {
  /** Sum of party_size of everything that is NOT overridden: the people the venue expects to serve. */
  totalExpectedGuests: number;
  /** Comensales ya sentados o que ya terminaron: cubiertos reales. */
  coveredGuests: number;
  /** Reservations not yet confirmed. */
  pendingConfirmations: number;
  /** % of no-shows of the total reservations for the day (0 if there are none). */
  noShowRate: number;
  /** % of covers over expected diners: service occupancy. */
  occupancyRate: number;
  totalReservations: number;
  noShowCount: number;
}

// The denominator of the no-show is the TOTAL reservations of the day (cancelled included), as
// asks the story: "percentage of NO_SHOW bookings relative to total daily reservations".
// That of the occupation, on the other hand, is the expected diners - comparing cutlery against a
// total that includes cancellations would leave occupancy artificially low.
export const computeDailyMetrics = (
  reservations: Reservation[],
): DailyReservationMetrics => {
  let totalExpectedGuests = 0;
  let coveredGuests = 0;
  let pendingConfirmations = 0;
  let noShowCount = 0;

  for (const r of reservations) {
    const party = Number(r.party_size) || 0;
    if (r.status !== 'cancelled') totalExpectedGuests += party;
    if (r.status === 'seated' || r.status === 'completed') coveredGuests += party;
    if (r.status === 'pending') pendingConfirmations += 1;
    if (r.status === 'no_show') noShowCount += 1;
  }

  const totalReservations = reservations.length;

  return {
    totalExpectedGuests,
    coveredGuests,
    pendingConfirmations,
    noShowCount,
    totalReservations,
    noShowRate: totalReservations === 0 ? 0 : (noShowCount / totalReservations) * 100,
    occupancyRate:
      totalExpectedGuests === 0 ? 0 : (coveredGuests / totalExpectedGuests) * 100,
  };
};

// A decimal: "12.5%" says something in a service of 40 reservations, "12.4999%" does not.
export const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

// ================= Filtros =================

export interface ReservationFilters {
  /** Empty = unfiltered (a group of unchecked checkboxes hides nothing). */
  statuses: ReservationStatus[];
  sources: string[];
  search: string;
}

export const EMPTY_FILTERS: ReservationFilters = { statuses: [], sources: [], search: '' };

export const hasActiveFilters = (f: ReservationFilters): boolean =>
  f.statuses.length > 0 || f.sources.length > 0 || f.search.trim().length > 0;

// The three axes by which a manager looks for a reservation: who is coming (name of the client
// or any companion on the roster), how to contact him, and what he requested.
export const reservationHaystack = (
  reservation: Reservation,
  customerName?: string,
): string => {
  const guests = reservation.guests ?? [];
  return [
    customerName ?? '',
    reservation.special_requests ?? '',
    reservation.source ?? '',
    reservationCode(reservation.id),
    String(reservation.id),
    ...guests.flatMap((g: ReservationGuest) => [g.name, g.email ?? '', g.phone ?? '']),
  ]
    .join(' ')
    .toLowerCase();
};

export const matchesReservationFilters = (
  reservation: Reservation,
  filters: ReservationFilters,
  customerName?: string,
): boolean => {
  if (filters.statuses.length > 0 && !filters.statuses.includes(reservation.status)) {
    return false;
  }
  if (filters.sources.length > 0 && !filters.sources.includes(reservation.source ?? '')) {
    return false;
  }
  const term = filters.search.trim().toLowerCase();
  if (term && !reservationHaystack(reservation, customerName).includes(term)) return false;
  return true;
};

export const toggleInList = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

// ================= Aforo =================
//
// The capacity is NOT calculated here: it is decided by the server (`/api/reservation-capacity`, peak
// simultaneous CONFIRMED/SEATED diners + limit of arrivals per slot) within the
// discharge transaction. See src/lib/reservation-capacity.ts.

// ================= Registration validation =================

export const partySizeError = (raw: string): string => {
  if (!raw.trim()) return 'Party size is required';
  const value = Number(raw);
  if (!Number.isInteger(value)) return 'Party size must be a whole number';
  if (value <= 0) return 'Party size must be greater than 0';
  return '';
};

export const durationError = (raw: string): string => {
  if (!raw.trim()) return 'Duration is required';
  const value = Number(raw);
  if (!Number.isInteger(value)) return 'Duration must be a whole number of minutes';
  if (value <= 0) return 'Duration must be greater than 0';
  return '';
};

export const reservationDateError = (date: string, time: string): string => {
  if (!date) return 'Reservation date is required';
  if (!time) return 'Reservation time is required';
  const composed = new Date(`${date}T${time}`);
  if (Number.isNaN(composed.getTime())) return 'Reservation date and time are invalid';
  return '';
};

// The <input type="datetime-local"> returns local time without zone; the contract asks for a moment
// ISO in UTC, and Date converts it using the browser zone — which is just the local zone.
export const composeReservationDate = (date: string, time: string): string =>
  new Date(`${date}T${time}`).toISOString();

// Local parts of an ISO instant, to fill the two inputs when reopening the drawer.
export const splitReservationDate = (iso: string): { date: string; time: string } => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: todayIsoDate(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
};

// A guest's contact rules (name/email/phone, with column limits and
// the international format required by @IsPhoneNumber) live in `reservation-guests.ts`, which is
// the module that owns the roster. They were duplicated here and there: two copies of the same rule
// They separate as soon as one of the two adjusts.

// ================= Customer Search =================

// CRM autocompletion by name, phone number or email, the three identifiers with which
// A client shows up on the phone.
export const searchCustomers = <T extends { name: string; email?: string | null; phone?: string | null }>(
  customers: T[],
  term: string,
  limit = 8,
): T[] => {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  return customers
    .filter((c) =>
      [c.name, c.email ?? '', c.phone ?? ''].join(' ').toLowerCase().includes(q),
    )
    .slice(0, limit);
};

// ================= Defensive Normalization =================

// The backend can return an inherited status outside the enum (or null). The line has to
// remain visible and filterable, so it falls to `pending`, which is the initial state.
export const normalizeReservation = (raw: Reservation): Reservation => ({
  ...raw,
  status: isReservationStatus(raw.status) ? raw.status : 'pending',
  party_size: Number(raw.party_size) || 0,
  duration_minutes: Number(raw.duration_minutes) || 0,
});
