// Tipos del dominio de Reservas (/api/reservation y sus sub-recursos).
//
// El contrato real del backend NO es el que dicen las historias: el controlador es
// `@Controller('reservation')` (SINGULAR, sin /v1), así que la ruta es `/api/reservation`,
// y la actualización viaja por **PATCH**, no por PUT como el resto de módulos. Los escalares
// llegan en snake_case tal cual salen de la entidad; no los normalizamos para no romper los
// payloads de escritura.

// ================= Ciclo de vida =================

// Espejo del enum ReservationStatus del backend. Ojo con `white_list`: la constante se llama
// WAIT_LIST pero el valor persistido está mal escrito en la columna enum de Postgres, así que
// éste es el literal que hay que mandar y esperar. Cambiarlo aquí a 'wait_list' rompería la
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

// Paleta exacta de la historia: ámbar aviso, azul info, verde éxito, pizarra apagada, rojo
// peligro, morado ausencia. `white_list` no está en la historia (es un estado que sólo existe
// en el enum del backend); se le da cian para que no se confunda con ninguno de los seis.
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

// Píldora sobre fondo claro. Las clases están escritas ENTERAS y a mano, una por estado: el
// JIT de Tailwind extrae los nombres de clase leyendo el fichero como texto plano, así que un
// `bg-[${color}]/15` compuesto en tiempo de ejecución nunca llega a generar CSS y la píldora
// saldría transparente. Los literales repiten los valores de RESERVATION_STATUS_COLORS.
export const RESERVATION_STATUS_PILL_STYLES: Record<ReservationStatus, string> = {
  pending: 'bg-[#f59e0b]/15 text-[#b45309] border border-[#f59e0b]/40',
  confirmed: 'bg-[#3b82f6]/15 text-[#1d4ed8] border border-[#3b82f6]/40',
  seated: 'bg-[#10b981]/15 text-[#047857] border border-[#10b981]/40',
  completed: 'bg-[#64748b]/15 text-[#475569] border border-[#64748b]/40',
  cancelled: 'bg-[#ef4444]/15 text-[#b91c1c] border border-[#ef4444]/40',
  white_list: 'bg-[#0891b2]/15 text-[#0e7490] border border-[#0891b2]/40',
  no_show: 'bg-[#8b5cf6]/15 text-[#6d28d9] border border-[#8b5cf6]/40',
};

// El texto de la píldora usa un tono más oscuro que el color nominal del estado para que el
// contraste sobre el relleno al 15% pase AA; el color de la historia se conserva en el borde,
// en el relleno y en la barra lateral de la tarjeta (RESERVATION_STATUS_COLORS).
export const reservationStatusPillStyle = (raw?: string | null): string =>
  isReservationStatus(raw ?? '')
    ? RESERVATION_STATUS_PILL_STYLES[raw as ReservationStatus]
    : 'bg-[#ece8e0] text-[#1d1c17] border border-[#e8e2d8]';

// Una reserva con un estado heredado fuera del enum sigue siendo legible en la parrilla en vez
// de tumbar la píldora.
export const reservationStatusLabel = (raw?: string | null): string => {
  const value = (raw ?? '').trim();
  if (isReservationStatus(value)) return RESERVATION_STATUS_LABELS[value];
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
};

// ================= Canal de origen =================

// La columna es varchar(20) libre; éstos son los cuatro canales que el POS sabe pintar.
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

// ================= Formas del contrato =================

// Roster de acompañantes. `is_primary` marca el contacto principal de la mesa; el backend NO
// impone que haya exactamente uno, esa garantía la sostiene el workspace de Guests.
export interface ReservationGuest {
  id: number;
  reservation_id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
  is_active: boolean;
}

// Enlace reserva ↔ mesa física. OJO con las DOS formas en que llega:
//  - embebido en la reserva (`GET /api/reservation`), donde el servicio sólo mapea los tres
//    escalares y NO hay ni `id` ni datos de la mesa;
//  - desde `GET /api/reservation-table`, que sí hidrata número, aforo y zona vía la relación
//    `eager` a Table.
// Por eso todo lo que no sean los tres escalares es opcional: pintar el tablero a partir de la
// reserva embebida exige resolver la mesa contra el inventario de /api/tables.
export interface ReservationTableLink {
  /** Sólo viene de /api/reservation-table; hace falta para desasignar por fila. */
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

// Tal cual lo devuelve ReservationResponseDto. `guests`/`tables`/`notes`/`status_history` sólo
// vienen hidratados cuando el servicio los ha unido (findAll y findOne los traen; el POST
// devuelve findOne, así que también).
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
  created_at?: string;
  guests?: ReservationGuest[];
  tables?: ReservationTableLink[];
  notes?: ReservationNote[];
  status_history?: ReservationStatusHistoryEntry[];
}

// Cuerpo del POST /api/reservation. `created_by` lo sella el servidor desde el JWT: mandarlo
// desde el cliente permitiría firmar la reserva con el id de otro compañero.
export interface ReservationDraft {
  customer_id?: number;
  reservation_date: string;
  duration_minutes?: number;
  party_size: number;
  status?: ReservationStatus;
  source?: string;
  special_requests?: string;
  table_ids?: number[];
}

// El CRM sólo tiene `name` (un único campo), no first_name/last_name como dice la historia.
export interface CustomerRef {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  merchantId?: number;
}

export const DEFAULT_DURATION_MINUTES = 90;

// Minutos de cortesía antes de que una reserva confirmada sea candidata a no-show.
export const NO_SHOW_GRACE_MINUTES = 15;
