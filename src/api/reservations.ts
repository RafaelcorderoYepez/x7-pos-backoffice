// HTTP Client of the Reservations module.
//
// The actual path is `/api/reservation` — SINGULAR and without `/v1`, contrary to what the
// story texts (`/api/v1/reservations`, which returns 404). And the update goes
// by **PATCH**, not by PUT like the rest of the backoffice modules.
//
// The backend validates with `forbidNonWhitelisted: true`, so any fields not in
// the DTO knocks down the request with a 400: the bodies are constructed explicitly, never based on
// spread form state.

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

// Query DTO `limit` is capped at 100 across the entire backend: requesting more returns 400
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
  /** Specific day (YYYY-MM-DD). The backend resolves it as a semi-open range over the index. */
  date?: string;
  /** Explicit range for week/month views; Full ISO. */
  dateFrom?: string;
  dateTo?: string;
  status?: ReservationStatus;
  customerId?: number;
  page?: number;
  limit?: number;
}

// The day filter travels to the server (it is the one that uses the composite index
// [merchant_id, reservation_date]); the status/origin/text one resolves to client because the
// Filter strip is multi-select and the DTO only accepts a loose state.
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
  // Only optional ones with a value are sent: a `customer_id: null` is rejected by @IsInt, and a
  // `source: ''` would save an empty string as the source channel.
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

// PATCH, not PUT: the reservation controller is the only one in the backoffice that updates like this.
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

// Cancel has its own endpoint (it leaves a trace in the state history with a single trip).
export async function cancelReservation(id: number): Promise<Reservation> {
  const json = await request<Envelope<Reservation>>(
    `/reservation/${id}/cancel`,
    { method: 'PATCH' },
    'Failed to cancel the reservation.',
  );
  return normalizeReservation(json.data);
}

// DELETE is a LOGICAL delete (is_active = false) that drags tables, guests, and notes.
export async function deleteReservation(id: number): Promise<void> {
  await request<Envelope<Reservation>>(
    `/reservation/${id}`,
    { method: 'DELETE' },
    'Failed to delete the reservation.',
  );
}

// Quick registration of the main companion when the reservation is made without a CRM file: the
// "lightweight guest record" in history is exactly a reservation_guest.
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
  // Without separators: this is what @IsPhoneNumber expects and what fits in varchar(20).
  const phone = normalizeGuestPhone(payload.phone ?? '');
  if (phone) body.phone = phone;

  await request<Envelope<unknown>>(
    '/reservation-guest',
    { method: 'POST', body: JSON.stringify(body) },
    'The reservation was saved, but the guest contact could not be attached.',
  );
}

// NOTE: `GET /api/customers` returns a BARE ARRAY (without {data} wrapper) and does NOT filter by
// commerce — the service does a find() without scope. Filtering by merchant is done here, or
// autocomplete would offer customers from other locations.
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

// Complete CRM file. The DTO requires rut/address/city/state/country in addition to the email, so
// that the drawer requests them when the hostess chooses to create a profile instead of an individual guest.
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

// Table inventory: feeds the total capacity of the room for the oversale notice.
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

// ================= Table assignment =================

/**
 * Link multiple tables to a reservation in a single transaction.
 *
 * Used even for a loose table: the simple endpoint (`POST /api/reservation-table`) does not
 * is transactional and returns 200 "already assigned" instead of failing, so the path
 * writing workspace is always this one. A 409 means that the table was occupied between
 * painted the board and pressed save.
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

// Dropping a table is a LOGICAL delete (is_active = false): the trace of who was where
// preserved for service history.
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

// Hydrated assignments with number, capacity and area (`eager` relationship to Table in the entity).
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

// `created_by` does NOT travel in the body: the driver stamps it with the `user.id` of the token.
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

// Logical deletion: the note is no longer listed but the service history preserves it.
export async function deleteReservationNote(id: number): Promise<void> {
  await request<Envelope<ReservationNote>>(
    `/reservation-note/${id}`,
    { method: 'DELETE' },
    'Failed to remove the note.',
  );
}

// Staff catalog to sign the notes. Fails silently (403 if the plan does not include
// collaborators): without it the signature falls to "Staff #<id>", which is still a valid attribution.
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

// ================= Roster of diners =================

export interface GuestDraft {
  reservation_id: number;
  name: string;
  email?: string;
  phone?: string;
  is_primary?: boolean;
}

// Checking `is_primary` downgrades to previous primary ON THE SERVER, within it
// transaction: exclusivity cannot be sustained with two calls from the client.
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

// PATCH, like the rest of the epic. A missing field is left as is.
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

// Low logic (is_active = false). If the one who leaves was the main one, the server raises the
// next on the roster in the same transaction.
export async function removeGuest(id: number): Promise<void> {
  await request<Envelope<ReservationGuest>>(
    `/reservation-guest/${id}`,
    { method: 'DELETE' },
    'Failed to remove the guest.',
  );
}

// Global search by name, email or phone throughout the business — the one that locates a
// customer who calls without remembering the day of his reservation.
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

// ================= Status History =================

// Ceiling of pages per query: a day of a lot of service is a few hundred transitions;
// If there are ever more, it cuts off here instead of chaining endless requests.
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
 * All transitions RECORDED on a local day (`changed_at`), in changed_at DESC.
 * The entire day is brought in and filtered to the client: the KPIs of the shift have to add up to the day
 * complete even if the list is filtered by status or employee.
 */
export async function listStatusHistoryForDay(day: string): Promise<StatusHistoryFeedEntry[]> {
  return fetchAllHistoryPages(
    '/reservation-status-history',
    new URLSearchParams({ date: day }),
    'Failed to load the status history.',
  );
}

/** Complete life cycle of a reservation, whatever day it is. 404 if it does not exist. */
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
 * Matrix of one-day slots for a specific group. It is calculated by the server (peak
 * simultaneous CONFIRMED/SEATED diners and limit of arrivals per slot); the drawer only
 * the pint.
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

// PUT (not PATCH): It is a unique adjustment document per business. null = default value.
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
