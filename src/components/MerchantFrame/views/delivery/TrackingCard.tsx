// Tarjeta de seguimiento activo: #TRK, repartidor, #ASN, coordenada en vivo con su "hace X s"
// y el semáforo de puntualidad. Clic = enfocar el reparto en el mapa.

import React from 'react';
import type { TelemetryStatus } from '../../../../types/delivery-tracking';
import {
  TELEMETRY_META,
  assignmentCode,
  formatCoord,
  formatRelativeTime,
  markerColor,
  trackingCode,
  vehicleIcon,
  type TrackedEntry,
} from '../../../../lib/delivery-tracking';

interface TrackingCardProps {
  entry: TrackedEntry;
  status: TelemetryStatus;
  seconds: number | null;
  focused: boolean;
  onFocus: (assignmentId: number) => void;
}

export const TrackingCard: React.FC<TrackingCardProps> = ({ entry, status, seconds, focused, onFocus }) => {
  const id = entry.delivery_assignment_id;
  const meta = TELEMETRY_META[status];
  const color = markerColor(status, seconds);
  const critical = status === 'signal_lost' && color === '#ef4444';

  return (
    <li>
      <button
        type="button"
        data-testid={`tracking-card-${id}`}
        aria-pressed={focused}
        aria-label={`Focus ${assignmentCode(id)} ${entry.driver?.name ?? 'unassigned courier'}`}
        onClick={() => onFocus(id)}
        className={`w-full text-left bg-white border rounded p-4 flex flex-col gap-2.5 border-l-4 hover:text-primary! hover:shadow-md transition-colors duration-200 cursor-pointer ${
          focused ? 'border-[#ae001a] ring-1 ring-[#ae001a]' : 'border-[#e8e2d8]'
        }`}
        style={{ borderLeftColor: color }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            data-testid={`card-trk-${id}`}
            className="font-sans tabular-nums text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-[#f8f3eb] text-[#1d1c17]"
          >
            {entry.tracking_id != null ? trackingCode(entry.tracking_id) : 'No signal yet'}
          </span>
          <span
            data-testid={`card-status-${id}`}
            data-status={status}
            className={`inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-white! hover:text-primary! transition-colors duration-200 ${
              critical ? 'bg-[#ef4444] text-white' : meta.pill
            }`}
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              {meta.icon}
            </span>
            {meta.label}
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[#5f5e5e]" aria-hidden="true">
            {vehicleIcon(entry.driver?.vehicle_type)}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[#1d1c17] truncate">{entry.driver?.name || 'Unassigned courier'}</p>
            <p className="text-body-sm text-[#5f5e5e]">
              <span className="font-sans tabular-nums">{assignmentCode(id)}</span> · {entry.delivery_status.replace(/_/g, ' ')}
            </p>
          </div>
        </div>

        <div
          data-testid={`card-coords-${id}`}
          className="flex items-center justify-between gap-2 rounded bg-[#fef9f1] border border-[#e8e2d8] px-2.5 py-1.5"
        >
          <span className="inline-flex items-center gap-1.5 font-sans tabular-nums text-[12px] text-[#1d1c17]">
            <span className="material-symbols-outlined text-[16px] text-[#ae001a]" aria-hidden="true">
              pin_drop
            </span>
            {entry.lat != null && entry.lng != null
              ? `${formatCoord(entry.lat)}, ${formatCoord(entry.lng)}`
              : 'No position yet'}
          </span>
          <span data-testid={`card-updated-${id}`} className="font-sans tabular-nums text-[11px] text-[#5f5e5e] whitespace-nowrap">
            {formatRelativeTime(seconds)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span
            data-testid={`card-ontime-${id}`}
            className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider ${
              entry.on_time == null ? 'text-[#5f5e5e]' : entry.on_time ? 'text-[#047857]' : 'text-[#b91c1c]'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              {entry.on_time == null ? 'schedule' : entry.on_time ? 'check_circle' : 'running_with_errors'}
            </span>
            {entry.on_time == null ? 'No ETA data' : entry.on_time ? 'On time' : 'Late'}
          </span>
          {entry.minutes_since_assigned != null ? (
            <span className="font-sans tabular-nums text-[#5f5e5e]">{entry.minutes_since_assigned} min since assigned</span>
          ) : null}
        </div>
      </button>
    </li>
  );
};

export default TrackingCard;
