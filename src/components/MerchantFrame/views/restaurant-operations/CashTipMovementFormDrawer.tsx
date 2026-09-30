import React, { useEffect, useState } from 'react';
import type {
  CashTipMovementType,
  CreateCashTipMovementDto,
  CashDrawerOption,
  TipOption,
} from '../../../../types/cash-tip-movement';
import {
  fetchOpenCashDrawers,
  fetchAvailableTips,
  createCashTipMovement,
} from '../../../../api/cash-tip-movements';

export interface CashTipMovementFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyId?: string;
  merchantId?: string;
}

export const CashTipMovementFormDrawer: React.FC<CashTipMovementFormDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  companyId = 'cmp-01',
  merchantId = 'mch-01',
}) => {
  const [drawers, setDrawers] = useState<CashDrawerOption[]>([]);
  const [tips, setTips] = useState<TipOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState<boolean>(true);

  // Form Field State
  const [cashDrawerId, setCashDrawerId] = useState<string>('');
  const [tipId, setTipId] = useState<string>('');
  const [movementType, setMovementType] = useState<CashTipMovementType>('IN');
  const [amount, setAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Submission & Validation State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Adjust form error state during render when isOpen changes (prevents react-hooks/set-state-in-effect)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setFormError(null);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    Promise.all([fetchOpenCashDrawers(), fetchAvailableTips()])
      .then(([drawerList, tipList]) => {
        if (ignore) return;
        setDrawers(drawerList);
        setTips(tipList);

        const firstOpen = drawerList.find(
          (d) => d.status.toUpperCase() === 'OPEN'
        );
        if (firstOpen) {
          setCashDrawerId(String(firstOpen.id));
        } else if (drawerList.length > 0) {
          setCashDrawerId(String(drawerList[0].id));
        }

        if (tipList.length > 0) {
          setTipId(String(tipList[0].id));
        }
        setLoadingOptions(false);
      })
      .catch(() => {
        if (!ignore) setLoadingOptions(false);
      });

    return () => {
      ignore = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Find currently selected drawer & tip objects
  const selectedDrawer = drawers.find((d) => String(d.id) === cashDrawerId);
  const selectedTip = tips.find((t) => String(t.id) === tipId);

  // Live Business Rules & Validation Guard Evaluation
  const isDrawerClosed =
    selectedDrawer &&
    (selectedDrawer.status.toUpperCase() === 'CLOSED' ||
      selectedDrawer.status.toUpperCase() === 'CLOSE');

  const parsedAmount = parseFloat(amount) || 0;
  const isInsufficientCash =
    movementType === 'OUT' &&
    selectedDrawer &&
    parsedAmount > selectedDrawer.current_balance;

  // Determine active guard error message
  let activeGuardError: string | null = null;
  if (isDrawerClosed) {
    activeGuardError = 'Cannot record cash tip movements on a closed cash drawer.';
  } else if (isInsufficientCash && selectedDrawer) {
    activeGuardError = `Insufficient cash balance in drawer #CDR-${selectedDrawer.id} for tip payout.`;
  }

  const isSubmitDisabled =
    submitting ||
    !cashDrawerId ||
    !tipId ||
    parsedAmount <= 0 ||
    !!activeGuardError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;

    if (activeGuardError) {
      setFormError(activeGuardError);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const dto: CreateCashTipMovementDto = {
        company_id: companyId,
        merchant_id: merchantId,
        cash_drawer_id: Number(cashDrawerId),
        tip_id: Number(tipId),
        movement_type: movementType,
        amount: parsedAmount,
        notes: notes.trim() || undefined,
      };

      await createCashTipMovement(dto);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to register cash tip movement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-end transition-opacity duration-300"
      data-testid="cash-tip-movement-form-drawer"
    >
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col font-poppins overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-[#e8e2d8] flex items-center justify-between bg-[#fbf9f5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ae001a]/10 flex items-center justify-center text-[#ae001a]">
              <span className="material-symbols-outlined text-xl">add_card</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1c1b1f] flex items-center gap-2">
                Register Cash Tip Movement
              </h3>
              <p className="text-xs text-[#8a7a68]">
                Manual cash gratuity inflow (IN) or instant staff payout (OUT)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form drawer"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Drawer Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 flex-1 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Immutability Banner */}
            <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 flex items-start gap-2.5 text-xs">
              <span className="material-symbols-outlined text-base text-blue-600 shrink-0 mt-0.5">
                verified_user
              </span>
              <div>
                <p className="font-bold">Immutable Financial Audit Entry</p>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  Submissions generate permanent audit records timestamped with `created_at`. Editing or deletion is disabled; reversals require logging an opposing movement.
                </p>
              </div>
            </div>

            {/* Error Alert Display */}
            {(formError || activeGuardError) && (
              <div
                className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-medium flex items-start gap-2.5 shadow-sm"
                data-testid="form-guard-error"
              >
                <span className="material-symbols-outlined text-base text-rose-600 shrink-0 mt-0.5">
                  warning
                </span>
                <div>
                  <p className="font-bold uppercase text-[10px] tracking-wider text-rose-600">
                    Business Validation Guard Triggered
                  </p>
                  <p className="mt-0.5 font-semibold">
                    {activeGuardError || formError}
                  </p>
                </div>
              </div>
            )}

            {/* Input 1: cash_drawer_id */}
            <div>
              <label htmlFor="form-cash-drawer-select" className="block text-xs font-bold text-[#1c1b1f] mb-1.5">
                Active Cash Drawer Session <span className="text-[#ae001a]">*</span>
              </label>
              {loadingOptions ? (
                <div className="py-2.5 px-3 border border-[#e8e2d8] rounded-xl text-xs text-slate-400 bg-[#fbf9f5]">
                  Loading open drawers...
                </div>
              ) : (
                <select
                  id="form-cash-drawer-select"
                  value={cashDrawerId}
                  onChange={(e) => setCashDrawerId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-xs font-semibold border border-[#e8e2d8] rounded-xl bg-[#fbf9f5] text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
                  data-testid="form-cash-drawer-select"
                >
                  <option value="">-- Select Cash Drawer --</option>
                  {drawers.map((d) => (
                    <option key={d.id} value={d.id}>
                      #CDR-{d.id} - {d.drawer_name} ({d.status.toUpperCase()} - Available: ${d.current_balance.toFixed(2)})
                    </option>
                  ))}
                </select>
              )}
              {selectedDrawer && (
                <div className="mt-2 flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                  <span className="text-slate-600 font-mono">
                    Drawer ID: #CDR-{selectedDrawer.id}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        selectedDrawer.status.toUpperCase() === 'OPEN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {selectedDrawer.status.toUpperCase()}
                    </span>
                    <span className="font-bold text-slate-800">
                      Balance: ${selectedDrawer.current_balance.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input 2: tip_id */}
            <div>
              <label htmlFor="form-tip-select" className="block text-xs font-bold text-[#1c1b1f] mb-1.5">
                Linked Source Tip Record <span className="text-[#ae001a]">*</span>
              </label>
              {loadingOptions ? (
                <div className="py-2.5 px-3 border border-[#e8e2d8] rounded-xl text-xs text-slate-400 bg-[#fbf9f5]">
                  Loading tip records...
                </div>
              ) : (
                <select
                  id="form-tip-select"
                  value={tipId}
                  onChange={(e) => setTipId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-xs font-semibold border border-[#e8e2d8] rounded-xl bg-[#fbf9f5] text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
                  data-testid="form-tip-select"
                >
                  <option value="">-- Select Tip Reference --</option>
                  {tips.map((t) => (
                    <option key={t.id} value={t.id}>
                      #TIP-{t.id} - ${t.amount.toFixed(2)} ({t.collaborator_name || 'Staff'})
                    </option>
                  ))}
                </select>
              )}
              {selectedTip && (
                <div className="mt-2 px-3 py-2 bg-purple-50/60 rounded-lg border border-purple-200 text-xs text-purple-900 flex justify-between font-mono">
                  <span>Linked Tip: #TIP-{selectedTip.id}</span>
                  <span className="font-bold">${selectedTip.amount.toFixed(2)} ({selectedTip.method})</span>
                </div>
              )}
            </div>

            {/* Input 3: movement_type */}
            <div>
              <label htmlFor="form-movement-type-select" className="block text-xs font-bold text-[#1c1b1f] mb-1.5">
                Movement Direction <span className="text-[#ae001a]">*</span>
              </label>
              <select
                id="form-movement-type-select"
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as CashTipMovementType)}
                required
                className="w-full px-3.5 py-2.5 text-xs font-semibold border border-[#e8e2d8] rounded-xl bg-[#fbf9f5] text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
                data-testid="form-movement-type-select"
              >
                <option value="IN">CASH IN - Gratuity Collection (Entry into Drawer)</option>
                <option value="OUT">CASH OUT - Staff Tip Payout (Exit from Drawer)</option>
              </select>
            </div>

            {/* Input 4: amount */}
            <div>
              <label htmlFor="form-amount-input" className="block text-xs font-bold text-[#1c1b1f] mb-1.5">
                Movement Amount ($) <span className="text-[#ae001a]">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                  $
                </span>
                <input
                  id="form-amount-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="25.50"
                  required
                  className="w-full pl-8 pr-4 py-2.5 text-sm font-bold font-mono border border-[#e8e2d8] rounded-xl bg-[#fbf9f5] text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
                  data-testid="form-amount-input"
                />
              </div>
            </div>

            {/* Input 5: notes */}
            <div>
              <label htmlFor="form-notes-input" className="block text-xs font-bold text-[#1c1b1f] mb-1.5">
                Audit Notes & Justification (Optional)
              </label>
              <textarea
                id="form-notes-input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason or justification for cash tip entry / payout..."
                className="w-full px-3.5 py-2 text-xs border border-[#e8e2d8] rounded-xl bg-[#fbf9f5] text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
                data-testid="form-notes-input"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-[#e8e2d8] flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 shadow-md ${
                isSubmitDisabled
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-[#ae001a] hover:bg-[#8e0015] active:scale-95'
              }`}
              data-testid="submit-movement-btn"
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">
                    progress_activity
                  </span>
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  <span>Register Cash Tip Movement</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CashTipMovementFormDrawer;
