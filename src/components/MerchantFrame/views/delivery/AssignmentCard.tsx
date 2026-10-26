// Piezas de una asignación compartidas por la tarjeta Kanban y la fila de la tabla:
// píldora de estado, insignia de flota (repartidor propio o DSP), línea de tiempos y
// botones de acción (sólo las transiciones que el backend admite desde el estado actual).

import React from 'react';
import type { DeliveryAssignment, DeliveryStatus } from '../../../../types/delivery-assignments';
import {
  STATUS_META,
  TYPE_META,
  assignmentCode,
  canReassignDriver,
  isDspType,
  orderCode,
  relativeTime,
  statusActions,
  timelineEntries,
  vehicleIcon,
} from '../../../../lib/delivery-assignments';
import { formatMoney } from '../../../../lib/delivery-fees';

export interface AssignmentHandlers {
  onStatus: (assignment: DeliveryAssignment, to: DeliveryStatus) => void;
  onReassign: (assignment: DeliveryAssignment) => void;
  onTrack: (assignment: DeliveryAssignment) => void;
}

export const actionButton =
  'inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#e8e2d8] bg-white text-[10px] font-bold uppercase tracking-wider text-[#5f5e5e] hover:text-primary! hover:border-[#ae001a] transition-colors duration-200 disabled:opacity-40 cursor-pointer font-sans';

export const AssignmentStatusPill: React.FC<{ status: DeliveryStatus }> = ({ status }) => {
  const meta = STATUS_META[status];
  return (
    <span
      data-testid="status-pill"
      data-color={meta.color}
      // Color por variable: así el hover puede pasar a fondo blanco + texto rojo, legible
      // (texto rojo sobre azul o morado no se lee).
      className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white bg-[var(--pill)] ring-1 ring-[var(--pill)] hover:bg-white! hover:text-primary! transition-colors duration-200"
      style={{ '--pill': meta.color } as React.CSSProperties}
    >
      {meta.label}
    </span>
  );
};

// `trailing` (la píldora de estado en la tarjeta) va en la primera fila: así el número de
// pedido y la dirección usan todo el ancho de la columna en vez de partirse palabra a palabra.
export const AssignmentIdBadges: React.FC<{ assignment: DeliveryAssignment; trailing?: React.ReactNode }> = ({
  assignment,
  trailing,
}) => (
  <div className="flex flex-col gap-1 min-w-0">
    <div className="flex flex-wrap items-center gap-1.5 font-sans">
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#222222] text-white">
        {assignmentCode(assignment.id)}
      </span>
      <span className="material-symbols-outlined text-sm text-[#5f5e5e]" aria-hidden="true">
        link
      </span>
      <span className="font-semibold text-[#1d1c17] hover:text-primary! transition-colors duration-200">
        {orderCode(assignment.order?.id)}
      </span>
      {trailing ? <span className="ml-auto">{trailing}</span> : null}
    </div>
    {assignment.order?.order_number ? (
      <span className="text-[11px] text-[#5f5e5e] whitespace-nowrap">No. {assignment.order.order_number}</span>
    ) : null}
    <p className="text-body-sm text-[#5f5e5e] flex items-start gap-1">
      <span className="material-symbols-outlined text-sm mt-0.5" aria-hidden="true">
        location_on
      </span>
      <span className="break-words">{assignment.order?.delivery_address || 'No delivery address'}</span>
    </p>
  </div>
);

export const AssignmentFleetBadge: React.FC<{ assignment: DeliveryAssignment; vehicleType?: string | null }> = ({
  assignment,
  vehicleType,
}) => {
  if (isDspType(assignment.assignment_type)) {
    const meta = TYPE_META[assignment.assignment_type];
    return (
      <div className="flex flex-wrap items-center gap-1.5" data-testid="fleet-badge">
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white bg-[var(--pill)] ring-1 ring-[var(--pill)] hover:bg-white! hover:text-primary! transition-colors duration-200"
          style={{ '--pill': meta.color } as React.CSSProperties}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            {meta.icon}
          </span>
          {meta.label}
        </span>
        {assignment.external_dsp_fee !== null ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-[#ece8e0] text-[#1d1c17] font-sans">
            DSP Fee: {formatMoney(assignment.external_dsp_fee)}
          </span>
        ) : null}
      </div>
    );
  }
  const driver = assignment.deliveryDriver;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="fleet-badge">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#ae001a]/10 text-[#ae001a] hover:text-primary! transition-colors duration-200">
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          two_wheeler
        </span>
        In-House
      </span>
      {driver ? (
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#1d1c17] font-sans">
          <span
            className="material-symbols-outlined text-base text-[#5f5e5e]"
            data-testid="vehicle-icon"
            aria-hidden="true"
          >
            {vehicleIcon(driver.vehicleType ?? vehicleType)}
          </span>
          {driver.name}
        </span>
      ) : (
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b]">Unassigned</span>
      )}
    </div>
  );
};

export const AssignmentTimeline: React.FC<{ assignment: DeliveryAssignment; now: number }> = ({ assignment, now }) => {
  const entries = timelineEntries(assignment);
  if (!entries.length) {
    return <p className="text-[11px] text-[#5f5e5e] font-sans">Waiting for dispatch</p>;
  }
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#5f5e5e] font-sans" data-testid="timeline">
      {entries.map((entry) => (
        <li key={entry.key} className="inline-flex items-center gap-1" title={new Date(entry.at).toLocaleString()}>
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            {entry.key === 'assigned' ? 'schedule' : 'timer'}
          </span>
          {entry.label} {relativeTime(entry.at, now)}
        </li>
      ))}
    </ul>
  );
};

export const AssignmentActions: React.FC<
  { assignment: DeliveryAssignment; busy: boolean } & AssignmentHandlers
> = ({ assignment, busy, onStatus, onReassign, onTrack }) => {
  const actions = statusActions(assignment);
  const code = assignmentCode(assignment.id);
  const dsp = isDspType(assignment.assignment_type);
  const canTrack = dsp ? !!assignment.external_tracking_url : !!assignment.deliveryDriver;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={`actions-${assignment.id}`}>
      {canReassignDriver(assignment) ? (
        <button
          type="button"
          disabled={busy}
          className={actionButton}
          aria-label={`${assignment.deliveryDriver ? 'Reassign driver' : 'Assign driver'} for ${code}`}
          onClick={() => onReassign(assignment)}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            two_wheeler
          </span>
          {assignment.deliveryDriver ? 'Reassign driver' : 'Assign driver'}
        </button>
      ) : null}
      {actions.map((action) => (
        <button
          key={action.to}
          type="button"
          disabled={busy}
          aria-label={`${action.label} ${code}`}
          className={`${actionButton} ${action.destructive ? 'text-[#b91c1c]' : ''}`}
          onClick={() => onStatus(assignment, action.to)}
        >
          {action.label}
        </button>
      ))}
      {canTrack ? (
        <button
          type="button"
          className={actionButton}
          aria-label={`Live tracking ${code}`}
          onClick={() => onTrack(assignment)}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            {dsp ? 'open_in_new' : 'local_shipping'}
          </span>
          Live tracking
        </button>
      ) : null}
    </div>
  );
};

export const AssignmentCard: React.FC<
  { assignment: DeliveryAssignment; now: number; busy: boolean; vehicleType?: string | null } & AssignmentHandlers
> = ({ assignment, now, busy, vehicleType, ...handlers }) => (
  <article
    data-testid={`assignment-card-${assignment.id}`}
    className="bg-white border border-[#e8e2d8] rounded shadow-sm p-3 flex flex-col gap-2 hover:shadow-md hover:text-primary! transition-colors duration-200"
  >
    <AssignmentIdBadges assignment={assignment} trailing={<AssignmentStatusPill status={assignment.delivery_status} />} />
    <AssignmentFleetBadge assignment={assignment} vehicleType={vehicleType} />
    <AssignmentTimeline assignment={assignment} now={now} />
    <AssignmentActions assignment={assignment} busy={busy} {...handlers} />
  </article>
);

export default AssignmentCard;
