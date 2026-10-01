// Daily reservation book: the KPI strip, filters, hourly grid, and the
// lifecycle controller.

// The day is filtered on the SERVER (`?date=`, which resolves a semi-open range on the composite index
// [merchant_id, reservation_date]); status, channel, and text are filtered on the client,
// because the checkbox group is multi-select and the query DTO only accepts a single status.
// For the 100 reservations that can be requested at once, filtering in memory is immediate.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CustomerRef,
  Reservation,
  ReservationStatus,
} from '../../../../types/reservation';
import {
  RESERVATION_SOURCES,
  RESERVATION_SOURCE_LABELS,
  RESERVATION_STATUSES,
  RESERVATION_STATUS_COLORS,
  RESERVATION_STATUS_LABELS,
  reservationSourceIcon,
  reservationSourceLabel,
  reservationStatusLabel,
  reservationStatusPillStyle,
} from '../../../../types/reservation';
import {
  EMPTY_FILTERS,
  allowedTransitions,
  clockTime,
  computeDailyMetrics,
  formatBookingWindow,
  formatPercent,
  hasActiveFilters,
  hourSlotLabel,
  isNoShowCandidate,
  isTerminalStatus,
  matchesReservationFilters,
  reservationCode,
  reservationHour,
  todayIsoDate,
  toggleInList,
  type ReservationFilters,
} from '../../../../lib/reservations';
import {
  cancelReservation,
  createCustomer,
  createReservation,
  createReservationGuest,
  listCustomers,
  listReservations,
  updateReservation,
} from '../../../../api/reservations';
import { ApiError } from '../../../../lib/api-error';
import { Toast, type ToastState } from '../../shared/Toast';
import { ManagerOverrideDialog } from './ManagerOverrideDialog';
import { CapacitySettingsDrawer } from './CapacitySettingsDrawer';
import {
  isCapacityOverrideError,
  type ManagerOverride,
} from '../../../../lib/reservation-capacity';
import { getStoredUser } from '../../../../lib/auth-storage';
import {
  ReservationFormDrawer,
  type ReservationSubmitPayload,
} from './ReservationFormDrawer';

interface ReservationsViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

// Strip painted by the grill. Outside of it the place is not served, but a late reservation
// (a business breakfast) is NOT hidden: it is grouped in its own time at the beginning or end.
const SERVICE_START_HOUR = 11;
const SERVICE_END_HOUR = 23;
// `onNavigate` remains in the props (MerchantFrame passes it to all views), but the
// navigation between sub-modules is already done by the module's NavHubBar, set up by MerchantFrame.
export const ReservationsView: React.FC<ReservationsViewProps> = ({ merchantId }) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [customersError, setCustomersError] = useState('');

  const [day, setDay] = useState<string>(todayIsoDate());
  const [filters, setFilters] = useState<ReservationFilters>(EMPTY_FILTERS);
  const [layout, setLayout] = useState<'timeline' | 'list'>('timeline');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [transitioningId, setTransitioningId] = useState<number | null>(null);
  // Last 409 of capacity from the booking, tied to the slot that caused it (date|group|duration): if
  // the hostess chooses another slot, the alert stops applying only.
  const [capacityConflict, setCapacityConflict] = useState<{ key: string; message: string } | null>(
    null,
  );
  // Transition (confirm) rejected by capacity, waiting for the manager's override.
  const [overridePrompt, setOverridePrompt] = useState<{
    reservation: Reservation;
    next: ReservationStatus;
    message: string;
  } | null>(null);
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError, setOverrideError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Only the manager can edit capacity and shifts (the backend requires this as well with a 403).
  const canManageCapacity = getStoredUser()?.role === 'merchant_admin';
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { reservations: rows } = await listReservations({ date: day });
      setReservations(rows);
    } catch (err) {
      console.error('Error fetching reservations:', err);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load the reservation book. Please check if the backend is running.',
      );
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetchReservations();
    });
  }, [fetchReservations]);

  // Support catalogs for the drawer. Fail separately and silently: without customers the booking
  // remains possible as a guest, and without tables only the capacity warning is lost.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const rows = await listCustomers(merchantId);
        if (!cancelled) {
          setCustomers(rows);
          setCustomersError('');
        }
      } catch (err) {
        console.error('Error fetching customers:', err);
        if (!cancelled) {
          setCustomers([]);
          setCustomersError(
            'The customer directory is unavailable — you can still book the table as a guest.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  const customerNameById = useMemo(() => {
    const map = new Map<number, string>();
    customers.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [customers]);

  // Name to display on the card: the CRM profile if the reservation links to it, the primary
  // contact from the roster if not, and the reservation code as a last resort.
  const bookingName = useCallback(
    (reservation: Reservation): string => {
      if (reservation.customer_id != null) {
        const name = customerNameById.get(reservation.customer_id);
        if (name) return name;
      }
      const guests = reservation.guests ?? [];
      const primary = guests.find((g) => g.is_primary) ?? guests[0];
      if (primary?.name) return primary.name;
      return reservation.customer_id != null
        ? `Customer #${reservation.customer_id}`
        : reservationCode(reservation.id);
    },
    [customerNameById],
  );

// KPIs are calculated based on the ENTIRE DAY, not on filtered data: if they measured only what's visible,
// checking a box would change the service's no-show rate, which is a daily metric.
  const metrics = useMemo(() => computeDailyMetrics(reservations), [reservations]);

  const visible = useMemo(
    () =>
      reservations.filter((r) =>
        matchesReservationFilters(r, filters, customerNameById.get(r.customer_id ?? -1)),
      ),
    [reservations, filters, customerNameById],
  );

// Grouping by start time for the grill. Only the hours of service are painted 
// those that have reserves outside that range.
  const slots = useMemo(() => {
    const byHour = new Map<number, Reservation[]>();
    visible.forEach((r) => {
      const hour = reservationHour(r);
      if (hour < 0) return;
      byHour.set(hour, [...(byHour.get(hour) ?? []), r]);
    });

    const hours = new Set<number>();
    for (let h = SERVICE_START_HOUR; h <= SERVICE_END_HOUR; h += 1) hours.add(h);
    byHour.forEach((_, hour) => hours.add(hour));

    return [...hours]
      .sort((a, b) => a - b)
      .map((hour) => ({
        hour,
        bookings: (byHour.get(hour) ?? []).sort(
          (a, b) =>
            new Date(a.reservation_date).getTime() - new Date(b.reservation_date).getTime(),
        ),
      }));
  }, [visible]);

  const orderedList = useMemo(
    () =>
      [...visible].sort(
        (a, b) =>
          new Date(a.reservation_date).getTime() - new Date(b.reservation_date).getTime(),
      ),
    [visible],
  );

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  // ================= Life cycle =================

// The list of legal destinations falls outside the graph, so the UI cannot offer a hop that
// the backend will reject. `seated_at` is NOT sent: it is sealed by the server upon entering
  // SEATED, that is what guarantees a reliable arrival time with multiple tablets in the room.
  const applyTransition = async (reservation: Reservation, next: ReservationStatus) => {
    setTransitioningId(reservation.id);
    try {
      const updated =
        next === 'cancelled'
          ? await cancelReservation(reservation.id)
          : await updateReservation(reservation.id, { status: next });

      setReservations((prev) =>
        prev.map((r) => (r.id === reservation.id ? { ...r, ...updated } : r)),
      );
      setToast({
        message: `${reservationCode(reservation.id)} → ${RESERVATION_STATUS_LABELS[next]}`,
        type: 'success',
      });
    } catch (err) {
      // Confirming on a full strip: it's not a failure, it's override time.
      if (isCapacityOverrideError(err)) {
        setOverrideError('');
        setOverridePrompt({ reservation, next, message: err.message });
        return;
      }
      console.error('Error transitioning reservation:', err);
      setToast({
        message:
          err instanceof ApiError ? err.message : 'Failed to update the reservation status.',
        type: 'error',
      });
    } finally {
      setTransitioningId(null);
    }
  };

  const retryTransitionWithOverride = async (override: ManagerOverride) => {
    if (!overridePrompt) return;
    const { reservation, next } = overridePrompt;
    setOverrideSubmitting(true);
    setOverrideError('');
    try {
      const updated = await updateReservation(reservation.id, {
        status: next,
        manager_override: override,
      });
      setReservations((prev) =>
        prev.map((r) => (r.id === reservation.id ? { ...r, ...updated } : r)),
      );
      setOverridePrompt(null);
      setToast({
        message: `${reservationCode(reservation.id)} → ${RESERVATION_STATUS_LABELS[next]} (manager override)`,
        type: 'success',
      });
    } catch (err) {
      setOverrideError(
        err instanceof ApiError ? err.message : 'The manager override could not be applied.',
      );
    } finally {
      setOverrideSubmitting(false);
    }
  };

  // ================= Alta =================

  const handleCreate = async (payload: ReservationSubmitPayload) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const draft = { ...payload.draft };

// The CRM record is created BEFORE the booking: without its ID there's nothing to link, and if
// the CRM fails, it's best not to leave an orphaned booking half-linked.
      if (payload.newCustomer) {
        const created = await createCustomer(payload.newCustomer);
        draft.customer_id = created.id;
        setCustomers((prev) => [...prev, created]);
      }

      const reservation = await createReservation(draft);

      // The light contact is attached after the reservation is created. If this call fails,
      // the reservation EXISTS: a warning is shown instead of simulating a total error.
      if (payload.guest) {
        try {
          await createReservationGuest({
            reservation_id: reservation.id,
            name: payload.guest.name,
            email: payload.guest.email,
            phone: payload.guest.phone,
            is_primary: true,
          });
        } catch (guestErr) {
          console.error('Error attaching the guest contact:', guestErr);
          setToast({
            message: `${reservationCode(reservation.id)} was booked, but the guest contact could not be saved. Add it from the Guests workspace.`,
            type: 'error',
          });
        }
      }

      await fetchReservations();
      setFormOpen(false);
      setCapacityConflict(null);
      setToast({
        message: `${reservationCode(reservation.id)} booked for ${clockTime(reservation.reservation_date)}${
          reservation.capacity_override_by != null ? ' (manager override)' : ''
        }`,
        type: 'success',
      });
    } catch (err) {
// Full bar on save: the drawer then requests the administrator's override for ESA
// bar, instead of displaying a dead-end error.
      if (isCapacityOverrideError(err)) {
        const { draft } = payload;
        setCapacityConflict({
          key: `${draft.reservation_date}|${draft.party_size}|${draft.duration_minutes}`,
          message: err.message,
        });
        setFormError('');
        return;
      }
      console.error('Error creating the reservation:', err);
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to create the reservation.',
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  // ================= Render =================

  const isTrueEmpty = !loading && !error && reservations.length === 0;
  const isFilteredEmpty = !loading && reservations.length > 0 && visible.length === 0;

  const kpis = [
    {
      id: 'expected',
      label: 'Total expected guests',
      value: String(metrics.totalExpectedGuests),
      hint: `${metrics.totalReservations} bookings today`,
      icon: 'group',
      accent: '#ae001a',
    },
    {
      id: 'covered',
      label: 'Covered / seated guests',
      value: String(metrics.coveredGuests),
      hint: `${formatPercent(metrics.occupancyRate)} of expected covers`,
      icon: 'event_seat',
      accent: RESERVATION_STATUS_COLORS.seated,
    },
    {
      id: 'pending',
      label: 'Pending confirmations',
      value: String(metrics.pendingConfirmations),
      hint: 'Awaiting guest or host confirmation',
      icon: 'pending_actions',
      accent: RESERVATION_STATUS_COLORS.pending,
    },
    {
      id: 'no-show',
      label: 'No-show rate',
      value: formatPercent(metrics.noShowRate),
      hint: `${metrics.noShowCount} of ${metrics.totalReservations} bookings`,
      icon: 'person_off',
      accent: RESERVATION_STATUS_COLORS.no_show,
    },
  ];

  const renderBookingCard = (reservation: Reservation) => {
    const transitions = allowedTransitions(reservation.status);
    const busy = transitioningId === reservation.id;
    const lateArrival = isNoShowCandidate(reservation);

    return (
      <article
        key={reservation.id}
        data-testid={`booking-card-${reservation.id}`}
        className="group bg-white border border-[#e8e2d8] rounded shadow-sm p-4 flex flex-col gap-3 hover:border-[#ae001a] hover:shadow-md transition-colors duration-200 border-l-4"
        style={{ borderLeftColor: RESERVATION_STATUS_COLORS[reservation.status] }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-sans font-semibold text-[#1d1c17] truncate group-hover:text-[#ae001a] transition-colors duration-200">
              {bookingName(reservation)}
            </p>
            <p className="font-sans text-body-sm text-[#5f5e5e]">
              {reservationCode(reservation.id)} · {formatBookingWindow(reservation)}
            </p>
          </div>
          <span
            className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-sans ${reservationStatusPillStyle(reservation.status)}`}
          >
            {reservationStatusLabel(reservation.status)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-sans text-body-sm text-[#5f5e5e]">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#f8f3eb] rounded">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              group
            </span>
            {reservation.party_size} {reservation.party_size === 1 ? 'guest' : 'guests'}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#f8f3eb] rounded">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              schedule
            </span>
            {reservation.duration_minutes} min
          </span>
          <span
            className="inline-flex items-center gap-1 px-2 py-1 bg-[#f8f3eb] rounded"
            title={`Booked via ${reservationSourceLabel(reservation.source)}`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {reservationSourceIcon(reservation.source)}
            </span>
            {reservationSourceLabel(reservation.source)}
          </span>
          {reservation.seated_at ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#10b981]/10 text-[#047857] rounded">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                check_circle
              </span>
              Seated {clockTime(reservation.seated_at)}
            </span>
          ) : null}
          {lateArrival ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 bg-[#8b5cf6]/10 text-[#6d28d9] rounded"
              title="Past the 15-minute grace period"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                hourglass_bottom
              </span>
              Overdue
            </span>
          ) : null}
        </div>

        {/* Special request notice: high contrast, because that's what gets forgotten in the pass. */}
        {reservation.special_requests?.trim() ? (
          <p
            data-testid={`special-requests-${reservation.id}`}
            className="flex items-start gap-2 p-2 rounded bg-[#ae001a]/10 border border-[#ae001a]/30 text-[#ae001a] font-sans text-body-sm"
          >
            <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">
              priority_high
            </span>
            <span className="font-medium">{reservation.special_requests}</span>
          </p>
        ) : null}

        {/* Lifecycle controller: only the destinations that the graph allows. */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#f2ede5]">
          {isTerminalStatus(reservation.status) ? (
            <span className="font-sans text-body-sm text-[#5f5e5e] italic">
              Lifecycle closed — {reservationStatusLabel(reservation.status)} is a final state.
            </span>
          ) : (
            transitions.map((next) => (
              <button
                key={next}
                type="button"
                disabled={busy}
                onClick={() => void applyTransition(reservation, next)}
                className="px-3 py-1.5 rounded border border-[#e8e2d8] bg-white font-sans text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 disabled:opacity-50 cursor-pointer"
              >
                {busy ? '…' : RESERVATION_STATUS_LABELS[next]}
              </button>
            ))
          )}
        </div>
      </article>
    );
  };

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={() => void fetchReservations()}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors duration-200"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase">
            Reservation Book
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Daily schedule, guest volume and booking lifecycle for the selected service.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="res-day" className="sr-only">
            Service day
          </label>
          <input
            id="res-day"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value || todayIsoDate())}
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          />
          <button
            type="button"
            onClick={() => setDay(todayIsoDate())}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
          >
            Today
          </button>
          {canManageCapacity ? (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-primary hover:border-[#ae001a] transition-colors duration-200 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                schedule
              </span>
              Capacity &amp; Shifts
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setCapacityConflict(null);
              setFormOpen(true);
            }}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              event_seat
            </span>
            New Reservation
          </button>
        </div>
      </div>

      {/* ---------- Daily KPI strip ---------- */}
      <section
        aria-label="Daily reservation metrics"
        data-testid="reservation-kpis"
        className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-4"
      >
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            data-testid={`kpi-${kpi.id}`}
            className="bg-white border border-[#e8e2d8] rounded shadow-sm p-5 flex items-center gap-4 border-l-4 hover:shadow-md transition-colors duration-200"
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
      </section>

      {/* ---------- Filter motor ---------- */}
      <section
        aria-label="Reservation filters"
        className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <span
              className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]"
              aria-hidden="true"
            >
              search
            </span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search by customer, phone, email or special request…"
              aria-label="Search reservations"
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-colors duration-200"
            />
          </div>

          <div className="flex items-center gap-1 border border-[#e8e2d8] rounded p-1">
            {(
              [
                { id: 'timeline', label: 'Timeline', icon: 'calendar_view_day' },
                { id: 'list', label: 'List', icon: 'view_list' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={layout === option.id}
                onClick={() => setLayout(option.id)}
                className={`px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors duration-200 cursor-pointer ${
                  layout === option.id
                    ? 'bg-[#ae001a] text-white'
                    : 'text-[#5f5e5e] hover:text-[#ae001a]'
                }`}
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  {option.icon}
                </span>
                {option.label}
              </button>
            ))}
          </div>

          {hasActiveFilters(filters) ? (
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
            >
              Clear Filters
            </button>
          ) : null}
        </div>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filter by status</legend>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mr-1">
            Status
          </span>
          {RESERVATION_STATUSES.map((status) => {
            const checked = filters.statuses.includes(status);
            return (
              <label
                key={status}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors duration-200 ${
                  checked
                    ? reservationStatusPillStyle(status)
                    : 'bg-white text-[#5f5e5e] border border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setFilters({ ...filters, statuses: toggleInList(filters.statuses, status) })
                  }
                  className="accent-[#ae001a] w-3 h-3"
                />
                {RESERVATION_STATUS_LABELS[status]}
              </label>
            );
          })}
        </fieldset>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filter by booking source</legend>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mr-1">
            Source
          </span>
          {RESERVATION_SOURCES.map((src) => {
            const checked = filters.sources.includes(src);
            return (
              <label
                key={src}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider cursor-pointer border transition-colors duration-200 ${
                  checked
                    ? 'bg-[#ae001a] text-white border-[#ae001a]'
                    : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setFilters({ ...filters, sources: toggleInList(filters.sources, src) })
                  }
                  className="accent-[#ae001a] w-3 h-3"
                />
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  {reservationSourceIcon(src)}
                </span>
                {RESERVATION_SOURCE_LABELS[src]}
              </label>
            );
          })}
        </fieldset>
      </section>

      {/* ---------- Grill / list ---------- */}
      {loading ? (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-[#ece8e0] rounded animate-pulse" />
          ))}
        </div>
      ) : isTrueEmpty ? (
        <div
          data-testid="reservations-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            calendar_today
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No bookings in the book for this service day. Take the first one over the phone or
            walk the guest straight in.
          </p>
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setFormOpen(true);
            }}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              event_seat
            </span>
            New Reservation
          </button>
        </div>
      ) : isFilteredEmpty ? (
        <div className="bg-white border border-[#e8e2d8] p-12 flex flex-col items-center text-center rounded shadow-sm gap-3">
          <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
            search_off
          </span>
          <p className="text-sm text-[#5f5e5e] max-w-md">
            No bookings match your active filters — {reservations.length} in the book for this
            day.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="text-[#ae001a] text-sm font-semibold hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : layout === 'timeline' ? (
        <section
          aria-label="Daily reservation timeline"
          data-testid="reservation-timeline"
          className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden"
        >
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              Daily Schedule
            </span>
            <span className="text-white/50 text-xs">
              {visible.length} {visible.length === 1 ? 'booking' : 'bookings'}
            </span>
          </div>
          <div className="divide-y divide-[#e8e2d8]">
            {slots.map((slot) => (
              <div key={slot.hour} className="flex gap-4 p-4">
                <div className="w-24 shrink-0 pt-1">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    {hourSlotLabel(slot.hour)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  {slot.bookings.length === 0 ? (
                    <p className="text-body-sm text-[#5f5e5e]/60 italic pt-1">Open slot</p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
                      {slot.bookings.map(renderBookingCard)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section
          aria-label="Reservation list"
          data-testid="reservation-list"
          className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4"
        >
          {orderedList.map(renderBookingCard)}
        </section>
      )}

      {formOpen ? (
        <ReservationFormDrawer
          customers={customers}
          customersError={customersError}
          capacityConflict={capacityConflict}
          defaultDate={day}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => {
            setFormOpen(false);
            setCapacityConflict(null);
          }}
          onSubmit={(payload) => void handleCreate(payload)}
        />
      ) : null}

      {overridePrompt ? (
        <ManagerOverrideDialog
          title={`Confirm ${reservationCode(overridePrompt.reservation.id)} over capacity`}
          reason={overridePrompt.message}
          submitLabel={`Authorize & ${RESERVATION_STATUS_LABELS[overridePrompt.next].toLowerCase()}`}
          submitting={overrideSubmitting}
          error={overrideError}
          onCancel={() => setOverridePrompt(null)}
          onSubmit={(override) => void retryTransitionWithOverride(override)}
        />
      ) : null}

      {settingsOpen ? (
        <CapacitySettingsDrawer
          onCancel={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            setToast({ message: 'Capacity & shift settings saved', type: 'success' });
          }}
        />
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />

    </div>
  );
};

export default ReservationsView;
