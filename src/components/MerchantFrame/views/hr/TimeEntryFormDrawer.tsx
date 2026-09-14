// Alta manual y corrección de un fichaje.
//
// Toda escritura por esta vía exige justificación: un fichaje corregido sin motivo es
// exactamente lo que una auditoría de nómina no puede aceptar. Las guardas de cronología y
// solapamiento son las mismas que aplica el backend, para que el formulario no prometa lo
// que la API va a rechazar.

import React, { useMemo, useState } from 'react';
import type { TimeEntry } from '../../../../types/time-entry';
import { ADJUSTMENT_REASONS } from '../../../../types/time-entry';
import type { Collaborator } from '../../../../types/collaborator';
import { shiftRoleLabel } from '../../../../types/collaborator';
import { collaboratorRef } from '../../../../lib/collaborators';
import {
  REASON_REQUIRED_ERROR,
  chronologyError,
  netHours,
  overlapError,
  overlappingEntry,
} from '../../../../lib/time-entries';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormError, ModalFormFooter } from '../../shared/AppModal';

export interface TimeEntryDraft {
  collaborator_id: number;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  adjustment_reason: string;
}

interface TimeEntryFormDrawerProps {
  mode: 'create' | 'edit';
  initial?: TimeEntry;
  collaborators: Collaborator[];
  // Todos los fichajes cargados: alimentan la guarda de solapamiento.
  entries: TimeEntry[];
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (draft: TimeEntryDraft) => void;
}

/** ISO -> valor de un <input type="datetime-local">, que trabaja en horario local. */
const toLocalInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (value: string): string =>
  value ? new Date(value).toISOString() : '';

/**
 * Ahora mismo, al minuto, como valor de un <input type="datetime-local">.
 *
 * El alta arranca con la entrada ya puesta a propósito. Un datetime-local vacío es una
 * trampa: el calendario del navegador rellena sólo la fecha y deja la hora en `--:--`, con
 * lo que el campo PARECE relleno pero su `value` sigue vacío y el formulario no deja
 * enviar. Partiendo de un valor completo, elegir otra fecha en el calendario conserva la
 * hora y el campo nunca se queda a medias.
 */
const nowLocalInput = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const TimeEntryFormDrawer: React.FC<TimeEntryFormDrawerProps> = ({
  mode,
  initial,
  collaborators,
  entries,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [collaboratorId, setCollaboratorId] = useState<string>(
    initial ? String(initial.collaborator_id) : '',
  );
  const [clockIn, setClockIn] = useState(() =>
    initial ? toLocalInput(initial.clock_in) : nowLocalInput(),
  );
  const [clockOut, setClockOut] = useState(toLocalInput(initial?.clock_out));
  const [breakMinutes, setBreakMinutes] = useState(String(initial?.break_minutes ?? 0));
  const [reason, setReason] = useState<string>(
    initial?.adjustment_reason ?? ADJUSTMENT_REASONS[0],
  );
  const [customReason, setCustomReason] = useState('');
  const [staffQuery, setStaffQuery] = useState('');

  useModalDismiss(onCancel);

  const visibleStaff = useMemo(() => {
    const term = staffQuery.trim().toLowerCase();
    if (!term) return collaborators;
    return collaborators.filter((c) =>
      [c.name, collaboratorRef(c.id), c.role].join(' ').toLowerCase().includes(term),
    );
  }, [collaborators, staffQuery]);

  const isCustom = reason === '__custom__';
  const effectiveReason = (isCustom ? customReason : reason).trim();

  const chronology = chronologyError(
    fromLocalInput(clockIn),
    fromLocalInput(clockOut),
  );

  const clash = useMemo(() => {
    if (!collaboratorId || !clockIn) return null;
    return overlappingEntry(
      entries,
      Number(collaboratorId),
      fromLocalInput(clockIn),
      clockOut ? fromLocalInput(clockOut) : null,
      initial?.id,
    );
  }, [entries, collaboratorId, clockIn, clockOut, initial]);

  // Un datetime-local a medias devuelve cadena vacía, así que este mensaje cubre tanto el
  // campo en blanco como el que tiene fecha pero no hora.
  const clockInError = clockIn ? '' : 'Clock-in needs both a date and a time.';

  const breakNum = Number(breakMinutes);
  const breakError =
    Number.isFinite(breakNum) && breakNum >= 0 ? '' : 'Break minutes must be zero or more.';

  // Vista previa de lo que se va a pagar: el operador ve el efecto de su ajuste antes de
  // guardarlo, que es cuando todavía puede corregirlo.
  const preview = clockIn && clockOut && !chronology
    ? netHours({
        clock_in: fromLocalInput(clockIn),
        clock_out: fromLocalInput(clockOut),
        break_minutes: Math.max(0, breakNum || 0),
      })
    : null;

  const canSubmit =
    collaboratorId.length > 0 &&
    clockIn.length > 0 &&
    !chronology &&
    !clash &&
    !breakError &&
    effectiveReason.length > 0 &&
    !submitting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      collaborator_id: Number(collaboratorId),
      clock_in: fromLocalInput(clockIn),
      clock_out: clockOut ? fromLocalInput(clockOut) : null,
      break_minutes: Math.max(0, Math.round(breakNum || 0)),
      adjustment_reason: effectiveReason,
    });
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';

  return (
    <AppModal
      title={mode === 'create' ? 'Log Manual Time Entry' : 'Adjust Punch'}
      subtitle="Time Entries Control"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close time entry form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tme-collaborator" className={labelClass}>
            Collaborator <span className="text-[#ae001a]">*</span>
          </label>
          {mode === 'create' ? (
            <>
              <input
                type="text"
                value={staffQuery}
                onChange={(e) => setStaffQuery(e.target.value)}
                placeholder="Filter staff by name, #CLB-id or role…"
                className={`${inputClass} text-[13px]`}
                aria-label="Filter collaborators"
              />
              <select
                id="tme-collaborator"
                autoFocus
                value={collaboratorId}
                onChange={(e) => setCollaboratorId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a collaborator…</option>
                {visibleStaff.map((c) => (
                  <option key={c.id} value={c.id}>
                    {collaboratorRef(c.id)} · {c.name} · {shiftRoleLabel(c.role)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <input
              id="tme-collaborator"
              type="text"
              readOnly
              value={`${collaboratorRef(initial?.collaborator_id ?? 0)} · ${
                initial?.collaborator?.name ?? 'collaborator'
              }`}
              className={`${inputClass} bg-[#f2ede5] cursor-not-allowed font-mono`}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tme-in" className={labelClass}>
              Clock-In <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="tme-in"
              type="datetime-local"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
              aria-invalid={Boolean(chronology || clockInError)}
              className={`${inputClass} font-mono`}
            />
            {clockInError && (
              <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                {clockInError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tme-out" className={labelClass}>
              Clock-Out
            </label>
            <input
              id="tme-out"
              type="datetime-local"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
              aria-invalid={Boolean(chronology)}
              className={`${inputClass} font-mono`}
            />
            <p className="text-[11px] text-[#5f5e5e]">
              Leave it empty for a shift still in progress.
            </p>
          </div>
        </div>

        {chronology && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {chronology}
          </p>
        )}
        {clash && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {overlapError(clash)}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tme-break" className={labelClass}>
              Unpaid break (minutes) <span className="text-[#ae001a]">*</span>
            </label>
            <input
              id="tme-break"
              type="number"
              min={0}
              step={5}
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              aria-invalid={Boolean(breakError)}
              className={`${inputClass} font-mono`}
            />
            {breakError && (
              <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
                {breakError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>Net payable</span>
            <p
              data-testid="net-preview"
              className="px-3 py-2 border border-[#e8e2d8] rounded bg-[#fef9f1] text-sm font-mono text-[#1d1c17]"
            >
              {preview !== null
                ? `${preview.toFixed(2)} hrs`
                : clockIn
                  ? 'In progress'
                  : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tme-reason" className={labelClass}>
            Adjustment reason <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="tme-reason"
            value={isCustom ? '__custom__' : reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputClass}
          >
            {ADJUSTMENT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="__custom__">Other (describe it)…</option>
          </select>
          {isCustom && (
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              maxLength={255}
              placeholder="Describe why this entry is being logged by hand"
              className={inputClass}
              aria-label="Custom adjustment reason"
            />
          )}
          {effectiveReason.length === 0 && (
            <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
              {REASON_REQUIRED_ERROR}
            </p>
          )}
          <p className="text-[11px] text-[#5f5e5e]">
            Saved with your user and a timestamp. Corrections keep the original values in the
            entry&apos;s revision history.
          </p>
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={
            submitting ? 'Saving…' : mode === 'create' ? 'Log Time Entry' : 'Save Adjustment'
          }
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

export default TimeEntryFormDrawer;
