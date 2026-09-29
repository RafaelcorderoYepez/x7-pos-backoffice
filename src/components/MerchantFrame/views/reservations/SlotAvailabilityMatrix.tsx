// Selector de hora con semáforo de aforo: cada franja de 15/30 min de cada turno, pintada
// verde (< 70 %), ámbar (70–99 %) o rojo (lleno para ESTE grupo o sin hueco de llegada).
//
// Una franja roja se puede elegir igualmente: es como la anfitriona llega al override del
// encargado. Lo que el matriz NO hace es decidir — el veredicto es el del servidor.

import React from 'react';
import {
  LEVEL_CHIP_STYLES,
  LEVEL_DOT_COLORS,
  LEVEL_LABELS,
  slotSummary,
  type DayAvailability,
  type OccupancyLevel,
} from '../../../../lib/reservation-capacity';

interface SlotAvailabilityMatrixProps {
  availability: DayAvailability | null;
  loading: boolean;
  error: string;
  selectedTime: string;
  onSelect: (time: string) => void;
}

const LEGEND: OccupancyLevel[] = ['available', 'limited', 'sold_out'];

export const SlotAvailabilityMatrix: React.FC<SlotAvailabilityMatrixProps> = ({
  availability,
  loading,
  error,
  selectedTime,
  onSelect,
}) => (
  <section
    aria-label="Slot availability"
    data-testid="slot-matrix"
    className="flex flex-col gap-3 border border-[#e8e2d8] rounded p-3 bg-[#fef9f1] font-sans"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider flex items-center gap-1">
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          group
        </span>
        Slot availability
        {availability ? (
          <span className="normal-case tracking-normal font-semibold text-[#1d1c17]">
            · {availability.seat_capacity > 0 ? `${availability.seat_capacity} seats` : 'capacity not set'}
            {availability.max_covers_per_slot
              ? ` · max ${availability.max_covers_per_slot} arrivals / ${availability.slot_interval_minutes} min`
              : ''}
          </span>
        ) : null}
      </p>
      <ul className="flex flex-wrap gap-3 text-[11px] text-[#5f5e5e]" aria-label="Legend">
        {LEGEND.map((level) => (
          <li key={level} className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: LEVEL_DOT_COLORS[level] }}
              aria-hidden="true"
            />
            {LEVEL_LABELS[level]}
          </li>
        ))}
      </ul>
    </div>

    {error ? (
      <p className="text-body-sm text-[#b91c1c]" role="alert">
        {error}
      </p>
    ) : loading && !availability ? (
      <div className="h-16 bg-[#ece8e0] rounded animate-pulse" aria-label="Loading availability" />
    ) : availability ? (
      availability.shifts.map((shift) => (
        <div key={shift.name} className="flex flex-col gap-2" data-testid={`shift-${shift.name}`}>
          <p className="text-body-sm text-[#1d1c17] font-semibold flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-[#5f5e5e]" aria-hidden="true">
              schedule
            </span>
            {shift.name}
            <span className="font-normal text-[#5f5e5e]">
              {shift.start}–{shift.end}
            </span>
            {shift.occupancy_pct != null ? (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${LEVEL_CHIP_STYLES[shift.level]}`}
              >
                {Math.round(shift.occupancy_pct)}% peak
              </span>
            ) : null}
          </p>
          <div
            role="group"
            aria-label={`${shift.name} time slots`}
            className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5"
          >
            {shift.slots.map((slot) => {
              const selected = slot.time === selectedTime;
              return (
                <button
                  key={slot.time}
                  type="button"
                  data-testid={`slot-${slot.time}`}
                  data-level={slot.level}
                  aria-pressed={selected}
                  aria-label={slotSummary(
                    slot,
                    availability.seat_capacity,
                    availability.party_size,
                    availability.max_covers_per_slot,
                  )}
                  title={slotSummary(
                    slot,
                    availability.seat_capacity,
                    availability.party_size,
                    availability.max_covers_per_slot,
                  )}
                  onClick={() => onSelect(slot.time)}
                  className={`px-2 py-1.5 rounded border text-xs font-bold font-sans tabular-nums flex items-center justify-center gap-1 cursor-pointer hover:text-primary transition-colors duration-200 ${LEVEL_CHIP_STYLES[slot.level]} ${
                    selected ? 'ring-2 ring-[#ae001a] ring-offset-1' : ''
                  }`}
                >
                  {slot.level === 'sold_out' ? (
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      block
                    </span>
                  ) : null}
                  {slot.time}
                </button>
              );
            })}
          </div>
        </div>
      ))
    ) : null}
  </section>
);

export default SlotAvailabilityMatrix;
