// Directorio de colaboradores: la plantilla del comercio, su cuenta de plataforma, su rol
// operativo y su turno.
//
// El aislamiento por comercio lo impone el token en el backend; el `merchant_id` que se
// envía al crear se valida allí contra el JWT, así que aquí no es una defensa sino el dato
// que el DTO exige.

import React, { useEffect, useMemo, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  Collaborator,
  CollaboratorSummary,
  CreateCollaboratorDto,
  UpdateCollaboratorDto,
} from '../../../../types/collaborator';
import {
  COLLABORATOR_STATUSES,
  COLLABORATOR_STATUS_LABELS,
  SHIFT_ROLES,
  SHIFT_ROLE_LABELS,
  collaboratorStatusBadgeStyle,
  collaboratorStatusLabel,
  shiftRoleLabel,
} from '../../../../types/collaborator';
import type { MerchantUser } from '../../../../types/user';
import {
  DEFAULT_COLLABORATOR_FILTERS,
  collaboratorEmail,
  collaboratorInitials,
  collaboratorRef,
  conflictMessageFor,
  filterCollaborators,
  formatRegistrationDate,
  hasActiveFilters,
  userRef,
  type CollaboratorFilters,
} from '../../../../lib/collaborators';
import { shiftHours, shiftLabel, type ShiftRef } from '../../../../lib/table-assignments';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';
import { HrQuickLinks } from './HrQuickLinks';
import { CollaboratorFormDrawer, type CollaboratorDraft } from './CollaboratorFormDrawer';
import { CollaboratorDetailDrawer } from './CollaboratorDetailDrawer';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// Baja lógica: la fila sigue en base para no romper el histórico de comandas y cajas.
const DELETED_STATUS = 'deleted';

const ConfirmDeleteDialog: React.FC<{
  collaborator: Collaborator;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ collaborator, submitting, onCancel, onConfirm }) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Remove Collaborator"
      subtitle="Human Resources"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close removal confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Remove <strong>{collaborator.name}</strong> from the directory? Their platform
          account stays untouched and can be linked to a new profile later.
        </p>
        <p className="text-[11px] text-[#5f5e5e] italic">
          Past orders, shifts and cash drawer sessions keep pointing at this record.
        </p>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Removing…' : 'Remove Collaborator'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={onConfirm}
          destructive
        />
      </div>
    </AppModal>
  );
};

interface CollaboratorsViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const CollaboratorsView: React.FC<CollaboratorsViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const activeMerchantId = merchantId ?? 1;

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [users, setUsers] = useState<MerchantUser[]>([]);
  // Por qué no hay cuentas que ofrecer. Sin esto, un fallo de carga y "todas enlazadas"
  // se veían igual en el formulario, y el mensaje acusaba al dato equivocado.
  const [usersError, setUsersError] = useState('');
  const [shifts, setShifts] = useState<ShiftRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<CollaboratorFilters>(DEFAULT_COLLABORATOR_FILTERS);

  const [formDrawer, setFormDrawer] = useState<null | {
    mode: 'create' | 'edit';
    collaborator?: Collaborator;
  }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [detail, setDetail] = useState<Collaborator | null>(null);
  const [summary, setSummary] = useState<CollaboratorSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const [deleting, setDeleting] = useState<Collaborator | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
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

  const fetchCollaborators = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/collaborators?limit=100`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar los colaboradores');
      const json = await res.json();
      setCollaborators(
        ((json.data ?? []) as Collaborator[]).filter((c) => c.status !== DELETED_STATUS),
      );
    } catch (err) {
      console.error('Error fetching collaborators:', err);
      setError('Failed to load collaborators. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContext = async () => {
    // Las cuentas se piden por /users/merchant/{id}: el listado raíz `GET /users` es
    // exclusivo de PORTAL_ADMIN y a un administrador de comercio le devuelve 403, así que
    // el desplegable se quedaba vacío sin que nadie se enterara.
    setUsersError('');
    try {
      // El comercio sale del prop, no de localStorage: la vista ya lo recibe y así el
      // listado no depende de un segundo lugar donde ese id podría estar desfasado.
      const res = await fetch(`${API_BASE}/users/merchant/${activeMerchantId}`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to load platform accounts.');
      }
      const json = await res.json();
      setUsers(((json.data ?? []) as MerchantUser[]).filter((u) => u.isActive !== false));
    } catch (err) {
      console.error('Error fetching platform accounts for collaborators:', err);
      setUsersError(
        err instanceof Error
          ? err.message
          : 'Failed to load platform accounts. Please try again.',
      );
    }

    try {
      const shiftRes = await fetch(`${API_BASE}/shifts?limit=100`, { headers: authHeaders() });
      if (shiftRes.ok) {
        const json = await shiftRes.json();
        setShifts(((json.data ?? []) as ShiftRef[]).filter((s) => s.status !== 'deleted'));
      }
    } catch (err) {
      console.error('Error fetching shifts for collaborators:', err);
    }
  };

  useEffect(() => {
    fetchCollaborators();
    fetchContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  const shiftById = useMemo(() => {
    const m = new Map<number, ShiftRef>();
    shifts.forEach((s) => m.set(s.id, s));
    return m;
  }, [shifts]);

  const visible = useMemo(
    () => filterCollaborators(collaborators, filters),
    [collaborators, filters],
  );

  const patch = (next: Partial<CollaboratorFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  const clearFilters = () => setFilters(DEFAULT_COLLABORATOR_FILTERS);

  // ---------------- Alta y edición ----------------

  const handleCreate = async (draft: CollaboratorDraft) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const body: CreateCollaboratorDto = {
        user_id: draft.user_id,
        merchant_id: activeMerchantId,
        name: draft.name,
        role: draft.role,
        status: draft.status,
        shift_id: draft.shift_id,
      };
      const res = await fetch(`${API_BASE}/collaborators`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // El 409 del índice único se traduce al mensaje que nombra la cuenta concreta.
        throw new Error(
          res.status === 409
            ? conflictMessageFor(draft.user_id, json.message)
            : json.message || 'Failed to register the collaborator',
        );
      }
      await fetchCollaborators();
      setFormDrawer(null);
      setToast({ message: 'Collaborator registered successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register the collaborator');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdate = async (id: number, draft: CollaboratorDraft) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      // El backend actualiza con PUT (no PATCH) y con whitelist: user_id y merchant_id no
      // viajan, porque reasignarlos cambiaría de dueño la ficha entera.
      const body: UpdateCollaboratorDto = {
        name: draft.name,
        role: draft.role,
        status: draft.status,
        shift_id: draft.shift_id,
      };
      const res = await fetch(`${API_BASE}/collaborators/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to update the collaborator');
      await fetchCollaborators();
      setFormDrawer(null);
      setToast({ message: 'Collaborator updated successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update the collaborator');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/collaborators/${deleting.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to remove the collaborator');
      }
      setCollaborators((prev) => prev.filter((c) => c.id !== deleting.id));
      setDeleting(null);
      setToast({ message: 'Collaborator removed successfully', type: 'success' });
    } catch (err) {
      setDeleting(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to remove the collaborator',
        type: 'error',
      });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ---------------- Detalle ----------------

  const openDetail = async (collaborator: Collaborator) => {
    setDetail(collaborator);
    await loadSummary(collaborator.id);
  };

  const loadSummary = async (id: number) => {
    setSummaryLoading(true);
    setSummaryError('');
    setSummary(null);
    try {
      const res = await fetch(`${API_BASE}/collaborators/${id}/summary`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'Failed to load the operational summary');
      setSummary(json.data as CollaboratorSummary);
    } catch (err) {
      setSummaryError(
        err instanceof Error ? err.message : 'Failed to load the operational summary',
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  const isTrueEmpty = !loading && !error && collaborators.length === 0;
  const isFilteredEmpty =
    !loading && !error && collaborators.length > 0 && visible.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchCollaborators}
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
      <div className="bg-white border border-[#e8e2d8] p-6 rounded shadow-sm">
        <h2 className="text-[#ae001a] font-bold text-heading-lg tracking-wider uppercase">
          Collaborators Database
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          The staff roster — who they are on the floor, which platform account they sign in
          with, and the shift they belong to.
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
            value={filters.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Search by name, #CLB-id, #USR-id or email..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search collaborators"
          />
        </div>
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
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          {COLLABORATOR_STATUSES.map((s) => (
            <option key={s} value={s}>
              {COLLABORATOR_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.shiftId}
          onChange={(e) => patch({ shiftId: e.target.value })}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none min-w-[160px]"
          aria-label="Filter by shift"
        >
          <option value="">All Shifts</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {shiftLabel(s)}
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
              person_add
            </span>
            Register Collaborator
          </button>
        )}
        {hasActiveFilters(filters) && (
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
          data-testid="collaborators-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            badge
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No collaborators registered. Click &apos;Register Collaborator&apos; to link a
            platform account to a staff profile.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              person_add
            </span>
            Register Collaborator
          </button>
        </div>
      )}

      {(loading || collaborators.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              COLLABORATORS
            </span>
            <span className="text-white/50 text-xs">
              {loading
                ? 'Loading...'
                : `${visible.length} ${visible.length === 1 ? 'collaborator' : 'collaborators'}`}
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
                    Platform Account
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Role
                  </th>
                  <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Shift
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Registered
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
                      {Array.from({ length: 7 }).map((_, c) => (
                        <td key={c} className="px-6 py-4">
                          <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : isFilteredEmpty ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span
                          className="material-symbols-outlined text-[#5f5e5e] text-4xl"
                          aria-hidden="true"
                        >
                          search_off
                        </span>
                        <p className="text-sm text-[#5f5e5e]">
                          No collaborators match your active filters
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
                  visible.map((c) => {
                    const shift = c.shift ?? (c.shift_id ? shiftById.get(c.shift_id) : null);
                    return (
                      <tr key={c.id} className="group hover:bg-[#f8f3eb] transition-colors">
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-3">
                            <span
                              data-testid={`collaborator-avatar-${c.id}`}
                              aria-hidden="true"
                              className="w-9 h-9 rounded-full bg-[#ae001a] text-white flex items-center justify-center text-xs font-black shrink-0"
                            >
                              {collaboratorInitials(c.name)}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-bold text-[#1d1c17] truncate">
                                {c.name}
                              </span>
                              <span className="block text-xs text-[#5f5e5e] font-mono">
                                {collaboratorRef(c.id)}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            title={collaboratorEmail(c) || 'No linked account email'}
                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#ece8e0] text-[#1d1c17] font-mono"
                          >
                            {userRef(c.user_id)}
                          </span>
                          <span className="block text-xs text-[#5f5e5e] mt-1 truncate max-w-[200px]">
                            {collaboratorEmail(c) || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-[#1d1c17]/5 text-[#1d1c17]">
                            <span
                              className="material-symbols-outlined text-[14px]"
                              aria-hidden="true"
                            >
                              work
                            </span>
                            {shiftRoleLabel(c.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            data-testid={`collaborator-status-${c.id}`}
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${collaboratorStatusBadgeStyle(
                              c.status,
                            )}`}
                          >
                            {collaboratorStatusLabel(c.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {shift ? (
                            <>
                              <p className="text-sm text-[#1d1c17]">{shiftLabel(shift)}</p>
                              <p className="text-xs text-[#5f5e5e] font-mono">
                                {shiftHours(shift)}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-[#5f5e5e] italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-[#5f5e5e] font-mono whitespace-nowrap">
                            {formatRegistrationDate(c.created_at)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void openDetail(c)}
                              aria-label={`View profile details for ${c.name}`}
                              className="px-3 py-1.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <span
                                className="material-symbols-outlined text-[16px]"
                                aria-hidden="true"
                              >
                                badge
                              </span>
                              View Profile
                            </button>
                            <span className="flex gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => {
                                  setFormError('');
                                  setFormDrawer({ mode: 'edit', collaborator: c });
                                }}
                                aria-label={`Edit profile for ${c.name}`}
                                title="Edit profile"
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span
                                  className="material-symbols-outlined text-[20px]"
                                  aria-hidden="true"
                                >
                                  edit
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleting(c)}
                                aria-label={`Remove ${c.name}`}
                                title="Remove collaborator"
                                className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                              >
                                <span
                                  className="material-symbols-outlined text-[20px]"
                                  aria-hidden="true"
                                >
                                  delete
                                </span>
                              </button>
                            </span>
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

      <HrQuickLinks active="collaborators" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick register collaborator"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          person_add
        </span>
      </button>

      {formDrawer && (
        <CollaboratorFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.collaborator}
          users={users}
          usersError={usersError}
          collaborators={collaborators}
          shifts={shifts}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(draft) =>
            formDrawer.mode === 'create'
              ? handleCreate(draft)
              : handleUpdate(formDrawer.collaborator!.id, draft)
          }
        />
      )}

      {detail && (
        <CollaboratorDetailDrawer
          collaborator={detail}
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          onClose={() => {
            setDetail(null);
            setSummary(null);
          }}
          onRetry={() => void loadSummary(detail.id)}
        />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          collaborator={deleting}
          submitting={deleteSubmitting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default CollaboratorsView;
