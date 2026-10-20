// Rules for the diner roster: who is the main contact, how many people are left
// record versus group size, and how a guest is located by their contact.
//
// The rule that governs everything else is that of the PRINCIPAL: each reserve has exactly one.
// The backend enforces it on write (demotes to the previous and elevates to the next if the main
// leaves); here it is replicated to be able to notify BEFORE sending and to detect a roster that is already
// comes twisted from old data.

import type { Reservation, ReservationGuest } from '../types/reservation';

// ================= Column stops =================

// varchar(100) / varchar(100) / varchar(20) in `reservation_guests`.
export const GUEST_NAME_MAX = 100;
export const GUEST_EMAIL_MAX = 100;
export const GUEST_PHONE_MAX = 20;

// ================= Contacto principal =================

export const activeGuests = (guests: ReservationGuest[]): ReservationGuest[] =>
  guests.filter((g) => g.is_active);

export const primaryGuest = (guests: ReservationGuest[]): ReservationGuest | null =>
  activeGuests(guests).find((g) => g.is_primary) ?? null;

/**
 * Guarantee status "exactly one principal" in a roster.
 *
 * `none` and `multiple` are both broken states, but different: without main the room does not know
 * who to call, and with several he doesn't know which one. They are distinguished to be able to explain it.
 */
export type PrimaryIntegrity = 'ok' | 'none' | 'multiple' | 'empty';

export const primaryIntegrity = (guests: ReservationGuest[]): PrimaryIntegrity => {
  const active = activeGuests(guests);
  if (active.length === 0) return 'empty';
  const primaries = active.filter((g) => g.is_primary);
  if (primaries.length === 1) return 'ok';
  return primaries.length === 0 ? 'none' : 'multiple';
};

export const primaryIntegrityMessage = (state: PrimaryIntegrity): string => {
  switch (state) {
    case 'none':
      return 'No primary contact on this booking — nobody to call if the party is late.';
    case 'multiple':
      return 'More than one guest is flagged as the primary contact. Pick the one to keep.';
    default:
      return '';
  }
};

/**
 * Roster resulting from marking `guestId` as main.
 *
 * Reflects what the backend will do on save (downgrade) so that the table is
 * Update without waiting for reload. It is not sent: the truth is written by the server.
 */
export const withPrimary = (
  guests: ReservationGuest[],
  guestId: number,
): ReservationGuest[] =>
  guests.map((g) => ({ ...g, is_primary: g.is_active && g.id === guestId }));

/**
 * Who would take over if the current principal leaves.
 *
 * Same criteria as the service: the oldest active guest, which is the one who registered
 * first and almost always who made the reservation.
 */
export const successorPrimary = (
  guests: ReservationGuest[],
  leavingGuestId: number,
): ReservationGuest | null =>
  activeGuests(guests)
    .filter((g) => g.id !== leavingGuestId)
    .sort((a, b) => a.id - b.id)[0] ?? null;

export const primaryHandoverPrompt = (
  leaving: ReservationGuest,
  successor: ReservationGuest | null,
): string =>
  successor
    ? `${leaving.name} is the primary contact. Removing them promotes ${successor.name} to primary.`
    : `${leaving.name} is the only guest on this booking. Removing them leaves it with no contact.`;

// ================= Count vs Group Size =================

export interface RosterCount {
  registered: number;
  partySize: number;
  /** Diners in the group who do not yet have a file. */
  missing: number;
  complete: boolean;
  /** There are more chips than declared diners: someone signed up too much. */
  overfilled: boolean;
}

export const rosterCount = (
  guests: ReservationGuest[],
  partySize: number,
): RosterCount => {
  const registered = activeGuests(guests).length;
  const party = Number(partySize) || 0;
  return {
    registered,
    partySize: party,
    missing: Math.max(0, party - registered),
    complete: registered >= party && party > 0,
    overfilled: registered > party,
  };
};

// "Registered 3 of 4 Guests".
export const rosterCountLabel = (count: RosterCount): string =>
  `Registered ${count.registered} of ${count.partySize} Guests`;

// ================= Quick registration of companions =================

/**
 * Default name of the next generic companion.
 *
 * Number by the GAP left in the group, not by the total chips: if the roster has
 * "Carlos" and a "Guest 2" tab, the next one is "Guest 3" and not "Guest 2" again.
 */
export const nextCompanionName = (guests: ReservationGuest[]): string => {
  const used = new Set(
    activeGuests(guests)
      .map((g) => /^guest\s+(\d+)$/i.exec(g.name.trim())?.[1])
      .filter((n): n is string => Boolean(n))
      .map(Number),
  );
  let n = activeGuests(guests).length + 1;
  while (used.has(n)) n += 1;
  return `Guest ${n}`;
};

// ================= Form validation =================

/**
 * Guest name rule.
 *
 * Whether it is MANDATORY depends on the form, and that is the only difference between the two sites
 * that use it: in the roster a token without a name is useless, while the drawer of
 * reservation registration admits leaving it empty on purpose — it is the anonymous reservation ("table for two to
 * no one's name") which is taken when the client does not want to give the name over the phone.
 * Unifying the two into "always mandatory" broke that anonymous reservation, so the difference
 * it travels explicitly in the parameter instead of in two copies of the function.
 */
export const guestNameError = (
  raw: string,
  { required = true }: { required?: boolean } = {},
): string => {
  const value = raw.trim();
  if (!value) return required ? 'Guest name is required' : '';
  if (value.length > GUEST_NAME_MAX) {
    return `Name must be ${GUEST_NAME_MAX} characters or fewer`;
  }
  return '';
};

export const guestEmailError = (raw: string): string => {
  const value = raw.trim();
  if (!value) return '';
  if (value.length > GUEST_EMAIL_MAX) {
    return `Email must be ${GUEST_EMAIL_MAX} characters or fewer`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address';
  return '';
};

// The separators that people dictate don't travel to the backend.
export const normalizeGuestPhone = (raw: string): string => raw.replace(/[\s().-]/g, '');

/**
 * The DTO validates with `@IsPhoneNumber()` WITHOUT region, which requires international format: a
 * "600333444" simply returns 400. It is checked here to say it in the language of the form
 * instead of showing the raw server error.
 */
export const guestPhoneError = (raw: string): string => {
  const value = normalizeGuestPhone(raw);
  if (!value) return '';
  if (value.length > GUEST_PHONE_MAX) {
    return `Phone must be ${GUEST_PHONE_MAX} characters or fewer`;
  }
  if (!value.startsWith('+')) {
    return 'Use the international format, starting with the country code (e.g. +34600123456)';
  }
  if (!/^\+[1-9]\d{6,17}$/.test(value)) return 'That does not look like a valid phone number';
  return '';
};

// ================= Presentation =================

export const guestCode = (id: number): string => `#GST-${id}`;

// `tel:` requires the number without separators; `mailto:` the mail as is.
export const telHref = (phone?: string | null): string | null => {
  const value = normalizeGuestPhone(phone ?? '');
  return value ? `tel:${value}` : null;
};

export const mailtoHref = (email?: string | null): string | null => {
  const value = (email ?? '').trim();
  return value ? `mailto:${value}` : null;
};

export const hasContactDetails = (guest: ReservationGuest): boolean =>
  Boolean(guest.phone?.trim() || guest.email?.trim());

// ================= Feed and Search =================

export interface GuestWithContext extends ReservationGuest {
  /** Reservation to which it belongs, already resolved to be able to search and display the date. */
  reservationLabel: string;
  reservationDate: string;
  partySize: number;
}

export interface GuestFilters {
  search: string;
  /** Only the main contacts for each reservation. */
  primaryOnly: boolean;
  /** Only reserves whose roster does not yet cover the group size. */
  incompleteOnly: boolean;
}

export const EMPTY_GUEST_FILTERS: GuestFilters = {
  search: '',
  primaryOnly: false,
  incompleteOnly: false,
};

export const hasActiveGuestFilters = (f: GuestFilters): boolean =>
  f.search.trim().length > 0 || f.primaryOnly || f.incompleteOnly;

// Name, email and telephone: the three identifiers with which a client presents himself.
export const guestHaystack = (guest: GuestWithContext): string =>
  [
    guest.name,
    guest.email ?? '',
    guest.phone ?? '',
    guest.reservationLabel,
    guestCode(guest.id),
    `#res-${guest.reservation_id}`,
  ]
    .join(' ')
    .toLowerCase();

export const matchesGuestFilters = (
  guest: GuestWithContext,
  filters: GuestFilters,
  incompleteReservationIds: Set<number>,
): boolean => {
  if (filters.primaryOnly && !guest.is_primary) return false;
  if (filters.incompleteOnly && !incompleteReservationIds.has(guest.reservation_id)) {
    return false;
  }
  const term = filters.search.trim().toLowerCase();
  if (term && !guestHaystack(guest).includes(term)) return false;
  return true;
};

// ================= Roster KPIs =================

export interface GuestMetrics {
  /** ReservationGuest tokens active on the day. */
  totalRegisteredGuests: number;
  /** Reservations whose main contact has a usable telephone or email. */
  primaryContactsCaptured: number;
  /** Reserves with roster (the honest denominator of the previous ratio). */
  bookingsWithRoster: number;
  /** Average number of chips per reservation, with a decimal. */
  averagePartyComposition: number;
  /** Reservations whose roster does not reach the declared party_size. */
  incompleteRosters: number;
}

/**
 * Roster metrics for the day.
 *
 * "Primary Contacts Captured" counts RESERVATIONS, not guests: the operative question is how many
 * Tables can be called if they are late, and a reservation with three phones is still one.
 * The average is calculated on ALL reservations for the day, including those that are not yet available.
 * no one pointed out — they are precisely the ones that pull the average down and we have to see.
 */
export const computeGuestMetrics = (
  reservations: Reservation[],
): GuestMetrics => {
  let totalRegisteredGuests = 0;
  let primaryContactsCaptured = 0;
  let bookingsWithRoster = 0;
  let incompleteRosters = 0;

  for (const reservation of reservations) {
    const guests = activeGuests(reservation.guests ?? []);
    totalRegisteredGuests += guests.length;
    if (guests.length > 0) bookingsWithRoster += 1;

    const primary = primaryGuest(guests);
    if (primary && hasContactDetails(primary)) primaryContactsCaptured += 1;

    if (!rosterCount(guests, reservation.party_size).complete) incompleteRosters += 1;
  }

  return {
    totalRegisteredGuests,
    primaryContactsCaptured,
    bookingsWithRoster,
    averagePartyComposition:
      reservations.length === 0
        ? 0
        : Math.round((totalRegisteredGuests / reservations.length) * 10) / 10,
    incompleteRosters,
  };
};

export const contactCaptureRate = (metrics: GuestMetrics, totalBookings: number): number =>
  totalBookings === 0 ? 0 : (metrics.primaryContactsCaptured / totalBookings) * 100;
