import React, { useState } from 'react';
import type {
  CollaboratorRole,
  OpenShiftAllocationMode,
  OpenShift,
} from '../../../../types/shifts';
import { publishOpenShift } from '../../../../api/shifts';

interface PublishOpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShiftPublished: (shift: OpenShift) => void;
}

export const PublishOpenShiftModal: React.FC<PublishOpenShiftModalProps> = ({
  isOpen,
  onClose,
  onShiftPublished,
}) => {
  const [role, setRole] = useState<CollaboratorRole>('Line Cook');
  const [department, setDepartment] = useState('Kitchen (BOH)');
  const [zone, setZone] = useState('Kitchen Station 1');
  const [date, setDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState('07:00 AM');
  const [endTime, setEndTime] = useState('03:00 PM');
  const [hours, setHours] = useState(8.0);
  const [hourlyRate, setHourlyRate] = useState(18.5);
  const [allocationMode, setAllocationMode] =
    useState<OpenShiftAllocationMode>('FIRST_COME_FIRST_SERVED');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRoleChange = (newRole: CollaboratorRole) => {
    setRole(newRole);
    switch (newRole) {
      case 'Line Cook':
        setDepartment('Kitchen (BOH)');
        setZone('Kitchen Station 1');
        setHourlyRate(18.5);
        break;
      case 'Bartender':
        setDepartment('Bar & Lounge');
        setZone('Main Bar');
        setHourlyRate(22.0);
        break;
      case 'Waitstaff':
        setDepartment('Dining Room');
        setZone('Patio Terrace');
        setHourlyRate(16.0);
        break;
      case 'Cashier':
        setDepartment('Front Desk');
        setZone('Front Entrance Counter');
        setHourlyRate(15.5);
        break;
      case 'Supervisor':
        setDepartment('Floor Management');
        setZone('Main Floor Overall');
        setHourlyRate(24.0);
        break;
    }
  };

  const grossEarnings = (hours * hourlyRate).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const created = await publishOpenShift({
        role,
        department,
        zone,
        date,
        startTime,
        endTime,
        hours: Number(hours),
        hourlyRate: Number(hourlyRate),
        allocationMode,
        notes,
      });
      onShiftPublished(created);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to publish open shift block.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-open-shift-title"
    >
      <div className="bg-white border border-[#e8e2d8] rounded-lg shadow-2xl w-full max-w-xl min-w-[320px] sm:min-w-[540px] p-6 text-[#222222] overflow-y-auto max-h-[90vh] font-poppins">
        <div className="bg-[#222222] text-white -mx-6 -mt-6 p-4 rounded-t-lg mb-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-xl text-[#ae001a]">add_circle</span>
            <div>
              <h2
                id="publish-open-shift-title"
                className="text-sm font-bold uppercase tracking-widest text-white"
              >
                Publish Unassigned Shift Block
              </h2>
              <p className="text-xs text-white/70 font-normal">
                Post an unassigned shift block (collaborator_id = null) to the Marketplace pool
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded text-rose-900 text-xs flex items-center gap-2 font-semibold">
            <span className="material-symbols-outlined text-base text-rose-600">error</span>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Functional Role Required
              </label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value as CollaboratorRole)}
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
              >
                <option value="Line Cook">Line Cook (Kitchen BOH)</option>
                <option value="Bartender">Bartender (Bar & Lounge)</option>
                <option value="Waitstaff">Waitstaff (Dining Room / Server)</option>
                <option value="Cashier">Cashier (Front Desk)</option>
                <option value="Supervisor">Supervisor (Floor Management)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Operational Zone / Floor Section
              </label>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="e.g. Patio Terrace, Main Bar"
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Start Time
              </label>
              <input
                type="text"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="07:00 AM"
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                End Time
              </label>
              <input
                type="text"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="03:00 PM"
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Shift Hours (Duration)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="24"
                value={hours}
                onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Base Hourly Rate ($/hr)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
                Est. Gross Earnings
              </label>
              <div className="bg-[#f8f6f2] border border-[#e8e2d8] rounded px-3 py-2 text-[#ae001a] font-black text-xs">
                ${grossEarnings}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-2">
              Claim Allocation Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                  allocationMode === 'FIRST_COME_FIRST_SERVED'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                    : 'bg-[#fef9f1] border-[#e8e2d8] text-[#5f5e5e] hover:border-[#ae001a]/40'
                }`}
              >
                <input
                  type="radio"
                  name="allocationMode"
                  value="FIRST_COME_FIRST_SERVED"
                  checked={allocationMode === 'FIRST_COME_FIRST_SERVED'}
                  onChange={() => setAllocationMode('FIRST_COME_FIRST_SERVED')}
                  className="mt-0.5 accent-[#ae001a]"
                />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-emerald-600">bolt</span>
                    First-Come, First-Served
                  </div>
                  <div className="text-[11px] text-[#5f5e5e] mt-0.5 font-normal">
                    Immediate auto-assignment to the first worker who clicks claim.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                  allocationMode === 'REQUIRES_APPROVAL'
                    ? 'bg-blue-50 border-blue-400 text-blue-950'
                    : 'bg-[#fef9f1] border-[#e8e2d8] text-[#5f5e5e] hover:border-[#ae001a]/40'
                }`}
              >
                <input
                  type="radio"
                  name="allocationMode"
                  value="REQUIRES_APPROVAL"
                  checked={allocationMode === 'REQUIRES_APPROVAL'}
                  onChange={() => setAllocationMode('REQUIRES_APPROVAL')}
                  className="mt-0.5 accent-[#ae001a]"
                />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-blue-600">assignment_ind</span>
                    Requires Manager Approval
                  </div>
                  <div className="text-[11px] text-[#5f5e5e] mt-0.5 font-normal">
                    Claim requests enter a supervisor approval queue before assignment.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#5f5e5e] uppercase tracking-wider mb-1">
              Notes & Special Operational Instructions
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Must have patio opening checklist certification; uniform required."
              rows={2}
              className="w-full bg-[#fef9f1] border border-[#e8e2d8] rounded px-3 py-2 text-xs font-semibold text-[#1d1c17] focus:outline-none focus:border-[#ae001a]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e8e2d8]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-[#5f5e5e] bg-white border border-[#e8e2d8] hover:bg-[#fef9f1] rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white bg-[#ae001a] hover:bg-[#930015] disabled:opacity-50 rounded transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined text-base animate-spin">refresh</span>
                  Publishing...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">publish</span>
                  Publish Shift Block
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PublishOpenShiftModal;
