// Tracking a DSP delivery: the supplier URL in an iframe inside the drawer, with
// the "Open in new tab" link clearly visible because some providers block embedding
// (X-Frame-Options / CSP frame-ancestors) and the iframe would be blank.

import React from 'react';
import type { DeliveryAssignment } from '../../../../types/delivery-assignments';
import { TYPE_META, assignmentCode, orderCode } from '../../../../lib/delivery-assignments';
import { SideDrawer } from '../../shared/SideDrawer';

interface AssignmentTrackingDrawerProps {
  assignment: DeliveryAssignment;
  onClose: () => void;
}

export const AssignmentTrackingDrawer: React.FC<AssignmentTrackingDrawerProps> = ({ assignment, onClose }) => {
  const url = assignment.external_tracking_url ?? '';
  return (
    <SideDrawer
      title={`Live tracking ${assignmentCode(assignment.id)}`}
      subtitle={`${TYPE_META[assignment.assignment_type].label} · ${orderCode(assignment.order?.id)}`}
      onClose={onClose}
      maxWidth={760}
    >
      <div className="p-4 flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded border border-[#f59e0b]/60 bg-[#f59e0b]/10">
          <p className="text-body-sm text-[#92400e]">
            Some providers block embedded tracking. If the map stays blank, open it in a new tab.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors duration-200"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              open_in_new
            </span>
            Open in new tab
          </a>
        </div>
        {assignment.external_delivery_id ? (
          <p className="text-[11px] text-[#5f5e5e] font-sans">
            External delivery id: <span className="font-semibold text-[#1d1c17]">{assignment.external_delivery_id}</span>
          </p>
        ) : null}
        <iframe
          title={`Tracking for ${assignmentCode(assignment.id)}`}
          src={url}
          className="w-full flex-1 min-h-[420px] border border-[#e8e2d8] rounded"
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
        />
      </div>
    </SideDrawer>
  );
};

export default AssignmentTrackingDrawer;
