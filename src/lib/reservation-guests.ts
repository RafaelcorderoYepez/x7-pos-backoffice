// Reglas del roster de comensales: quién es el contacto principal, cuánta gente queda por
// registrar frente al tamaño del grupo, y cómo se localiza a un invitado por su contacto.
//
// La regla que gobierna todo lo demás es la del PRINCIPAL: cada reserva tiene exactamente uno.
// El backend la impone al escribir (degrada al anterior y eleva al siguiente si el principal
// se va); aquí se replica para poder avisar ANTES de enviar y para detectar un roster que ya
// venga torcido de datos antiguos.

import type { Reservation, ReservationGuest } from '../types/reservation';

// ================= Topes de columna =================

// varchar(100) / varchar(100) / varchar(20) en `reservation_guests`.
export const GUEST_NAME_MAX = 100;
export const GUEST_EMAIL_MAX = 100;
export const GUEST_PHONE_MAX = 20;

// ================= Contacto principal =================

export const activeGuests = (guests: ReservationGuest[]): ReservationGuest[] =>
  guests.filter((g) => g.is_active);

export const primaryGuest = (guests: ReservationGuest[]): ReservationGuest | null =>
  activeGuests(guests).find((g) => g.is_primary) ?? null;

/**
 * Estado de la garantía "exactamente un principal" en un roster.
 *
 * `none` y `multiple` son ambos estados rotos, pero distintos: sin principal la sala no sabe
 * a quién llamar, y con varios no sabe a cuál. Se distinguen para poder explicarlo.
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
 * Roster resultante de marcar a `guestId` como principal.
 *
 * Refleja lo que el backend hará al guardar (degradar a los demás) para que la tabla se
 * actualice sin esperar a la recarga. No se envía: la verdad la escribe el servidor.
 */
export const withPrimary = (
  guests: ReservationGuest[],
  guestId: number,
): ReservationGuest[] =>
  guests.map((g) => ({ ...g, is_primary: g.is_active && g.id === guestId }));

/**
 * A quién le tocaría el relevo si el principal actual se va.
 *
 * Mismo criterio que el servicio: el invitado activo más antiguo, que es quien se registró
 * primero y casi siempre quien hizo la reserva.
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

// ================= Recuento frente al tamaño del grupo =================

export interface RosterCount {
  registered: number;
  partySize: number;
  /** Comensales del grupo que todavía no tienen ficha. */
  missing: number;
  complete: boolean;
  /** Hay más fichas que comensales declarados: alguien se apuntó de más. */
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

// ================= Alta rápida de acompañantes =================

/**
 * Nombre por defecto del siguiente acompañante genérico.
 *
 * Numera por el HUECO que queda en el grupo, no por el total de fichas: si el roster tiene a
 * "Carlos" y una ficha "Guest 2", el siguiente es "Guest 3" y no "Guest 2" otra vez.
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

// ================= Validación del formulario =================

/**
 * Regla del nombre de un invitado.
 *
 * Si es OBLIGATORIO depende del formulario, y esa es la única diferencia entre los dos sitios
 * que lo usan: en el roster una ficha sin nombre no sirve de nada, mientras que el drawer de
 * alta de reserva admite dejarlo vacío a propósito — es la reserva anónima ("mesa para dos a
 * nombre de nadie") que se toma cuando el cliente no quiere dar el nombre por teléfono.
 * Unificar las dos en "siempre obligatorio" rompió esa reserva anónima, así que la diferencia
 * viaja explícita en el parámetro en vez de en dos copias de la función.
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

// Los separadores que la gente dicta no viajan al backend.
export const normalizeGuestPhone = (raw: string): string => raw.replace(/[\s().-]/g, '');

/**
 * El DTO valida con `@IsPhoneNumber()` SIN región, lo que exige formato internacional: un
 * "600333444" a secas devuelve 400. Se comprueba aquí para decirlo en el idioma del formulario
 * en vez de enseñar el error crudo del servidor.
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

// ================= Presentación =================

export const guestCode = (id: number): string => `#GST-${id}`;

// `tel:` exige el número sin separadores; `mailto:` el correo tal cual.
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

// ================= Feed y búsqueda =================

export interface GuestWithContext extends ReservationGuest {
  /** Reserva a la que pertenece, ya resuelta para poder buscar y mostrar la fecha. */
  reservationLabel: string;
  reservationDate: string;
  partySize: number;
}

export interface GuestFilters {
  search: string;
  /** Sólo los contactos principales de cada reserva. */
  primaryOnly: boolean;
  /** Sólo reservas cuyo roster aún no cubre el tamaño del grupo. */
  incompleteOnly: boolean;
}

export const EMPTY_GUEST_FILTERS: GuestFilters = {
  search: '',
  primaryOnly: false,
  incompleteOnly: false,
};

export const hasActiveGuestFilters = (f: GuestFilters): boolean =>
  f.search.trim().length > 0 || f.primaryOnly || f.incompleteOnly;

// Nombre, correo y teléfono: los tres identificadores con los que un cliente se presenta.
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

// ================= KPIs del roster =================

export interface GuestMetrics {
  /** Fichas ReservationGuest activas en el día. */
  totalRegisteredGuests: number;
  /** Reservas cuyo contacto principal tiene teléfono o correo utilizable. */
  primaryContactsCaptured: number;
  /** Reservas con roster (el denominador honesto de la ratio anterior). */
  bookingsWithRoster: number;
  /** Media de fichas por reserva, con un decimal. */
  averagePartyComposition: number;
  /** Reservas cuyo roster no llega al party_size declarado. */
  incompleteRosters: number;
}

/**
 * Métricas del roster para el día.
 *
 * "Primary Contacts Captured" cuenta RESERVAS, no invitados: la pregunta operativa es a cuántas
 * mesas se puede llamar si se retrasan, y una reserva con tres teléfonos sigue siendo una.
 * La media se calcula sobre TODAS las reservas del día, incluidas las que aún no tienen a
 * nadie apuntado — son justamente las que tiran de la media hacia abajo y hay que ver.
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
