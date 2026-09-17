// Cuaderno de notas del servicio: feed cronológico, KPIs del turno y buscador.
//
// Igual que el tablero de mesas, se hidrata desde el día de reservas: `GET /api/reservation`
// ya embebe las notas de cada reserva, así que una sola llamada da el feed completo del turno
// Y el contexto (nombre del invitado, hora) que hace falta para buscar por comensal. Pedir
// `/api/reservation-note` por separado daría notas sueltas sin saber de quién son.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CustomerRef, Reservation } from '../../../../types/reservation';
import {
  EMPTY_NOTE_FILTERS,
  NOTE_CATEGORIES,
  NOTE_CATEGORY_ICONS,
  NOTE_CATEGORY_LABELS,
  NOTE_CATEGORY_PILL_STYLES,
  NOTE_CATEGORY_STYLES,
  authorLabel,
  categoryOf,
  computeNotesMetrics,
  hasActiveNoteFilters,
  isPriorityNote,
  matchesNoteFilters,
  noteTimestampLabel,
  sortNotesByRecency,
  type NoteFilters,
  type NoteWithContext,
} from '../../../../lib/reservation-notes';
import { clockTime, reservationCode, todayIsoDate, toggleInList } from '../../../../lib/reservations';
import {
  createReservationNote,
  deleteReservationNote,
  listCustomers,
  listReservations,
  listStaff,
  updateReservationNote,
} from '../../../../api/reservations';
import { ApiError } from '../../../../lib/api-error';
import { Toast, type ToastState } from '../../shared/Toast';
import { ReservationsQuickLinks } from './ReservationsQuickLinks';
import { NoteFormDrawer } from './NoteFormDrawer';

interface ReservationNotesViewProps {
  onNavigate?: (featureId: string) => void;
  merchantId?: number;
}

export const ReservationNotesView: React.FC<ReservationNotesViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [staffById, setStaffById] = useState<Map<number, { name?: string; role?: string }>>(
    new Map(),
  );

  const [day, setDay] = useState<string>(todayIsoDate());
  const [filters, setFilters] = useState<NoteFilters>(EMPTY_NOTE_FILTERS);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<NoteWithContext | null>(null);
  const [presetReservationId, setPresetReservationId] = useState<number | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
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
          : 'Failed to load the notes feed. Please check if the backend is running.',
      );
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    void fetchDay();
  }, [fetchDay]);

  // Catálogos de apoyo: fallan en silencio. Sin el de personal la firma cae a "Staff #id".
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

    void (async () => {
      try {
        const rows = await listStaff();
        if (cancelled) return;
        // Las notas guardan el id del USUARIO autenticado, no el de la ficha de colaborador,
        // así que el índice se construye sobre `user_id` cuando viene.
        setStaffById(
          new Map(
            rows.map((s) => [s.user_id ?? s.id, { name: s.name, role: s.role }] as const),
          ),
        );
      } catch {
        if (!cancelled) setStaffById(new Map());
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

  const reservationById = useMemo(
    () => new Map(reservations.map((r) => [r.id, r])),
    [reservations],
  );

  // Feed del turno: todas las notas activas de las reservas del día, con su contexto resuelto
  // y en orden cronológico inverso estricto.
  const feed = useMemo<NoteWithContext[]>(() => {
    const rows: NoteWithContext[] = [];
    reservations.forEach((reservation) => {
      (reservation.notes ?? [])
        .filter((note) => note.is_active)
        .forEach((note) => {
          rows.push({
            ...note,
            reservationLabel: guestNameOf(reservation),
            category: categoryOf(note),
          });
        });
    });
    return sortNotesByRecency(rows);
  }, [reservations, guestNameOf]);

  const metrics = useMemo(() => computeNotesMetrics(feed), [feed]);

  const visible = useMemo(
    () => feed.filter((note) => matchesNoteFilters(note, filters)),
    [feed, filters],
  );

  // ================= Escritura =================

  const handleSubmit = async (reservationId: number, text: string) => {
    setSubmitting(true);
    setFormError('');
    try {
      if (editing) {
        await updateReservationNote(editing.id, text);
      } else {
        await createReservationNote(reservationId, text);
      }
      await fetchDay();
      setDrawerOpen(false);
      setEditing(null);
      setPresetReservationId(undefined);
      setToast({
        message: editing
          ? 'Note updated'
          : `Note added to ${reservationCode(reservationId)}`,
        type: 'success',
      });
    } catch (err) {
      console.error('Error saving the note:', err);
      setFormError(err instanceof ApiError ? err.message : 'Failed to save the note.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (note: NoteWithContext) => {
    setRemovingId(note.id);
    try {
      await deleteReservationNote(note.id);
      await fetchDay();
      setToast({ message: 'Note removed', type: 'success' });
    } catch (err) {
      console.error('Error removing the note:', err);
      setToast({
        message: err instanceof ApiError ? err.message : 'Failed to remove the note.',
        type: 'error',
      });
    } finally {
      setRemovingId(null);
    }
  };

  // ================= Render =================

  const kpis = [
    {
      id: 'total',
      label: 'Notes today',
      value: String(metrics.totalNotes),
      hint: `across ${reservations.length} booking${reservations.length === 1 ? '' : 's'}`,
      icon: 'sticky_note_2',
      accent: '#ae001a',
    },
    {
      id: 'allergy',
      label: 'Dietary / allergy alerts',
      value: String(metrics.allergyAlerts),
      hint: 'flagged to the kitchen',
      icon: 'medical_services',
      accent: '#ef4444',
    },
    {
      id: 'occasion',
      label: 'Special occasions',
      value: String(metrics.specialOccasions),
      hint: 'birthdays, anniversaries, celebrations',
      icon: 'cake',
      accent: '#8b5cf6',
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
            Reservation Notes
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Allergies, occasions and service notes for every booking on the shift.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="notes-day" className="sr-only">
            Service day
          </label>
          <input
            id="notes-day"
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
              event_note
            </span>
            Add Note
          </button>
        </div>
      </div>

      {/* ---------- KPIs del turno ---------- */}
      <section
        aria-label="Shift notes metrics"
        data-testid="notes-kpis"
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

      {/* ---------- Filtros ---------- */}
      <section
        aria-label="Note filters"
        className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-col gap-4"
      >
        <div className="relative">
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
            placeholder="Search notes by keyword, guest or reservation…"
            aria-label="Search notes"
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-colors duration-200"
          />
        </div>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Filter by category</legend>
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mr-1">
            Category
          </span>
          {NOTE_CATEGORIES.map((category) => {
            const checked = filters.categories.includes(category);
            return (
              <label
                key={category}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors duration-200 ${
                  checked
                    ? NOTE_CATEGORY_PILL_STYLES[category]
                    : 'bg-white text-[#5f5e5e] border border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setFilters({
                      ...filters,
                      categories: toggleInList(filters.categories, category),
                    })
                  }
                  className="accent-[#ae001a] w-3 h-3"
                />
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  {NOTE_CATEGORY_ICONS[category]}
                </span>
                {NOTE_CATEGORY_LABELS[category]}
              </label>
            );
          })}
          {hasActiveNoteFilters(filters) ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_NOTE_FILTERS)}
              className="px-3 py-1 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-wider rounded hover:text-[#ae001a] hover:border-[#ae001a] transition-colors duration-200"
            >
              Clear
            </button>
          ) : null}
        </fieldset>
      </section>

      {/* ---------- Feed ---------- */}
      {loading ? (
        <div className="bg-white border border-[#e8e2d8] rounded shadow-sm p-6 flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[#ece8e0] rounded animate-pulse" />
          ))}
        </div>
      ) : feed.length === 0 ? (
        <div
          data-testid="notes-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm gap-3"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            event_note
          </span>
          <p className="text-[#5f5e5e] max-w-md text-sm leading-relaxed">
            {reservations.length === 0
              ? 'No booking in the book for this service day, so there is nothing to annotate yet.'
              : 'No notes on this shift yet. Record an allergy, an occasion or a seating preference so the floor and kitchen see it.'}
          </p>
          {reservations.length > 0 ? (
            <button
              type="button"
              onClick={() => openCreate()}
              className="mt-2 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                event_note
              </span>
              Add Note
            </button>
          ) : null}
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-[#e8e2d8] p-12 flex flex-col items-center text-center rounded shadow-sm gap-3">
          <span className="material-symbols-outlined text-[#5f5e5e] text-4xl" aria-hidden="true">
            search_off
          </span>
          <p className="text-sm text-[#5f5e5e] max-w-md">
            No note matches these filters — {feed.length} on the shift.
          </p>
          <button
            type="button"
            onClick={() => setFilters(EMPTY_NOTE_FILTERS)}
            className="text-[#ae001a] text-sm font-semibold hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <section aria-label="Notes timeline" data-testid="notes-feed" className="flex flex-col gap-3">
          {visible.map((note) => {
            const reservation = reservationById.get(note.reservation_id);
            const priority = isPriorityNote(note);
            return (
              <article
                key={note.id}
                data-testid={`note-card-${note.id}`}
                className={`group rounded shadow-sm p-4 flex flex-col gap-2 hover:shadow-md transition-colors duration-200 ${NOTE_CATEGORY_STYLES[note.category]}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${NOTE_CATEGORY_PILL_STYLES[note.category]}`}
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      {NOTE_CATEGORY_ICONS[note.category]}
                    </span>
                    {NOTE_CATEGORY_LABELS[note.category]}
                  </span>
                  {priority ? (
                    <span
                      data-testid={`priority-flag-${note.id}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ae001a] text-white"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        priority_high
                      </span>
                      Priority
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ece8e0] text-[#5f5e5e]">
                    {reservationCode(note.reservation_id)}
                  </span>
                  {reservation ? (
                    <span className="text-body-sm text-[#5f5e5e]">
                      {note.reservationLabel} · {clockTime(reservation.reservation_date)}
                    </span>
                  ) : null}
                </div>

                {/* Cuerpo con saltos de línea respetados: una lista de alergias escrita en
                    varias líneas se lee como se escribió. */}
                <p className="text-body-md text-[#1d1c17] whitespace-pre-wrap break-words">
                  {note.note}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#e8e2d8]/60">
                  <span className="text-body-sm text-[#5f5e5e] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      badge
                    </span>
                    {authorLabel(note.created_by, staffById)} ·{' '}
                    {noteTimestampLabel(note.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(note);
                        setFormError('');
                        setDrawerOpen(true);
                      }}
                      className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={removingId === note.id}
                      onClick={() => void handleRemove(note)}
                      className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 cursor-pointer"
                    >
                      {removingId === note.id ? 'Removing…' : 'Remove'}
                    </button>
                  </span>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {drawerOpen ? (
        <NoteFormDrawer
          reservations={reservations}
          initialReservationId={presetReservationId}
          initial={editing ?? undefined}
          guestNameOf={guestNameOf}
          submitting={submitting}
          formError={formError}
          onCancel={() => {
            setDrawerOpen(false);
            setEditing(null);
            setPresetReservationId(undefined);
          }}
          onSubmit={(reservationId, text) => void handleSubmit(reservationId, text)}
        />
      ) : null}

      <Toast toast={toast} onClose={() => setToast(null)} />
      {/* Panel de accesos rápidos estándar (QuickLaunchPanel), como el resto de módulos. */}
      <div>
        <ReservationsQuickLinks current="reservation-notes" onNavigate={onNavigate} />
      </div>

    </div>
  );
};

export default ReservationNotesView;
