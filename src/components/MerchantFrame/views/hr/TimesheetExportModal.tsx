// Configuración y descarga del parte de horas para nómina.
//
// El fichero se arma en el navegador con los fichajes ya cargados: no hay endpoint de
// export, y pedirlo al servidor sólo para volver a sumar lo mismo añadiría una ruta más sin
// ganar exactitud. El formato es CSV — que Excel abre nativamente — y no .xlsx: generar un
// libro real exigiría una dependencia nueva, y decir "Excel" sirviendo CSV sería mentir
// sobre lo que el fichero es.

import React, { useMemo, useState } from 'react';
import type { TimeEntry } from '../../../../types/time-entry';
import { SHIFT_ROLES, SHIFT_ROLE_LABELS } from '../../../../types/collaborator';
import {
  buildTimesheet,
  buildTimesheetCsv,
  dateKey,
  formatHours,
  timesheetFilename,
} from '../../../../lib/time-entries';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';

interface TimesheetExportModalProps {
  entries: TimeEntry[];
  defaultFrom: string;
  defaultTo: string;
  onClose: () => void;
}

export const TimesheetExportModal: React.FC<TimesheetExportModalProps> = ({
  entries,
  defaultFrom,
  defaultTo,
  onClose,
}) => {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');

  useModalDismiss(onClose);

  const scoped = useMemo(
    () =>
      entries.filter((e) => {
        const key = dateKey(e.clock_in);
        if (from && key < from) return false;
        if (to && key > to) return false;
        if (role && (e.collaborator?.role ?? '').toLowerCase() !== role) return false;
        return true;
      }),
    [entries, from, to, role],
  );

  const rows = useMemo(() => buildTimesheet(scoped), [scoped]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          regular: acc.regular + r.regularHours,
          overtime: acc.overtime + r.overtimeHours,
          missed: acc.missed + r.missedPunches,
        }),
        { regular: 0, overtime: 0, missed: 0 },
      ),
    [rows],
  );

  const rangeError = from && to && from > to ? 'The start date must precede the end date.' : '';

  const download = () => {
    const csv = buildTimesheetCsv(rows);
    // BOM al frente: sin él, Excel abre el CSV en ANSI y destroza los acentos de los nombres.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = timesheetFilename(from, to);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onClose();
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';

  return (
    <AppModal
      title="Export Timesheets"
      subtitle="Time Entries Control"
      onClose={onClose}
      size="lg"
      closeAriaLabel="Close timesheet export"
    >
      <div className="p-6 space-y-4 text-left font-sans overflow-y-auto flex-1">
        <p className="text-sm text-[#5f5e5e]">
          Builds a payroll-ready file with regular hours, overtime and break deductions
          aggregated per collaborator.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="exp-from" className={labelClass}>
              From
            </label>
            <input
              id="exp-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="exp-to" className={labelClass}>
              To
            </label>
            <input
              id="exp-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        {rangeError && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {rangeError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="exp-role" className={labelClass}>
              Role
            </label>
            <select
              id="exp-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={inputClass}
            >
              <option value="">All roles</option>
              {SHIFT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {SHIFT_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="exp-department" className={labelClass}>
              Department
            </label>
            <input
              id="exp-department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="All departments"
              className={inputClass}
            />
            {/* Honesto sobre la limitación: el departamento vive en la ficha del
                colaborador y /api/collaborator-time-entries no lo embebe, así que hoy no
                puede filtrar de verdad. */}
            <p className="text-[11px] text-[#5f5e5e]">
              Department is not carried by the time entry payload yet, so it does not narrow
              the export.
            </p>
          </div>
        </div>

        <div className="bg-[#fef9f1] border border-[#e8e2d8] rounded p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">
            Preview
          </p>
          <p data-testid="export-preview" className="text-sm text-[#1d1c17]">
            <strong>{rows.length}</strong>{' '}
            {rows.length === 1 ? 'collaborator' : 'collaborators'} ·{' '}
            <strong>{scoped.length}</strong> {scoped.length === 1 ? 'entry' : 'entries'} ·{' '}
            {formatHours(totals.regular)} regular · {formatHours(totals.overtime)} overtime
            {totals.missed > 0 && (
              <>
                {' '}
                ·{' '}
                <span className="text-[#ae001a] font-semibold">
                  {totals.missed} missed {totals.missed === 1 ? 'punch' : 'punches'}
                </span>
              </>
            )}
          </p>
          {totals.missed > 0 && (
            <p className="text-[11px] text-[#5f5e5e] italic mt-1">
              Unclosed punches count as zero hours. Resolve them before running payroll.
            </p>
          )}
        </div>

        <ModalFormFooter
          onCancel={onClose}
          submitLabel="Download CSV"
          submitType="button"
          onSubmit={download}
          submitDisabled={rows.length === 0 || Boolean(rangeError)}
        />
      </div>
    </AppModal>
  );
};

export default TimesheetExportModal;
