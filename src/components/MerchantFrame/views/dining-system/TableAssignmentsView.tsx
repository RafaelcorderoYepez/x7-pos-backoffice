import React, { useState, useEffect, useMemo } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { DiningTable } from '../../../../types/dining-system';
import { zoneSwatchColor } from '../../../../types/dining-system';
import type {
  CollaboratorRef,
  DutyFilter,
  ShiftRef,
  TableAssignment,
} from '../../../../lib/table-assignments';
import {
  assignmentHaystack,
  collaboratorBadge,
  collaboratorLabel,
  conflictingAssignment,
  DUTY_FILTER_LABELS,
  dutyBadgeLabel,
  dutyBadgeStyle,
  formatDutyWindow,
  hasOpenChecks,
  isActiveDuty,
  isHistoricalShift,
  matchesDutyFilter,
  openOrdersReleaseWarning,
  reassignConflictPrompt,
  resolveActiveShiftId,
  shiftHours,
  shiftLabel,
} from '../../../../lib/table-assignments';
import { useDiningRealtime } from '../../../../lib/useDiningRealtime';
import { DiningSystemQuickLinks } from './DiningSystemQuickLinks';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter, ModalFormError } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

const DUTY_FILTERS: DutyFilter[] = ['all', 'active', 'released'];

// Lo que el drawer entrega al enviar. `assignedAt` no viaja: lo sella el servidor, y
// mandarlo desde el cliente sólo abriría la puerta a relojes desalineados entre tablets.
interface AssignmentDraft {
  shiftId: number;
  tableId: number;
  collaboratorId: number;
}

// ========================= FORM DRAWER =========================

interface AssignmentFormDrawerProps {
  tables: DiningTable[];
  shifts: ShiftRef[];
  collaborators: CollaboratorRef[];
  // Turno abierto: el drawer arranca ya apuntando ahí, que es donde ocurre el 99% del trabajo.
  defaultShiftId: string;
  // Asignaciones vivas, para avisar del conflicto ANTES de enviar.
  activeAssignments: TableAssignment[];
  submitting: boolean;
  formError: string;
  onCancel: () => void;
  onSubmit: (draft: AssignmentDraft) => void;
}

const AssignmentFormDrawer: React.FC<AssignmentFormDrawerProps> = ({
  tables,
  shifts,
  collaborators,
  defaultShiftId,
  activeAssignments,
  submitting,
  formError,
  onCancel,
  onSubmit,
}) => {
  const [shiftId, setShiftId] = useState(defaultShiftId);
  const [tableId, setTableId] = useState('');
  const [collaboratorId, setCollaboratorId] = useState('');
  // Filtros de teclado sobre los dos catálogos largos: en un local con 60 mesas, un select
  // pelado obliga a recorrer la lista entera con la rueda del ratón.
  const [tableQuery, setTableQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [staffQuery, setStaffQuery] = useState('');

  useModalDismiss(onCancel);

  // Zonas que de verdad tienen mesas. Se derivan del propio inventario en vez de pedir
  // /api/floor-zone: ofrecer una zona vacía sólo llevaría a un desplegable sin opciones.
  const zoneOptions = useMemo(() => {
    const byId = new Map<number, string>();
    tables.forEach((t) => {
      if (t.floorZone?.id != null) {
        byId.set(t.floorZone.id, t.floorZone.name ?? `Zone #${t.floorZone.id}`);
      }
    });
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [tables]);

  const visibleTables = useMemo(() => {
    const term = tableQuery.trim().toLowerCase();
    return tables.filter((t) => {
      if (zoneFilter && String(t.floorZone?.id ?? '') !== zoneFilter) return false;
      if (!term) return true;
      return [t.number ?? '', t.floorZone?.name ?? '', t.location ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [tables, tableQuery, zoneFilter]);

  const visibleStaff = useMemo(() => {
    const term = staffQuery.trim().toLowerCase();
    if (!term) return collaborators;
    return collaborators.filter((c) =>
      [c.name ?? '', c.firstName ?? '', c.lastName ?? '', c.role ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [collaborators, staffQuery]);

  // El conflicto ya no bloquea: se anuncia aquí y se resuelve con el traspaso de turno que
  // confirma el diálogo siguiente.
  const conflict = useMemo(() => {
    if (!shiftId || !tableId) return null;
    return conflictingAssignment(activeAssignments, Number(tableId), Number(shiftId));
  }, [shiftId, tableId, activeAssignments]);

  const collaboratorNum = Number(collaboratorId);
  const canSubmit =
    shiftId.trim().length > 0 &&
    tableId.trim().length > 0 &&
    Number.isInteger(collaboratorNum) &&
    collaboratorNum > 0;

  const handleZoneChange = (value: string) => {
    setZoneFilter(value);
    // Cambiar de zona invalida la mesa elegida si ya no pertenece a la lista visible: es
    // preferible obligar a reelegir que enviar una mesa que el operador cree haber cambiado.
    const stillVisible = tables.some(
      (t) => String(t.id) === tableId && (!value || String(t.floorZone?.id ?? '') === value),
    );
    if (!stillVisible) setTableId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    onSubmit({
      shiftId: Number(shiftId),
      tableId: Number(tableId),
      collaboratorId: collaboratorNum,
    });
  };

  const labelClass = 'text-[11px] font-bold text-[#5f5e5e] uppercase';
  const inputClass =
    'bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full';

  return (
    <AppModal
      title="Assign Table"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="lg"
      closeAriaLabel="Close assignment form"
    >
      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 overflow-y-auto flex-1 text-left font-sans"
      >
        {formError && <ModalFormError message={formError} />}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="asg-shift" className={labelClass}>
            Shift <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="asg-shift"
            autoFocus
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a shift…</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {shiftLabel(s)} · {shiftHours(s)}
                {isHistoricalShift(s) ? ' · closed' : ''}
              </option>
            ))}
          </select>
          {shifts.length === 0 && (
            <p className="text-[11px] text-[#5f5e5e] italic">
              No shifts available — create a shift first.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="asg-table" className={labelClass}>
            Table <span className="text-[#ae001a]">*</span>
          </label>
          <select
            id="asg-zone"
            value={zoneFilter}
            onChange={(e) => handleZoneChange(e.target.value)}
            className={`${inputClass} text-[13px]`}
            aria-label="Filter tables by zone"
          >
            <option value="">All zones</option>
            {zoneOptions.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={tableQuery}
            onChange={(e) => setTableQuery(e.target.value)}
            placeholder="Filter tables by number or location…"
            className={`${inputClass} text-[13px]`}
            aria-label="Filter tables"
          />
          <select
            id="asg-table"
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a table…</option>
            {visibleTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number} · {t.capacity} seats
                {t.floorZone?.name ? ` · ${t.floorZone.name}` : ''}
              </option>
            ))}
          </select>
          {visibleTables.length === 0 && (
            <p className="text-[11px] text-[#5f5e5e] italic">
              No table matches this zone and filter. Widen the filter to see the rest.
            </p>
          )}
          {conflict && (
            <p className="text-[11px] font-semibold text-[#ae001a]" role="status">
              {reassignConflictPrompt(
                tables.find((t) => String(t.id) === tableId)?.number ?? `#${tableId}`,
                collaboratorLabel(conflict),
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="asg-collaborator" className={labelClass}>
            Collaborator <span className="text-[#ae001a]">*</span>
          </label>
          {collaborators.length > 0 ? (
            <>
              <input
                type="text"
                value={staffQuery}
                onChange={(e) => setStaffQuery(e.target.value)}
                placeholder="Filter staff by name or role…"
                className={`${inputClass} text-[13px]`}
                aria-label="Filter collaborators"
              />
              <select
                id="asg-collaborator"
                value={collaboratorId}
                onChange={(e) => setCollaboratorId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a collaborator…</option>
                {visibleStaff.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || `#${c.id}`}
                    {c.role ? ` · ${c.role}` : ''}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              {/* Honesto sobre la limitación: sin la feature de colaboradores el backend
                  responde 403 y no hay catálogo de nombres que ofrecer. */}
              <input
                id="asg-collaborator"
                type="number"
                min={1}
                step={1}
                value={collaboratorId}
                onChange={(e) => setCollaboratorId(e.target.value)}
                className={`${inputClass} font-mono`}
                placeholder="e.g., 4"
              />
              <p className="text-[11px] text-[#5f5e5e]">
                The collaborator directory is not available on this plan, so the staff member is
                referenced by id.
              </p>
            </>
          )}
        </div>

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Assigning…' : 'Assign Table'}
          isSubmitting={submitting}
          submitDisabled={!canSubmit}
        />
      </form>
    </AppModal>
  );
};

// ========================= CONFLICT / REASSIGN =========================

// La mesa ya está cubierta en este turno. No se duplica la cobertura: se traspasa, y el
// diálogo deja claro a quién se le retira antes de tocar nada.
const ConfirmReassignDialog: React.FC<{
  tableNumber: string;
  holder: TableAssignment;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ tableNumber, holder, submitting, onCancel, onConfirm }) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Reassign Table"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close reassignment confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p role="alert" className="text-sm text-[#1d1c17]">
          {reassignConflictPrompt(tableNumber, collaboratorLabel(holder))}
        </p>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Reassigning…' : 'Reassign Table'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={onConfirm}
        />
      </div>
    </AppModal>
  );
};

// ========================= RELEASE CONFIRM =========================

const ConfirmReleaseDialog: React.FC<{
  assignment: TableAssignment;
  tableLabel: string;
  // Aviso, no bloqueo: el turno se acaba igual, pero alguien tiene que recoger esas cuentas.
  openChecksWarning: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ assignment, tableLabel, openChecksWarning, submitting, onCancel, onConfirm }) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Release Assignment"
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close release confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Release <strong className="font-mono">{tableLabel}</strong> from{' '}
          <strong>{collaboratorLabel(assignment)}</strong>? The table becomes free for a new
          assignment on this shift.
        </p>
        {openChecksWarning && (
          <p
            role="alert"
            className="text-[13px] font-semibold text-[#ae001a] bg-[#ae001a]/5 border border-[#ae001a]/20 rounded px-3 py-2"
          >
            {openChecksWarning}
          </p>
        )}
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Releasing…' : 'Release Table'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={onConfirm}
          destructive
        />
      </div>
    </AppModal>
  );
};

// ========================= MAIN VIEW =========================

interface TableAssignmentsViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const TableAssignmentsView: React.FC<TableAssignmentsViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const activeMerchantId = merchantId ?? 1;

  const [assignments, setAssignments] = useState<TableAssignment[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [shifts, setShifts] = useState<ShiftRef[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [dutyFilter, setDutyFilter] = useState<DutyFilter>('all');
  // null = el operador aún no ha tocado el selector, así que manda el turno abierto.
  // '' = ha elegido "All Shifts" a conciencia. Distinguirlos evita que una recarga de datos
  // le devuelva al turno de hoy justo cuando acaba de irse a revisar el de ayer.
  const [shiftFilter, setShiftFilter] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingDraft, setPendingDraft] = useState<{
    draft: AssignmentDraft;
    holder: TableAssignment;
  } | null>(null);
  const [releasing, setReleasing] = useState<TableAssignment | null>(null);
  const [releaseSubmitting, setReleaseSubmitting] = useState(false);
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

  const fetchAssignments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/table-assignments?limit=100`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar las asignaciones');
      const json = await res.json();
      setAssignments((json.data ?? []) as TableAssignment[]);
    } catch (err) {
      console.error('Error fetching table assignments:', err);
      setError('Failed to load table assignments. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContext = async () => {
    try {
      const [tblRes, shiftRes, staffRes] = await Promise.all([
        fetch(`${API_BASE}/tables?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/shifts?limit=100`, { headers: authHeaders() }),
        fetch(`${API_BASE}/collaborators?limit=100`, { headers: authHeaders() }),
      ]);
      if (tblRes.ok) {
        const json = await tblRes.json();
        setTables(((json.data ?? []) as DiningTable[]).filter((t) => t.status !== 'deleted'));
      }
      if (shiftRes.ok) {
        const json = await shiftRes.json();
        setShifts(((json.data ?? []) as ShiftRef[]).filter((s) => s.status !== 'deleted'));
      }
      // 403 cuando el plan no incluye la feature de colaboradores: el drawer cae entonces
      // al id numérico en vez de al catálogo de nombres.
      if (staffRes.ok) {
        const json = await staffRes.json();
        setCollaborators(
          ((json.data ?? []) as CollaboratorRef[]).filter(
            (c) => (c as { status?: string }).status !== 'deleted',
          ),
        );
      }
    } catch (err) {
      console.error('Error fetching tables/shifts for assignments:', err);
    }
  };

  useEffect(() => {
    fetchAssignments();
    fetchContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  const activeShiftId = useMemo(() => resolveActiveShiftId(shifts), [shifts]);

  // El turno que de verdad filtra la parrilla: el elegido, o el abierto mientras nadie elija.
  const effectiveShift = shiftFilter ?? activeShiftId;

  const tableById = useMemo(() => {
    const m = new Map<number, DiningTable>();
    tables.forEach((t) => m.set(t.id, t));
    return m;
  }, [tables]);

  const shiftById = useMemo(() => {
    const m = new Map<number, ShiftRef>();
    shifts.forEach((s) => m.set(s.id, s));
    return m;
  }, [shifts]);

  const tableOf = (a: TableAssignment): DiningTable | undefined =>
    tableById.get(a.tableId) ?? (a.table as DiningTable | undefined);

  const tableLabelOf = (a: TableAssignment): string =>
    tableOf(a)?.number ?? `Table #${a.tableId}`;

  const filteredAssignments = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return assignments.filter((a) => {
      if (term && !assignmentHaystack(a, tableById.get(a.tableId)).includes(term)) return false;
      if (!matchesDutyFilter(a, dutyFilter)) return false;
      if (effectiveShift && String(a.shiftId) !== effectiveShift) return false;
      return true;
    });
  }, [assignments, tableById, searchQuery, dutyFilter, effectiveShift]);

  // Sólo las vivas alimentan la exclusividad mesa/turno.
  const liveAssignments = useMemo(() => assignments.filter(isActiveDuty), [assignments]);

  const hasActiveFilter = Boolean(searchQuery || dutyFilter !== 'all' || effectiveShift);
  const clearFilters = () => {
    setSearchQuery('');
    setDutyFilter('all');
    setShiftFilter('');
  };

  // Crea la asignación. `assignedAt` y los timestamps los sella el servidor.
  const createAssignment = async (draft: AssignmentDraft) => {
    const res = await fetch(`${API_BASE}/table-assignments`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...draft, status: 'active' }),
    });
    if (res.status === 401) return handleUnauthorized();
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to assign the table');
  };

  // Cierra una cobertura: sella releasedAt y la desactiva. No borra, para no perder la
  // traza de quién cubrió qué durante el turno.
  const releaseAssignment = async (id: number) => {
    const res = await fetch(`${API_BASE}/table-assignments/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ releasedAt: new Date().toISOString(), status: 'inactive' }),
    });
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || 'Failed to release the assignment');
    }
  };

  const handleCreateSubmit = async (draft: AssignmentDraft) => {
    // Exclusividad mesa/turno: si ya hay alguien cubriéndola, se pide confirmación en vez
    // de duplicar la cobertura en silencio.
    const holder = conflictingAssignment(liveAssignments, draft.tableId, draft.shiftId);
    if (holder) {
      setPendingDraft({ draft, holder });
      return;
    }
    setFormSubmitting(true);
    setFormError('');
    try {
      await createAssignment(draft);
      await fetchAssignments();
      setFormOpen(false);
      setToast({ message: 'Table assigned successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to assign the table');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Traspaso de cobertura: se libera al camarero anterior y se crea la nueva fila. Si la
  // creación falla, la liberación ya está hecha — la mesa queda descubierta, que es un
  // estado visible y arreglable, y nunca con dos camareros a la vez.
  const handleReassignConfirm = async () => {
    if (!pendingDraft) return;
    setFormSubmitting(true);
    setFormError('');
    try {
      await releaseAssignment(pendingDraft.holder.id);
      await createAssignment(pendingDraft.draft);
      await fetchAssignments();
      setPendingDraft(null);
      setFormOpen(false);
      setToast({ message: 'Table duty transferred successfully', type: 'success' });
    } catch (err) {
      setPendingDraft(null);
      setFormError(err instanceof Error ? err.message : 'Failed to reassign the table');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleReleaseConfirm = async () => {
    if (!releasing) return;
    setReleaseSubmitting(true);
    try {
      await releaseAssignment(releasing.id);
      setReleasing(null);
      await fetchAssignments();
      setToast({ message: 'Assignment released successfully', type: 'success' });
    } catch (err) {
      setReleasing(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to release the assignment',
        type: 'error',
      });
    } finally {
      setReleaseSubmitting(false);
    }
  };

  // Las coberturas cambian desde las tablets de sala; el supervisor mira esta parrilla en
  // una pantalla fija y tiene que ver lo mismo que ellos.
  const { connected: liveConnected } = useDiningRealtime({
    onAssignmentChanged: (p) => {
      if (p.merchantId === activeMerchantId) fetchAssignments();
    },
    onTableStatusChanged: (p) => {
      if (p.merchantId !== activeMerchantId) return;
      setTables((prev) => prev.map((t) => (t.id === p.tableId ? { ...t, status: p.status } : t)));
    },
    onTableTransferred: (p) => {
      if (p.merchantId !== activeMerchantId) return;
      fetchAssignments();
      fetchContext();
    },
    onReconnect: () => {
      // Las asignaciones no tienen endpoint de delta: la lista es corta y una recarga
      // completa reconcilia igual de rápido.
      fetchAssignments();
      fetchContext();
    },
  });

  const isTrueEmpty = !loading && !error && assignments.length === 0;
  const isFilteredEmpty =
    !loading && !error && assignments.length > 0 && filteredAssignments.length === 0;

  const emptyCopy =
    "No staff assignments found for the selected shift. Click 'Assign Table' to dispatch collaborators to dining tables.";

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchAssignments}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left font-sans">
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">
          Table Assignments
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Who is serving which table on each shift, and when the table was released.
        </p>
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by collaborator, table or zone..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search assignments"
          />
        </div>
        <select
          value={effectiveShift}
          onChange={(e) => setShiftFilter(e.target.value)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[190px]"
          aria-label="Filter by shift"
        >
          <option value="">All Shifts</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {shiftLabel(s)}
              {isHistoricalShift(s) ? ' · closed' : ' · open'}
            </option>
          ))}
        </select>
        <select
          value={dutyFilter}
          onChange={(e) => setDutyFilter(e.target.value as DutyFilter)}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by duty status"
        >
          {DUTY_FILTERS.map((f) => (
            <option key={f} value={f}>
              {DUTY_FILTER_LABELS[f]}
            </option>
          ))}
        </select>
        {!isTrueEmpty && (
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setFormOpen(true);
            }}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              assignment_ind
            </span>
            Assign Table
          </button>
        )}
        {hasActiveFilter && (
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
          data-testid="table-assignments-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            assignment_ind
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">{emptyCopy}</p>
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setFormOpen(true);
            }}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              assignment_ind
            </span>
            Assign Table
          </button>
        </div>
      )}

      {(loading || assignments.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              TABLE ASSIGNMENTS
            </span>
            <span className="flex items-center gap-3">
              <span
                data-testid="assignments-realtime-status"
                title={
                  liveConnected
                    ? 'Live floor updates connected'
                    : 'Live floor updates unavailable — data refreshes on reload'
                }
                className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
                  liveConnected ? 'text-green-400' : 'text-white/40'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  {liveConnected ? 'sensors' : 'sensors_off'}
                </span>
                {liveConnected ? 'Live' : 'Offline'}
              </span>
              <span className="text-white/50 text-xs">
                {loading
                  ? 'Loading...'
                  : `${filteredAssignments.length} ${filteredAssignments.length === 1 ? 'assignment' : 'assignments'}`}
              </span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Collaborator
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Table &amp; Zone
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Shift
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Duty Window
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
                      {Array.from({ length: 6 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span
                          className="material-symbols-outlined text-[#5f5e5e] text-4xl"
                          aria-hidden="true"
                        >
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e] max-w-md">
                          {effectiveShift ? emptyCopy : 'No assignments match your active filters'}
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
                  filteredAssignments.map((a) => {
                    const tbl = tableOf(a);
                    const shift = shiftById.get(a.shiftId) ?? a.shift;
                    const zoneName = tbl?.floorZone?.name;
                    const badge = collaboratorBadge(a);
                    const onDuty = isActiveDuty(a);
                    return (
                      <tr key={a.id} className="group hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1d1c17]">
                            <span
                              className="material-symbols-outlined text-[16px]"
                              aria-hidden="true"
                            >
                              badge
                            </span>
                            {collaboratorLabel(a)}
                          </span>
                          {badge && (
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mt-0.5">
                              {badge}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-[#1d1c17] font-mono">{tableLabelOf(a)}</p>
                          {zoneName && (
                            <span className="mt-1 inline-flex items-center gap-1.5">
                              <span
                                data-testid={`assignment-zone-swatch-${a.id}`}
                                aria-hidden="true"
                                style={{
                                  backgroundColor: zoneSwatchColor(tbl?.floorZone?.color),
                                }}
                                className="inline-block w-3 h-3 rounded border border-[#e8e2d8] shrink-0"
                              />
                              <span className="text-xs text-[#5f5e5e]">{zoneName}</span>
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-[#1d1c17]">{shiftLabel(shift)}</p>
                          <p className="text-xs text-[#5f5e5e] font-mono">{shiftHours(shift)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p
                            data-testid={`assignment-duty-window-${a.id}`}
                            className="text-xs text-[#5f5e5e] font-mono whitespace-nowrap"
                          >
                            {formatDutyWindow(a)}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            data-testid={`assignment-status-${a.id}`}
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${dutyBadgeStyle(
                              a,
                            )}`}
                          >
                            {dutyBadgeLabel(a)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => setReleasing(a)}
                            disabled={!onDuty}
                            aria-label={`Release ${tableLabelOf(a)}`}
                            title={onDuty ? 'Release this table from the shift' : 'Already released'}
                            className="px-3 py-1.5 border border-[#e8e2d8] text-[10px] font-bold uppercase tracking-widest text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[#1d1c17] inline-flex items-center gap-1.5"
                          >
                            <span
                              className="material-symbols-outlined text-[16px]"
                              aria-hidden="true"
                            >
                              person_remove
                            </span>
                            Release
                          </button>
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

      <DiningSystemQuickLinks active="table-assignments" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => {
          setFormError('');
          setFormOpen(true);
        }}
        aria-label="Quick assign table"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          add
        </span>
      </button>

      {formOpen && (
        <AssignmentFormDrawer
          tables={tables}
          shifts={shifts}
          collaborators={collaborators}
          defaultShiftId={effectiveShift}
          activeAssignments={liveAssignments}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormOpen(false)}
          onSubmit={handleCreateSubmit}
        />
      )}

      {pendingDraft && (
        <ConfirmReassignDialog
          tableNumber={
            tables.find((t) => t.id === pendingDraft.draft.tableId)?.number ??
            `#${pendingDraft.draft.tableId}`
          }
          holder={pendingDraft.holder}
          submitting={formSubmitting}
          onCancel={() => setPendingDraft(null)}
          onConfirm={handleReassignConfirm}
        />
      )}

      {releasing && (
        <ConfirmReleaseDialog
          assignment={releasing}
          tableLabel={tableLabelOf(releasing)}
          openChecksWarning={
            hasOpenChecks(tableOf(releasing)) ? openOrdersReleaseWarning(tableLabelOf(releasing)) : ''
          }
          submitting={releaseSubmitting}
          onCancel={() => setReleasing(null)}
          onConfirm={handleReleaseConfirm}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default TableAssignmentsView;
