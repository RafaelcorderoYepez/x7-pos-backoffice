import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type {
  TipPoolMember,
  TipPoolMemberRecordStatus,
  CollaboratorOption,
} from '../../../../types/tip-pool-members';
import {
  createTipPoolMember,
  updateTipPoolMember,
  fetchTipPoolMembers,
  MOCK_COLLABORATOR_OPTIONS,
} from '../../../../api/tip-pool-members';
import { fetchTipPools } from '../../../../api/tip-pools';
import type { TipPool } from '../../../../types/tip-pools';

export interface TipPoolMemberFormDrawerProps {
  isOpen: boolean;
  member: TipPoolMember | null;
  onClose: () => void;
  onSaved?: (member: TipPoolMember) => void;
  companyId?: string;
  merchantId?: string;
  defaultTipPoolId?: number;
  existingMembers?: TipPoolMember[];
}

const DEFAULT_ROLES = [
  'WAITER',
  'BARTENDER',
  'BUSSER',
  'RUNNER',
  'SERVER',
  'HOST',
  'KITCHEN',
];

export const TipPoolMemberFormDrawer: React.FC<TipPoolMemberFormDrawerProps> = ({
  isOpen,
  member,
  onClose,
  onSaved,
  companyId = 'cmp-01',
  merchantId = 'mch-01',
  defaultTipPoolId,
  existingMembers = [],
}) => {
  if (!isOpen) return null;

  const isEditMode = member !== null;

  // Form Field State
  const [tipPoolId, setTipPoolId] = useState<string>(
    member ? String(member.tip_pool_id) : defaultTipPoolId ? String(defaultTipPoolId) : ''
  );
  const [collaboratorId, setCollaboratorId] = useState<string>(
    member ? String(member.collaborator_id) : ''
  );
  const [collaboratorSearchTerm, setCollaboratorSearchTerm] = useState<string>('');
  const [role, setRole] = useState<string>(member ? member.role : 'WAITER');
  const [weight, setWeight] = useState<string>(member ? String(member.weight) : '1.00');
  const [recordStatus, setRecordStatus] = useState<TipPoolMemberRecordStatus>(
    member ? member.record_status : 'ACTIVE'
  );

  // Data Select Options
  const [pools, setPools] = useState<TipPool[]>([]);
  const [collaborators] = useState<CollaboratorOption[]>(MOCK_COLLABORATOR_OPTIONS);
  const [allActiveMembers, setAllActiveMembers] = useState<TipPoolMember[]>(existingMembers);
  const [loadingPools, setLoadingPools] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoadingPools(true);
    fetchTipPools({ company_id: companyId, merchant_id: merchantId, record_status: 'ACTIVE' })
      .then((res) => setPools(res))
      .catch(() => setPools([]))
      .finally(() => setLoadingPools(false));

    fetchTipPoolMembers({ record_status: 'ACTIVE' })
      .then((membersList) => setAllActiveMembers(membersList))
      .catch(() => setAllActiveMembers(existingMembers));
  }, [companyId, merchantId, existingMembers]);

  useEffect(() => {
    if (!isOpen) return;
    if (member) {
      setTipPoolId(String(member.tip_pool_id));
      setCollaboratorId(String(member.collaborator_id));
      setRole(member.role);
      setWeight(String(member.weight));
      setRecordStatus(member.record_status);
    } else {
      setTipPoolId((prev) => prev || (defaultTipPoolId ? String(defaultTipPoolId) : pools[0] ? String(pools[0].id) : ''));
      setCollaboratorId((prev) => prev || (collaborators[0] ? String(collaborators[0].id) : ''));
      setRole('WAITER');
      setWeight('1.00');
      setRecordStatus('ACTIVE');
    }
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [member, isOpen, defaultTipPoolId]);

  const filteredCollaborators = useMemo(() => {
    if (!collaboratorSearchTerm.trim()) return collaborators;
    const term = collaboratorSearchTerm.trim().toLowerCase();
    return collaborators.filter(
      (c) =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
        c.role.toLowerCase().includes(term) ||
        `#clb-${c.id}`.toLowerCase().includes(term) ||
        String(c.id).includes(term)
    );
  }, [collaborators, collaboratorSearchTerm]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation 1: Parent Pool Selection
    if (!tipPoolId || isNaN(Number(tipPoolId))) {
      setErrorMessage('Please select a valid parent Tip Pool.');
      return;
    }

    // Validation 2: Collaborator Selection
    if (!collaboratorId) {
      setErrorMessage('Please select a valid collaborator.');
      return;
    }

    const cleanCollabId = String(collaboratorId).replace('#CLB-', '').replace('#clb-', '');
    const cleanPoolId = String(tipPoolId).replace('#POL-', '').replace('#pol-', '');

    // Validation 3: Unique Member-Pool Assignment Guard (Duplicate Constraint Check)
    if (recordStatus === 'ACTIVE') {
      const isDuplicate = allActiveMembers.some(
        (m) =>
          Number(m.tip_pool_id) === Number(cleanPoolId) &&
          String(m.collaborator_id).replace('#CLB-', '') === cleanCollabId &&
          m.record_status === 'ACTIVE' &&
          (!isEditMode || m.id !== member?.id)
      );

      if (isDuplicate) {
        setErrorMessage(
          `Collaborator #CLB-${cleanCollabId} is already assigned to Tip Pool #POL-${cleanPoolId}.`
        );
        return;
      }
    }

    // Validation 4: Role requirement
    const trimmedRole = role.trim().toUpperCase();
    if (!trimmedRole) {
      setErrorMessage('Please enter or select a valid functional pool role.');
      return;
    }

    // Validation 5: Weight factor numeric non-negative value & precision 5, scale 2 check
    const parsedWeight = parseFloat(weight);
    if (isNaN(parsedWeight) || parsedWeight < 0) {
      setErrorMessage('Distribution weight factor must be a valid non-negative number.');
      return;
    }

    if (parsedWeight > 999.99) {
      setErrorMessage('Distribution weight factor exceeds maximum precision 5, scale 2 (max 999.99 pts).');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditMode && member) {
        const updated = await updateTipPoolMember(member.id, {
          tip_pool_id: Number(cleanPoolId),
          collaborator_id: cleanCollabId,
          role: trimmedRole,
          weight: parsedWeight,
          record_status: recordStatus,
        });

        setSuccessMessage(`Tip Pool Member #${member.id} updated successfully!`);
        setTimeout(() => {
          onSaved?.(updated);
          onClose();
        }, 500);
      } else {
        const created = await createTipPoolMember({
          tip_pool_id: Number(cleanPoolId),
          collaborator_id: cleanCollabId,
          role: trimmedRole,
          weight: parsedWeight,
          record_status: recordStatus,
        });

        setSuccessMessage(`Collaborator assigned to Tip Pool #${cleanPoolId} successfully!`);
        setTimeout(() => {
          onSaved?.(created);
          onClose();
        }, 500);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save tip pool member assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm transition-opacity font-poppins"
      aria-labelledby="drawer-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 overflow-hidden" onClick={onClose}>
        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
          <div
            className="pointer-events-auto w-screen max-w-lg bg-white shadow-2xl transition-transform duration-300 ease-in-out font-poppins"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex h-16 items-center justify-between border-b border-[#e8e2d8] px-6 bg-[#fbf9f5]">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[#8a7a68]">person_add</span>
                <div>
                  <h2 id="drawer-title" className="text-lg font-bold text-[#1c1b1f] font-poppins">
                    {isEditMode ? `Edit Member Assignment (#MBR-${member.id})` : 'Assign Collaborator to Tip Pool'}
                  </h2>
                  <p className="text-xs text-[#706d65] font-poppins">
                    Configure distribution weight points & functional pool role
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-[#706d65] hover:bg-[#f3eee7] hover:text-[#ae001a] transition-colors duration-200"
                aria-label="Close drawer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Form Content */}
            <form noValidate onSubmit={handleSubmit} className="flex h-[calc(100vh-8rem)] flex-col justify-between overflow-y-auto p-6 font-poppins">
              <div className="space-y-6">
                {/* Alert Notifications */}
                {errorMessage && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-200" role="alert">
                    <span className="material-symbols-outlined text-lg">error</span>
                    <span>{errorMessage}</span>
                  </div>
                )}
                {successMessage && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800 border border-emerald-200" role="status">
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* Parent Tip Pool Selector */}
                <div>
                  <label htmlFor="tip_pool_id" className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-2 font-poppins">
                    Parent Tip Pool <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="tip_pool_id"
                    value={tipPoolId}
                    onChange={(e) => setTipPoolId(e.target.value)}
                    disabled={loadingPools}
                    className="w-full rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-sm text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] disabled:bg-gray-50 font-poppins transition-colors duration-200"
                  >
                    <option value="">Select a Tip Pool...</option>
                    {pools.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (#POL-{p.id}) - {p.distribution_type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Collaborator Profile Searchable Dropdown */}
                <div>
                  <label htmlFor="collaborator_id" className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-2 font-poppins">
                    Collaborator <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute inset-y-0 left-2.5 flex items-center text-sm text-[#8a7a68]">
                        search
                      </span>
                      <input
                        type="text"
                        value={collaboratorSearchTerm}
                        onChange={(e) => setCollaboratorSearchTerm(e.target.value)}
                        placeholder="Search collaborator name, role, or #CLB-ID..."
                        className="w-full rounded-lg border border-[#d8d2c6] bg-white pl-8 pr-3 py-1.5 text-xs text-[#1c1b1f] placeholder-[#8a7a68] focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins transition-colors duration-200"
                      />
                    </div>
                    <select
                      id="collaborator_id"
                      value={collaboratorId}
                      onChange={(e) => setCollaboratorId(e.target.value)}
                      className="w-full rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-sm text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins transition-colors duration-200"
                    >
                      <option value="">Select Collaborator...</option>
                      {filteredCollaborators.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.first_name} {c.last_name} (#CLB-{c.id}) - {c.role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Role Selector / Field */}
                <div>
                  <label htmlFor="role" className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-2 font-poppins">
                    Assigned Pool Role <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="role_select"
                      aria-label="Select Pool Role"
                      value={DEFAULT_ROLES.includes(role.toUpperCase()) ? role.toUpperCase() : 'CUSTOM'}
                      onChange={(e) => {
                        if (e.target.value !== 'CUSTOM') {
                          setRole(e.target.value);
                        }
                      }}
                      className="rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-sm text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none font-poppins transition-colors duration-200"
                    >
                      {DEFAULT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value="CUSTOM">Custom Role...</option>
                    </select>
                    <input
                      type="text"
                      id="role"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g. WAITER, BARTENDER"
                      className="flex-1 rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-sm text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins transition-colors duration-200"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-[#706d65] font-poppins">
                    Functional role string used for pool grouping and role-based calculations.
                  </p>
                </div>

                {/* Distribution Weight Points (Precision 5, Scale 2) */}
                <div>
                  <label htmlFor="weight" className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-2 font-poppins">
                    Weight / Points Factor <span className="text-red-500">*</span>
                  </label>
                  <div className="relative rounded-lg shadow-sm">
                    <input
                      type="number"
                      id="weight"
                      step="0.01"
                      min="0"
                      max="999.99"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="1.00"
                      className="w-full rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 pr-12 text-sm font-semibold text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins hover:text-[#ae001a] transition-colors duration-200"
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-xs font-bold text-[#8a7a68] font-poppins">pts</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-[#706d65] font-poppins">
                    Numeric multiplier or weight factor matching database precision 5, scale 2 (max 999.99, e.g. 10.50 pts, 1.00 x).
                  </p>
                </div>

                {/* Logical Record Status */}
                <div>
                  <label htmlFor="record_status" className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-2 font-poppins">
                    Record Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="record_status"
                    value={recordStatus}
                    onChange={(e) => setRecordStatus(e.target.value as TipPoolMemberRecordStatus)}
                    className="w-full rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-sm text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins transition-colors duration-200"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DELETED">DELETED</option>
                  </select>
                </div>
              </div>

              {/* Drawer Footer CTA */}
              <div className="border-t border-[#e8e2d8] pt-4 mt-6 flex items-center justify-end gap-3 bg-white">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[#d8d2c6] px-4 py-2 text-sm font-medium text-[#1c1b1f] hover:bg-[#f3eee7] hover:text-[#ae001a] transition-colors duration-200 font-poppins"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#2c2a29] px-5 py-2 text-sm font-bold text-white shadow-md hover:bg-[#ae001a] disabled:opacity-50 transition-colors duration-200 font-poppins"
                >
                  {submitting && <span className="material-symbols-outlined animate-spin text-sm">sync</span>}
                  <span>{isEditMode ? 'Save Changes' : 'Assign Member'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TipPoolMemberFormDrawer;
