// Tablero de asignación de mesas del servicio.
//
// Se hidrata con DOS llamadas y no con el listado de `/api/reservation-table`: el día de
// reservas (`/api/reservation?date=`) ya embebe los enlaces de mesa de cada reserva, y
// `/api/tables` da el inventario con número, aforo y zona. Con eso el tablero puede pintar
// también las reservas SIN mesa — que son justo las que hay que resolver, y que un listado de
// asignaciones, por definición, no contiene.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiningTable } from '../../../../types/dining-system';
import type { CustomerRef, Reservation } from '../../../../types/reservation';
import {
  RESERVATION_STATUS_COLORS,
  reservationStatusLabel,
  reservationStatusPillStyle,
} from '../../../../types/reservation';
import {
  activeLinks,
  assignedCapacity,
  assignmentLabel,
  computeSeatingMetrics,
  holdsItsTable,
  isUnassigned,
  needsTable,
  reservationInZone,
  zoneOptions,
} from '../../../../lib/reservation-tables';
import {
  clockTime,
  formatBookingWindow,
  reservationCode,
  todayIsoDate,
} from '../../../../lib/reservations';
import {
  assignTables,
  listCustomers,
  listReservations,
  listTablesForCapacity,
  unassignTable,
} from '../../../../api/reservations';
import { ApiError } from '../../../../lib/api-error';
import { Toast, type ToastState } from '../../shared/Toast';
import { ReservationsQuickLinks } from './ReservationsQuickLinks';
import { TablePickerDrawer } from './TablePickerDrawer';

interface ReservationTablesViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

// `/api/tables` devuelve el inventario completo; el tablero necesita número, aforo y zona.
type FloorTable = DiningTable;

export const ReservationTablesView: React.FC<ReservationTablesViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<FloorTable[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);

  const [day, setDay] = useState<string>(todayIsoDate());
  const [zoneFilter, setZoneFilter] = useState<number | null | 'all'>('all');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState<Reservation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [releasingKey, setReleasingKey] = useState<string | null>(null);
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
      console.error('Error fetching the reservation book:', err);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load the seating board. Please check if the backend is running.',
      );
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetchDay();
    });
  }, [fetchDay]);

  // Inventario y CRM: fallan por separado y en silencio. Sin inventario no hay tablero, pero
  // sin nombres de cliente el tablero sigue siendo utilizable con el código de reserva.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const rows = (await listTablesForCapacity()) as unknown as FloorTable[];
        if (!cancelled) setTables(rows);
      } catch (err) {
        console.error('Error fetching the table inventory:', err);
        if (!cancelled) setTables([]);
      }
    })();

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

  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);
  const customerNameById = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers],
  );

  const guestNameOf = useCallback(
    (reservation: Reservation): string => {
      if (reservation.customer_id != null) {
        const name = customerNameById.get(reservation.customer_id);
        if (name) return name;
      }
      const guests = reservation.guests ?? [];
      const primary = guests.find((g) => g.is_primary) ?? guests[0];
      return primary?.name || reservationCode(reservation.id);
    },
    [customerNameById],
  );

  const metrics = useMemo(
    () => computeSeatingMetrics(reservations, tables),
    [reservations, tables],
  );

  const zones = useMemo(() => zoneOptions(tables), [tables]);

  // Sólo entran al tablero las reservas que todavía retienen (o necesitan) una mesa: una
  // anulada no ocupa sitio y llenaría la parrilla de ruido.
  const seatable = useMemo(
    () => reservations.filter((r) => holdsItsTable(r)),
    [reservations],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return seatable
      .filter((r) => (unassignedOnly ? isUnassigned(r) : true))
      .filter((r) => {
        if (zoneFilter === 'all') return true;
        // Con un filtro de zona activo, una reserva sin mesa no pertenece a ninguna: se
        // muestra igualmente cuando además se pide "sólo sin asignar", que es el flujo real
        // de "enséñame lo que falta por sentar en la terraza".
        if (isUnassigned(r)) return unassignedOnly;
        return reservationInZone(r, zoneFilter, tableById);
      })
      .filter((r) =>
        term
          ? [guestNameOf(r), reservationCode(r.id), assignmentLabel(r, tableById)]
              .join(' ')
              .toLowerCase()
              .includes(term)
          : true,
      )
      .sort(
        (a, b) =>
          new Date(a.reservation_date).getTime() - new Date(b.reservation_date).getTime(),
      );
  }, [seatable, unassignedOnly, zoneFilter, tableById, search, guestNameOf]);

  const unassignedList = useMemo(() => seatable.filter(needsTable), [seatable]);

  // ================= Escritura =================

  const handleAssign = async (tableIds: number[]) => {
    if (!picking) return;
    const current = activeLinks(picking).map((l) => l.table_id);
    const toAdd = tableIds.filter((id) => !current.includes(id));
    const toRemove = current.filter((id) => !tableIds.includes(id));

    setSubmitting(true);
    setFormError('');
    try {
      // Las bajas van primero: liberar antes de ocupar evita que una reasignación dentro de la
      // misma reserva choque consigo misma en la guarda de solape del servidor.
      for (const tableId of toRemove) {
        await unassignTable(picking.id, tableId);
      }
      if (toAdd.length > 0) {
        await assignTables(picking.id, toAdd);
      }

      await fetchDay();
      setPicking(null);
      setToast({
        message:
          tableIds.length === 0
            ? `${reservationCode(picking.id)} left without a table`
            : `${reservationCode(picking.id)} → ${tableIds.length} table(s) assigned`,
        type: 'success',
      });
    } catch (err) {
      console.error('Error assigning tables:', err);
      // El 409 del backend trae el nombre de la mesa y la reserva que la retiene: se enseña
      // tal cual, que es más útil que un "no se pudo guardar".
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to save the table assignment.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async (reservation: Reservation, tableId: number) => {
    const key = `${reservation.id}:${tableId}`;
    setReleasingKey(key);
    try {
      await unassignTable(reservation.id, tableId);
      await fetchDay();
      setToast({
        message: `Table #${tableById.get(tableId)?.number ?? tableId} released`,
        type: 'success',
      });
    } catch (err) {
      console.error('Error releasing the table:', err);
      setToast({
        message: err instanceof ApiError ? err.message : 'Failed to release the table.',
        type: 'error',
      });
    } finally {
      setReleasingKey(null);
    }
  };

  // ================= Render =================

  const kpis = [
    {
      id: 'tables-assigned',
      label: 'Tables assigned',
      value: String(metrics.totalTablesAssigned),
      hint: `${tables.length} tables on the floor`,
      icon: 'table_restaurant',
      accent: '#ae001a',
    },
    {
      id: 'assigned-seats',
      label: 'Assigned seat capacity',
      value: String(metrics.assignedSeatCapacity),
      hint: `of ${metrics.floorSeatCapacity} seats in the room`,
      icon: 'event_seat',
      accent: RESERVATION_STATUS_COLORS.seated,
    },
    {
      id: 'unassigned',
      label: 'Bookings without a table',
      value: String(metrics.unassignedBookings),
      hint: `${metrics.unassignedGuests} guests still to seat`,
      icon: 'warning',
      accent: metrics.unassignedBookings > 0 ? '#f59e0b' : '#64748b',
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
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-h3 tracking-wider uppercase">
            Table Assignments
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Which physical tables each booking sits at, and what is still waiting for one.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="tables-day" className="sr-only">
            Service day
          </label>
          <input
            id="tables-day"
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
        </div>
      </div>

      {/* ---------- Ocupación del salón ---------- */}
      <section
        aria-label="Seating occupancy metrics"
        data-testid="seating-kpis"
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

      {/* ---------- Alerta de reservas sin mesa ---------- */}
      {!loading && unassignedList.length > 0 ? (
        <div
          data-testid="unassigned-alert"
          role="alert"
          className="border border-[#f59e0b]/50 bg-[#f59e0b]/10 rounded p-4 flex flex-wrap items-center gap-3"
        >
          <span className="material-symbols-outlined text-[#b45309]" aria-hidden="true">
            warning
          </span>
          <p className="text-body-md text-[#92400e] font-medium flex-1 min-w-[240px]">
            {unassignedList.length} upcoming booking{unassignedList.length === 1 ? '' : 's'} (
            {metrics.unassignedGuests} guests) still {unassignedList.length === 1 ? 'has' : 'have'}{' '}
            no table.
          </p>
          <button
            type="button"
            onClick={() => setUnassignedOnly(true)}
            className="px-4 py-2 bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest rounded hover:bg-[#930015] transition-colors duration-200"
          >
            Show them
          </button>
        </div>
      ) : null}

      {/* ---------- Filtros ---------- */}
      <section
        aria-label="Table assignment filters"
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by guest, reservation or table…"
              aria-label="Search table assignments"
              className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-colors duration-200"
            />
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-2 rounded border border-[#e8e2d8] cursor-pointer hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200">
            <input
              type="checkbox"
              checked={unassignedOnly}
              onChange={(e) => setUnassignedOnly(e.target.checked)}
              className="accent-[#ae001a] w-3.5 h-3.5"
            />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Unassigned only
            </span>
          </label>
        </div>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filter by floor zone</legend>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mr-1">
            Zone
          </span>
          <button
            type="button"
            onClick={() => setZoneFilter('all')}
            aria-pressed={zoneFilter === 'all'}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors duration-200 cursor-pointer ${
              zoneFilter === 'all'
                ? 'bg-[#ae001a] text-white border-[#ae001a]'
                : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
            }`}
          >
            All zones
          </button>
          {zones.map((zone) => (
            <button
              key={String(zone.id)}
              type="button"
              onClick={() => setZoneFilter(zone.id)}
              aria-pressed={zoneFilter === zone.id}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition-colors duration-200 cursor-pointer inline-flex items-center gap-1.5 ${
                zoneFilter === zone.id
                  ? 'bg-[#ae001a] text-white border-[#ae001a]'
                  : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
              }`}
            >
              {zone.color ? (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: zone.color }}
                  aria-hidden="true"
                />
              ) : null}
              {zone.name}{' '}
              <span className="opacity-60">({zone.tableCount})</span>
            </button>
          ))}
        </fieldset>
      </section>

      {/* ---------- Tablero ---------- */}
      {loading ? (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-[#ece8e0] rounded animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div
          data-testid="tables-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm gap-3"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            table_restaurant
          </span>
          <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
            {seatable.length === 0
              ? 'No seatable booking in the book for this service day.'
              : 'No booking matches these filters.'}
          </p>
          {seatable.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setUnassignedOnly(false);
                setZoneFilter('all');
                setSearch('');
              }}
              className="text-[#ae001a] text-sm font-semibold hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <section
          aria-label="Table assignment board"
          data-testid="assignment-board"
          className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4"
        >
          {visible.map((reservation) => {
            const capacity = assignedCapacity(reservation, tableById);
            const links = activeLinks(reservation);
            const unassigned = links.length === 0;

            return (
              <article
                key={reservation.id}
                data-testid={`assignment-card-${reservation.id}`}
                className="group bg-white border border-[#e8e2d8] rounded shadow-sm p-4 flex flex-col gap-3 border-l-4 hover:border-[#ae001a] hover:shadow-md transition-colors duration-200"
                style={{ borderLeftColor: RESERVATION_STATUS_COLORS[reservation.status] }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1d1c17] truncate group-hover:text-[#ae001a] transition-colors duration-200">
                      {guestNameOf(reservation)}
                    </p>
                    <p className="text-body-sm text-[#5f5e5e]">
                      {reservationCode(reservation.id)} · {formatBookingWindow(reservation)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${reservationStatusPillStyle(reservation.status)}`}
                  >
                    {reservationStatusLabel(reservation.status)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-body-sm text-[#5f5e5e]">
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#f8f3eb] rounded">
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      group
                    </span>
                    Party of {reservation.party_size}
                  </span>
                  {/* Indicador de aforo: verde si las mesas cubren al grupo, ámbar si no. */}
                  <span
                    data-testid={`capacity-badge-${reservation.id}`}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded font-medium ${
                      unassigned
                        ? 'bg-[#f59e0b]/15 text-[#92400e]'
                        : capacity.sufficient
                          ? 'bg-[#10b981]/15 text-[#047857]'
                          : 'bg-[#f59e0b]/15 text-[#92400e]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      {unassigned ? 'warning' : capacity.sufficient ? 'check_circle' : 'warning'}
                    </span>
                    {unassigned
                      ? 'No table assigned'
                      : capacity.sufficient
                        ? `Seats ${capacity.seats} ≥ ${reservation.party_size}`
                        : `${capacity.shortfall} seat(s) short`}
                  </span>
                </div>

                {/* Grupo de mesas asignadas, cada una soltable por separado. */}
                {links.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {links.map((link) => {
                      const table = tableById.get(link.table_id);
                      const key = `${reservation.id}:${link.table_id}`;
                      return (
                        <span
                          key={link.table_id}
                          data-testid={`assigned-table-${reservation.id}-${link.table_id}`}
                          className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full border border-[#e8e2d8] bg-[#f8f3eb] text-body-sm"
                        >
                          <span className="material-symbols-outlined text-base text-[#ae001a]" aria-hidden="true">
                            table_restaurant
                          </span>
                          <span className="font-semibold">
                            #{table?.number ?? link.table_number ?? link.table_id}
                          </span>
                          <span className="text-[#5f5e5e]">
                            (Cap: {table?.capacity ?? link.capacity ?? '—'})
                          </span>
                          {table?.floorZone?.name ? (
                            <span className="text-[#5f5e5e]">· {table.floorZone.name}</span>
                          ) : null}
                          <button
                            type="button"
                            disabled={releasingKey === key}
                            onClick={() => void handleRelease(reservation, link.table_id)}
                            aria-label={`Release table ${table?.number ?? link.table_id} from ${reservationCode(reservation.id)}`}
                            className="ml-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[#5f5e5e] hover:text-[#ae001a] hover:bg-white transition-colors duration-200 disabled:opacity-40 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">
                              {releasingKey === key ? 'hourglass_empty' : 'close'}
                            </span>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : null}

                <div className="pt-1 border-t border-[#f2ede5] flex items-center justify-between gap-2">
                  <span className="text-body-sm text-[#5f5e5e]">
                    {clockTime(reservation.reservation_date)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormError('');
                      setPicking(reservation);
                    }}
                    className="px-3 py-1.5 rounded border border-[#e8e2d8] bg-white text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      {unassigned ? 'add_circle' : 'edit'}
                    </span>
                    {unassigned ? 'Assign tables' : 'Change tables'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {picking ? (
        <TablePickerDrawer
          reservation={picking}
          tables={tables}
          book={seatable}
          guestName={guestNameOf(picking)}
          submitting={submitting}
          formError={formError}
          onCancel={() => setPicking(null)}
          onSubmit={(ids) => void handleAssign(ids)}
        />
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
      {/* Panel de accesos rápidos estándar (QuickLaunchPanel), como el resto de módulos. */}
      <div>
        <ReservationsQuickLinks current="reservation-tables" onNavigate={onNavigate} />
      </div>

    </div>
  );
};

export default ReservationTablesView;
