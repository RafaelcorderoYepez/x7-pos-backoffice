// Cliente HTTP del módulo de Reservas.
//
// La ruta real es `/api/reservation` — SINGULAR y sin `/v1`, al contrario de lo que dicen los
// textos de las historias (`/api/v1/reservations`, que devuelve 404). Y la actualización va
// por **PATCH**, no por PUT como el resto de módulos del backoffice.
//
// El backend valida con `forbidNonWhitelisted: true`, así que cualquier campo que no esté en
// el DTO tumba la petición con un 400: los cuerpos se construyen explícitos, nunca a base de
// esparcir el estado del formulario.

import { getAccessToken, clearAuthSession } from '../lib/auth-storage';
import { ApiError, getApiErrorDetails } from '../lib/api-error';
import type {
  CustomerRef,
  Reservation,
  ReservationDraft,
  ReservationGuest,
  ReservationNote,
  ReservationStatus,
  ReservationTableLink,
  StatusHistoryFeedEntry,
} from '../types/reservation';
import { normalizeReservation } from '../lib/reservations';
import type {
  CapacitySettings,
  DayAvailability,
  ManagerOverride,
} from '../lib/reservation-capacity';
import { normalizeGuestPhone } from '../lib/reservation-guests';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// El tope de `limit` del DTO de consulta es 100 en todo el backend: pedir más devuelve un 400
// "limit must not be greater than 100".
export const MAX_PAGE_LIMIT = 100;

interface Envelope<T> {
  statusCode?: number;
  message?: string;
  data: T;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
}

function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(Boolean(init.body)), ...init.headers },
  });

  if (response.status === 401) {
    clearAuthSession();
    window.location.href = '/login';
    throw new ApiError('Unauthorized', 401);
  }

  if (!response.ok) {
    const { message, code } = await getApiErrorDetails(response, fallbackMessage);
    throw new ApiError(message, response.status, code);
  }

  const text = await response.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

export interface ReservationQuery {
  /** Día concreto (YYYY-MM-DD). El backend lo resuelve como rango semiabierto sobre el índice. */
  date?: string;
  /** Rango explícito para las vistas de semana/mes; ISO completo. */
  dateFrom?: string;
  dateTo?: string;
  status?: ReservationStatus;
  customerId?: number;
  page?: number;
  limit?: number;
}

// El filtro de día viaja al servidor (es el que usa el índice compuesto
// [merchant_id, reservation_date]); el de estado/origen/texto se resuelve en cliente porque la
// tira de filtros es multi-selección y el DTO sólo acepta un estado suelto.
export async function listReservations(
  query: ReservationQuery = {},
): Promise<{ reservations: Reservation[]; total: number }> {
  const params = new URLSearchParams();
  if (query.date) params.set('date', query.date);
  if (query.dateFrom) params.set('date_from', query.dateFrom);
  if (query.dateTo) params.set('date_to', query.dateTo);
  if (query.status) params.set('status', query.status);
  if (query.customerId) params.set('customer_id', String(query.customerId));
  params.set('page', String(query.page ?? 1));
  params.set('limit', String(Math.min(query.limit ?? MAX_PAGE_LIMIT, MAX_PAGE_LIMIT)));

  const json = await request<Envelope<Reservation[]>>(
    `/reservation?${params.toString()}`,
    { method: 'GET' },
    'Failed to load reservations. Please try again.',
  );

  return {
    reservations: (json?.data ?? []).map(normalizeReservation),
    total: json?.total ?? json?.data?.length ?? 0,
  };
}

export async function createReservation(draft: ReservationDraft): Promise<Reservation> {
  const body: Record<string, unknown> = {
    reservation_date: draft.reservation_date,
    party_size: draft.party_size,
  };
  // Sólo se mandan los opcionales con valor: un `customer_id: null` lo rechaza @IsInt, y un
  // `source: ''` guardaría una cadena vacía como canal de origen.
  if (draft.customer_id != null) body.customer_id = draft.customer_id;
  if (draft.duration_minutes != null) body.duration_minutes = draft.duration_minutes;
  if (draft.status) body.status = draft.status;
  if (draft.source) body.source = draft.source;
  if (draft.special_requests?.trim()) body.special_requests = draft.special_requests.trim();
  if (draft.table_ids?.length) body.table_ids = draft.table_ids;
  if (draft.manager_override) {
    body.manager_override = {
      email: draft.manager_override.email.trim(),
      password: draft.manager_override.password,
    };
  }

  const json = await request<Envelope<Reservation>>(
    '/reservation',
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create the reservation.',
  );
  return normalizeReservation(json.data);
}

// PATCH, no PUT: el controlador de reservas es el único del backoffice que actualiza así.
export async function updateReservation(
  id: number,
  patch: Partial<ReservationDraft> & { seated_at?: string; manager_override?: ManagerOverride },
): Promise<Reservation> {
  const json = await request<Envelope<Reservation>>(
    `/reservation/${id}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    'Failed to update the reservation.',
  );
  return normalizeReservation(json.data);
}

// Anular tiene endpoint propio (deja rastro en el histórico de estados con un solo viaje).
export async function cancelReservation(id: number): Promise<Reservation> {
  const json = await request<Envelope<Reservation>>(
    `/reservation/${id}/cancel`,
    { method: 'PATCH' },
    'Failed to cancel the reservation.',
  );
  return normalizeReservation(json.data);
}

// DELETE es un borrado LÓGICO (is_active = false) que arrastra mesas, invitados y notas.
export async function deleteReservation(id: number): Promise<void> {
  await request<Envelope<Reservation>>(
    `/reservation/${id}`,
    { method: 'DELETE' },
    'Failed to delete the reservation.',
  );
}

// Alta rápida del acompañante principal cuando la reserva se toma sin ficha de CRM: el
// "lightweight guest record" de la historia es exactamente un reservation_guest.
export async function createReservationGuest(payload: {
  reservation_id: number;
  name: string;
  email?: string;
  phone?: string;
  is_primary?: boolean;
}): Promise<void> {
  const body: Record<string, unknown> = {
    reservation_id: payload.reservation_id,
    name: payload.name,
    is_primary: payload.is_primary ?? true,
  };
  if (payload.email?.trim()) body.email = payload.email.trim();
  // Sin separadores: es lo que espera @IsPhoneNumber y lo que cabe en varchar(20).
  const phone = normalizeGuestPhone(payload.phone ?? '');
  if (phone) body.phone = phone;

  await request<Envelope<unknown>>(
    '/reservation-guest',
    { method: 'POST', body: JSON.stringify(body) },
    'The reservation was saved, but the guest contact could not be attached.',
  );
}

// OJO: `GET /api/customers` devuelve un ARRAY PELADO (sin envoltorio {data}) y NO filtra por
// comercio — el servicio hace un find() sin scope. El filtrado por merchant se hace aquí, o el
// autocompletado ofrecería clientes de otros locales.
export async function listCustomers(merchantId?: number): Promise<CustomerRef[]> {
  const json = await request<CustomerRef[] | Envelope<CustomerRef[]>>(
    '/customers',
    { method: 'GET' },
    'Failed to load the customer directory.',
  );
  const rows = Array.isArray(json) ? json : (json?.data ?? []);
  if (!merchantId) return rows;
  return rows.filter((c) => c.merchantId == null || c.merchantId === merchantId);
}

// Ficha completa del CRM. El DTO exige rut/address/city/state/country además del correo, así
// que el drawer los pide cuando la anfitriona elige crear perfil en vez de invitado suelto.
export async function createCustomer(payload: {
  name: string;
  email: string;
  rut: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone?: string;
}): Promise<CustomerRef> {
  const body: Record<string, unknown> = { ...payload };
  if (!payload.phone?.trim()) delete body.phone;

  const json = await request<CustomerRef | Envelope<CustomerRef>>(
    '/customers',
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to create the customer profile.',
  );
  return (json as Envelope<CustomerRef>)?.data ?? (json as CustomerRef);
}

// Inventario de mesas: alimenta el aforo total del salón para el aviso de sobreventa.
export async function listTablesForCapacity(): Promise<
  Array<{ id: number; number: string; capacity: number; status: string }>
> {
  const json = await request<Envelope<Array<{ id: number; number: string; capacity: number; status: string }>>>(
    `/tables?limit=${MAX_PAGE_LIMIT}`,
    { method: 'GET' },
    'Failed to load the table inventory.',
  );
  return (json?.data ?? []).filter((t) => t.status !== 'deleted');
}

// ================= Asignación de mesas =================

/**
 * Vincula varias mesas a una reserva en una sola transacción.
 *
 * Se usa incluso para una mesa suelta: el endpoint simple (`POST /api/reservation-table`) no
 * es transaccional y devuelve 200 "already assigned" en vez de fallar, así que el camino de
 * escritura del workspace es siempre éste. Un 409 significa que la mesa se ocupó entre que se
 * pintó el tablero y se pulsó guardar.
 */
export async function assignTables(
  reservationId: number,
  tableIds: number[],
): Promise<ReservationTableLink[]> {
  const json = await request<Envelope<ReservationTableLink[]>>(
    '/reservation-table/bulk',
    {
      method: 'POST',
      body: JSON.stringify({ reservation_id: reservationId, table_ids: tableIds }),
    },
    'Failed to assign the tables.',
  );
  return json?.data ?? [];
}

// Soltar una mesa es un borrado LÓGICO (is_active = false): la traza de quién estuvo dónde se
// conserva para el histórico del servicio.
export async function unassignTable(
  reservationId: number,
  tableId: number,
): Promise<void> {
  await request<Envelope<ReservationTableLink>>(
    `/reservation-table/${reservationId}/${tableId}`,
    { method: 'DELETE' },
    'Failed to release the table.',
  );
}

// Asignaciones hidratadas con número, aforo y zona (relación `eager` a Table en la entidad).
export async function listReservationTables(
  reservationId?: number,
): Promise<ReservationTableLink[]> {
  const params = new URLSearchParams({ limit: String(MAX_PAGE_LIMIT) });
  if (reservationId) params.set('reservation_id', String(reservationId));

  const json = await request<Envelope<ReservationTableLink[]>>(
    `/reservation-table?${params.toString()}`,
    { method: 'GET' },
    'Failed to load the table assignments.',
  );
  return json?.data ?? [];
}

// ================= Notas =================

// `created_by` NO viaja en el cuerpo: el controlador lo sella con `user.id` del token.
export async function createReservationNote(
  reservationId: number,
  note: string,
): Promise<ReservationNote> {
  const json = await request<Envelope<ReservationNote>>(
    '/reservation-note',
    {
      method: 'POST',
      body: JSON.stringify({ reservation_id: reservationId, note: note.trim() }),
    },
    'Failed to save the note.',
  );
  return json.data;
}

export async function updateReservationNote(
  id: number,
  note: string,
): Promise<ReservationNote> {
  const json = await request<Envelope<ReservationNote>>(
    `/reservation-note/${id}`,
    { method: 'PATCH', body: JSON.stringify({ note: note.trim() }) },
    'Failed to update the note.',
  );
  return json.data;
}

// Borrado lógico: la nota deja de listarse pero el histórico del servicio la conserva.
export async function deleteReservationNote(id: number): Promise<void> {
  await request<Envelope<ReservationNote>>(
    `/reservation-note/${id}`,
    { method: 'DELETE' },
    'Failed to remove the note.',
  );
}

// Catálogo de personal para firmar las notas. Falla en silencio (403 si el plan no incluye
// colaboradores): sin él la firma cae a "Staff #<id>", que sigue siendo una atribución válida.
export async function listStaff(): Promise<
  Array<{ id: number; user_id?: number; name?: string; role?: string }>
> {
  const json = await request<Envelope<Array<{ id: number; user_id?: number; name?: string; role?: string }>>>(
    `/collaborators?limit=${MAX_PAGE_LIMIT}`,
    { method: 'GET' },
    'Failed to load the staff directory.',
  );
  return json?.data ?? [];
}

// ================= Roster de comensales =================

export interface GuestDraft {
  reservation_id: number;
  name: string;
  email?: string;
  phone?: string;
  is_primary?: boolean;
}

// Marcar `is_primary` degrada al principal anterior EN EL SERVIDOR, dentro de la misma
// transacción: la exclusividad no se puede sostener con dos llamadas desde el cliente.
export async function createGuest(draft: GuestDraft): Promise<ReservationGuest> {
  const body: Record<string, unknown> = {
    reservation_id: draft.reservation_id,
    name: draft.name.trim(),
  };
  if (draft.email?.trim()) body.email = draft.email.trim();
  const phone = normalizeGuestPhone(draft.phone ?? '');
  if (phone) body.phone = phone;
  if (draft.is_primary != null) body.is_primary = draft.is_primary;

  const json = await request<Envelope<ReservationGuest>>(
    '/reservation-guest',
    { method: 'POST', body: JSON.stringify(body) },
    'Failed to add the guest.',
  );
  return json.data;
}

// PATCH, como el resto del épico. Un campo ausente se deja como está.
export async function updateGuest(
  id: number,
  patch: Partial<Omit<GuestDraft, 'reservation_id'>>,
): Promise<ReservationGuest> {
  const body: Record<string, unknown> = {};
  if (patch.name != null) body.name = patch.name.trim();
  if (patch.email != null) body.email = patch.email.trim();
  if (patch.phone != null) body.phone = normalizeGuestPhone(patch.phone);
  if (patch.is_primary != null) body.is_primary = patch.is_primary;

  const json = await request<Envelope<ReservationGuest>>(
    `/reservation-guest/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'Failed to update the guest.',
  );
  return json.data;
}

// Baja lógica (is_active = false). Si el que se va era el principal, el servidor eleva al
// siguiente del roster en la misma transacción.
export async function removeGuest(id: number): Promise<void> {
  await request<Envelope<ReservationGuest>>(
    `/reservation-guest/${id}`,
    { method: 'DELETE' },
    'Failed to remove the guest.',
  );
}

// Búsqueda global por nombre, correo o teléfono en todo el comercio — la que localiza a un
// cliente que llama sin recordar el día de su reserva.
export async function searchGuests(term: string): Promise<ReservationGuest[]> {
  const params = new URLSearchParams({ limit: String(MAX_PAGE_LIMIT) });
  if (term.trim()) params.set('search', term.trim());

  const json = await request<Envelope<ReservationGuest[]>>(
    `/reservation-guest?${params.toString()}`,
    { method: 'GET' },
    'Failed to search the guest roster.',
  );
  return json?.data ?? [];
}

// ================= Histórico de estados =================

// Techo de páginas por consulta: un día de mucho servicio son unos cientos de transiciones;
// si alguna vez hay más, se corta aquí en vez de encadenar peticiones sin fin.
const MAX_HISTORY_PAGES = 20;

async function fetchAllHistoryPages(
  path: string,
  params: URLSearchParams,
  fallbackMessage: string,
): Promise<StatusHistoryFeedEntry[]> {
  const rows: StatusHistoryFeedEntry[] = [];
  params.set('limit', String(MAX_PAGE_LIMIT));
  for (let page = 1; page <= MAX_HISTORY_PAGES; page += 1) {
    params.set('page', String(page));
    const json = await request<Envelope<StatusHistoryFeedEntry[]>>(
      `${path}?${params.toString()}`,
      { method: 'GET' },
      fallbackMessage,
    );
    rows.push(...(json?.data ?? []));
    if (!json?.hasNext) break;
  }
  return rows;
}

/**
 * Todas las transiciones REGISTRADAS en un día local (`changed_at`), en changed_at DESC.
 * Se trae el día entero y se filtra en cliente: los KPI del turno tienen que sumar el día
 * completo aunque la lista esté filtrada por estado o por empleado.
 */
export async function listStatusHistoryForDay(day: string): Promise<StatusHistoryFeedEntry[]> {
  return fetchAllHistoryPages(
    '/reservation-status-history',
    new URLSearchParams({ date: day }),
    'Failed to load the status history.',
  );
}

/** Ciclo de vida completo de una reserva, sea del día que sea. 404 si no existe. */
export async function listReservationLifecycle(
  reservationId: number,
): Promise<StatusHistoryFeedEntry[]> {
  return fetchAllHistoryPages(
    `/reservation-status-history/by-reservation/${reservationId}`,
    new URLSearchParams(),
    'Failed to load the reservation history.',
  );
}

// ================= Aforo y ritmo =================

/**
 * Matriz de franjas de un día para un grupo concreto. La calcula el servidor (pico de
 * comensales CONFIRMED/SEATED simultáneos y límite de llegadas por franja); el drawer sólo
 * la pinta.
 */
export async function getAvailability(query: {
  date: string;
  partySize: number;
  durationMinutes: number;
  excludeReservationId?: number;
}): Promise<DayAvailability> {
  const params = new URLSearchParams({
    date: query.date,
    party_size: String(query.partySize),
    duration_minutes: String(query.durationMinutes),
  });
  if (query.excludeReservationId) {
    params.set('exclude_reservation_id', String(query.excludeReservationId));
  }
  const json = await request<Envelope<DayAvailability>>(
    `/reservation-capacity/availability?${params.toString()}`,
    { method: 'GET' },
    'Failed to load slot availability.',
  );
  return json.data;
}

export async function getCapacitySettings(): Promise<CapacitySettings> {
  const json = await request<Envelope<CapacitySettings>>(
    '/reservation-capacity/settings',
    { method: 'GET' },
    'Failed to load the capacity settings.',
  );
  return json.data;
}

// PUT (no PATCH): es un documento de ajustes único por comercio. null = valor por defecto.
export async function updateCapacitySettings(payload: {
  seat_capacity: number | null;
  slot_interval_minutes: number;
  max_covers_per_slot: number | null;
  shifts: Array<{ name: string; start: string; end: string }>;
}): Promise<CapacitySettings> {
  const json = await request<Envelope<CapacitySettings>>(
    '/reservation-capacity/settings',
    { method: 'PUT', body: JSON.stringify(payload) },
    'Failed to save the capacity settings.',
  );
  return json.data;
}
