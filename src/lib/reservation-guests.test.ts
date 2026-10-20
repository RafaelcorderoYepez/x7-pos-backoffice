import { describe, expect, it } from 'vitest';
import type { Reservation, ReservationGuest } from '../types/reservation';
import {
  EMPTY_GUEST_FILTERS,
  activeGuests,
  computeGuestMetrics,
  contactCaptureRate,
  guestCode,
  guestEmailError,
  guestHaystack,
  guestNameError,
  guestPhoneError,
  hasActiveGuestFilters,
  hasContactDetails,
  mailtoHref,
  matchesGuestFilters,
  nextCompanionName,
  normalizeGuestPhone,
  primaryGuest,
  primaryHandoverPrompt,
  primaryIntegrity,
  primaryIntegrityMessage,
  rosterCount,
  rosterCountLabel,
  successorPrimary,
  telHref,
  withPrimary,
  type GuestWithContext,
} from './reservation-guests';

const at = (h: number): string => new Date(2026, 3, 16, h, 0, 0).toISOString();

const guest = (over: Partial<ReservationGuest> & { id: number }): ReservationGuest => ({
  reservation_id: 1,
  name: `Guest ${over.id}`,
  email: null,
  phone: null,
  is_primary: false,
  is_active: true,
  ...over,
});

const booking = (over: Partial<Reservation> & { id: number }): Reservation => ({
  merchant_id: 1,
  customer_id: null,
  reservation_date: at(19),
  duration_minutes: 90,
  seated_at: null,
  party_size: 4,
  status: 'confirmed',
  source: 'phone',
  special_requests: null,
  created_by: null,
  guests: [],
  ...over,
});

const withContext = (g: ReservationGuest, label = 'Carlos Mendoza'): GuestWithContext => ({
  ...g,
  reservationLabel: label,
  reservationDate: at(19),
  partySize: 4,
});

describe('contacto principal', () => {
  it('ignore deleted tokens', () => {
    const roster = [guest({ id: 1, is_active: false }), guest({ id: 2 })];
    expect(activeGuests(roster).map((g) => g.id)).toEqual([2]);
  });

  it('a deregistered principal no longer counts as a principal', () => {
    const roster = [guest({ id: 1, is_primary: true, is_active: false }), guest({ id: 2 })];
    expect(primaryGuest(roster)).toBeNull();
  });

  it('recognizes the healthy roster', () => {
    expect(primaryIntegrity([guest({ id: 1, is_primary: true }), guest({ id: 2 })])).toBe('ok');
  });

  it('distinguishes being left without principal from having several', () => {
    expect(primaryIntegrity([guest({ id: 1 }), guest({ id: 2 })])).toBe('none');
    expect(
      primaryIntegrity([guest({ id: 1, is_primary: true }), guest({ id: 2, is_primary: true })]),
    ).toBe('multiple');
  });

  it('an empty roster is not a broken roster', () => {
    expect(primaryIntegrity([])).toBe('empty');
    expect(primaryIntegrityMessage('empty')).toBe('');
    expect(primaryIntegrityMessage('ok')).toBe('');
  });

  it('explains the two broken states differently', () => {
    expect(primaryIntegrityMessage('none')).toMatch(/nobody to call/i);
    expect(primaryIntegrityMessage('multiple')).toMatch(/more than one/i);
  });

  it('mark primary demeans others', () => {
    const roster = [guest({ id: 1, is_primary: true }), guest({ id: 2 }), guest({ id: 3 })];
    const next = withPrimary(roster, 2);
    expect(next.map((g) => g.is_primary)).toEqual([false, true, false]);
  });

  it('never raises a dropped token', () => {
    const roster = [guest({ id: 1, is_active: false }), guest({ id: 2, is_primary: true })];
    expect(withPrimary(roster, 1).find((g) => g.id === 1)?.is_primary).toBe(false);
  });

  it('relay is the oldest active guest', () => {
    const roster = [
      guest({ id: 5, is_primary: true }),
      guest({ id: 9 }),
      guest({ id: 7 }),
      guest({ id: 3, is_active: false }),
    ];
    expect(successorPrimary(roster, 5)?.id).toBe(7);
  });

  it('without anyone else there is no relief', () => {
    expect(successorPrimary([guest({ id: 1, is_primary: true })], 1)).toBeNull();
  });

  it('informs who passes the baton to', () => {
    const leaving = guest({ id: 1, name: 'Carlos', is_primary: true });
    expect(primaryHandoverPrompt(leaving, guest({ id: 2, name: 'Ana' }))).toMatch(
      /promotes Ana to primary/,
    );
    expect(primaryHandoverPrompt(leaving, null)).toMatch(/leaves it with no contact/);
  });
});

describe('count vs group size', () => {
  it('counts only active chips', () => {
    const roster = [guest({ id: 1 }), guest({ id: 2 }), guest({ id: 3, is_active: false })];
    const count = rosterCount(roster, 4);
    expect(count.registered).toBe(2);
    expect(count.missing).toBe(2);
    expect(count.complete).toBe(false);
  });

  it('check the complete roster', () => {
    const count = rosterCount([guest({ id: 1 }), guest({ id: 2 })], 2);
    expect(count.complete).toBe(true);
    expect(count.missing).toBe(0);
  });

  it('detects more chips than declared diners', () => {
    expect(rosterCount([guest({ id: 1 }), guest({ id: 2 })], 1).overfilled).toBe(true);
  });

  it('label the count as the story asks', () => {
    expect(rosterCountLabel(rosterCount([guest({ id: 1 }), guest({ id: 2 }), guest({ id: 3 })], 4)))
      .toBe('Registered 3 of 4 Guests');
  });
});

describe('quick registration of companions', () => {
  it('number for the gap left', () => {
    expect(nextCompanionName([guest({ id: 1, name: 'Carlos' })])).toBe('Guest 2');
  });

  it('does not repeat a number already used', () => {
    // There are two tiles, but "Guest 2" already exists: the next one is 3.
    const roster = [guest({ id: 1, name: 'Carlos' }), guest({ id: 2, name: 'Guest 2' })];
    expect(nextCompanionName(roster)).toBe('Guest 3');
  });

  it('starts at 1 with empty roster', () => {
    expect(nextCompanionName([])).toBe('Guest 1');
  });
});

describe('form validation', () => {
  it('demands a name and respects the top of the column', () => {
    expect(guestNameError('Carlos Mendoza')).toBe('');
    expect(guestNameError('   ')).toBe('Guest name is required');
    expect(guestNameError('x'.repeat(101))).toMatch(/100 characters or fewer/);
  });

  it('allows leaving the name empty when the form does not require it', () => {
    // The reservation registration drawer supports anonymous reservation: empty name is valid there, and
    // the column stop is still being checked.
    expect(guestNameError('', { required: false })).toBe('');
    expect(guestNameError('x'.repeat(101), { required: false })).toMatch(
      /100 characters or fewer/,
    );
  });

  it('validate the email and its limit', () => {
    expect(guestEmailError('carlos@example.com')).toBe('');
    expect(guestEmailError('')).toBe('');
    expect(guestEmailError('nope')).toMatch(/valid email/);
    expect(guestEmailError(`${'a'.repeat(95)}@example.com`)).toMatch(/100 characters or fewer/);
  });

  it('requires the international phone format', () => {
    // @IsPhoneNumber() without region: a simple national number returns 400.
    expect(guestPhoneError('+34600123456')).toBe('');
    expect(guestPhoneError('+34 600 123 456')).toBe('');
    expect(guestPhoneError('600123456')).toMatch(/international format/);
    expect(guestPhoneError('')).toBe('');
  });

  it('rejects a phone number above 20 characters in the column', () => {
    expect(guestPhoneError(`+${'1'.repeat(25)}`)).toMatch(/20 characters or fewer/);
  });

  it('normalizes the phone by removing separators', () => {
    expect(normalizeGuestPhone('+34 600-123 (456)')).toBe('+34600123456');
  });
});

describe('direct contact links', () => {
  it('compose tel: without dividers', () => {
    expect(telHref('+34 600 123 456')).toBe('tel:+34600123456');
  });

  it('compone mailto:', () => {
    expect(mailtoHref(' carlos@example.com ')).toBe('mailto:carlos@example.com');
  });

  it('without data it does not invent a dead link', () => {
    expect(telHref(null)).toBeNull();
    expect(mailtoHref('')).toBeNull();
  });

  it('knows if a token is contactable', () => {
    expect(hasContactDetails(guest({ id: 1, phone: '+34600123456' }))).toBe(true);
    expect(hasContactDetails(guest({ id: 2, email: 'a@b.com' }))).toBe(true);
    expect(hasContactDetails(guest({ id: 3 }))).toBe(false);
  });

  it('guest code uses story format', () => {
    expect(guestCode(12)).toBe('#GST-12');
  });
});

describe('search and filters', () => {
  const carlos = withContext(
    guest({ id: 1, name: 'Carlos Mendoza', phone: '+34600333444', is_primary: true }),
  );
  const ana = withContext(
    guest({ id: 2, reservation_id: 7, name: 'Ana Ruiz', email: 'ana@example.com' }),
    'Lucia Prat',
  );

  it('without filters it hides nothing', () => {
    expect(hasActiveGuestFilters(EMPTY_GUEST_FILTERS)).toBe(false);
    expect(matchesGuestFilters(carlos, EMPTY_GUEST_FILTERS, new Set())).toBe(true);
  });

  it('search by name, phone number and email', () => {
    const by = (search: string, g = carlos) =>
      matchesGuestFilters(g, { ...EMPTY_GUEST_FILTERS, search }, new Set());
    expect(by('mendoza')).toBe(true);
    expect(by('600333')).toBe(true);
    expect(by('ana@example', ana)).toBe(true);
  });

  it('search for the reservation to which it belongs', () => {
    expect(
      matchesGuestFilters(ana, { ...EMPTY_GUEST_FILTERS, search: '#res-7' }, new Set()),
    ).toBe(true);
    expect(
      matchesGuestFilters(ana, { ...EMPTY_GUEST_FILTERS, search: 'lucia' }, new Set()),
    ).toBe(true);
  });

  it('isolate main contacts', () => {
    const filters = { ...EMPTY_GUEST_FILTERS, primaryOnly: true };
    expect(matchesGuestFilters(carlos, filters, new Set())).toBe(true);
    expect(matchesGuestFilters(ana, filters, new Set())).toBe(false);
  });

  it('isolate incomplete rosters', () => {
    const filters = { ...EMPTY_GUEST_FILTERS, incompleteOnly: true };
    expect(matchesGuestFilters(ana, filters, new Set([7]))).toBe(true);
    expect(matchesGuestFilters(carlos, filters, new Set([7]))).toBe(false);
  });

  it('the haystack covers all three identifiers', () => {
    const hay = guestHaystack(carlos);
    expect(hay).toContain('carlos mendoza');
    expect(hay).toContain('+34600333444');
    expect(hay).toContain('#gst-1');
  });
});

describe('Roster KPIs', () => {
  const day = [
    booking({
      id: 1,
      party_size: 4,
      guests: [
        guest({ id: 1, is_primary: true, phone: '+34600111222' }),
        guest({ id: 2 }),
      ],
    }),
    // Principal without contact details: does not count as a contactable reservation.
    booking({ id: 2, party_size: 2, guests: [guest({ id: 3, reservation_id: 2, is_primary: true })] }),
    // Empty roster: It pulls the average down, which is just what you need to see.
    booking({ id: 3, party_size: 6, guests: [] }),
  ];

  it('counts the active chips of the day', () => {
    expect(computeGuestMetrics(day).totalRegisteredGuests).toBe(3);
  });

  it('RESERVATIONS account contactable, not guests with telephone', () => {
    expect(computeGuestMetrics(day).primaryContactsCaptured).toBe(1);
  });

  it('averaged over all reserves, including those with empty rosters', () => {
    // 3 fichas / 3 reservas.
    expect(computeGuestMetrics(day).averagePartyComposition).toBe(1);
  });

  it('counts rosters that do not reach the group size', () => {
    expect(computeGuestMetrics(day).incompleteRosters).toBe(3);
  });

  it('an empty day does not divide by zero', () => {
    const m = computeGuestMetrics([]);
    expect(m.averagePartyComposition).toBe(0);
    expect(contactCaptureRate(m, 0)).toBe(0);
  });

  it('calculate contact capture ratio', () => {
    expect(contactCaptureRate(computeGuestMetrics(day), day.length)).toBeCloseTo(33.33, 1);
  });
});
