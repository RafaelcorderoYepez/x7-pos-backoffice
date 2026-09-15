import React, { useState, useEffect, useMemo } from 'react';
import type {
  OpenShift,
  CollaboratorRole,
  OpenShiftAllocationMode,
  ShiftAssignment,
  Collaborator,
} from '../../../../types/shifts';
import {
  fetchOpenShifts,
  claimOpenShift,
  approveOpenShiftPickup,
  rejectOpenShiftPickup,
  cancelOpenShift,
  fetchShiftAssignments,
  INITIAL_COLLABORATORS,
  findOverlappingShift,
} from '../../../../api/shifts';
import { StaffManagementQuickLinks } from './StaffManagementQuickLinks';
import { PublishOpenShiftModal } from './PublishOpenShiftModal';

interface OpenShiftsMarketplaceViewProps {
  onNavigate?: (routeOrView: string) => void;
}

export const OpenShiftsMarketplaceView: React.FC<OpenShiftsMarketplaceViewProps> = ({
  onNavigate,
}) => {
  const [openShifts, setOpenShifts] = useState<OpenShift[]>([]);
  const [assignedShifts, setAssignedShifts] = useState<ShiftAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active persona for live testing & interaction (Supervisor vs Collaborator)
  const [activeCollaborator, setActiveCollaborator] = useState<Collaborator>(
    INITIAL_COLLABORATORS[0] // Default Carlos Mendoza (Supervisor)
  );

  // Filters
  const [selectedRole, setSelectedRole] = useState<CollaboratorRole | 'ALL'>('ALL');
  const [selectedMode, setSelectedMode] = useState<OpenShiftAllocationMode | 'ALL'>('ALL');
  const [selectedZone, setSelectedZone] = useState<string>('ALL');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals & Drawers
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [confirmClaimShift, setConfirmClaimShift] = useState<OpenShift | null>(null);
  const [cancelConfirmShift, setCancelConfirmShift] = useState<OpenShift | null>(null);
  const [reviewRequestsShift, setReviewRequestsShift] = useState<OpenShift | null>(null);
  const [rejectionReasonModal, setRejectionReasonModal] = useState<{
    shiftId: string;
    requestId: string;
    collaboratorName: string;
  } | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState('');

  // UI Toast notifications
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
  } | null>(null);

  const [isActionLoading, setIsActionLoading] = useState(false);

  // Load shifts on mount & when filters change
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [shiftsData, assignmentsData] = await Promise.all([
        fetchOpenShifts({
          role: selectedRole,
          allocationMode: selectedMode,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          search: searchQuery || undefined,
          zone: selectedZone !== 'ALL' ? selectedZone : undefined,
        }),
        fetchShiftAssignments(startDate || undefined, endDate || undefined),
      ]);
      setOpenShifts(shiftsData);
      setAssignedShifts(assignmentsData);
    } catch (err: any) {
      showToast('error', 'Data Hydration Error', err.message || 'Failed to load open shifts marketplace.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRole, selectedMode, selectedZone, startDate, endDate]);

  const showToast = (type: 'success' | 'error' | 'warning', title: string, message: string) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 6000);
  };

  // Calculate active collaborator scheduled weekly hours
  const activeWorkerWeeklyHours = useMemo(() => {
    return assignedShifts
      .filter((s) => s.collaboratorId === activeCollaborator.id)
      .reduce((sum, s) => sum + (s.hours || 0), 0);
  }, [assignedShifts, activeCollaborator]);

  // Unique zones extracted from available shifts
  const availableZones = useMemo(() => {
    const zones = new Set<string>();
    openShifts.forEach((s) => {
      if (s.zone) zones.add(s.zone);
    });
    return Array.from(zones);
  }, [openShifts]);

  // Filtered Open Shifts
  const filteredOpenShifts = useMemo(() => {
    return openShifts.filter((shift) => {
      // Role filter
      if (selectedRole !== 'ALL' && shift.role !== selectedRole) return false;
      // Mode filter
      if (selectedMode !== 'ALL' && shift.allocationMode !== selectedMode) return false;
      // Zone filter
      if (selectedZone !== 'ALL' && shift.zone !== selectedZone) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().replace('#', '').trim();
        const matchRef = shift.referenceId.toLowerCase().includes(q);
        const matchRole = shift.role.toLowerCase().includes(q);
        const matchDept = shift.department.toLowerCase().includes(q);
        const matchZone = shift.zone.toLowerCase().includes(q);
        const matchNotes = (shift.notes || '').toLowerCase().includes(q);
        if (!matchRef && !matchRole && !matchDept && !matchZone && !matchNotes) return false;
      }

      // Eligible Only filter
      if (eligibleOnly && activeCollaborator.role !== 'Supervisor') {
        // Role match
        if (activeCollaborator.role !== shift.role) return false;
        // Collision check
        const overlap = findOverlappingShift(
          assignedShifts,
          activeCollaborator.id,
          shift.date,
          shift.startTime,
          shift.endTime
        );
        if (overlap) return false;
      }

      return true;
    });
  }, [openShifts, selectedRole, selectedMode, selectedZone, searchQuery, eligibleOnly, activeCollaborator, assignedShifts]);

  // Marketplace KPIs
  const totalOpenShiftsCount = useMemo(() => {
    return openShifts.filter((s) => s.status === 'OPEN_FOR_PICKUP' || s.status === 'PENDING_SUPERVISOR_APPROVAL').length;
  }, [openShifts]);

  const totalOpenHoursSum = useMemo(() => {
    return openShifts
      .filter((s) => s.status === 'OPEN_FOR_PICKUP' || s.status === 'PENDING_SUPERVISOR_APPROVAL')
      .reduce((sum, s) => sum + (s.hours || 0), 0);
  }, [openShifts]);

  const fcfsCount = useMemo(() => {
    return openShifts.filter(
      (s) =>
        s.allocationMode === 'FIRST_COME_FIRST_SERVED' &&
        (s.status === 'OPEN_FOR_PICKUP' || s.status === 'PENDING_SUPERVISOR_APPROVAL')
    ).length;
  }, [openShifts]);

  const pendingApprovalQueueCount = useMemo(() => {
    return openShifts.reduce((acc, shift) => {
      const pendingReqs = (shift.pickupRequests || []).filter((r) => r.status === 'PENDING').length;
      return acc + pendingReqs;
    }, 0);
  }, [openShifts]);

  // Execute Shift Claim
  const handleExecuteClaim = async (shift: OpenShift) => {
    setIsActionLoading(true);
    try {
      const res = await claimOpenShift(
        shift.id,
        activeCollaborator.id,
        activeCollaborator.name,
        activeCollaborator.role,
        activeWorkerWeeklyHours,
        assignedShifts
      );

      setConfirmClaimShift(null);
      await loadData();

      if (res.overtimeTriggered) {
        showToast(
          'warning',
          'Shift Claimed with Overtime Notice',
          res.message || `Claiming shift #${shift.referenceId} pushed weekly total past 40.0 hrs.`
        );
      } else {
        showToast(
          'success',
          'Marketplace Claim Processed',
          res.message || `Shift #${shift.referenceId} action confirmed!`
        );
      }
    } catch (err: any) {
      showToast('error', 'Claim Request Rejected', err.message || 'Failed to claim shift.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Supervisor Approval
  const handleApproveRequest = async (shiftId: string, requestId: string, reqCollabName: string) => {
    setIsActionLoading(true);
    try {
      const res = await approveOpenShiftPickup(
        shiftId,
        requestId,
        `${activeCollaborator.name} (${activeCollaborator.role})`
      );
      setReviewRequestsShift(null);
      await loadData();
      showToast(
        'success',
        'Pickup Request Approved',
        `Assigned shift #${res.openShift.referenceId} to ${reqCollabName}. Roster updated.`
      );
    } catch (err: any) {
      showToast('error', 'Approval Error', err.message || 'Failed to approve pickup request.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Supervisor Rejection
  const handleRejectRequestSubmit = async () => {
    if (!rejectionReasonModal) return;
    setIsActionLoading(true);
    try {
      const res = await rejectOpenShiftPickup(
        rejectionReasonModal.shiftId,
        rejectionReasonModal.requestId,
        rejectReasonText || 'Schedule capacity or qualification constraint',
        `${activeCollaborator.name} (${activeCollaborator.role})`
      );
      setRejectionReasonModal(null);
      setRejectReasonText('');
      setReviewRequestsShift(null);
      await loadData();
      showToast(
        'warning',
        'Pickup Request Rejected',
        `Pickup request for shift #${res.referenceId} was rejected.`
      );
    } catch (err: any) {
      showToast('error', 'Rejection Error', err.message || 'Failed to reject request.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Cancel Open Shift Block
  const handleCancelOpenShift = async (shift: OpenShift) => {
    setIsActionLoading(true);
    try {
      await cancelOpenShift(shift.id);
      setCancelConfirmShift(null);
      await loadData();
      showToast('success', 'Open Shift Cancelled', `Shift #${shift.referenceId} removed from marketplace.`);
    } catch (err: any) {
      showToast('error', 'Cancellation Error', err.message || 'Failed to cancel shift.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen text-[#222222] bg-[#f1ece4] font-poppins">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 max-w-md p-4 rounded-lg shadow-2xl border flex items-start gap-3 transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
              : toast.type === 'warning'
              ? 'bg-amber-50 border-amber-400 text-amber-950'
              : 'bg-rose-50 border-rose-400 text-rose-950'
          }`}
          role="alert"
        >
          <span className="material-symbols-outlined text-2xl mt-0.5">
            {toast.type === 'success'
              ? 'check_circle'
              : toast.type === 'warning'
              ? 'warning'
              : 'error'}
          </span>
          <div className="flex-1">
            <h4 className="text-xs font-bold uppercase tracking-wider">{toast.title}</h4>
            <p className="text-xs mt-1 leading-relaxed opacity-90">{toast.message}</p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-[#5f5e5e] hover:text-[#222222] p-1"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Header & Persona Selector Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-[#e8e2d8]">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-[#222222] flex items-center justify-center text-white shadow-md">
              <span className="material-symbols-outlined text-2xl text-[#ae001a]">storefront</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#222222]">
                  Open Shifts & Staffing Marketplace
                </h1>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#fef9f1] text-[#ae001a] border border-[#e8e2d8] uppercase tracking-wider">
                  REAL-TIME COVERAGE
                </span>
              </div>
              <p className="text-xs text-[#5f5e5e] mt-1 font-normal">
                Browse, publish unassigned shift blocks (`collaborator_id = null`), and claim coverage gaps with automated schedule collision & overtime guards.
              </p>
            </div>
          </div>
        </div>

        {/* Persona Switcher for live testing */}
        <div className="bg-white border border-[#e8e2d8] rounded p-3 flex flex-wrap items-center gap-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#5f5e5e] uppercase tracking-wider">
            <span className="material-symbols-outlined text-base text-[#ae001a]">person_search</span>
            Active Persona:
          </div>
          <select
            value={activeCollaborator.id}
            onChange={(e) => {
              const found = INITIAL_COLLABORATORS.find((c) => c.id === e.target.value);
              if (found) setActiveCollaborator(found);
            }}
            className="bg-[#fef9f1] text-[#1d1c17] border border-[#e8e2d8] rounded px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-[#ae001a]"
          >
            {INITIAL_COLLABORATORS.map((collab) => (
              <option key={collab.id} value={collab.id}>
                {collab.name} ({collab.role} - {collab.department})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 border-l border-[#e8e2d8] pl-3">
            <span className="text-xs text-[#5f5e5e] font-semibold">Scheduled:</span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded border ${
                activeWorkerWeeklyHours > 40
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300'
              }`}
            >
              {activeWorkerWeeklyHours.toFixed(1)} hrs/wk
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <div className="bg-white border border-[#e8e2d8] rounded p-5 shadow-sm hover:border-[#ae001a]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">
              Available Open Shifts
            </span>
            <div className="w-9 h-9 rounded bg-[#f8f6f2] border border-[#e8e2d8] flex items-center justify-center text-[#ae001a]">
              <span className="material-symbols-outlined text-lg">space_dashboard</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#222222]">
              {totalOpenShiftsCount}
            </span>
            <span className="text-xs text-[#5f5e5e]">unassigned blocks</span>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-5 shadow-sm hover:border-[#ae001a]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">
              Total Open Coverage Hours
            </span>
            <div className="w-9 h-9 rounded bg-[#f8f6f2] border border-[#e8e2d8] flex items-center justify-center text-[#ae001a]">
              <span className="material-symbols-outlined text-lg">schedule</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#222222]">
              {totalOpenHoursSum.toFixed(1)}
            </span>
            <span className="text-xs text-[#5f5e5e]">hours needed</span>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-5 shadow-sm hover:border-[#ae001a]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">
              Instant Auto-Claim (FCFS)
            </span>
            <div className="w-9 h-9 rounded bg-[#f8f6f2] border border-[#e8e2d8] flex items-center justify-center text-emerald-700">
              <span className="material-symbols-outlined text-lg">bolt</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#222222]">
              {fcfsCount}
            </span>
            <span className="text-xs text-[#5f5e5e]">immediate claim</span>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d8] rounded p-5 shadow-sm hover:border-[#ae001a]/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5f5e5e] uppercase tracking-widest">
              Pending Supervisor Queue
            </span>
            <div className="w-9 h-9 rounded bg-[#f8f6f2] border border-[#e8e2d8] flex items-center justify-center text-blue-700">
              <span className="material-symbols-outlined text-lg">assignment_ind</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#222222]">
              {pendingApprovalQueueCount}
            </span>
            <span className="text-xs text-[#5f5e5e]">requests awaiting review</span>
          </div>
        </div>
      </div>

      {/* Filter & Toolbar Controls */}
      <div className="mt-8 bg-white border border-[#e8e2d8] rounded p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search bar */}
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by #OPS ID, role, department, zone (e.g. Patio Terrace), or notes..."
              className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded pl-10 pr-8 py-2 text-xs font-semibold text-[#1d1c17] placeholder-[#5f5e5e] focus:outline-none focus:border-[#ae001a]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <span className="material-symbols-outlined text-sm">cancel</span>
              </button>
            )}
          </div>

          {/* Supervisor Action Button */}
          <button
            onClick={() => setIsPublishModalOpen(true)}
            className="px-5 py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">add_circle</span>
            Publish Open Shift Block
          </button>
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-[#e8e2d8]">
          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Role Tag Filter
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as any)}
              className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-2.5 py-1.5 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
            >
              <option value="ALL">All Roles</option>
              <option value="Line Cook">Line Cook</option>
              <option value="Bartender">Bartender</option>
              <option value="Waitstaff">Waitstaff / Server</option>
              <option value="Cashier">Cashier</option>
              <option value="Supervisor">Supervisor</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Allocation Mode
            </label>
            <select
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value as any)}
              className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-2.5 py-1.5 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
            >
              <option value="ALL">All Claim Modes</option>
              <option value="FIRST_COME_FIRST_SERVED">⚡ FCFS Instant Claim</option>
              <option value="REQUIRES_APPROVAL">📋 Requires Manager Approval</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Zone / Floor
            </label>
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-2.5 py-1.5 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
            >
              <option value="ALL">All Zones & Floor Sections</option>
              {availableZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-2 py-1.5 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-2 py-1.5 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer p-2 bg-[#fef9f1] border border-[#e8e2d8] rounded w-full h-[32px] text-xs text-[#222222] select-none hover:border-[#ae001a]/40">
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(e) => setEligibleOnly(e.target.checked)}
                className="accent-[#ae001a] rounded"
              />
              <span className="font-bold text-[11px]">Eligible For Me Only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Marketplace Grid */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-[#5f5e5e] uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-[#ae001a] text-base">grid_view</span>
            Active Shift Marketplace Directory ({filteredOpenShifts.length})
          </h3>
          {(selectedRole !== 'ALL' || selectedMode !== 'ALL' || selectedZone !== 'ALL' || searchQuery || eligibleOnly) && (
            <button
              onClick={() => {
                setSelectedRole('ALL');
                setSelectedMode('ALL');
                setSelectedZone('ALL');
                setSearchQuery('');
                setEligibleOnly(false);
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs text-[#ae001a] hover:underline flex items-center gap-1 font-bold"
            >
              Reset Filters
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-[#5f5e5e]">
            <span className="material-symbols-outlined text-4xl animate-spin text-[#ae001a] mb-3">
              sync
            </span>
            <p className="text-sm font-semibold">Hydrating open shifts marketplace...</p>
          </div>
        ) : filteredOpenShifts.length === 0 ? (
          <div className="bg-white border border-[#e8e2d8] rounded-lg py-16 px-4 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[#f8f6f2] border border-[#e8e2d8] flex items-center justify-center mx-auto mb-4 text-[#5f5e5e]">
              <span className="material-symbols-outlined text-3xl">event_busy</span>
            </div>
            <h4 className="text-base font-bold text-[#222222]">No Open Shifts Matching Criteria</h4>
            <p className="text-xs text-[#5f5e5e] max-w-md mx-auto mt-1">
              There are currently no unassigned shift blocks matching your search or eligibility filters. Try adjusting filter tags or publish a new open shift block.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOpenShifts.map((shift) => {
              // Real-time Guard Evaluation for active worker
              const roleMismatch =
                activeCollaborator.role !== 'Supervisor' &&
                activeCollaborator.role !== shift.role;

              const collisionShift = findOverlappingShift(
                assignedShifts,
                activeCollaborator.id,
                shift.date,
                shift.startTime,
                shift.endTime
              );

              const projectedHours = activeWorkerWeeklyHours + shift.hours;
              const isOvertime = projectedHours > 40;

              const pendingRequestsCount = (shift.pickupRequests || []).filter(
                (r) => r.status === 'PENDING'
              ).length;

              const userHasRequested = (shift.pickupRequests || []).some(
                (r) => r.collaboratorId === activeCollaborator.id
              );

              return (
                <div
                  key={shift.id}
                  className={`bg-white border rounded-lg p-5 flex flex-col justify-between shadow-sm transition-all hover:shadow-md relative overflow-hidden ${
                    shift.status === 'ASSIGNED'
                      ? 'border-indigo-300 bg-gray-50 opacity-75'
                      : roleMismatch || collisionShift
                      ? 'border-[#e8e2d8]'
                      : 'border-[#e8e2d8] hover:border-[#ae001a]/40'
                  }`}
                >
                  {/* Top Bar: Reference badge & Mode indicator */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-[#222222] text-white shadow-xs">
                          #{shift.referenceId}
                        </span>
                        <span className="text-xs text-[#5f5e5e] font-semibold">
                          {shift.date}
                        </span>
                      </div>

                      {/* Allocation Mode Badge */}
                      {shift.allocationMode === 'FIRST_COME_FIRST_SERVED' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-emerald-600">bolt</span>
                          FCFS CLAIM
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-900 border border-blue-300 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-blue-600">assignment_ind</span>
                          APPROVAL REQ.
                        </span>
                      )}
                    </div>

                    {/* Role & Department */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <span className="inline-block px-2.5 py-0.5 rounded text-xs font-bold bg-[#fef9f1] text-[#ae001a] border border-[#e8e2d8]">
                          {shift.role}
                        </span>
                        <span className="text-xs text-[#5f5e5e] ml-2 font-semibold">
                          {shift.department}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[#222222] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-[#5f5e5e]">place</span>
                        {shift.zone}
                      </span>
                    </div>

                    {/* Time & Compensation Box */}
                    <div className="bg-[#f8f6f2] border border-[#e8e2d8] rounded-lg p-3.5 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#222222]">
                          <span className="material-symbols-outlined text-base text-[#ae001a]">
                            schedule
                          </span>
                          {shift.startTime} - {shift.endTime}
                        </div>
                        <span className="text-xs font-bold text-[#222222] bg-white px-2 py-0.5 rounded border border-[#e8e2d8]">
                          {shift.hours} hrs
                        </span>
                      </div>

                      <div className="flex items-center justify-between border-t border-[#e8e2d8] pt-2 text-xs">
                        <span className="text-[#5f5e5e]">Est. Base Gross Earnings:</span>
                        <span className="font-bold text-[#ae001a] text-xs">
                          ${shift.estimatedGrossEarnings.toFixed(2)}{' '}
                          <span className="text-[10px] font-normal text-[#5f5e5e]">
                            (@${shift.hourlyRate}/h)
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Notes if available */}
                    {shift.notes && (
                      <p className="text-xs text-[#5f5e5e] italic mb-4 line-clamp-2 bg-[#fef9f1] p-2 rounded border border-[#e8e2d8]">
                        "{shift.notes}"
                      </p>
                    )}

                    {/* Validation & Conflict Guard Banners */}
                    {shift.status === 'ASSIGNED' ? (
                      <div className="mb-4 p-2.5 bg-indigo-50 border border-indigo-200 rounded text-indigo-900 text-xs flex items-center gap-2 font-semibold">
                        <span className="material-symbols-outlined text-base text-indigo-600">check_circle</span>
                        Assigned to {shift.collaboratorName || 'Collaborator'}
                      </div>
                    ) : (
                      <div className="space-y-2 mb-4">
                        {/* Overlapping Schedule Guard Banner */}
                        {collisionShift && (
                          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-900 text-xs flex items-start gap-2">
                            <span className="material-symbols-outlined text-base text-rose-600 mt-0.5">
                              block
                            </span>
                            <div>
                              <strong className="block font-bold">Conflict detected:</strong>
                              You are already scheduled during this time window (#{collisionShift.id}).
                            </div>
                          </div>
                        )}

                        {/* Role Skill Compliance Guard Banner */}
                        {roleMismatch && !collisionShift && (
                          <div className="p-2 bg-gray-50 border border-gray-200 rounded text-gray-700 text-[11px] flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm text-gray-500">
                              info
                            </span>
                            Ineligible: Required role is <strong>{shift.role}</strong>.
                          </div>
                        )}

                        {/* Overtime Warning & Threshold Policy Banner */}
                        {isOvertime && !collisionShift && !roleMismatch && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs flex items-start gap-2">
                            <span className="material-symbols-outlined text-base text-amber-600 mt-0.5">
                              warning
                            </span>
                            <div>
                              <strong className="block font-bold">Overtime Notice:</strong>
                              Claiming this shift will trigger overtime rates (Projected:{' '}
                              {projectedHours.toFixed(1)} hrs/wk).
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Action Buttons */}
                  <div className="pt-3 border-t border-[#e8e2d8] flex items-center justify-between gap-2">
                    {/* Supervisor specific management actions */}
                    {activeCollaborator.role === 'Supervisor' ? (
                      <div className="flex items-center justify-between w-full gap-2">
                        {shift.allocationMode === 'REQUIRES_APPROVAL' && pendingRequestsCount > 0 ? (
                          <button
                            onClick={() => setReviewRequestsShift(shift)}
                            className="flex-1 py-2 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-900 font-bold text-xs rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-base text-blue-700">assignment_ind</span>
                            Review Requests ({pendingRequestsCount})
                          </button>
                        ) : (
                          <span className="text-xs text-[#5f5e5e] italic">
                            {shift.status === 'ASSIGNED' ? 'Assigned' : 'Open for claims'}
                          </span>
                        )}

                        {shift.status !== 'ASSIGNED' && (
                          <button
                            onClick={() => setCancelConfirmShift(shift)}
                            className="p-2 text-[#5f5e5e] hover:text-rose-700 hover:bg-rose-50 border border-[#e8e2d8] rounded transition-colors cursor-pointer"
                            title="Cancel Open Shift Block"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      /* Collaborator Claim / Request Buttons */
                      <div className="w-full">
                        {shift.status === 'ASSIGNED' ? (
                          <button
                            disabled
                            className="w-full py-2 bg-gray-100 text-gray-500 text-xs font-bold rounded cursor-not-allowed border border-gray-200"
                          >
                            Shift Filled & Assigned
                          </button>
                        ) : collisionShift || roleMismatch ? (
                          <button
                            disabled
                            className="w-full py-2 bg-gray-100 text-gray-400 text-xs font-bold rounded cursor-not-allowed border border-gray-200 flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">lock</span>
                            Claim Ineligible
                          </button>
                        ) : userHasRequested ? (
                          <button
                            disabled
                            className="w-full py-2 bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold rounded cursor-not-allowed flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-sm">hourglass_top</span>
                            Pickup Request Pending Approval
                          </button>
                        ) : shift.allocationMode === 'FIRST_COME_FIRST_SERVED' ? (
                          <button
                            onClick={() => setConfirmClaimShift(shift)}
                            className="w-full py-2.5 bg-[#ae001a] hover:bg-[#930015] text-white font-bold text-[11px] uppercase tracking-widest rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <span className="material-symbols-outlined text-sm">bolt</span>
                            Instant Claim Shift
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmClaimShift(shift)}
                            className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-[11px] uppercase tracking-widest rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <span className="material-symbols-outlined text-sm">send</span>
                            Request Shift Pickup
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Publish Open Shift */}
      <PublishOpenShiftModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onShiftPublished={(newShift) => {
          showToast('success', 'Open Shift Published', `Published unassigned shift #${newShift.referenceId} to marketplace.`);
          loadData();
        }}
      />

      {/* Modal: Confirm Shift Claim / Pickup Request */}
      {confirmClaimShift && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#e8e2d8] rounded-lg shadow-2xl w-full max-w-md min-w-[320px] sm:min-w-[450px] p-6 text-[#222222]">
            <div className="bg-[#222222] text-white -mx-6 -mt-6 p-4 rounded-t-lg mb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ae001a] text-xl">
                  {confirmClaimShift.allocationMode === 'FIRST_COME_FIRST_SERVED' ? 'bolt' : 'send'}
                </span>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                  Confirm Shift {confirmClaimShift.allocationMode === 'FIRST_COME_FIRST_SERVED' ? 'Claim' : 'Pickup Request'}
                </h3>
              </div>
              <button
                onClick={() => setConfirmClaimShift(null)}
                className="text-white/70 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="py-2 space-y-3">
              <div className="bg-[#f8f6f2] border border-[#e8e2d8] rounded p-3 text-xs space-y-2 font-poppins">
                <div className="flex justify-between">
                  <span className="text-[#5f5e5e]">Shift Reference:</span>
                  <span className="font-mono font-bold text-[#ae001a]">
                    #{confirmClaimShift.referenceId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5f5e5e]">Operational Date:</span>
                  <span className="font-semibold text-[#222222]">{confirmClaimShift.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5f5e5e]">Time Window:</span>
                  <span className="font-semibold text-[#222222]">
                    {confirmClaimShift.startTime} - {confirmClaimShift.endTime} ({confirmClaimShift.hours}h)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5f5e5e]">Floor Zone:</span>
                  <span className="font-semibold text-[#222222]">{confirmClaimShift.zone}</span>
                </div>
                <div className="flex justify-between border-t border-[#e8e2d8] pt-2">
                  <span className="text-[#5f5e5e]">Est. Gross Base Pay:</span>
                  <span className="font-bold text-[#ae001a]">
                    ${confirmClaimShift.estimatedGrossEarnings.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Overtime Notice in Modal if applicable */}
              {activeWorkerWeeklyHours + confirmClaimShift.hours > 40 && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs flex items-start gap-2">
                  <span className="material-symbols-outlined text-base text-amber-600">warning</span>
                  <div>
                    <strong>Overtime Policy Warning:</strong> This shift claim pushes your projected weekly hours to{' '}
                    {(activeWorkerWeeklyHours + confirmClaimShift.hours).toFixed(1)} hrs (&gt;40h/week). Overtime rates will apply.
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e8e2d8] mt-4">
              <button
                type="button"
                onClick={() => setConfirmClaimShift(null)}
                className="px-4 py-2 text-xs font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] hover:bg-[#fef9f1] rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => handleExecuteClaim(confirmClaimShift)}
                className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white bg-[#ae001a] hover:bg-[#930015] disabled:opacity-50 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isActionLoading ? (
                  <span className="material-symbols-outlined text-base animate-spin">refresh</span>
                ) : (
                  <span className="material-symbols-outlined text-base">check</span>
                )}
                {confirmClaimShift.allocationMode === 'FIRST_COME_FIRST_SERVED'
                  ? 'Confirm Claim'
                  : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer / Modal: Supervisor Review Pickup Requests */}
      {reviewRequestsShift && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#e8e2d8] rounded-lg shadow-2xl w-full max-w-xl min-w-[320px] sm:min-w-[550px] p-6 text-[#222222] max-h-[85vh] overflow-y-auto">
            <div className="bg-[#222222] text-white -mx-6 -mt-6 p-4 rounded-t-lg mb-4 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#ae001a]">assignment_ind</span>
                  Review Pickup Requests (#{reviewRequestsShift.referenceId})
                </h3>
                <p className="text-xs text-white/70 font-normal mt-0.5">
                  {reviewRequestsShift.role} • {reviewRequestsShift.date} ({reviewRequestsShift.startTime} - {reviewRequestsShift.endTime})
                </p>
              </div>
              <button
                onClick={() => setReviewRequestsShift(null)}
                className="text-white/70 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3">
              {(reviewRequestsShift.pickupRequests || []).length === 0 ? (
                <p className="text-xs text-[#5f5e5e] italic py-4 text-center">
                  No pickup requests submitted for this shift.
                </p>
              ) : (
                (reviewRequestsShift.pickupRequests || []).map((req) => (
                  <div
                    key={req.id}
                    className="bg-[#f8f6f2] border border-[#e8e2d8] rounded p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {req.avatarUrl ? (
                        <img
                          src={req.avatarUrl}
                          alt={req.collaboratorName}
                          className="w-10 h-10 rounded-full object-cover border border-[#e8e2d8]"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#222222] text-white flex items-center justify-center font-bold text-xs">
                          {req.collaboratorName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-bold text-[#222222]">{req.collaboratorName}</div>
                        <div className="text-[11px] text-[#5f5e5e]">
                          Role: {req.collaboratorRole} • Requested: {new Date(req.requestedAt).toLocaleTimeString()}
                        </div>
                        {req.notes && (
                          <div className="text-[11px] text-[#5f5e5e] italic mt-1">{req.notes}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {req.status === 'PENDING' ? (
                        <>
                          <button
                            disabled={isActionLoading}
                            onClick={() =>
                              setRejectionReasonModal({
                                shiftId: reviewRequestsShift.id,
                                requestId: req.id,
                                collaboratorName: req.collaboratorName,
                              })
                            }
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-xs font-bold rounded transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            disabled={isActionLoading}
                            onClick={() =>
                              handleApproveRequest(
                                reviewRequestsShift.id,
                                req.id,
                                req.collaboratorName
                              )
                            }
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">check</span>
                            Approve
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded border ${
                            req.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                              : 'bg-rose-50 text-rose-900 border-rose-300'
                          }`}
                        >
                          {req.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Rejection Reason Prompt */}
      {rejectionReasonModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#e8e2d8] rounded-lg shadow-2xl w-full max-w-md min-w-[320px] sm:min-w-[450px] p-6 text-[#222222]">
            <h3 className="text-sm font-bold uppercase tracking-widest text-[#222222] mb-2">
              Reject Pickup Request for {rejectionReasonModal.collaboratorName}
            </h3>
            <p className="text-xs text-[#5f5e5e] mb-4">
              Provide an audit reason for rejecting this collaborator's pickup request.
            </p>
            <textarea
              value={rejectReasonText}
              onChange={(e) => setRejectReasonText(e.target.value)}
              placeholder="e.g. Schedule capacity limit reached or role qualification mismatch"
              rows={3}
              className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded p-3 text-xs text-[#1d1c17] focus:outline-none focus:border-[#ae001a] mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setRejectionReasonModal(null)}
                className="px-4 py-2 text-xs font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] rounded hover:bg-[#fef9f1]"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectRequestSubmit}
                disabled={isActionLoading}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-rose-700 hover:bg-rose-800 rounded"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Cancel Open Shift Block */}
      {cancelConfirmShift && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#e8e2d8] rounded-lg shadow-2xl w-full max-w-md min-w-[320px] sm:min-w-[450px] p-6 text-[#222222]">
            <div className="bg-[#222222] text-white -mx-6 -mt-6 p-4 rounded-t-lg mb-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#ae001a] text-xl">delete_forever</span>
                <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                  Cancel Open Shift Block
                </h3>
              </div>
              <button
                onClick={() => setCancelConfirmShift(null)}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="py-2 space-y-3">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded text-xs space-y-1">
                <div className="flex items-center gap-2 text-rose-950 font-bold">
                  <span className="material-symbols-outlined text-base text-rose-600">warning</span>
                  Confirm Shift Block Cancellation
                </div>
                <p className="text-rose-900 leading-relaxed">
                  Are you sure you want to remove unassigned shift block{' '}
                  <strong className="font-mono font-bold text-[#ae001a]">#{cancelConfirmShift.referenceId}</strong> from the active marketplace directory?
                </p>
              </div>

              <div className="bg-[#f8f6f2] border border-[#e8e2d8] rounded p-3 text-xs space-y-1.5 font-poppins">
                <div className="flex justify-between">
                  <span className="text-[#5f5e5e]">Role Required:</span>
                  <span className="font-bold text-[#ae001a]">{cancelConfirmShift.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5f5e5e]">Department & Zone:</span>
                  <span className="font-semibold text-[#222222]">{cancelConfirmShift.department} • {cancelConfirmShift.zone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5f5e5e]">Date & Time:</span>
                  <span className="font-semibold text-[#222222]">{cancelConfirmShift.date} ({cancelConfirmShift.startTime} - {cancelConfirmShift.endTime})</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e8e2d8] mt-4">
              <button
                type="button"
                onClick={() => setCancelConfirmShift(null)}
                className="px-4 py-2 text-xs font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] hover:bg-[#fef9f1] rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => handleCancelOpenShift(cancelConfirmShift)}
                className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isActionLoading ? (
                  <span className="material-symbols-outlined text-base animate-spin">refresh</span>
                ) : (
                  <span className="material-symbols-outlined text-base">delete</span>
                )}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Launch Panel Shortcuts */}
      <StaffManagementQuickLinks
        activeModule="open-shifts"
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default OpenShiftsMarketplaceView;
