import React from 'react';
import type { CashTipMovement } from '../../../../types/cash-tip-movement';
import { formatCashTipMovementDateTime } from '../../../../api/cash-tip-movements';

export interface CashTipMovementDetailDrawerProps {
  movement: CashTipMovement | null;
  onClose: () => void;
  onNavigate?: (view: string) => void;
}

export const CashTipMovementDetailDrawer: React.FC<CashTipMovementDetailDrawerProps> = ({
  movement,
  onClose,
  onNavigate,
}) => {
  if (!movement) return null;

  const isCashIn = movement.movement_type === 'IN';
  const formattedAmount = isCashIn
    ? `+$${movement.amount.toFixed(2)}`
    : `-$${movement.amount.toFixed(2)}`;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-sm flex justify-end transition-opacity duration-300"
      data-testid="cash-tip-movement-detail-drawer"
    >
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col font-poppins overflow-y-auto animate-in slide-in-from-right duration-300">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-[#e8e2d8] flex items-center justify-between bg-[#fbf9f5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ae001a]/10 flex items-center justify-center text-[#ae001a]">
              <span className="material-symbols-outlined text-xl">point_of_sale</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1c1b1f] flex items-center gap-2">
                Cash Tip Movement Audit Record
              </h3>
              <p className="text-xs text-[#8a7a68] font-mono">#CTM-{movement.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Drawer Content */}
        <div className="p-6 space-y-6 flex-1">
          {/* Main Hero Card */}
          <div
            className={`p-5 rounded-2xl border ${
              isCashIn
                ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950'
                : 'bg-amber-50/60 border-amber-200/80 text-amber-950'
            } flex flex-col gap-3 shadow-sm`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wider ${
                  isCashIn
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/80'
                    : 'bg-amber-100 text-amber-800 border border-amber-300/80'
                }`}
              >
                <span className="material-symbols-outlined text-sm font-bold">
                  {isCashIn ? 'arrow_downward' : 'arrow_upward'}
                </span>
                <span>{isCashIn ? 'CASH IN' : 'CASH OUT'}</span>
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {formatCashTipMovementDateTime(movement.created_at)}
              </span>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Movement Amount
              </p>
              <h2
                className={`text-3xl font-extrabold font-poppins mt-1 ${
                  isCashIn ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {formattedAmount}
              </h2>
            </div>
          </div>

          {/* Database Composite Index Info Banner */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <span className="material-symbols-outlined text-base text-[#ae001a]">bolt</span>
              <span>Query Optimization & Index Trace</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono">
              <span className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-600">
                @Index(['cash_drawer_id', 'created_at'])
              </span>
              <span className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-600">
                @Index(['tip_id'])
              </span>
            </div>
          </div>

          {/* Association Details */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider border-b border-[#e8e2d8] pb-2">
              Entity Associations & Navigation Links
            </h4>

            <div className="grid grid-cols-2 gap-3">
              {/* Associated Cash Drawer Chip */}
              <div className="p-3 bg-[#fbf9f5] rounded-xl border border-[#e8e2d8]">
                <p className="text-[11px] font-semibold text-[#8a7a68] uppercase">
                  Associated Cash Drawer
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                    <span className="material-symbols-outlined text-xs">point_of_sale</span>
                    #CDR-{movement.cash_drawer_id}
                  </span>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('cash-drawers')}
                      className="text-xs font-bold text-[#ae001a] hover:underline flex items-center gap-0.5"
                    >
                      View
                      <span className="material-symbols-outlined text-xs">open_in_new</span>
                    </button>
                  )}
                </div>
                {movement.cash_drawer?.drawer_name && (
                  <p className="text-xs text-slate-600 mt-2">
                    {movement.cash_drawer.drawer_name}
                  </p>
                )}
              </div>

              {/* Linked Tip Reference Chip */}
              <div className="p-3 bg-[#fbf9f5] rounded-xl border border-[#e8e2d8]">
                <p className="text-[11px] font-semibold text-[#8a7a68] uppercase">
                  Source Tip Reference
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-purple-50 text-purple-700 border border-purple-200">
                    <span className="material-symbols-outlined text-xs">payments</span>
                    #TIP-{movement.tip_id}
                  </span>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('/tips/ledger')}
                      className="text-xs font-bold text-[#ae001a] hover:underline flex items-center gap-0.5"
                    >
                      View
                      <span className="material-symbols-outlined text-xs">open_in_new</span>
                    </button>
                  )}
                </div>
                {movement.tip?.collaborator_name && (
                  <p className="text-xs text-slate-600 mt-2">
                    Collaborator: {movement.tip.collaborator_name}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Notes & Audit Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider border-b border-[#e8e2d8] pb-2">
              Audit Notes & Justification
            </h4>
            <div className="p-4 bg-[#fbf9f5] rounded-xl border border-[#e8e2d8] text-sm text-[#1c1b1f] leading-relaxed">
              {movement.notes || 'No custom audit notes recorded for this movement.'}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-6 border-t border-[#e8e2d8] bg-[#fbf9f5] flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            Tenant: {movement.company_id} | Merchant: {movement.merchant_id}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition-colors"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};

export default CashTipMovementDetailDrawer;
