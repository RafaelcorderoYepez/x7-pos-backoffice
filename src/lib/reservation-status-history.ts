// Reservation state history engine: time in each state, the three durations
// operational, last-minute change detection, shift KPIs and filters.
//
// Everything is calculated from the `changed_at` marks of the history (Δt = changed_atₙ −
// changed_atₙ₋₁), not from individual columns of the reserve: the history is the auditable record
// and that is what the acceptance criterion requires. The server delivers each entry with the
// previous of your reservation (`previous_status` / `previous_changed_at`), resolved against the loop
// of life, so the Δt is accurate even if the day filter leaves out the discharge.

import type {
  Reservation,
  ReservationStatus,
  ReservationStatusHistoryEntry,
  StatusHistoryFeedEntry,
} from '../types/reservation';
import { authorLabel } from './reservation-notes';

// Minutes before the reservation time from which a cancellation or no-show
// count as "breaking news." What happens AFTER the hour also counts: a
// cancellation at seating time is even later, not less.
export const LATE_CHANGE_WINDOW_MINUTES = 30;

const MINUTE_MS = 60_000;

const LATE_STATUSES: ReservationStatus[] = ['cancelled', 'no_show'];

const timeOf = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

// ================= Order =================

// Insertion order: by changed_at and, at equality (high + commit on the same
// millisecond from a script), by id. Without the tiebreaker the Δt could be negative.
export const sortHistoryChronologically = <T extends Pick<ReservationStatusHistoryEntry, 'id' | 'changed_at'>>(
  entries: T[],
): T[] =>
  [...entries].sort(
    (a, b) => (timeOf(a.changed_at) ?? 0) - (timeOf(b.changed_at) ?? 0) || a.id - b.id,
  );

/** changed_at strict DESC, which is the order of the feed that the story requests. */
export const sortHistoryByRecency = <T extends Pick<ReservationStatusHistoryEntry, 'id' | 'changed_at'>>(
  entries: T[],
): T[] => sortHistoryChronologically(entries).reverse();

// ================= Last minute changes =================

export interface LateChange {
  status: 'cancelled' | 'no_show';
  /** Minutes left until the reservation time; negative = it had already happened. */
  minutesBeforeStart: number;
}

export const detectLateChange = (
  entry: Pick<ReservationStatusHistoryEntry, 'status' | 'changed_at'>,
  reservationDate?: string | null,
): LateChange | null => {
  if (!LATE_STATUSES.includes(entry.status)) return null;
  const changedAt = timeOf(entry.changed_at);
  const start = timeOf(reservationDate);
  if (changedAt == null || start == null) return null;

  const minutesBeforeStart = Math.round((start - changedAt) / MINUTE_MS);
  if (minutesBeforeStart > LATE_CHANGE_WINDOW_MINUTES) return null;
  return { status: entry.status as LateChange['status'], minutesBeforeStart };
};

export const entryLateChange = (entry: StatusHistoryFeedEntry): LateChange | null =>
  detectLateChange(entry, entry.reservation?.reservation_date);

export const lateChangeLabel = (late: LateChange): string => {
  const what = late.status === 'cancelled' ? 'Late cancellation' : 'Late no-show';
  if (late.minutesBeforeStart > 0) return `${what} — ${late.minutesBeforeStart} min before start`;
  if (late.minutesBeforeStart === 0) return `${what} — at start time`;
  return `${what} — ${-late.minutesBeforeStart} min after start`;
};

// ================= Time in state =================

/** Δt = changed_atₙ − changed_atₙ₋₁: time the reservation spent in `previous_status`. */
export const timeInPreviousMs = (
  entry: Pick<StatusHistoryFeedEntry, 'changed_at' | 'previous_changed_at'>,
): number | null => {
  const now = timeOf(entry.changed_at);
  const before = timeOf(entry.previous_changed_at);
  return now != null && before != null ? now - before : null;
};

export type EntryDurationKind = 'confirmation_lead' | 'reception_wait' | 'dining';

export interface EntryDuration {
  kind: EntryDurationKind;
  ms: number;
  /** Only in `dining`: reserved duration and offset against it (positive = lengthened). */
  bookedMs?: number;
  overrunMs?: number;
}

/**
 * The operational duration that CLOSES this transition, if it closes any:
 *  - CONFIRMED after PENDING → confirmation period (the Δt of the entry);
 *  - SEATED → waiting at reception, from the time of reservation (not from the previous state:
 *    a group confirmed three days ago has not waited three days at the door);
 *  - COMPLETED after SEATED → duration of the meal, against `duration_minutes`.
 */
export const entryDuration = (entry: StatusHistoryFeedEntry): EntryDuration | null => {
  const delta = timeInPreviousMs(entry);

  if (entry.status === 'confirmed' && entry.previous_status === 'pending' && delta != null) {
    return { kind: 'confirmation_lead', ms: delta };
  }

  if (entry.status === 'seated') {
    const seated = timeOf(entry.changed_at);
    const start = timeOf(entry.reservation?.reservation_date);
    if (seated != null && start != null) return { kind: 'reception_wait', ms: seated - start };
  }

  if (entry.status === 'completed' && entry.previous_status === 'seated' && delta != null) {
    const bookedMs = (Number(entry.reservation?.duration_minutes) || 0) * MINUTE_MS;
    return { kind: 'dining', ms: delta, bookedMs, overrunMs: delta - bookedMs };
  }

  return null;
};

// ================= Durations of a reservation =================

export interface ReservationDurations {
  /** PENDING → CONFIRMED. */
  confirmationLeadMs: number | null;
  /** Reservation time → SEATED. Negative = the group sat down before their time. */
  receptionWaitMs: number | null;
  /** SEATED → COMPLETED. */
  diningMs: number | null;
  /** Reserved duration (duration_minutes) against which the desktop is compared. */
  bookedDiningMs: number;
  /** diningMs − bookedDiningMs; positive = the table was longer than reserved. */
  diningOverrunMs: number | null;
}

// First entry with `status` on or after `fromIndex`. The FIRST is used because it is the
// real transition: a second equal entry could only come from inherited data.
const firstIndexOf = (
  chronological: ReservationStatusHistoryEntry[],
  status: ReservationStatus,
  fromIndex = 0,
): number => chronological.findIndex((e, i) => i >= fromIndex && e.status === status);

/** Summary of a complete life cycle (search for #RES). */
export const computeDurations = (
  reservation: Pick<Reservation, 'reservation_date' | 'duration_minutes' | 'seated_at' | 'status_history'>,
): ReservationDurations => {
  const chronological = sortHistoryChronologically(
    (reservation.status_history ?? []).filter((e) => e.is_active !== false),
  );
  const at = (index: number): number | null =>
    index >= 0 ? timeOf(chronological[index].changed_at) : null;

  const pendingIdx = firstIndexOf(chronological, 'pending');
  const confirmedIdx = pendingIdx >= 0 ? firstIndexOf(chronological, 'confirmed', pendingIdx) : -1;
  const pendingAt = at(pendingIdx);
  const confirmedAt = at(confirmedIdx);

  const seatedIdx = firstIndexOf(chronological, 'seated');
  const completedIdx = seatedIdx >= 0 ? firstIndexOf(chronological, 'completed', seatedIdx) : -1;
  // History rules; `seated_at` only covers old reservations without the SEATED entry.
  const seatedAt = at(seatedIdx) ?? timeOf(reservation.seated_at);
  const completedAt = at(completedIdx);
  const start = timeOf(reservation.reservation_date);

  const bookedDiningMs = (Number(reservation.duration_minutes) || 0) * MINUTE_MS;
  const diningMs =
    seatedIdx >= 0 && seatedAt != null && completedAt != null ? completedAt - seatedAt : null;

  return {
    confirmationLeadMs:
      pendingAt != null && confirmedAt != null ? confirmedAt - pendingAt : null,
    receptionWaitMs: start != null && seatedAt != null ? seatedAt - start : null,
    diningMs,
    bookedDiningMs,
    diningOverrunMs: diningMs != null ? diningMs - bookedDiningMs : null,
  };
};

// ================= Shift KPIs =================

export interface ShiftMetrics {
  /** History entries recorded on the day. */
  transitions: number;
  /** Transiciones a SEATED. */
  seatedParties: number;
  /** Transiciones a CANCELLED o NO_SHOW. */
  cancellationsAndNoShows: number;
  /** Changes made by automatic processes (changed_by = null). */
  automatedActions: number;
  lateChanges: number;
  avgConfirmationLeadMs: number | null;
  avgReceptionWaitMs: number | null;
  avgDiningMs: number | null;
  diningOverruns: number;
}

const average = (values: number[]): number | null =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

export const computeShiftMetrics = (entries: StatusHistoryFeedEntry[]): ShiftMetrics => {
  const leads: number[] = [];
  const waits: number[] = [];
  const dinings: number[] = [];
  let seatedParties = 0;
  let cancellationsAndNoShows = 0;
  let automatedActions = 0;
  let lateChanges = 0;
  let diningOverruns = 0;

  for (const entry of entries) {
    if (entry.status === 'seated') seatedParties += 1;
    if (LATE_STATUSES.includes(entry.status)) cancellationsAndNoShows += 1;
    if (entry.changed_by == null) automatedActions += 1;
    if (entryLateChange(entry)) lateChanges += 1;

    const duration = entryDuration(entry);
    if (duration?.kind === 'confirmation_lead') leads.push(duration.ms);
    if (duration?.kind === 'reception_wait') waits.push(duration.ms);
    if (duration?.kind === 'dining') {
      dinings.push(duration.ms);
      if ((duration.overrunMs ?? 0) >= MINUTE_MS) diningOverruns += 1;
    }
  }

  return {
    transitions: entries.length,
    seatedParties,
    cancellationsAndNoShows,
    automatedActions,
    lateChanges,
    avgConfirmationLeadMs: average(leads),
    avgReceptionWaitMs: average(waits),
    avgDiningMs: average(dinings),
    diningOverruns,
  };
};

// ================= Presentation =================

/** "45s", "12m", "1h 05m", "2d 3h". Unsigned: The caller decides whether it is "before" or "after". */
export const formatDuration = (ms: number | null | undefined): string => {
  if (ms == null || Number.isNaN(ms)) return '—';
  const totalSeconds = Math.round(Math.abs(ms) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};

/** "12m wait" / "5m early" / "On time". */
export const receptionWaitLabel = (ms: number | null): string => {
  if (ms == null) return '—';
  if (Math.abs(ms) < MINUTE_MS) return 'On time';
  return ms < 0 ? `${formatDuration(ms)} early` : `${formatDuration(ms)} wait`;
};

/** "+15m over" / "20m under" / "On booked time". */
export const diningOverrunLabel = (ms: number | null | undefined): string => {
  if (ms == null) return '';
  if (Math.abs(ms) < MINUTE_MS) return 'On booked time';
  return ms > 0 ? `+${formatDuration(ms)} over` : `${formatDuration(ms)} under`;
};

/** Duration phrase that closes a feed entry. */
export const entryDurationLabel = (duration: EntryDuration): string => {
  switch (duration.kind) {
    case 'confirmation_lead':
      return `Confirmation lead ${formatDuration(duration.ms)}`;
    case 'reception_wait':
      return `Wait at reception: ${receptionWaitLabel(duration.ms)}`;
    case 'dining':
      return `Dining ${formatDuration(duration.ms)} · ${diningOverrunLabel(duration.overrunMs)} (booked ${formatDuration(duration.bookedMs)})`;
  }
};

/** "04/16/2026 19:05:12" — with seconds: it is an audit mark, not a service hour. */
export const auditTimestamp = (iso?: string | null): string => {
  const t = timeOf(iso);
  if (t == null) return '—';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// `changed_by` null is an automatic process (e.g. marking no-show due to expiration);
// with id, the same signature as the notes: "Ana Ruiz (Host)" or "Staff #12" without catalog.
export const actorLabel = (
  changedBy: number | null | undefined,
  staffById?: Map<number, { name?: string; role?: string }>,
): string => (changedBy == null ? 'Automated System' : authorLabel(changedBy, staffById));

// ================= Filtros =================

/** 'all' = any; 'automated' = changed_by null; number = that user. */
export type ActorFilter = 'all' | 'automated' | number;

export interface HistoryFilters {
  /** '' = any destination state. */
  status: ReservationStatus | '';
  actor: ActorFilter;
}

export const EMPTY_HISTORY_FILTERS: HistoryFilters = { status: '', actor: 'all' };

export const hasActiveHistoryFilters = (f: HistoryFilters): boolean =>
  f.status !== '' || f.actor !== 'all';

export const matchesHistoryFilters = (
  entry: StatusHistoryFeedEntry,
  filters: HistoryFilters,
): boolean => {
  if (filters.status && entry.status !== filters.status) return false;
  if (filters.actor === 'automated') return entry.changed_by == null;
  if (filters.actor !== 'all') return entry.changed_by === filters.actor;
  return true;
};

/**
 * "#RES-14", "res-14", "RES 14" or "14" → 14. Anything else → null: the search is by
 * reservation id, so a text that does not contain it should not trigger a query.
 */
export const parseReservationLookup = (raw: string): number | null => {
  const match = raw.trim().match(/^(?:#?\s*res\s*[-\s]?\s*)?(\d{1,9})$/i);
  if (!match) return null;
  const id = Number(match[1]);
  return id > 0 ? id : null;
};

/**
 * Employee dropdown options: only who has touched something during the day (a catalog of
 * 40 employees where 38 do not appear does not help audit), sorted by name, and "Automated
 * System" if any automatic processes changed states.
 */
export const actorOptions = (
  entries: StatusHistoryFeedEntry[],
  staffById?: Map<number, { name?: string; role?: string }>,
): Array<{ value: ActorFilter; label: string }> => {
  const ids = new Set<number>();
  let automated = false;
  for (const entry of entries) {
    if (entry.changed_by == null) automated = true;
    else ids.add(entry.changed_by);
  }
  const staff = [...ids]
    .map((id) => ({ value: id as ActorFilter, label: actorLabel(id, staffById) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return automated ? [...staff, { value: 'automated', label: 'Automated System' }] : staff;
};
