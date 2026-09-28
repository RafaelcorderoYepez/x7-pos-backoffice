import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type {
  TipPool,
  TipPoolDistributionType,
  TipPoolStatus,
  TipPoolRecordStatus,
  ActiveShiftOption,
} from '../../../../types/tip-pools';
import {
  createTipPool,
  updateTipPool,
  fetchActiveShifts,
  formatTipPoolDateTime,
} from '../../../../api/tip-pools';

export interface TipPoolFormDrawerProps {
  isOpen: boolean;
  pool: TipPool | null;
  onClose: () => void;
  onSaved?: (pool: TipPool) => void;
  companyId?: string;
  merchantId?: string;
}

export const TipPoolFormDrawer: React.FC<TipPoolFormDrawerProps> = ({
  isOpen,
  pool,
  onClose,
  onSaved,
  companyId = 'cmp-01',
  merchantId = 'mch-01',
}) => {
  const isEditMode = pool !== null;
  const isSettled = pool?.status === 'SETTLED';

  // Form Field State
  const [name, setName] = useState<string>(pool?.name || '');
  const [shiftId, setShiftId] = useState<string>(pool ? String(pool.shift_id) : '');
  const [distributionType, setDistributionType] = useState<TipPoolDistributionType>(
    pool?.distribution_type || 'EQUAL'
  );
  const [status, setStatus] = useState<TipPoolStatus>(pool?.status || 'OPEN');
  const [recordStatus, setRecordStatus] = useState<TipPoolRecordStatus>(
    pool?.record_status || 'ACTIVE'
  );
  const [notes, setNotes] = useState<string>(pool?.notes || '');

  // Active Work Shifts Options State
  const [activeShifts, setActiveShifts] = useState<ActiveShiftOption[]>([]);
  const [loadingShifts, setLoadingShifts] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Adjust state during render when pool or isOpen changes
  const [prevPool, setPrevPool] = useState(pool);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (pool !== prevPool || isOpen !== prevIsOpen) {
    setPrevPool(pool);
    setPrevIsOpen(isOpen);
    if (pool) {
      setName(pool.name);
      setShiftId(String(pool.shift_id));
      setDistributionType(pool.distribution_type);
      setStatus(pool.status);
      setRecordStatus(pool.record_status);
      setNotes(pool.notes || '');
    } else {
      setName('');
      setShiftId('');
      setDistributionType('EQUAL');
      setStatus('OPEN');
      setRecordStatus('ACTIVE');
      setNotes('');
    }
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  useEffect(() => {
    let ignore = false;
    fetchActiveShifts()
      .then((shifts) => {
        if (!ignore) setActiveShifts(shifts);
      })
      .catch(() => {
        if (!ignore) setActiveShifts([]);
      })
      .finally(() => {
        if (!ignore) setLoadingShifts(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validation Guard 1: Name length and presence
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a valid Tip Pool Name.');
      return;
    }

    if (trimmedName.length > 150) {
      setErrorMessage('Tip pool name cannot exceed 150 characters.');
      return;
    }

    // Validation Guard 2: Shift Relation Binding (Required shift_id)
    if (!shiftId || isNaN(Number(shiftId)) || Number(shiftId) <= 0) {
      setErrorMessage('Shift Relation Binding Error: Selection of a valid active shift_id is required.');
      return;
    }

    // Business Rule Guard 3: Settlement Guard
    if (status === 'SETTLED' && (!pool || pool.status !== 'SETTLED')) {
      setErrorMessage(
        'Settlement Guard Error: Changing status to SETTLED is restricted to automated settlement execution workflows (handled via TipSettlement).'
      );
      return;
    }

    setSubmitting(true);
    try {
      if (isEditMode && pool) {
        const updated = await updateTipPool(pool.id, {
          name: trimmedName,
          shift_id: Number(shiftId),
          distribution_type: distributionType,
          status,
          record_status: recordStatus,
          notes: notes.trim() || null,
        });

        setSuccessMessage(`Tip pool #${pool.id} updated successfully.`);
        if (onSaved) onSaved(updated);
        setTimeout(() => {
          onClose();
        }, 700);
      } else {
        const created = await createTipPool({
          company_id: companyId,
          merchant_id: merchantId,
          name: trimmedName,
          shift_id: Number(shiftId),
          distribution_type: distributionType,
          status,
          record_status: recordStatus,
          notes: notes.trim() || null,
        });

        setSuccessMessage(`New tip pool #${created.id} created successfully.`);
        if (onSaved) onSaved(created);
        setTimeout(() => {
          onClose();
        }, 700);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit tip pool form drawer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleSoftDelete = async () => {
    if (!pool) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const newRecordStatus: TipPoolRecordStatus =
        recordStatus === 'ACTIVE' ? 'DELETED' : 'ACTIVE';
      const updated = await updateTipPool(pool.id, { record_status: newRecordStatus });
      setRecordStatus(newRecordStatus);
      setSuccessMessage(
        newRecordStatus === 'DELETED'
          ? `Tip pool #${pool.id} logically soft-deleted (record_status = DELETED).`
          : `Tip pool #${pool.id} restored to ACTIVE status.`
      );
      if (onSaved) onSaved(updated);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update record status.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="font-sans">
      {/* Backdrop */}
      <div
        data-testid="tip-pool-drawer-backdrop"
        className="fixed inset-0 z-[99998] bg-black/60 backdrop-blur-sm transition-opacity animate-fade-in cursor-pointer"
        onClick={onClose}
      />

      {/* Slide-over Content Panel */}
      <div
        role="dialog"
        aria-label={isEditMode ? `Edit Tip Pool #${pool.id}` : 'Create New Tip Pool'}
        data-testid="tip-pool-drawer"
        className="fixed top-0 right-0 bottom-0 z-[99999] w-full max-w-lg bg-white border-l border-[#e8e2d8] shadow-2xl overflow-hidden flex flex-col animate-slide-in text-left text-[#1d1c17]"
      >
        {/* Top Header Panel (Dark Black #222222 with White Text) */}
        <div className="bg-[#222222] p-4 text-white flex flex-col gap-2 shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-[11px] uppercase tracking-widest text-white">
                {isEditMode ? `#POL-${pool.id} Details & Adjustment` : 'Create New Tip Pool'}
              </h2>
              {isEditMode && pool && (
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    recordStatus === 'ACTIVE'
                      ? 'bg-green-500/20 text-green-300'
                      : 'bg-gray-600/30 text-gray-300 line-through'
                  }`}
                >
                  {recordStatus}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              data-testid="tip-pool-drawer-close-button"
              className="text-white/70 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
          <div className="flex justify-between items-center text-white/70 text-[11px]">
            <span>
              {isEditMode
                ? 'Update distribution strategy, shift binding, or pool lifecycle status.'
                : 'Structure gratuity accumulation per operational shift and assign distribution strategy.'}
            </span>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          {/* Settlement Immutability Guard Warning */}
          {isSettled && (
            <div
              data-testid="settlement-guard-warning"
              className="p-4 rounded border border-amber-300 bg-amber-50 text-amber-800 flex items-start gap-3 text-xs leading-relaxed"
            >
              <span className="material-symbols-outlined text-amber-600 text-lg shrink-0 mt-0.5">
                lock
              </span>
              <div>
                <p className="font-bold">Settled Tip Pool Guard</p>
                <p className="text-amber-700 mt-0.5">
                  This pool has been fully settled via automated settlement execution workflows. Changing status back or modifying values is restricted.
                </p>
              </div>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMessage && (
            <div
              data-testid="tip-pool-drawer-error"
              className="p-3.5 rounded border border-red-300 bg-red-50 text-red-700 text-xs font-semibold flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              data-testid="tip-pool-drawer-success"
              className="p-3.5 rounded border border-green-300 bg-green-50 text-green-800 text-xs font-semibold flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              <span>{successMessage}</span>
            </div>
          )}

          {/* Pool Metadata Info (Edit Mode Only) */}
          {isEditMode && pool && (
            <div className="bg-[#fef9f1] p-4 rounded border border-[#e8e2d8] space-y-1.5 text-xs text-[#5f5e5e]">
              <div className="flex justify-between">
                <span>Created Timestamp:</span>
                <span className="font-mono text-[#1d1c17] font-semibold">{formatTipPoolDateTime(pool.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span>Closed Timestamp:</span>
                <span className="font-mono text-[#1d1c17] font-semibold">
                  {pool.closed_at ? formatTipPoolDateTime(pool.closed_at) : 'Active / Open'}
                </span>
              </div>
            </div>
          )}

          {/* Pool Name Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label htmlFor="tip-pool-name-input" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
                Pool Name <span className="text-red-600">*</span>
              </label>
              <span className={`text-[10px] ${name.length > 150 ? 'text-red-600 font-bold' : 'text-[#5f5e5e]'}`}>
                {name.length}/150
              </span>
            </div>
            <input
              id="tip-pool-name-input"
              type="text"
              data-testid="tip-pool-name-input"
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Shift Front of House Pool"
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none"
            />
          </div>

          {/* Associated Work Shift Selector (shift_id Binding) */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-pool-shift-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Associated Work Shift (shift_id) <span className="text-red-600">*</span>
            </label>
            <select
              id="tip-pool-shift-select"
              data-testid="tip-pool-shift-select"
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none font-mono"
            >
              <option value="">-- Select Active Operational Work Shift --</option>
              {loadingShifts ? (
                <option value="" disabled>
                  Loading active work shifts...
                </option>
              ) : (
                activeShifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.time_window})
                  </option>
                ))
              )}
            </select>
            <p className="text-[11px] text-[#5f5e5e]">
              Binds tip pool gratuity calculations to an active operational work shift.
            </p>
          </div>

          {/* Distribution Strategy Selector */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-pool-distribution-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Distribution Model Strategy <span className="text-red-600">*</span>
            </label>
            <select
              id="tip-pool-distribution-select"
              data-testid="tip-pool-distribution-select"
              value={distributionType}
              onChange={(e) => setDistributionType(e.target.value as TipPoolDistributionType)}
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none"
            >
              <option value="EQUAL">EQUAL (Equal split across all shift participants)</option>
              <option value="PERCENTAGE">
                PERCENTAGE (Custom percentage allocation per role/tier)
              </option>
              <option value="POINTS">
                POINTS (Point-weighted distribution based on hours/seniority)
              </option>
              <option value="ROLE_BASED">
                ROLE_BASED (Role matrix formula distribution)
              </option>
            </select>
          </div>

          {/* Lifecycle Status Selector & Closure Guard */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-pool-status-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Lifecycle Pool Status
            </label>
            <select
              id="tip-pool-status-select"
              data-testid="tip-pool-status-select"
              value={status}
              disabled={isSettled}
              onChange={(e) => setStatus(e.target.value as TipPoolStatus)}
              className={`w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none ${
                isSettled ? 'bg-gray-100 text-[#5f5e5e] cursor-not-allowed' : ''
              }`}
            >
              <option value="OPEN">OPEN (Actively accumulating tips for shift)</option>
              <option value="CLOSED">
                CLOSED (Closed for incoming tips - Auto sets closed_at timestamp)
              </option>
              <option value="SETTLED">
                SETTLED (Restricted to automated settlement execution)
              </option>
            </select>
            <p className="text-[11px] text-[#5f5e5e]">
              Transitioning to CLOSED automatically populates closed_at to current ISO timestamp.
            </p>
          </div>

          {/* Record Status Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-pool-record-status-select" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Logical Record Status
            </label>
            <select
              id="tip-pool-record-status-select"
              data-testid="tip-pool-record-status-select"
              value={recordStatus}
              onChange={(e) => setRecordStatus(e.target.value as TipPoolRecordStatus)}
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none"
            >
              <option value="ACTIVE">ACTIVE (Normal active pool record)</option>
              <option value="DELETED">
                DELETED (Soft-deleted record - Historical reports preserved)
              </option>
            </select>
          </div>

          {/* Notes Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tip-pool-notes" className="text-[11px] font-bold text-[#5f5e5e] uppercase">
              Notes / Audit Justification
            </label>
            <textarea
              id="tip-pool-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional operational shift notes or settlement instructions..."
              className="w-full px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none resize-none font-sans"
            />
          </div>

          {/* Actions Footer */}
          <div className="pt-4 border-t border-[#e8e2d8] flex flex-col sm:flex-row items-center justify-between gap-3">
            {isEditMode ? (
              <button
                type="button"
                data-testid="tip-pool-soft-delete-button"
                onClick={handleToggleSoftDelete}
                disabled={submitting}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] hover:text-[#ae001a] text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">
                  {recordStatus === 'ACTIVE' ? 'delete' : 'restore_from_trash'}
                </span>
                {recordStatus === 'ACTIVE' ? 'Soft Delete' : 'Restore Active'}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-[#e8e2d8] text-[#5f5e5e] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="tip-pool-save-button"
                disabled={submitting}
                className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  'Saving...'
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">save</span>
                    {isEditMode ? 'Save Changes' : 'Create Tip Pool'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default TipPoolFormDrawer;
