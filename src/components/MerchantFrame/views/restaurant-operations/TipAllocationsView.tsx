import React, { useEffect, useState, useMemo } from 'react';
import type {
  TipAllocation,
  TipAllocationRecordStatus,
} from '../../../../types/tip-allocations';
import {
  fetchTipAllocations,
  formatAllocationPercentage,
  formatAllocationCurrency,
  calculateTipAllocationsSummaryMetrics,
  updateTipAllocationStatus,
} from '../../../../api/tip-allocations';
import { getCurrentMerchantId } from '../../../../api/users';
import { TipsManagementQuickLinks } from './TipsManagementQuickLinks';
import { TipAllocationFormDrawer } from './TipAllocationFormDrawer';

export interface TipAllocationsViewProps {
  onNavigate?: (view: string) => void;
  companyId?: string;
  merchantId?: string;
  initialTipId?: number;
}

export const TipAllocationsView: React.FC<TipAllocationsViewProps> = ({
  onNavigate,
  companyId = 'cmp-01',
  merchantId,
  initialTipId,
}) => {
  const resolvedMerchantId = useMemo(() => {
    if (merchantId) return merchantId;
    const resolved = getCurrentMerchantId();
    return resolved ? String(resolved) : 'mch-01';
  }, [merchantId]);

  // Search & Multi-Filter Matrix State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [selectedRecordStatus, setSelectedRecordStatus] =
    useState<TipAllocationRecordStatus>('ACTIVE');
  const [selectedTipId, setSelectedTipId] = useState<string>(
    initialTipId ? String(initialTipId) : ''
  );
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<string>('');
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Data & Hydration State
  const [allocations, setAllocations] = useState<TipAllocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [selectedAllocationForDrawer, setSelectedAllocationForDrawer] =
    useState<TipAllocation | null>(null);

  const loadAllocationsData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Executes query targeting primary composite index @Index(['tip_id', 'collaborator_id', 'shift_id'])
      // and secondary composite index @Index(['role', 'record_status', 'created_at'])
      const data = await fetchTipAllocations({
        tip_id: selectedTipId || undefined,
        collaborator_id: selectedCollaboratorId || undefined,
        shift_id: selectedShiftId || undefined,
        role: selectedRole,
        record_status: selectedRecordStatus,
        search: searchQuery,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      setAllocations(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to hydrate tip allocations directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllocationsData();
  }, [
    companyId,
    resolvedMerchantId,
    searchQuery,
    selectedRole,
    selectedRecordStatus,
    selectedTipId,
    selectedCollaboratorId,
    selectedShiftId,
    dateFrom,
    dateTo,
  ]);

  const metrics = useMemo(
    () => calculateTipAllocationsSummaryMetrics(allocations),
    [allocations]
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedRole('ALL');
    setSelectedRecordStatus('ACTIVE');
    setSelectedTipId('');
    setSelectedCollaboratorId('');
    setSelectedShiftId('');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilter =
    searchQuery !== '' ||
    selectedRole !== 'ALL' ||
    selectedRecordStatus !== 'ACTIVE' ||
    selectedTipId !== '' ||
    selectedCollaboratorId !== '' ||
    selectedShiftId !== '' ||
    dateFrom !== '' ||
    dateTo !== '';

  const handleCreateAllocation = () => {
    setSelectedAllocationForDrawer(null);
    setIsDrawerOpen(true);
  };

  const handleEditAllocation = (allocation: TipAllocation) => {
    setSelectedAllocationForDrawer(allocation);
    setIsDrawerOpen(true);
  };

  const handleToggleStatus = async (allocation: TipAllocation) => {
    const nextStatus: TipAllocationRecordStatus =
      allocation.record_status === 'ACTIVE' ? 'DELETED' : 'ACTIVE';
    try {
      await updateTipAllocationStatus(allocation.id, { record_status: nextStatus });
      await loadAllocationsData();
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle allocation active status.');
    }
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setSelectedAllocationForDrawer(null);
  };

  const handleDrawerSaved = () => {
    loadAllocationsData();
  };

  const getRoleBadgeStyle = (roleStr: string) => {
    const uppercaseRole = roleStr.toUpperCase();
    switch (uppercaseRole) {
      case 'WAITER':
      case 'SERVER':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'BARTENDER':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'BUSSER':
      case 'RUNNER':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'HOST':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'KITCHEN':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-stone-50 text-stone-800 border-stone-200';
    }
  };

  const formatDateString = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f7f5f0] text-[#1c1b1f] font-poppins">
      {/* Header Banner */}
      <header className="border-b border-[#e8e2d8] bg-white px-6 py-6 shadow-sm font-poppins">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-[#8a7a68]">pie_chart</span>
              <h1 className="text-2xl font-bold tracking-tight text-[#1c1b1f] font-poppins">
                Tip Allocations Directory
              </h1>
            </div>
            <p className="mt-1 text-sm text-[#706d65] font-poppins">
              Audit individual collaborator tip breakdowns, percentage shares, monetary amounts, and shift distribution trails.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadAllocationsData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8d2c6] bg-white px-3.5 py-2 text-xs font-bold text-[#1c1b1f] hover:bg-[#f3eee7] hover:text-[#ae001a] transition-colors duration-200 font-poppins"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>REFRESH DATA</span>
            </button>
            <button
              type="button"
              onClick={handleCreateAllocation}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2c2a29] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#ae001a] transition-colors duration-200 font-poppins"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span>NEW ALLOCATION</span>
            </button>
          </div>
        </div>

        {/* Metrics Summary Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#e8e2d8] bg-[#fbf9f5] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
              Total Allocated
            </div>
            <div className="mt-1 text-xl font-extrabold text-[#1c1b1f]">
              {formatAllocationCurrency(metrics.totalAllocatedAmount)}
            </div>
          </div>
          <div className="rounded-xl border border-[#e8e2d8] bg-[#fbf9f5] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
              Active Allocations
            </div>
            <div className="mt-1 text-xl font-extrabold text-[#1c1b1f]">
              {metrics.activeCount}
            </div>
          </div>
          <div className="rounded-xl border border-[#e8e2d8] bg-[#fbf9f5] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
              Average Share %
            </div>
            <div className="mt-1 text-xl font-extrabold text-[#1c1b1f]">
              {formatAllocationPercentage(metrics.avgPercentage)}
            </div>
          </div>
          <div className="rounded-xl border border-[#e8e2d8] bg-[#fbf9f5] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
              Shifts / Collaborators
            </div>
            <div className="mt-1 text-xl font-extrabold text-[#706d65]">
              {metrics.uniqueShiftsCount} Shifts / {metrics.uniqueCollaboratorsCount} Collabs
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-6 py-6">
        {/* Search & Multi-Filter Matrix Toolbar */}
        <div className="mb-6 rounded-xl border border-[#e8e2d8] bg-white p-4 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[280px]">
              <span className="material-symbols-outlined absolute inset-y-0 left-3 flex items-center text-lg text-[#8a7a68]">
                search
              </span>
              <input
                type="text"
                data-testid="allocation-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Allocation ID (#ALC-701), Tip ID (#TIP-201), Shift ID (#SFT-801), or Collaborator Name..."
                className="w-full rounded-lg border border-[#d8d2c6] bg-white pl-9 pr-4 py-2 text-sm text-[#1c1b1f] placeholder-[#8a7a68] focus:border-[#8a7a68] focus:outline-none focus:ring-1 focus:ring-[#8a7a68]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-3 flex items-center text-[#8a7a68] hover:text-[#1c1b1f]"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              )}
            </div>

            {/* Filters Matrix */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Allocation Role Filter */}
              <div>
                <select
                  aria-label="Filter by Allocation Role"
                  data-testid="filter-role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-xs font-semibold text-[#1c1b1f] focus:border-[#8a7a68] focus:outline-none"
                >
                  <option value="ALL">All Roles</option>
                  <option value="WAITER">WAITER</option>
                  <option value="BARTENDER">BARTENDER</option>
                  <option value="BUSSER">BUSSER</option>
                  <option value="RUNNER">RUNNER</option>
                  <option value="SERVER">SERVER</option>
                  <option value="HOST">HOST</option>
                  <option value="KITCHEN">KITCHEN</option>
                </select>
              </div>

              {/* Record Status Toggle */}
              <div className="inline-flex rounded-lg border border-[#d8d2c6] bg-[#fbf9f5] p-0.5">
                <button
                  type="button"
                  data-testid="status-active-btn"
                  onClick={() => setSelectedRecordStatus('ACTIVE')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedRecordStatus === 'ACTIVE'
                      ? 'bg-white text-[#1c1b1f] shadow-sm'
                      : 'text-[#706d65] hover:text-[#1c1b1f]'
                  }`}
                >
                  ACTIVE
                </button>
                <button
                  type="button"
                  data-testid="status-deleted-btn"
                  onClick={() => setSelectedRecordStatus('DELETED')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedRecordStatus === 'DELETED'
                      ? 'bg-white text-[#1c1b1f] shadow-sm'
                      : 'text-[#706d65] hover:text-[#1c1b1f]'
                  }`}
                >
                  DELETED
                </button>
              </div>

              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#8a7a68] hover:bg-[#f3eee7] transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">restart_alt</span>
                  <span>RESET</span>
                </button>
              )}
            </div>
          </div>

          {/* Date Range Picker Row */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-[#e8e2d8] text-xs text-[#706d65]">
            <span className="font-bold uppercase tracking-wider flex items-center gap-1 text-[#8a7a68]">
              <span className="material-symbols-outlined text-sm">calendar_today</span>
              Audit Date Range:
            </span>
            <div className="flex items-center gap-2">
              <span>From:</span>
              <input
                type="date"
                data-testid="date-from-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-[#d8d2c6] bg-white px-2.5 py-1 text-xs text-[#1c1b1f] outline-none focus:border-[#8a7a68]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span>To:</span>
              <input
                type="date"
                data-testid="date-to-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-[#d8d2c6] bg-white px-2.5 py-1 text-xs text-[#1c1b1f] outline-none focus:border-[#8a7a68]"
              />
            </div>
          </div>
        </div>

        {/* Index Execution Notification Banner */}
        <div className="mb-4 flex items-center justify-between rounded-lg bg-[#fbf9f5] border border-[#e8e2d8] px-4 py-2.5 text-xs text-[#706d65]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#8a7a68]">bolt</span>
            <span>
              Composite index queries active via{' '}
              <code className="rounded bg-[#eee9df] px-1.5 py-0.5 text-[11px] font-mono text-[#1c1b1f]">
                @Index(['tip_id', 'collaborator_id', 'shift_id'])
              </code>{' '}
              and{' '}
              <code className="rounded bg-[#eee9df] px-1.5 py-0.5 text-[11px] font-mono text-[#1c1b1f]">
                @Index(['role', 'record_status', 'created_at'])
              </code>
              .
            </span>
          </div>
          <span className="font-semibold text-[#1c1b1f]">
            {allocations.length} allocations hydrated
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            className="mb-6 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-200"
            role="alert"
          >
            <span className="material-symbols-outlined text-lg">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Core Workspace Data Grid */}
        <div className="rounded-xl border border-[#e8e2d8] bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center p-6">
              <span className="material-symbols-outlined animate-spin text-3xl text-[#8a7a68]">
                sync
              </span>
              <p className="mt-2 text-sm text-[#706d65]">Hydrating Tip Allocations dataset...</p>
            </div>
          ) : allocations.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
              <span className="material-symbols-outlined text-4xl text-[#8a7a68]">
                pie_chart_outline
              </span>
              <h3 className="mt-2 text-base font-bold text-[#1c1b1f]">
                No Tip Allocations Found
              </h3>
              <p className="mt-1 text-xs text-[#706d65]">
                {hasActiveFilter
                  ? 'No allocation records match the active search or filter criteria.'
                  : 'No tip allocations have been registered yet.'}
              </p>
              {hasActiveFilter ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#d8d2c6] bg-white px-3 py-1.5 text-xs font-bold text-[#1c1b1f] hover:bg-[#f3eee7]"
                >
                  Clear Active Filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateAllocation}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#2c2a29] px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-[#423f3d]"
                >
                  Create First Allocation
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e8e2d8] bg-[#fbf9f5] text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
                    <th className="px-6 py-3.5">Allocation Ref ID</th>
                    <th className="px-6 py-3.5">Source Tip Ref</th>
                    <th className="px-6 py-3.5">Collaborator Profile</th>
                    <th className="px-6 py-3.5">Work Shift</th>
                    <th className="px-6 py-3.5">Allocation Role</th>
                    <th className="px-6 py-3.5 text-right">Percentage Share</th>
                    <th className="px-6 py-3.5 text-right">Allocated Amount</th>
                    <th className="px-6 py-3.5 text-center">Logical Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8]">
                  {allocations.map((alc) => {
                    const isDeleted = alc.record_status === 'DELETED';
                    const collabFullName = alc.collaborator
                      ? `${alc.collaborator.first_name} ${alc.collaborator.last_name}`
                      : `Collaborator #${alc.collaborator_id}`;

                    return (
                      <tr
                        key={alc.id}
                        data-testid={`allocation-row-${alc.id}`}
                        className="hover:bg-[#fcfaf7] transition-colors group"
                      >
                        {/* Allocation Reference ID (#ALC-{id}) with formatted created_at */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span
                              className={`font-bold text-[#1c1b1f] ${
                                isDeleted ? 'line-through text-[#706d65]' : ''
                              }`}
                            >
                              #ALC-{alc.id}
                            </span>
                            <span className="text-[11px] text-[#706d65] mt-0.5">
                              {formatDateString(alc.created_at)}
                            </span>
                          </div>
                        </td>

                        {/* Source Tip Reference (#TIP-{tip_id}) chip with click-through navigation */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onNavigate?.('/tips/ledger')}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#f3eee7] px-3 py-1 text-xs font-bold text-[#1c1b1f] border border-[#e8e2d8] hover:bg-[#ae001a] hover:text-white transition-colors"
                            title="Navigate to Tip Entry in Ledger"
                          >
                            <span className="material-symbols-outlined text-xs">payments</span>
                            #TIP-{alc.tip_id}
                          </button>
                        </td>

                        {/* Collaborator Profile with #CLB-{collaborator_id} badge */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span
                              className={`font-semibold text-[#1c1b1f] ${
                                isDeleted ? 'line-through text-[#706d65]' : ''
                              }`}
                            >
                              {collabFullName}
                            </span>
                            <span className="mt-0.5 inline-flex items-center w-max gap-1 rounded bg-[#eee9df] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#706d65]">
                              #CLB-{alc.collaborator_id}
                            </span>
                          </div>
                        </td>

                        {/* Work Shift (#SFT-{shift_id}) badge */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded bg-[#e8e2d8]/60 px-2 py-0.5 text-xs font-mono font-bold text-[#1c1b1f]">
                            <span className="material-symbols-outlined text-xs text-[#8a7a68]">
                              schedule
                            </span>
                            #SFT-{alc.shift_id}
                          </span>
                        </td>

                        {/* Allocation Role Badge (WAITER, BARTENDER, RUNNER, etc.) */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${getRoleBadgeStyle(
                              alc.role
                            )}`}
                          >
                            {alc.role.toUpperCase()}
                          </span>
                        </td>

                        {/* Percentage Share (formatted 50.00%) */}
                        <td className="px-6 py-4 text-right font-bold text-[#1c1b1f] whitespace-nowrap">
                          <span className={isDeleted ? 'line-through text-[#706d65]' : ''}>
                            {formatAllocationPercentage(alc.percentage)}
                          </span>
                        </td>

                        {/* Allocated Amount (formatted $2.75) */}
                        <td className="px-6 py-4 text-right font-extrabold whitespace-nowrap">
                          <span
                            className={
                              isDeleted ? 'line-through text-[#706d65]' : 'text-emerald-700'
                            }
                          >
                            {formatAllocationCurrency(alc.amount)}
                          </span>
                        </td>

                        {/* Logical Status Badge (ACTIVE: Success Green tag vs DELETED: Strikethrough text with Muted Gray tag) */}
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          {alc.record_status === 'ACTIVE' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
                              ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 border border-gray-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                              DELETED
                            </span>
                          )}
                        </td>

                        {/* Actions Column */}
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditAllocation(alc)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#d8d2c6] bg-white px-2.5 py-1 text-xs font-bold text-[#1c1b1f] hover:bg-[#f3eee7] transition-colors"
                              title="Edit Allocation"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(alc)}
                              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
                                alc.record_status === 'ACTIVE'
                                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={
                                alc.record_status === 'ACTIVE'
                                  ? 'Soft Delete Allocation'
                                  : 'Reactivate Allocation'
                              }
                            >
                              <span className="material-symbols-outlined text-sm">
                                {alc.record_status === 'ACTIVE' ? 'delete' : 'restore_from_trash'}
                              </span>
                              <span>{alc.record_status === 'ACTIVE' ? 'Delete' : 'Restore'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Form Drawer */}
      <TipAllocationFormDrawer
        isOpen={isDrawerOpen}
        allocation={selectedAllocationForDrawer}
        onClose={handleDrawerClose}
        onSaved={handleDrawerSaved}
        companyId={companyId}
        merchantId={resolvedMerchantId}
        defaultTipId={selectedTipId ? Number(selectedTipId) : undefined}
        existingAllocations={allocations}
      />

      {/* Persistent Bottom Navigation Hub Bar */}
      <TipsManagementQuickLinks
        activeModule="tips-allocations"
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default TipAllocationsView;
