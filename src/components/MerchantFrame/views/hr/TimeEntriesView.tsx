// Control de fichajes: la jornada de cada colaborador, sus incidencias y lo que se paga.
//
// El estado de cada fila (en curso, tarde, sin cerrar, con horas extra) NO es una columna:
// se deriva de las marcas y del turno programado. Por eso el filtro por estado también se
// aplica en cliente, sobre el mismo cálculo que pinta el badge — si uno viniera del servidor
// y otro de aquí, acabarían discrepando.

import React, { useEffect, useMemo, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  CreateTimeEntryDto,
  TimeEntry,
  TimeEntryRevision,
  UpdateTimeEntryDto,
} from '../../../../types/time-entry';
import {
  PUNCH_STATUSES,
  PUNCH_STATUS_BADGE_STYLES,
  PUNCH_STATUS_LABELS,
} from '../../../../types/time-entry';
import type { Collaborator } from '../../../../types/collaborator';
import {
  SHIFT_ROLES,
  SHIFT_ROLE_LABELS,
  shiftRoleLabel,
} from '../../../../types/collaborator';
import { collaboratorRef } from '../../../../lib/collaborators';
import {
  classifyEntry,
  clockTime,
  defaultTimeEntryFilters,
  entryDate,
  filterTimeEntries,
  formatBreak,
  formatHours,
  hasActiveTimeFilters,
  netHours,
  tardyLabel,
  timeEntryRef,
  type TimeEntryFilters,
} from '../../../../lib/time-entries';
import { Toast } from '../../shared/Toast';
import { HrQuickLinks } from './HrQuickLinks';
import { TimeEntryFormDrawer, type TimeEntryDraft } from './TimeEntryFormDrawer';
import { TimeEntryDetailDrawer } from './TimeEntryDetailDrawer';
import { TimesheetExportModal } from './TimesheetExportModal';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

interface TimeEntriesViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const TimeEntriesView: React.FC<TimeEntriesViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const activeMerchantId = merchantId ?? 1;

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<TimeEntryFilters>(() => defaultTimeEntryFilters());

  const [formDrawer, setFormDrawer] = useState<null | {
    mode: 'create' | 'edit';
    entry?: TimeEntry;
  }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [detail, setDetail] = useState<TimeEntry | null>(null);
  const [revisions, setRevisions] = useState<TimeEntryRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState('');

  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const authHeaders = (): Record<string, string> => {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const handleUnauthorized = () => {
    clearAuthSession();
    window.location.href = '/login';
  };

  const fetchEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/collaborator-time-entries?limit=100`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar los fichajes');
      const json = await res.json();
      setEntries((json.data ?? []) as TimeEntry[]);
    } catch (err) {
      console.error('Error fetching time entries:', err);
      setError('Failed to load time entries. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContext = async () => {
    try {
      const res = await fetch(`${API_BASE}/collaborators?limit=100`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setCollaborators(
          ((json.data ?? []) as Collaborator[]).filter((c) => c.status !== 'deleted'),
        );
      }
    } catch (err) {
      console.error('Error fetching collaborators for time entries:', err);
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  const visible = useMemo(() => filterTimeEntries(entries, filters), [entries, filters]);

  const patch = (next: Partial<TimeEntryFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  const clearFilters = () => setFilters(defaultTimeEntryFilters());

  // Cuántas jornadas siguen abiertas ahora mismo: el dato que un supervisor mira primero.
  const onDutyCount = useMemo(
    () => entries.filter((e) => classifyEntry(e) === 'on_duty').length,
    [entries],
  );

  // ---------------- Alta y corrección ----------------

  const handleCreate = async (draft: TimeEntryDraft) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const collaborator = collaborators.find((c) => c.id === draft.collaborator_id);
      const body: CreateTimeEntryDto = {
        // El DTO exige la compañía; se toma de la ficha del colaborador, que es quien la
        // conoce, y se cae al comercio activo si la fila no la trae hidratada.
        company_id: collaborator?.merchant?.id ?? activeMerchantId,
        merchant_id: activeMerchantId,
        collaborator_id: draft.collaborator_id,
        clock_in: draft.clock_in,
        clock_out: draft.clock_out,
        break_minutes: draft.break_minutes,
        adjustment_reason: draft.adjustment_reason,
      };
      const res = await fetch(`${API_BASE}/collaborator-time-entries`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to log the time entry');
      await fetchEntries();
      setFormDrawer(null);
      setToast({ message: 'Time entry logged successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log the time entry');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdate = async (id: number, draft: TimeEntryDraft) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      // Las horas no viajan: el servidor las recalcula desde las marcas. Mandarlas
      // permitiría cuadrar la nómina sin que los fichajes lo respalden.
      const body: UpdateTimeEntryDto = {
        clock_in: draft.clock_in,
        clock_out: draft.clock_out,
        break_minutes: draft.break_minutes,
        adjustment_reason: draft.adjustment_reason,
      };
      const res = await fetch(`${API_BASE}/collaborator-time-entries/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to adjust the time entry');
      await fetchEntries();
      setFormDrawer(null);
      setToast({ message: 'Punch adjusted — the correction is on record', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to adjust the time entry');
    } finally {
      setFormSubmitting(false);
    }
  };

  // ---------------- Detalle ----------------

  const openDetail = async (entry: TimeEntry) => {
    setDetail(entry);
    await loadRevisions(entry.id);
  };

  const loadRevisions = async (id: number) => {
    setRevisionsLoading(true);
    setRevisionsError('');
    setRevisions([]);
    try {
      const res = await fetch(`${API_BASE}/collaborator-time-entries/${id}/revisions`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load the audit history');
      setRevisions((json.data ?? []) as TimeEntryRevision[]);
    } catch (err) {
      setRevisionsError(
        err instanceof Error ? err.message : 'Failed to load the audit history',
      );
    } finally {
      setRevisionsLoading(false);
    }
  };

  const isTrueEmpty = !loading && !error && entries.length === 0;
  const isFilteredEmpty = !loading && !error && entries.length > 0 && visible.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchEntries}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const openCreate = () => {
    setFormError('');
    setFormDrawer({ mode: 'create' });
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">
            Time Entries Control
          </h2>
          <p className="text-[#5f5e5e] text-body-sm mt-1">
            Daily punches, break deductions and the hours that actually get paid.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onDutyCount > 0 && (
            <span
              data-testid="on-duty-counter"
              className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-blue-500/10 text-blue-700"
            >
              {onDutyCount} on duty now
            </span>
          )}
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="px-5 py-2.5 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:text-[#ae001a] transition-colors duration-200 flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              file_download
            </span>
            Export Timesheets
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <span
            className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#5f5e5e]"
            aria-hidden="true"
          >
            search
          </span>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Search by name, #CLB-id or #TME-id..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search time entries"
          />
        </div>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => patch({ from: e.target.value })}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm font-mono focus:border-[#ae001a] outline-none"
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => patch({ to: e.target.value })}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm font-mono focus:border-[#ae001a] outline-none"
          aria-label="To date"
        />
        <select
          value={filters.role}
          onChange={(e) => patch({ role: e.target.value })}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by role"
        >
          <option value="">All Roles</option>
          {SHIFT_ROLES.map((r) => (
            <option key={r} value={r}>
              {SHIFT_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => patch({ status: e.target.value })}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by punch status"
        >
          <option value="">All Statuses</option>
          {PUNCH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PUNCH_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {!isTrueEmpty && (
          <button
            type="button"
            onClick={openCreate}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              edit_calendar
            </span>
            Log Manual Time Entry
          </button>
        )}
        {hasActiveTimeFilters(filters) && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {isTrueEmpty && (
        <div
          data-testid="time-entries-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            timer
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No time entries recorded. Click &apos;Log Manual Time Entry&apos; to register a
            punch by hand.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              edit_calendar
            </span>
            Log Manual Time Entry
          </button>
        </div>
      )}

      {(loading || entries.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              TIME ENTRIES
            </span>
            <span className="text-white/50 text-xs">
              {loading
                ? 'Loading...'
                : `${visible.length} ${visible.length === 1 ? 'entry' : 'entries'}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Entry
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Collaborator
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Clock-In
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Clock-Out
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Break
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Net Hours
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8]">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span
                          className="material-symbols-outlined text-[#5f5e5e] text-4xl"
                          aria-hidden="true"
                        >
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e]">
                          No time entries match your active filters
                        </p>
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="text-[#ae001a] text-sm font-semibold hover:underline"
                        >
                          Clear filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  visible.map((e) => {
                    const status = classifyEntry(e);
                    const late = tardyLabel(e);
                    return (
                      <tr key={e.id} className="group hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">
                            {timeEntryRef(e.id)}
                          </p>
                          <p className="text-xs text-[#5f5e5e]">{entryDate(e.clock_in)}</p>
                          {e.is_edited && (
                            <span
                              data-testid={`entry-edited-${e.id}`}
                              title={e.adjustment_reason ?? 'Adjusted by a supervisor'}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#1d1c17]/5 text-[#1d1c17]"
                            >
                              <span
                                className="material-symbols-outlined text-[13px]"
                                aria-hidden="true"
                              >
                                edit_calendar
                              </span>
                              Adjusted
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-[#1d1c17]">
                            {e.collaborator?.name ?? `Collaborator #${e.collaborator_id}`}
                          </p>
                          <span className="inline-flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#1d1c17]/5 text-[#1d1c17]">
                              {shiftRoleLabel(e.collaborator?.role)}
                            </span>
                            <span className="text-xs text-[#5f5e5e] font-mono">
                              {collaboratorRef(e.collaborator_id)}
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p
                            data-testid={`entry-in-${e.id}`}
                            className="text-sm text-[#1d1c17] font-mono"
                          >
                            {clockTime(e.clock_in)}
                          </p>
                          {e.shift?.startTime && (
                            <p className="text-xs text-[#5f5e5e] font-mono">
                              sched {clockTime(e.shift.startTime)}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {e.clock_out ? (
                            <p
                              data-testid={`entry-out-${e.id}`}
                              className="text-sm text-[#1d1c17] font-mono"
                            >
                              {clockTime(e.clock_out)}
                            </p>
                          ) : (
                            <span
                              data-testid={`entry-in-progress-${e.id}`}
                              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-700"
                            >
                              In Progress
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-[#5f5e5e] font-mono">
                            {formatBreak(e.break_minutes)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            data-testid={`entry-net-${e.id}`}
                            className="text-sm font-semibold text-[#1d1c17] font-mono"
                          >
                            {formatHours(netHours(e))}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            data-testid={`entry-status-${e.id}`}
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${PUNCH_STATUS_BADGE_STYLES[status]}`}
                          >
                            {PUNCH_STATUS_LABELS[status]}
                          </span>
                          {late && (
                            <p className="text-[10px] font-bold text-amber-700 mt-1">{late}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void openDetail(e)}
                              aria-label={`Inspect time entry ${timeEntryRef(e.id)}`}
                              className="px-3 py-1.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <span
                                className="material-symbols-outlined text-[16px]"
                                aria-hidden="true"
                              >
                                schedule
                              </span>
                              Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFormError('');
                                setFormDrawer({ mode: 'edit', entry: e });
                              }}
                              aria-label={`Adjust punch ${timeEntryRef(e.id)}`}
                              title="Adjust punch"
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 opacity-30 group-hover:opacity-100"
                            >
                              <span
                                className="material-symbols-outlined text-[20px]"
                                aria-hidden="true"
                              >
                                edit_calendar
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <HrQuickLinks active="time-entries" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick log time entry"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          edit_calendar
        </span>
      </button>

      {formDrawer && (
        <TimeEntryFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.entry}
          collaborators={collaborators}
          entries={entries}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(draft) =>
            formDrawer.mode === 'create'
              ? handleCreate(draft)
              : handleUpdate(formDrawer.entry!.id, draft)
          }
        />
      )}

      {detail && (
        <TimeEntryDetailDrawer
          entry={detail}
          revisions={revisions}
          loading={revisionsLoading}
          error={revisionsError}
          onClose={() => {
            setDetail(null);
            setRevisions([]);
          }}
          onRetry={() => void loadRevisions(detail.id)}
        />
      )}

      {exportOpen && (
        <TimesheetExportModal
          entries={entries}
          defaultFrom={filters.from}
          defaultTo={filters.to}
          onClose={() => setExportOpen(false)}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default TimeEntriesView;
