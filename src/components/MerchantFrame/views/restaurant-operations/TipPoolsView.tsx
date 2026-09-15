import React, { useEffect, useState, useMemo } from 'react';
import type {
  TipPool,
  TipPoolDistributionType,
  TipPoolStatus,
  TipPoolRecordStatus,
} from '../../../../types/tip-pools';
import {
  fetchTipPools,
  formatTipPoolCurrency,
  formatTipPoolDateTime,
  calculateTipPoolsSummaryMetrics,
} from '../../../../api/tip-pools';
import { getCurrentMerchantId } from '../../../../api/users';
import { TipsManagementQuickLinks } from './TipsManagementQuickLinks';
import { TipPoolFormDrawer } from './TipPoolFormDrawer';

export interface TipPoolsViewProps {
  onNavigate?: (view: string) => void;
  companyId?: string;
  merchantId?: string;
}

export const TipPoolsView: React.FC<TipPoolsViewProps> = ({
  onNavigate,
  companyId = 'cmp-01',
  merchantId,
}) => {
  const resolvedMerchantId = useMemo(() => {
    if (merchantId) return merchantId;
    const resolved = getCurrentMerchantId();
    return resolved ? String(resolved) : 'mch-01';
  }, [merchantId]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDistributionType, setSelectedDistributionType] = useState<TipPoolDistributionType | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<TipPoolStatus | 'ALL'>('OPEN');
  const [selectedRecordStatus, setSelectedRecordStatus] = useState<TipPoolRecordStatus>('ACTIVE');
  const [shiftIdFilter, setShiftIdFilter] = useState<string>('');

  // Data & Hydration State
  const [pools, setPools] = useState<TipPool[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [selectedPoolForDrawer, setSelectedPoolForDrawer] = useState<TipPool | null>(null);

  const handleCreatePool = () => {
    setSelectedPoolForDrawer(null);
    setIsDrawerOpen(true);
  };

  const handleEditPool = (pool: TipPool) => {
    setSelectedPoolForDrawer(pool);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setSelectedPoolForDrawer(null);
  };

  const handleDrawerSaved = () => {
    loadTipPoolsData();
  };

  const loadTipPoolsData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Executes query targeting primary @Index(['company_id', 'merchant_id', 'shift_id', 'created_at'])
      // and secondary @Index(['status', 'record_status'])
      const data = await fetchTipPools({
        company_id: companyId,
        merchant_id: resolvedMerchantId,
        shift_id: shiftIdFilter || undefined,
        status: selectedStatus,
        distribution_type: selectedDistributionType,
        record_status: selectedRecordStatus,
        search: searchQuery,
      });

      setPools(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to hydrate tip pools directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTipPoolsData();
  }, [
    companyId,
    resolvedMerchantId,
    searchQuery,
    selectedDistributionType,
    selectedStatus,
    selectedRecordStatus,
    shiftIdFilter,
  ]);

  const metrics = useMemo(() => calculateTipPoolsSummaryMetrics(pools), [pools]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDistributionType('ALL');
    setSelectedStatus('OPEN');
    setSelectedRecordStatus('ACTIVE');
    setShiftIdFilter('');
  };

  const hasActiveFilter =
    searchQuery !== '' ||
    selectedDistributionType !== 'ALL' ||
    selectedStatus !== 'OPEN' ||
    selectedRecordStatus !== 'ACTIVE' ||
    shiftIdFilter !== '';

  const getDistributionBadge = (type: TipPoolDistributionType) => {
    switch (type) {
      case 'EQUAL':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-700 border border-blue-500/20">
            ⚖️ EQUAL
          </span>
        );
      case 'PERCENTAGE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-500/10 text-purple-700 border border-purple-500/20">
            % PERCENTAGE
          </span>
        );
      case 'POINTS':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-700 border border-amber-500/20">
            ⭐ POINTS
          </span>
        );
      case 'ROLE_BASED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-500/10 text-indigo-700 border border-indigo-500/20">
            👔 ROLE_BASED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/10 text-gray-700 border border-gray-500/20">
            {type}
          </span>
        );
    }
  };

  const getLifecycleStatusBadge = (status: TipPoolStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/10 text-blue-700 border border-blue-500/20"
            title="Actively accumulating tips for current work shift"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            OPEN
          </span>
        );
      case 'CLOSED':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-700 border border-amber-500/20"
            title="Closed for incoming tips, awaiting settlement execution"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            CLOSED
          </span>
        );
      case 'SETTLED':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-500/10 text-green-700 border border-green-500/20"
            title="Funds fully distributed to participants"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            SETTLED
          </span>
        );
    }
  };

  const getRecordStatusBadge = (recordStatus: TipPoolRecordStatus) => {
    if (recordStatus === 'ACTIVE') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
          ACTIVE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-700 border border-rose-500/20">
        DELETED
      </span>
    );
  };

  return (
    <div className="w-full space-y-6 p-4 sm:p-6 bg-slate-50 min-h-screen">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🥣</span>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Tip Pools Management Directory
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track active and historical tip pools, inspect accumulated balances, verify associated work shifts, and monitor lifecycle settlement states.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCreatePool}
            data-testid="create-tip-pool-button"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#ae001a] hover:bg-[#930015] rounded transition-colors shadow-sm uppercase tracking-wider"
          >
            <span className="material-icons text-sm">add</span>
            CREATE TIP POOL
          </button>
          <button
            onClick={loadTipPoolsData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Refresh tip pools directory data"
          >
            <span className={`material-icons text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Accumulated Balance</span>
            <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600 text-sm">💰</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900">
              {formatTipPoolCurrency(metrics.totalAmount)}
            </span>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Across {metrics.totalCount} active pool(s)
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Pools</span>
            <span className="p-2 rounded-lg bg-blue-50 text-blue-600 text-sm">🔵</span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-700">{metrics.openCount}</span>
              <span className="text-sm font-bold text-slate-700">
                ({formatTipPoolCurrency(metrics.openAmount)})
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Actively accumulating tips
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closed Pools</span>
            <span className="p-2 rounded-lg bg-amber-50 text-amber-600 text-sm">⏳</span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-700">{metrics.closedCount}</span>
              <span className="text-sm font-bold text-slate-700">
                ({formatTipPoolCurrency(metrics.closedAmount)})
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Awaiting settlement execution
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Settled Pools</span>
            <span className="p-2 rounded-lg bg-green-50 text-green-600 text-sm">✅</span>
          </div>
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-green-700">{metrics.settledCount}</span>
              <span className="text-sm font-bold text-slate-700">
                ({formatTipPoolCurrency(metrics.settledAmount)})
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Fully distributed
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Matrix Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Alphanumeric Search Input */}
          <div className="relative flex-1 min-w-[260px]">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Pool Name (name), Pool ID (#POL-301), or Shift ID (#SFT-801)..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white placeholder-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Distribution Strategy Selector */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Distribution:</label>
              <select
                aria-label="Distribution Type Filter"
                value={selectedDistributionType}
                onChange={(e) => setSelectedDistributionType(e.target.value as TipPoolDistributionType | 'ALL')}
                className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Strategies</option>
                <option value="EQUAL">EQUAL</option>
                <option value="PERCENTAGE">PERCENTAGE</option>
                <option value="POINTS">POINTS</option>
                <option value="ROLE_BASED">ROLE_BASED</option>
              </select>
            </div>

            {/* Lifecycle Status Filter */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Pool Status:</label>
              <select
                aria-label="Pool Status Filter"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as TipPoolStatus | 'ALL')}
                className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="OPEN">OPEN (Default Active Pools)</option>
                <option value="CLOSED">CLOSED</option>
                <option value="SETTLED">SETTLED</option>
                <option value="ALL">All Statuses</option>
              </select>
            </div>

            {/* Record Status Toggle */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Record Status:</label>
              <select
                aria-label="Record Status Filter"
                value={selectedRecordStatus}
                onChange={(e) => setSelectedRecordStatus(e.target.value as TipPoolRecordStatus)}
                className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="DELETED">DELETED</option>
              </select>
            </div>

            {/* Shift ID filter input */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Shift ID:</label>
              <input
                type="text"
                value={shiftIdFilter}
                onChange={(e) => setShiftIdFilter(e.target.value)}
                placeholder="#SFT-801"
                className="w-24 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* Reset Filters */}
            {hasActiveFilter && (
              <button
                onClick={handleResetFilters}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={loadTipPoolsData}
            className="underline text-rose-900 font-bold hover:text-rose-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Core Workspace Data Grid Layout */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">Pool Ref & Name</th>
                <th className="py-3 px-4">Associated Work Shift</th>
                <th className="py-3 px-4">Distribution Strategy</th>
                <th className="py-3 px-4 text-right">Accumulated Total</th>
                <th className="py-3 px-4">Lifecycle Status</th>
                <th className="py-3 px-4">Closed Timestamp</th>
                <th className="py-3 px-4">Record Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span>Hydrating tip pools directory...</span>
                    </div>
                  </td>
                </tr>
              ) : pools.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-2xl">🔎</span>
                      <span className="font-semibold text-slate-700">No tip pools match current criteria.</span>
                      <span className="text-xs text-slate-400">Try adjusting your search terms or lifecycle status filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pools.map((pool) => (
                  <tr key={pool.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Pool Ref & Name */}
                    <td className="py-3.5 px-4 font-medium">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-slate-900">
                          #POL-{pool.id}
                        </span>
                        <span className="text-slate-700 font-semibold mt-0.5">
                          {pool.name}
                        </span>
                      </div>
                    </td>

                    {/* Associated Work Shift */}
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md border border-slate-200">
                        <span className="font-extrabold text-slate-900">
                          #SFT-{pool.shift_id}
                        </span>
                        {pool.shift_time_window && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({pool.shift_time_window})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Distribution Strategy Pill */}
                    <td className="py-3.5 px-4">
                      {getDistributionBadge(pool.distribution_type)}
                    </td>

                    {/* Accumulated Pool Total */}
                    <td className="py-3.5 px-4 text-right">
                      <span className="font-black text-slate-900 text-sm tracking-tight">
                        {formatTipPoolCurrency(pool.total_amount)}
                      </span>
                    </td>

                    {/* Pool Lifecycle Status */}
                    <td className="py-3.5 px-4">
                      {getLifecycleStatusBadge(pool.status)}
                    </td>

                    {/* Closed Timestamp */}
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {formatTipPoolDateTime(pool.closed_at)}
                    </td>

                    {/* Record Status */}
                    <td className="py-3.5 px-4">
                      {getRecordStatusBadge(pool.record_status)}
                    </td>

                    {/* Actions Column */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleEditPool(pool)}
                        data-testid={`edit-tip-pool-button-${pool.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        <span className="material-icons text-xs">edit</span>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Drawer Panel */}
      <TipPoolFormDrawer
        isOpen={isDrawerOpen}
        pool={selectedPoolForDrawer}
        onClose={handleDrawerClose}
        onSaved={handleDrawerSaved}
        companyId={companyId}
        merchantId={resolvedMerchantId}
      />

      {/* Contextual Quick Links Navigation */}
      <TipsManagementQuickLinks activeModule="tips-pools" onNavigate={onNavigate} />
    </div>
  );
};

export default TipPoolsView;
