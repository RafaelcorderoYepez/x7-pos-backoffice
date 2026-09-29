import React, { useState } from 'react';
import type {
  SettlementMethod,
  CreateTipSettlementDto,
} from '../../../../types/tip-settlements';
import { SETTLEMENT_METHODS, SETTLEMENT_METHOD_LABELS } from '../../../../types/tip-settlements';

export interface TipSettlementFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateTipSettlementDto) => Promise<void>;
  companyId?: string;
  merchantId?: string;
}

export const TipSettlementFormDrawer: React.FC<TipSettlementFormDrawerProps> = ({
  isOpen,
  onClose,
  onSubmit,
  companyId = 'cmp-01',
  merchantId = 'mch-01',
}) => {
  const [collaboratorId, setCollaboratorId] = useState<string>('101');
  const [shiftId, setShiftId] = useState<string>('401');
  const [orderId, setOrderId] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('150.00');
  const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = parseFloat(totalAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid total settled amount greater than $0.00');
      return;
    }

    if (!collaboratorId) {
      setError('Please select or specify a collaborator.');
      return;
    }

    if (!shiftId) {
      setError('Please specify a work shift ID.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        company_id: companyId,
        merchant_id: merchantId,
        collaborator_id: collaboratorId,
        shift_id: shiftId,
        order_id: orderId ? parseInt(orderId, 10) : null,
        total_amount: amountNum,
        settlement_method: settlementMethod,
        status: 'SETTLED',
        settled_by: 88,
        settled_at: new Date().toISOString(),
        notes: notes.trim() || 'Direct settlement created via workspace drawer',
      });

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit tip settlement record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      aria-label="New tip settlement drawer overlay"
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-end font-poppins transition-opacity duration-300"
    >
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-[#e8e2d8] bg-[#fbf9f5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ae001a] text-white flex items-center justify-center font-bold">
              <span className="material-symbols-outlined">add_card</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1c1b1f]">Create Tip Settlement</h2>
              <p className="text-xs text-[#8a7a68]">
                Authorize & finalize tip payout execution for staff member
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form drawer"
            className="w-8 h-8 rounded-full hover:bg-gray-200/60 flex items-center justify-center text-gray-500 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form id="tip-settlement-form" onSubmit={handleSubmit} className="p-6 space-y-5 flex-1">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Collaborator Selector */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Collaborator Staff Member *
            </label>
            <select
              value={collaboratorId}
              onChange={(e) => setCollaboratorId(e.target.value)}
              required
              className="w-full h-11 px-3.5 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-sm font-semibold text-[#1c1b1f] focus:outline-none focus:border-[#ae001a] transition-colors"
            >
              <option value="101">Sofia Rodriguez (#CLB-101 - Waiter)</option>
              <option value="102">Mateo Hernandez (#CLB-102 - Bartender)</option>
              <option value="103">Valeria Gomez (#CLB-103 - Server)</option>
              <option value="104">Carlos Mendoza (#CLB-104 - Busser)</option>
              <option value="105">Ana Torres (#CLB-105 - Kitchen)</option>
            </select>
          </div>

          {/* Shift ID */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Work Shift Reference (#SFT-ID) *
            </label>
            <input
              type="text"
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              placeholder="e.g. 401"
              required
              className="w-full h-11 px-3.5 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-sm font-mono font-semibold text-[#1c1b1f] focus:outline-none focus:border-[#ae001a] transition-colors"
            />
          </div>

          {/* Settlement Method */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Settlement Payout Channel (SettlementMethod) *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SETTLEMENT_METHODS.map((method) => {
                const isSelected = settlementMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setSettlementMethod(method)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold font-poppins transition-all flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? 'bg-[#ae001a] text-white border-[#ae001a] shadow-sm'
                        : 'bg-[#fbf9f5] text-[#1c1b1f] border-[#e8e2d8] hover:border-[#ae001a]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">
                      {method === 'CASH'
                        ? 'payments'
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

          {/* Total Amount */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Total Settled Amount ($ total_amount) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-base">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                required
                className="w-full h-11 pl-8 pr-3.5 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-sm font-bold text-[#1c1b1f] focus:outline-none focus:border-[#ae001a] transition-colors"
              />
            </div>
          </div>

          {/* Associated Order ID (Optional) */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Associated Order ID (#ORD-ID, Optional)
            </label>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="e.g. 5012 (Leave empty if generated from shift pool)"
              className="w-full h-11 px-3.5 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-sm font-mono text-[#1c1b1f] focus:outline-none focus:border-[#ae001a] transition-colors"
            />
          </div>

          {/* Authorizing User Info */}
          <div className="p-3.5 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-xs space-y-1">
            <span className="text-[#8a7a68] font-bold uppercase tracking-wider">Authorizing User:</span>
            <div className="flex items-center gap-2 font-bold text-[#1c1b1f]">
              <span className="material-symbols-outlined text-[#ae001a] text-base">verified</span>
              <span>Elena Rostova (Store Administrator #88)</span>
            </div>
          </div>

          {/* Audit Remarks */}
          <div>
            <label className="block text-xs font-bold text-[#1c1b1f] uppercase tracking-wider mb-1.5">
              Audit Remarks & Execution Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Direct cash payout verified against shift cash drawer ledger"
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
            className="px-4 py-2 bg-white border border-[#e8e2d8] text-[#1c1b1f] font-bold text-xs rounded-xl hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="tip-settlement-form"
            disabled={submitting}
            className="px-5 py-2.5 bg-[#ae001a] text-white font-bold text-xs rounded-xl hover:bg-[#8e0015] shadow-md flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">check_circle</span>
                <span>Authorize & Save Settlement</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TipSettlementFormDrawer;
