// Inspector de un fichaje: la jornada dibujada contra su turno, el desglose de horas y el
// histórico de correcciones.
//
// La línea de tiempo se calcula sobre una ventana que abarca tanto lo programado como lo
// realmente fichado: si alguien entró antes de su turno o salió mucho después, la barra
// tiene que enseñarlo en vez de recortarlo.

import React from 'react';
import type { TimeEntry, TimeEntryRevision } from '../../../../types/time-entry';
import { PUNCH_STATUS_BADGE_STYLES, PUNCH_STATUS_LABELS } from '../../../../types/time-entry';
import { shiftRoleLabel } from '../../../../types/collaborator';
import { collaboratorRef } from '../../../../lib/collaborators';
import {
  classifyEntry,
  clockTime,
  entryDate,
  formatBreak,
  formatHours,
  netHours,
  overtimeHours,
  rawHours,
  regularHours,
  tardyLabel,
  timeEntryRef,
} from '../../../../lib/time-entries';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal } from '../../shared/AppModal';

interface TimeEntryDetailDrawerProps {
  entry: TimeEntry;
  revisions: TimeEntryRevision[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
}

/** Porcentaje de una marca dentro de la ventana dibujada. */
const pct = (value: number, from: number, to: number): number =>
  to <= from ? 0 : Math.min(100, Math.max(0, ((value - from) / (to - from)) * 100));

export const TimeEntryDetailDrawer: React.FC<TimeEntryDetailDrawerProps> = ({
  entry,
  revisions,
  loading,
  error,
  onClose,
  onRetry,
}) => {
  useModalDismiss(onClose);

  const status = classifyEntry(entry);
  const inMs = new Date(entry.clock_in).getTime();
  const outMs = entry.clock_out ? new Date(entry.clock_out).getTime() : null;
  const schedIn = entry.shift?.startTime ? new Date(entry.shift.startTime).getTime() : null;
  const schedOut = entry.shift?.endTime ? new Date(entry.shift.endTime).getTime() : null;

  // Ventana visible: lo primero que ocurrió hasta lo último, con un margen del 5% a cada
  // lado para que las marcas extremas no queden pegadas al borde.
  const points = [inMs, outMs, schedIn, schedOut].filter(
    (v): v is number => v != null && !Number.isNaN(v),
  );
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(max - min, 60_000);
  const from = min - span * 0.05;
  const to = max + span * 0.05;

  return (
    <AppModal
      title={`${timeEntryRef(entry.id)} · ${entry.collaborator?.name ?? 'Collaborator'}`}
      subtitle="Time entry inspector"
      onClose={onClose}
      size="2xl"
      closeAriaLabel="Close time entry inspector"
    >
      <div className="flex flex-col overflow-y-auto flex-1 text-left font-sans">
        {/* ---------------- Cabecera ---------------- */}
        <div className="p-6 border-b border-[#e8e2d8]">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-lg text-[#1d1c17]">
              {entry.collaborator?.name ?? `Collaborator #${entry.collaborator_id}`}
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17]">
              {shiftRoleLabel(entry.collaborator?.role)}
            </span>
            <span
              data-testid="detail-punch-status"
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${PUNCH_STATUS_BADGE_STYLES[status]}`}
            >
              {PUNCH_STATUS_LABELS[status]}
            </span>
            {tardyLabel(entry) && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-700">
                {tardyLabel(entry)}
              </span>
            )}
          </div>
          <p className="text-xs text-[#5f5e5e] font-mono mt-1">
            {timeEntryRef(entry.id)} · {collaboratorRef(entry.collaborator_id)} ·{' '}
            {entryDate(entry.clock_in)}
          </p>
        </div>

        {/* ---------------- Línea de tiempo ---------------- */}
        <div className="p-6 border-b border-[#e8e2d8]">
          <p className="text-[11px] font-bold text-[#5f5e5e] uppercase mb-3">Timeline</p>
          <div
            data-testid="entry-timeline"
            className="relative h-12 bg-[#f2ede5] rounded overflow-hidden"
          >
            {/* Turno programado, de fondo. */}
            {schedIn != null && schedOut != null && (
              <div
                data-testid="timeline-scheduled"
                title="Scheduled shift"
                className="absolute top-0 bottom-0 bg-[#5f5e5e]/20"
                style={{
                  left: `${pct(schedIn, from, to)}%`,
                  width: `${pct(schedOut, from, to) - pct(schedIn, from, to)}%`,
                }}
              />
            )}
            {/* Jornada realmente fichada, encima. */}
            <div
              data-testid="timeline-worked"
              title="Worked interval"
              className="absolute top-3 bottom-3 bg-[#ae001a] rounded"
              style={{
                left: `${pct(inMs, from, to)}%`,
                width: `${(outMs != null ? pct(outMs, from, to) : 100) - pct(inMs, from, to)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-[#5f5e5e] font-mono mt-2">
            <span>
              In {clockTime(entry.clock_in)}
              {entry.shift?.startTime ? ` · sched ${clockTime(entry.shift.startTime)}` : ''}
            </span>
            <span>
              {entry.clock_out ? `Out ${clockTime(entry.clock_out)}` : 'In progress'}
            </span>
          </div>
        </div>

        {/* ---------------- Desglose de horas ---------------- */}
        <div className="p-6 border-b border-[#e8e2d8] grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Raw interval', value: formatHours(rawHours(entry)) },
            { label: 'Unpaid break', value: formatBreak(entry.break_minutes) },
            { label: 'Regular', value: formatHours(regularHours(entry)) },
            { label: 'Overtime', value: formatHours(overtimeHours(entry)) },
          ].map((cell) => (
            <div key={cell.label}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                {cell.label}
              </p>
              <p className="text-sm font-mono text-[#1d1c17] mt-0.5">{cell.value}</p>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4">
            <p className="text-sm text-[#1d1c17]">
              Net payable: <strong data-testid="detail-net">{formatHours(netHours(entry))}</strong>
            </p>
          </div>
        </div>

        {/* ---------------- Histórico de correcciones ---------------- */}
        <div className="p-6">
          <p className="text-[11px] font-bold text-[#5f5e5e] uppercase mb-3">
            Audit history
          </p>

          {loading && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-4 bg-[#ece8e0] rounded animate-pulse w-full" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-4">
              <p role="alert" className="text-sm text-red-700 font-medium">
                {error}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && revisions.length === 0 && (
            <p className="text-sm text-[#5f5e5e] italic">
              {entry.is_edited
                ? 'This punch is flagged as edited but no revision rows were found.'
                : 'This punch has never been corrected — it is exactly what the clock recorded.'}
            </p>
          )}

          {!loading && !error && revisions.length > 0 && (
            <ul data-testid="revision-list" className="divide-y divide-[#e8e2d8]">
              {revisions.map((r) => (
                <li key={r.id} className="py-3">
                  <p className="text-sm text-[#1d1c17]">
                    <strong>{r.adjustment_reason}</strong>
                    <span className="text-xs text-[#5f5e5e]">
                      {' '}
                      · by user #{r.edited_by_user_id} · {entryDate(r.created_at)}{' '}
                      {clockTime(r.created_at)}
                    </span>
                  </p>
                  <p className="text-xs text-[#5f5e5e] font-mono mt-1">
                    {clockTime(r.previous_clock_in)} → {clockTime(r.previous_clock_out)} ·{' '}
                    {r.previous_break_minutes ?? 0} min
                    {'  ⟹  '}
                    {clockTime(r.new_clock_in)} → {clockTime(r.new_clock_out)} ·{' '}
                    {r.new_break_minutes ?? 0} min
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppModal>
  );
};

export default TimeEntryDetailDrawer;
