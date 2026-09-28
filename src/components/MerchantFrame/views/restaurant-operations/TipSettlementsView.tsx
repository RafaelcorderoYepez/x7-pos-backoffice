import React, { useEffect, useState, useMemo } from 'react';
import type {
  TipSettlement,
  SettlementMethod,
  TipSettlementStatus,
} from '../../../../types/tip-settlements';
import {
  SETTLEMENT_METHODS,
  SETTLEMENT_METHOD_LABELS,
  TIP_SETTLEMENT_STATUSES,
  TIP_SETTLEMENT_STATUS_LABELS,
} from '../../../../types/tip-settlements';
import * as tipSettlementsApi from '../../../../api/tip-settlements';
import { getCurrentMerchantId } from '../../../../api/users';
import { TipsManagementQuickLinks } from './TipsManagementQuickLinks';
import { TipSettlementDetailDrawer } from './TipSettlementDetailDrawer';
import { TipSettlementFormDrawer } from './TipSettlementFormDrawer';
import { TipSettlementExecutionDrawer } from './TipSettlementExecutionDrawer';

export interface TipSettlementsViewProps {
  onNavigate?: (view: string) => void;
  companyId?: string;
  merchantId?: string;
}

export const TipSettlementsView: React.FC<TipSettlementsViewProps> = ({
  onNavigate,
  companyId = 'cmp-01',
  merchantId,
}) => {
  const resolvedMerchantId = useMemo(() => {
    if (merchantId) return merchantId;
    const resolved = getCurrentMerchantId();
    return resolved ? String(resolved) : 'mch-01';
  }, [merchantId]);

  // Search & Multi-Filter Matrix State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<SettlementMethod | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<TipSettlementStatus | 'ALL'>('ALL');
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<string>('');
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Data & Hydration State
  const [settlements, setSettlements] = useState<TipSettlement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Drawers State
  const [selectedSettlementForAudit, setSelectedSettlementForAudit] =
    useState<TipSettlement | null>(null);
  const [selectedSettlementForExecution, setSelectedSettlementForExecution] =
    useState<TipSettlement | null>(null);
  const [isFormDrawerOpen, setIsFormDrawerOpen] = useState<boolean>(false);

  const loadSettlementsData = async () => {
    setLoading(true);
    setError(null);
    try {
      /**
       * Executes tenant-scoped query targeting database indexes:
       * - @Index(['company_id', 'merchant_id', 'settled_at'])
       * - @Index(['collaborator_id', 'shift_id'])
       */
      const data = await tipSettlementsApi.fetchTipSettlements({
        company_id: companyId,
        merchant_id: resolvedMerchantId,
        collaborator_id: selectedCollaboratorId || undefined,
        shift_id: selectedShiftId || undefined,
        settlement_method: selectedMethod,
        status: selectedStatus,
        search: searchQuery,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      setSettlements(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to hydrate tip settlements workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettlementsData();
  }, [
    companyId,
    resolvedMerchantId,
    searchQuery,
    selectedMethod,
    selectedStatus,
    selectedCollaboratorId,
    selectedShiftId,
    dateFrom,
    dateTo,
  ]);

  const metrics = useMemo(
    () => tipSettlementsApi.calculateTipSettlementsSummaryMetrics(settlements),
    [settlements]
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedMethod('ALL');
    setSelectedStatus('ALL');
    setSelectedCollaboratorId('');
    setSelectedShiftId('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilter =
    searchQuery !== '' ||
    selectedMethod !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    selectedCollaboratorId !== '' ||
    selectedShiftId !== '' ||
    dateFrom !== '' ||
    dateTo !== '';

  const handleExecutePayout = async (settlement: TipSettlement) => {
    setSelectedSettlementForExecution(settlement);
  };

  return (
    <div className="min-h-screen bg-[#fbf9f5] flex flex-col font-poppins pb-16">
      {/* Header Bar */}
      <div className="bg-white border-b border-[#e8e2d8] px-6 py-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-[#ae001a]">
                account_balance_wallet
              </span>
              <h1 className="text-2xl font-extrabold text-[#1c1b1f] tracking-tight">
                Tip Settlements Workspace
              </h1>
            </div>
            <p className="text-xs text-[#8a7a68] mt-1 font-medium">
              Audit finalized tip payout records, track total settled amounts, review payment methods & authorizing users
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadSettlementsData}
              aria-label="Refresh settlement records"
              className="px-3.5 py-2 bg-white border border-[#e8e2d8] text-[#1c1b1f] hover:bg-gray-50 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>
                refresh
              </span>
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFormDrawerOpen(true)}
              className="px-4 py-2.5 bg-[#ae001a] text-white hover:bg-[#8e0015] rounded-xl font-bold text-xs shadow-md flex items-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-base">add_card</span>
              <span>New Tip Settlement</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 space-y-6">
        {/* Summary Metrics Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Settled Amount */}
          <div className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider">
                Total Settled Amount
              </span>
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center material-symbols-outlined text-lg">
                payments
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-emerald-600">
                {tipSettlementsApi.formatSettlementCurrency(metrics.totalSettledAmount)}
              </p>
              <p className="text-xs text-[#8a7a68] font-medium mt-1">
                Across {metrics.settledCount} finalized payouts
              </p>
            </div>
          </div>

          {/* Card 2: Settled Payouts Count */}
          <div className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider">
                Settled Payouts
              </span>
              <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center material-symbols-outlined text-lg">
                check_circle
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-[#1c1b1f]">
                {metrics.settledCount} / {metrics.totalCount}
              </p>
              <p className="text-xs text-[#8a7a68] font-medium mt-1">
                Avg payout: {tipSettlementsApi.formatSettlementCurrency(metrics.avgSettledAmount)}
              </p>
            </div>
          </div>

          {/* Card 3: Pending Execution */}
          <div className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider">
                Pending Execution
              </span>
              <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center material-symbols-outlined text-lg">
                hourglass_empty
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-extrabold text-amber-600">
                {metrics.pendingCount} records
              </p>
              <p className="text-xs text-[#8a7a68] font-medium mt-1">
                Awaiting authorization
              </p>
            </div>
          </div>

          {/* Card 4: Payout Channels Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider">
                Channels Breakdown
              </span>
              <span className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center material-symbols-outlined text-lg">
                account_balance
              </span>
            </div>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-[#8a7a68]">Cash:</span>
                <span className="font-bold text-emerald-700">{tipSettlementsApi.formatSettlementCurrency(metrics.cashAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a7a68]">Payroll:</span>
                <span className="font-bold text-blue-700">{tipSettlementsApi.formatSettlementCurrency(metrics.payrollAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a7a68]">Bank Transfer:</span>
                <span className="font-bold text-purple-700">{tipSettlementsApi.formatSettlementCurrency(metrics.bankTransferAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Multi-Filter Matrix Section */}
        <div className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Alphanumeric Search Input */}
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Settlement ID (#STL-), Collaborator, Shift (#SFT-), or Order (#ORD-)..."
                className="w-full h-11 pl-10 pr-4 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-xs font-semibold text-[#1c1b1f] placeholder:text-gray-400 focus:outline-none focus:border-[#ae001a] transition-colors"
              />
            </div>

            {/* Reset Filters CTA */}
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3.5 py-2.5 text-xs font-bold text-[#ae001a] hover:bg-red-50 rounded-xl transition-colors flex items-center justify-center gap-1 border border-red-200"
              >
                <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          {/* Filter Dropdowns Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
            {/* Settlement Method Selector */}
            <div>
              <label htmlFor="settlement-method-select" className="block text-[11px] font-bold text-[#8a7a68] uppercase tracking-wider mb-1">
                Settlement Method (settlement_method)
              </label>
              <select
                id="settlement-method-select"
                data-testid="settlement-method-select"
                aria-label="Settlement Method"
                value={selectedMethod}
                onChange={(e) => setSelectedMethod(e.target.value as SettlementMethod | 'ALL')}
                className="w-full h-10 px-3 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-xs font-semibold text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
              >
                <option value="ALL">All Settlement Methods</option>
                {SETTLEMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {SETTLEMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            {/* Settlement Status Selector */}
            <div>
              <label htmlFor="settlement-status-select" className="block text-[11px] font-bold text-[#8a7a68] uppercase tracking-wider mb-1">
                Lifecycle Status (status)
              </label>
              <select
                id="settlement-status-select"
                data-testid="settlement-status-select"
                aria-label="Lifecycle Status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as TipSettlementStatus | 'ALL')}
                className="w-full h-10 px-3 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-xs font-semibold text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
              >
                <option value="ALL">All Statuses</option>
                {TIP_SETTLEMENT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {TIP_SETTLEMENT_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="block text-[11px] font-bold text-[#8a7a68] uppercase tracking-wider mb-1">
                Date Range From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full h-10 px-3 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-xs font-semibold text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-[11px] font-bold text-[#8a7a68] uppercase tracking-wider mb-1">
                Date Range To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full h-10 px-3 bg-[#fbf9f5] border border-[#e8e2d8] rounded-xl text-xs font-semibold text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
              />
            </div>
          </div>
        </div>

        {/* Data Grid Section */}
        <div className="bg-white rounded-2xl border border-[#e8e2d8] shadow-sm overflow-hidden">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#fbf9f5] border-b border-[#e8e2d8] text-[11px] font-extrabold text-[#8a7a68] uppercase tracking-wider">
                  <th className="py-3.5 px-4">Settlement ID</th>
                  <th className="py-3.5 px-4">Collaborator Profile</th>
                  <th className="py-3.5 px-4">Work Shift</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4">Method Pill</th>
                  <th className="py-3.5 px-4">Authorizing User</th>
                  <th className="py-3.5 px-4">Execution Timestamp</th>
                  <th className="py-3.5 px-4">Associated Order</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8] text-xs font-medium text-[#1c1b1f]">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-2xl animate-spin text-[#ae001a]">
                          progress_activity
                        </span>
                        <span>Hydrating tip settlements directory...</span>
                      </div>
                    </td>
                  </tr>
                ) : settlements.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-3xl text-gray-400">
                          search_off
                        </span>
                        <p className="font-bold text-gray-700">No tip settlements found</p>
                        <p className="text-xs text-gray-400">
                          Try adjusting search filters or date parameters.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  settlements.map((settlement) => {
                    const collaboratorName = settlement.collaborator
                      ? `${settlement.collaborator.first_name} ${settlement.collaborator.last_name}`
                      : `Collaborator #${settlement.collaborator_id}`;

                    const authorizerName =
                      settlement.settledByUser?.name ||
                      (settlement.settled_by ? `User #${settlement.settled_by}` : 'System Automated');

                    return (
                      <tr
                        key={settlement.id}
                        className="hover:bg-[#fbf9f5]/80 transition-colors"
                      >
                        {/* 1. Settlement Reference ID in bold typography */}
                        <td className="py-4 px-4 font-extrabold text-[#1c1b1f] whitespace-nowrap">
                          #STL-{settlement.id}
                        </td>

                        {/* 2. Collaborator Profile with #CLB-{collaborator_id} chip */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div>
                            <p className="font-bold text-[#1c1b1f]">{collaboratorName}</p>
                            <span className="inline-block mt-0.5 px-2 py-0.5 bg-[#ae001a]/10 text-[#ae001a] font-mono font-bold text-[10px] rounded-md">
                              #CLB-{settlement.collaborator_id}
                            </span>
                          </div>
                        </td>

                        {/* 3. Work Shift badge linking to shift workspace */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onNavigate?.('/staff-management/shifts')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-mono font-bold text-xs rounded-lg transition-colors"
                          >
                            <span className="material-symbols-outlined text-xs">schedule</span>
                            <span>#SFT-{settlement.shift_id}</span>
                          </button>
                        </td>

                        {/* 4. Total Settled Amount in bold green currency format */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className="font-extrabold text-emerald-600 text-sm">
                            {tipSettlementsApi.formatSettlementCurrency(settlement.total_amount)}
                          </span>
                        </td>

                        {/* 5. Settlement Method Pill visual badge */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                              settlement.settlement_method === 'CASH'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : settlement.settlement_method === 'PAYROLL'
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : 'bg-purple-50 text-purple-800 border border-purple-200'
                            }`}
                          >
                            <span className="material-symbols-outlined text-xs">
                              {settlement.settlement_method === 'CASH'
                                ? 'payments'
                                : settlement.settlement_method === 'PAYROLL'
                                ? 'receipt_long'
                                : 'account_balance'}
                            </span>
                            <span>{settlement.settlement_method}</span>
                          </span>
                        </td>

                        {/* 6. Authorizing User */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-semibold text-gray-700">
                            <span className="material-symbols-outlined text-sm text-gray-400">
                              verified_user
                            </span>
                            <span>{authorizerName}</span>
                          </div>
                        </td>

                        {/* 7. Execution Timestamp formatted YYYY-MM-DD HH:mm:ss */}
                        <td className="py-4 px-4 whitespace-nowrap font-mono text-xs text-gray-600">
                          {tipSettlementsApi.formatSettlementDateTime(settlement.settled_at)}
                        </td>

                        {/* 8. Associated Order chip or "N/A" */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          {settlement.order_id ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-900 border border-blue-200 font-mono font-bold text-xs rounded-lg">
                              #ORD-{settlement.order_id}
                            </span>
                          ) : (
                            <span className="text-gray-400 font-medium">N/A</span>
                          )}
                        </td>

                        {/* 9. Settlement Lifecycle Status Badge */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                              settlement.status === 'SETTLED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : settlement.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-gray-100 text-gray-700 border border-gray-200'
                            }`}
                          >
                            <span className="material-symbols-outlined text-xs">
                              {settlement.status === 'SETTLED'
                                ? 'check_circle'
                                : settlement.status === 'PENDING'
                                ? 'hourglass_empty'
                                : 'cancel'}
                            </span>
                            <span>{TIP_SETTLEMENT_STATUS_LABELS[settlement.status]}</span>
                          </span>
                        </td>

                        {/* Actions Column */}
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {settlement.status === 'PENDING' && (
                              <button
                                type="button"
                                onClick={() => handleExecutePayout(settlement)}
                                title="Execute Payout"
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                              >
                                <span className="material-symbols-outlined text-xs">done</span>
                                <span>Settle</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setSelectedSettlementForAudit(settlement)}
                              className="px-2.5 py-1 bg-[#fbf9f5] border border-[#e8e2d8] hover:bg-[#e8e2d8]/50 text-[#1c1b1f] rounded-lg text-xs font-bold transition-colors"
                            >
                              Audit Details
                            </button>
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
      </div>

      {/* Audit Detail Drawer */}
      <TipSettlementDetailDrawer
        settlement={selectedSettlementForAudit}
        isOpen={Boolean(selectedSettlementForAudit)}
        onClose={() => setSelectedSettlementForAudit(null)}
        onSettlePayout={handleExecutePayout}
      />

      {/* Settlement Execution Drawer */}
      <TipSettlementExecutionDrawer
        isOpen={Boolean(selectedSettlementForExecution)}
        targetSettlement={selectedSettlementForExecution}
        onClose={() => setSelectedSettlementForExecution(null)}
        onExecute={async (dto) => {
          if (selectedSettlementForExecution) {
            await tipSettlementsApi.updateTipSettlementStatus(
              selectedSettlementForExecution.id,
              dto.status || 'SETTLED',
              dto.settled_by || 88,
              dto.notes
            );
          } else {
            await tipSettlementsApi.createTipSettlement(dto);
          }
          await loadSettlementsData();
        }}
        companyId={companyId}
        merchantId={resolvedMerchantId}
      />

      {/* New Settlement Form Drawer */}
      <TipSettlementFormDrawer
        isOpen={isFormDrawerOpen}
        onClose={() => setIsFormDrawerOpen(false)}
        onSubmit={async (dto) => {
          await tipSettlementsApi.createTipSettlement(dto);
          await loadSettlementsData();
        }}
        companyId={companyId}
        merchantId={resolvedMerchantId}
      />

      {/* Bottom Navigation Hub */}
      <TipsManagementQuickLinks
        activeModule="tips-settlements"
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default TipSettlementsView;
