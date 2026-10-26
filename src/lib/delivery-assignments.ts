// Helpers puros del tablero de despacho: transiciones (espejo de
// DELIVERY_STATUS_TRANSITIONS del backend), píldoras, columnas Kanban, tiempos relativos,
// iconos de vehículo y construcción de la query del listado.

import type {
  AssignmentFilters,
  AssignmentType,
  DeliveryAssignment,
  DeliveryStatus,
  DspAssignmentType,
} from '../types/delivery-assignments';

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  'pending',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
  'failed',
  'cancelled',
];

export const ASSIGNMENT_TYPES: AssignmentType[] = ['in_house', 'doordash_drive', 'uber_direct'];

export const DSP_TYPES: DspAssignmentType[] = ['doordash_drive', 'uber_direct'];

export const OPEN_DELIVERY_STATUSES: DeliveryStatus[] = ['pending', 'assigned', 'picked_up', 'in_transit'];

export const isDspType = (type: AssignmentType): type is DspAssignmentType => type !== 'in_house';

export const isTerminalStatus = (status: DeliveryStatus): boolean =>
  status === 'delivered' || status === 'failed' || status === 'cancelled';

// Mismo contenido que constants/delivery-assignment.constants.ts del backend.
export const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  pending: ['assigned', 'failed', 'cancelled'],
  assigned: ['picked_up', 'failed', 'cancelled'],
  picked_up: ['in_transit', 'delivered', 'failed', 'cancelled'],
  in_transit: ['delivered', 'failed', 'cancelled'],
  delivered: [],
  failed: [],
  cancelled: [],
};

export const canTransition = (from: DeliveryStatus, to: DeliveryStatus): boolean =>
  DELIVERY_STATUS_TRANSITIONS[from]?.includes(to) ?? false;

export const STATUS_META: Record<DeliveryStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#64748b' },
  assigned: { label: 'Assigned', color: '#3b82f6' },
  picked_up: { label: 'Picked up', color: '#8b5cf6' },
  in_transit: { label: 'In transit', color: '#8b5cf6' },
  delivered: { label: 'Delivered', color: '#10b981' },
  failed: { label: 'Failed', color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#ef4444' },
};

export const TYPE_META: Record<AssignmentType, { label: string; filterLabel: string; icon: string; color: string }> = {
  in_house: { label: 'In-House', filterLabel: 'IN_HOUSE', icon: 'two_wheeler', color: '#ae001a' },
  doordash_drive: { label: 'DoorDash Drive', filterLabel: 'DOORDASH_DRIVE', icon: 'local_shipping', color: '#eb1700' },
  uber_direct: { label: 'Uber Direct', filterLabel: 'UBER_DIRECT', icon: 'hub', color: '#06c167' },
};

export type TransitionAction = { to: DeliveryStatus; label: string; destructive: boolean };

const ACTION_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Mark pending',
  assigned: 'Mark assigned',
  picked_up: 'Mark picked up',
  in_transit: 'Mark in transit',
  delivered: 'Mark delivered',
  failed: 'Mark failed',
  cancelled: 'Cancel',
};

export const isDestructiveStatus = (status: DeliveryStatus): boolean =>
  status === 'failed' || status === 'cancelled';

/**
 * Acciones de estado para una asignación. `pending → assigned` necesita un repartidor
 * (IN_HOUSE: se hace con "Assign driver", no con un botón de estado) o un
 * external_delivery_id (DSP): sin ellos el backend respondería 400, así que no se ofrece.
 */
export function statusActions(assignment: Pick<DeliveryAssignment, 'delivery_status' | 'assignment_type' | 'deliveryDriver' | 'external_delivery_id'>): TransitionAction[] {
  return DELIVERY_STATUS_TRANSITIONS[assignment.delivery_status]
    .filter((to) => {
      if (to !== 'assigned') return true;
      if (assignment.assignment_type === 'in_house') return false;
      return !!assignment.external_delivery_id;
    })
    .map((to) => ({ to, label: ACTION_LABELS[to], destructive: isDestructiveStatus(to) }));
}

/** Cambiar de repartidor: sólo IN_HOUSE y sólo antes de la recogida. */
export const canReassignDriver = (assignment: Pick<DeliveryAssignment, 'delivery_status' | 'assignment_type'>): boolean =>
  assignment.assignment_type === 'in_house' &&
  (assignment.delivery_status === 'pending' || assignment.delivery_status === 'assigned');

// ================= Kanban =================

export interface KanbanColumn {
  id: string;
  label: string;
  statuses: DeliveryStatus[];
  color: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'pending', label: 'Pending', statuses: ['pending'], color: '#64748b' },
  { id: 'assigned', label: 'Assigned', statuses: ['assigned'], color: '#3b82f6' },
  { id: 'moving', label: 'Picked up / In transit', statuses: ['picked_up', 'in_transit'], color: '#8b5cf6' },
  { id: 'delivered', label: 'Delivered', statuses: ['delivered'], color: '#10b981' },
  { id: 'closed', label: 'Failed / Cancelled', statuses: ['failed', 'cancelled'], color: '#ef4444' },
];

export function groupByColumn(rows: DeliveryAssignment[]): Record<string, DeliveryAssignment[]> {
  const out: Record<string, DeliveryAssignment[]> = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c.id, []]));
  for (const row of rows) {
    const column = KANBAN_COLUMNS.find((c) => c.statuses.includes(row.delivery_status));
    if (column) out[column.id].push(row);
  }
  return out;
}

// ================= Formato =================

export const assignmentCode = (id: number): string => `#ASN-${id}`;
export const orderCode = (id: number): string => `#ORD-${id}`;

const VEHICLE_ICONS: Record<string, string> = {
  car: 'directions_car',
  motorcycle: 'two_wheeler',
  bicycle: 'pedal_bike',
  e_scooter: 'electric_scooter',
  on_foot: 'directions_walk',
};

/** Icono del vehículo; sin dato (el listado no trae vehicleType) cae en `two_wheeler`. */
export const vehicleIcon = (vehicleType: string | null | undefined): string =>
  (vehicleType && VEHICLE_ICONS[vehicleType]) || 'two_wheeler';

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export interface TimelineEntry {
  key: 'assigned' | 'picked_up' | 'delivered';
  label: string;
  at: string;
}

export function timelineEntries(a: Pick<DeliveryAssignment, 'assigned_at' | 'picked_up_at' | 'delivered_at'>): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  if (a.assigned_at) entries.push({ key: 'assigned', label: 'Assigned', at: a.assigned_at });
  if (a.picked_up_at) entries.push({ key: 'picked_up', label: 'Picked up', at: a.picked_up_at });
  if (a.delivered_at) entries.push({ key: 'delivered', label: 'Delivered', at: a.delivered_at });
  return entries;
}

export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${Number.isInteger(n) ? n : n.toFixed(1)} min`;
}

// ================= Filtros y query =================

export const EMPTY_ASSIGNMENT_FILTERS: AssignmentFilters = { statuses: [], types: [], search: '' };

export const hasActiveAssignmentFilters = (f: AssignmentFilters): boolean =>
  f.statuses.length > 0 || f.types.length > 0 || f.search.trim() !== '';

export function buildAssignmentQuery(f: AssignmentFilters, page = 1, limit = 100): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(Math.min(100, Math.max(1, limit))));
  if (f.statuses.length) params.set('delivery_status', f.statuses.join(','));
  if (f.types.length) params.set('assignment_type', f.types.join(','));
  const term = f.search.trim();
  if (term) params.set('search', term);
  return params.toString();
}

// ================= Validación DSP manual =================

export function isHttpsUrl(raw: string): boolean {
  const text = raw.trim();
  if (!/^https:\/\//i.test(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && !!url.hostname && url.hostname.includes('.');
  } catch {
    return false;
  }
}

export function normalizeAssignment(raw: DeliveryAssignment): DeliveryAssignment {
  const fee = raw.external_dsp_fee as unknown;
  return {
    ...raw,
    deliveryDriver: raw.deliveryDriver ?? null,
    external_dsp_fee: fee === null || fee === undefined || fee === '' ? null : Number(fee),
  };
}
