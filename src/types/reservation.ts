// Types of the Reservations domain (/api/reservation and its sub-resources).
//
// The actual backend contract is NOT what the stories say: the controller is
// `@Controller('reservation')` (SINGULAR, without /v1), so the path is `/api/reservation`,
// and the update travels through **PATCH**, not through PUT like the rest of the modules. The scalars
// they arrive in snake_case as they leave the entity; We do not normalize them so as not to break the
// write payloads.

// ================= Life cycle =================

// Mirror the backend ReservationStatus enum. Be careful with `white_list`: the constant is called
// WAIT_LIST but the persisted value is misspelled in the Postgres enum column, so
// This is the literal one that must be sent and waited. Changing it here to 'wait_list' would break the
// escritura (22P02: invalid input value for enum).
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'white_list'
  | 'no_show';

export const RESERVATION_STATUSES: ReservationStatus[] = [
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'white_list',
  'no_show',
];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  white_list: 'Wait List',
  no_show: 'No Show',
};

// Exact story palette: warning amber, info blue, success green, blackboard off, red
// danger, purple absence. `white_list` is not in history (it is a state that only exists
// in the backend enum); It is given cyan so that it is not confused with any of the six.
export const RESERVATION_STATUS_COLORS: Record<ReservationStatus, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  seated: '#10b981',
  completed: '#64748b',
  cancelled: '#ef4444',
  white_list: '#0891b2',
  no_show: '#8b5cf6',
};

export const isReservationStatus = (raw?: string | null): raw is ReservationStatus =>
  RESERVATION_STATUSES.includes((raw ?? '') as ReservationStatus);

// Pill on light background. The classes are written WHOLE and by hand, one per state: the
// Tailwind JIT extracts the class names by reading the file as plain text, so a
// `bg-[${color}]/15` composed at runtime never generates CSS and pill
// it would come out transparent. The literals repeat the values of RESERVATION_STATUS_COLORS.
export const RESERVATION_STATUS_PILL_STYLES: Record<ReservationStatus, string> = {
  pending: 'bg-[#f59e0b]/15 text-[#b45309] border border-[#f59e0b]/40',
  confirmed: 'bg-[#3b82f6]/15 text-[#1d4ed8] border border-[#3b82f6]/40',
  seated: 'bg-[#10b981]/15 text-[#047857] border border-[#10b981]/40',
  completed: 'bg-[#64748b]/15 text-[#475569] border border-[#64748b]/40',
  cancelled: 'bg-[#ef4444]/15 text-[#b91c1c] border border-[#ef4444]/40',
  white_list: 'bg-[#0891b2]/15 text-[#0e7490] border border-[#0891b2]/40',
  no_show: 'bg-[#8b5cf6]/15 text-[#6d28d9] border border-[#8b5cf6]/40',
};

// The pill text uses a darker shade than the state's nominal color so that the
// contrast on fill at 15% pass AA; the color of history is preserved at the edge,
// in the padding and in the sidebar of the card (RESERVATION_STATUS_COLORS).
export const reservationStatusPillStyle = (raw?: string | null): string =>
  isReservationStatus(raw ?? '')
    ? RESERVATION_STATUS_PILL_STYLES[raw as ReservationStatus]
    : 'bg-[#ece8e0] text-[#1d1c17] border border-[#e8e2d8]';

// A reservation with an inherited state outside the enum is still readable in the grid instead
// to knock down the pill.
export const reservationStatusLabel = (raw?: string | null): string => {
  const value = (raw ?? '').trim();
  if (isReservationStatus(value)) return RESERVATION_STATUS_LABELS[value];
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
};

// ================= Source Channel =================

// The column is free varchar(20); These are the four channels that the POS knows how to paint.
export type ReservationSource = 'phone' | 'online' | 'qr' | 'walk_in';

export const RESERVATION_SOURCES: ReservationSource[] = ['phone', 'online', 'qr', 'walk_in'];

export const RESERVATION_SOURCE_LABELS: Record<ReservationSource, string> = {
  phone: 'Phone',
  online: 'Online',
  qr: 'QR',
  walk_in: 'Walk-in',
};

export const RESERVATION_SOURCE_ICONS: Record<ReservationSource, string> = {
  phone: 'call',
  online: 'language',
  qr: 'qr_code_2',
  walk_in: 'directions_walk',
};

export const isReservationSource = (raw?: string | null): raw is ReservationSource =>
  RESERVATION_SOURCES.includes((raw ?? '') as ReservationSource);

export const reservationSourceLabel = (raw?: string | null): string => {
  const value = (raw ?? '').trim();
  if (isReservationSource(value)) return RESERVATION_SOURCE_LABELS[value];
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';
};

export const reservationSourceIcon = (raw?: string | null): string =>
  isReservationSource(raw ?? '') ? RESERVATION_SOURCE_ICONS[raw as ReservationSource] : 'help';

// ================= Contract forms =================

// Companion roster. `is_primary` marks the primary contact of the table; the backend is NOT
// requires that there be exactly one, that guarantee is supported by the Guests workspace.
export interface ReservationGuest {
  id: number;
  reservation_id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
  is_active: boolean;
}

// Reservation link ↔ physical table. BE CAREFUL with the TWO ways it arrives:
//  - embedded in the reservation (`GET /api/reservation`), where the service only maps the three
//    scalars and there is NO `id` nor table data;
//  - from `GET /api/reservation-table`, which does hydrate number, capacity and area via the relationship
//    `eager` a Table.
// That's why everything other than the three scalars is optional: paint the board from the
// embedded fallback requires resolving the table against the inventory of /api/tables.
export interface ReservationTableLink {
  /** It only comes from /api/reservation-table; it is needed to deallocate by row. */
  id?: number;
  reservation_id: number;
  table_id: number;
  is_active: boolean;
  table_number?: string;
  capacity?: number;
  zone_id?: number | null;
  zone_name?: string | null;
  zone_color?: string | null;
}

export interface ReservationNote {
  id: number;
  reservation_id: number;
  note: string;
  created_by?: number | null;
  created_at?: string;
  is_active: boolean;
}

export interface ReservationStatusHistoryEntry {
  id: number;
  reservation_id: number;
  status: ReservationStatus;
  changed_by?: number | null;
  changed_at?: string;
  is_active: boolean;
}

// Context of the parent reservation that `/api/reservation-status-history` embeds in each entry.
export interface StatusHistoryReservationSummary {
  id: number;
  reservation_date: string;
  duration_minutes: number;
  seated_at: string | null;
  party_size: number;
  status: ReservationStatus;
  guest_name: string | null;
}

// Form of the feed `/api/reservation-status-history` (NOT the one embedded in the reservation): each
// entry brings the previous one from your reservation, resolved by the server against the lifecycle
// complete, so the Δt is exact even if the day filter leaves out the discharge.
export interface StatusHistoryFeedEntry extends ReservationStatusHistoryEntry {
  previous_status: ReservationStatus | null;
  previous_changed_at: string | null;
  reservation?: StatusHistoryReservationSummary;
}

// As returned by ReservationResponseDto. `guests`/`tables`/`notes`/`status_history` only
// they come hydrated when the service has joined them (findAll and findOne bring them; the POST
// returns findOne, so too).
export interface Reservation {
  id: number;
  merchant_id: number;
  customer_id: number | null;
  reservation_date: string;
  duration_minutes: number;
  seated_at: string | null;
  party_size: number;
  status: ReservationStatus;
  source: string | null;
  special_requests: string | null;
  created_by: number | null;
  /** Manager who authorized bookings above capacity or arrival rate. */
  capacity_override_by?: number | null;
  capacity_override_at?: string | null;
  created_at?: string;
  guests?: ReservationGuest[];
  tables?: ReservationTableLink[];
  notes?: ReservationNote[];
  status_history?: ReservationStatusHistoryEntry[];
}

// POST body /api/reservation. `created_by` is stamped by the server from the JWT: send it
// from the client it would allow signing the reservation with the ID of another colleague.
export interface ReservationDraft {
  customer_id?: number;
  reservation_date: string;
  duration_minutes?: number;
  party_size: number;
  status?: ReservationStatus;
  source?: string;
  special_requests?: string;
  table_ids?: number[];
  /**
   * Manager credentials to force a full slot (only after a 409
   * CAPACITY_OVERRIDE_REQUIRED). The server verifies them and does NOT save them: save who
   * authorized in `capacity_override_by`.
   */
  manager_override?: { email: string; password: string };
}

// The CRM only has `name` (a single field), not first_name/last_name as the story says.
export interface CustomerRef {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  merchantId?: number;
}

export const DEFAULT_DURATION_MINUTES = 90;

// Courtesy minutes before a confirmed reservation is a candidate for no-show.
export const NO_SHOW_GRACE_MINUTES = 15;
