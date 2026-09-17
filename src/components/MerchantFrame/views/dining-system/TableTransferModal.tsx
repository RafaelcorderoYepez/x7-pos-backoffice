// Live guest transfer: the active tab is moved from one table to another without settling.
//
// Only available tables are offered. An occupied table would duplicate tickets and one in cleaning
// or out of service should receive nobody, so destination is chosen from an already filtered list
// and the lock reason is explained when that list is empty.

import React, { useState } from 'react';
import type { DiningTable } from '../../../../types/dining-system';
import { formatSeats, transferTargetError } from '../../../../lib/dining-tables';
import { useModalDismiss } from '../../../../lib/useModalDismiss';
import { AppModal, ModalFormFooter } from '../../shared/AppModal';

interface TableTransferModalProps {
  source: DiningTable;
  // Already filtered to receptive tables (status 'available').
  targets: DiningTable[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (target: DiningTable) => void;
}

export const TableTransferModal: React.FC<TableTransferModalProps> = ({
  source,
  targets,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [targetId, setTargetId] = useState('');
  useModalDismiss(onCancel);

  const target = targets.find((t) => String(t.id) === targetId);
  // A smaller table does not invalidate the transfer —manager knows if they fit— but warning
  // prevents accidentally moving six guests to a two-top table.
  const capacityWarning =
    target && target.capacity < source.capacity
      ? `${target.number} seats ${target.capacity}, fewer than the ${source.capacity} at ${source.number}.`
      : '';

  return (
    <AppModal
      title={`Transfer Table ${source.number}`}
      subtitle="Dining System"
      onClose={onCancel}
      closeDisabled={submitting}
      size="md"
      closeAriaLabel="Close transfer dialog"
    >
      <div className="p-6 space-y-4 text-left font-sans">
        <p className="text-sm text-[#5f5e5e]">
          Move the seated party and its open check from{' '}
          <strong className="font-mono text-[#1d1c17]">{source.number}</strong> to another table.
          The check stays open and the server keeps the table.
        </p>

        {targets.length === 0 ? (
          <p
            role="alert"
            className="text-sm text-[#ae001a] font-semibold bg-[#ae001a]/5 border border-[#ae001a]/20 rounded px-3 py-2"
          >
            No available table can take this party right now. Free up a table — occupied,
            reserved, cleaning and out-of-service tables cannot receive a transfer.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="transfer-target"
              className="text-[11px] font-bold text-[#5f5e5e] uppercase"
            >
              Target table <span className="text-[#ae001a]">*</span>
            </label>
            <select
              id="transfer-target"
              autoFocus
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="bg-white text-[#1d1c17] px-3 py-2 border border-[#e8e2d8] rounded text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none w-full"
            >
              <option value="">Select an available table…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.number} · {formatSeats(t.capacity)}
                  {t.floorZone?.name ? ` · ${t.floorZone.name}` : ''}
                </option>
              ))}
            </select>
            {capacityWarning && (
              <p className="text-[11px] text-[#5f5e5e] italic">{capacityWarning}</p>
            )}
          </div>
        )}

        {/* Safety check in case the list arrives with a table that is no longer free while
            the dialog was open: backend would reject it anyway, but operator
            deserves to read the reason before clicking. */}
        {target && target.status !== 'available' && (
          <p role="alert" className="text-[11px] font-semibold text-[#ae001a]">
            {transferTargetError(target)}
          </p>
        )}

        <ModalFormFooter
          onCancel={onCancel}
          submitLabel={submitting ? 'Transferring…' : 'Transfer Party'}
          isSubmitting={submitting}
          submitType="button"
          onSubmit={() => target && onSubmit(target)}
          submitDisabled={!target || target.status !== 'available'}
        />
      </div>
    </AppModal>
  );
};

export default TableTransferModal;
