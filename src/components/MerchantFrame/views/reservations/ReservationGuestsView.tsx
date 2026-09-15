// Roster de comensales del servicio: quién viene con quién, a quién se llama si se retrasan,
// y qué reservas todavía no tienen apuntado a todo el grupo.
//
// Igual que los otros sub-módulos del épico, se hidrata desde `GET /api/reservation?date=`,
// que ya embebe `guests[]` por reserva. Es la única forma que contiene también las reservas
// con el roster VACÍO — justo las que hay que completar. Para localizar a un cliente que llama
// sin recordar su fecha existe además la búsqueda global contra `/api/reservation-guest`.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomerRef, Reservation, ReservationGuest } from '../../../../types/reservation';
import {
  RESERVATION_STATUS_COLORS,
  reservationStatusLabel,
  reservationStatusPillStyle,
} from '../../../../types/reservation';
import {
  EMPTY_GUEST_FILTERS,
  activeGuests,
  computeGuestMetrics,
  contactCaptureRate,
  guestCode,
  hasActiveGuestFilters,
  mailtoHref,
  matchesGuestFilters,
  primaryGuest,
  primaryHandoverPrompt,
  primaryIntegrity,
  primaryIntegrityMessage,
  rosterCount,
  rosterCountLabel,
  successorPrimary,
  telHref,
  type GuestFilters,
  type GuestWithContext,
} from '../../../../lib/reservation-guests';
import {
  clockTime,
  formatPercent,
  reservationCode,
  todayIsoDate,
} from '../../../../lib/reservations';
import {
  createGuest,
  listCustomers,
  listReservations,
  removeGuest,
  updateGuest,
} from '../../../../api/reservations';
import { ApiError } from '../../../../lib/api-error';
import { Toast, type ToastState } from '../../shared/Toast';
import { ReservationsQuickLinks } from './ReservationsQuickLinks';
import { GuestFormDrawer, type GuestSubmitPayload } from './GuestFormDrawer';

interface ReservationGuestsViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

export const ReservationGuestsView: React.FC<ReservationGuestsViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);

  const [day, setDay] = useState<string>(todayIsoDate());
  const [filters, setFilters] = useState<GuestFilters>(EMPTY_GUEST_FILTERS);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ReservationGuest | null>(null);
  const [presetReservationId, setPresetReservationId] = useState<number | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const [formError, setFormError] = useState('');
  const [busyGuestId, setBusyGuestId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchDay = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { reservations: rows } = await listReservations({ date: day });
      setReservations(rows);
    } catch (err) {
      console.error('Error fetching the guest roster:', err);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load the guest roster. Please check if the backend is running.',
      );
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void fetchDay();
  }, [fetchDay]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listCustomers(merchantId);
        if (!cancelled) setCustomers(rows);
      } catch {
        if (!cancelled) setCustomers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers],
  );

  const bookingNameOf = useCallback(
    (reservation: Reservation): string => {
      if (reservation.customer_id != null) {
        const name = customerNameById.get(reservation.customer_id);
        if (name) return name;
      }
      const primary = primaryGuest(reservation.guests ?? []);
      return primary?.name || reservationCode(reservation.id);
    },
    [customerNameById],
  );

  const metrics = useMemo(() => computeGuestMetrics(reservations), [reservations]);

  // Reservas cuyo roster no cubre el grupo: alimentan el filtro y el aviso.
  const incompleteIds = useMemo(
    () =>
      new Set(
        reservations
          .filter((r) => !rosterCount(r.guests ?? [], r.party_size).complete)
          .map((r) => r.id),
      ),
    [reservations],
  );

  const roster = useMemo<GuestWithContext[]>(() => {
    const rows: GuestWithContext[] = [];
    reservations.forEach((reservation) => {
      activeGuests(reservation.guests ?? []).forEach((guest) => {
        rows.push({
          ...guest,
          reservationLabel: bookingNameOf(reservation),
          reservationDate: reservation.reservation_date,
          partySize: reservation.party_size,
        });
      });
    });
    return rows.sort(
      (a, b) =>
        new Date(a.reservationDate).getTime() - new Date(b.reservationDate).getTime() ||
        Number(b.is_primary) - Number(a.is_primary) ||
        a.id - b.id,
    );
  }, [reservations, bookingNameOf]);

  const visible = useMemo(
    () => roster.filter((g) => matchesGuestFilters(g, filters, incompleteIds)),
    [roster, filters, incompleteIds],
  );

  // Agrupado por reserva: un roster se lee por mesa, no como una lista plana de personas.
  const groups = useMemo(() => {
    const byReservation = new Map<number, GuestWithContext[]>();
    visible.forEach((g) => {
      byReservation.set(g.reservation_id, [...(byReservation.get(g.reservation_id) ?? []), g]);
    });

    return reservations
      .filter((r) => byReservation.has(r.id) || (!hasActiveGuestFilters(filters) && true))
      .map((reservation) => ({
        reservation,
        guests: byReservation.get(reservation.id) ?? [],
      }))
      .filter((group) => group.guests.length > 0 || !hasActiveGuestFilters(filters))
      .sort(
        (a, b) =>
          new Date(a.reservation.reservation_date).getTime() -
          new Date(b.reservation.reservation_date).getTime(),
      );
  }, [visible, reservations, filters]);

  // ================= Escritura =================

  const handleSubmit = async (payload: GuestSubmitPayload) => {
    setSubmitting(true);
    setFormError('');
    try {
      if (editing) {
        await updateGuest(editing.id, {
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          is_primary: payload.isPrimary,
        });
      } else {
        await createGuest({
          reservation_id: payload.reservationId,
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          is_primary: payload.isPrimary,
        });
      }
      await fetchDay();
      setDrawerOpen(false);
      setEditing(null);
      setPresetReservationId(undefined);
      setToast({
        message: editing ? 'Guest updated' : `${payload.name} added to the roster`,
        type: 'success',
      });
    } catch (err) {
      console.error('Error saving the guest:', err);
      setFormError(err instanceof ApiError ? err.message : 'Failed to save the guest.');
    } finally {
      setSubmitting(false);
    }
  };

  // Alta rápida de acompañante genérico sin cerrar el drawer: en el atril se registran tres
  // seguidos y volver a abrir el formulario cada vez cuesta más que la propia alta.
  const handleQuickAdd = async (reservationId: number, name: string) => {
    setQuickAdding(true);
    setFormError('');
    try {
      await createGuest({ reservation_id: reservationId, name });
      await fetchDay();
      setToast({ message: `${name} added`, type: 'success' });
    } catch (err) {
      console.error('Error quick-adding the companion:', err);
      setFormError(err instanceof ApiError ? err.message : 'Failed to add the companion.');
    } finally {
      setQuickAdding(false);
    }
  };

  // Promover: el servidor degrada al anterior en la misma transacción, así que basta un PATCH.
  const handlePromote = async (guest: GuestWithContext) => {
    setBusyGuestId(guest.id);
    try {
      await updateGuest(guest.id, { is_primary: true });
      await fetchDay();
      setToast({ message: `${guest.name} is now the primary contact`, type: 'success' });
    } catch (err) {
      console.error('Error promoting the guest:', err);
      setToast({
        message: err instanceof ApiError ? err.message : 'Failed to set the primary contact.',
        type: 'error',
      });
    } finally {
      setBusyGuestId(null);
    }
  };

  const handleRemove = async (guest: GuestWithContext) => {
    const reservation = reservations.find((r) => r.id === guest.reservation_id);
    // Quitar al contacto principal no se bloquea, pero sí se avisa de quién toma el relevo:
    // el servidor eleva al siguiente y la sala tiene que saber a quién llamará a partir de ya.
    if (guest.is_primary) {
      const successor = successorPrimary(reservation?.guests ?? [], guest.id);
      if (!window.confirm(primaryHandoverPrompt(guest, successor))) return;
    }

    setBusyGuestId(guest.id);
    try {
      await removeGuest(guest.id);
      await fetchDay();
      setToast({ message: `${guest.name} removed from the roster`, type: 'success' });
    } catch (err) {
      console.error('Error removing the guest:', err);
      setToast({
        message: err instanceof ApiError ? err.message : 'Failed to remove the guest.',
        type: 'error',
      });
    } finally {
      setBusyGuestId(null);
    }
  };

  // ================= Render =================

  const captureRate = contactCaptureRate(metrics, reservations.length);

  const kpis = [
    {
      id: 'registered',
      label: 'Total registered guests',
      value: String(metrics.totalRegisteredGuests),
      hint: `across ${reservations.length} booking${reservations.length === 1 ? '' : 's'}`,
      icon: 'group',
      accent: '#ae001a',
    },
    {
      id: 'primary-contacts',
      label: 'Primary contacts captured',
      value: String(metrics.primaryContactsCaptured),
      hint: `${formatPercent(captureRate)} of bookings reachable`,
      icon: 'badge',
      accent: RESERVATION_STATUS_COLORS.confirmed,
    },
    {
      id: 'average-party',
      label: 'Average party composition',
      value: metrics.averagePartyComposition.toFixed(1),
      hint: 'registered guests per booking',
      icon: 'groups',
      accent: RESERVATION_STATUS_COLORS.seated,
    },
  ];

  const openCreate = (reservationId?: number) => {
    setEditing(null);
    setPresetReservationId(reservationId);
    setFormError('');
    setDrawerOpen(true);
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
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase">
            Guest Roster
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Everyone arriving with each party, and who the house calls if they run late.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="guests-day" className="sr-only">
            Service day
          </label>
          <input
            id="guests-day"
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
          <button
            type="button"
            disabled={reservations.length === 0}
            onClick={() => openCreate()}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 flex items-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              person_add
            </span>
            Add Guest
          </button>
        </div>
      </div>

      {/* ---------- KPIs del roster ---------- */}
      <section
        aria-label="Guest roster metrics"
        data-testid="guest-kpis"
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

      {/* ---------- Buscador y filtros ---------- */}
      <section
        aria-label="Guest filters"
        className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3"
      >
        <div className="relative flex-1 min-w-[260px]">
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
            placeholder="Find a guest by name, phone or email…"
            aria-label="Search guests"
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-colors duration-200"
          />
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[#e8e2d8] cursor-pointer hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200">
          <input
            type="checkbox"
            checked={filters.primaryOnly}
            onChange={(e) => setFilters({ ...filters, primaryOnly: e.target.checked })}
            className="accent-[#ae001a] w-3.5 h-3.5"
          />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Primary contacts only
          </span>
        </label>

        <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[#e8e2d8] cursor-pointer hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200">
          <input
            type="checkbox"
            checked={filters.incompleteOnly}
            onChange={(e) => setFilters({ ...filters, incompleteOnly: e.target.checked })}
            className="accent-[#ae001a] w-3.5 h-3.5"
          />
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Incomplete rosters
          </span>
        </label>

        {hasActiveGuestFilters(filters) ? (
          <button
            type="button"
            onClick={() => setFilters(EMPTY_GUEST_FILTERS)}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest rounded hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
          >
            Clear Filters
          </button>
        ) : null}
      </section>

      {/* ---------- Roster por reserva ---------- */}
      {loading ? (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[#ece8e0] rounded animate-pulse" />
          ))}
        </div>
      ) : reservations.length === 0 ? (
        <div
          data-testid="guests-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm gap-3"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            group
          </span>
          <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
            No booking in the book for this service day, so there is no party to register yet.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-[#e8e2d8] p-12 flex flex-col items-center text-center rounded shadow-sm gap-3">
          <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
            search_off
          </span>
          <p className="text-sm text-[#5f5e5e] max-w-md">
            No guest matches these filters — {roster.length} registered on this shift.
          </p>
          <button
            type="button"
            onClick={() => setFilters(EMPTY_GUEST_FILTERS)}
            className="text-[#ae001a] text-sm font-semibold hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <section aria-label="Guest roster" data-testid="guest-roster" className="flex flex-col gap-4">
          {groups.map(({ reservation, guests }) => {
            const count = rosterCount(reservation.guests ?? [], reservation.party_size);
            const integrity = primaryIntegrity(reservation.guests ?? []);
            const integrityWarning = primaryIntegrityMessage(integrity);

            return (
              <article
                key={reservation.id}
                data-testid={`roster-card-${reservation.id}`}
                className="bg-white border border-[#e8e2d8] rounded shadow-sm overflow-hidden border-l-4 hover:shadow-md transition-colors duration-200"
                style={{ borderLeftColor: RESERVATION_STATUS_COLORS[reservation.status] }}
              >
                <header className="p-4 flex flex-wrap items-center gap-3 border-b border-[#f2ede5]">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ece8e0] text-[#5f5e5e]">
                    {reservationCode(reservation.id)}
                  </span>
                  {/* La cabecera ya lleva el código como badge: repetirlo cuando no hay
                      nombre que mostrar ("#RES-16  #RES-16") no añade nada. */}
                  {bookingNameOf(reservation) !== reservationCode(reservation.id) ? (
                    <span className="font-semibold text-[#1d1c17]">
                      {bookingNameOf(reservation)}
                    </span>
                  ) : (
                    <span className="text-body-sm text-[#5f5e5e] italic">Unnamed booking</span>
                  )}
                  <span className="text-body-sm text-[#5f5e5e]">
                    {clockTime(reservation.reservation_date)}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${reservationStatusPillStyle(reservation.status)}`}
                  >
                    {reservationStatusLabel(reservation.status)}
                  </span>

                  {/* Contador de roster frente al tamaño del grupo. */}
                  <span
                    data-testid={`roster-count-${reservation.id}`}
                    className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      count.complete
                        ? 'bg-[#10b981]/15 text-[#047857]'
                        : 'bg-[#f59e0b]/15 text-[#92400e]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      {count.complete ? 'how_to_reg' : 'group_add'}
                    </span>
                    {rosterCountLabel(count)}
                  </span>

                  <button
                    type="button"
                    onClick={() => openCreate(reservation.id)}
                    className="px-3 py-1.5 rounded border border-[#e8e2d8] text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      person_add
                    </span>
                    Add
                  </button>
                </header>

                {integrityWarning ? (
                  <p
                    data-testid={`primary-warning-${reservation.id}`}
                    role="alert"
                    className="px-4 py-2 bg-[#f59e0b]/10 text-[#92400e] text-body-sm flex items-center gap-2 border-b border-[#f59e0b]/30"
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      warning
                    </span>
                    {integrityWarning}
                  </p>
                ) : null}

                {guests.length === 0 ? (
                  <p className="px-4 py-6 text-body-sm text-[#5f5e5e] text-center">
                    Nobody registered on this booking yet — {count.partySize} guest
                    {count.partySize === 1 ? '' : 's'} expected.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#f2ede5]">
                    {guests.map((guest) => {
                      const tel = telHref(guest.phone);
                      const mail = mailtoHref(guest.email);
                      const busy = busyGuestId === guest.id;

                      return (
                        <li
                          key={guest.id}
                          data-testid={`guest-row-${guest.id}`}
                          className="group px-4 py-3 flex flex-wrap items-center gap-3 hover:bg-[#f8f3eb] transition-colors duration-200"
                        >
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ece8e0] text-[#5f5e5e]">
                            {guestCode(guest.id)}
                          </span>
                          <span className="font-semibold text-[#1d1c17] group-hover:text-[#ae001a] transition-colors duration-200">
                            {guest.name}
                          </span>

                          {guest.is_primary ? (
                            <span
                              data-testid={`primary-badge-${guest.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ae001a] text-white"
                            >
                              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                star
                              </span>
                              Primary contact
                            </span>
                          ) : null}

                          {/* Contacto directo: pulsar marca o abre el correo. */}
                          <span className="flex flex-wrap items-center gap-3 text-body-sm">
                            {tel ? (
                              <a
                                href={tel}
                                className="inline-flex items-center gap-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">
                                  phone
                                </span>
                                {guest.phone}
                              </a>
                            ) : null}
                            {mail ? (
                              <a
                                href={mail}
                                className="inline-flex items-center gap-1 text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">
                                  mail
                                </span>
                                {guest.email}
                              </a>
                            ) : null}
                            {!tel && !mail ? (
                              <span className="text-[#5f5e5e]/70 italic">No contact details</span>
                            ) : null}
                          </span>

                          <span className="ml-auto flex items-center gap-1">
                            {!guest.is_primary ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handlePromote(guest)}
                                className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 cursor-pointer"
                              >
                                Make primary
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(guest);
                                setFormError('');
                                setDrawerOpen(true);
                              }}
                              className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRemove(guest)}
                              className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 cursor-pointer"
                            >
                              {busy ? '…' : 'Remove'}
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </section>
      )}

      {drawerOpen ? (
        <GuestFormDrawer
          reservations={reservations}
          initial={editing ?? undefined}
          initialReservationId={presetReservationId}
          guestNameOf={bookingNameOf}
          submitting={submitting}
          formError={formError}
          quickAdding={quickAdding}
          onQuickAdd={(reservationId, name) => void handleQuickAdd(reservationId, name)}
          onCancel={() => {
            setDrawerOpen(false);
            setEditing(null);
            setPresetReservationId(undefined);
          }}
          onSubmit={(payload) => void handleSubmit(payload)}
        />
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
      {/* Panel de accesos rápidos estándar (QuickLaunchPanel), como el resto de módulos. */}
      <div>
        <ReservationsQuickLinks current="reservation-guests" onNavigate={onNavigate} />
      </div>

    </div>
  );
};

export default ReservationGuestsView;
