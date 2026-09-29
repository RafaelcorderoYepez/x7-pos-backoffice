// Motor del histórico de estados de reserva: tiempo en cada estado, las tres duraciones
// operativas, la detección de cambios de última hora, los KPI del turno y los filtros.
//
// Todo se calcula a partir de las marcas `changed_at` del histórico (Δt = changed_atₙ −
// changed_atₙ₋₁), no de columnas sueltas de la reserva: el histórico es el registro auditable
// y es lo que el criterio de aceptación exige. El servidor entrega cada entrada con la
// anterior de su reserva (`previous_status` / `previous_changed_at`), resuelta contra el ciclo
// de vida completo, así que el Δt es exacto aunque el filtro de día deje fuera el alta.

import type {
  Reservation,
  ReservationStatus,
  ReservationStatusHistoryEntry,
  StatusHistoryFeedEntry,
} from '../types/reservation';
import { authorLabel } from './reservation-notes';

// Minutos antes de la hora de la reserva a partir de los cuales una anulación o un no-show
// cuentan como "de última hora". Lo que ocurre DESPUÉS de la hora también cuenta: una
// anulación a la hora de sentarse es aún más tardía, no menos.
export const LATE_CHANGE_WINDOW_MINUTES = 30;

const MINUTE_MS = 60_000;

const LATE_STATUSES: ReservationStatus[] = ['cancelled', 'no_show'];

const timeOf = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

// ================= Orden =================

// Orden de inserción: por changed_at y, a igualdad (alta + confirmación en el mismo
// milisegundo desde un script), por id. Sin el desempate el Δt podría salir negativo.
export const sortHistoryChronologically = <T extends Pick<ReservationStatusHistoryEntry, 'id' | 'changed_at'>>(
  entries: T[],
): T[] =>
  [...entries].sort(
    (a, b) => (timeOf(a.changed_at) ?? 0) - (timeOf(b.changed_at) ?? 0) || a.id - b.id,
  );

/** changed_at DESC estricto, que es el orden del feed que pide la historia. */
export const sortHistoryByRecency = <T extends Pick<ReservationStatusHistoryEntry, 'id' | 'changed_at'>>(
  entries: T[],
): T[] => sortHistoryChronologically(entries).reverse();

// ================= Cambios de última hora =================

export interface LateChange {
  status: 'cancelled' | 'no_show';
  /** Minutos que faltaban para la hora de la reserva; negativo = ya había pasado. */
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

// ================= Tiempo en estado =================

/** Δt = changed_atₙ − changed_atₙ₋₁: tiempo que la reserva pasó en `previous_status`. */
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
  /** Sólo en `dining`: duración reservada y desvío contra ella (positivo = se alargó). */
  bookedMs?: number;
  overrunMs?: number;
}

/**
 * La duración operativa que CIERRA esta transición, si cierra alguna:
 *  - CONFIRMED tras PENDING → plazo de confirmación (el Δt de la entrada);
 *  - SEATED → espera en recepción, desde la hora de la reserva (no desde el estado anterior:
 *    un grupo confirmado hace tres días no ha esperado tres días en la puerta);
 *  - COMPLETED tras SEATED → duración de la comida, contra `duration_minutes`.
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

// ================= Duraciones de una reserva =================

export interface ReservationDurations {
  /** PENDING → CONFIRMED. */
  confirmationLeadMs: number | null;
  /** Hora de la reserva → SEATED. Negativo = el grupo se sentó antes de su hora. */
  receptionWaitMs: number | null;
  /** SEATED → COMPLETED. */
  diningMs: number | null;
  /** Duración reservada (duration_minutes) contra la que se compara la sobremesa. */
  bookedDiningMs: number;
  /** diningMs − bookedDiningMs; positivo = la mesa se alargó más de lo reservado. */
  diningOverrunMs: number | null;
}

// Primera entrada con `status` en o después de `fromIndex`. Se usa la PRIMERA porque es la
// transición real: una segunda entrada igual sólo podría venir de datos heredados.
const firstIndexOf = (
  chronological: ReservationStatusHistoryEntry[],
  status: ReservationStatus,
  fromIndex = 0,
): number => chronological.findIndex((e, i) => i >= fromIndex && e.status === status);

/** Resumen de un ciclo de vida completo (la búsqueda por #RES). */
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
  // El histórico manda; `seated_at` sólo cubre reservas antiguas sin la entrada SEATED.
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

// ================= KPIs del turno =================

export interface ShiftMetrics {
  /** Entradas del histórico registradas en el día. */
  transitions: number;
  /** Transiciones a SEATED. */
  seatedParties: number;
  /** Transiciones a CANCELLED o NO_SHOW. */
  cancellationsAndNoShows: number;
  /** Cambios hechos por procesos automáticos (changed_by = null). */
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

// ================= Presentación =================

/** "45s", "12m", "1h 05m", "2d 3h". Sin signo: el llamador decide si es "antes" o "después". */
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

/** Frase de la duración que cierra una entrada del feed. */
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

/** "16/04/2026 19:05:12" — con segundos: es una marca de auditoría, no una hora de servicio. */
export const auditTimestamp = (iso?: string | null): string => {
  const t = timeOf(iso);
  if (t == null) return '—';
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// `changed_by` null es un proceso automático (p. ej. el marcado de no-show por vencimiento);
// con id, la misma firma que las notas: "Ana Ruiz (Host)" o "Staff #12" sin catálogo.
export const actorLabel = (
  changedBy: number | null | undefined,
  staffById?: Map<number, { name?: string; role?: string }>,
): string => (changedBy == null ? 'Automated System' : authorLabel(changedBy, staffById));

// ================= Filtros =================

/** 'all' = cualquiera; 'automated' = changed_by null; número = ese usuario. */
export type ActorFilter = 'all' | 'automated' | number;

export interface HistoryFilters {
  /** '' = cualquier estado destino. */
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
 * "#RES-14", "res-14", "RES 14" o "14" → 14. Cualquier otra cosa → null: la búsqueda es por
 * id de reserva, así que un texto que no lo contiene no debe disparar una consulta.
 */
export const parseReservationLookup = (raw: string): number | null => {
  const match = raw.trim().match(/^(?:#?\s*res\s*[-\s]?\s*)?(\d{1,9})$/i);
  if (!match) return null;
  const id = Number(match[1]);
  return id > 0 ? id : null;
};

/**
 * Opciones del desplegable de empleado: sólo quien ha tocado algo en el día (un catálogo de
 * 40 empleados donde 38 no aparecen no ayuda a auditar), ordenadas por nombre, y "Automated
 * System" si algún proceso automático cambió estados.
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
