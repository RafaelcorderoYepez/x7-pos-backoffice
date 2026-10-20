// Capacity and rate of reservations in the client: contract types `/api/reservation-capacity`,
// strip traffic light, validation of the manager's override and the adjustment form.
//
// The occupancy calculation is NOT repeated here: it is done by the server (peak diners
// simultaneous CONFIRMED/SEATED reservations) and is the only one who decides, within a
// lock transaction. The client paints his verdict and respects it.

import { ApiError } from './api-error';

export type OccupancyLevel = 'available' | 'limited' | 'sold_out';

export interface ServiceShift {
  name: string;
  /** "HH:mm", local local time. */
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

/** 409 code that supports override of the manager (issued by the backend). */
export const CAPACITY_OVERRIDE_REQUIRED = 'CAPACITY_OVERRIDE_REQUIRED';

export const isCapacityOverrideError = (err: unknown): err is ApiError =>
  err instanceof ApiError && err.status === 409 && err.code === CAPACITY_OVERRIDE_REQUIRED;

// ================= Traffic light =================

export const LEVEL_LABELS: Record<OccupancyLevel, string> = {
  available: 'High availability',
  limited: 'Limited capacity',
  sold_out: 'Sold out',
};

// Material Symbols of the story: capacity `group`, full `event_busy`/`block`.
export const LEVEL_ICONS: Record<OccupancyLevel, string> = {
  available: 'event_available',
  limited: 'group',
  sold_out: 'event_busy',
};

// ENTIRE written classes: Tailwind's JIT reads the file as plain text, so a
// Composite class at runtime does not generate CSS. Green < 70%, amber 70–99%, red.
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
 * Strip that corresponds to a chosen time. One hour off the grid (19:10) is evaluated
 * with the strip that contains it; out of turn → null (the server checks it anyway).
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

/** Strip status phrase for screen reader and drawer prompt. */
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
  /** '' = use the sum of the tables. */
  seatCapacity: string;
  slotInterval: '15' | '30';
  /** '' = no limit on arrivals. */
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

/** PUT body: empty = null (returns to default value), never empty string. */
export const draftToSettingsPayload = (draft: SettingsDraft) => ({
  seat_capacity: draft.seatCapacity.trim() ? Number(draft.seatCapacity) : null,
  slot_interval_minutes: Number(draft.slotInterval),
  max_covers_per_slot: draft.maxCoversPerSlot.trim() ? Number(draft.maxCoversPerSlot) : null,
  shifts: draft.shifts.map((s) => ({ name: s.name.trim(), start: s.start, end: s.end })),
});
