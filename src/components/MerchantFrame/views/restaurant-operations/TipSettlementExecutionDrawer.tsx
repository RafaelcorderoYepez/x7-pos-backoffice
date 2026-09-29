import React, { useState } from 'react';
import type {
  SettlementMethod,
  TipSettlementStatus,
  CreateTipSettlementDto,
  TipSettlement,
} from '../../../../types/tip-settlements';
import { SETTLEMENT_METHODS, TIP_SETTLEMENT_STATUSES, TIP_SETTLEMENT_STATUS_LABELS } from '../../../../types/tip-settlements';

export interface TipSettlementExecutionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (dto: CreateTipSettlementDto) => Promise<void>;
  targetSettlement?: TipSettlement | null;
  collaboratorId?: number | string;
  collaboratorName?: string;
  shiftId?: number | string;
  totalAmount?: number;
  defaultOrderId?: number | string | null;
  companyId?: string;
  merchantId?: string;
  currentUserId?: number;
  currentUserName?: string;
}

export const TipSettlementExecutionDrawer: React.FC<TipSettlementExecutionDrawerProps> = ({
  isOpen,
  onClose,
  onExecute,
  targetSettlement = null,
  collaboratorId: initialCollabId,
  collaboratorName: initialCollabName,
  shiftId: initialShiftId,
  totalAmount: initialTotalAmount,
  defaultOrderId: initialOrderId = null,
  companyId = 'cmp-01',
  merchantId = 'mch-01',
  currentUserId = 88,
  currentUserName = 'Elena Rostova (Store Administrator #88)',
}) => {
  // Resolve effective read-only attributes
  const effectiveCollaboratorId = targetSettlement
    ? String(targetSettlement.collaborator_id)
    : initialCollabId
    ? String(initialCollabId)
    : '104';

  const effectiveCollaboratorName = targetSettlement?.collaborator
    ? `${targetSettlement.collaborator.first_name} ${targetSettlement.collaborator.last_name}`
    : initialCollabName
    ? initialCollabName
    : `Collaborator #${effectiveCollaboratorId}`;

  const effectiveShiftId = targetSettlement
    ? String(targetSettlement.shift_id)
    : initialShiftId
    ? String(initialShiftId)
    : '403';

  const effectiveTotalAmount = targetSettlement
    ? targetSettlement.total_amount
    : initialTotalAmount !== undefined
    ? initialTotalAmount
    : 150.75;

  // Form State
  const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>('CASH');
  const [orderId, setOrderId] = useState<string>('');
  const [status, setStatus] = useState<TipSettlementStatus>('SETTLED');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Adjust state during render when props change (prevents react-hooks/set-state-in-effect)
  const [prevTargetSettlement, setPrevTargetSettlement] = useState(targetSettlement);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevInitialOrderId, setPrevInitialOrderId] = useState(initialOrderId);

  if (targetSettlement !== prevTargetSettlement || isOpen !== prevIsOpen || initialOrderId !== prevInitialOrderId) {
    setPrevTargetSettlement(targetSettlement);
    setPrevIsOpen(isOpen);
    setPrevInitialOrderId(initialOrderId);
    if (isOpen) {
      if (targetSettlement) {
        setSettlementMethod(targetSettlement.settlement_method || 'CASH');
        setOrderId(targetSettlement.order_id ? String(targetSettlement.order_id) : '');
        setStatus('SETTLED');
        setNotes(targetSettlement.notes || '');
      } else {
        setOrderId(initialOrderId ? String(initialOrderId) : '');
        setSettlementMethod('CASH');
        setStatus('SETTLED');
        setNotes('');
      }
    }
  }

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const collabIdNum = parseInt(effectiveCollaboratorId, 10);
    const shiftIdNum = parseInt(effectiveShiftId, 10);

    if (isNaN(collabIdNum)) {
      setError('Invalid collaborator reference.');
      return;
    }

    if (isNaN(shiftIdNum)) {
      setError('Invalid shift reference.');
      return;
    }

    setSubmitting(true);
    try {
      // Automatic audit stamping: settled_by = current_user.id, settled_at = new Date()
      await onExecute({
        company_id: companyId,
        merchant_id: merchantId,
        collaborator_id: collabIdNum,
        shift_id: shiftIdNum,
        order_id: orderId.trim() ? parseInt(orderId.trim(), 10) : null,
        total_amount: effectiveTotalAmount,
        settlement_method: settlementMethod,
        status: status,
        settled_by: currentUserId,
        settled_at: new Date().toISOString(),
        notes: notes.trim() || `Settlement execution authorized via drawer for ${effectiveCollaboratorName}`,
      });

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to execute tip settlement payout.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      aria-label="Settlement execution drawer overlay"
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-end font-poppins transition-opacity duration-300"
    >
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-[#e8e2d8] bg-[#fbf9f5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ae001a] text-white flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-xl">account_balance_wallet</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1c1b1f]">Execute Settlement Payout</h2>
              <p className="text-xs text-[#8a7a68]">
                Finalize accumulated tip disbursements for staff member
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close execution drawer"
            className="w-8 h-8 rounded-full hover:bg-gray-200/60 flex items-center justify-center text-gray-500 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form id="settlement-execution-form" onSubmit={handleSubmit} className="p-6 space-y-5 flex-1">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* 1. Read-only Collaborator Profile */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Target Staff Member (collaborator_id)</span>
              <span className="text-[10px] text-[#8a7a68] font-semibold">READ-ONLY</span>
            </label>
            <div className="w-full h-11 px-3.5 bg-[#f3eee7] border border-[#e8e2d8] rounded-xl flex items-center justify-between font-semibold text-sm text-[#1c1b1f]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-[#ae001a]">person</span>
                <span>{effectiveCollaboratorName}</span>
              </div>
              <span className="font-mono text-xs font-bold bg-[#eee9df] text-[#8a7a68] px-2 py-0.5 rounded">
                #CLB-{effectiveCollaboratorId}
              </span>
            </div>
          </div>

          {/* 2. Read-only Work Shift Reference */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Work Shift Reference (shift_id)</span>
              <span className="text-[10px] text-[#8a7a68] font-semibold">READ-ONLY</span>
            </label>
            <div className="w-full h-11 px-3.5 bg-[#f3eee7] border border-[#e8e2d8] rounded-xl flex items-center justify-between text-sm text-[#1c1b1f]">
              <div className="flex items-center gap-2 font-mono font-bold">
                <span className="material-symbols-outlined text-base text-amber-600">schedule</span>
                <span>#SFT-{effectiveShiftId}</span>
              </div>
              <span className="text-xs text-[#8a7a68]">Assigned Shift</span>
            </div>
          </div>

          {/* 3. Read-only Total Settled Amount */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Total Settled Amount ($ total_amount)</span>
              <span className="text-[10px] text-emerald-700 font-bold">CALCULATED SHARE</span>
            </label>
            <div className="w-full h-12 px-4 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-900 uppercase">Accumulated Tips:</span>
              <span className="text-xl font-extrabold text-emerald-600 font-mono">
                ${effectiveTotalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* 4. Settlement Method Dropdown / Selectors */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Settlement Payout Channel (settlement_method) *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SETTLEMENT_METHODS.map((method) => {
                const isSelected = settlementMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSettlementMethod(method)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold font-poppins transition-colors duration-200 flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? 'bg-[#ae001a] text-white border-[#ae001a] shadow-sm'
                        : 'bg-[#fbf9f5] text-[#1c1b1f] border-[#e8e2d8] hover:text-[#ae001a] hover:border-[#ae001a]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {method === 'CASH'
                        ? 'point_of_sale'
                        : method === 'PAYROLL'
                        ? 'receipt_long'
                        : 'account_balance'}
                    </span>
                    <span className="text-[11px] uppercase tracking-wider">
                      {method.replace('_', ' ')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Associated Order Reference Dropdown (Optional) */}
          <div>
            <label htmlFor="order-id-input" className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Associated Order ID (#ORD-ID, Optional)
            </label>
            <input
              id="order-id-input"
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="e.g. 5018 (Optional order reference)"
              className="w-full h-11 px-3.5 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-sm font-mono text-[#1c1b1f] focus:outline-none focus:border-[#ae001a] transition-colors"
            />
          </div>

          {/* 6. Lifecycle Status Selector */}
          <div>
            <label htmlFor="settlement-status-select" className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Execution Status (status) *
            </label>
            <select
              id="settlement-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as TipSettlementStatus)}
              className="w-full h-11 px-3.5 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-xs font-semibold text-[#1c1b1f] focus:outline-none focus:border-[#ae001a] transition-colors"
            >
              {TIP_SETTLEMENT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {TIP_SETTLEMENT_STATUS_LABELS[st]} ({st})
                </option>
              ))}
            </select>
          </div>

          {/* Automatic Audit Stamp & Status Cascade Information */}
          <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <span className="material-symbols-outlined text-base text-[#ae001a]">verified_user</span>
              <span>Automatic Audit Stamp:</span>
            </div>
            <p className="text-amber-800 font-medium leading-relaxed">
              Upon submission, system automatically stamps <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-bold">settled_by = {currentUserId}</code> ({currentUserName}) and sets timestamp <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900 font-bold">settled_at = new Date()</code>.
            </p>
            <div className="pt-2 border-t border-amber-200/60 flex items-center gap-1.5 text-[11px] text-amber-800 font-semibold">
              <span className="material-symbols-outlined text-sm text-emerald-700">sync</span>
              <span>Cascades status to source <code className="font-mono">TipStatus.SETTLED</code> & parent <code className="font-mono">TipPoolStatus.SETTLED</code>.</span>
            </div>
          </div>

          {/* Audit Remarks */}
          <div>
            <label htmlFor="settlement-notes-textarea" className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Audit Remarks & Execution Notes
            </label>
            <textarea
              id="settlement-notes-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Disbursed via cash drawer #1 at shift closeout"
              className="w-full p-3 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-xs text-[#1c1b1f] focus:outline-none focus:border-[#ae001a] transition-colors"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-[#e8e2d8] bg-[#fbf9f5] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-white border border-[#e8e2d8] text-[#1c1b1f] font-bold text-xs rounded-xl hover:bg-gray-100 transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="settlement-execution-form"
            disabled={submitting}
            className="px-5 py-2.5 bg-[#ae001a] text-white font-bold text-xs rounded-xl hover:bg-[#8e0015] shadow-md flex items-center gap-2 transition-colors duration-200 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                <span>Executing Settlement...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">payments</span>
                <span>EXECUTE SETTLEMENT</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TipSettlementExecutionDrawer;
