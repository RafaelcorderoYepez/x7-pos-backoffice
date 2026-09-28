import { describe, expect, it } from 'vitest';
import type { Reservation, ReservationStatus } from '../types/reservation';
import {
  EMPTY_FILTERS,
  allowedTransitions,
  bookedSeatsInWindow,
  buildDayRange,
  canTransition,
  capacityWarningMessage,
  checkFloorCapacity,
  clockTime,
  composeReservationDate,
  computeDailyMetrics,
  durationError,
  floorCapacity,
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

// Instantes en hora LOCAL: la parrilla, el rango del día y el formateador de 12 h leen el
// reloj del local, así que los tests tienen que hablar el mismo idioma en cualquier zona.
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

describe('máquina de estados del ciclo de vida', () => {
  it('permite el camino normal del servicio', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'seated')).toBe(true);
    expect(canTransition('seated', 'completed')).toBe(true);
  });

  it('bloquea el salto ilegal de anulada a completada', () => {
    expect(canTransition('cancelled', 'completed')).toBe(false);
  });

  it('no deja resucitar una ausencia ni una reserva ya terminada', () => {
    expect(canTransition('no_show', 'seated')).toBe(false);
    expect(canTransition('completed', 'seated')).toBe(false);
  });

  it('una mesa ya sentada sólo puede terminar', () => {
    expect(allowedTransitions('seated')).toEqual(['completed']);
    expect(canTransition('seated', 'cancelled')).toBe(false);
  });

  it('marca los tres estados finales como terminales', () => {
    (['completed', 'cancelled', 'no_show'] as ReservationStatus[]).forEach((status) => {
      expect(isTerminalStatus(status)).toBe(true);
      expect(allowedTransitions(status)).toEqual([]);
    });
    expect(isTerminalStatus('pending')).toBe(false);
  });

  it('la lista de espera puede entrar al libro', () => {
    expect(canTransition('white_list', 'confirmed')).toBe(true);
  });

  it('explica el salto ilegal con los nombres legibles de los estados', () => {
    expect(illegalTransitionMessage('cancelled', 'completed')).toBe(
      'Illegal lifecycle jump: a Cancelled reservation cannot become Completed.',
    );
  });
});

describe('sello automático de llegada (seated_at)', () => {
  const now = new Date(2026, 3, 16, 19, 5, 0);

  it('sella la hora al entrar en SEATED', () => {
    const stamp = seatedStampFor(booking({ id: 1, status: 'confirmed' }), 'seated', now);
    expect(stamp).toBe(now.toISOString());
  });

  it('no sella nada en las demás transiciones', () => {
    expect(seatedStampFor(booking({ id: 1 }), 'confirmed', now)).toBeUndefined();
  });

  it('no reescribe una marca previa: la primera es la hora real de llegada', () => {
    const first = at(19, 2);
    expect(
      seatedStampFor(booking({ id: 1, status: 'seated', seated_at: first }), 'seated', now),
    ).toBeUndefined();
  });
});

describe('candidata a no-show', () => {
  it('pasada la cortesía de 15 min una confirmada es candidata', () => {
    const late = new Date(2026, 3, 16, 19, 16, 0);
    expect(isNoShowCandidate(booking({ id: 1, status: 'confirmed' }), late)).toBe(true);
  });

  it('dentro de la cortesía todavía no lo es', () => {
    const grace = new Date(2026, 3, 16, 19, 14, 0);
    expect(isNoShowCandidate(booking({ id: 1, status: 'confirmed' }), grace)).toBe(false);
  });

  it('una reserva ya sentada nunca es candidata', () => {
    const late = new Date(2026, 3, 16, 20, 0, 0);
    expect(isNoShowCandidate(booking({ id: 1, status: 'seated' }), late)).toBe(false);
  });
});

describe('KPIs del día', () => {
  const day: Reservation[] = [
    booking({ id: 1, status: 'pending', party_size: 2 }),
    booking({ id: 2, status: 'confirmed', party_size: 4 }),
    booking({ id: 3, status: 'seated', party_size: 3 }),
    booking({ id: 4, status: 'completed', party_size: 5 }),
    booking({ id: 5, status: 'cancelled', party_size: 8 }),
    booking({ id: 6, status: 'no_show', party_size: 6 }),
  ];

  it('suma los comensales esperados dejando fuera las anuladas', () => {
    // 2 + 4 + 3 + 5 + 6 = 20; los 8 de la anulada no se esperan.
    expect(computeDailyMetrics(day).totalExpectedGuests).toBe(20);
  });

  it('cuenta como cubiertos los sentados y los que ya terminaron', () => {
    expect(computeDailyMetrics(day).coveredGuests).toBe(8);
  });

  it('cuenta las confirmaciones pendientes', () => {
    expect(computeDailyMetrics(day).pendingConfirmations).toBe(1);
  });

  it('calcula la tasa de no-show sobre el total de reservas del día', () => {
    // 1 de 6 reservas.
    expect(computeDailyMetrics(day).noShowRate).toBeCloseTo(16.666, 2);
  });

  it('calcula la ocupación sobre los comensales esperados', () => {
    // 8 cubiertos de 20 esperados.
    expect(computeDailyMetrics(day).occupancyRate).toBe(40);
  });

  it('un día vacío no divide por cero', () => {
    const empty = computeDailyMetrics([]);
    expect(empty.noShowRate).toBe(0);
    expect(empty.occupancyRate).toBe(0);
    expect(empty.totalExpectedGuests).toBe(0);
  });

  it('formatea los porcentajes con un decimal', () => {
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

  it('sin filtros no esconde nada', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(matchesReservationFilters(withRequest, EMPTY_FILTERS)).toBe(true);
  });

  it('filtra por estado (multi-selección)', () => {
    const filters = { ...EMPTY_FILTERS, statuses: ['seated' as ReservationStatus] };
    expect(matchesReservationFilters(withGuest, filters)).toBe(true);
    expect(matchesReservationFilters(withRequest, filters)).toBe(false);
  });

  it('filtra por canal de origen', () => {
    const filters = { ...EMPTY_FILTERS, sources: ['online'] };
    expect(matchesReservationFilters(withRequest, filters)).toBe(true);
    expect(matchesReservationFilters(withGuest, filters)).toBe(false);
  });

  it('busca por texto en las peticiones especiales', () => {
    const filters = { ...EMPTY_FILTERS, search: 'window' };
    expect(matchesReservationFilters(withRequest, filters)).toBe(true);
  });

  it('busca por teléfono y correo de un acompañante del roster', () => {
    expect(
      matchesReservationFilters(withGuest, { ...EMPTY_FILTERS, search: '600 123' }),
    ).toBe(true);
    expect(
      matchesReservationFilters(withGuest, { ...EMPTY_FILTERS, search: 'carlos@example' }),
    ).toBe(true);
  });

  it('busca por el nombre del cliente del CRM', () => {
    const linked = booking({ id: 3, customer_id: 44 });
    expect(
      matchesReservationFilters(linked, { ...EMPTY_FILTERS, search: 'lucía' }, 'Lucía Prat'),
    ).toBe(true);
  });

  it('combina estado y texto con Y lógico', () => {
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

  it('el haystack incluye el código de la reserva', () => {
    expect(reservationHaystack(withRequest)).toContain('#res-1');
  });

  it('toggleInList añade y quita', () => {
    expect(toggleInList(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleInList(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('aforo del salón', () => {
  const tables = [
    { capacity: 4, status: 'available' },
    { capacity: 2, status: 'occupied' },
    { capacity: 6, status: 'reserved' },
    { capacity: 8, status: 'out_of_service' },
    { capacity: 4, status: 'deleted' },
  ];

  it('sólo suman las mesas operativas', () => {
    // 4 + 2 + 6; la de fuera de servicio y la borrada no ponen plazas.
    expect(floorCapacity(tables)).toBe(12);
  });

  it('cuenta las plazas comprometidas que solapan la franja', () => {
    const book = [
      booking({ id: 1, reservation_date: at(19), duration_minutes: 90, party_size: 4 }),
      // Empieza justo cuando la primera acaba: no compite.
      booking({ id: 2, reservation_date: at(20, 30), duration_minutes: 90, party_size: 6 }),
      // Anulada: no ocupa sitio.
      booking({ id: 3, reservation_date: at(19), party_size: 8, status: 'cancelled' }),
    ];
    expect(bookedSeatsInWindow(book, at(19), 90)).toBe(4);
  });

  it('excluye la propia reserva al reeditarla', () => {
    const book = [booking({ id: 1, party_size: 4 })];
    expect(bookedSeatsInWindow(book, at(19), 90, 1)).toBe(0);
  });

  it('avisa cuando el grupo no cabe en la franja', () => {
    const book = [booking({ id: 1, party_size: 10 })];
    const check = checkFloorCapacity(tables, book, at(19), 90, 4);
    expect(check.floorCapacity).toBe(12);
    expect(check.bookedSeats).toBe(10);
    expect(check.availableSeats).toBe(2);
    expect(check.oversold).toBe(true);
    expect(check.overflowSeats).toBe(2);
  });

  it('no avisa cuando el grupo cabe', () => {
    const check = checkFloorCapacity(tables, [booking({ id: 1, party_size: 4 })], at(19), 90, 4);
    expect(check.oversold).toBe(false);
  });

  it('sin inventario de mesas no inventa una sobreventa', () => {
    const check = checkFloorCapacity([], [booking({ id: 1, party_size: 4 })], at(19), 90, 99);
    expect(check.oversold).toBe(false);
  });

  it('el aviso dice cuántas plazas quedan', () => {
    const check = checkFloorCapacity(tables, [booking({ id: 1, party_size: 10 })], at(19), 90, 4);
    expect(capacityWarningMessage(check, 4)).toContain('2 of 12 seats free');
  });

  it('dos ventanas que se tocan en el borde no solapan', () => {
    expect(windowsOverlap(0, 100, 100, 200)).toBe(false);
    expect(windowsOverlap(0, 101, 100, 200)).toBe(true);
  });
});

describe('fechas y formato', () => {
  it('el rango del día cubre las 24 h locales', () => {
    const { from, to } = buildDayRange('2026-04-16');
    expect(new Date(from).getTime()).toBe(new Date(2026, 3, 16, 0, 0, 0, 0).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 3, 17, 0, 0, 0, 0).getTime());
  });

  it('formatea la hora en 12 h con AM/PM', () => {
    expect(clockTime(at(19, 5))).toBe('07:05 PM');
    expect(clockTime(at(0, 30))).toBe('12:30 AM');
    expect(clockTime(null)).toBe('');
  });

  it('etiqueta las franjas de la parrilla', () => {
    expect(hourSlotLabel(13)).toBe('01:00 PM');
    expect(hourSlotLabel(0)).toBe('12:00 AM');
  });

  it('describe la ventana de la reserva con su duración', () => {
    expect(formatBookingWindow(booking({ id: 1 }))).toBe('07:00 PM – 08:30 PM (90 min)');
  });

  it('compone y descompone la fecha del formulario sin perder la hora local', () => {
    const iso = composeReservationDate('2026-04-16', '19:30');
    expect(splitReservationDate(iso)).toEqual({ date: '2026-04-16', time: '19:30' });
  });

  it('el código de la reserva usa el formato de la historia', () => {
    expect(reservationCode(12)).toBe('#RES-12');
  });
});

describe('validación del alta', () => {
  it('exige un tamaño de grupo entero y mayor que cero', () => {
    expect(partySizeError('4')).toBe('');
    expect(partySizeError('0')).toBe('Party size must be greater than 0');
    expect(partySizeError('-2')).toBe('Party size must be greater than 0');
    expect(partySizeError('2.5')).toBe('Party size must be a whole number');
    expect(partySizeError('')).toBe('Party size is required');
  });

  it('exige una duración positiva', () => {
    expect(durationError('90')).toBe('');
    expect(durationError('0')).toBe('Duration must be greater than 0');
  });

  it('exige fecha y hora válidas', () => {
    expect(reservationDateError('2026-04-16', '19:00')).toBe('');
    expect(reservationDateError('', '19:00')).toBe('Reservation date is required');
    expect(reservationDateError('2026-04-16', '')).toBe('Reservation time is required');
  });
});

describe('autocompletado de clientes', () => {
  const customers = [
    { id: 1, name: 'Lucía Prat', email: 'lucia@example.com', phone: '600111222' },
    { id: 2, name: 'Carlos Mendoza', email: 'carlos@example.com', phone: '600333444' },
  ];

  it('busca por nombre, teléfono y correo', () => {
    expect(searchCustomers(customers, 'lucía').map((c) => c.id)).toEqual([1]);
    expect(searchCustomers(customers, '600333').map((c) => c.id)).toEqual([2]);
    expect(searchCustomers(customers, 'carlos@').map((c) => c.id)).toEqual([2]);
  });

  it('con la caja vacía no propone nada', () => {
    expect(searchCustomers(customers, '   ')).toEqual([]);
  });
});

describe('normalización defensiva', () => {
  it('un estado heredado cae a pending en vez de romper la fila', () => {
    const raw = { ...booking({ id: 1 }), status: 'walk_in_hold' as ReservationStatus };
    expect(normalizeReservation(raw).status).toBe('pending');
  });

  it('los números que llegan como texto se convierten', () => {
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
