// Status History: The audit log of each transition in the reservation lifecycle, including shift KPIs, time spent in each status, the three operational durations, and last-minute cancellations/no-shows.

// The feed comes from `GET /api/reservation-status-history?date=` — the day the change was logged, not the reservation date: today's confirmation for Saturday dinner is today's activity.
// Each entry brings up the previous entry for its reservation and a summary, so the Δt and reception wait time are calculated without further calls. Searching for a #RES changes its entire lifecycle (`/by-reservation/:id`), regardless of the date.

// It is intentionally read-only: the history is written by the server when the status changes and rejects any edits (405). There isn't a single button here to change it.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { StatusHistoryFeedEntry } from '../../../../types/reservation';
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_COLORS,
  reservationStatusLabel,
  reservationStatusPillStyle,
} from '../../../../types/reservation';
import {
  EMPTY_HISTORY_FILTERS,
  LATE_CHANGE_WINDOW_MINUTES,
  actorLabel,
  actorOptions,
  auditTimestamp,
  computeDurations,
  computeShiftMetrics,
  diningOverrunLabel,
  entryDuration,
  entryDurationLabel,
  entryLateChange,
  formatDuration,
  hasActiveHistoryFilters,
  lateChangeLabel,
  matchesHistoryFilters,
  parseReservationLookup,
  receptionWaitLabel,
  sortHistoryByRecency,
  timeInPreviousMs,
  type ActorFilter,
  type HistoryFilters,
} from '../../../../lib/reservation-status-history';
import { clockTime, reservationCode, todayIsoDate } from '../../../../lib/reservations';
import {
  listReservationLifecycle,
  listStaff,
  listStatusHistoryForDay,
} from '../../../../api/reservations';
import { ApiError } from '../../../../lib/api-error';

interface ReservationStatusHistoryViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

type StaffIndex = Map<number, { name?: string; role?: string }>;

type LifecycleState =
  | { kind: 'idle' }
  | { kind: 'loading'; id: number }
  | { kind: 'loaded'; id: number; entries: StatusHistoryFeedEntry[] }
  | { kind: 'not_found'; id: number }
  | { kind: 'error'; id: number; message: string };

const FILTER_CONTROL =
  'px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm font-sans text-[#1d1c17] outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] hover:text-primary hover:border-[#ae001a] transition-colors duration-200';

export const ReservationStatusHistoryView: React.FC<ReservationStatusHistoryViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const [dayEntries, setDayEntries] = useState<StatusHistoryFeedEntry[]>([]);
  const [staffById, setStaffById] = useState<StaffIndex>(new Map());

  const [day, setDay] = useState<string>(todayIsoDate());
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_HISTORY_FILTERS);
  const [lookup, setLookup] = useState('');
// Last search result received. The visible state (idle / loading / result) is
// DERIVED by comparing it with the typed id, instead of resetting it from the effect.
  const [lookupResult, setLookupResult] = useState<LifecycleState>({ kind: 'idle' });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDay = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDayEntries(await listStatusHistoryForDay(day));
    } catch (err) {
      console.error('Error fetching the status history:', err);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load the status history. Please check if the backend is running.',
      );
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    let ignore = false;
    listStatusHistoryForDay(day)
      .then((entries) => {
        if (!ignore) {
          setDayEntries(entries);
          setError('');
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          console.error('Error fetching the status history:', err);
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load the status history. Please check if the backend is running.',
          );
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [day]);

  // Staff directory: fails silently (403 if the plan doesn't include it) and the signature falls back to
  // "Staff #id". `changed_by` is the id of the JWT user, not the employee record.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listStaff();
        if (cancelled) return;
        setStaffById(
          new Map(rows.map((s) => [s.user_id ?? s.id, { name: s.name, role: s.role }] as const)),
        );
      } catch {
        if (!cancelled) setStaffById(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

// Search by reservation: with a valid ID, its complete lifecycle is retrieved.
// A brief wait is performed for the user to stop typing to avoid requesting #RES-1, #RES-14, and #RES-142.
  const lookupId = parseReservationLookup(lookup);
  useEffect(() => {
    if (lookupId == null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const entries = await listReservationLifecycle(lookupId);
          if (!cancelled) setLookupResult({ kind: 'loaded', id: lookupId, entries });
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 404) {
            setLookupResult({ kind: 'not_found', id: lookupId });
          } else {
            setLookupResult({
              kind: 'error',
              id: lookupId,
              message: err instanceof ApiError ? err.message : 'Failed to load the reservation history.',
            });
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lookupId]);

  const lifecycle = useMemo<LifecycleState>(
    () =>
      lookupId == null
        ? { kind: 'idle' }
        : lookupResult.kind !== 'idle' && lookupResult.id === lookupId
          ? lookupResult
          : { kind: 'loading', id: lookupId },
    [lookupId, lookupResult],
  );

  const lifecycleMode = lifecycle.kind !== 'idle';
  const sourceEntries = lifecycle.kind === 'loaded' ? lifecycle.entries : dayEntries;

// KPIs ALWAYS add up the entire day: filtering the list by an employee does not change how many transitions there were in the shift.
  const metrics = useMemo(() => computeShiftMetrics(dayEntries), [dayEntries]);
  const actors = useMemo(
    () => actorOptions([...dayEntries, ...(lifecycle.kind === 'loaded' ? lifecycle.entries : [])], staffById),
    [dayEntries, lifecycle, staffById],
  );

  const visible = useMemo(
    () => sortHistoryByRecency(sourceEntries.filter((e) => matchesHistoryFilters(e, filters))),
    [sourceEntries, filters],
  );

  const openReservationBook = () => onNavigate?.('reservations');

  // ================= Render =================

  const primaryKpis = [
    {
      id: 'transitions',
      label: 'Status transitions',
      value: metrics.transitions,
      hint: 'logged on this day',
      icon: 'published_with_changes',
      accent: '#ae001a',
    },
    {
      id: 'seated',
      label: 'Seated parties',
      value: metrics.seatedParties,
      hint: 'transitions to Seated',
      icon: 'event_seat',
      accent: RESERVATION_STATUS_COLORS.seated,
    },
    {
      id: 'cancellations',
      label: 'Cancellations & no-shows',
      value: metrics.cancellationsAndNoShows,
      hint: `${metrics.lateChanges} within ${LATE_CHANGE_WINDOW_MINUTES} min of the booking`,
      icon: 'event_busy',
      accent: RESERVATION_STATUS_COLORS.cancelled,
    },
    {
      id: 'automated',
      label: 'System automated actions',
      value: metrics.automatedActions,
      hint: 'changes with no staff member',
      icon: 'smart_toy',
      accent: RESERVATION_STATUS_COLORS.no_show,
    },
  ];

  const durationKpis = [
    {
      id: 'lead',
      label: 'Avg confirmation lead',
      value: formatDuration(metrics.avgConfirmationLeadMs),
      hint: 'pending → confirmed',
    },
    {
      id: 'wait',
      label: 'Avg wait at reception',
      value:
        metrics.avgReceptionWaitMs == null ? '—' : receptionWaitLabel(metrics.avgReceptionWaitMs),
      hint: 'booked time → seated',
    },
    {
      id: 'dining',
      label: 'Avg dining duration',
      value: formatDuration(metrics.avgDiningMs),
      hint: `${metrics.diningOverruns} table${metrics.diningOverruns === 1 ? '' : 's'} over booked time`,
    },
  ];

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => void fetchDay()}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors duration-200"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      {/* ---------- Shift KPI Banner ---------- */}
      <section
        aria-label="Daily status transition metrics"
        data-testid="history-kpis"
        className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#ae001a] text-3xl" aria-hidden="true">
              history
            </span>
            <div>
              <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase">
                Status History
              </h2>
              <p className="text-[#5f5e5e] text-body-sm mt-1">
                Every reservation state change on the shift — who made it, when, and how long
                each booking spent in each state.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="history-day" className="sr-only">
              Day the changes were logged
            </label>
            <input
              id="history-day"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value || todayIsoDate())}
              className={FILTER_CONTROL}
            />
            <button
              type="button"
              onClick={() => setDay(todayIsoDate())}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary hover:border-[#ae001a] transition-colors duration-200"
            >
              Today
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {primaryKpis.map((kpi) => (
            <div
              key={kpi.id}
              data-testid={`kpi-${kpi.id}`}
              className="border border-[#e8e2d8] rounded p-4 flex items-center gap-3 border-l-4 hover:shadow-md transition-colors duration-200"
              style={{ borderLeftColor: kpi.accent }}
            >
              <span
                className="material-symbols-outlined text-3xl shrink-0"
                style={{ color: kpi.accent }}
                aria-hidden="true"
              >
                {kpi.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  {kpi.label}
                </p>
                <p className="text-h2 font-bold text-[#1d1c17] leading-tight">
                  {loading ? '—' : kpi.value}
                </p>
                <p className="text-body-sm text-[#5f5e5e] truncate">{kpi.hint}</p>
              </div>
            </div>
          ))}
        </div>

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 border-t border-[#e8e2d8] pt-4">
          {durationKpis.map((kpi) => (
            <div key={kpi.id} data-testid={`kpi-${kpi.id}`} className="flex flex-col">
              <dt className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                {kpi.label}
              </dt>
              <dd className="text-body-md font-bold text-[#1d1c17]">{loading ? '—' : kpi.value}</dd>
              <dd className="text-body-sm text-[#5f5e5e]">{kpi.hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- Shift Filter Bar ---------- */}
      <section
        aria-label="Status history filters"
        className="bg-white border border-[#e8e2d8] p-5 rounded shadow-sm flex flex-wrap items-end gap-4"
      >
        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              swap_horiz
            </span>
            Status
          </span>
          <select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value as HistoryFilters['status'] })
            }
            className={FILTER_CONTROL}
          >
            <option value="">All statuses</option>
            {RESERVATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {reservationStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              person
            </span>
            Staff
          </span>
          <select
            aria-label="Filter by staff member"
            value={String(filters.actor)}
            onChange={(e) => {
              const raw = e.target.value;
              const actor: ActorFilter =
                raw === 'all' || raw === 'automated' ? raw : Number(raw);
              setFilters({ ...filters, actor });
            }}
            className={FILTER_CONTROL}
          >
            <option value="all">All staff</option>
            {actors.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] grow min-w-[220px]">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              search
            </span>
            Reservation
          </span>
          <input
            type="search"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="#RES-14 — shows its full lifecycle"
            aria-label="Look up a reservation by ID"
            className={FILTER_CONTROL}
          />
        </label>

        {hasActiveHistoryFilters(filters) || lookup ? (
          <button
            type="button"
            onClick={() => {
              setFilters(EMPTY_HISTORY_FILTERS);
              setLookup('');
            }}
            className="px-3 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-wider rounded hover:text-primary hover:border-[#ae001a] transition-colors duration-200"
          >
            Clear
          </button>
        ) : null}
        {lookup.trim() && lookupId == null ? (
          <p className="basis-full text-body-sm text-[#b91c1c]">
            Type a reservation ID such as <span className="font-semibold">#RES-14</span> or{' '}
            <span className="font-semibold">14</span>.
          </p>
        ) : null}
      </section>

      {/* ---------- Lifecycle ---------- */}
      {lifecycle.kind === 'loaded' ? (
        <LifecycleSummary entries={lifecycle.entries} onOpenReservation={openReservationBook} />
      ) : null}

      {/* ---------- Feed ---------- */}
      {loading || lifecycle.kind === 'loading' ? (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[#ece8e0] rounded animate-pulse" />
          ))}
        </div>
      ) : lifecycle.kind === 'not_found' ? (
        <EmptyPanel icon="search_off" testId="lifecycle-not-found">
          No reservation {reservationCode(lifecycle.id)} in this restaurant.
        </EmptyPanel>
      ) : lifecycle.kind === 'error' ? (
        <EmptyPanel icon="error" testId="lifecycle-error">
          {lifecycle.message}
        </EmptyPanel>
      ) : sourceEntries.length === 0 ? (
        <EmptyPanel icon="history" testId="history-empty-state">
          No status changes were logged on this day. Entries appear automatically as bookings
          are confirmed, seated, completed or cancelled.
        </EmptyPanel>
      ) : visible.length === 0 ? (
        <EmptyPanel icon="filter_alt_off" testId="history-no-match">
          No entry matches these filters — {sourceEntries.length}{' '}
          {lifecycleMode ? 'in this reservation' : 'logged on this day'}.
        </EmptyPanel>
      ) : (
        <section
          aria-label="Status history timeline"
          data-testid="history-feed"
          className="bg-white border border-[#e8e2d8] rounded shadow-sm p-5 flex flex-col gap-3"
        >
          <p className="text-body-sm text-[#5f5e5e] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              lock
            </span>
            Read-only audit log — entries are written automatically on every status change and
            cannot be edited or deleted.
          </p>
          <ol className="flex flex-col gap-2">
            {visible.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                staffById={staffById}
                onOpenReservation={openReservationBook}
              />
            ))}
          </ol>
        </section>
      )}

    </div>
  );
};

// ================= Parts =================

const EmptyPanel: React.FC<{ icon: string; testId: string; children: React.ReactNode }> = ({
  icon,
  testId,
  children,
}) => (
  <div
    data-testid={testId}
    className="bg-white border border-[#e8e2d8] p-12 flex flex-col items-center text-center rounded shadow-sm gap-3"
  >
    <span className="material-symbols-outlined text-[#5f5e5e] text-5xl" aria-hidden="true">
      {icon}
    </span>
    <p className="text-sm text-[#5f5e5e] max-w-md leading-relaxed">{children}</p>
  </div>
);

interface EntryRowProps {
  entry: StatusHistoryFeedEntry;
  staffById: StaffIndex;
  onOpenReservation: () => void;
}

const EntryRow: React.FC<EntryRowProps> = ({ entry, staffById, onOpenReservation }) => {
  const late = entryLateChange(entry);
  const duration = entryDuration(entry);
  const delta = timeInPreviousMs(entry);
  const reservation = entry.reservation;
  const durationAlert =
    duration?.kind === 'dining' && (duration.overrunMs ?? 0) >= 60_000;

  return (
    <li
      data-testid={`history-entry-${entry.id}`}
      className={`group rounded border p-3 flex flex-col gap-1.5 hover:shadow-md transition-colors duration-200 ${
        late
          ? 'border-[#ef4444]/40 border-l-4 border-l-[#ef4444] bg-[#ef4444]/5'
          : 'border-[#e8e2d8] border-l-4 hover:border-[#ae001a]/40'
      }`}
      style={late ? undefined : { borderLeftColor: RESERVATION_STATUS_COLORS[entry.status] }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-sans hover:text-primary transition-colors duration-200 ${reservationStatusPillStyle(entry.status)}`}
        >
          {entry.previous_status ? (
            <>
              <span className="opacity-70">{reservationStatusLabel(entry.previous_status)}</span>
              <span className="material-symbols-outlined text-xs" aria-hidden="true">
                arrow_forward
              </span>
            </>
          ) : null}
          {reservationStatusLabel(entry.status)}
        </span>
        <button
          type="button"
          onClick={onOpenReservation}
          title="Open in the reservation book"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-sans bg-[#ece8e0] text-[#1d1c17] hover:text-primary transition-colors duration-200 cursor-pointer"
        >
          {reservationCode(entry.reservation_id)}
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            open_in_new
          </span>
        </button>
        {reservation ? (
          <span className="text-body-sm text-[#5f5e5e]">
            {reservation.guest_name ?? 'Guest'} · booked {clockTime(reservation.reservation_date)}{' '}
            · {reservation.party_size} pax
          </span>
        ) : null}
        {late ? (
          <span
            data-testid={`late-flag-${entry.id}`}
            role="img"
            aria-label={lateChangeLabel(late)}
            title={lateChangeLabel(late)}
            className="inline-flex items-center gap-1 text-[#b91c1c] text-body-sm font-semibold"
          >
            <span className="material-symbols-outlined text-base text-[#ef4444]" aria-hidden="true">
              warning
            </span>
            {lateChangeLabel(late)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-[#5f5e5e]">
        <span className="inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            timeline
          </span>
          {entry.previous_status && delta != null
            ? `after ${formatDuration(delta)} in ${reservationStatusLabel(entry.previous_status)}`
            : 'booking created'}
        </span>
        {duration ? (
          <span
            data-testid={`entry-duration-${entry.id}`}
            className={`inline-flex items-center gap-1 ${durationAlert ? 'text-[#b91c1c] font-semibold' : ''}`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              hourglass_top
            </span>
            {entryDurationLabel(duration)}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 font-sans">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            {entry.changed_by == null ? 'smart_toy' : 'person'}
          </span>
          {actorLabel(entry.changed_by, staffById)}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums font-sans">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            schedule
          </span>
          {auditTimestamp(entry.changed_at)}
        </span>
      </div>
    </li>
  );
};

// Summary of the life cycle of the sought-after reserve: the three durations of the story.
const LifecycleSummary: React.FC<{
  entries: StatusHistoryFeedEntry[];
  onOpenReservation: () => void;
}> = ({ entries, onOpenReservation }) => {
  const reservation = entries.find((e) => e.reservation)?.reservation;
  if (!reservation) return null;

  const durations = computeDurations({
    reservation_date: reservation.reservation_date,
    duration_minutes: reservation.duration_minutes,
    seated_at: reservation.seated_at,
    status_history: entries,
  });
  const overrun = durations.diningOverrunMs;

  const tiles = [
    {
      id: 'lead',
      label: 'Confirmation lead',
      value: formatDuration(durations.confirmationLeadMs),
      detail: 'pending → confirmed',
      alert: false,
    },
    {
      id: 'wait',
      label: 'Wait at reception',
      value: receptionWaitLabel(durations.receptionWaitMs),
      detail: `booked ${clockTime(reservation.reservation_date)} → seated`,
      alert: false,
    },
    {
      id: 'dining',
      label: 'Dining duration',
      value: formatDuration(durations.diningMs),
      detail:
        durations.diningMs == null
          ? `booked ${formatDuration(durations.bookedDiningMs)}`
          : `${diningOverrunLabel(overrun)} · booked ${formatDuration(durations.bookedDiningMs)}`,
      alert: overrun != null && overrun >= 60_000,
    },
  ];

  return (
    <section
      aria-label={`Lifecycle of ${reservationCode(reservation.id)}`}
      data-testid="lifecycle-summary"
      className="bg-white border border-[#e8e2d8] rounded shadow-sm p-5 flex flex-col gap-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenReservation}
          title="Open in the reservation book"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-sans bg-[#ece8e0] text-[#1d1c17] hover:text-primary transition-colors duration-200 cursor-pointer"
        >
          {reservationCode(reservation.id)}
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            open_in_new
          </span>
        </button>
        <span className="font-semibold text-[#1d1c17]">{reservation.guest_name ?? 'Guest'}</span>
        <span className="text-body-sm text-[#5f5e5e]">
          {auditTimestamp(reservation.reservation_date).slice(0, 16)} · {reservation.party_size} pax
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${reservationStatusPillStyle(reservation.status)}`}
        >
          Now: {reservationStatusLabel(reservation.status)}
        </span>
      </header>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.id}
            data-testid={`lifecycle-${tile.id}`}
            className="bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2"
          >
            <dt className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
              {tile.label}
            </dt>
            <dd className="text-body-md font-bold text-[#1d1c17]">{tile.value}</dd>
            <dd className={`text-body-sm ${tile.alert ? 'text-[#b91c1c] font-semibold' : 'text-[#5f5e5e]'}`}>
              {tile.detail}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default ReservationStatusHistoryView;
