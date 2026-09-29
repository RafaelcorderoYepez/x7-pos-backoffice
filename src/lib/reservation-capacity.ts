// Aforo y ritmo de reservas en el cliente: tipos del contrato `/api/reservation-capacity`,
// semáforo de franjas, validación del override del encargado y del formulario de ajustes.
//
// El cálculo de ocupación NO se repite aquí: lo hace el servidor (pico de comensales
// simultáneos de las reservas CONFIRMED/SEATED) y es el único que decide, dentro de una
// transacción con cerrojo. El cliente pinta su veredicto y lo respeta.

import { ApiError } from './api-error';

export type OccupancyLevel = 'available' | 'limited' | 'sold_out';

export interface ServiceShift {
  name: string;
  /** "HH:mm", hora local del local. */
  start: string;
  end: string;
}

export interface CapacitySettings {
  seat_capacity: number | null;
  effective_seat_capacity: number;
  capacity_source: 'settings' | 'tables';
  slot_interval_minutes: number;
  max_covers_per_slot: number | null;
  shifts: ServiceShift[];
  updated_at: string | null;
}

export interface SlotAvailability {
  time: string;
  start: string;
  booked_seats: number;
  projected_seats: number;
  occupancy_pct: number | null;
  level: OccupancyLevel;
  arrivals: number;
  fits_capacity: boolean;
  fits_throttle: boolean;
  bookable: boolean;
}

export interface ShiftAvailability extends ServiceShift {
  occupancy_pct: number | null;
  level: OccupancyLevel;
  slots: SlotAvailability[];
}

export interface DayAvailability {
  date: string;
  party_size: number;
  duration_minutes: number;
  seat_capacity: number;
  capacity_source: 'settings' | 'tables';
  slot_interval_minutes: number;
  max_covers_per_slot: number | null;
  shifts: ShiftAvailability[];
}

export interface ManagerOverride {
  email: string;
  password: string;
}

/** Código del 409 que admite override del encargado (lo emite el backend). */
export const CAPACITY_OVERRIDE_REQUIRED = 'CAPACITY_OVERRIDE_REQUIRED';

export const isCapacityOverrideError = (err: unknown): err is ApiError =>
  err instanceof ApiError && err.status === 409 && err.code === CAPACITY_OVERRIDE_REQUIRED;

// ================= Semáforo =================

export const LEVEL_LABELS: Record<OccupancyLevel, string> = {
  available: 'High availability',
  limited: 'Limited capacity',
  sold_out: 'Sold out',
};

// Material Symbols de la historia: aforo `group`, lleno `event_busy`/`block`.
export const LEVEL_ICONS: Record<OccupancyLevel, string> = {
  available: 'event_available',
  limited: 'group',
  sold_out: 'event_busy',
};

// Clases escritas ENTERAS: el JIT de Tailwind lee el fichero como texto plano, así que una
// clase compuesta en tiempo de ejecución no genera CSS. Verde < 70 %, ámbar 70–99 %, rojo.
export const LEVEL_CHIP_STYLES: Record<OccupancyLevel, string> = {
  available: 'bg-[#10b981]/10 text-[#047857] border-[#10b981]/40',
  limited: 'bg-[#f59e0b]/15 text-[#92400e] border-[#f59e0b]/50',
  sold_out: 'bg-[#ef4444]/10 text-[#b91c1c] border-[#ef4444]/40',
};

export const LEVEL_DOT_COLORS: Record<OccupancyLevel, string> = {
  available: '#10b981',
  limited: '#f59e0b',
  sold_out: '#ef4444',
};

/**
 * Franja que corresponde a una hora elegida. Una hora fuera de la rejilla (19:10) se evalúa
 * con la franja que la contiene; fuera de todo turno → null (el servidor la comprueba igual).
 */
export const findSlot = (
  availability: DayAvailability | null,
  time: string,
): SlotAvailability | null => {
  if (!availability || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  const minutes = h * 60 + m;
  const interval = availability.slot_interval_minutes || 15;
  const floored = Math.floor(minutes / interval) * interval;
  const key = `${String(Math.floor(floored / 60)).padStart(2, '0')}:${String(floored % 60).padStart(2, '0')}`;
  for (const shift of availability.shifts) {
    const hit = shift.slots.find((s) => s.time === key);
    if (hit) return hit;
  }
  return null;
};

/** Frase de estado de la franja para el lector de pantalla y el aviso del drawer. */
export const slotSummary = (
  slot: SlotAvailability,
  seatCapacity: number,
  partySize: number,
  maxCoversPerSlot: number | null,
): string => {
  const pct = slot.occupancy_pct == null ? '' : ` (${Math.round(slot.occupancy_pct)}%)`;
  const base = seatCapacity > 0
    ? `${slot.booked_seats} of ${seatCapacity} seats committed${pct}`
    : 'seat capacity not configured';
  if (!slot.fits_capacity) {
    const free = Math.max(seatCapacity - slot.booked_seats, 0);
    return `${slot.time} — sold out for a party of ${partySize}: ${base}, only ${free} free.`;
  }
  if (!slot.fits_throttle) {
    return `${slot.time} — arrival pacing limit reached: ${slot.arrivals} of ${maxCoversPerSlot} guests already arrive in this slot.`;
  }
  return `${slot.time} — ${LEVEL_LABELS[slot.level]}: ${base}.`;
};

// ================= Override =================

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const overrideErrors = (
  draft: ManagerOverride,
): { email: string; password: string } => ({
  email: !draft.email.trim()
    ? 'Manager email is required'
    : !EMAIL.test(draft.email.trim())
      ? 'Enter a valid email'
      : '',
  password: draft.password ? '' : 'Manager password is required',
});

export const hasOverrideErrors = (draft: ManagerOverride): boolean => {
  const errors = overrideErrors(draft);
  return Boolean(errors.email || errors.password);
};

// ================= Ajustes =================

export interface SettingsDraft {
  /** '' = usar la suma de las mesas. */
  seatCapacity: string;
  slotInterval: '15' | '30';
  /** '' = sin límite de llegadas. */
  maxCoversPerSlot: string;
  shifts: ServiceShift[];
}

export const settingsToDraft = (settings: CapacitySettings): SettingsDraft => ({
  seatCapacity: settings.seat_capacity == null ? '' : String(settings.seat_capacity),
  slotInterval: settings.slot_interval_minutes === 30 ? '30' : '15',
  maxCoversPerSlot:
    settings.max_covers_per_slot == null ? '' : String(settings.max_covers_per_slot),
  shifts: settings.shifts.map((s) => ({ ...s })),
});

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

const positiveIntError = (raw: string, label: string): string => {
  if (!raw.trim()) return '';
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return `${label} must be a whole number greater than 0`;
  if (n > 10000) return `${label} is too large`;
  return '';
};

export interface SettingsErrors {
  seatCapacity: string;
  maxCoversPerSlot: string;
  shifts: string[];
  form: string;
}

export const settingsErrors = (draft: SettingsDraft): SettingsErrors => ({
  seatCapacity: positiveIntError(draft.seatCapacity, 'Seat capacity'),
  maxCoversPerSlot: positiveIntError(draft.maxCoversPerSlot, 'Max guests per slot'),
  shifts: draft.shifts.map((s) => {
    if (!s.name.trim()) return 'Name the shift';
    if (s.name.trim().length > 30) return 'Shift name is too long (30 max)';
    if (!CLOCK.test(s.start) || !CLOCK.test(s.end)) return 'Use HH:mm times';
    if (s.start === s.end) return 'Start and end cannot be the same';
    return '';
  }),
  form:
    draft.shifts.length === 0
      ? 'Keep at least one service shift'
      : draft.shifts.length > 6
        ? 'Up to 6 shifts'
        : '',
});

export const hasSettingsErrors = (e: SettingsErrors): boolean =>
  Boolean(e.seatCapacity || e.maxCoversPerSlot || e.form || e.shifts.some(Boolean));

/** Cuerpo del PUT: vacío = null (vuelve al valor por defecto), nunca cadena vacía. */
export const draftToSettingsPayload = (draft: SettingsDraft) => ({
  seat_capacity: draft.seatCapacity.trim() ? Number(draft.seatCapacity) : null,
  slot_interval_minutes: Number(draft.slotInterval),
  max_covers_per_slot: draft.maxCoversPerSlot.trim() ? Number(draft.maxCoversPerSlot) : null,
  shifts: draft.shifts.map((s) => ({ name: s.name.trim(), start: s.start, end: s.end })),
});
