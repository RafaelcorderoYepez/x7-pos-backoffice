import React, { useEffect, useState, useMemo } from 'react';
import type {
  TipPoolMember,
  TipPoolMemberRecordStatus,
} from '../../../../types/tip-pool-members';
import {
  fetchTipPoolMembers,
  formatMemberWeight,
  calculateTipPoolMembersSummaryMetrics,
  updateTipPoolMember,
} from '../../../../api/tip-pool-members';
import { fetchTipPools } from '../../../../api/tip-pools';
import type { TipPool } from '../../../../types/tip-pools';
import { getCurrentMerchantId } from '../../../../api/users';
import { TipsManagementQuickLinks } from './TipsManagementQuickLinks';
import { TipPoolMemberFormDrawer } from './TipPoolMemberFormDrawer';

export interface TipPoolMembersViewProps {
  onNavigate?: (view: string) => void;
  companyId?: string;
  merchantId?: string;
  initialTipPoolId?: number;
}

export const TipPoolMembersView: React.FC<TipPoolMembersViewProps> = ({
  onNavigate,
  companyId = 'cmp-01',
  merchantId,
  initialTipPoolId,
}) => {
  const resolvedMerchantId = useMemo(() => {
    if (merchantId) return merchantId;
    const resolved = getCurrentMerchantId();
    return resolved ? String(resolved) : 'mch-01';
  }, [merchantId]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [selectedRecordStatus, setSelectedRecordStatus] =
    useState<TipPoolMemberRecordStatus>('ACTIVE');
  const [selectedTipPoolId, setSelectedTipPoolId] = useState<string>(
    initialTipPoolId ? String(initialTipPoolId) : ''
  );
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState<string>('');

  // Data & Hydration State
  const [members, setMembers] = useState<TipPoolMember[]>([]);
  const [availablePools, setAvailablePools] = useState<TipPool[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [selectedMemberForDrawer, setSelectedMemberForDrawer] =
    useState<TipPoolMember | null>(null);

  useEffect(() => {
    fetchTipPools({ company_id: companyId, merchant_id: resolvedMerchantId })
      .then((pools) => setAvailablePools(pools))
      .catch(() => setAvailablePools([]));
  }, [companyId, resolvedMerchantId]);

  const loadMembersData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Executes query targeting primary composite index @Index(['tip_pool_id', 'collaborator_id'])
      // and secondary filters role, record_status, search
      const data = await fetchTipPoolMembers({
        tip_pool_id: selectedTipPoolId || undefined,
        collaborator_id: selectedCollaboratorId || undefined,
        role: selectedRole,
        record_status: selectedRecordStatus,
        search: searchQuery,
      });

      setMembers(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to hydrate tip pool members directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembersData();
  }, [
    companyId,
    resolvedMerchantId,
    searchQuery,
    selectedRole,
    selectedRecordStatus,
    selectedTipPoolId,
    selectedCollaboratorId,
  ]);

  const metrics = useMemo(() => calculateTipPoolMembersSummaryMetrics(members), [members]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedRole('ALL');
    setSelectedRecordStatus('ACTIVE');
    setSelectedTipPoolId('');
    setSelectedCollaboratorId('');
  };

  const hasActiveFilter =
    searchQuery !== '' ||
    selectedRole !== 'ALL' ||
    selectedRecordStatus !== 'ACTIVE' ||
    selectedTipPoolId !== '' ||
    selectedCollaboratorId !== '';

  const handleCreateMember = () => {
    setSelectedMemberForDrawer(null);
    setIsDrawerOpen(true);
  };

  const handleEditMember = (member: TipPoolMember) => {
    setSelectedMemberForDrawer(member);
    setIsDrawerOpen(true);
  };

  const handleToggleMemberStatus = async (member: TipPoolMember) => {
    const nextStatus: TipPoolMemberRecordStatus =
      member.record_status === 'ACTIVE' ? 'DELETED' : 'ACTIVE';
    try {
      await updateTipPoolMember(member.id, { record_status: nextStatus });
      await loadMembersData();
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle member active status.');
    }
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setSelectedMemberForDrawer(null);
  };

  const handleDrawerSaved = () => {
    loadMembersData();
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

  return (
    <div className="flex flex-col min-h-screen bg-[#f7f5f0] text-[#1c1b1f] font-poppins">
      {/* Header Banner */}
      <header className="border-b border-[#e8e2d8] bg-white px-6 py-6 shadow-sm font-poppins">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-2xl text-[#8a7a68]">person_add</span>
              <h1 className="text-2xl font-bold tracking-tight text-[#1c1b1f] font-poppins">
                Tip Pool Members Workspace
              </h1>
            </div>
            <p className="mt-1 text-sm text-[#706d65] font-poppins">
              Manage collaborator pool assignments, distribution weight points, functional roles, and record active status.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadMembersData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8d2c6] bg-white px-3.5 py-2 text-xs font-bold text-[#1c1b1f] hover:bg-[#f3eee7] hover:text-[#ae001a] transition-colors duration-200 font-poppins"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>REFRESH DATA</span>
            </button>
            <button
              type="button"
              onClick={handleCreateMember}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2c2a29] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#ae001a] transition-colors duration-200 font-poppins"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              <span>ADD MEMBER TO POOL</span>
            </button>
          </div>
        </div>

        {/* Metrics Summary Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#e8e2d8] bg-[#fbf9f5] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
              Active Members
            </div>
            <div className="mt-1 text-xl font-extrabold text-[#1c1b1f]">
              {metrics.activeCount}
            </div>
          </div>
          <div className="rounded-xl border border-[#e8e2d8] bg-[#fbf9f5] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
              Total Weight Points
            </div>
            <div className="mt-1 text-xl font-extrabold text-[#1c1b1f]">
              {formatMemberWeight(metrics.totalWeight, 'pts')}
            </div>
          </div>
          <div className="rounded-xl border border-[#e8e2d8] bg-[#fbf9f5] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
              Assigned Pools
            </div>
            <div className="mt-1 text-xl font-extrabold text-[#1c1b1f]">
              {metrics.uniquePoolsCount}
            </div>
          </div>
          <div className="rounded-xl border border-[#e8e2d8] bg-[#fbf9f5] p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
              Soft Deleted Members
            </div>
            <div className="mt-1 text-xl font-extrabold text-[#706d65]">
              {metrics.deletedCount}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-6 py-6">
        {/* Search & Filter Toolbar */}
        <div className="mb-6 rounded-xl border border-[#e8e2d8] bg-white p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[280px]">
              <span className="material-symbols-outlined absolute inset-y-0 left-3 flex items-center text-lg text-[#8a7a68]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Collaborator Name, Employee ID (#CLB-101), or Pool Name..."
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
              {/* Parent Tip Pool Filter */}
              <div>
                <select
                  aria-label="Filter by Tip Pool"
                  value={selectedTipPoolId}
                  onChange={(e) => setSelectedTipPoolId(e.target.value)}
                  className="rounded-lg border border-[#d8d2c6] bg-white px-3 py-2 text-xs font-semibold text-[#1c1b1f] focus:border-[#8a7a68] focus:outline-none"
                >
                  <option value="">All Parent Tip Pools</option>
                  {availablePools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (#POL-{p.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pool Role Filter */}
              <div>
                <select
                  aria-label="Filter by Assigned Role"
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
        </div>

        {/* Index Execution Notification Banner */}
        <div className="mb-4 flex items-center justify-between rounded-lg bg-[#fbf9f5] border border-[#e8e2d8] px-4 py-2.5 text-xs text-[#706d65]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#8a7a68]">bolt</span>
            <span>
              Member assignments indexed query active via <code className="rounded bg-[#eee9df] px-1.5 py-0.5 text-[11px] font-mono text-[#1c1b1f]">@Index(['tip_pool_id', 'collaborator_id'])</code>.
            </span>
          </div>
          <span className="font-semibold text-[#1c1b1f]">{members.length} records hydrated</span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-200" role="alert">
            <span className="material-symbols-outlined text-lg">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Data Grid Table */}
        <div className="rounded-xl border border-[#e8e2d8] bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center p-6">
              <span className="material-symbols-outlined animate-spin text-3xl text-[#8a7a68]">sync</span>
              <p className="mt-2 text-sm text-[#706d65]">Hydrating Tip Pool Members dataset...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center p-6 text-center">
              <span className="material-symbols-outlined text-4xl text-[#8a7a68]">group_off</span>
              <h3 className="mt-2 text-base font-bold text-[#1c1b1f]">No Tip Pool Members Found</h3>
              <p className="mt-1 text-xs text-[#706d65]">
                {hasActiveFilter
                  ? 'No member records match the active search or filter criteria.'
                  : 'Assign collaborators to tip pools to populate this directory.'}
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
                  onClick={handleCreateMember}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#2c2a29] px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-[#423f3d]"
                >
                  Assign First Member
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#e8e2d8] bg-[#fbf9f5] text-[11px] font-bold uppercase tracking-wider text-[#8a7a68]">
                    <th className="px-6 py-3.5">Member Ref ID</th>
                    <th className="px-6 py-3.5">Collaborator Profile</th>
                    <th className="px-6 py-3.5">Parent Tip Pool</th>
                    <th className="px-6 py-3.5">Assigned Pool Role</th>
                    <th className="px-6 py-3.5">Weight / Points Factor</th>
                    <th className="px-6 py-3.5">Logical Status</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e2d8]">
                  {members.map((m) => {
                    const collabFullName = m.collaborator
                      ? `${m.collaborator.first_name} ${m.collaborator.last_name}`
                      : `Collaborator #${m.collaborator_id}`;
                    const poolName = m.tip_pool?.name || `Tip Pool #${m.tip_pool_id}`;

                    return (
                      <tr
                        key={m.id}
                        className="hover:bg-[#fcfaf7] transition-colors group"
                      >
                        {/* Member Reference ID */}
                        <td className="px-6 py-4 font-bold text-[#1c1b1f] whitespace-nowrap">
                          #MBR-{m.id}
                        </td>

                        {/* Collaborator Profile */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-[#1c1b1f]">
                              {collabFullName}
                            </span>
                            <span className="mt-0.5 inline-flex items-center w-max gap-1 rounded bg-[#eee9df] px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#706d65]">
                              #CLB-{m.collaborator_id}
                            </span>
                          </div>
                        </td>

                        {/* Parent Tip Pool */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3eee7] px-3 py-1 text-xs font-bold text-[#1c1b1f] border border-[#e8e2d8] w-max">
                              <span className="material-symbols-outlined text-xs text-[#8a7a68]">
                                groups
                              </span>
                              {poolName}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTipPoolId(String(m.tip_pool_id));
                              }}
                              className="mt-1 text-[11px] font-mono text-[#8a7a68] hover:underline text-left"
                            >
                              #POL-{m.tip_pool_id}
                            </button>
                          </div>
                        </td>

                        {/* Assigned Pool Role */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold border ${getRoleBadgeStyle(
                              m.role
                            )}`}
                          >
                            {m.role.toUpperCase()}
                          </span>
                        </td>

                        {/* Weight / Points Factor (Formatted to 2 decimal places) */}
                        <td className="px-6 py-4 font-bold text-[#1c1b1f] whitespace-nowrap">
                          {formatMemberWeight(m.weight, 'pts')}
                        </td>

                        {/* Logical Record Status */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          {m.record_status === 'ACTIVE' ? (
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

                        {/* Row Actions */}
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditMember(m)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#d8d2c6] bg-white px-2.5 py-1 text-xs font-bold text-[#1c1b1f] hover:bg-[#f3eee7] transition-colors"
                              title="Edit Member Assignment"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleMemberStatus(m)}
                              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
                                m.record_status === 'ACTIVE'
                                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={m.record_status === 'ACTIVE' ? 'Soft Delete Member' : 'Reactivate Member'}
                            >
                              <span className="material-symbols-outlined text-sm">
                                {m.record_status === 'ACTIVE' ? 'delete' : 'restore_from_trash'}
                              </span>
                              <span>{m.record_status === 'ACTIVE' ? 'Delete' : 'Restore'}</span>
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

        {/* Table End */}
      </main>

      {/* Form Drawer */}
      <TipPoolMemberFormDrawer
        isOpen={isDrawerOpen}
        member={selectedMemberForDrawer}
        onClose={handleDrawerClose}
        onSaved={handleDrawerSaved}
        companyId={companyId}
        merchantId={resolvedMerchantId}
        defaultTipPoolId={selectedTipPoolId ? Number(selectedTipPoolId) : undefined}
        existingMembers={members}
      />

      {/* Persistent Bottom Navigation Hub Bar */}
      <TipsManagementQuickLinks
        activeModule="tips-pool-members"
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default TipPoolMembersView;
