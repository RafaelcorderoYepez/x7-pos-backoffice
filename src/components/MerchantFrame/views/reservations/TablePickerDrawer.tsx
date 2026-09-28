// Selector de mesas para una reserva concreta.
//
// Dos cosas gobiernan el diseño:
//
// 1. Lo que se guarda es el CONJUNTO completo de mesas, no un diff. La anfitriona marca y
//    desmarca hasta que le cuadra y pulsa una vez; el workspace traduce eso a las altas y
//    bajas necesarias. Guardar mesa a mano por mesa dejaría estados intermedios visibles en
//    las otras tablets del atril.
// 2. Una mesa ocupada en la franja se muestra, pero NO se puede marcar: esconderla haría
//    pensar que no existe, y lo útil es ver quién la tiene.

import React, { useMemo, useState } from 'react';
import type { DiningTable } from '../../../../types/dining-system';
import type { Reservation } from '../../../../types/reservation';
import {
  SUGGESTION_LABELS,
  assignedTableIds,
  conflictsForTable,
  isAssignableTable,
  suggestTables,
  suggestionSummary,
  zoneOptions,
  UNZONED_LABEL,
  type TableSuggestion,
} from '../../../../lib/reservation-tables';
import { clockTime, reservationCode } from '../../../../lib/reservations';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';

interface TablePickerDrawerProps {
  reservation: Reservation;
  tables: DiningTable[];
  /** El libro del día completo: es lo que permite detectar el solape antes de enviar. */
  book: Reservation[];
  guestName: string;
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (tableIds: number[]) => void;
}

const chipBase =
  'px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors duration-200 cursor-pointer border';

export const TablePickerDrawer: React.FC<TablePickerDrawerProps> = ({
  reservation,
  tables,
  book,
  guestName,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [selected, setSelected] = useState<number[]>(() => assignedTableIds(reservation));
  const [zoneFilter, setZoneFilter] = useState<number | null | 'all'>('all');
  const [query, setQuery] = useState('');

  useModalDismiss(onCancel);

  const party = Number(reservation.party_size) || 0;

  // Conflictos precalculados una vez por mesa: recorrer el libro dentro del render de cada
  // fila convertiría una sala de 60 mesas en 60 recorridos por pulsación de tecla.
  const conflictByTable = useMemo(() => {
    const map = new Map<number, Reservation | undefined>();
    tables.forEach((t) => {
      map.set(t.id, conflictsForTable(t.id, reservation, book)[0]);
    });
    return map;
  }, [tables, reservation, book]);

  const freeTables = useMemo(
    () => tables.filter((t) => isAssignableTable(t) && !conflictByTable.get(t.id)),
    [tables, conflictByTable],
  );

  const suggestions = useMemo(
    () => suggestTables(freeTables, party),
    [freeTables, party],
  );

  const zones = useMemo(() => zoneOptions(tables), [tables]);

  const visibleTables = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tables
      .filter(isAssignableTable)
      .filter((t) => (zoneFilter === 'all' ? true : (t.floorZone?.id ?? null) === zoneFilter))
      .filter((t) =>
        term
          ? [t.number, t.floorZone?.name ?? '', t.location ?? '']
              .join(' ')
              .toLowerCase()
              .includes(term)
          : true,
      )
      .sort((a, b) => a.capacity - b.capacity || a.number.localeCompare(b.number));
  }, [tables, zoneFilter, query]);

  const tableById = useMemo(() => new Map(tables.map((t) => [t.id, t])), [tables]);

  const selectedSeats = selected.reduce(
    (sum, id) => sum + (Number(tableById.get(id)?.capacity) || 0),
    0,
  );
  const sufficient = selected.length > 0 && selectedSeats >= party;

  const toggle = (tableId: number) => {
    if (conflictByTable.get(tableId)) return;
    setSelected((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId],
    );
  };

  const applySuggestion = (suggestion: TableSuggestion) => {
    setSelected(suggestion.tables.map((t) => t.id));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    onSubmit(selected);
  };

  return (
    <AppModal
      title={`Assign tables — ${guestName}`}
      subtitle={`${reservationCode(reservation.id)} · ${clockTime(reservation.reservation_date)} · party of ${party}`}
      onClose={onCancel}
      closeDisabled={submitting}
      size="2xl"
    >
      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 overflow-y-auto font-sans">
        {formError ? <ModalFormError message={formError} /> : null}

        {/* ---------- Sugerencias automáticas ---------- */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-[#ae001a]" aria-hidden="true">
              auto_awesome
            </span>
            Suggested for a party of {party}
          </h3>

          {suggestions.length === 0 ? (
            <p className="text-body-sm text-[#5f5e5e]">
              No free table or combination covers this party in the booked window. Pick tables
              manually, or free one up by moving another booking.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="table-suggestions">
              {suggestions.map((suggestion) => {
                const ids = suggestion.tables.map((t) => t.id);
                const isApplied =
                  ids.length === selected.length && ids.every((id) => selected.includes(id));
                return (
                  <li key={ids.join('-')}>
                    <button
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      aria-pressed={isApplied}
                      className={`w-full text-left px-3 py-2 rounded border flex items-center justify-between gap-3 transition-colors duration-200 cursor-pointer ${
                        isApplied
                          ? 'border-[#ae001a] bg-[#ae001a]/5'
                          : 'border-[#e8e2d8] bg-white hover:border-[#ae001a] hover:text-[#ae001a]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-body-md font-semibold">
                          {suggestionSummary(suggestion)}
                        </span>
                        <span className="block text-body-sm text-[#5f5e5e]">
                          {SUGGESTION_LABELS[suggestion.kind]}
                          {suggestion.zoneName ? ` · ${suggestion.zoneName}` : ''}
                        </span>
                      </span>
                      <span
                        className={`${chipBase} shrink-0 ${
                          suggestion.kind === 'exact'
                            ? 'bg-[#10b981]/15 text-[#047857] border-[#10b981]/40'
                            : 'bg-[#ece8e0] text-[#5f5e5e] border-[#e8e2d8]'
                        }`}
                      >
                        {SUGGESTION_LABELS[suggestion.kind]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------- Selección actual ---------- */}
        <section
          data-testid="picker-summary"
          className={`p-3 rounded border flex items-center gap-2 text-body-sm ${
            selected.length === 0
              ? 'border-[#e8e2d8] bg-[#f8f3eb] text-[#5f5e5e]'
              : sufficient
                ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#047857]'
                : 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#92400e]'
          }`}
          role="status"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            {selected.length === 0 ? 'table_restaurant' : sufficient ? 'check_circle' : 'warning'}
          </span>
          {selected.length === 0 ? (
            <span>No table selected — the booking stays unassigned.</span>
          ) : (
            <span>
              {selected.length} table{selected.length === 1 ? '' : 's'} · {selectedSeats} seats for
              a party of {party}
              {sufficient ? '' : ` — ${party - selectedSeats} seat(s) short`}
            </span>
          )}
        </section>

        {/* ---------- Filtros del catálogo ---------- */}
        <section className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-lg"
              aria-hidden="true"
            >
              search
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a table by number or zone…"
              aria-label="Search tables"
              className="w-full pl-10 pr-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm outline-none focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] transition-colors duration-200"
            />
          </div>
          <button
            type="button"
            onClick={() => setZoneFilter('all')}
            className={`${chipBase} ${
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
              className={`${chipBase} ${
                zoneFilter === zone.id
                  ? 'bg-[#ae001a] text-white border-[#ae001a]'
                  : 'bg-white text-[#5f5e5e] border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
              }`}
            >
              {zone.name}
            </button>
          ))}
        </section>

        {/* ---------- Catálogo de mesas ---------- */}
        <section
          data-testid="table-catalog"
          className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 max-h-72 overflow-y-auto pr-1"
        >
          {visibleTables.length === 0 ? (
            <p className="col-span-full text-body-sm text-[#5f5e5e] py-6 text-center">
              No table matches this filter.
            </p>
          ) : (
            visibleTables.map((table) => {
              const conflict = conflictByTable.get(table.id);
              const checked = selected.includes(table.id);
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => toggle(table.id)}
                  disabled={Boolean(conflict)}
                  data-testid={`table-option-${table.id}`}
                  title={
                    conflict
                      ? `Booked by ${reservationCode(conflict.id)} at ${clockTime(conflict.reservation_date)}`
                      : undefined
                  }
                  className={`text-left p-3 rounded border flex flex-col gap-1 transition-colors duration-200 ${
                    conflict
                      ? 'border-[#e8e2d8] bg-[#f2ede5] opacity-70 cursor-not-allowed'
                      : checked
                        ? 'border-[#ae001a] bg-[#ae001a]/5 cursor-pointer'
                        : 'border-[#e8e2d8] bg-white hover:border-[#ae001a] hover:text-[#ae001a] cursor-pointer'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-body-md">Table #{table.number}</span>
                    {checked ? (
                      <span
                        className="material-symbols-outlined text-[#ae001a] text-lg"
                        aria-hidden="true"
                      >
                        check_circle
                      </span>
                    ) : null}
                  </span>
                  <span className="text-body-sm text-[#5f5e5e]">
                    Cap: {table.capacity} · {table.floorZone?.name ?? UNZONED_LABEL}
                  </span>
                  {conflict ? (
                    <span className="text-body-sm text-[#b91c1c] font-medium">
                      Booked · {reservationCode(conflict.id)} {clockTime(conflict.reservation_date)}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </section>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Saving…' : 'Save assignment'}
          isSubmitting={submitting}
        />
      </form>
    </AppModal>
  );
};

export default TablePickerDrawer;
