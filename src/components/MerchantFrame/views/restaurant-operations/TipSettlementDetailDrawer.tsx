import React from 'react';
import type { TipSettlement } from '../../../../types/tip-settlements';
import {
  SETTLEMENT_METHOD_LABELS,
  TIP_SETTLEMENT_STATUS_LABELS,
} from '../../../../types/tip-settlements';
import {
  formatSettlementCurrency,
  formatSettlementDateTime,
} from '../../../../api/tip-settlements';

export interface TipSettlementDetailDrawerProps {
  settlement: TipSettlement | null;
  isOpen: boolean;
  onClose: () => void;
  onSettlePayout?: (settlement: TipSettlement) => void;
}

export const TipSettlementDetailDrawer: React.FC<TipSettlementDetailDrawerProps> = ({
  settlement,
  isOpen,
  onClose,
  onSettlePayout,
}) => {
  if (!isOpen || !settlement) return null;

  const collaboratorName = settlement.collaborator
    ? `${settlement.collaborator.first_name} ${settlement.collaborator.last_name}`
    : `Collaborator #${settlement.collaborator_id}`;

  const authorizerName = settlement.settledByUser?.name || (settlement.settled_by ? `User #${settlement.settled_by}` : 'System Automated');

  return (
    <div
      aria-label="Tip settlement audit drawer overlay"
      className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-end font-poppins transition-opacity duration-300"
    >
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-[#e8e2d8] bg-[#fbf9f5] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ae001a]/10 text-[#ae001a] flex items-center justify-center font-bold">
              <span className="material-symbols-outlined">account_balance_wallet</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#1c1b1f]">
                  #STL-{settlement.id}
                </h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    settlement.status === 'SETTLED'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : settlement.status === 'PENDING'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-gray-100 text-gray-700 border border-gray-200'
                  }`}
                >
                  {TIP_SETTLEMENT_STATUS_LABELS[settlement.status]}
                </span>
              </div>
              <p className="text-xs text-[#8a7a68]">Tip Settlement Audit Record</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close audit drawer"
            className="w-8 h-8 rounded-full hover:bg-gray-200/60 flex items-center justify-center text-gray-500 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1">
          {/* Amount Box */}
          <div className="bg-[#f5f9f6] border border-emerald-200 rounded-2xl p-5 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                Total Settled Amount
              </p>
              <p className="text-3xl font-extrabold text-emerald-600 mt-1">
                {formatSettlementCurrency(settlement.total_amount)}
              </p>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">payments</span>
              <span>{SETTLEMENT_METHOD_LABELS[settlement.settlement_method] || settlement.settlement_method}</span>
            </div>
          </div>

          {/* Key Attributes Matrix */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-xl bg-[#fbf9f5] border border-[#e8e2d8]">
              <p className="text-xs text-[#8a7a68] font-bold uppercase tracking-wider mb-1">
                Collaborator Profile
              </p>
              <p className="font-bold text-[#1c1b1f]">{collaboratorName}</p>
              <span className="inline-block mt-1.5 px-2 py-0.5 bg-[#ae001a]/10 text-[#ae001a] font-mono font-bold text-xs rounded-md">
                #CLB-{settlement.collaborator_id}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#fbf9f5] border border-[#e8e2d8]">
              <p className="text-xs text-[#8a7a68] font-bold uppercase tracking-wider mb-1">
                Work Shift
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-200 font-mono font-bold text-xs rounded-lg">
                  #SFT-{settlement.shift_id}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#fbf9f5] border border-[#e8e2d8]">
              <p className="text-xs text-[#8a7a68] font-bold uppercase tracking-wider mb-1">
                Authorizing User
              </p>
              <p className="font-bold text-[#1c1b1f] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base text-gray-500">verified_user</span>
                <span>{authorizerName}</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#fbf9f5] border border-[#e8e2d8]">
              <p className="text-xs text-[#8a7a68] font-bold uppercase tracking-wider mb-1">
                Execution Timestamp
              </p>
              <p className="font-mono text-xs font-semibold text-[#1c1b1f]">
                {formatSettlementDateTime(settlement.settled_at)}
              </p>
            </div>
          </div>

          {/* Relational Order Context */}
          <div className="p-4 rounded-xl bg-[#fbf9f5] border border-[#e8e2d8]">
            <p className="text-xs text-[#8a7a68] font-bold uppercase tracking-wider mb-2">
              Associated Order Context
            </p>
            {settlement.order_id ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-200 font-mono font-bold text-xs rounded-lg">
                    #ORD-{settlement.order_id}
                  </span>
                  {settlement.order?.total_amount && (
                    <span className="text-xs text-gray-600 font-medium">
                      (Order Total: {formatSettlementCurrency(settlement.order.total_amount)})
                    </span>
                  )}
                </div>
                <span className="text-xs text-blue-700 font-bold">Direct Order Tip</span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-[#8a7a68]">
                <span>N/A</span>
                <span className="italic">Generated from Shift Pool Accumulation</span>
              </div>
            )}
          </div>

          {/* Audit Notes */}
          {settlement.notes && (
            <div className="p-4 rounded-xl bg-[#fbf9f5] border border-[#e8e2d8]">
              <p className="text-xs text-[#8a7a68] font-bold uppercase tracking-wider mb-1">
                Audit Remarks & Notes
              </p>
              <p className="text-xs text-gray-700 italic">"{settlement.notes}"</p>
            </div>
          )}

          {/* System Audit Details */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Company Scope ID:</span>
              <span className="font-mono font-semibold">{settlement.company_id}</span>
            </div>
            <div className="flex justify-between">
              <span>Merchant Scope ID:</span>
              <span className="font-mono font-semibold">{settlement.merchant_id}</span>
            </div>
            <div className="flex justify-between">
              <span>Record Created:</span>
              <span className="font-mono">{formatSettlementDateTime(settlement.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#e8e2d8] bg-[#fbf9f5] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-[#e8e2d8] text-[#1c1b1f] font-bold text-xs rounded-xl hover:bg-gray-100 transition-colors"
          >
            Close Audit View
          </button>
          {settlement.status === 'PENDING' && onSettlePayout && (
            <button
              type="button"
              onClick={() => {
                onSettlePayout(settlement);
                onClose();
              }}
              className="px-5 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 shadow-md flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-base">check_circle</span>
              <span>Execute Settlement Payout</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TipSettlementDetailDrawer;
