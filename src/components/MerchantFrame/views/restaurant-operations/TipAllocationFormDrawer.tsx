import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type {
  TipAllocation,
  TipAllocationRecordStatus,
  TipAllocationRole,
  TipOption,
  ShiftOption,
} from '../../../../types/tip-allocations';
import {
  createTipAllocation,
  updateTipAllocation,
  checkAllocationCeilingGuard,
  MOCK_TIP_OPTIONS,
  MOCK_SHIFT_OPTIONS,
  MOCK_TIP_ALLOCATIONS,
} from '../../../../api/tip-allocations';
import { MOCK_COLLABORATOR_OPTIONS } from '../../../../api/tip-pool-members';
import type { CollaboratorOption } from '../../../../types/tip-pool-members';

export interface TipAllocationFormDrawerProps {
  isOpen: boolean;
  allocation: TipAllocation | null;
  onClose: () => void;
  onSaved?: (allocation: TipAllocation) => void;
  companyId?: string;
  merchantId?: string;
  defaultTipId?: number;
  existingAllocations?: TipAllocation[];
}

const DEFAULT_ROLES: TipAllocationRole[] = [
  'WAITER',
  'BARTENDER',
  'RUNNER',
  'SERVER',
  'BUSSER',
  'HOST',
  'KITCHEN',
];

export const TipAllocationFormDrawer: React.FC<TipAllocationFormDrawerProps> = ({
  isOpen,
  allocation,
  onClose,
  onSaved,
  defaultTipId,
  existingAllocations = MOCK_TIP_ALLOCATIONS,
}) => {
  if (!isOpen) return null;

  const isEditMode = allocation !== null;

  // Options Data
  const tips: TipOption[] = MOCK_TIP_OPTIONS;
  const shifts: ShiftOption[] = MOCK_SHIFT_OPTIONS;
  const collaborators: CollaboratorOption[] = MOCK_COLLABORATOR_OPTIONS;

  // Form Field State
  const [tipId, setTipId] = useState<string>(
    allocation
      ? String(allocation.tip_id)
      : defaultTipId
      ? String(defaultTipId)
      : tips[0]
      ? String(tips[0].id)
      : ''
  );
  const [collaboratorId, setCollaboratorId] = useState<string>(
    allocation ? String(allocation.collaborator_id) : collaborators[0] ? String(collaborators[0].id) : ''
  );
  const [collaboratorSearchTerm, setCollaboratorSearchTerm] = useState<string>('');
  const [shiftId, setShiftId] = useState<string>(
    allocation ? String(allocation.shift_id) : shifts[0] ? String(shifts[0].id) : ''
  );
  const [role, setRole] = useState<string>(allocation ? allocation.role : 'WAITER');
  const [percentage, setPercentage] = useState<string>(
    allocation ? String(allocation.percentage) : '50.00'
  );
  const [amount, setAmount] = useState<string>(
    allocation ? String(allocation.amount) : '12.50'
  );
  const [recordStatus, setRecordStatus] = useState<TipAllocationRecordStatus>(
    allocation ? allocation.record_status : 'ACTIVE'
  );

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Helper to find parent tip amount for calculation
  const selectedTipObject = useMemo(() => {
    const cleanId = Number(String(tipId).replace('#TIP-', '').replace('#tip-', ''));
    return tips.find((t) => t.id === cleanId);
  }, [tipId, tips]);

  // Dynamic Amount Recalculation when percentage or tip_id changes
  const handlePercentageChange = (newPercentageVal: string) => {
    setPercentage(newPercentageVal);
    const parsedPct = parseFloat(newPercentageVal);
    if (!isNaN(parsedPct) && selectedTipObject) {
      const computedAmount = (selectedTipObject.amount * parsedPct) / 100;
      setAmount(computedAmount.toFixed(2));
    }
  };

  const handleTipIdChange = (newTipIdVal: string) => {
    setTipId(newTipIdVal);
    const cleanId = Number(String(newTipIdVal).replace('#TIP-', '').replace('#tip-', ''));
    const tipObj = tips.find((t) => t.id === cleanId);
    const parsedPct = parseFloat(percentage);
    if (tipObj && !isNaN(parsedPct)) {
      const computedAmount = (tipObj.amount * parsedPct) / 100;
      setAmount(computedAmount.toFixed(2));
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (allocation) {
      setTipId(String(allocation.tip_id));
      setCollaboratorId(String(allocation.collaborator_id));
      setShiftId(String(allocation.shift_id));
      setRole(allocation.role);
      setPercentage(String(allocation.percentage));
      setAmount(String(allocation.amount));
      setRecordStatus(allocation.record_status);
    } else {
      const initialTip = defaultTipId ? String(defaultTipId) : tips[0] ? String(tips[0].id) : '';
      setTipId(initialTip);
      setCollaboratorId(collaborators[0] ? String(collaborators[0].id) : '');
      setShiftId(shifts[0] ? String(shifts[0].id) : '');
      setRole('WAITER');
      setPercentage('50.00');
      const tipObj = tips.find((t) => String(t.id) === initialTip);
      const computed = tipObj ? (tipObj.amount * 50) / 100 : 12.5;
      setAmount(computed.toFixed(2));
      setRecordStatus('ACTIVE');
    }
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [allocation, isOpen, defaultTipId]);

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

    // Validation 1: Required tip_id
    if (!tipId) {
      setErrorMessage('Please select a valid source Tip (#TIP-ID).');
      return;
    }

    // Validation 2: Required collaborator_id
    if (!collaboratorId) {
      setErrorMessage('Please select a valid collaborator.');
      return;
    }

    // Validation 3: Required shift_id
    if (!shiftId) {
      setErrorMessage('Please select a valid work shift context.');
      return;
    }

    // Validation 4: Required role
    const trimmedRole = role.trim().toUpperCase();
    if (!trimmedRole) {
      setErrorMessage('Please specify an allocation role.');
      return;
    }

    // Validation 5: Percentage precision & ceiling check
    const parsedPct = parseFloat(percentage);
    if (isNaN(parsedPct) || parsedPct < 0 || parsedPct > 100.0) {
      setErrorMessage('Percentage share must be a valid number between 0.00 and 100.00.');
      return;
    }

    // Validation 6: Amount check
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setErrorMessage('Allocated monetary amount must be a non-negative number.');
      return;
    }

    const cleanTipId = Number(String(tipId).replace('#TIP-', '').replace('#tip-', ''));
    const cleanCollabId = String(collaboratorId).replace('#CLB-', '').replace('#clb-', '');
    const cleanShiftId = Number(String(shiftId).replace('#SFT-', '').replace('#sft-', ''));

    // Validation 7: 100% Allocation Ceiling Guard Validation
    try {
      checkAllocationCeilingGuard(
        cleanTipId,
        parsedPct,
        recordStatus,
        isEditMode && allocation ? allocation.id : undefined,
        existingAllocations
      );
    } catch (err: any) {
      setErrorMessage(err?.message || `Total allocations for Tip #TIP-${cleanTipId} cannot exceed 100%.`);
      return;
    }

    setSubmitting(true);
    try {
      if (isEditMode && allocation) {
        const updated = await updateTipAllocation(allocation.id, {
          tip_id: cleanTipId,
          collaborator_id: cleanCollabId,
          shift_id: cleanShiftId,
          role: trimmedRole,
          percentage: parsedPct,
          amount: parsedAmount,
          record_status: recordStatus,
        });

        setSuccessMessage(`Tip Allocation #${allocation.id} updated successfully!`);
        setTimeout(() => {
          onSaved?.(updated);
          onClose();
        }, 500);
      } else {
        const created = await createTipAllocation({
          tip_id: cleanTipId,
          collaborator_id: cleanCollabId,
          shift_id: cleanShiftId,
          role: trimmedRole,
          percentage: parsedPct,
          amount: parsedAmount,
          record_status: recordStatus,
        });

        setSuccessMessage(`Tip Allocation #${created.id} created successfully!`);
        setTimeout(() => {
          onSaved?.(created);
          onClose();
        }, 500);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save tip allocation.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm transition-opacity font-poppins"
      aria-labelledby="allocation-drawer-title"
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
                <span className="material-symbols-outlined text-[#8a7a68]">pie_chart</span>
                <div>
                  <h2
                    id="allocation-drawer-title"
                    className="text-lg font-bold text-[#1c1b1f] font-poppins"
                  >
                    {isEditMode
                      ? `Edit Allocation (#ALC-${allocation.id})`
                      : 'Create Tip Allocation'}
                  </h2>
                  <p className="text-xs text-[#706d65] font-poppins">
                    Configure collaborator tip breakdown & allocation percentage
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
            <form
              noValidate
              onSubmit={handleSubmit}
              className="flex h-[calc(100vh-8rem)] flex-col justify-between overflow-y-auto p-6 font-poppins"
            >
              <div className="space-y-5">
                {/* Alert Notifications */}
                {errorMessage && (
                  <div
                    className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-200"
                    role="alert"
                  >
                    <span className="material-symbols-outlined text-lg">error</span>
                    <span>{errorMessage}</span>
                  </div>
                )}
                {successMessage && (
                  <div
                    className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800 border border-emerald-200"
                    role="status"
                  >
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* Source Tip Selector (tip_id) */}
                <div>
                  <label
                    htmlFor="tip_id"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-1 font-poppins"
                  >
                    Source Tip Reference <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="tip_id"
                    data-testid="drawer-tip-id-select"
                    value={tipId}
                    onChange={(e) => handleTipIdChange(e.target.value)}
                    className="w-full rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-sm text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins transition-colors duration-200"
                  >
                    <option value="">Select Parent Tip...</option>
                    {tips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {selectedTipObject && (
                    <p className="mt-1 text-[11px] text-[#8a7a68]">
                      Parent Tip Total Amount:{' '}
                      <strong className="text-[#1c1b1f]">
                        ${selectedTipObject.amount.toFixed(2)}
                      </strong>
                    </p>
                  )}
                </div>

                {/* Collaborator Profile Searchable Dropdown (collaborator_id) */}
                <div>
                  <label
                    htmlFor="collaborator_id"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-1 font-poppins"
                  >
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
                      data-testid="drawer-collaborator-id-select"
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

                {/* Work Shift Selector (shift_id) */}
                <div>
                  <label
                    htmlFor="shift_id"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-1 font-poppins"
                  >
                    Operational Work Shift <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="shift_id"
                    data-testid="drawer-shift-id-select"
                    value={shiftId}
                    onChange={(e) => setShiftId(e.target.value)}
                    className="w-full rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-sm text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins transition-colors duration-200"
                  >
                    <option value="">Select Shift Context...</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Allocation Role (role) */}
                <div>
                  <label
                    htmlFor="role"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-1 font-poppins"
                  >
                    Allocation Role <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="role_select"
                      aria-label="Select Allocation Role"
                      data-testid="drawer-role-select"
                      value={
                        DEFAULT_ROLES.includes(role.toUpperCase())
                          ? role.toUpperCase()
                          : 'CUSTOM'
                      }
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
                </div>

                {/* Percentage Share (percentage) */}
                <div>
                  <label
                    htmlFor="percentage"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-1 font-poppins"
                  >
                    Percentage Share (%) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative rounded-lg shadow-sm">
                    <input
                      type="number"
                      id="percentage"
                      data-testid="drawer-percentage-input"
                      step="0.01"
                      min="0.00"
                      max="100.00"
                      value={percentage}
                      onChange={(e) => handlePercentageChange(e.target.value)}
                      placeholder="50.00"
                      className="w-full rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 pr-10 text-sm font-semibold text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins transition-colors duration-200"
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-xs font-bold text-[#8a7a68]">%</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-[#706d65]">
                    Decimal percentage (precision 5, scale 2, range 0.00 to 100.00). Total allocations cannot exceed 100%.
                  </p>
                </div>

                {/* Allocated Amount (amount) - Dynamic or Manual Override */}
                <div>
                  <label
                    htmlFor="amount"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-1 font-poppins"
                  >
                    Allocated Amount ($) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative rounded-lg shadow-sm">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <span className="text-xs font-bold text-[#8a7a68]">$</span>
                    </div>
                    <input
                      type="number"
                      id="amount"
                      data-testid="drawer-amount-input"
                      step="0.01"
                      min="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="12.50"
                      className="w-full rounded-lg border border-[#d8d2c6] bg-white pl-7 pr-3 py-2 text-sm font-bold text-[#1c1b1f] shadow-sm focus:border-[#ae001a] focus:outline-none focus:ring-1 focus:ring-[#ae001a] font-poppins transition-colors duration-200"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-[#706d65]">
                    Automatically computed based on tip total &amp; percentage. Manual overrides supported.
                  </p>
                </div>

                {/* Logical Record Status (record_status) */}
                <div>
                  <label
                    htmlFor="record_status"
                    className="block text-xs font-semibold uppercase tracking-wider text-[#706d65] mb-1 font-poppins"
                  >
                    Record Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="record_status"
                    data-testid="drawer-record-status-select"
                    value={recordStatus}
                    onChange={(e) => setRecordStatus(e.target.value as TipAllocationRecordStatus)}
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
                  data-testid="drawer-submit-btn"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#2c2a29] px-5 py-2 text-sm font-bold text-white shadow-md hover:bg-[#ae001a] disabled:opacity-50 transition-colors duration-200 font-poppins"
                >
                  {submitting && (
                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                  )}
                  <span>{isEditMode ? 'Save Changes' : 'Create Allocation'}</span>
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

export default TipAllocationFormDrawer;
