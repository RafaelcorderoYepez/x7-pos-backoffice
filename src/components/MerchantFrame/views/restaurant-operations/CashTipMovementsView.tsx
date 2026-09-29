import React, { useEffect, useState, useMemo } from 'react';
import type {
  CashTipMovement,
  CashTipMovementType,
} from '../../../../types/cash-tip-movement';
import {
  CASH_TIP_MOVEMENT_TYPES,
  CASH_TIP_MOVEMENT_TYPE_LABELS,
} from '../../../../types/cash-tip-movement';
import * as cashTipMovementsApi from '../../../../api/cash-tip-movements';
import { getCurrentMerchantId } from '../../../../api/users';
import { TipsManagementQuickLinks } from './TipsManagementQuickLinks';
import { CashTipMovementDetailDrawer } from './CashTipMovementDetailDrawer';
import { CashTipMovementFormDrawer } from './CashTipMovementFormDrawer';

export interface CashTipMovementsViewProps {
  onNavigate?: (view: string) => void;
  companyId?: string;
  merchantId?: string;
}

export const CashTipMovementsView: React.FC<CashTipMovementsViewProps> = ({
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
  const [selectedMovementType, setSelectedMovementType] = useState<CashTipMovementType | 'ALL'>('ALL');
  const [selectedCashDrawerId, setSelectedCashDrawerId] = useState<string>('');
  const [selectedTipId, setSelectedTipId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Data & Hydration State
  const [movements, setMovements] = useState<CashTipMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Detail Drawer Audit State
  const [selectedMovementForAudit, setSelectedMovementForAudit] = useState<CashTipMovement | null>(null);

  // Form Drawer Registration State
  const [isFormDrawerOpen, setIsFormDrawerOpen] = useState<boolean>(false);

  const loadCashTipMovementsData = async () => {
    setLoading(true);
    setError(null);
    try {
      /**
       * Executes tenant-scoped query targeting database indexes:
       * - @Index(['cash_drawer_id', 'created_at'])
       * - @Index(['tip_id'])
       */
      const data = await cashTipMovementsApi.fetchCashTipMovements({
        company_id: companyId,
        merchant_id: resolvedMerchantId,
        cash_drawer_id: selectedCashDrawerId || undefined,
        tip_id: selectedTipId || undefined,
        movement_type: selectedMovementType,
        search: searchQuery,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      setMovements(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to hydrate cash tip movements workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCashTipMovementsData();
  }, [
    companyId,
    resolvedMerchantId,
    searchQuery,
    selectedMovementType,
    selectedCashDrawerId,
    selectedTipId,
    dateFrom,
    dateTo,
  ]);

  const metrics = useMemo(
    () => cashTipMovementsApi.calculateCashTipMovementsSummaryMetrics(movements),
    [movements]
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedMovementType('ALL');
    setSelectedCashDrawerId('');
    setSelectedTipId('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilter =
    searchQuery !== '' ||
    selectedMovementType !== 'ALL' ||
    selectedCashDrawerId !== '' ||
    selectedTipId !== '' ||
    dateFrom !== '' ||
    dateTo !== '';

  return (
    <div
      className="min-h-screen bg-[#fbf9f5] flex flex-col font-poppins text-[#1c1b1f] pb-24"
      data-testid="cash-tip-movements-workspace"
    >
      {/* Workspace Header */}
      <header className="bg-white border-b border-[#e8e2d8] px-6 py-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ae001a]/10 border border-[#ae001a]/20 flex items-center justify-center text-[#ae001a] shadow-inner">
              <span className="material-symbols-outlined text-2xl">point_of_sale</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-[#1c1b1f] tracking-tight">
                  Cash Tip Movements Directory Workspace
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                  Drawer & Tip Audits
                </span>
              </div>
              <p className="text-xs text-[#8a7a68] mt-0.5">
                Track physical cash flow entries (CASH IN) and payouts (CASH OUT) driven by gratuities, tied to specific cash drawers and tip references.
              </p>
            </div>
          </div>

          {/* Quick Refresh & Register Action Bar */}
          <div className="flex items-center gap-2">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e8e2d8] text-xs font-bold text-[#8a7a68] hover:bg-[#f3eee7] transition-colors"
                data-testid="reset-filters-btn"
              >
                <span className="material-symbols-outlined text-sm">filter_alt_off</span>
                <span>Reset Filters</span>
              </button>
            )}
            <button
              type="button"
              onClick={loadCashTipMovementsData}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#e8e2d8] bg-white text-[#1c1b1f] text-xs font-bold shadow-sm hover:bg-[#f3eee7] transition-all"
              data-testid="refresh-workspace-btn"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFormDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#ae001a] text-white text-xs font-bold shadow-md hover:bg-[#8e0015] active:scale-95 transition-all"
              data-testid="register-cash-movement-btn"
            >
              <span className="material-symbols-outlined text-sm font-bold">add_card</span>
              <span>REGISTER CASH MOVEMENT</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="max-w-7xl mx-auto px-6 py-6 w-full flex-1 space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-red-600">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Summary Metric Cards Header */}
        <section
          aria-label="Cash Tip Movement Summary Metrics"
          data-testid="kpi-summary-header"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Card 1: Total Cash Tips Collected (IN) */}
          <div
            className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm flex flex-col justify-between"
            data-testid="kpi-total-cash-in"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider font-poppins">
                Total Cash Tips Collected (IN)
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">arrow_downward</span>
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-extrabold text-emerald-700 font-mono font-poppins">
                +${metrics.totalInAmount.toFixed(2)}
              </h3>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 font-poppins">
                {metrics.inCount} Cash Gratuity Inflow Entries
              </p>
            </div>
          </div>

          {/* Card 2: Total Cash Tips Paid Out (OUT) */}
          <div
            className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm flex flex-col justify-between"
            data-testid="kpi-total-cash-out"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider font-poppins">
                Total Cash Tips Paid Out (OUT)
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">arrow_upward</span>
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-extrabold text-amber-700 font-mono font-poppins">
                -${metrics.totalOutAmount.toFixed(2)}
              </h3>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 font-poppins">
                {metrics.outCount} Cash Tip Payout Entries
              </p>
            </div>
          </div>

          {/* Card 3: Net Drawer Cash Tip Balance */}
          <div
            className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm flex flex-col justify-between"
            data-testid="kpi-net-drawer-balance"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider font-poppins">
                Net Drawer Cash Tip Balance
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">account_balance_wallet</span>
              </div>
            </div>
            <div className="mt-3">
              <h3
                className={`text-2xl font-extrabold font-mono font-poppins ${
                  metrics.netAmount >= 0 ? 'text-blue-700' : 'text-rose-700'
                }`}
              >
                {metrics.netAmount >= 0
                  ? `+$${metrics.netAmount.toFixed(2)}`
                  : `-$${Math.abs(metrics.netAmount).toFixed(2)}`}
              </h3>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 font-poppins">
                Net Drawer Cash Tip Balance (IN - OUT)
              </p>
            </div>
          </div>

          {/* Card 4: Total Movement Records */}
          <div
            className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm flex flex-col justify-between"
            data-testid="kpi-total-records"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#8a7a68] uppercase tracking-wider font-poppins">
                Total Movement Records
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">receipt_long</span>
              </div>
            </div>
            <div className="mt-3">
              <h3 className="text-2xl font-extrabold text-[#1c1b1f] font-mono font-poppins">
                {metrics.totalCount}
              </h3>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5 font-poppins">
                Indexed Cash Tip Movements
              </p>
            </div>
          </div>
        </section>

        {/* Search & Multi-Filter Matrix Toolbar */}
        <section
          aria-label="Search and Multi-Filter Matrix"
          className="bg-white p-5 rounded-2xl border border-[#e8e2d8] shadow-sm space-y-4"
        >
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Alphanumeric Search Input */}
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Movement ID (#CTM-), Drawer ID (#CDR-), or Tip Reference (#TIP-)..."
                className="w-full pl-10 pr-4 py-2.5 text-xs font-medium border border-[#e8e2d8] rounded-xl bg-[#fbf9f5] focus:outline-none focus:border-[#ae001a] focus:bg-white transition-all"
                data-testid="movement-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-sm">cancel</span>
                </button>
              )}
            </div>

            {/* Movement Direction Selector (movement_type) */}
            <div className="flex items-center gap-2">
              <label htmlFor="movement-type-select" className="text-xs font-bold text-[#8a7a68] whitespace-nowrap">
                Direction:
              </label>
              <select
                id="movement-type-select"
                value={selectedMovementType}
                onChange={(e) => setSelectedMovementType(e.target.value as CashTipMovementType | 'ALL')}
                className="px-3 py-2.5 text-xs font-semibold border border-[#e8e2d8] rounded-xl bg-[#fbf9f5] text-[#1c1b1f] focus:outline-none focus:border-[#ae001a]"
                data-testid="movement-direction-select"
              >
                <option value="ALL">All Directions (IN & OUT)</option>
                {CASH_TIP_MOVEMENT_TYPES.map((typeKey) => (
                  <option key={typeKey} value={typeKey}>
                    {CASH_TIP_MOVEMENT_TYPE_LABELS[typeKey]} ({typeKey})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Secondary Filters: Drawer ID, Tip ID, Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-[#e8e2d8]">
            {/* Cash Drawer Selector */}
            <div>
              <label className="block text-[11px] font-bold text-[#8a7a68] uppercase mb-1">
                Filter by Cash Drawer
              </label>
              <input
                type="text"
                value={selectedCashDrawerId}
                onChange={(e) => setSelectedCashDrawerId(e.target.value)}
                placeholder="Drawer ID (e.g. 1, 2)..."
                className="w-full px-3 py-2 text-xs border border-[#e8e2d8] rounded-lg bg-[#fbf9f5] focus:outline-none focus:border-[#ae001a]"
                data-testid="cash-drawer-filter-input"
              />
            </div>

            {/* Tip Reference Selector */}
            <div>
              <label className="block text-[11px] font-bold text-[#8a7a68] uppercase mb-1">
                Filter by Tip Reference
              </label>
              <input
                type="text"
                value={selectedTipId}
                onChange={(e) => setSelectedTipId(e.target.value)}
                placeholder="Tip ID (e.g. 701, 702)..."
                className="w-full px-3 py-2 text-xs border border-[#e8e2d8] rounded-lg bg-[#fbf9f5] focus:outline-none focus:border-[#ae001a]"
                data-testid="tip-filter-input"
              />
            </div>

            {/* Date From */}
            <div>
              <label className="block text-[11px] font-bold text-[#8a7a68] uppercase mb-1">
                Created Date From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#e8e2d8] rounded-lg bg-[#fbf9f5] focus:outline-none focus:border-[#ae001a]"
                data-testid="date-from-input"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="block text-[11px] font-bold text-[#8a7a68] uppercase mb-1">
                Created Date To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#e8e2d8] rounded-lg bg-[#fbf9f5] focus:outline-none focus:border-[#ae001a]"
                data-testid="date-to-input"
              />
            </div>
          </div>
        </section>

        {/* Core Workspace Data Grid */}
        <section aria-label="Cash Tip Movement Directory Grid" className="bg-white rounded-2xl border border-[#e8e2d8] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" data-testid="cash-tip-movements-table">
              <thead>
                <tr className="bg-[#fbf9f5] border-b border-[#e8e2d8] text-[11px] font-bold text-[#8a7a68] uppercase tracking-wider">
                  <th className="py-3.5 px-4">Movement Ref</th>
                  <th className="py-3.5 px-4">Associated Cash Drawer</th>
                  <th className="py-3.5 px-4">Linked Tip Reference</th>
                  <th className="py-3.5 px-4">Direction</th>
                  <th className="py-3.5 px-4 text-right">Movement Amount</th>
                  <th className="py-3.5 px-4">Audit Notes</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d8] text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined animate-spin text-2xl text-[#ae001a]">
                          progress_activity
                        </span>
                        <span>Hydrating cash tip movements workspace...</span>
                      </div>
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-3xl text-slate-300">
                          inbox
                        </span>
                        <p className="text-sm font-bold text-[#1c1b1f]">No Cash Tip Movements Found</p>
                        <p className="text-xs text-slate-400">
                          No movement records matched your query parameters or filters.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  movements.map((item) => {
                    const isCashIn = item.movement_type === 'IN';
                    const formattedAmount = isCashIn
                      ? `+$${item.amount.toFixed(2)}`
                      : `-$${item.amount.toFixed(2)}`;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-[#fbf9f5]/80 transition-colors group"
                        data-testid={`movement-row-${item.id}`}
                      >
                        {/* Movement Reference ID */}
                        <td className="py-4 px-4 font-poppins">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-[#1c1b1f] font-mono text-sm">
                              #CTM-{item.id}
                            </span>
                            <span className="text-[11px] text-[#8a7a68] font-mono">
                              {cashTipMovementsApi.formatCashTipMovementDateTime(item.created_at)}
                            </span>
                          </div>
                        </td>

                        {/* Associated Cash Drawer Chip */}
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() => onNavigate?.('cash-drawers')}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors shadow-2xs"
                            title="Click to navigate to Cash Drawer shift details"
                            data-testid={`drawer-chip-${item.cash_drawer_id}`}
                          >
                            <span className="material-symbols-outlined text-sm">point_of_sale</span>
                            <span>#CDR-{item.cash_drawer_id}</span>
                          </button>
                        </td>

                        {/* Linked Tip Reference Chip */}
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() => onNavigate?.('/tips/ledger')}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors shadow-2xs"
                            title="Click to navigate to original Tip entry"
                            data-testid={`tip-chip-${item.tip_id}`}
                          >
                            <span className="material-symbols-outlined text-sm">payments</span>
                            <span>#TIP-{item.tip_id}</span>
                          </button>
                        </td>

                        {/* Movement Direction Badge */}
                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wider ${
                              isCashIn
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                            data-testid={`movement-badge-${item.movement_type}`}
                          >
                            <span className="material-symbols-outlined text-sm font-bold">
                              {isCashIn ? 'arrow_downward' : 'arrow_upward'}
                            </span>
                            <span>{isCashIn ? 'CASH IN' : 'CASH OUT'}</span>
                          </span>
                        </td>

                        {/* Movement Amount */}
                        <td className="py-4 px-4 text-right">
                          <span
                            className={`font-bold font-mono text-sm ${
                              isCashIn ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {formattedAmount}
                          </span>
                        </td>

                        {/* Audit Notes */}
                        <td className="py-4 px-4 max-w-xs truncate text-[#8a7a68]">
                          {item.notes || '—'}
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedMovementForAudit(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#e8e2d8] text-xs font-bold text-[#1c1b1f] hover:bg-[#ae001a] hover:text-white hover:border-[#ae001a] transition-all"
                            data-testid={`audit-btn-${item.id}`}
                          >
                            <span className="material-symbols-outlined text-sm">visibility</span>
                            <span>Audit Details</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Detail Audit Drawer */}
      <CashTipMovementDetailDrawer
        movement={selectedMovementForAudit}
        onClose={() => setSelectedMovementForAudit(null)}
        onNavigate={onNavigate}
      />

      {/* Slide-Over Form Drawer for Registering Cash Tip Movements */}
      <CashTipMovementFormDrawer
        isOpen={isFormDrawerOpen}
        onClose={() => setIsFormDrawerOpen(false)}
        onSuccess={loadCashTipMovementsData}
        companyId={companyId}
        merchantId={resolvedMerchantId}
      />

      {/* Sticky Bottom Navigation Hub Bar */}
      <TipsManagementQuickLinks activeModule="tips-cash-movements" onNavigate={onNavigate} />
    </div>
  );
};

export default CashTipMovementsView;
