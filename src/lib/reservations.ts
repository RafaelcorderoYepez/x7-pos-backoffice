// Reglas del libro de reservas: qué transición de estado es legal, cuánta gente se espera en
// el día, y si el aforo del local aguanta una reserva más en una franja concreta.
//
// Todo lo que decide "esta reserva cuenta" pasa por los helpers de este fichero para que la
// tira de KPIs, los filtros y la parrilla no puedan discrepar entre sí. El módulo es puro
// (sin fetch ni React) porque es la parte que se testea de verdad.

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

// ================= Máquina de estados =================

// Grafo de transiciones legales del ciclo de vida. Lo que NO aparece aquí es un salto ilegal:
// de `cancelled` o `completed` no se sale (son terminales), y a `seated` sólo se llega desde
// una reserva viva, nunca desde una anulada. El backend no impone nada de esto todavía, así
// que la guarda de la UI es la única que impide dejar el histórico en un estado imposible.
export const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'seated', 'cancelled', 'no_show', 'white_list'],
  // Confirmada puede sentarse, anularse o marcarse ausente pasada la cortesía.
  confirmed: ['seated', 'cancelled', 'no_show'],
  // Sentada sólo avanza a terminada; anular una mesa que ya está comiendo no tiene sentido
  // operativo (para eso está cerrar la comanda y completarla).
  seated: ['completed'],
  // Terminales: la reserva ya cerró su historia.
  completed: [],
  cancelled: [],
  no_show: [],
  // La lista de espera entra al libro cuando se libera hueco, o se cae.
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

// `seated_at` se sella al entrar en SEATED y NUNCA se reescribe: si la fila ya trae una marca
// (una reserva que se sentó, se levantó y volvió a sentarse tras una corrección), la primera
// es la hora real de llegada del grupo.
export const seatedStampFor = (
  reservation: Pick<Reservation, 'status' | 'seated_at'>,
  next: ReservationStatus,
  now: Date = new Date(),
): string | undefined => {
  if (next !== 'seated') return undefined;
  if (reservation.seated_at) return undefined;
  return now.toISOString();
};

// Pasada la cortesía sobre la hora reservada, una reserva que sigue sin sentarse es candidata
// a no-show. Es una SUGERENCIA para la anfitriona (el badge de la fila), no una transición
// automática: quien decide que el cliente no vino es una persona.
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

// Solape de dos intervalos semiabiertos [inicio, fin): dos reservas que se tocan justo en el
// borde (una acaba a las 21:00 y la siguiente empieza a las 21:00) NO compiten por la mesa.
export const windowsOverlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => aStart < bEnd && bStart < aEnd;

// Rango del día [00:00, 24:00) en HORA LOCAL del local, no en UTC: el servicio de una noche
// pertenece al día que ve la anfitriona en su reloj, y partirlo por el meridiano de Greenwich
// movería las cenas tardías al día siguiente en media Europa.
export const buildDayRange = (isoDate: string): { from: string; to: string } => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const from = new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
  const to = new Date(year, (month ?? 1) - 1, (day ?? 1) + 1, 0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
};

export const todayIsoDate = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// Formato de 12 h construido a mano y no con toLocaleTimeString: el separador que ICU mete
// antes del AM/PM cambia entre versiones de Node (espacio fino U+202F), y esta cadena se
// compara en los tests y se lee en la parrilla.
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

// ================= KPIs del día =================

export interface DailyReservationMetrics {
  /** Suma de party_size de todo lo que NO está anulado: la gente que el local espera servir. */
  totalExpectedGuests: number;
  /** Comensales ya sentados o que ya terminaron: cubiertos reales. */
  coveredGuests: number;
  /** Reservas sin confirmar todavía. */
  pendingConfirmations: number;
  /** % de no-shows sobre el total de reservas del día (0 si no hay ninguna). */
  noShowRate: number;
  /** % de cubiertos sobre los comensales esperados: ocupación del servicio. */
  occupancyRate: number;
  totalReservations: number;
  noShowCount: number;
}

// El denominador del no-show es el TOTAL de reservas del día (anuladas incluidas), tal como
// pide la historia: "percentage of NO_SHOW bookings relative to total daily reservations".
// El de la ocupación, en cambio, son los comensales esperados — comparar cubiertos contra un
// total que incluye anulaciones dejaría la ocupación artificialmente baja.
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

// Un decimal: "12.5%" dice algo en un servicio de 40 reservas, "12.4999%" no.
export const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

// ================= Filtros =================

export interface ReservationFilters {
  /** Vacío = sin filtrar (un grupo de checkboxes sin marcar no esconde nada). */
  statuses: ReservationStatus[];
  sources: string[];
  search: string;
}

export const EMPTY_FILTERS: ReservationFilters = { statuses: [], sources: [], search: '' };

export const hasActiveFilters = (f: ReservationFilters): boolean =>
  f.statuses.length > 0 || f.sources.length > 0 || f.search.trim().length > 0;

// Los tres ejes por los que una encargada busca una reserva: quién viene (nombre del cliente
// o de cualquier acompañante del roster), cómo contactarlo, y qué pidió.
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

export interface CapacityCheck {
  /** Plazas totales del salón (suma de la capacidad de las mesas operativas). */
  floorCapacity: number;
  /** Plazas ya comprometidas por reservas que solapan la franja. */
  bookedSeats: number;
  /** Plazas libres en la franja, nunca negativas. */
  availableSeats: number;
  /** El grupo no cabe: hay que avisar antes de guardar. */
  oversold: boolean;
  overflowSeats: number;
}

// Mesas que de verdad ponen plazas sobre el salón. Una mesa borrada o fuera de servicio no
// suma aforo aunque siga en el inventario.
const SEATABLE_TABLE_STATUSES = new Set(['available', 'occupied', 'reserved', 'cleaning']);

export const floorCapacity = (
  tables: Array<{ capacity?: number; status?: string }>,
): number =>
  tables
    .filter((t) => SEATABLE_TABLE_STATUSES.has((t.status ?? 'available').toLowerCase()))
    .reduce((sum, t) => sum + (Number(t.capacity) || 0), 0);

// Plazas comprometidas en la franja. Anuladas y ausencias no ocupan sitio; una reserva que se
// está editando se excluye para que no compita consigo misma.
export const bookedSeatsInWindow = (
  reservations: Reservation[],
  startIso: string,
  durationMinutes: number,
  excludeReservationId?: number,
): number => {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return 0;
  const end = start + (durationMinutes || 0) * 60_000;

  return reservations
    .filter((r) => r.id !== excludeReservationId)
    .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
    .filter((r) => windowsOverlap(start, end, reservationStart(r), reservationEnd(r)))
    .reduce((sum, r) => sum + (Number(r.party_size) || 0), 0);
};

// Comprobación de aforo TOTAL del salón para la franja pedida. Es la que alimenta el aviso de
// sobreventa del drawer: el backend sólo valida el solape de MESAS concretas (y sólo cuando la
// reserva viene con table_ids), así que sin esto una anfitriona puede aceptar por teléfono más
// gente de la que cabe en el local.
export const checkFloorCapacity = (
  tables: Array<{ capacity?: number; status?: string }>,
  reservations: Reservation[],
  startIso: string,
  durationMinutes: number,
  partySize: number,
  excludeReservationId?: number,
): CapacityCheck => {
  const capacity = floorCapacity(tables);
  const booked = bookedSeatsInWindow(
    reservations,
    startIso,
    durationMinutes,
    excludeReservationId,
  );
  const available = Math.max(0, capacity - booked);
  const overflow = Math.max(0, partySize - available);

  return {
    floorCapacity: capacity,
    bookedSeats: booked,
    availableSeats: available,
    // Sin inventario de mesas cargado (capacity 0) no se puede afirmar que haya sobreventa:
    // avisar entonces sería un falso positivo en todas las reservas.
    oversold: capacity > 0 && overflow > 0,
    overflowSeats: overflow,
  };
};

export const capacityWarningMessage = (check: CapacityCheck, partySize: number): string =>
  `Party of ${partySize} exceeds the floor capacity left for this slot — ${check.availableSeats} of ${check.floorCapacity} seats free (${check.bookedSeats} already booked). Save anyway only if you can add covers.`;

// ================= Validación del alta =================

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

// El <input type="datetime-local"> entrega hora local sin zona; el contrato pide un instante
// ISO en UTC, y el Date lo convierte usando la zona del navegador — que es justo la del local.
export const composeReservationDate = (date: string, time: string): string =>
  new Date(`${date}T${time}`).toISOString();

// Partes locales de un instante ISO, para rellenar los dos inputs al reabrir el drawer.
export const splitReservationDate = (iso: string): { date: string; time: string } => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: todayIsoDate(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
};

// Las reglas de contacto de un invitado (nombre/correo/teléfono, con los topes de columna y
// el formato internacional que exige @IsPhoneNumber) viven en `reservation-guests.ts`, que es
// el módulo dueño del roster. Estaban duplicadas aquí y en aquél: dos copias de la misma regla
// se separan en cuanto una de las dos se ajusta.

// ================= Búsqueda de clientes =================

// Autocompletado del CRM por nombre, teléfono o correo, los tres identificadores con los que
// un cliente se presenta al teléfono.
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

// ================= Normalización defensiva =================

// El backend puede devolver un status heredado fuera del enum (o nulo). La fila tiene que
// seguir siendo visible y filtrable, así que cae a `pending`, que es el estado inicial.
export const normalizeReservation = (raw: Reservation): Reservation => ({
  ...raw,
  status: isReservationStatus(raw.status) ? raw.status : 'pending',
  party_size: Number(raw.party_size) || 0,
  duration_minutes: Number(raw.duration_minutes) || 0,
});
