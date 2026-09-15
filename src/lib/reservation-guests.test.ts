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
  it('ignora las fichas dadas de baja', () => {
    const roster = [guest({ id: 1, is_active: false }), guest({ id: 2 })];
    expect(activeGuests(roster).map((g) => g.id)).toEqual([2]);
  });

  it('un principal dado de baja ya no cuenta como principal', () => {
    const roster = [guest({ id: 1, is_primary: true, is_active: false }), guest({ id: 2 })];
    expect(primaryGuest(roster)).toBeNull();
  });

  it('reconoce el roster sano', () => {
    expect(primaryIntegrity([guest({ id: 1, is_primary: true }), guest({ id: 2 })])).toBe('ok');
  });

  it('distingue quedarse sin principal de tener varios', () => {
    expect(primaryIntegrity([guest({ id: 1 }), guest({ id: 2 })])).toBe('none');
    expect(
      primaryIntegrity([guest({ id: 1, is_primary: true }), guest({ id: 2, is_primary: true })]),
    ).toBe('multiple');
  });

  it('un roster vacío no es un roster roto', () => {
    expect(primaryIntegrity([])).toBe('empty');
    expect(primaryIntegrityMessage('empty')).toBe('');
    expect(primaryIntegrityMessage('ok')).toBe('');
  });

  it('explica los dos estados rotos de forma distinta', () => {
    expect(primaryIntegrityMessage('none')).toMatch(/nobody to call/i);
    expect(primaryIntegrityMessage('multiple')).toMatch(/more than one/i);
  });

  it('marcar principal degrada a los demás', () => {
    const roster = [guest({ id: 1, is_primary: true }), guest({ id: 2 }), guest({ id: 3 })];
    const next = withPrimary(roster, 2);
    expect(next.map((g) => g.is_primary)).toEqual([false, true, false]);
  });

  it('nunca eleva a una ficha dada de baja', () => {
    const roster = [guest({ id: 1, is_active: false }), guest({ id: 2, is_primary: true })];
    expect(withPrimary(roster, 1).find((g) => g.id === 1)?.is_primary).toBe(false);
  });

  it('el relevo es el invitado activo más antiguo', () => {
    const roster = [
      guest({ id: 5, is_primary: true }),
      guest({ id: 9 }),
      guest({ id: 7 }),
      guest({ id: 3, is_active: false }),
    ];
    expect(successorPrimary(roster, 5)?.id).toBe(7);
  });

  it('sin nadie más no hay relevo', () => {
    expect(successorPrimary([guest({ id: 1, is_primary: true })], 1)).toBeNull();
  });

  it('avisa de a quién pasa el testigo', () => {
    const leaving = guest({ id: 1, name: 'Carlos', is_primary: true });
    expect(primaryHandoverPrompt(leaving, guest({ id: 2, name: 'Ana' }))).toMatch(
      /promotes Ana to primary/,
    );
    expect(primaryHandoverPrompt(leaving, null)).toMatch(/leaves it with no contact/);
  });
});

describe('recuento frente al tamaño del grupo', () => {
  it('cuenta sólo las fichas activas', () => {
    const roster = [guest({ id: 1 }), guest({ id: 2 }), guest({ id: 3, is_active: false })];
    const count = rosterCount(roster, 4);
    expect(count.registered).toBe(2);
    expect(count.missing).toBe(2);
    expect(count.complete).toBe(false);
  });

  it('marca el roster completo', () => {
    const count = rosterCount([guest({ id: 1 }), guest({ id: 2 })], 2);
    expect(count.complete).toBe(true);
    expect(count.missing).toBe(0);
  });

  it('detecta más fichas que comensales declarados', () => {
    expect(rosterCount([guest({ id: 1 }), guest({ id: 2 })], 1).overfilled).toBe(true);
  });

  it('etiqueta el recuento como pide la historia', () => {
    expect(rosterCountLabel(rosterCount([guest({ id: 1 }), guest({ id: 2 }), guest({ id: 3 })], 4)))
      .toBe('Registered 3 of 4 Guests');
  });
});

describe('alta rápida de acompañantes', () => {
  it('numera por el hueco que queda', () => {
    expect(nextCompanionName([guest({ id: 1, name: 'Carlos' })])).toBe('Guest 2');
  });

  it('no repite un número ya usado', () => {
    // Hay dos fichas, pero "Guest 2" ya existe: el siguiente es el 3.
    const roster = [guest({ id: 1, name: 'Carlos' }), guest({ id: 2, name: 'Guest 2' })];
    expect(nextCompanionName(roster)).toBe('Guest 3');
  });

  it('empieza en 1 con el roster vacío', () => {
    expect(nextCompanionName([])).toBe('Guest 1');
  });
});

describe('validación del formulario', () => {
  it('exige nombre y respeta el tope de la columna', () => {
    expect(guestNameError('Carlos Mendoza')).toBe('');
    expect(guestNameError('   ')).toBe('Guest name is required');
    expect(guestNameError('x'.repeat(101))).toMatch(/100 characters or fewer/);
  });

  it('permite dejar el nombre vacío cuando el formulario no lo exige', () => {
    // El drawer de alta de reserva admite la reserva anónima: nombre vacío es válido ahí, y
    // el tope de la columna se sigue comprobando.
    expect(guestNameError('', { required: false })).toBe('');
    expect(guestNameError('x'.repeat(101), { required: false })).toMatch(
      /100 characters or fewer/,
    );
  });

  it('valida el correo y su tope', () => {
    expect(guestEmailError('carlos@example.com')).toBe('');
    expect(guestEmailError('')).toBe('');
    expect(guestEmailError('nope')).toMatch(/valid email/);
    expect(guestEmailError(`${'a'.repeat(95)}@example.com`)).toMatch(/100 characters or fewer/);
  });

  it('exige el formato internacional del teléfono', () => {
    // @IsPhoneNumber() sin región: un número nacional a secas devuelve 400.
    expect(guestPhoneError('+34600123456')).toBe('');
    expect(guestPhoneError('+34 600 123 456')).toBe('');
    expect(guestPhoneError('600123456')).toMatch(/international format/);
    expect(guestPhoneError('')).toBe('');
  });

  it('rechaza un teléfono por encima de los 20 caracteres de la columna', () => {
    expect(guestPhoneError(`+${'1'.repeat(25)}`)).toMatch(/20 characters or fewer/);
  });

  it('normaliza el teléfono quitando separadores', () => {
    expect(normalizeGuestPhone('+34 600-123 (456)')).toBe('+34600123456');
  });
});

describe('enlaces de contacto directo', () => {
  it('compone tel: sin separadores', () => {
    expect(telHref('+34 600 123 456')).toBe('tel:+34600123456');
  });

  it('compone mailto:', () => {
    expect(mailtoHref(' carlos@example.com ')).toBe('mailto:carlos@example.com');
  });

  it('sin dato no inventa un enlace muerto', () => {
    expect(telHref(null)).toBeNull();
    expect(mailtoHref('')).toBeNull();
  });

  it('sabe si una ficha es contactable', () => {
    expect(hasContactDetails(guest({ id: 1, phone: '+34600123456' }))).toBe(true);
    expect(hasContactDetails(guest({ id: 2, email: 'a@b.com' }))).toBe(true);
    expect(hasContactDetails(guest({ id: 3 }))).toBe(false);
  });

  it('el código del invitado usa el formato de la historia', () => {
    expect(guestCode(12)).toBe('#GST-12');
  });
});

describe('búsqueda y filtros', () => {
  const carlos = withContext(
    guest({ id: 1, name: 'Carlos Mendoza', phone: '+34600333444', is_primary: true }),
  );
  const ana = withContext(
    guest({ id: 2, reservation_id: 7, name: 'Ana Ruiz', email: 'ana@example.com' }),
    'Lucía Prat',
  );

  it('sin filtros no esconde nada', () => {
    expect(hasActiveGuestFilters(EMPTY_GUEST_FILTERS)).toBe(false);
    expect(matchesGuestFilters(carlos, EMPTY_GUEST_FILTERS, new Set())).toBe(true);
  });

  it('busca por nombre, teléfono y correo', () => {
    const by = (search: string, g = carlos) =>
      matchesGuestFilters(g, { ...EMPTY_GUEST_FILTERS, search }, new Set());
    expect(by('mendoza')).toBe(true);
    expect(by('600333')).toBe(true);
    expect(by('ana@example', ana)).toBe(true);
  });

  it('busca por la reserva a la que pertenece', () => {
    expect(
      matchesGuestFilters(ana, { ...EMPTY_GUEST_FILTERS, search: '#res-7' }, new Set()),
    ).toBe(true);
    expect(
      matchesGuestFilters(ana, { ...EMPTY_GUEST_FILTERS, search: 'lucía' }, new Set()),
    ).toBe(true);
  });

  it('aísla los contactos principales', () => {
    const filters = { ...EMPTY_GUEST_FILTERS, primaryOnly: true };
    expect(matchesGuestFilters(carlos, filters, new Set())).toBe(true);
    expect(matchesGuestFilters(ana, filters, new Set())).toBe(false);
  });

  it('aísla los rosters incompletos', () => {
    const filters = { ...EMPTY_GUEST_FILTERS, incompleteOnly: true };
    expect(matchesGuestFilters(ana, filters, new Set([7]))).toBe(true);
    expect(matchesGuestFilters(carlos, filters, new Set([7]))).toBe(false);
  });

  it('el haystack cubre los tres identificadores', () => {
    const hay = guestHaystack(carlos);
    expect(hay).toContain('carlos mendoza');
    expect(hay).toContain('+34600333444');
    expect(hay).toContain('#gst-1');
  });
});

describe('KPIs del roster', () => {
  const day = [
    booking({
      id: 1,
      party_size: 4,
      guests: [
        guest({ id: 1, is_primary: true, phone: '+34600111222' }),
        guest({ id: 2 }),
      ],
    }),
    // Principal sin datos de contacto: no cuenta como reserva contactable.
    booking({ id: 2, party_size: 2, guests: [guest({ id: 3, reservation_id: 2, is_primary: true })] }),
    // Roster vacío: tira la media hacia abajo, que es justo lo que hay que ver.
    booking({ id: 3, party_size: 6, guests: [] }),
  ];

  it('cuenta las fichas activas del día', () => {
    expect(computeGuestMetrics(day).totalRegisteredGuests).toBe(3);
  });

  it('cuenta RESERVAS contactables, no invitados con teléfono', () => {
    expect(computeGuestMetrics(day).primaryContactsCaptured).toBe(1);
  });

  it('promedia sobre todas las reservas, incluidas las de roster vacío', () => {
    // 3 fichas / 3 reservas.
    expect(computeGuestMetrics(day).averagePartyComposition).toBe(1);
  });

  it('cuenta los rosters que no llegan al tamaño del grupo', () => {
    expect(computeGuestMetrics(day).incompleteRosters).toBe(3);
  });

  it('un día vacío no divide por cero', () => {
    const m = computeGuestMetrics([]);
    expect(m.averagePartyComposition).toBe(0);
    expect(contactCaptureRate(m, 0)).toBe(0);
  });

  it('calcula la ratio de captura de contacto', () => {
    expect(contactCaptureRate(computeGuestMetrics(day), day.length)).toBeCloseTo(33.33, 1);
  });
});
