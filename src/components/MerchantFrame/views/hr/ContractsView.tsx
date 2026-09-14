// Directorio de contratos de colaborador: los acuerdos laborales vigentes y pasados, con su
// vigencia, su estructura salarial y el documento firmado.
//
// El estado de cumplimiento no se pide al backend: se deriva de `active` y de `end_date`
// contra la fecha del sistema (ver lib/contracts.ts). Guardarlo sería tener dos verdades y
// que una envejeciera sola cada noche sin que nadie tocase la fila.

import React, { useEffect, useMemo, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type {
  CollaboratorContract,
  ContractRevision,
  CreateContractDto,
  UpdateContractDto,
} from '../../../../types/contract';
import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  employmentTypeBadgeStyle,
  employmentTypeLabel,
} from '../../../../types/contract';
import type { Collaborator } from '../../../../types/collaborator';
import { shiftRoleLabel } from '../../../../types/collaborator';
import {
  DEFAULT_CONTRACT_FILTERS,
  EXPIRY_WINDOWS,
  conflictMessageFor,
  contractCollaboratorName,
  contractCollaboratorRef,
  contractRef,
  contractStatusBadgeStyle,
  contractStatusLabel,
  expiryNotice,
  filterContracts,
  formatCompensation,
  formatContractDate,
  formatWeeklyHours,
  hasActiveFilters,
  type ContractFilters,
} from '../../../../lib/contracts';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';
import { Toast } from '../../shared/Toast';
import { HrQuickLinks } from './HrQuickLinks';
import { ContractFormDrawer, type ContractDraft } from './ContractFormDrawer';
import { ContractDetailDrawer } from './ContractDetailDrawer';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

// Los adjuntos se sirven en la raíz del API (`/uploads/...`), fuera del prefijo `/api`.
const DOCUMENT_BASE = API_BASE.replace(/\/api\/?$/, '');

const DELETED_STATUS = 'deleted';

const ConfirmDeleteDialog: React.FC<{
  contract: CollaboratorContract;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ contract, submitting, onCancel, onConfirm }) => {
  useModalDismiss(onCancel);
  return (
    <AppModal
      title="Delete Contract"
      subtitle="Human Resources"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close contract deletion confirmation"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#1d1c17]">
          Delete <strong>{contractRef(contract.id)}</strong> for{' '}
          <strong>{contractCollaboratorName(contract)}</strong>? Its amendment history goes
          with it.
        </p>
        <p className="text-[11px] text-[#5f5e5e] italic">
          To close an agreement while keeping the record, amend it and set the status to
          Terminated instead.
        </p>
        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Deleting…' : 'Delete Contract'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={onConfirm}
          destructive
        />
      </div>
    </AppModal>
  );
};

interface ContractsViewProps {
  onNavigate?: (view: string) => void;
  merchantId?: number;
}

export const ContractsView: React.FC<ContractsViewProps> = ({
  onNavigate,
  merchantId,
}) => {
  const activeMerchantId = merchantId ?? 1;

  const [contracts, setContracts] = useState<CollaboratorContract[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorsError, setCollaboratorsError] = useState('');
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ContractFilters>(DEFAULT_CONTRACT_FILTERS);

  const [formDrawer, setFormDrawer] = useState<null | {
    mode: 'create' | 'edit';
    contract?: CollaboratorContract;
  }>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [detail, setDetail] = useState<CollaboratorContract | null>(null);
  const [revisions, setRevisions] = useState<ContractRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState('');

  const [deleting, setDeleting] = useState<CollaboratorContract | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

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

  // La subida va como multipart: poner Content-Type a mano rompería el boundary.
  const uploadHeaders = (): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const handleUnauthorized = () => {
    clearAuthSession();
    window.location.href = '/login';
  };

  const fetchContracts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/collaborator-contracts?limit=100`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) throw new Error('Error al cargar los contratos');
      const json = await res.json();
      setContracts((json.data ?? []) as CollaboratorContract[]);
    } catch (err) {
      console.error('Error fetching contracts:', err);
      setError('Failed to load contracts. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const fetchContext = async () => {
    setCollaboratorsError('');
    try {
      const res = await fetch(`${API_BASE}/collaborators?limit=100`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to load collaborators.');
      }
      const json = await res.json();
      setCollaborators(
        ((json.data ?? []) as Collaborator[]).filter((c) => c.status !== DELETED_STATUS),
      );
    } catch (err) {
      console.error('Error fetching collaborators for contracts:', err);
      setCollaboratorsError(
        err instanceof Error ? err.message : 'Failed to load collaborators.',
      );
    }

    // La empresa no viaja en la sesión y el DTO de alta la exige, así que se resuelve desde
    // el propio comercio en lugar de inventarla a partir del merchant_id.
    try {
      const res = await fetch(`${API_BASE}/merchants/${activeMerchantId}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? {};
        const resolved = data.company_id ?? data.company?.id ?? null;
        if (resolved) setCompanyId(Number(resolved));
      }
    } catch (err) {
      console.error('Error resolving the company for contracts:', err);
    }
  };

  useEffect(() => {
    fetchContracts();
    fetchContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMerchantId]);

  const visible = useMemo(() => filterContracts(contracts, filters), [contracts, filters]);

  const patch = (next: Partial<ContractFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  const clearFilters = () => setFilters(DEFAULT_CONTRACT_FILTERS);

  // ---------------- Documento firmado ----------------

  const uploadDocument = async (contractId: number, file: File): Promise<void> => {
    const body = new FormData();
    body.append('document', file);
    const res = await fetch(`${API_BASE}/collaborator-contracts/${contractId}/document`, {
      method: 'POST',
      headers: uploadHeaders(),
      body,
    });
    if (res.status === 401) return handleUnauthorized();
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.message || 'The contract was saved but the document upload failed.');
    }
  };

  // ---------------- Alta y enmienda ----------------

  const handleCreate = async (draft: ContractDraft) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const body: CreateContractDto = {
        company_id: companyId ?? 1,
        merchant_id: activeMerchantId,
        collaborator_id: draft.collaborator_id,
        employment_type: draft.employment_type,
        pay_frequency: draft.pay_frequency,
        wage_rate: draft.wage_rate,
        working_hours_per_week: draft.working_hours_per_week,
        start_date: draft.start_date,
        end_date: draft.end_date,
        active: draft.active,
      };
      const res = await fetch(`${API_BASE}/collaborator-contracts`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // El 409 del solape se traduce al aviso que nombra el contrato que estorba.
        throw new Error(
          res.status === 409
            ? conflictMessageFor(contracts, draft.collaborator_id, json.message)
            : json.message || 'Failed to register the contract',
        );
      }
      if (draft.document && json.data?.id) {
        await uploadDocument(Number(json.data.id), draft.document);
      }
      await fetchContracts();
      setFormDrawer(null);
      setToast({ message: 'Contract registered successfully', type: 'success' });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to register the contract',
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdate = async (id: number, draft: ContractDraft) => {
    setFormSubmitting(true);
    setFormError('');
    try {
      const body: UpdateContractDto = {
        collaborator_id: draft.collaborator_id,
        employment_type: draft.employment_type,
        pay_frequency: draft.pay_frequency,
        wage_rate: draft.wage_rate,
        working_hours_per_week: draft.working_hours_per_week,
        start_date: draft.start_date,
        end_date: draft.end_date,
        active: draft.active,
      };
      const res = await fetch(`${API_BASE}/collaborator-contracts/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? conflictMessageFor(contracts, draft.collaborator_id, json.message)
            : json.message || 'Failed to amend the contract',
        );
      }
      if (draft.document) await uploadDocument(id, draft.document);
      await fetchContracts();
      setFormDrawer(null);
      setToast({ message: 'Contract amended successfully', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to amend the contract');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/collaborator-contracts/${deleting.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Failed to delete the contract');
      }
      setContracts((prev) => prev.filter((c) => c.id !== deleting.id));
      setDeleting(null);
      setToast({ message: 'Contract deleted successfully', type: 'success' });
    } catch (err) {
      setDeleting(null);
      setToast({
        message: err instanceof Error ? err.message : 'Failed to delete the contract',
        type: 'error',
      });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // ---------------- Inspección ----------------

  const loadRevisions = async (id: number) => {
    setRevisionsLoading(true);
    setRevisionsError('');
    setRevisions([]);
    try {
      const res = await fetch(`${API_BASE}/collaborator-contracts/${id}/revisions`, {
        headers: authHeaders(),
      });
      if (res.status === 401) return handleUnauthorized();
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json.message || 'Failed to load the amendment history');
      setRevisions((json.data ?? []) as ContractRevision[]);
    } catch (err) {
      setRevisionsError(
        err instanceof Error ? err.message : 'Failed to load the amendment history',
      );
    } finally {
      setRevisionsLoading(false);
    }
  };

  const openDetail = async (contract: CollaboratorContract) => {
    setDetail(contract);
    await loadRevisions(contract.id);
  };

  const openCreate = () => {
    setFormError('');
    setFormDrawer({ mode: 'create' });
  };

  const openAmend = (contract: CollaboratorContract) => {
    setFormError('');
    setFormDrawer({ mode: 'edit', contract });
  };

  const isTrueEmpty = !loading && !error && contracts.length === 0;
  const isFilteredEmpty =
    !loading && !error && contracts.length > 0 && visible.length === 0;

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center font-sans">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchContracts}
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
          Collaborator Contracts
        </h2>
        <p className="text-[#5f5e5e] text-body-sm mt-1">
          Employment agreements — who is under contract, on what terms, and which ones are
          about to run out.
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
            placeholder="Search by name, #CTR-id or #CLB-id..."
            className="w-full pl-11 pr-4 py-2 bg-[#fef9f1] rounded border border-[#e8e2d8] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none text-sm transition-all"
            aria-label="Search contracts"
          />
        </div>
        <select
          value={filters.employmentType}
          onChange={(e) => patch({ employmentType: e.target.value })}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by contract type"
        >
          <option value="">All Contract Types</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EMPLOYMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => patch({ status: e.target.value })}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by compliance status"
        >
          <option value="">All Statuses</option>
          {CONTRACT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CONTRACT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.expiringWithin}
          onChange={(e) => patch({ expiringWithin: e.target.value })}
          className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] outline-none"
          aria-label="Filter by expiration window"
        >
          <option value="">Any Expiration Date</option>
          {EXPIRY_WINDOWS.map((days) => (
            <option key={days} value={String(days)}>
              Next {days} Days
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
              description
            </span>
            Create New Contract
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
          data-testid="contracts-empty-state"
          className="bg-white border border-[#e8e2d8] p-16 flex flex-col items-center text-center rounded shadow-sm"
        >
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl" aria-hidden="true">
            description
          </span>
          <p className="text-[#5f5e5e] mt-4 max-w-md text-sm leading-relaxed">
            No contracts registered. Click &apos;Create New Contract&apos; to bind an
            employment agreement to a collaborator.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              description
            </span>
            Create New Contract
          </button>
        </div>
      )}

      {(loading || contracts.length > 0) && !isTrueEmpty && (
        <div className="bg-white border border-[#e8e2d8] overflow-hidden rounded shadow-sm">
          <div className="p-4 bg-[#222222] flex justify-between items-center">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              CONTRACTS
            </span>
            <span className="text-white/50 text-xs">
              {loading
                ? 'Loading...'
                : `${visible.length} ${visible.length === 1 ? 'contract' : 'contracts'}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
                <tr>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Contract
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Collaborator
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Validity
                  </th>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                    Compensation
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
                          No contracts match your active filters
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
                  visible.map((c) => (
                    <tr key={c.id} className="group hover:bg-[#f8f3eb] transition-colors">
                      <td className="px-6 py-4">
                        <span className="block font-bold text-[#1d1c17] font-mono">
                          {contractRef(c.id)}
                        </span>
                        <span className="block text-xs text-[#5f5e5e] mt-0.5">
                          {formatWeeklyHours(c.working_hours_per_week)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="block font-bold text-[#1d1c17] truncate max-w-[180px]">
                          {contractCollaboratorName(c)}
                        </span>
                        <span className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-[#1d1c17]/5 text-[#1d1c17]">
                            {shiftRoleLabel(c.collaborator?.role)}
                          </span>
                          <span className="text-xs text-[#5f5e5e] font-mono">
                            {contractCollaboratorRef(c.collaborator_id)}
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          data-testid={`contract-type-${c.id}`}
                          className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${employmentTypeBadgeStyle(
                            c.employment_type,
                          )}`}
                        >
                          {employmentTypeLabel(c.employment_type)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="block text-sm text-[#1d1c17] whitespace-nowrap">
                          {formatContractDate(c.start_date)}
                        </span>
                        <span className="block text-xs text-[#5f5e5e] whitespace-nowrap">
                          → {formatContractDate(c.end_date)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="block text-sm font-bold text-[#1d1c17] whitespace-nowrap">
                          {formatCompensation(c)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          data-testid={`contract-status-${c.id}`}
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${contractStatusBadgeStyle(
                            c,
                          )}`}
                        >
                          {contractStatusLabel(c)}
                        </span>
                        <span className="block text-[11px] text-[#5f5e5e] mt-1 whitespace-nowrap">
                          {expiryNotice(c)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void openDetail(c)}
                            aria-label={`Inspect contract ${contractRef(c.id)}`}
                            className="px-3 py-1.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span
                              className="material-symbols-outlined text-[16px]"
                              aria-hidden="true"
                            >
                              visibility
                            </span>
                            Inspect Contract
                          </button>
                          <span className="flex gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => openAmend(c)}
                              aria-label={`Amend contract ${contractRef(c.id)}`}
                              title="Amend contract"
                              className="p-1 text-[#1d1c17] hover:text-[#ae001a] transition-colors duration-200"
                            >
                              <span
                                className="material-symbols-outlined text-[20px]"
                                aria-hidden="true"
                              >
                                edit_document
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(c)}
                              aria-label={`Delete contract ${contractRef(c.id)}`}
                              title="Delete contract"
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <HrQuickLinks active="contracts" onNavigate={onNavigate} />

      <button
        type="button"
        onClick={openCreate}
        aria-label="Quick create contract"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#ae001a] hover:bg-[#930015] rounded-full shadow-lg flex items-center justify-center text-white transition-colors z-40"
      >
        <span className="material-symbols-outlined text-2xl" aria-hidden="true">
          description
        </span>
      </button>

      {formDrawer && (
        <ContractFormDrawer
          mode={formDrawer.mode}
          initial={formDrawer.contract}
          collaborators={collaborators}
          collaboratorsError={collaboratorsError}
          contracts={contracts}
          submitting={formSubmitting}
          formError={formError}
          onCancel={() => setFormDrawer(null)}
          onSubmit={(draft) =>
            formDrawer.mode === 'create'
              ? handleCreate(draft)
              : handleUpdate(formDrawer.contract!.id, draft)
          }
        />
      )}

      {detail && (
        <ContractDetailDrawer
          contract={detail}
          revisions={revisions}
          loading={revisionsLoading}
          error={revisionsError}
          documentBase={DOCUMENT_BASE}
          onClose={() => {
            setDetail(null);
            setRevisions([]);
          }}
          onRetry={() => void loadRevisions(detail.id)}
          onAmend={() => {
            setDetail(null);
            openAmend(detail);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          contract={deleting}
          submitting={deleteSubmitting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
};

export default ContractsView;
